import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkButtonContrast, kontrast, alsHex, leseToken } from './button-contrast-check.js';

// Alle Farben sind echte Werte aus den tokens.css der Live-Kunden, Stand 28.08.2026.
const solenoCSS = ':root { --color-accent: #eac800; }';                       // Token fehlt -> weiss
const ddCSS = ':root { --color-accent: #4d9918; }';                           // Token fehlt -> weiss
const mikaCSS = ':root { --color-accent: #0FAE68; --color-accent-btn-text: #004650; }';
const blitzsichtCSS = ':root { --color-accent: #EF7612; --color-accent-btn-text: #1D1E3B; }';
const zinkCSS = ':root { --color-accent: #E5006D; }';                         // weiss besteht hier

test('GEGENPROBE soleno: fehlender Token -> weiss auf Gelb, 1,65:1', () => {
  const [i] = checkButtonContrast(solenoCSS);
  assert.equal(i.type, 'accent_button_contrast');
  assert.equal(i.ratio, 1.65);
  assert.match(i.detail, /Fallback weiss/);
});

test('GEGENPROBE digital-direkt: 3,57:1', () => {
  assert.equal(checkButtonContrast(ddCSS)[0].ratio, 3.57);
});

test('GEGENPROBE mika: Token gesetzt, aber zu hell — 3,65:1', () => {
  const [i] = checkButtonContrast(mikaCSS);
  assert.equal(i.ratio, 3.65);
  assert.match(i.detail, /--color-accent-btn-text \(#004650\)/);
});

test('blitzsicht besteht — 5,59:1, keine Meldung', () => {
  assert.deepEqual(checkButtonContrast(blitzsichtCSS), []);
});

test('zink besteht mit dem weissen Fallback — 4,61:1', () => {
  assert.deepEqual(checkButtonContrast(zinkCSS), []);
});

test('die vorgeschlagene Reparatur macht die Meldung weg', () => {
  assert.deepEqual(checkButtonContrast(solenoCSS.replace('}', '--color-accent-btn-text: #1a1a1a; }')), []);
});

test('ohne --color-accent wird nichts behauptet', () => {
  assert.deepEqual(checkButtonContrast(':root { --color-primary: #123456; }'), []);
});

test('nicht rechenbare Werte fuehren zu Schweigen, nicht zu einer erfundenen Zahl', () => {
  assert.deepEqual(checkButtonContrast(':root{--color-accent: color-mix(in srgb, red, blue);}'), []);
  assert.deepEqual(checkButtonContrast(':root{--color-accent:#EF7612;--color-accent-btn-text: rgb(0 0 0);}'), []);
});

test('alsHex normalisiert Kurzform und Schluesselwoerter', () => {
  assert.equal(alsHex('#abc'), '#aabbcc');
  assert.equal(alsHex(' WHITE '), '#ffffff');
  assert.equal(alsHex('black'), '#000000');
  assert.equal(alsHex('rebeccapurple'), null);
});

test('leseToken nimmt die LETZTE Definition — die gewinnt in der Kaskade', () => {
  assert.equal(leseToken(':root{--color-accent:#111111}\n:root{--color-accent:#222222}', 'color-accent'), '#222222');
});

test('kontrast rechnet nach WCAG', () => {
  assert.equal(kontrast('#ffffff', '#000000').toFixed(0), '21');
  assert.equal(kontrast('#ffffff', '#ffffff').toFixed(0), '1');
});

test('die Schwelle ist einstellbar', () => {
  assert.deepEqual(checkButtonContrast(mikaCSS, 3), []);
  assert.equal(checkButtonContrast(blitzsichtCSS, 7).length, 1);
});
