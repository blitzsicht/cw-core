// @ts-check
/**
 * Tests für die KI-Offenlegung im Alt-Text der Vorschaubilder (Art. 50 Abs. 4/5 AI Act).
 *
 * Lauf: `node --test tests/utils/og-alt.test.js`
 * Oder über Skript: `pnpm test`
 *
 * Der Ablageort ist nicht beliebig: `pnpm test` fährt `tests/**\/*.test.js`,
 * `scripts/**\/*.test.mjs`, `src/og/**\/*.test.mjs` und `src/integrations/**\/*.test.mjs`.
 * Ein Test neben dem Modul unter `src/utils/` liefe **nie** — und ein Wächter, der nicht
 * läuft, ist keiner.
 *
 * Abdeckung:
 *   1. Ohne Pflicht bleibt der Text unangetastet (Trennschärfe — der wichtigste Fall)
 *   2. Mit Pflicht kommt der Wortlaut ans Ende, je Herkunft der richtige
 *   3. Leere Basis → nur der Wortlaut, nie ein führender Trenner
 *   4. Zu lang → die Beschreibung wird gekappt, die Offenlegung nie
 *   5. `ohneOffenlegung` ist die Umkehrung — und macht das Anhängen idempotent
 *   6. Ein Text, der zufällig auf den Wortlaut endet, verliert ihn nicht
 *   7. Der Wortlaut kommt aus `bildherkunft.js` und wird hier nicht zweitgeschrieben
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { altMitOffenlegung, ohneOffenlegung, MAX_ALT_LAENGE } from '../../src/utils/og-alt.js';
import { OFFENLEGUNG_TEXT } from '../../src/utils/bildherkunft.js';

const ERZEUGT = { herkunft: 'ki-erzeugt' };
const VERAENDERT = { herkunft: 'ki-veraendert' };

// ---------------------------------------------------------------------------
// 1. Ohne Pflicht: nichts anhängen
// ---------------------------------------------------------------------------
// Der Kontrollzweig. Ohne ihn prüfte alles Weitere nur, dass der Code etwas anhängt —
// nicht, dass er es an der richtigen Stelle unterlässt. Ein Label auf einem menschlichen
// Foto ist nicht bloss überflüssig, es entwertet das Label dort, wo es Pflicht ist.

test('ohne Pflicht bleibt der Alt-Text unverändert', () => {
  assert.equal(altMitOffenlegung('Werkstatt in Regensburg', null, false), 'Werkstatt in Regensburg');
});

test('ohne Pflicht wird auch bei gesetzter KI-Herkunft nichts angehängt', () => {
  // ki-erzeugt + deepfake:'nein' ist der häufigste Fall der Flotte — die Herkunft ist
  // geklärt, die Pflicht besteht trotzdem nicht (Art. 3 Nr. 60, zweites Merkmal).
  assert.equal(altMitOffenlegung('Eine Illustration', ERZEUGT, false), 'Eine Illustration');
});

// ---------------------------------------------------------------------------
// 2. Mit Pflicht: der richtige Wortlaut
// ---------------------------------------------------------------------------

test('mit Pflicht steht die Offenlegung am Ende', () => {
  assert.equal(
    altMitOffenlegung('Das Team vor der Halle', ERZEUGT, true),
    'Das Team vor der Halle — Mit KI erzeugt',
  );
});

test('ki-veraendert bekommt den bearbeitet-Wortlaut', () => {
  assert.equal(
    altMitOffenlegung('Portrait der Inhaberin', VERAENDERT, true),
    'Portrait der Inhaberin — Mit KI bearbeitet',
  );
});

test('ohne verwertbare Herkunft gilt der erzeugt-Wortlaut', () => {
  // Wer die Pflicht bejaht, aber keine Herkunft mitgibt, bekommt die weiter reichende
  // der beiden Aussagen — nicht gar keine.
  assert.equal(altMitOffenlegung('Motiv', null, true), 'Motiv — Mit KI erzeugt');
  assert.equal(altMitOffenlegung('Motiv', {}, true), 'Motiv — Mit KI erzeugt');
});

// ---------------------------------------------------------------------------
// 3. Leere Basis
// ---------------------------------------------------------------------------

test('ohne Basis steht nur der Wortlaut da, ohne führenden Trenner', () => {
  assert.equal(altMitOffenlegung('', ERZEUGT, true), 'Mit KI erzeugt');
  assert.equal(altMitOffenlegung(/** @type {any} */ (undefined), VERAENDERT, true), 'Mit KI bearbeitet');
});

// ---------------------------------------------------------------------------
// 4. Kürzung: die Beschreibung weicht, die Offenlegung bleibt
// ---------------------------------------------------------------------------
// Fiele beim Kürzen die Offenlegung weg, verlöre die Zeile genau das, wofür sie da ist.

test('zu langer Text wird gekappt, die Offenlegung überlebt', () => {
  const lang = 'a'.repeat(MAX_ALT_LAENGE);
  const ergebnis = altMitOffenlegung(lang, ERZEUGT, true);

  assert.ok(ergebnis.length <= MAX_ALT_LAENGE, `${ergebnis.length} Zeichen — über der Grenze`);
  assert.ok(ergebnis.endsWith('— Mit KI erzeugt'), 'die Offenlegung fehlt am Ende');
  assert.ok(ergebnis.includes('…'), 'die Kürzung ist nicht als solche erkennbar');
});

test('bei absurd kleiner Grenze bleibt der Wortlaut allein stehen', () => {
  assert.equal(altMitOffenlegung('Eine lange Beschreibung', ERZEUGT, true, 12), 'Mit KI erzeugt');
});

test('Gegenprobe zur Kürzung: knapp unter der Grenze wird nichts gekappt', () => {
  // Ohne diesen Fall wüsste man nur, dass gekappt wird — nicht, dass es an der
  // richtigen Schwelle beginnt.
  const suffix = ' — Mit KI erzeugt';
  const gerade = 'b'.repeat(MAX_ALT_LAENGE - suffix.length);
  assert.equal(altMitOffenlegung(gerade, ERZEUGT, true), gerade + suffix);
});

// ---------------------------------------------------------------------------
// 5. ohneOffenlegung — die Umkehrung
// ---------------------------------------------------------------------------

test('ohneOffenlegung nimmt zurück, was altMitOffenlegung anhängt', () => {
  for (const ergebnis of [ERZEUGT, VERAENDERT]) {
    const basis = 'Halle von aussen';
    assert.equal(ohneOffenlegung(altMitOffenlegung(basis, ergebnis, true)), basis);
  }
});

test('ohneOffenlegung auf einem Text ohne Offenlegung ändert nichts', () => {
  assert.equal(ohneOffenlegung('Halle von aussen'), 'Halle von aussen');
  assert.equal(ohneOffenlegung(''), '');
  assert.equal(ohneOffenlegung(/** @type {any} */ (null)), '');
});

test('ein Text, der NUR aus dem Wortlaut besteht, wird leer', () => {
  // So gibt altMitOffenlegung() ihn bei leerer Basis aus — die Umkehrung muss dorthin
  // zurückfinden, sonst wüchse die Zeile bei jedem Lauf um einen Trenner.
  assert.equal(ohneOffenlegung('Mit KI erzeugt'), '');
  assert.equal(ohneOffenlegung('Mit KI bearbeitet'), '');
});

test('ein doppelt gestempelter Bestand wird in einem Durchgang sauber', () => {
  assert.equal(
    ohneOffenlegung('Motiv — Mit KI erzeugt — Mit KI erzeugt'),
    'Motiv',
  );
});

test('das Anhängen ist idempotent, wenn vorher abgestreift wird', () => {
  // Genau der Ablauf in og-pages.js: der zweite Lauf über dasselbe dist/ darf nicht
  // doppelt stempeln.
  const einmal = altMitOffenlegung('Motiv', ERZEUGT, true);
  const zweimal = altMitOffenlegung(ohneOffenlegung(einmal), ERZEUGT, true);
  assert.equal(zweimal, einmal);
});

// ---------------------------------------------------------------------------
// 6. Kein Kollateralschaden an normalem Text
// ---------------------------------------------------------------------------

test('ein Text, der zufällig auf den Wortlaut endet, verliert ihn nicht', () => {
  // Ohne den erforderlichen Trenner würde hier still ein Satzstück verschwinden.
  const satz = 'Dieses Bild wurde nicht Mit KI erzeugt';
  assert.equal(ohneOffenlegung(satz), satz);
});

// ---------------------------------------------------------------------------
// 7. Eine Wahrheit für den Wortlaut
// ---------------------------------------------------------------------------

test('der Wortlaut stammt aus bildherkunft.js und ist hier nicht zweitgeschrieben', () => {
  // Wird OFFENLEGUNG_TEXT dort geändert, muss dieser Test die Änderung mitmachen —
  // und nicht gegen eine eingefrorene Kopie laufen.
  assert.ok(
    altMitOffenlegung('x', ERZEUGT, true).endsWith(OFFENLEGUNG_TEXT['ki-erzeugt']),
    'og-alt.js führt einen eigenen Wortlaut statt den aus bildherkunft.js',
  );
  assert.ok(
    altMitOffenlegung('x', VERAENDERT, true).endsWith(OFFENLEGUNG_TEXT['ki-veraendert']),
  );
});
