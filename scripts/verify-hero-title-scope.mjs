#!/usr/bin/env node
/**
 * verify-hero-title-scope.mjs — Hero-Überschrift muss in BEIDEN Motion-Zweigen gestylt sein.
 *
 * ## Wogegen das schützt (blitzsicht-ops#662)
 *
 * `Hero.astro` rendert die Überschrift bei `motion.textReveal` nicht selbst, sondern über
 * `<TextReveal as="h1">`. Das `<h1>` trägt dann DESSEN `data-astro-cid`, und ein scoped
 * `h1 { … }` im Hero greift ins Leere. Gemessen am 13.08.2026: 60 px im Aus-Zweig,
 * **24 px** im An-Zweig — und auf blitzsicht.com live genauso, dort ohne jede Regel, die
 * dem `<h1>` Größe oder Farbe gab.
 *
 * Der Fehler ist unsichtbar für alles, was nur EINEN Zweig baut. Deshalb prüft dieses
 * Skript die Fixture `examples/src/pages/hero-title-scope.astro`, die beide nebeneinander
 * rendert, und vergleicht die **berechneten** Stile im echten Browser — nicht den CSS-Text.
 * Ein Selektor kann korrekt aussehen und trotzdem nichts treffen.
 *
 * ## Aufruf
 *
 *   node scripts/verify-hero-title-scope.mjs [--dist <pfad>] [--no-build]
 *
 * Ohne `--no-build` wird `examples/` vorher gebaut (~1 s).
 *
 * Exit-Codes: 0 = beide Zweige gebunden · 1 = Abweichung · 2 = Aufruf-/Umgebungsfehler.
 *
 * ## Gegenbeweis
 *
 * Bei jeder Änderung an diesem Skript einmal gegen den unreparierten Hero laufen lassen
 * (`git show <tag vor dem Fix>:src/components/blocks/Hero.astro` einspielen, bauen) — dort
 * MUSS es rot werden, und zwar am textReveal-Zweig. Ein Check, der nie rot werden kann,
 * ist kein Nachweis.
 */

import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const EXAMPLES = join(ROOT, 'examples');
const PAGE = '/hero-title-scope/';

const args = process.argv.slice(2);
const noBuild = args.includes('--no-build');
const distArg = args.indexOf('--dist');
const DIST = distArg !== -1 ? resolve(args[distArg + 1]) : join(EXAMPLES, 'dist');

/** Playwright liegt nicht in cw-core. Fehlt es, ist das NICHT GEPRÜFT, nicht grün. */
function loadChromium() {
  for (const base of [
    '/Volumes/SiluriWork/NAS-Spiegel/MEDIEN/CODE/CLAUDE/cw-visual-tests/package.json',
    join(ROOT, 'package.json'),
  ]) {
    if (!existsSync(base)) continue;
    try {
      return createRequire(base)('@playwright/test').chromium;
    } catch {
      /* nächster Kandidat */
    }
  }
  console.error('✗ NICHT GEPRÜFT: @playwright/test nicht auflösbar (gesucht in cw-visual-tests und cw-core).');
  console.error('  Das ist kein grünes Ergebnis — Playwright bereitstellen oder den Check bewusst überspringen.');
  process.exit(2);
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.woff2': 'font/woff2',
};

function serve(root) {
  const srv = createServer((req, res) => {
    let p = join(root, decodeURIComponent(req.url.split('?')[0]));
    if (existsSync(p) && statSync(p).isDirectory()) p = join(p, 'index.html');
    if (!existsSync(p)) {
      res.writeHead(404);
      return res.end('not found');
    }
    res.writeHead(200, { 'content-type': MIME[extname(p)] ?? 'application/octet-stream' });
    res.end(readFileSync(p));
  });
  return new Promise((r) => srv.listen(0, () => r(srv)));
}

if (!noBuild) {
  try {
    execFileSync('pnpm', ['build'], { cwd: EXAMPLES, stdio: 'pipe' });
  } catch (e) {
    console.error('✗ examples-Build fehlgeschlagen:\n' + (e.stdout?.toString() ?? e.message));
    process.exit(2);
  }
}

if (!existsSync(join(DIST, 'hero-title-scope', 'index.html'))) {
  console.error(`✗ NICHT GEPRÜFT: Fixture fehlt unter ${DIST}/hero-title-scope/.`);
  console.error('  examples/src/pages/hero-title-scope.astro muss existieren und gebaut sein.');
  process.exit(2);
}

const chromium = loadChromium();
const srv = await serve(DIST);
const port = srv.address().port;
const browser = await chromium.launch();
let rows;
try {
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await page.goto(`http://localhost:${port}${PAGE}`, { waitUntil: 'load' });
  // TextReveal blendet erst beim Sichtbarwerden ein; gemessen wird font-size/color,
  // beides unabhängig von der Opazität — kurzes Warten reicht fürs Stylesheet.
  await page.waitForTimeout(800);
  rows = await page.evaluate(() =>
    [...document.querySelectorAll('.hero-content h1')].map((h) => {
      const s = getComputedStyle(h);
      return {
        headline: h.textContent.trim().slice(0, 30),
        textReveal: h.classList.contains('motion-text-reveal'),
        hasClass: h.classList.contains('hero-title'),
        fontSize: parseFloat(s.fontSize),
        color: s.color,
      };
    }),
  );
} finally {
  await browser.close();
  srv.close();
}

// Vorbedingung sichtbar machen: eine leere Menge beweist nichts.
const withReveal = rows.filter((r) => r.textReveal);
const without = rows.filter((r) => !r.textReveal);
if (withReveal.length === 0 || without.length === 0) {
  console.error(
    `✗ NICHT GEPRÜFT: Fixture deckt nicht beide Zweige ab ` +
      `(${without.length}× ohne textReveal, ${withReveal.length}× mit).`,
  );
  process.exit(2);
}

// Referenz ist der Aus-Zweig: er war nie kaputt. Der An-Zweig muss ihn treffen.
const soll = without[0];
const abweichung = rows.filter(
  (r) => !r.hasClass || r.fontSize !== soll.fontSize || r.color !== soll.color,
);

console.log(`Hero-Titel-Scope · ${rows.length} <h1> in .hero-content, Referenz ${soll.fontSize}px ${soll.color}`);
for (const r of rows) {
  const ok = r.hasClass && r.fontSize === soll.fontSize && r.color === soll.color;
  console.log(
    `  ${ok ? '✓' : '✗'} ${r.textReveal ? 'mit ' : 'ohne'} textReveal · ` +
      `${r.fontSize}px ${r.color} · .hero-title ${r.hasClass ? 'ja' : 'FEHLT'} · "${r.headline}"`,
  );
}

if (abweichung.length > 0) {
  console.error(
    `\n✗ ${abweichung.length} von ${rows.length} <h1> weichen ab. Erwartung: beide Zweige identisch.`,
  );
  console.error(
    '  Typische Ursache: die Regel steht als scoped Element-Selektor (`h1 { … }`) statt als\n' +
      '  `.hero-content :global(.hero-title)` — dann trifft sie das von TextReveal gerenderte\n' +
      '  <h1> nicht, weil es dessen data-astro-cid trägt. Siehe blitzsicht-ops#662.',
  );
  process.exit(1);
}

console.log(`\n✓ ${rows.length} von ${rows.length} <h1> gebunden — beide Motion-Zweige identisch gestylt.`);
process.exit(0);
