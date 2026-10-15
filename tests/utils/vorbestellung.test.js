// @ts-check
/**
 * Logik der Vorbestellung (src/utils/vorbestellung.js): Preise, Summe, Abholzeiten,
 * Bestelltext, Sortierung der Küchenliste, Tagesnummer.
 *
 * Lauf: `node --test tests/utils/vorbestellung.test.js`
 *
 * ANLASS (15.10.2026): customer-brotzeithaeusl, Imbiss mit telefonischer Vorbestellung.
 * Der Gast stellt die Bestellung auf der Website zusammen, sie geht als fertige
 * WhatsApp-Nachricht an den Laden und steht zusätzlich in einer Tagesliste der Küche.
 * Die Rechenregeln liegen hier, damit Block, Küchenansicht und späterer Server-Handler
 * dieselben Zahlen und denselben Text erzeugen.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  preisCent,
  euro,
  summeCent,
  abholtage,
  bestellText,
  sortiereBestellungen,
  naechsteNummer,
} from '../../src/utils/vorbestellung.js';

// Imbiss Mo–Fr 8–15 Uhr (Brotzeithäusl). Do 15.10.2026; Fr 16.10. laut Monatskarte geschlossen.
const OEFFNUNG = { tage: [1, 2, 3, 4, 5], von: '08:00', bis: '15:00' };
const lokal = (/** @type {number[]} */ ...t) => new Date(t[0], t[1] - 1, t[2], t[3] ?? 0, t[4] ?? 0);

test('preisCent: deutsche Schreibweise mit und ohne Euro-Zeichen', () => {
  assert.equal(preisCent('9,90'), 990);
  assert.equal(preisCent('14,90 €'), 1490);
  assert.equal(preisCent('0,80 €'), 80);
  assert.equal(preisCent('12'), 1200);
});

test('preisCent: Unlesbares wirft, statt still 0 € zu bestellen', () => {
  assert.throws(() => preisCent(''), /Preis/);
  assert.throws(() => preisCent('Preis folgt'), /Preis/);
  assert.throws(() => preisCent('ab 3,20 €'), /Preis/); // „ab“-Preise sind nicht bestellbar
});

test('euro und summeCent: Menge mal Preis, Cent-genau', () => {
  assert.equal(euro(1630), '16,30 €');
  assert.equal(euro(80), '0,80 €');
  const summe = summeCent([
    { menge: 1, preisCent: 990 },
    { menge: 2, preisCent: 320 },
    { menge: 0, preisCent: 1490 },
  ]);
  assert.equal(summe, 1630);
});

test('abholtage: vormittags heute ab jetzt + Vorlauf, auf 15 Minuten gerundet', () => {
  const tage = abholtage({ jetzt: lokal(2026, 10, 15, 10, 7), ...OEFFNUNG, vorlaufMinuten: 20 });
  assert.equal(tage[0].datum, '2026-10-15');
  assert.equal(tage[0].label, 'Heute');
  assert.equal(tage[0].zeiten[0], '10:30'); // 10:07 + 20 = 10:27 → 10:30
  assert.equal(tage[0].zeiten.at(-1), '14:45'); // letzte Abholung vor Ladenschluss
});

test('abholtage: vor Öffnung beginnt der Tag mit der Öffnungszeit', () => {
  const tage = abholtage({ jetzt: lokal(2026, 10, 15, 6, 0), ...OEFFNUNG });
  assert.equal(tage[0].zeiten[0], '08:00');
});

test('abholtage: nach Ladenschluss kein „Heute“, sondern der nächste offene Tag', () => {
  const tage = abholtage({ jetzt: lokal(2026, 10, 15, 16, 0), ...OEFFNUNG, anzahl: 1 });
  assert.equal(tage.length, 1);
  assert.equal(tage[0].datum, '2026-10-16');
  assert.equal(tage[0].label, 'Morgen');
  assert.equal(tage[0].zeiten[0], '08:00');
});

test('abholtage: geschlossene Tage und Wochenende werden übersprungen (Negativtest)', () => {
  // Do 15.10. abends → Fr 16.10. geschlossen (Monatskarte) → Sa/So zu → Mo 19.10.
  const tage = abholtage({
    jetzt: lokal(2026, 10, 15, 18, 0),
    ...OEFFNUNG,
    geschlossen: ['2026-10-16'],
    anzahl: 2,
  });
  assert.deepEqual(tage.map((t) => t.datum), ['2026-10-19', '2026-10-20']);
  assert.equal(tage[0].label, 'Mo 19.10.');
});

test('abholtage: ohne offene Tage leere Liste, kein Endlos-Suchen', () => {
  const tage = abholtage({ jetzt: lokal(2026, 10, 15, 9, 0), tage: [], von: '08:00', bis: '15:00' });
  assert.deepEqual(tage, []);
});

test('bestellText: Nummer, Tag, Uhrzeit, Positionen, Summe, Name, Bezahlhinweis', () => {
  const text = bestellText({
    nummer: 17,
    tagLabel: 'Heute',
    datum: '2026-10-15',
    zeit: '12:15',
    positionen: [
      { name: 'Ente mit Gemüse süß-sauer und Reis', menge: 1, preisCent: 990 },
      { name: '5 Mini-Frühlingsrollen mit süß-saurer Soße', menge: 2, preisCent: 320 },
    ],
    name: '  Maier ',
    hinweis: 'ohne Zwiebeln',
  });
  const zeilen = text.split('\n');
  assert.equal(zeilen[0], 'Bestellung #17 zum Abholen');
  assert.equal(zeilen[1], 'Heute (15.10.), 12:15 Uhr');
  assert.ok(text.includes('1× Ente mit Gemüse süß-sauer und Reis (9,90 €)'));
  assert.ok(text.includes('2× 5 Mini-Frühlingsrollen mit süß-saurer Soße (je 3,20 €)'));
  assert.ok(text.includes('Summe: 16,30 €'));
  assert.ok(text.includes('Name: Maier'));
  assert.ok(text.includes('Hinweis: ohne Zwiebeln'));
  assert.equal(zeilen.at(-1), 'Bezahlt wird bei Abholung.');
});

test('bestellText: Positionen mit Menge 0 fallen weg, leerer Hinweis erzeugt keine Zeile', () => {
  const text = bestellText({
    nummer: 3,
    tagLabel: 'Mo 19.10.',
    datum: '2026-10-19',
    zeit: '11:30',
    positionen: [
      { name: 'Portion Reis', menge: 0, preisCent: 320 },
      { name: 'Schnitzelsemmel', menge: 1, preisCent: 490 },
    ],
    name: 'Huber',
    hinweis: '   ',
  });
  assert.ok(!text.includes('Portion Reis'));
  assert.ok(!text.includes('Hinweis:'));
  assert.equal(text.split('\n')[1], 'Mo 19.10., 11:30 Uhr');
});

test('bestellText: ohne Position oder ohne Name wirft (keine leere Bestellung)', () => {
  const basis = { nummer: 1, tagLabel: 'Heute', datum: '2026-10-15', zeit: '12:00', hinweis: '' };
  assert.throws(() => bestellText({ ...basis, positionen: [], name: 'Maier' }), /Position/);
  assert.throws(
    () => bestellText({ ...basis, positionen: [{ name: 'Semmel', menge: 1, preisCent: 80 }], name: ' ' }),
    /Name/,
  );
});

test('sortiereBestellungen: nach Datum, dann Abholzeit, dann Nummer; Eingabe bleibt unverändert', () => {
  const liste = [
    { nummer: 3, datum: '2026-10-15', zeit: '12:30' },
    { nummer: 1, datum: '2026-10-16', zeit: '08:00' },
    { nummer: 2, datum: '2026-10-15', zeit: '11:45' },
    { nummer: 4, datum: '2026-10-15', zeit: '11:45' },
  ];
  const kopie = JSON.stringify(liste);
  assert.deepEqual(sortiereBestellungen(liste).map((b) => b.nummer), [2, 4, 3, 1]);
  assert.equal(JSON.stringify(liste), kopie);
});

test('naechsteNummer: zählt je Tag hoch und beginnt am neuen Tag bei 1', () => {
  let s = naechsteNummer(undefined, '2026-10-15');
  assert.equal(s.nummer, 1);
  s = naechsteNummer(s.stand, '2026-10-15');
  assert.equal(s.nummer, 2);
  s = naechsteNummer(s.stand, '2026-10-19');
  assert.equal(s.nummer, 1);
  assert.deepEqual(s.stand, { datum: '2026-10-19', zaehler: 1 });
});
