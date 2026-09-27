// @ts-check
/**
 * StickyContact.astro + Footer.astro bauen ihren wa.me-Link über `waHref()`.
 *
 * Lauf: `node --test tests/blocks/whatsapp-links.test.js`
 *
 * Gegenprobe: Schnappschüsse VOR der Änderung (Stand 5d95ce58, v0.160.0), gerendert mit
 * den echten WhatsApp-Werten der Flotte (`fixtures/whatsapp-links-v0.160.0.json`).
 * Für jede Eingabe mit Ländervorwahl muss das Markup Byte für Byte gleich bleiben.
 *
 * EINE Abweichung ist gewollt: nationale Schreibweise („0151 2345678“). Vorher entstand
 * `wa.me/01512345678` — kein gültiger WhatsApp-Link. Jetzt `wa.me/491512345678`.
 */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderer, schliessen, normalize } from './_render-astro.js';

after(schliessen);

const FIXTURE = JSON.parse(
  readFileSync(resolve(import.meta.dirname, 'fixtures/whatsapp-links-v0.160.0.json'), 'utf8'),
);
const STICKY = 'src/components/blocks/StickyContact.astro';
const FOOTER = 'src/components/layout/Footer.astro';

/** Dieselben Werte wie beim Erzeugen des Schnappschusses. */
const WA = {
  asg: '+49 151 27184818',
  blz: '+49 173 7215679',
  ham: '+39 345 997 3997',
  sol: '+4915156083331',
  ste: '+49 171 3285526',
  gow: '+4917632665985',
  mik: '4916091172381',
};
const TEXT = 'Hallo, ich interessiere mich für Ihr Angebot & mehr?';

/** @param {string} datei @param {Record<string, unknown>} props */
async function render(datei, props) {
  const r = await renderer();
  return normalize(await r.render(datei, props));
}

for (const [k, v] of Object.entries(WA)) {
  test(`StickyContact „${v}“ mit Text: bytegleich v0.160.0`, async () => {
    assert.equal(await render(STICKY, { whatsapp: v, phone: v, prefilledMessage: TEXT }), FIXTURE.sticky[k]);
  });
  test(`StickyContact „${v}“ mit Default-Text: bytegleich v0.160.0`, async () => {
    assert.equal(await render(STICKY, { whatsapp: v }), FIXTURE.sticky[`${k}-default`]);
  });
  test(`Footer „${v}“: bytegleich v0.160.0`, async () => {
    assert.equal(await render(FOOTER, { siteName: 'Testkunde', whatsapp: v, phone: v, email: 'a@b.de' }), FIXTURE.footer[k]);
  });
}

test('ohne oder mit leerer WhatsApp-Nummer: kein Link, bytegleich v0.160.0', async () => {
  assert.equal(await render(STICKY, { whatsapp: '', phone: '+49 171 3285526' }), FIXTURE.sticky.leer);
  assert.equal(await render(STICKY, { phone: '+49 171 3285526' }), FIXTURE.sticky.ohne);
  assert.equal(await render(FOOTER, { siteName: 'Testkunde', whatsapp: '' }), FIXTURE.footer.leer);
  assert.equal(await render(FOOTER, { siteName: 'Testkunde' }), FIXTURE.footer.ohne);
});

test('Gegenprobe: der Schnappschuss trägt den kaputten nationalen Link', () => {
  assert.match(FIXTURE.sticky['national-0151'], /wa\.me\/01512345678\?/);
  assert.match(FIXTURE.footer['national-0151'], /wa\.me\/01512345678"/);
});

test('nationale Nummer „0151 2345678“: jetzt wa.me/49…, sonst bytegleich (gewollte Abweichung)', async () => {
  const sticky = await render(STICKY, { whatsapp: '0151 2345678' });
  const footer = await render(FOOTER, { siteName: 'Testkunde', whatsapp: '0151 2345678' });
  assert.equal(sticky, FIXTURE.sticky['national-0151'].replace('wa.me/01512345678', 'wa.me/491512345678'));
  assert.equal(footer, FIXTURE.footer['national-0151'].replace('wa.me/01512345678', 'wa.me/491512345678'));
});

test('beide Komponenten bauen den Link nicht mehr selbst', () => {
  for (const datei of [STICKY, FOOTER]) {
    const src = readFileSync(resolve(import.meta.dirname, '../..', datei), 'utf8');
    // assert.ok statt match: sonst druckt ein Fehlschlag die ganze Komponente aus.
    assert.ok(/import \{ waHref \} from '\.\.\/\.\.\/utils\/text\/wa-href\.js'/.test(src), `${datei} importiert waHref nicht`);
    assert.ok(!/wa\.me\/\$\{/.test(src), `${datei} setzt wa.me noch selbst zusammen`);
  }
});
