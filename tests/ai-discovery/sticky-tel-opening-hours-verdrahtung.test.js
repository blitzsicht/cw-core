// @ts-check
/**
 * Verdrahtung Sticky-Anruf- und Öffnungszeiten-Guard im echten `astro:build:done`-Hook.
 *
 * Lauf: `node --test tests/ai-discovery/sticky-tel-opening-hours-verdrahtung.test.js`
 *
 * Die Logik-Tests (sticky-tel-check.test.js, opening-hours-check.test.js) prüfen die
 * reinen Funktionen. Ob index.ts sie überhaupt aufruft, ob `stickyTel: false` und
 * `check…: false` sie abschalten und ob `strict…` erst bei `=== true` wirft, sieht man
 * nur am Hook selbst. Deshalb läuft er hier gegen ein Mini-dist mit zwei Seiten:
 * Startseite mit StickyMobileCTA auf /kontakt, `tel:` im Footer, Bakery-JSON-LD ohne
 * Öffnungszeiten.
 *
 * Geladen wird index.ts über denselben Vite-Server wie die Block-Tests (_render-astro.js).
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
after(async () => {
  for (const d of tempDirs) rmSync(d, { recursive: true, force: true });
  await schliessen();
});

const CSS = '<style>.sticky-mobile-cta[data-astro-cid-a]{position:fixed;bottom:0}</style>';
const LD =
  '<script type="application/ld+json">{"@context":"https://schema.org","@type":["LocalBusiness","Bakery"],' +
  '"@id":"https://t.de/#organization","name":"Testbäckerei","url":"https://t.de"}</script>';
/** @param {string} body */
const seite = (body) =>
  `<!DOCTYPE html><html lang="de"><head><meta charset="utf-8"><title>Test</title><meta name="description" content="Test">${CSS}${LD}</head>` +
  `<body><main>${body}</main><footer><a href="tel:+49941123">0941 123</a></footer></body></html>`;

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
 * @param {Record<string, unknown>} optionen
 * @returns {Promise<{ sticky: number, oeffnung: number, fehler: string | null }>}
 */
async function lauf(optionen) {
  const r = await renderer();
  const { default: aiDiscovery } = await r.laden('src/integrations/ai-discovery/index.ts');
  const dir = mkdtempSync(join(tmpdir(), 'cw-verdrahtung-'));
  tempDirs.push(dir);
  writeFileSync(join(dir, 'index.html'), seite('<a class="sticky-mobile-cta" href="/kontakt" data-astro-cid-a>Kontakt</a>'));
  mkdirSync(join(dir, 'impressum'));
  writeFileSync(join(dir, 'impressum', 'index.html'), seite('<p>Impressum</p>'));

  /** @type {string[]} */
  const warns = [];
  /** @type {any} */
  const logger = { info() {}, debug() {}, error: (/** @type {unknown} */ m) => warns.push(String(m)), warn: (/** @type {unknown} */ m) => warns.push(String(m)) };
  logger.fork = () => logger;
  const integ = aiDiscovery({ siteData: async () => SITE_DATA, ...optionen });
  let fehler = null;
  try {
    await integ.hooks['astro:build:done']({ dir: pathToFileURL(`${dir}/`), logger, pages: [], routes: [] });
  } catch (e) {
    fehler = /** @type {Error} */ (e).message;
  }
  return {
    sticky: warns.filter((w) => w.startsWith('Sticky-Anruf-Guard:')).length,
    oeffnung: warns.filter((w) => w.startsWith('Öffnungszeiten-Guard:')).length,
    fehler,
  };
}

test('Default: beide Guards melden, keiner bricht ab', async () => {
  assert.deepEqual(await lauf({}), { sticky: 1, oeffnung: 1, fehler: null });
});

test('stickyTel: false schaltet nur den Sticky-Guard ab', async () => {
  assert.deepEqual(await lauf({ stickyTel: false }), { sticky: 0, oeffnung: 1, fehler: null });
});

test('checkStickyTel: false + checkOpeningHours: false schalten beide ab', async () => {
  assert.deepEqual(await lauf({ checkStickyTel: false, checkOpeningHours: false }), { sticky: 0, oeffnung: 0, fehler: null });
});

test('strictStickyTel: true bricht ab', async () => {
  const e = await lauf({ strictStickyTel: true });
  assert.match(e.fehler ?? '', /strictStickyTel=true/);
});

test('strictOpeningHours: true bricht ab', async () => {
  const e = await lauf({ strictOpeningHours: true });
  assert.match(e.fehler ?? '', /strictOpeningHours=true: Build abgebrochen — 1 LocalBusiness-Knoten/);
});
