/**
 * Tests für `src/utils/html-attribute.js`, den gemeinsamen Attributleser und Entity-Decoder
 * von verify-touchpoints und og-audit (cw-core#260, Nachlese zu #263, T1–T7).
 * Jeder Fall ist am WHATWG-Verhalten gemessen, nicht an der alten Implementierung.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { attribute, dekodiereEntities, entityZeichen, srcsetUrls } from '../../src/utils/html-attribute.js';

test('dekodiereEntities: ein Durchgang — ein Ergebnis wird nie erneut gelesen (T1)', () => {
  assert.equal(dekodiereEntities('/a&#38;amp;b'), '/a&amp;b');
  assert.equal(dekodiereEntities('&#x26;lt;'), '&lt;');
  assert.equal(dekodiereEntities('&amp;#38;'), '&#38;');
});

test('dekodiereEntities: numerisch auch ohne Semikolon (T4), benannt nur mit — außer Legacy-Namen', () => {
  assert.equal(dekodiereEntities('/a&#38b'), '/a&b');
  assert.equal(dekodiereEntities('x &amp y'), 'x & y', 'Legacy `amp` ohne `;`, danach ein Leerzeichen');
  // WHATWG für Attribute: folgt ein Buchstabe, eine Ziffer oder `=`, bleibt es stehen —
  // sonst würde aus `?a=1&ampel=2` eine andere Query.
  assert.equal(dekodiereEntities('?a=1&ampel=2&amp=3'), '?a=1&ampel=2&amp=3');
  assert.equal(dekodiereEntities('&apos'), '&apos', '`apos` hat keine Legacy-Form');
  assert.equal(dekodiereEntities('&apos;'), "'");
});

test('dekodiereEntities: Namen sind case-sensitiv, Unbekanntes bleibt stehen', () => {
  assert.equal(dekodiereEntities('&AMP;&QUOT;'), '&"');
  assert.equal(dekodiereEntities('&Amp;'), '&Amp;');
  assert.equal(dekodiereEntities('&bogus;'), '&bogus;');
  assert.equal(dekodiereEntities('&#;'), '&#;');
  assert.equal(dekodiereEntities(undefined), undefined);
  assert.equal(dekodiereEntities(null), null);
});

test('entityZeichen: WHATWG-Sonderfälle (T5)', () => {
  assert.equal(entityZeichen(0x80), '€', '0x80–0x9F über Windows-1252');
  assert.equal(entityZeichen(0x99), '™');
  assert.equal(entityZeichen(0x81), '\u0081', 'Lücke in der Tabelle bleibt');
  assert.equal(entityZeichen(0), '�');
  assert.equal(entityZeichen(0xd800), '�', 'Surrogat');
  assert.equal(entityZeichen(0x110000), '�');
  assert.equal(dekodiereEntities('&#99999999999999999999;'), '�', 'kein RangeError');
  // GEGENPROBE: gewöhnliche Codepoints bleiben, wie sie sind.
  assert.equal(entityZeichen(0x26), '&');
  assert.equal(entityZeichen(0x1f600), '😀');
});

test('attribute: quote-korrekt, erstes Vorkommen gewinnt, Werte dekodiert (T2)', () => {
  assert.deepEqual(
    attribute(`<img src="/it's.webp" alt='sag "hallo"' SRC="/zweites.webp" loading=lazy hidden>`),
    { src: "/it's.webp", alt: 'sag "hallo"', loading: 'lazy', hidden: '' },
  );
  assert.deepEqual(attribute('<meta property="og:image" content="/og?a&#38;b.png" />'), {
    property: 'og:image', content: '/og?a&b.png',
  });
  // GEGENPROBE: ein `=` in einem Wert macht kein neues Attribut auf.
  assert.deepEqual(attribute('<img alt="a src=/falsch.webp" src="/richtig.webp">'), {
    alt: 'a src=/falsch.webp', src: '/richtig.webp',
  });
});

test('srcsetUrls: nach WHATWG — Komma in der URL trennt nicht, Deskriptoren mit Klammern (T6)', () => {
  assert.deepEqual(srcsetUrls('/a,b.webp 1x'), ['/a,b.webp']);
  assert.deepEqual(srcsetUrls('/a.webp 400w, /b.webp 800w,/c.webp 2x'), ['/a.webp', '/b.webp', '/c.webp']);
  assert.deepEqual(srcsetUrls('/a.webp,, /b.webp,'), ['/a.webp', '/b.webp'], 'Kommas am Ende trennen');
  assert.deepEqual(srcsetUrls('/a.webp (foo, bar) 1x, /b.webp'), ['/a.webp', '/b.webp'], 'Komma in Klammern trennt nicht');
  assert.deepEqual(srcsetUrls(''), []);
  assert.deepEqual(srcsetUrls(undefined), []);
});
