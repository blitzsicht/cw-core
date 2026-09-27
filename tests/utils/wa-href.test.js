// @ts-check
/**
 * waHref() — eine Stelle, die aus einer Telefonnummer einen wa.me-Link baut.
 *
 * Lauf: `node --test tests/utils/wa-href.test.js`
 *
 * ANLASS (Lead-Rakete-Audit 26.09.2026): StickyContact.astro und Footer.astro bauten den
 * Link je für sich mit `replace(/\D/g, '')`. Das trägt, solange die Nummer mit
 * Ländervorwahl kommt. Eine nationale Schreibweise („0151 2345678“) ergab
 * `wa.me/01512345678` — für WhatsApp eine ungültige Nummer, der Klick landet auf einer
 * Fehlerseite. Gegenprobe: tests/blocks/fixtures/whatsapp-links-v0.160.0.json enthält
 * genau diesen kaputten Link aus dem Stand vor der Änderung.
 *
 * Die Flottenwerte unten stammen aus `git grep origin/main` in den customer-*-Repos
 * (27.09.2026): alle mit Ländervorwahl, keiner national — der Fehler war bisher latent.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { waHref } from '../../src/utils/text/wa-href.js';

/** Echte Werte aus der Flotte (origin/main) → erwartete wa.me-Ziffern. */
const FLOTTE = [
  ['+49 151 27184818', '4915127184818', 'allstargirls site-data.ts:23 (PHONE = contact.whatsapp)'],
  ['+49 173 7215679', '491737215679', 'blitzsicht page-config.ts:107 (contact.phone)'],
  ['+39 345 997 3997', '393459973997', 'hausammincio/hausamlago contact.phone (Italien)'],
  ['+4915156083331', '4915156083331', 'soleno site-data.ts:51 (contact.whatsapp)'],
  ['+49 171 3285526', '491713285526', 'steller page-config.ts:98 (contact.phone)'],
  ['+4917632665985', '4917632665985', 'gowohnen wohnungen.ts:176 (telefon)'],
  ['4916091172381', '4916091172381', 'mika site-data.ts:83 (contact.whatsapp, ohne +)'],
];

for (const [eingabe, ziffern, quelle] of FLOTTE) {
  test(`Flottenwert ${quelle}: „${eingabe}“ → wa.me/${ziffern}`, () => {
    assert.equal(waHref(eingabe), `https://wa.me/${ziffern}`);
  });
}

test('nationale Schreibweise: führende 0 wird zu 49 (der bisherige Bug)', () => {
  assert.equal(waHref('0151 2345678'), 'https://wa.me/491512345678');
  assert.equal(waHref('0941/123 456-7'), 'https://wa.me/499411234567');
});

test('internationale Wählvorwahl 00 fällt weg', () => {
  assert.equal(waHref('0049 151 2345678'), 'https://wa.me/491512345678');
  assert.equal(waHref('0039 345 997 3997'), 'https://wa.me/393459973997');
});

test('„+49 (0) 151 …“: die eingeklammerte Null wird nicht mitgewählt', () => {
  assert.equal(waHref('+49 (0) 151 2345678'), 'https://wa.me/491512345678');
  assert.equal(waHref('+49(0)151-2345678'), 'https://wa.me/491512345678');
});

test('Text wird mit encodeURIComponent angehängt', () => {
  assert.equal(
    waHref('+49 151 2345678', 'Hallo, ich interessiere mich für Ihr Angebot & mehr?'),
    'https://wa.me/491512345678?text=Hallo%2C%20ich%20interessiere%20mich%20f%C3%BCr%20Ihr%20Angebot%20%26%20mehr%3F',
  );
});

test('leerer oder fehlender Text hängt nichts an', () => {
  assert.equal(waHref('+49 151 2345678', ''), 'https://wa.me/491512345678');
  assert.equal(waHref('+49 151 2345678', undefined), 'https://wa.me/491512345678');
});

test('ungültige Nummer (< 6 Ziffern) wirft mit klarer Meldung', () => {
  assert.throws(() => waHref('12345'), /waHref: .*„12345“.*mindestens 6 Ziffern/);
  assert.throws(() => waHref(''), /waHref/);
  assert.throws(() => waHref('WhatsApp'), /waHref/);
  // Gezählt werden die Ziffern der Eingabe, nicht die nach dem Voranstellen von 49 —
  // sonst würde aus „0123“ eine scheinbar gültige 49123.
  assert.throws(() => waHref('0123'), /waHref/);
});

test('Gegenprobe: 6 Ziffern sind gültig', () => {
  assert.equal(waHref('123456'), 'https://wa.me/123456');
});

test('Export: @cw/core/utils/text/wa-href zeigt auf die .js und die .d.ts', async () => {
  // Der Sammel-Eintrag "./utils/*" zeigt auf *.ts und träfe wa-href.js nicht (vgl.
  // tests/exports-map.test.js, der nur src/utils/ oberste Ebene prüft).
  const { readFileSync } = await import('node:fs');
  const { resolve } = await import('node:path');
  const wurzel = resolve(import.meta.dirname, '../..');
  const pkg = JSON.parse(readFileSync(resolve(wurzel, 'package.json'), 'utf8'));
  const eintrag = pkg.exports['./utils/text/wa-href'];
  assert.deepEqual(eintrag, { types: './src/utils/text/wa-href.d.ts', default: './src/utils/text/wa-href.js' });
  for (const rel of Object.values(eintrag)) assert.doesNotThrow(() => readFileSync(resolve(wurzel, rel)), rel);
});
