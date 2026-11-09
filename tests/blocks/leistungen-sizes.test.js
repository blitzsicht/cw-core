// @ts-check
/**
 * LeistungenSection.astro — `sizes` nach echter Spaltenbreite.
 *
 * Lauf: `node --test tests/blocks/leistungen-sizes.test.js`
 *
 * ANLASS (spedition-steller.de, Lighthouse 09.11.2026): `sizes` sagte „100vw / 50vw / 33vw“ an
 * und ignorierte Container-Rand (2 × 1.5rem) und Gap (1.5rem). Bei 412 px Viewport waren die
 * Kacheln 362 px breit, angesagt 412 px, geladen 800w statt 640w.
 *
 * Gegenprobe: 2 und 3 Spalten liefern verschiedene Endbreiten; der alte String kommt nicht mehr vor.
 */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { renderer, schliessen, normalize } from './_render-astro.js';

after(schliessen);

const DATEI = 'src/components/blocks/LeistungenSection.astro';

/** @param {2 | 3 | 4} columns */
async function sizesBei(columns) {
  const r = await renderer();
  const img = (await r.laden('examples/src/assets/ki-karte.webp')).default;
  const html = normalize(await r.render(DATEI, {
    cardStyle: 'image',
    columns,
    items: [{ title: 'Pritsche', description: 'Baustoffe', imageSrc: img, imageAlt: 'Pritsche' }],
  }));
  const tag = html.match(/<img [^>]*alt="Pritsche"[^>]*>/)?.[0] ?? '';
  assert.ok(tag, 'Gegenprobe: das Kachelbild wird gerendert');
  return tag.match(/sizes="([^"]+)"/)?.[1] ?? '';
}

test('2 Spalten: mobil volle Breite minus Rand, ab 1152 px fest 540 px', async () => {
  const s = await sizesBei(2);
  assert.equal(s, '(max-width: 640px) calc(100vw - 3rem), (min-width: 1152px) 540px, calc((100vw - 3rem - 1.5rem) / 2)');
});

test('3 Spalten: ab 1152 px fest 352 px, dazwischen zwei Gaps abgezogen', async () => {
  const s = await sizesBei(3);
  assert.equal(s, '(max-width: 640px) calc(100vw - 3rem), (min-width: 1152px) 352px, calc((100vw - 3rem - 3rem) / 3)');
});

test('alter Viewport-String ist weg', async () => {
  assert.doesNotMatch(await sizesBei(2), /50vw, 33vw/);
});
