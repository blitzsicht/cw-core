#!/usr/bin/env node
/**
 * cw-core: Reproduzierbarkeits-Nachweis — gleiche Quelle, gleiche Bytes.
 *
 * Baut die Site zweimal in eigene Verzeichnisse und vergleicht sie Byte für
 * Byte. Findet damit jede Quelle von Nichtdeterminismus im Build, nicht nur die
 * eine, die gerade bekannt ist.
 *
 * ## Anlass (blitzsicht-ops#650)
 *
 * Vier Motion-Komponenten vergaben ihre Element-ID per `Math.random()`. Zwei
 * Builds derselben Quelle unterschieden sich bei blitzsicht auf 13 von 52
 * Seiten, 121 Zeilen. Der Fehler lag drei Jahre im Code:
 *
 *   - Kein Test konnte ihn sehen — er entsteht erst im Vergleich ZWEIER Builds.
 *   - Er kostete bei jedem Deploy den Cache jeder betroffenen Seite.
 *   - Er machte den Byte-Vergleich unbrauchbar, mit dem in #649 „Output
 *     unverändert" belegt wurde.
 *
 * Der Quell-Guard (`ai-discovery`, `render-entropy-check.js`) zeigt auf die
 * Zeile, sieht aber nur `.astro`-Dateien. Dieses Script sieht alles — auch
 * Zufall aus einem importierten Modul oder aus einer Abhängigkeit.
 *
 * ## Warum `astro build` und nicht `pnpm build`
 *
 * blitzsichts `prebuild` holt Live-Daten (Plausible-Zahlen, PSI-Messwerte,
 * Audit-Statistiken). Zweimal `pnpm build` wäre dort strukturell rot — und ein
 * Guard, der bei einem Kunden immer rot ist, wird abgeschaltet. Gemessen wird
 * deshalb genau das, worum es geht: Astros Rendering bei identischen Eingaben.
 * Der `prebuild` läuft vorher einmal (in CI der reguläre Build-Schritt).
 *
 * ## Aufruf
 *
 *   node node_modules/@cw/core/scripts/verify-reproducible-build.mjs
 *   node scripts/verify-reproducible-build.mjs --root examples
 *
 * Exit 0 = identisch. Exit 1 = Befund ODER nicht geprüft.
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Dateien, die Astro beim ERSTEN Build in den outDir schreibt und danach nicht
 * mehr — Reste des kalten Content-Layer-Caches.
 *
 * Gemessen am 11.08.2026 an `examples/`: Build 1 (kalt) legte `settings.json`
 * und `data-store.json` im outDir ab, Build 2 und 3 nicht mehr; deren
 * Dateimengen waren identisch. Sie als Befund zu melden hiesse, jeden ersten
 * Lauf auf einer frischen Maschine rot zu färben. Sie werden gemeldet, aber
 * nicht gewertet — verschwiegen wird nichts.
 */
const COLD_CACHE_ARTIFACTS = new Set(['settings.json', 'data-store.json']);

/**
 * Liest einen Verzeichnisbaum als Map von relativem Pfad auf SHA-256.
 *
 * @param {string} dir
 * @returns {Map<string, string>}
 */
export function hashTree(dir) {
  /** @type {Map<string, string>} */
  const out = new Map();

  /** @param {string} current */
  const walk = (current) => {
    for (const entry of readdirSync(current).sort()) {
      const full = join(current, entry);
      const stat = statSync(full);
      if (stat.isDirectory()) walk(full);
      else if (stat.isFile()) {
        out.set(
          relative(dir, full).split('\\').join('/'),
          createHash('sha256').update(readFileSync(full)).digest('hex'),
        );
      }
    }
  };

  if (existsSync(dir)) walk(dir);
  return out;
}

/**
 * Vergleicht zwei gehashte Bäume.
 *
 * Reine Logik, damit der interessante Teil ohne zwei echte Builds prüfbar ist.
 *
 * @param {Map<string, string>} a
 * @param {Map<string, string>} b
 * @returns {{
 *   findings: Array<{ path: string, kind: 'nur-in-a' | 'nur-in-b' | 'andere-bytes' }>,
 *   coldCacheOnly: string[],
 *   identical: number,
 * }}
 */
export function diffTrees(a, b) {
  /** @type {Array<{ path: string, kind: 'nur-in-a' | 'nur-in-b' | 'andere-bytes' }>} */
  const findings = [];
  /** @type {string[]} */
  const coldCacheOnly = [];
  let identical = 0;

  for (const [path, hash] of a) {
    if (!b.has(path)) {
      if (COLD_CACHE_ARTIFACTS.has(path)) coldCacheOnly.push(path);
      else findings.push({ path, kind: 'nur-in-a' });
    } else if (b.get(path) !== hash) {
      findings.push({ path, kind: 'andere-bytes' });
    } else {
      identical += 1;
    }
  }
  for (const path of b.keys()) {
    if (a.has(path)) continue;
    if (COLD_CACHE_ARTIFACTS.has(path)) coldCacheOnly.push(path);
    else findings.push({ path, kind: 'nur-in-b' });
  }

  findings.sort((x, y) => x.path.localeCompare(y.path));
  return { findings, coldCacheOnly, identical };
}

/**
 * Erste abweichende Zeile zweier Textdateien — damit ein Befund nicht nur einen
 * Dateinamen liefert, sondern eine Spur.
 *
 * @param {string} fileA
 * @param {string} fileB
 * @returns {string | null}
 */
export function firstTextDifference(fileA, fileB) {
  let a;
  let b;
  try {
    a = readFileSync(fileA);
    b = readFileSync(fileB);
  } catch {
    return null;
  }
  // Binär? Dann sagt eine Zeilenansicht nichts.
  if (a.includes(0) || b.includes(0)) return null;

  const linesA = a.toString('utf8').split('\n');
  const linesB = b.toString('utf8').split('\n');
  for (let i = 0; i < Math.max(linesA.length, linesB.length); i++) {
    if (linesA[i] === linesB[i]) continue;
    const at = firstDifferingColumn(linesA[i] ?? '', linesB[i] ?? '');
    const window = 70;
    const from = Math.max(0, at - 20);
    return (
      `Zeile ${i + 1}, Spalte ${at + 1}\n` +
      `      a: …${(linesA[i] ?? '').slice(from, from + window)}…\n` +
      `      b: …${(linesB[i] ?? '').slice(from, from + window)}…`
    );
  }
  return null;
}

/**
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
export function firstDifferingColumn(a, b) {
  const max = Math.min(a.length, b.length);
  for (let i = 0; i < max; i++) if (a[i] !== b[i]) return i;
  return max;
}

/**
 * @param {string[]} argv
 * @returns {{ root: string }}
 */
export function parseArgs(argv) {
  let root = process.cwd();
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--root' && argv[i + 1]) root = resolve(argv[++i]);
  }
  return { root };
}

async function main() {
  const { root } = parseArgs(process.argv.slice(2));
  const astroBin = join(root, 'node_modules', '.bin', 'astro');

  if (!existsSync(astroBin)) {
    // Dritter Zustand. Nicht geprüft ist nicht grün.
    console.error(
      `Reproduzierbarkeit: NICHT GEPRÜFT — ${relative(process.cwd(), astroBin) || astroBin} ` +
        `fehlt. Das ist kein grünes Ergebnis.`,
    );
    return 1;
  }

  const cacheRoot = join(root, 'node_modules', '.cache', 'cw-core-repro');
  const dirA = join(cacheRoot, 'a');
  const dirB = join(cacheRoot, 'b');
  mkdirSync(cacheRoot, { recursive: true });

  for (const [label, outDir] of [
    ['1/2', dirA],
    ['2/2', dirB],
  ]) {
    process.stdout.write(`Reproduzierbarkeit: Build ${label} …\n`);
    try {
      execFileSync(astroBin, ['build', '--outDir', outDir], {
        cwd: root,
        stdio: 'pipe',
        encoding: 'utf8',
      });
    } catch (err) {
      console.error(`Reproduzierbarkeit: NICHT GEPRÜFT — Build ${label} ist fehlgeschlagen.`);
      console.error(String(err?.stdout ?? '').split('\n').slice(-25).join('\n'));
      console.error(String(err?.stderr ?? '').split('\n').slice(-10).join('\n'));
      return 1;
    }
  }

  const { findings, coldCacheOnly, identical } = diffTrees(hashTree(dirA), hashTree(dirB));

  for (const path of new Set(coldCacheOnly)) {
    console.log(`Reproduzierbarkeit: Hinweis — ${path} nur in einem Lauf (Astro-Cache, nicht gewertet).`);
  }

  if (identical === 0 && findings.length === 0) {
    console.error(
      `Reproduzierbarkeit: NICHT GEPRÜFT — beide Läufe haben 0 Dateien erzeugt. ` +
        `Das ist kein grünes Ergebnis.`,
    );
    return 1;
  }

  if (findings.length === 0) {
    console.log(`Reproduzierbarkeit: ✓ ${identical} Dateien byte-identisch über zwei Builds.`);
    rmSync(assertOwnCacheDir(cacheRoot), { recursive: true, force: true });
    return 0;
  }

  console.error(
    `Reproduzierbarkeit: ${findings.length} von ${findings.length + identical} Dateien ` +
      `unterscheiden sich zwischen zwei Builds derselben Quelle:`,
  );
  for (const f of findings.slice(0, 20)) {
    console.error(`  [${f.kind}] ${f.path}`);
    if (f.kind === 'andere-bytes') {
      const detail = firstTextDifference(join(dirA, f.path), join(dirB, f.path));
      if (detail) console.error(`      ${detail}`);
    }
  }
  if (findings.length > 20) console.error(`  … und ${findings.length - 20} weitere.`);
  console.error(
    `\nHäufigste Ursache: ein Zufallswert im Build-Pfad (Math.random, crypto.randomUUID) — ` +
      `der ai-discovery-Guard "Render-Entropy" zeigt auf die Zeile, sieht aber nur .astro-Dateien. ` +
      `Zweithäufigste: ein Datum. Lief dieser Lauf über Mitternacht, sind Copyright-Jahr, ` +
      `datePosted und Sitemap-lastmod die harmlose Erklärung — dann noch einmal laufen lassen.` +
      `\nDie beiden Bäume liegen zum Nachsehen unter ${relative(root, cacheRoot)}/{a,b}.`,
  );
  return 1;
}

/**
 * Lässt nur den selbst angelegten Cache-Pfad zum Löschen durch.
 *
 * `rmSync(..., { recursive: true, force: true })` auf eine Variable ist genau
 * die Zeile, die man nicht ungeprüft schreibt: ein leerer oder falsch
 * zusammengesetzter Pfad räumt sonst etwas anderes ab.
 *
 * @param {string} dir
 * @returns {string}
 */
export function assertOwnCacheDir(dir) {
  const ok = Boolean(dir) && dir.includes(join('node_modules', '.cache', 'cw-core-repro'));
  if (!ok) throw new Error(`Weigere mich, das zu löschen: ${dir}`);
  return dir;
}

/**
 * Läuft dieses Modul als Programm — oder wurde es nur importiert?
 *
 * Der Vergleich muss über `realpathSync` laufen. Unter pnpm ist
 * `node_modules/@cw/core` ein Symlink nach `node_modules/.pnpm/…`:
 * `import.meta.url` trägt den aufgelösten Pfad, `process.argv[1]` den
 * Symlink-Pfad. Ohne Auflösung liefe `main()` beim CI-Aufruf
 * `node node_modules/@cw/core/scripts/…` nie und der Guard meldete still
 * Exit 0 — ein Check, der nie rot werden kann. Belegt an
 * `verify-touchpoints.mjs`, dessen Test genau das abdeckt.
 */
function isDirectRun() {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(entry);
  } catch {
    return false;
  }
}

if (isDirectRun()) {
  process.exit(await main());
}
