// @ts-check
/**
 * ProcessSteps.astro — Opt-in `layout="weg"` (v0.177.0).
 *
 * Lauf: `node --test tests/blocks/process-steps-weg.test.js`
 *
 * ANLASS (levia-therapiezentrum, Redesign 19.10.2026): „Der Weg zu uns“ — Schild, Windfang,
 * Eingang, Therapieraum als erzählter Weg mit großen Fotos statt als Kartenraster.
 *
 * Gegenprobe: ohne Opt-in Byte für Byte wie der v0.170.0-Schnappschuss
 * (`fixtures/opt-in-bilder-v0.170.0.json`).
 */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderer, schliessen, normalize } from './_render-astro.js';
import { FAELLE } from './opt-in-bilder-faelle.js';

after(schliessen);

const GOLDEN = JSON.parse(readFileSync(resolve(import.meta.dirname, 'fixtures/opt-in-bilder-v0.170.0.json'), 'utf8'));
const KI = [{ stem: 'ki-karte', herkunft: 'ki-erzeugt', deepfake: 'ja', begruendung: 'Testfixture' }];
const PS = FAELLE.processSteps;

/** @param {Record<string, unknown>} props */
async function render(props) {
  const r = await renderer();
  return normalize(await r.render(PS.datei, props));
}

async function bild() {
  const r = await renderer();
  return (await r.laden('examples/src/assets/ki-karte.webp')).default;
}

test('layout="raster" ausdrücklich: Byte für Byte wie der Default (v0.170.0)', async () => {
  assert.equal(await render({ ...PS.props, layout: 'raster' }), GOLDEN.processSteps);
});

test('layout="weg": geordnete Liste, ein Eintrag je Schritt, kein Raster', async () => {
  const html = await render({ ...PS.props, layout: 'weg' });
  assert.notEqual(html, GOLDEN.processSteps, 'Gegenprobe: mit Opt-in ändert sich das Markup');
  assert.match(html, /<ol class="weg">/);
  assert.equal((html.match(/<li class="weg-schritt">/g) ?? []).length, 4);
  assert.doesNotMatch(html, /class="steps/);
  assert.doesNotMatch(html, /cols-4/, 'columns wirkt im Weg nicht');
});

test('layout="weg": Reihenfolge, Ziffern aria-hidden, Titel als h3', async () => {
  const html = await render({ ...PS.props, layout: 'weg' });
  const titel = [...html.matchAll(/<h3>([^<]+)<\/h3>/g)].map((m) => m[1]);
  assert.deepEqual(titel, ['Hinkommen', 'Warten', 'Schneiden', 'Weiter']);
  assert.equal((html.match(/<span class="weg-nr" aria-hidden="true">\d<\/span>/g) ?? []).length, 4);
});

test('layout="weg" mit Bild: großes Bild, KI-Label mit bildHerkunft, übrige behalten ihr Symbol', async () => {
  const img = await bild();
  const items = /** @type {any[]} */ (PS.props.items).map((s, i) => (i === 1 ? { ...s, image: img, imageAlt: 'Wartebank' } : s));
  const html = await render({ ...PS.props, items, layout: 'weg', bildHerkunft: KI });
  assert.equal((html.match(/class="weg-img"/g) ?? []).length, 1);
  assert.equal((html.match(/class="weg-symbol"/g) ?? []).length, 3);
  const tag = html.match(/<img [^>]*class="weg-img"[^>]*>/)?.[0] ?? '';
  assert.match(tag, /alt="Wartebank"/);
  assert.match(tag, /sizes="\(max-width: 759px\) 100vw, 55vw"/);
  const kachel = html.slice(html.indexOf('class="weg-bild"><img'), html.indexOf('<h3>Warten'));
  assert.match(kachel, /ai-label-am-bild/);
});

test('Gegenprobe Weg: Bild ohne bildHerkunft → kein Label', async () => {
  const img = await bild();
  const html = await render({ ...PS.props, layout: 'weg', items: [{ nr: 1, image: img, title: 'A', desc: 'b' }] });
  assert.match(html, /class="weg-img"/);
  assert.doesNotMatch(html, /ai-label-am-bild/);
});

/* v0.184.0: gefüllt ist die einzige Darstellung, die Schalterklasse ist weg.
   Die Prop darf am Markup nichts mehr ändern — sonst stünde hier wieder ein
   zweiter Weg neben dem ersten. */
test('layout="weg": Liste ohne Schalterklasse, auch mit numberStyle', async () => {
  const ohne = await render({ ...PS.props, layout: 'weg' });
  const mit = await render({ ...PS.props, layout: 'weg', numberStyle: 'solid' });
  assert.match(ohne, /<ol class="weg">/);
  assert.equal(mit, ohne, 'numberStyle ist wirkungslos');
  assert.doesNotMatch(mit, /nr-solid/);
});

test('layout: unbekannter Wert bleibt beim Raster', async () => {
  assert.equal(await render({ ...PS.props, layout: 'zickzack' }), GOLDEN.processSteps);
});
