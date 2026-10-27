// @ts-check
/**
 * Verdrahtung des Schrittnummer-Kontrast-Guards im echten `astro:build:done`-Hook.
 *
 * Lauf: `node --test tests/ai-discovery/schrittnummer-kontrast-verdrahtung.test.js`
 *
 * Die Logik-Proben stehen in `src/integrations/ai-discovery/schrittnummer-contrast-check.test.mjs`.
 * Ob `index.ts` die Funktion überhaupt aufruft, ob sie die Tokens DIESES Repos liest
 * (die CSS-Suche läuft relativ zum Arbeitsverzeichnis), ob der Schalter sie abschaltet
 * und ob `strict…` erst bei `=== true` wirft, sieht man nur am Hook selbst.
 *
 * Die Tokens im Testprojekt sind die echten von weinkontor-sinzing (tokens.css,
 * gelesen 27.10.2026 an origin) — inklusive `--color-accent-text: #ffffff`, dem Fall,
 * den die Handliste des cw-core-Tests nicht kannte.
 */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { renderer, schliessen } from '../blocks/_render-astro.js';

/** @type {string[]} */
const tempDirs = [];
const start = process.cwd();
after(async () => {
  process.chdir(start);
  for (const d of tempDirs) rmSync(d, { recursive: true, force: true });
  await schliessen();
});

const ZIFFER = '<div class="steps"><div class="step" data-step-nr="2"><h3>Ankommen</h3></div></div>';
const OHNE_ZIFFER = '<p>Diese Seite zeigt keine Schritte.</p>';

/** @param {string} body */
const seite = (body) =>
  '<!DOCTYPE html><html lang="de"><head><meta charset="utf-8"><title>Test</title>' +
  '<meta name="description" content="Test"></head>' +
  `<body><main>${body}</main><footer><a href="tel:+49941123">0941 123</a></footer></body></html>`;

const WEINKONTOR = `@theme {
  --color-primary: #242424;
  --color-accent: #BE0C1D;
  --color-accent-text: #ffffff;
  --color-surface: #f8f8f6;
}`;
const REPARIERT = WEINKONTOR.replace('#ffffff', '#9A0A17');

const SITE_DATA = {
  name: 'Test',
  url: 'https://t.de',
  description: 'Test',
  tagline: 'T',
  leistungen: [],
  faqs: [],
  legal: { owner: 'Max Test', form: 'Einzelunternehmen', street: 'Str. 1', zip: '93047', city: 'Regensburg', country: 'DE', email: 'a@t.de', phone: '+49941123' },
  contact: { email: 'a@t.de', phone: '+49941123' },
  seo: { knowsAbout: [] },
  nav: { main: [] },
};

/**
 * @param {{ css?: string | null, body?: string, optionen?: Record<string, unknown> }} fall
 * @returns {Promise<{ warnungen: string[], infos: string[], fehler: string | null }>}
 */
async function lauf({ css = WEINKONTOR, body = ZIFFER, optionen = {} } = {}) {
  const r = await renderer();
  const { default: aiDiscovery } = await r.laden('src/integrations/ai-discovery/index.ts');

  // Eigenes Projektverzeichnis: die CSS-Suche des Guards geht auf `src/styles`
  // relativ zum Arbeitsverzeichnis — genau so läuft sie beim Kunden.
  const projekt = mkdtempSync(join(tmpdir(), 'cw-nr-verdrahtung-'));
  tempDirs.push(projekt);
  if (css !== null) {
    mkdirSync(join(projekt, 'src', 'styles'), { recursive: true });
    writeFileSync(join(projekt, 'src', 'styles', 'tokens.css'), css);
  }
  const dist = join(projekt, 'dist');
  mkdirSync(dist, { recursive: true });
  writeFileSync(join(dist, 'index.html'), seite(body));

  /** @type {string[]} */
  const warnungen = [];
  /** @type {string[]} */
  const infos = [];
  /** @type {any} */
  const logger = {
    debug() {},
    info: (/** @type {unknown} */ m) => infos.push(String(m)),
    warn: (/** @type {unknown} */ m) => warnungen.push(String(m)),
    error: (/** @type {unknown} */ m) => warnungen.push(String(m)),
  };
  logger.fork = () => logger;

  const integ = aiDiscovery({ siteData: async () => SITE_DATA, ...optionen });
  let fehler = null;
  process.chdir(projekt);
  try {
    await integ.hooks['astro:build:done']({ dir: pathToFileURL(`${dist}/`), logger, pages: [], routes: [] });
  } catch (e) {
    fehler = /** @type {Error} */ (e).message;
  } finally {
    process.chdir(start);
  }
  return {
    warnungen: warnungen.filter((w) => w.startsWith('Schrittnummer-Kontrast:')),
    infos: infos.filter((i) => i.startsWith('Schrittnummer-Kontrast:')),
    fehler,
  };
}

test('Default: weißes --color-accent-text wird gemeldet, Build läuft weiter', async () => {
  const e = await lauf();
  assert.equal(e.warnungen.length, 1, e.warnungen.join(' | '));
  assert.match(e.warnungen[0], /erreicht nur 1\.00:1/);
  assert.equal(e.fehler, null, 'Soft-Warn: der Build bricht nicht ab');
});

test('GEGENPROBE: mit abgedunkeltem Token meldet derselbe Lauf nichts', async () => {
  const e = await lauf({ css: REPARIERT });
  assert.deepEqual(e.warnungen, []);
  assert.equal(e.infos.length, 1);
  assert.match(e.infos[0], /✓ .* \(1 CSS-Datei\(en\) gerechnet\)/);
});

test('checkSchrittnummerKontrast: false schaltet den Guard ab', async () => {
  const e = await lauf({ optionen: { checkSchrittnummerKontrast: false } });
  assert.deepEqual(e.warnungen, []);
  assert.deepEqual(e.infos, [], 'auch keine Info — der Guard läuft gar nicht');
});

test('strictSchrittnummerKontrast: true bricht den Build ab', async () => {
  const e = await lauf({ optionen: { strictSchrittnummerKontrast: true } });
  assert.match(e.fehler ?? '', /strictSchrittnummerKontrast=true/);
});

test('ohne Ziffer im HTML: übersprungen, kein Fehlalarm', async () => {
  const e = await lauf({ body: OHNE_ZIFFER });
  assert.deepEqual(e.warnungen, []);
  assert.match(e.infos[0] ?? '', /übersprungen/);
});

test('Weg-Variante zählt auch: class="weg-nr" löst die Prüfung aus', async () => {
  const e = await lauf({ body: '<ol class="weg"><li><span class="weg-nr" aria-hidden="true">2</span></li></ol>' });
  assert.equal(e.warnungen.length, 1, e.warnungen.join(' | '));
});

test('dritter Zustand: Ziffer da, keine CSS → NICHT GEPRÜFT statt Häkchen', async () => {
  const e = await lauf({ css: null });
  assert.equal(e.warnungen.length, 1, e.warnungen.join(' | '));
  assert.match(e.warnungen[0], /NICHT GEPRÜFT/);
  assert.deepEqual(e.infos, []);
});
