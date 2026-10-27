/**
 * Guard fuer die grosse Schritt-Ziffer: Proben + Gegenproben.
 *
 * Lauf: `node --test src/integrations/ai-discovery/schrittnummer-contrast-check.test.mjs`
 *
 * Der Guard ist am echten Fehlerfall geeicht, nicht am Schreibtisch: weinkontor-sinzing
 * setzt `--color-accent-text: #ffffff` (tokens.css:14, gelesen 27.10.2026 an origin) —
 * das ergibt eine weisse Ziffer auf weissem Abschnitt. Diese Datei verlangt, dass der
 * Guard genau diesen Fall meldet, und zwar aus dem richtigen Grund.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { kontrast } from './button-contrast-check.js';
import {
  pruefeSchrittnummerKontrast,
  ueberlagert,
  ABSCHNITT_HINTERGRUND,
  DECKKRAFT,
} from './schrittnummer-contrast-check.js';

const tokens = (werte) => `@theme {\n${Object.entries(werte).map(([k, v]) => `  --${k}: ${v};`).join('\n')}\n}`;

/* --- 1. Der Rechner selbst ------------------------------------------------- */

// Kalibrierung: der Fundfall aus v0.182.0 (spedition-steller, axe: 1,47:1).
test('Rechner trifft die axe-Messung des alten Fundfalls (1,47:1)', () => {
  const sichtbar = ueberlagert('#00702b', 0.25, '#ffffff');
  const gemessen = kontrast(sichtbar, '#ffffff');
  assert.ok(Math.abs(gemessen - 1.47) < 0.03, `erwartet ~1.47, gerechnet ${gemessen.toFixed(2)}`);
});

// Sabotage-Anker: ein Rechner, der nie klein wird, taugt nicht.
test('Weiss auf Weiss ist 1:1, Schwarz auf Weiss sehr hoch', () => {
  assert.ok(kontrast(ueberlagert('#ffffff', DECKKRAFT, '#ffffff'), '#ffffff') < 1.05);
  assert.ok(kontrast(ueberlagert('#000000', DECKKRAFT, '#ffffff'), '#ffffff') > 10);
});

/* --- 2. Der echte Fundfall ------------------------------------------------- */

test('weinkontor-sinzing: weisses --color-accent-text wird gemeldet', () => {
  const e = pruefeSchrittnummerKontrast(
    tokens({ 'color-primary': '#242424', 'color-accent': '#BE0C1D', 'color-accent-text': '#ffffff' }),
  );
  assert.equal(e.status, 'befund');
  assert.equal(e.issues.length, 1, 'die Weg-Ziffer auf --color-primary ist dort in Ordnung');
  assert.equal(e.issues[0].variante, 'raster');
  assert.ok(e.issues[0].ratio < 1.1, `weiss auf weiss, gemessen ${e.issues[0].ratio}`);
  assert.match(e.issues[0].detail, /--color-accent-text/);
});

test('GEGENPROBE: mit abgedunkeltem Weinrot meldet derselbe Aufruf nichts', () => {
  const e = pruefeSchrittnummerKontrast(
    tokens({ 'color-primary': '#242424', 'color-accent': '#BE0C1D', 'color-accent-text': '#9A0A17' }),
  );
  assert.equal(e.status, 'ok');
  assert.deepEqual(e.issues, []);
});

/* --- 3. Gegenprobe gegen den eigenen Bauplan ------------------------------- */

// Ohne Alpha-Komposition waere der Guard gruen, wo er rot sein muss. Diese Probe
// faellt um, wenn jemand `ueberlagert` aus dem Pfad nimmt.
test('die Deckkraft macht den Unterschied: #808080 besteht voll, faellt bei 0.8 durch', () => {
  assert.ok(kontrast('#808080', ABSCHNITT_HINTERGRUND) >= 3, 'volle Farbe bestuende');
  const e = pruefeSchrittnummerKontrast(tokens({ 'color-primary': '#808080', 'color-accent-text': '#1a1a1a' }));
  assert.equal(e.status, 'befund');
  assert.equal(e.issues[0].variante, 'weg');
  assert.ok(e.issues[0].ratio < 3);
});

/* --- 4. Fallback und dritter Zustand --------------------------------------- */

test('ohne --color-accent-text zaehlt --color-accent (Markengelb faellt durch)', () => {
  const e = pruefeSchrittnummerKontrast(tokens({ 'color-primary': '#313d44', 'color-accent': '#FCC100' }));
  assert.equal(e.status, 'befund');
  assert.equal(e.issues[0].variante, 'raster');
  assert.match(e.issues[0].detail, /Fallback/);
});

test('dritter Zustand: keine Tokens → nicht-rechenbar, nicht "bestanden"', () => {
  const e = pruefeSchrittnummerKontrast('.irgendwas { color: red; }');
  assert.equal(e.status, 'nicht-rechenbar');
  assert.match(e.grund, /nicht gesetzt/);
});

test('dritter Zustand: oklch() ist kein Hexwert und wird als solches benannt', () => {
  const e = pruefeSchrittnummerKontrast(
    tokens({ 'color-primary': 'oklch(0.5 0.1 250)', 'color-accent-text': 'color-mix(in srgb, red, blue)' }),
  );
  assert.equal(e.status, 'nicht-rechenbar');
  assert.match(e.grund, /kein rechenbarer Hexwert/);
});

test('Teil-Fund: eine Variante rechenbar und rot, die andere unrechenbar → Befund', () => {
  const e = pruefeSchrittnummerKontrast(
    tokens({ 'color-primary': 'oklch(0.5 0.1 250)', 'color-accent-text': '#ffffff' }),
  );
  assert.equal(e.status, 'befund');
  assert.equal(e.issues.length, 1);
});

/* --- 5. Misst der Guard das, was ausgeliefert wird? ------------------------- */

// Der Guard rechnet mit Annahmen aus ProcessSteps.astro (Hintergrund, Deckkraft,
// Tokens). Aendert jemand dort etwas, misst der Guard ab da das falsche Objekt —
// ohne diese Probe wuerde er weiter gruen melden.
test('Annahmen stimmen mit ProcessSteps.astro ueberein', () => {
  const quelle = fileURLToPath(new URL('../../components/blocks/ProcessSteps.astro', import.meta.url));
  const css = readFileSync(quelle, 'utf8');
  const regel = (anfang) => css.slice(css.indexOf(anfang), css.indexOf('}', css.indexOf(anfang)) + 1);

  assert.match(regel('.process-section {'), /background:\s*white/, 'Hintergrund des Abschnitts');
  assert.equal(ABSCHNITT_HINTERGRUND, '#ffffff');

  const raster = regel('.step::before {');
  assert.match(raster, new RegExp(`opacity:\\s*${DECKKRAFT}`), 'Deckkraft Raster');
  assert.match(raster, /color:\s*var\(--color-accent-text,\s*var\(--color-accent\)\)/);

  const weg = regel('.weg-nr {');
  assert.match(weg, new RegExp(`opacity:\\s*${DECKKRAFT}`), 'Deckkraft Weg');
  assert.match(weg, /color:\s*var\(--color-primary\)/);
});
