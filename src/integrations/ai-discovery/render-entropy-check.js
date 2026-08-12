// @ts-check
/**
 * @cw/core/integrations/ai-discovery/render-entropy-check
 *
 * Build-time-Guard gegen Zufall im Render-Pfad: warnt, wenn eine `.astro`-Datei
 * beim Bauen einen Zufallswert erzeugt und damit ins HTML schreibt.
 *
 * ## Auslöser (11.08.2026, blitzsicht-ops#650)
 *
 * Vier Motion-Komponenten vergaben ihre Element-ID mit
 * `Math.random().toString(36).slice(2, 9)` — nur damit ihr eigenes Inline-Script
 * sich per `getElementById` selbst wiederfand. Zwei Builds derselben Quelle
 * erzeugten dadurch unterschiedliches HTML: bei blitzsicht 13 von 52 Seiten,
 * 121 Diff-Zeilen. Folgen:
 *
 *   1. Jeder Deploy änderte die Bytes jeder Seite mit Motion. ETag und
 *      Last-Modified waren damit wertlos, jeder Client lud alles neu.
 *   2. Der Byte-Vergleich zweier Builds — das schärfste Werkzeug, um „Output
 *      unverändert" zu belegen — musste erst per `sed` normalisiert werden.
 *      Wer die Präfixe nicht kennt, liest 121 Zeilen Rauschen als Befund.
 *
 * Der Fehler lag drei Jahre im Code, ohne dass irgendetwas rot wurde.
 *
 * ## Was geprüft wird und was nicht
 *
 * Geprüft wird, was zur **Build-Zeit** läuft: Frontmatter und Template-Ausdrücke.
 * `<script>`- und `<style>`-Blöcke fallen vorher raus — `Math.random()` im
 * Browser ist völlig in Ordnung und hat mit der Reproduzierbarkeit des HTML
 * nichts zu tun. Für das Herausschneiden dient `stripInlineBlocks` aus
 * `motion-consent-check.js`, dieselbe Funktion, die der Motion-Guard benutzt.
 *
 * NICHT abgedeckt: ein Zufallswert in einem importierten `.ts`/`.js`-Modul, das
 * im Frontmatter aufgerufen wird. Der Doppel-Build-Nachweis
 * (`scripts/verify-reproducible-build.mjs`) fängt diesen Fall — dieser Guard
 * zeigt dafür schon in der Quelle auf die Zeile.
 *
 * Datumsfunktionen (`new Date()`, `Date.now()`) sind bewusst NICHT dabei: sie
 * stehen an sieben Stellen berechtigt im Paket (Copyright-Jahr, `datePosted`,
 * Sitemap-`lastmod`) und sind innerhalb eines Build-Paars stabil. Dass sich das
 * HTML dadurch täglich ändert, ist ein eigenes Thema.
 *
 * @typedef {{ file: string, line: number, pattern: string, snippet: string }} RenderEntropyIssue
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { stripInlineBlocks } from './motion-consent-check.js';

/**
 * Aufrufe, die pro Render einen anderen Wert liefern.
 *
 * Bewusst eine kurze, explizite Liste statt einer Heuristik über „random":
 * ein Prop namens `randomize` oder eine Variable `randomSeed` ist kein Befund.
 * Gesucht sind Aufrufe, keine Namen.
 */
export const ENTROPY_PATTERNS = Object.freeze([
  { name: 'Math.random()', re: /\bMath\s*\.\s*random\s*\(/g },
  { name: 'crypto.randomUUID()', re: /\bcrypto\s*\.\s*randomUUID\s*\(/g },
  { name: 'randomUUID()', re: /(?<!\.)\brandomUUID\s*\(/g },
  { name: 'randomBytes()', re: /(?<!\.)\brandomBytes\s*\(/g },
]);

/** Verzeichnisse, die beim Ablaufen übersprungen werden. */
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', '.astro', '.vercel']);

/**
 * Ersetzt jedes Zeichen ausserhalb von `<script>`/`<style>` NICHT — sondern
 * liefert die Quelle mit ausgeblendeten Blöcken **gleicher Länge**, damit
 * gefundene Positionen weiterhin auf die echte Zeile zeigen.
 *
 * `stripInlineBlocks` entfernt die Blöcke ersatzlos; für eine Zeilennummer wäre
 * das Ergebnis unbrauchbar. Deshalb hier: gleiche Regeln, aber jeder entfernte
 * Block wird durch ebenso viele Zeilenumbrüche und Leerzeichen ersetzt.
 *
 * @param {string} source
 * @returns {string}
 */
export function blankInlineBlocks(source) {
  let out = source;
  const stripped = stripInlineBlocks(source);
  if (stripped === source) return out;

  // Dieselben drei Muster wie in stripInlineBlocks, hier längentreu ersetzt.
  const patterns = [
    /<(?:style|script)\b[^>]*\/>/gi,
    /<style\b[^>]*>[\s\S]*?<\/style\s*>/gi,
    /<script\b[^>]*>[\s\S]*?<\/script\s*>/gi,
  ];
  for (const re of patterns) {
    out = out.replace(re, (block) => block.replace(/[^\n]/g, ' '));
  }
  return out;
}

/**
 * Blendet Kommentare längentreu aus — gleiche Regeln wie `stripComments`,
 * aber mit Leerzeichen statt ersatzlos.
 *
 * Ohne diesen Schritt meldet der Guard sich selbst: die Kopfkommentare der
 * reparierten Motion-Komponenten erklären den Bug und nennen `Math.random()`
 * dabei wörtlich. Ein Guard, der die Beschreibung des Fehlers für den Fehler
 * hält, ist beim ersten Lauf rot und wird abgeschaltet.
 *
 * @param {string} source
 * @returns {string}
 */
export function blankComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/g, (match, lead) => lead + ' '.repeat(match.length - lead.length));
}

/**
 * Findet Zufallsaufrufe im Build-Pfad einer `.astro`-Quelle.
 *
 * @param {string} source Roher Dateiinhalt.
 * @returns {Array<{ line: number, pattern: string, snippet: string }>}
 */
export function findRenderEntropy(source) {
  const scannable = blankComments(blankInlineBlocks(source));
  /** @type {Array<{ line: number, pattern: string, snippet: string }>} */
  const hits = [];

  for (const { name, re } of ENTROPY_PATTERNS) {
    re.lastIndex = 0;
    let match;
    while ((match = re.exec(scannable)) !== null) {
      const line = scannable.slice(0, match.index).split('\n').length;
      const start = scannable.lastIndexOf('\n', match.index) + 1;
      const end = scannable.indexOf('\n', match.index);
      const snippet = source
        .slice(start, end === -1 ? source.length : end)
        .trim()
        .slice(0, 120);
      hits.push({ line, pattern: name, snippet });
    }
  }

  return hits.sort((a, b) => a.line - b.line);
}

/**
 * Läuft Verzeichnisse ab und sammelt alle `.astro`-Dateien.
 *
 * @param {string} dir
 * @param {string[]} [acc]
 * @returns {string[]}
 */
function collectAstroFiles(dir, acc = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return acc;
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    let stat;
    try {
      stat = statSync(full);
    } catch {
      continue;
    }
    if (stat.isDirectory()) collectAstroFiles(full, acc);
    else if (entry.endsWith('.astro')) acc.push(full);
  }
  return acc;
}

/**
 * Prüft alle `.astro`-Dateien unter den gegebenen Verzeichnissen.
 *
 * `checked` ist Teil des Ergebnisses und nicht Beiwerk: eine 0 bei den Befunden
 * heisst nur dann „sauber", wenn `checked > 0` ist. Sonst wurde nichts gelesen.
 *
 * @param {string[]} dirs
 * @returns {{ issues: RenderEntropyIssue[], checked: number }}
 */
export function lintRenderEntropy(dirs) {
  /** @type {RenderEntropyIssue[]} */
  const issues = [];
  let checked = 0;

  for (const dir of dirs) {
    for (const file of collectAstroFiles(dir)) {
      let source;
      try {
        source = readFileSync(file, 'utf-8');
      } catch {
        continue;
      }
      checked += 1;
      for (const hit of findRenderEntropy(source)) {
        issues.push({ file: relative(dir, file), ...hit });
      }
    }
  }

  return { issues, checked };
}
