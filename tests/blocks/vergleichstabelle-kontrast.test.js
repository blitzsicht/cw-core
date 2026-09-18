// @ts-check
/**
 * Wächter: hält `VergleichsTabelle.astro` für einen dunklen Mandanten UND für
 * die vier hellen Mandanten den Kontrast jeder Textzelle ≥ 4,5:1?
 *
 * Lauf: `node --test tests/blocks/vergleichstabelle-kontrast.test.js`
 *
 * ANLASS: blitzsicht-ops#817 (Upstream blitzsicht/cw-core#148). `.vergleich-table`
 * setzte `background: white` hart. Auf platzfrei.club (dunkler Mandant, vor
 * dessen eigener Komponente) fielen drei Zellen unter 4,5:1 — gemessen am
 * 17.09.2026: Zeilenlabel 1,07 / Markenspalte 1,26 / Wettbewerberspalte 3,06.
 *
 * Die GEGENPROBE unten reproduziert genau diese drei Werte gegen ein
 * Abbild des Stands VOR dem Fix — sie bleibt bestehen, weil sie einen
 * historischen Zustand fest verdrahtet (wie `solenoCSS` etc. in
 * `button-contrast-check.test.mjs`). Die eigentliche, lebende Absicherung
 * gegen eine Regression sind die beiden Tests darunter: sie lesen die ECHTE
 * Datei und würden rot, sobald dort wieder ein Hardcode landet.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import {
  pruefeVergleichstabelle,
  leseStyleBlock,
  block,
  eigenschaft,
  loese,
} from '../../src/components/blocks/vergleichstabelle-kontrast-check.mjs';

const QUELLE = resolve(import.meta.dirname, '../../src/components/blocks/VergleichsTabelle.astro');

/** Dunkler Token-Satz — reale Werte aus dem platzfrei-Vorfall (blitzsicht-ops#817). */
const dunkel = {
  'color-text': '#F7F7F2',
  'color-primary': '#04FFF7',
  'color-primary-text': '#050505',
  'color-accent': '#04FFF7',
  'color-accent-btn-text': '#050505',
  'color-accent-text': '#04FFF7',
  'color-muted': '#8E949B',
  'color-surface': '#050505',
  'color-surface-elevated': '#111315',
};

/**
 * Heller Token-Satz: bewusst LEER. Kein einziges Custom Property gesetzt —
 * jede Zelle löst über die in der Datei hinterlegte `var(--x, fallback)`-Kette
 * auf. Das ist der schärfstmögliche Nachweis für "heller Mandant bleibt
 * unverändert" (AC3): identische Bedingungen vor und nach dem Fix.
 */
const hell = {};

// ── Gegenprobe: der Stand VOR dem Fix bleibt nachweislich rot ────────────────
// Abbild der zwei betroffenen Blöcke, wie sie bis blitzsicht-ops#817 in
// VergleichsTabelle.astro standen (unconditional `white`, kein Token).
const kaputterStand = `
  .vergleich-table {
    width: 100%;
    border-collapse: collapse;
    background: white;
    font-size: 0.95rem;
  }
  .vergleich-table thead th {
    background: var(--color-primary, #1d1e3b);
    color: white;
    font-weight: 600;
    white-space: nowrap;
  }
  .col-brand-header {
    background: var(--color-accent, #ef7612) !important;
    color: var(--color-accent-btn-text, #1d1e3b) !important;
  }
  .col-brand {
    font-weight: 600;
    color: var(--color-primary, #1d1e3b);
  }
  .cell-win {
    color: var(--color-accent-text, #92400e);
  }
  .col-other {
    color: var(--color-muted, #6b7280);
  }
`;

test('GEGENPROBE: kaputter Stand (vor #817) meldet exakt die im Vorfall gemessenen Werte', () => {
  const { zellen, alleBestehen } = pruefeVergleichstabelle(kaputterStand, dunkel);
  const nach = Object.fromEntries(zellen.map((z) => [z.id, z.ratio]));
  assert.equal(nach.zeilenlabel, 1.07, 'Zeilenlabel #F7F7F2 auf #FFFFFF — dokumentiert 1,07');
  assert.equal(nach.markenspalte, 1.26, 'Markenspalte #04FFF7 auf #FFFFFF — dokumentiert 1,26');
  assert.equal(nach['wettbewerberspalte'], 3.06, 'Wettbewerberspalte #8E949B auf #FFFFFF — dokumentiert 3,06');
  assert.equal(alleBestehen, false, 'ein Wächter, der hier gruen meldet, ist kein Nachweis');
});

test('GEGENPROBE: heller Token-Satz war auch vor dem Fix schon gruen (kein falscher Alarm)', () => {
  // Zeigt, dass die Gegenprobe wirklich am dunklen Token-Satz haengt und nicht
  // grundsaetzlich jede Eingabe rot meldet.
  const { alleBestehen } = pruefeVergleichstabelle(kaputterStand, hell);
  assert.equal(alleBestehen, true);
});

// ── Lebende Absicherung: die ECHTE Datei, nach dem Fix ───────────────────────

test('dunkler Token-Satz: JEDE Textzelle der echten Datei besteht mit >= 4.5', () => {
  const css = leseStyleBlock(QUELLE);
  const { zellen, nichtRechenbar, alleBestehen } = pruefeVergleichstabelle(css, dunkel);
  assert.deepEqual(nichtRechenbar, [], 'jede Zelle muss rechenbar sein');
  for (const z of zellen) {
    assert.ok(z.ratio !== null && z.ratio >= 4.5, `${z.id}: ${z.ratio} < 4.5 (${z.fg} auf ${z.bg})`);
  }
  assert.equal(alleBestehen, true);
  // Die drei ursprünglich gemeldeten Zellen namentlich, damit ein Diff genau
  // zeigt, welche der historischen Zellen betroffen waere.
  const nach = Object.fromEntries(zellen.map((z) => [z.id, z.ratio]));
  assert.ok(nach.zeilenlabel >= 4.5);
  assert.ok(nach.markenspalte >= 4.5);
  assert.ok(nach.wettbewerberspalte >= 4.5);
});

test('heller Token-Satz (reine Fallback-Kette): JEDE Textzelle besteht, Markenspalte-Header exakt wie im Dateikommentar', () => {
  const css = leseStyleBlock(QUELLE);
  const { zellen, nichtRechenbar, alleBestehen } = pruefeVergleichstabelle(css, hell);
  assert.deepEqual(nichtRechenbar, []);
  for (const z of zellen) {
    assert.ok(z.ratio !== null && z.ratio >= 4.5, `${z.id}: ${z.ratio} < 4.5 (${z.fg} auf ${z.bg})`);
  }
  assert.equal(alleBestehen, true);
  const theadMarke = zellen.find((z) => z.id === 'thead-marke');
  // Dateikommentar über `.col-brand-header`: "blitzsicht #EF7612 weiss 2,89 ✗
  // → #1D1E3B 5,59 ✓". Die Fallback-Kette (#ef7612 / #1d1e3b) IST blitzsichts
  // realer Wert — deshalb hier exakt 5.59, nicht nur ">= 4.5".
  assert.equal(theadMarke?.ratio, 5.59);
});

test('helle Fallback-Kette bleibt unveraendert: Flaeche und Kopf-Text sind exakt die alten Hardcodes', () => {
  const css = leseStyleBlock(QUELLE);
  const tischBlock = block(css, '.vergleich-table');
  const theadBlock = block(css, '.vergleich-table thead th');
  assert.equal(loese(eigenschaft(tischBlock, 'background'), {}), '#ffffff');
  assert.equal(loese(eigenschaft(theadBlock, 'color'), {}), '#ffffff');
});

// ── Die Helfer für sich ───────────────────────────────────────────────────────

test('block: findet einen einfachen Selektor, nicht dessen Praefix-Verwandte', () => {
  const css = '.a { color: red; }\n.a-b { color: blue; }';
  assert.equal(eigenschaft(block(css, '.a'), 'color'), 'red');
  assert.equal(eigenschaft(block(css, '.a-b'), 'color'), 'blue');
});

test('block: unbekannter Selektor liefert null, keinen falschen Treffer', () => {
  assert.equal(block('.a { color: red; }', '.b'), null);
});

test('loese: Literal ohne var() wird nur normalisiert', () => {
  assert.equal(loese('white', {}), '#ffffff');
  assert.equal(loese('#ABC', {}), '#aabbcc');
});

test('loese: var() ohne gesetzten Token faellt auf den Fallback aus dem Text zurueck', () => {
  assert.equal(loese('var(--fehlt, #123456)', {}), '#123456');
});

test('loese: var() mit gesetztem Token gewinnt gegen den Fallback', () => {
  assert.equal(loese('var(--color-primary, #1d1e3b)', { 'color-primary': '#04FFF7' }), '#04fff7');
});

test('loese: var() ohne Fallback und ohne gesetzten Token ist nicht rechenbar', () => {
  assert.equal(loese('var(--color-hero-gradient-end)', {}), null);
});

test('loese: !important am Ende stoert das Parsen nicht', () => {
  assert.equal(loese('var(--color-accent, #ef7612) !important', {}), '#ef7612');
});

test('nicht rechenbar wird gemeldet statt eine Zahl zu erfinden', () => {
  const css = '.vergleich-table thead th { background: color-mix(in srgb, red, blue); }';
  const { nichtRechenbar, alleBestehen } = pruefeVergleichstabelle(css, {});
  assert.ok(nichtRechenbar.length > 0);
  assert.equal(alleBestehen, false);
});
