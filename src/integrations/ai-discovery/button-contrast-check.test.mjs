import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  checkButtonContrast,
  pruefeButtonKontrast,
  kontrast,
  alsHex,
  leseToken,
} from './button-contrast-check.js';

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

// ── Der dritte Zustand (30.08.2026) ────────────────────────────────────────
// Bis v0.143.0 gab checkButtonContrast in DREI Lagen ein leeres Array zurueck:
// bestanden, --color-accent nicht rechenbar, Schriftfarbe nicht rechenbar. Der
// Aufrufer machte daraus eine info-Zeile "✓ (oder ist nicht berechenbar)", und
// weil build-warnings.mjs nur WARN/ERROR zaehlt, buchte der Flotten-Scan das als
// sauber. gympanzen (eigene Palette, kein --color-accent) lag genau dort.

test('bestanden ist status ok — und NICHT dasselbe wie nicht rechenbar', () => {
  // blitzsicht, nicht mika: mikaCSS ist ein Grenzfall-Fixture (3,65:1) und
  // besteht oben nur mit ausdruecklich abgesenkter Schwelle 3.
  const r = pruefeButtonKontrast(blitzsichtCSS);
  assert.equal(r.status, 'ok');
  assert.equal(r.grund, null);
  assert.deepEqual(r.issues, []);
});

test('fehlendes --color-accent ist nicht-rechenbar, nicht ok', () => {
  // Der gympanzen-Fall: eigene Palette, kein --color-accent. Vorher: [] -> "✓".
  const r = pruefeButtonKontrast(':root { --color-hot-pink: #ff00ff; }');
  assert.equal(r.status, 'nicht-rechenbar');
  assert.match(r.grund, /nicht gesetzt/);
  assert.deepEqual(r.issues, []);
});

test('color-mix() im Akzent ist nicht-rechenbar, nicht ok', () => {
  const r = pruefeButtonKontrast(':root { --color-accent: color-mix(in srgb, red 50%, blue); }');
  assert.equal(r.status, 'nicht-rechenbar');
  assert.match(r.grund, /kein rechenbarer Hexwert/);
});

test('oklch() im Akzent ist nicht-rechenbar', () => {
  const r = pruefeButtonKontrast(':root { --color-accent: oklch(0.7 0.15 45); }');
  assert.equal(r.status, 'nicht-rechenbar');
});

test('nicht rechenbare Schriftfarbe ist nicht-rechenbar, nicht ok', () => {
  const r = pruefeButtonKontrast(
    ':root { --color-accent: #EA580C; --color-accent-btn-text: var(--irgendwas); }',
  );
  assert.equal(r.status, 'nicht-rechenbar');
  assert.match(r.grund, /color-accent-btn-text/);
});

test('ein echter Befund bleibt ein Befund', () => {
  // mazterplan am 30.08.2026: #FFFFFF auf #EA580C = 3,56:1, oeffentlich ausgeliefert.
  const r = pruefeButtonKontrast(
    ':root { --color-accent: #EA580C; --color-accent-btn-text: #FFFFFF; }',
  );
  assert.equal(r.status, 'befund');
  assert.equal(r.issues.length, 1);
  assert.equal(r.issues[0].ratio, 3.56);
});

test('der mazterplan-Fix besteht', () => {
  const r = pruefeButtonKontrast(
    ':root { --color-accent: #EA580C; --color-accent-btn-text: #000000; }',
  );
  assert.equal(r.status, 'ok');
});

test('checkButtonContrast bleibt als Wrapper unveraendert nutzbar', () => {
  // Rueckwaertskompatibilitaet: die 12 aelteren Tests oben laufen ueber diesen Weg.
  assert.equal(checkButtonContrast(solenoCSS).length, 1);
  assert.deepEqual(checkButtonContrast(blitzsichtCSS), []);
});
