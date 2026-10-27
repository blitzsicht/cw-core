/**
 * Schrittnummern in ProcessSteps: traegt die gefuellte Ziffer genug Kontrast?
 *
 * ANLASS (spedition-steller, 25.10.2026). `numberStyle="solid"` ist eingebaut worden,
 * damit die Schrittnummer SICHTBAR wird — die Kontur-Variante war am Screenshot nicht
 * zu erkennen. Die solid-Regel setzte aber Deckkraft 0.3 (Raster) bzw. 0.25 (Weg), und
 * damit war die Ziffer schlechter lesbar als vorher: axe mass 1,47:1 auf der Startseite.
 *
 * Warum das lange niemand sah: die Raster-Variante malt die Ziffer als `::before`, und
 * axe prueft auf Pseudo-Elementen keinen Farbkontrast. Erst die Weg-Variante, die ein
 * echtes <span> traegt, liess den a11y-Audit rot werden. Ein Audit, das eine ganze
 * Darstellungsform nicht messen kann, ist fuer diese Form kein Nachweis — deshalb rechnet
 * dieser Test den Kontrast selbst, aus den Werten der Datei, die ausgeliefert wird.
 *
 * Schwelle: 3:1. Die Ziffer ist `font-size: clamp(3.5rem, 7vw, 6rem)` bei `font-weight: 900`,
 * also Large Text nach WCAG 1.4.3 (>= 18.66 px fett).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const QUELLE = fileURLToPath(new URL('../../src/components/blocks/ProcessSteps.astro', import.meta.url));
const css = readFileSync(QUELLE, 'utf8');

/* --- Kontrastrechner nach WCAG 2.1, relative Luminanz ------------------------ */
function kanal(c) {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}
function luminanz([r, g, b]) {
  return 0.2126 * kanal(r) + 0.7152 * kanal(g) + 0.0722 * kanal(b);
}
function hex(h) {
  const s = h.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16));
}
/** Kontrast einer mit `deckkraft` auf Weiss gelegten Farbe. */
function kontrast(farbe, deckkraft) {
  const auf = hex(farbe).map((c) => deckkraft * c + (1 - deckkraft) * 255);
  return 1.05 / (luminanz(auf) + 0.05);
}

/** Die Deckkraft, die in der Datei wirklich steht — nicht die, die hier erwartet wird. */
function deckkraftAus(regelAnfang) {
  const i = css.indexOf(regelAnfang);
  assert.ok(i > 0, `Regel nicht gefunden: ${regelAnfang}`);
  const block = css.slice(i, css.indexOf('}', i) + 1);
  const m = block.match(/opacity:\s*([\d.]+)/);
  assert.ok(m, `keine opacity in: ${block}`);
  return Number(m[1]);
}

/* Echte Werte der Flotte, am 25.10.2026 aus den tokens.css der customer-Repos gelesen. */
const PRIMAER = ['#00702B', '#006735', '#00482A', '#d90570', '#024d9d', '#312783',
  '#1D1E3B', '#004650', '#2F5D3A', '#3D4F2F', '#1f2a37', '#8A2934'];
const AKZENT_TEXT = ['#6E5200', '#00482A', '#024d9d', '#92400E', '#9A4F2E', '#BE0A26',
  '#B02139', '#3a6f10', '#1d3570', '#2A783B', '#7A5C25', '#8a6d3b', '#b9191c', '#5e5220',
  '#6B5D2B', '#b5050f', '#c2410c', '#AA124A', '#C2410C', '#0a7a45', '#8A6900'];
const SCHWELLE = 3.0;

// 1 — Kalibrierung: der Rechner muss reproduzieren, was axe gemessen hat.
test('Rechner trifft die axe-Messung des Fundfalls (1,47:1)', () => {
  const gemessen = kontrast('#00702B', 0.25);
  assert.ok(Math.abs(gemessen - 1.47) < 0.03, `erwartet ~1.47, gerechnet ${gemessen.toFixed(2)}`);
});

// 2 — Sabotage-Anker: ein Rechner, der immer gruen ist, taugt nicht.
test('Rechner meldet Weiss auf Weiss als 1:1', () => {
  assert.ok(kontrast('#ffffff', 1) < 1.05);
  assert.ok(kontrast('#000000', 1) > 20, 'und Schwarz auf Weiss als sehr hoch');
});

// 3 — Weg-Variante: Primaerfarbe, Wert aus der Datei
test('Weg-Ziffer traegt bei jeder Primaerfarbe der Flotte', () => {
  const d = deckkraftAus('.weg-nr {');
  const schlecht = PRIMAER.map((f) => [f, kontrast(f, d)]).filter(([, k]) => k < SCHWELLE);
  assert.deepEqual(schlecht, [], `Deckkraft ${d} reicht nicht fuer: ${JSON.stringify(schlecht)}`);
});

// 4 — GEGENPROBE zu 3: mit dem alten Wert muss der Test melden
test('Gegenprobe Weg: Deckkraft 0.25 faellt durch', () => {
  const schlecht = PRIMAER.filter((f) => kontrast(f, 0.25) < SCHWELLE);
  assert.equal(schlecht.length, PRIMAER.length, 'der alte Wert war fuer ALLE zu hell');
});

// 5 — Raster-Variante: Akzent-Textfarbe, Wert aus der Datei
test('Raster-Ziffer traegt bei jeder Akzent-Textfarbe der Flotte', () => {
  const d = deckkraftAus('.step::before {');
  const schlecht = AKZENT_TEXT.map((f) => [f, kontrast(f, d)]).filter(([, k]) => k < SCHWELLE);
  assert.deepEqual(schlecht, [], `Deckkraft ${d} reicht nicht fuer: ${JSON.stringify(schlecht)}`);
});

// 6 — GEGENPROBE zu 5: der alte Wert 0.3
test('Gegenprobe Raster: Deckkraft 0.3 faellt durch', () => {
  const schlecht = AKZENT_TEXT.filter((f) => kontrast(f, 0.3) < SCHWELLE);
  assert.ok(schlecht.length > 0, 'mindestens eine Flottenfarbe muss durchfallen');
});

// 7 — Der Token ist der eigentliche Fix, nicht die Zahl: roher Akzent reicht nicht.
test('roher Akzent statt accent-text waere zu hell (Markengelb)', () => {
  assert.ok(kontrast('#FCC100', 0.8) < SCHWELLE, 'Gelb traegt auch bei 0.8 nicht');
  assert.ok(kontrast('#8A6900', 0.8) >= SCHWELLE, 'die abgedunkelte Variante schon');
});

// 8 — und steht auch wirklich so in der Datei
test('Raster-Regel nutzt accent-text mit Fallback', () => {
  const i = css.indexOf('.step::before {');
  const block = css.slice(i, css.indexOf('}', i) + 1);
  assert.match(block, /color:\s*var\(--color-accent-text,\s*var\(--color-accent\)\)/);
});

// 9 — Weg-Regel bleibt auf der Primaerfarbe (dort ist sie belegt genug)
test('Weg-Regel nutzt die Primaerfarbe', () => {
  const i = css.indexOf('.weg-nr {');
  assert.match(css.slice(i, css.indexOf('}', i) + 1), /color:\s*var\(--color-primary\)/);
});

// 10 — Seit v0.184.0 gibt es die Kontur nicht mehr. Bis v0.183.0 hielt diese Probe
//      das Gegenteil fest ("Kontur-Defaults bleiben unveraendert"); sie ist bewusst
//      umgedreht worden, statt sie zu loeschen — so steht die Entscheidung im Test.
//      ANLASS levia-therapiezentrum 27.10.2026: die Kontur-"2" trug einen Strich quer
//      durch den Fuss, weil `-webkit-text-stroke` die Ueberlappung der Glyphe mitmalt.
test('keine Kontur mehr: nirgends -webkit-text-stroke in der Komponente', () => {
  const regeln = css.match(/-webkit-text-stroke\s*:/g) ?? [];
  assert.deepEqual(regeln, [], 'die Ziffer wird gefuellt gemalt, nicht als Umriss');
});

// 11 — GEGENPROBE zu 10: die Probe muss melden, wenn jemand die Kontur zurueckbaut.
//      Ohne sie waere 10 gruen, auch wenn der Rechner nie etwas zu sehen bekaeme.
test('Gegenprobe: eine wieder eingebaute Kontur wird erkannt', () => {
  const sabotiert = css.replace('.weg-nr {\n    display: block;',
    '.weg-nr {\n    -webkit-text-stroke: 2px var(--color-primary);\n    display: block;');
  assert.notEqual(sabotiert, css, 'Ankerstelle fuer die Sabotage nicht gefunden');
  assert.ok((sabotiert.match(/-webkit-text-stroke\s*:/g) ?? []).length === 1);
});

// 12 — Und die gefuellte Ziffer steht ohne Schalterklasse in der Datei: eine Regel,
//      die nur unter `.nr-solid` greift, waere nach v0.184.0 tot.
test('die gefuellte Regel haengt an keiner Schalterklasse', () => {
  assert.doesNotMatch(css, /nr-solid/);
});
