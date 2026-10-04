#!/usr/bin/env node
// @ts-check
/**
 * kennzeichnung-live — trägt jede ausgelieferte Seite die Kennzeichnung, die sie muss?
 *
 * Art. 50 Abs. 4 UAbs. 1 AI Act verlangt die Offenlegung dort, wo der Betrachter das
 * Bild sieht. Ob das erfüllt ist, kann nur an der **ausgelieferten** Seite gemessen
 * werden — nicht am Repo und nicht an der Deklaration.
 *
 * ANLASS (03.09.2026). Die Aussage „Kunde X hat die Kennzeichnung" beruhte bis heute
 * darauf, dass irgendwo im Repo `AiLabel` importiert wird. Das belegt nichts: die
 * Pflicht gilt je Fundstelle. Bei `customer-donau-profi` waren sechs Städtebilder neun
 * Tage lang ungekennzeichnet online, während im lokalen Klon eine fertige, nie
 * gepushte Reparatur lag.
 *
 * Zwei Festlegungen, die aus diesem Vorfall folgen:
 *
 *   1. **Regeln gegen `origin`, nie aus dem lokalen Klon.** Die Klone weichen ab — für
 *      preshot meldet der lokale Stand „keine Datei", `origin` zwei pflichtige Bilder.
 *      Aus derselben Verwechslung entstand der Fehlbefund in blitzsicht-ops#769.
 *   2. **Positivkontrolle je Seite.** Eine Vercel-Checkpoint- oder SSO-Seite hat weder
 *      Bilder noch Labels und sähe damit perfekt aus. Ohne ein Merkmal der echten Seite
 *      ist eine Zeile „nicht geprüft" — nie grün.
 *
 * Die Prüflogik selbst steht in `src/integrations/ai-discovery/ai-label-check.js` und
 * wird vom Build-Guard genauso benutzt. Zwei Fassungen desselben Vergleichs würden
 * driften, und dann belegte die Messung etwas anderes als der Wächter prüft.
 *
 * Lauf:
 *   node scripts/kennzeichnung-live.mjs                     # alle Sites der Registry
 *   node scripts/kennzeichnung-live.mjs --site donau-profi  # eine
 *   node scripts/kennzeichnung-live.mjs --out bericht.json
 *   node scripts/kennzeichnung-live.mjs --max-seiten 20     # Kurzlauf zum Ausprobieren
 *   node scripts/kennzeichnung-live.mjs --site haarwerk-neutraubling \
 *        --url https://customer-haarwerk-neutraubling.vercel.app   # Vorschau statt production_url
 *
 * `--url` (nur mit `--site`): Sitemap und Seiten kommen von dort; die <loc> der Sitemap
 * (spätere Kundendomain) werden auf diesen Origin umgeschrieben. Die Positivkontrolle
 * bleibt beim Host aus production_url — canonical/og:url der Vorschau zeigen dorthin.
 * Vor dem Go-Live ist production_url die Altseite des Kunden; ohne `--url` misst man sie
 * (Review cw-site #53). Deployment Protection: VERCEL_PROTECTION_BYPASS=<secret>.
 *
 * Exit: 0 alles gemessen, nichts fehlt · 1 mindestens ein Label fehlt ·
 *       2 nichts fehlt, aber etwas blieb ungeprüft (leere Sitemap, Checkpoint, --site
 *       nicht gefunden). Bis 03.10.2026 endete der Lauf immer mit 0 (cw-core #132).
 *
 * Keine Rechtsberatung. Rechtstext: cw-recht → texte/eu/ai-act/ai-act.md.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { registryPfad } from './registry-pfad.mjs';
import {
  pruefeSeiteAufKennzeichnung,
  leseHerkunftRegeln,
  unbekannteLabelFormen,
} from '../src/integrations/ai-discovery/ai-label-check.js';
import { seitenAusSitemap, zeilenZustand, exitCode } from './lib/kennzeichnung-urteil.mjs';

const argWert = (/** @type {string} */ n, /** @type {string|null} */ f = null) => {
  const i = process.argv.indexOf(n);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : f;
};

const NUR_SITE = argWert('--site');
const AUSGABE = argWert('--out');
const MAX_SEITEN = Number(argWert('--max-seiten', '0')) || Infinity;
const BASIS_URL = argWert('--url');
if (BASIS_URL && !NUR_SITE) {
  console.error('kennzeichnung-live: --url nur zusammen mit --site.');
  process.exit(64);
}
const BYPASS = process.env.VERCEL_PROTECTION_BYPASS;
const PARALLEL = 4;

/**
 * Regeln aus dem Remote-Stand lesen. Bewusst `git show origin/…` statt
 * `readFileSync(repo_path/src/…)`: der Arbeitsbaum kann ungepushte Commits, fremde
 * Änderungen oder einen veralteten Stand tragen.
 * @param {string} repo
 * @returns {{ regeln: import('../src/integrations/ai-discovery/ai-label-check.js').Regel[], problem: string|null }}
 */
function regelnVomRemote(repo) {
  const git = (/** @type {string[]} */ args) =>
    execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  try {
    git(['fetch', '--quiet', 'origin']);
    // Den Default-Branch des Remotes nehmen, nicht „main" raten.
    let ref = 'origin/HEAD';
    try {
      ref = git(['symbolic-ref', '--short', 'refs/remotes/origin/HEAD']);
    } catch {
      ref = 'origin/main';
    }
    const quelltext = git(['show', `${ref}:src/data/bild-herkunft.ts`]);
    return leseHerkunftRegeln(quelltext);
  } catch {
    return { regeln: [], problem: null }; // keine Datei am Remote — eigener Zustand, kein Fehler
  }
}

/**
 * Ist das wirklich die Kundenseite? Gesucht wird ein Merkmal, das die echte Seite hat
 * und eine Checkpoint-/Login-Seite nicht: die eigene Domain in `canonical` oder
 * `og:url`. Ein Grep auf Fehlertexte wäre ein Störungs-Detektor — der trifft neue
 * Zwischenseiten nicht, und dann sähe der Ausfall wie ein grünes Ergebnis aus.
 * @param {string} html
 * @param {string} host
 * @returns {boolean}
 */
function istEchteSeite(html, host) {
  const re = new RegExp(`(rel="canonical"[^>]*|og:url"[^>]*content=")[^"]*${host.replace(/\./g, '\\.')}`, 'i');
  return re.test(html);
}

/** @param {string} url @returns {Promise<string|null>} */
async function hole(url) {
  try {
    const r = await fetch(url, {
      redirect: 'follow',
      headers: {
        'user-agent': 'cw-core/kennzeichnung-live (+https://blitzsicht.com)',
        ...(BYPASS ? { 'x-vercel-protection-bypass': BYPASS } : {}),
      },
      signal: AbortSignal.timeout(25000),
    });
    if (!r.ok) return null;
    return await r.text();
  } catch {
    return null;
  }
}

/** @template T @param {T[]} xs @param {number} n @param {(x: T) => Promise<void>} f */
async function parallel(xs, n, f) {
  const warteschlange = [...xs];
  await Promise.all(
    Array.from({ length: n }, async () => {
      for (;;) {
        const x = warteschlange.shift();
        if (x === undefined) return;
        await f(x);
      }
    }),
  );
}

const kunden = JSON.parse(readFileSync(registryPfad(), 'utf8')).customers;
/** @type {any[]} */
const ergebnis = [];

for (const k of kunden) {
  if (NUR_SITE && k.slug !== NUR_SITE) continue;
  if (!k.production_url || !k.repo_path || !existsSync(k.repo_path)) continue;

  const { regeln, problem } = regelnVomRemote(k.repo_path);
  const pflichtRegeln = regeln.filter((r) => r.deepfake === 'ja').length;
  if (regeln.length === 0 && !problem) {
    ergebnis.push({ slug: k.slug, lifecycle: k.lifecycle, url: k.production_url, ohneDeklaration: true });
    console.log(`${k.slug.padEnd(24)} keine bild-herkunft.ts am Remote`);
    continue;
  }
  if (problem) {
    ergebnis.push({ slug: k.slug, url: k.production_url, parserProblem: problem });
    console.log(`${k.slug.padEnd(24)} PARSERFEHLER: ${problem}`);
    continue;
  }

  const host = new URL(k.production_url).host;
  const quelle = (BASIS_URL ?? k.production_url).replace(/\/$/, '');
  const sitemap = (await hole(`${quelle}/sitemap-0.xml`)) ?? '';
  const seiten = seitenAusSitemap(sitemap, { basis: BASIS_URL, max: MAX_SEITEN });

  const zahl = { seiten: seiten.length, geprueft: 0, nichtGeprueft: 0, pflichtig: 0, fehlend: 0, ungeklaert: 0 };
  /** @type {Set<string>} */
  const unbekannteFormen = new Set();
  /** @type {{ seite: string, bild: string }[]} */
  const luecken = [];
  /** @type {{ seite: string, bilder: string[] }[]} */
  const unklar = [];

  await parallel(seiten, PARALLEL, async (url) => {
    const html = await hole(url);
    if (!html || !istEchteSeite(html, host)) {
      zahl.nichtGeprueft++;
      return;
    }
    zahl.geprueft++;
    for (const f of unbekannteLabelFormen(html)) unbekannteFormen.add(f);
    const b = pruefeSeiteAufKennzeichnung(html, regeln, { eigenerHost: host });
    zahl.pflichtig += b.pflichtig.length;
    zahl.fehlend += b.fehlend;
    zahl.ungeklaert += b.ungeklaert.length;
    const pfad = new URL(url).pathname;
    for (const bild of b.pflichtig.slice(b.pflichtig.length - b.fehlend)) luecken.push({ seite: pfad, bild });
    if (b.ungeklaert.length) unklar.push({ seite: pfad, bilder: b.ungeklaert });
  });

  const zustand = zeilenZustand({ regeln: regeln.length, ...zahl });
  ergebnis.push({ slug: k.slug, lifecycle: k.lifecycle, url: quelle, zustand, pflichtRegeln, ...zahl, luecken, unklar, unbekannteFormen: [...unbekannteFormen].sort() });
  console.log(
    `${k.slug.padEnd(24)} Seiten ${String(zahl.geprueft).padStart(3)}/${String(zahl.seiten).padEnd(3)}` +
      `  pflichtig ${String(zahl.pflichtig).padStart(3)}  FEHLEND ${String(zahl.fehlend).padStart(3)}` +
      `  ungeklärt ${String(zahl.ungeklaert).padStart(4)}` +
      (zahl.nichtGeprueft ? `  nicht geprüft ${zahl.nichtGeprueft}` : '') +
      // Eine unbekannte Form macht die Zahlen der Zeile fragwürdig — sie gehört daneben,
      // nicht in eine Fußnote.
      (unbekannteFormen.size ? `  UNBEKANNTE FORM: ${[...unbekannteFormen].join(', ')}` : '') +
      (zustand === 'nicht-geprueft' && zahl.seiten === 0 ? `  NICHT GEPRÜFT: Sitemap leer oder nicht abrufbar (${quelle})` : '') +
      (zustand === 'nicht-geprueft' && zahl.seiten > 0 ? '  NICHT GEPRÜFT' : ''),
  );
}

const bericht = { stand: new Date().toISOString(), sites: ergebnis };
if (AUSGABE) {
  writeFileSync(AUSGABE, JSON.stringify(bericht, null, 2), 'utf8');
  console.log(`\n→ ${AUSGABE}`);
}

const fehlendGesamt = ergebnis.reduce((s, e) => s + (e.fehlend || 0), 0);
const nichtGeprueft = ergebnis.reduce((s, e) => s + (e.nichtGeprueft || 0), 0);
const zustaende = ergebnis.map((e) => e.zustand ?? (e.parserProblem ? 'nicht-geprueft' : 'ohne-deklaration'));
if (NUR_SITE && ergebnis.length === 0) {
  console.log(`${NUR_SITE.padEnd(24)} NICHT GEPRÜFT: nicht in der Registry oder ohne production_url/repo_path`);
  zustaende.push('nicht-geprueft');
}
const ungeprueftZeilen = zustaende.filter((z) => z === 'nicht-geprueft').length;
console.log(`\nFEHLENDE KENNZEICHNUNGEN: ${fehlendGesamt}   nicht geprüfte Seiten: ${nichtGeprueft}   nicht geprüfte Sites: ${ungeprueftZeilen}`);
process.exit(exitCode(zustaende));
