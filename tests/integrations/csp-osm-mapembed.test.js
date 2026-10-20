// @ts-check
/**
 * MapEmbed × CSP: „Karte laden“ darf nicht an frame-src scheitern.
 *
 * Lauf: `node --test tests/integrations/csp-osm-mapembed.test.js`
 *
 * ANLASS (Alte-Linde-Bau, 20.10.2026): brotzeithaeusl, levia-therapiezentrum und
 * arnold-lang setzen MapEmbed ein, ihre vercel.json kennt in frame-src nur tally, cal
 * und youtube-nocookie. Der Browser meldete „Framing 'https://www.openstreetmap.org/'
 * violates … frame-src“, der Build war grün. Zwei Lücken:
 *   (a) `gen-vercel-csp --service osm` trug tile.openstreetmap.org in img-src ein;
 *   (b) der Output-Check sah das erst nach dem Klick erzeugte iframe nicht.
 *
 * Jede Behauptung hat eine Gegenprobe, die beim Gegenteil anders ausfallen muss.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { extractResources } from '../../src/integrations/ai-discovery/html-resources.js';
import { auditHtml } from '../../src/integrations/ai-discovery/csp-audit.js';
import { buildCsp } from '../../src/integrations/ai-discovery/csp-build.js';

const ORIGIN = 'https://brotzeithaeusl-regenstauf.de';
const GEN = resolve(import.meta.dirname, '../../scripts/gen-vercel-csp.mjs');

/** frame-src von brotzeithaeusl (origin/main, 20.10.2026) — der echte Bug-Fall. */
const FRAME_OHNE_OSM = 'frame-src https://tally.so https://app.cal.eu https://www.youtube-nocookie.com';
const CSP_REST =
  `default-src 'self' ${ORIGIN}; script-src 'self' ${ORIGIN} 'unsafe-inline'; ` +
  `style-src 'self' ${ORIGIN} 'unsafe-inline'; style-src-elem 'self' ${ORIGIN} 'unsafe-inline'; ` +
  `img-src 'self' ${ORIGIN} data: https:; object-src 'none'; base-uri 'self'`;
const CSP_BUG = `${CSP_REST}; ${FRAME_OHNE_OSM}`;
const CSP_FIX = `${CSP_BUG} https://www.openstreetmap.org`;

/** Strukturgleich mit dem gerenderten MapEmbed (figure + data-embed-src, kein iframe). */
const MAPEMBED_HTML =
  '<section class="mapembed-section"><figure class="map-embed" ' +
  'data-embed-src="https://www.openstreetmap.org/export/embed.html?bbox=12.1%2C49.1%2C12.2%2C49.2&amp;layer=mapnik&amp;marker=49.15%2C12.15" ' +
  'style="--map-h:420px"><div class="map-placeholder"><button type="button" class="btn-accent map-load">Karte laden</button></div></figure></section>';

const blocked = (findings) => findings.filter((f) => !f.result.allowed);

test('Extraktor: data-embed-src zählt als frame-src (das iframe entsteht erst nach dem Klick)', () => {
  const res = extractResources(MAPEMBED_HTML, 'dist/kontakt/index.html');
  const r = res.find((x) => x.url?.includes('openstreetmap.org'));
  assert.ok(r, 'MapEmbed-Ziel nicht gefunden — der Output-Check wäre blind');
  assert.equal(r.directive, 'frame-src');
  assert.equal(r.where, 'dist/kontakt/index.html:1');
});

test('Echter Bug-Fall: frame-src ohne OSM + MapEmbed → blockiert (rot)', () => {
  const f = blocked(auditHtml(MAPEMBED_HTML, CSP_BUG, { siteOrigin: ORIGIN }));
  assert.equal(f.length, 1, `erwartet 1 blockierte Ressource, bekam ${f.length}`);
  assert.match(f[0].resource.url ?? '', /^https:\/\/www\.openstreetmap\.org\//);
});

test('Gegenprobe: dieselbe CSP mit www.openstreetmap.org in frame-src → grün', () => {
  assert.deepEqual(auditHtml(MAPEMBED_HTML, CSP_FIX, { siteOrigin: ORIGIN }), []);
});

test('Gegenprobe: Seite ohne MapEmbed löst bei fehlendem OSM nichts aus (kein Fehlalarm)', () => {
  const html = '<section><p>Kontakt</p><a href="https://www.openstreetmap.org/directions?to=49%2C12">Route planen</a></section>';
  assert.deepEqual(auditHtml(html, CSP_BUG, { siteOrigin: ORIGIN }), []);
});

test('Ohne frame-src greift default-src — auch das blockt das MapEmbed-iframe', () => {
  const f = blocked(auditHtml(MAPEMBED_HTML, CSP_REST, { siteOrigin: ORIGIN }));
  assert.equal(f.length, 1);
});

test('Alter Fehler-Host: tile.openstreetmap.org in img-src hilft dem iframe nicht', () => {
  const alt = `${CSP_REST.replace('https:;', 'https: https://tile.openstreetmap.org;')}; ${FRAME_OHNE_OSM}`;
  assert.equal(blocked(auditHtml(MAPEMBED_HTML, alt, { siteOrigin: ORIGIN })).length, 1);
});

test('buildCsp({ osm: true }) lässt MapEmbed durch, buildCsp() ohne osm nicht', () => {
  assert.deepEqual(auditHtml(MAPEMBED_HTML, buildCsp(ORIGIN, { osm: true, tally: true }), { siteOrigin: ORIGIN }), []);
  assert.equal(blocked(auditHtml(MAPEMBED_HTML, buildCsp(ORIGIN, { tally: true }), { siteOrigin: ORIGIN })).length, 1);
});

// --- gen-vercel-csp (Unterprozess gegen ein Wegwerf-Repo) -------------------------

/** @param {{ mapEmbed: boolean, frame?: string }} o */
function fixture({ mapEmbed, frame = FRAME_OHNE_OSM }) {
  const dir = mkdtempSync(join(tmpdir(), 'gen-csp-osm-'));
  writeFileSync(join(dir, 'astro.config.mjs'), `export default { site: '${ORIGIN}' };\n`);
  const csp = `${CSP_REST}; ${frame}`;
  writeFileSync(
    join(dir, 'vercel.json'),
    JSON.stringify({ headers: [{ source: '/(.*)', headers: [{ key: 'Content-Security-Policy', value: csp }] }] }, null, 2),
  );
  mkdirSync(join(dir, 'src/pages'), { recursive: true });
  writeFileSync(
    join(dir, 'src/pages/kontakt.astro'),
    mapEmbed
      ? "---\nimport MapEmbed from '@cw/core/components/blocks/MapEmbed.astro';\n---\n<MapEmbed lat={49.1} lng={12.1} />\n"
      : '---\n---\n<p>Kontakt</p>\n',
  );
  return dir;
}
/** @param {string} dir @param {string[]} [extra] */
const gen = (dir, extra = []) => spawnSync(process.execPath, [GEN, ...extra, dir], { encoding: 'utf-8' });
/** @param {string} dir */
const cspOf = (dir) => JSON.parse(readFileSync(join(dir, 'vercel.json'), 'utf-8')).headers[0].headers[0].value;
/** @param {string} csp @param {string} d */
const dir_ = (csp, d) => csp.match(new RegExp(`(?:^|;\\s*)${d} ([^;]*)`))?.[1] ?? '';

test('gen-vercel-csp: MapEmbed im Quelltext → www.openstreetmap.org landet in frame-src', () => {
  const dir = fixture({ mapEmbed: true });
  const r = gen(dir);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /MapEmbed .*Dienst 'osm'/);
  const csp = cspOf(dir);
  assert.ok(dir_(csp, 'frame-src').split(/\s+/).includes('https://www.openstreetmap.org'), csp);
  assert.ok(!dir_(csp, 'img-src').includes('openstreetmap'), 'nicht in img-src');
  // Das Ergebnis besteht den Output-Check, den der Bug-Fall nicht bestand.
  assert.deepEqual(auditHtml(MAPEMBED_HTML, csp, { siteOrigin: ORIGIN }), []);
});

test('gen-vercel-csp: ohne MapEmbed kommt kein OSM-Host dazu (Gegenprobe)', () => {
  const dir = fixture({ mapEmbed: false });
  const r = gen(dir);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(!cspOf(dir).includes('openstreetmap'), cspOf(dir));
});

test('gen-vercel-csp: --service osm schreibt frame-src, nicht img-src', () => {
  const dir = fixture({ mapEmbed: false });
  const r = gen(dir, ['--service', 'osm']);
  assert.equal(r.status, 0, r.stderr);
  const csp = cspOf(dir);
  assert.ok(dir_(csp, 'frame-src').includes('https://www.openstreetmap.org'), csp);
  assert.ok(!dir_(csp, 'img-src').includes('openstreetmap'), csp);
});

test('gen-vercel-csp: zweiter Lauf ändert nichts (idempotent, kein doppelter Host)', () => {
  const dir = fixture({ mapEmbed: true });
  assert.equal(gen(dir).status, 0);
  const erst = cspOf(dir);
  const r = gen(dir);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /keine Änderung/);
  assert.equal(cspOf(dir), erst);
  assert.equal(erst.split('https://www.openstreetmap.org').length - 1, 1);
});
