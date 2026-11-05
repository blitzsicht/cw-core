// @ts-check
/**
 * Tests für `bildherkunft-verlust` — was ein Generatorlauf wegwirft.
 *
 * Lauf: `node --test scripts/lib/bildherkunft-verlust.test.mjs`
 *
 * Der Auslöser ist ein Schaden, der nie eingetreten ist und beim ersten Eintreten nicht
 * auffällt: `bildherkunft-übernehmen.mjs` schreibt `src/data/bild-herkunft.ts` mit
 * `writeFileSync`, ohne sie vorher zu lesen. Gemessen am 05.11.2026 trägt die Datei in
 * customer-blitzsicht 108 Regeln, die Quelle des Generators kennt 38 — ein Lauf hätte 72
 * Rechtsaussagen gelöscht. Eine gelöschte Art.-50-Einstufung macht keinen Build rot und
 * keinen Test; sie fällt erst auf, wenn jemand nach dem Nachweis fragt.
 *
 * Zwei Fehlerrichtungen, bewusst ungleich gewichtet:
 *
 * - **Verlust übersehen** (zu wenig melden) ist der teure Fehler. Dagegen stehen Test 1
 *   mit einem Zählwert statt „> 0" und Test 6, der eine unbekannte Zeilenform laut
 *   abbrechen lässt, statt sie zu überspringen.
 * - **Fehlalarm** (zu viel melden) ist billig, aber nicht harmlos: wer den Guard mit fünf
 *   falschen Verlusten kennenlernt, schaltet ihn beim sechsten Lauf ab. Dagegen stehen
 *   Test 2, 4 und 5.
 *
 * Abdeckung:
 *   1. Der echte Fall: 108 Regeln gegen 38 Quell-Einträge → genau 72 verloren
 *   2. Gegenprobe zu 1: deckungsgleiche Mengen → 0 verloren (der Guard kann grün werden)
 *   3. Eine Regel für ein gelöschtes Bild erscheint als `neuAngelegt`
 *   4. `stem: 'x'` und `…/x.webp` sind dasselbe Bild — kein Verlust
 *   5. Erstlauf (keine Datei) → 0 verloren, der Guard blockiert keinen Neukunden
 *   6. Unbekannte Zeilenform wirft, statt still zu überspringen
 *   7. Die Asymmetrie: ein Stem deckt jeden Pfad, ein Pfad deckt keinen fremden Pfad
 *   8. Apostroph im Pfad kommt unverfälscht zurück (Umkehrung von `alsLiteral`)
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  verlustVergleich,
  schluesselAusZeile,
  schluesselListe,
  stammVonPfad,
} from './bildherkunft-verlust.mjs';
import { regelZeile } from '../bildherkunft-arbeitsliste.mjs';

const HIER = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(HIER, '..', 'fixtures', 'bild-herkunft-blitzsicht.txt');

/**
 * Die 38 Bilder, die `scripts/bildherkunft-vorschlaege.json` für blitzsicht kennt
 * (Stand 24.08.2026 — seit #111/#113/#127/#155 nicht gepflegt, und genau das ist das
 * Problem). Fest hier und nicht aus der JSON gelesen: die Zahl 72 soll eine Eigenschaft
 * dieser Probe sein, nicht des Repos. Sonst färbt eine Pflege der Vorschlagsdatei diesen
 * Test rot, ohne dass am Vergleich etwas falsch wäre.
 */
const QUELLE_38 = [
  'images/agentic/agentic-browsing-og.webp',
  'images/agentic/agentic-browsing.webp',
  'images/blog/og-images-og.png',
  'images/blog/og-images-og.webp',
  'images/hero/b2b-dienstleister.webp',
  'images/hero/dachdecker.webp',
  'images/hero/elektriker.webp',
  'images/hero/elementor-agentur-regensburg.webp',
  'images/hero/handwerker-maler.webp',
  'images/hero/handwerker-sanitaer.webp',
  'images/hero/jimdo-alternative.webp',
  'images/hero/jimdo-vs-wix.webp',
  'images/hero/originals/craftsman-laptop.webp',
  'images/hero/pakete.webp',
  'images/hero/performance-speed.webp',
  'images/hero/referenzen.webp',
  'images/hero/regensburg-abend.webp',
  'images/hero/schreiner.webp',
  'images/hero/so-funktionierts.webp',
  'images/hero/webdesign-regensburg.webp',
  'images/hero/website-anforderungen-datenschutz.webp',
  'images/hero/website-anforderungen-handy.webp',
  'images/hero/website-anforderungen-sicherheit.webp',
  'images/hero/website-anforderungen.webp',
  'images/hero/website-audit.webp',
  'images/hero/website-handwerker.webp',
  'images/hero/website-speed-regensburg.webp',
  'images/hero/wix-alternative.webp',
  'images/team/johannes-og.webp',
  'images/team/johannes.webp',
  'lead-mail/logo-white.png',
  'logo.png',
  'logo.webp',
  'src/assets/images/craftsman-laptop.webp',
  'src/assets/images/dfy-illustration.webp',
  'src/assets/images/handwerker-hero.webp',
  'src/assets/images/johannes-portrait.webp',
  'src/assets/images/webdesign-regensburg.webp',
];

/** Eine Zeile bauen, wie der Generator sie aus einem Export bauen würde. */
const zeile = (pfad, h = 'ki-erzeugt', d = 'nein', b = 'Symbolbild ohne bestimmten Sachverhalt') =>
  pfad.startsWith('src/assets/images/')
    ? regelZeile('stem', stammVonPfad(pfad), { h, d, b })
    : regelZeile('pathPrefix', pfad, { h, d, b });

test('1. der echte Fall: 108 Regeln gegen 38 Quell-Einträge verlieren genau 72', () => {
  const bestand = readFileSync(FIXTURE, 'utf8');
  assert.equal(schluesselListe(bestand).length, 108, 'Fixture trägt nicht mehr 108 Regeln');

  const r = verlustVergleich(bestand, QUELLE_38.map((p) => zeile(p)));

  // Zählwert, nicht „> 0". Ein Guard, der die gemessene Zahl nicht reproduziert, misst
  // etwas anderes — und 36 + 72 = 108 schließt aus, dass Regeln unterwegs verschwinden.
  assert.equal(r.verloren.length, 72);
  assert.equal(r.unveraendert.length, 36);
  assert.equal(r.verloren.length + r.unveraendert.length, 108);

  // Die sechs Hero-Bilder vom 04.11.2026 sind unter den Verlorenen — sie sind der Grund,
  // aus dem dieser Guard existiert.
  for (const p of [
    'images/hero/software-schnittstelle.webp',
    'images/hero/erp-lager.webp',
    'images/hero/diagnose-workshop.webp',
    'images/hero/produkte-setzkasten.webp',
    'images/hero/websites-werkbank.webp',
    'images/hero/kontakt.webp',
  ]) {
    assert.ok(r.verloren.includes(p), `${p} müsste als verloren gemeldet werden`);
  }

  // Und die zwei Regeln für Bilder, die PR #190 gelöscht hat, kommen als neu zurück.
  assert.deepEqual(r.neuAngelegt.sort(), [
    'images/hero/jimdo-alternative.webp',
    'images/hero/pakete.webp',
  ]);
});

test('2. Gegenprobe: deckungsgleiche Mengen melden nichts', () => {
  const bestand = QUELLE_38.map((p) => zeile(p)).join('\n');
  const r = verlustVergleich(bestand, QUELLE_38.map((p) => zeile(p)));
  assert.deepEqual(r.verloren, []);
  assert.deepEqual(r.neuAngelegt, []);
  assert.equal(r.unveraendert.length, 38);
});

test('3. eine Regel für ein gelöschtes Bild erscheint als neu angelegt', () => {
  const bestand = zeile('images/hero/aktuell.webp');
  const r = verlustVergleich(bestand, [
    zeile('images/hero/aktuell.webp'),
    zeile('images/hero/jimdo-alternative.webp'),
  ]);
  assert.deepEqual(r.verloren, []);
  assert.deepEqual(r.neuAngelegt, ['images/hero/jimdo-alternative.webp']);
});

test('4. stem und Pfad bezeichnen dasselbe Bild — kein Verlust in beide Richtungen', () => {
  const alsStem = regelZeile('stem', 'johannes-portrait', { h: 'mensch' });
  const alsPfad = regelZeile('pathPrefix', 'src/assets/images/johannes-portrait.webp', { h: 'mensch' });

  assert.deepEqual(verlustVergleich(alsStem, [alsPfad]).verloren, [], 'stem → Pfad');
  assert.deepEqual(verlustVergleich(alsPfad, [alsStem]).verloren, [], 'Pfad → stem');

  // Auch über ein anderes Verzeichnis: der Stem adressiert den Dateinamen, nicht den Ort.
  const woanders = regelZeile('pathPrefix', 'images/hero/originals/craftsman-laptop.webp', { h: 'mensch' });
  const stemDavon = regelZeile('stem', 'craftsman-laptop', { h: 'mensch' });
  assert.deepEqual(verlustVergleich(stemDavon, [woanders]).verloren, []);
});

test('5. Erstlauf ohne bestehende Datei verliert nichts', () => {
  for (const leer of ['', null, undefined]) {
    const r = verlustVergleich(/** @type {any} */ (leer), [zeile('images/hero/neu.webp')]);
    assert.deepEqual(r.verloren, []);
    assert.deepEqual(r.neuAngelegt, ['images/hero/neu.webp']);
  }
});

test('6. eine unbekannte Zeilenform wirft, statt sie zu überspringen', () => {
  // Erstes Feld ist nicht der Schlüssel — Zeilenform, die regelZeile nicht baut, die aber
  // von Hand entstehen kann. Still übersprungen wäre die Regel „nicht vorhanden", ihr
  // Verlust gälte als harmlos, und der Guard wäre genau dort blind, wo er schützen soll.
  const krumm = "  { herkunft: 'mensch', pathPrefix: 'images/hero/von-hand.webp' },";
  assert.throws(() => schluesselListe(krumm), /ohne erkennbaren Schlüssel/);

  // Gegenprobe: eine Zeile, die NICHT wie eine Regel aussieht, darf nicht werfen —
  // sonst scheiterte der Guard am Kopfkommentar jeder Datei.
  assert.deepEqual(schluesselListe('// Kommentar\nimport type { X } from \'y\';\n];'), []);
});

test('7. die Asymmetrie: ein Stem deckt jeden Pfad, ein Pfad keinen fremden', () => {
  const pfadA = regelZeile('pathPrefix', 'images/hero/logo.webp', { h: 'mensch' });
  const pfadB = regelZeile('pathPrefix', 'images/partner/logo.webp', { h: 'mensch' });

  // Gleicher Dateiname, anderer Ort: pathPrefix ist ein Präfix-Match, kein Namensmatch.
  // Würde der Vergleich hier Deckung behaupten, verschwiege er einen echten Verlust.
  assert.deepEqual(verlustVergleich(pfadA, [pfadB]).verloren, ['images/hero/logo.webp']);

  // Derselbe Fall mit einem Stem auf der neuen Seite: jetzt ist er gedeckt.
  assert.deepEqual(verlustVergleich(pfadA, [regelZeile('stem', 'logo', { h: 'mensch' })]).verloren, []);
});

test('8. ein Apostroph im Pfad kommt unverfälscht zurück', () => {
  const z = regelZeile('pathPrefix', "images/hero/o'brien.webp", { h: 'mensch' });
  assert.deepEqual(schluesselAusZeile(z), { art: 'pathPrefix', wert: "images/hero/o'brien.webp" });
  // Und er zählt als dieselbe Adresse, nicht als zwei.
  assert.deepEqual(verlustVergleich(z, [z]).verloren, []);
});
