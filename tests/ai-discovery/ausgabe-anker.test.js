// @ts-check
/**
 * Ausgabe-Anker: kommt `--color-accent-text` im ausgelieferten CSS an?
 *
 * Lauf: `node --test tests/ai-discovery/ausgabe-anker.test.js`
 *
 * WARUM ES DIESE DATEI GIBT. Die beiden Kontrast-Guards (Knopf, Schrittnummer)
 * lesen `src/styles` — den Quelltext. Der Browser liest das ausgegebene `:root`.
 * Tailwind v4 gibt eine `@theme`-Variable nur aus, wenn sie in der CSS vorkommt,
 * die Tailwind selbst verarbeitet; Astro-Komponenten-`<style>`-Blöcke zählen dort
 * nicht mit. Dreimal gemessen, dreimal dieselbe Ursache:
 *
 *   Alte Linde, 20.10.2026 — Links in Beige auf Weiß, 1,56:1 (ops#976)
 *   spedition-steller, 23.10.2026 — 1,64:1, sechs `serious`-Verstöße (ops#989)
 *   weinkontor, 28.10.2026 — der Schrittnummer-Guard meldete 1,00:1 für eine
 *     Ziffer, die der Browser weinrot malte: Fehlalarm, falscher Referent (ops#993)
 *
 * `tokens-base.css` verankert den Token seitdem selbst. Die Prüfung hier ist der
 * Totmannschalter: verschwindet der Anker, muss sie melden.
 */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
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

/** CSS, das den Token LIEST — so wie ContentPage und ImpressumBlock es tun. */
const LIEST = '.content-page a { color: var(--color-accent-text, var(--color-accent)); }';
/** Dieselbe CSS, plus die Definition, die der Anker erzwingt. */
const LIEST_UND_DEFINIERT = `:root{--color-accent-text:#6e4011}\n${LIEST}`;
/** CSS ohne jeden Bezug — hier gibt es nichts zu prüfen. */
const OHNE_BEZUG = '.content-page a { color: var(--color-text); }';

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
 * @param {{ css?: string, alsDatei?: boolean, optionen?: Record<string, unknown> }} fall
 * @returns {Promise<{ warnungen: string[], infos: string[], fehler: string | null }>}
 */
async function lauf({ css = LIEST_UND_DEFINIERT, alsDatei = false, optionen = {} } = {}) {
  const r = await renderer();
  const { default: aiDiscovery } = await r.laden('src/integrations/ai-discovery/index.ts');

  const projekt = mkdtempSync(join(tmpdir(), 'cw-ausgabe-anker-'));
  tempDirs.push(projekt);
  const dist = join(projekt, 'dist');
  mkdirSync(dist, { recursive: true });

  // Zwei Wege, wie CSS beim Kunden ankommt: inline im HTML
  // (`inlineStylesheets: 'always'`, der Normalfall) oder als eigene Datei.
  const stil = alsDatei ? '' : `<style>${css}</style>`;
  if (alsDatei) {
    mkdirSync(join(dist, '_astro'), { recursive: true });
    writeFileSync(join(dist, '_astro', 'seite.css'), css);
  }
  writeFileSync(
    join(dist, 'index.html'),
    '<!DOCTYPE html><html lang="de"><head><meta charset="utf-8"><title>Test</title>' +
      `<meta name="description" content="Test">${stil}</head>` +
      '<body><main><p>Inhalt</p></main><footer><a href="tel:+49941123">0941 123</a></footer></body></html>',
  );

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
  const nur = (/** @type {string[]} */ xs) => xs.filter((x) => x.startsWith('Ausgabe-Anker:'));
  return { warnungen: nur(warnungen), infos: nur(infos), fehler };
}

test('gelesen UND definiert: still', async () => {
  const { warnungen, infos } = await lauf({ css: LIEST_UND_DEFINIERT });
  assert.equal(warnungen.length, 0);
  assert.match(infos.join(' '), /✓/);
});

test('GEGENPROBE: gelesen, aber nicht definiert — meldet', async () => {
  const { warnungen } = await lauf({ css: LIEST });
  assert.equal(warnungen.length, 1, 'genau eine Meldung erwartet');
  assert.match(warnungen[0], /nirgends definiert/);
  assert.match(warnungen[0], /tokens-base\.css/, 'der Hinweis muss sagen, wo der Anker steht');
});

test('dritter Zustand: niemand liest den Token → übersprungen, kein Häkchen', async () => {
  const { warnungen, infos } = await lauf({ css: OHNE_BEZUG });
  assert.equal(warnungen.length, 0);
  assert.match(infos.join(' '), /übersprungen/);
  assert.doesNotMatch(infos.join(' '), /✓/, '"niemand liest ihn" ist kein bestandener Test');
});

test('CSS als eigene Datei statt inline: wird genauso gefunden', async () => {
  const { warnungen } = await lauf({ css: LIEST, alsDatei: true });
  assert.equal(warnungen.length, 1, 'auch nicht-inline ausgeliefertes CSS zählt');
});

test('strictAccentTextAusgabe: true bricht den Build ab', async () => {
  const { fehler } = await lauf({ css: LIEST, optionen: { strictAccentTextAusgabe: true } });
  assert.match(String(fehler), /strictAccentTextAusgabe=true/);
});

test('strict wirkt nur bei === true, nicht bei truthy', async () => {
  const { fehler } = await lauf({ css: LIEST, optionen: { strictAccentTextAusgabe: 1 } });
  assert.equal(fehler, null);
});

test('checkAccentTextAusgabe: false schaltet die Prüfung ab', async () => {
  const { warnungen, infos } = await lauf({ css: LIEST, optionen: { checkAccentTextAusgabe: false } });
  assert.equal(warnungen.length, 0);
  assert.equal(infos.length, 0);
});

/**
 * SABOTAGE-GEGENPROBE. Die Prüfung oben kann nur melden, wenn der Anker in
 * `tokens-base.css` überhaupt da ist — sonst verliert ihn jeder Kunde wieder und
 * die Meldung wäre Dauerzustand statt Ausnahme. Entfernt jemand die Zeile, muss
 * genau hier Rot stehen.
 */
test('SABOTAGE: der Anker steht in tokens-base.css', () => {
  const css = readFileSync(join(start, 'src/styles/tokens-base.css'), 'utf-8');
  assert.match(
    css,
    /--cw-anker-accent-text:\s*var\(--color-accent-text\)/,
    'Ohne diese Zeile schüttelt Tailwind --color-accent-text bei jedem Kunden heraus, ' +
      'der ihn nicht selbst referenziert (gemessen: ops#976, #989, #993).',
  );
});
