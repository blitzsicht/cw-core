// @ts-check
/**
 * Hero.astro — Opt-in `layout="backdrop"` und `usps[].iconSvg` (v0.171.0).
 *
 * Lauf: `node --test tests/blocks/hero-backdrop.test.js`
 *
 * ANLASS (haarwerk-neutraubling, Kundengespräch 08.10.2026): „Farbverlauf bzw. Bild im
 * Page-Hero-Hintergrund, auf der ganzen Website.“ Der Hero kannte nur Text NEBEN dem Bild.
 *
 * Gegenprobe: Schnappschüsse VOR der Änderung aus v0.170.0
 * (`fixtures/opt-in-bilder-v0.170.0.json`, Prop-Sätze in `opt-in-bilder-faelle.js`).
 * Ohne die neuen Props muss das Markup Byte für Byte gleich bleiben.
 */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderer, schliessen, normalize } from './_render-astro.js';
import { FAELLE } from './opt-in-bilder-faelle.js';

after(schliessen);

const GOLDEN = JSON.parse(readFileSync(resolve(import.meta.dirname, 'fixtures/opt-in-bilder-v0.170.0.json'), 'utf8'));
const HERO = 'src/components/blocks/Hero.astro';

/** @param {Record<string, unknown>} props */
async function render(props) {
  const r = await renderer();
  return normalize(await r.render(HERO, props));
}

for (const name of ['heroOhneBild', 'heroSplitImageSrc', 'heroUspsStagger']) {
  test(`ohne Opt-in: ${name} Byte für Byte wie v0.170.0`, async () => {
    assert.equal(await render(FAELLE[name].props), GOLDEN[name]);
  });
}

test('layout="split" ausdrücklich: wie der Default', async () => {
  assert.equal(await render({ ...FAELLE.heroSplitImageSrc.props, layout: 'split' }), GOLDEN.heroSplitImageSrc);
});

test('layout="backdrop": Bild hinter dem Text, Verlauf darüber, kein Split', async () => {
  const html = await render({ ...FAELLE.heroSplitImageSrc.props, layout: 'backdrop' });
  assert.notEqual(html, GOLDEN.heroSplitImageSrc, 'Gegenprobe: mit Opt-in ändert sich das Markup');
  assert.match(html, /class="hero hero--backdrop"/);
  assert.doesNotMatch(html, /hero--split/);
  assert.doesNotMatch(html, /hero-image-wrap/);
  assert.match(html, /<div class="hero-backdrop">\s*<img src="\/images\/hero\.webp"[^>]*sizes="100vw"[^>]*alt="Salon"[^>]*fetchpriority="high"[^>]*class="hero-backdrop-img"/);
  assert.match(html, /<div class="hero-backdrop-overlay" aria-hidden="true"><\/div>/);
  // Das Bild steht im Markup VOR dem Text-Container (Ebene dahinter).
  assert.ok(html.indexOf('hero-backdrop') < html.indexOf('class="container"'));
});

test('layout="backdrop" ohne Bild: bleibt der reine Verlauf (kein leerer Backdrop)', async () => {
  const html = await render({ ...FAELLE.heroOhneBild.props, layout: 'backdrop' });
  assert.equal(html, GOLDEN.heroOhneBild);
});

test('layout="backdrop" mit KI-Bild: Kennzeichnung bleibt am Bild', async () => {
  const html = await render({
    ...FAELLE.heroSplitImageSrc.props,
    layout: 'backdrop',
    bildHerkunft: [{ stem: 'hero', herkunft: 'ki-erzeugt', deepfake: 'ja', begruendung: 'Testfixture' }],
  });
  const backdrop = html.slice(html.indexOf('<div class="hero-backdrop">'), html.indexOf('class="container"'));
  assert.match(backdrop, /ai-label-am-bild/, 'Label sitzt in der Backdrop-Ebene');
});

test('Gegenprobe Kennzeichnung: ohne bildHerkunft kein Label im Backdrop', async () => {
  const html = await render({ ...FAELLE.heroSplitImageSrc.props, layout: 'backdrop' });
  assert.doesNotMatch(html, /ai-label-am-bild/);
});

test('usps[].iconSvg: Symbol als Maske statt Zeichen', async () => {
  const html = await render({
    ...FAELLE.heroOhneBild.props,
    usps: [{ iconSvg: '/icons/schere.svg', title: 'Schnitt' }, { icon: '◷', title: 'Zeiten' }],
  });
  assert.match(html, /<span class="usp-icon usp-icon-svg" style="--usp-icon:url\('\/icons\/schere\.svg'\)" aria-hidden="true"><\/span>/);
  assert.match(html, /<span class="usp-icon" aria-hidden="true">◷<\/span>/);
});
