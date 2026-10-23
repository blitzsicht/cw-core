import test from 'node:test';
import assert from 'node:assert/strict';
import {
  erkenneRechtsform,
  pruefeCopyrightZeile,
  pruefeSeite,
  REGISTER_RECHTSFORMEN,
} from './footer-rechtsform-check.js';

// 1 — der echte Fundfall: Geschäftsführer mit angehängter Rechtsform
test('meldet die Rechtsform als eigenes Segment (Fundfall spedition-steller)', () => {
  const b = pruefeCopyrightZeile('© 2026 Ralf Steller · GmbH · Langquaid');
  assert.ok(b, 'muss melden');
  assert.equal(b.rechtsform, 'GmbH');
  assert.equal(b.traeger, 'Ralf Steller');
});

// 2 — GEGENPROBE zu 1: dieselbe Zeile, Rechtsform in der Firma → still
test('meldet nicht, wenn die Firma die Rechtsform selbst trägt', () => {
  assert.equal(pruefeCopyrightZeile('© 2026 Ralf Steller Spedition GmbH · Langquaid'), null);
});

// 3 — Überempfindlichkeit: der cw-core-Default darf nicht melden
test('Einzelunternehmen ist kein Firmenbestandteil und meldet nicht', () => {
  assert.equal(pruefeCopyrightZeile('© 2026 Max Mustermann · Einzelunternehmen · Regensburg'), null);
  assert.equal(pruefeCopyrightZeile('© 2026 Anna Beispiel · Freiberufler · Kelheim'), null);
});

// 4 — mehrteilige Rechtsform wird nicht als „KG" zerlegt
test('GmbH & Co. KG: in der Firma still, daneben gemeldet', () => {
  assert.equal(pruefeCopyrightZeile('© 2026 Alte Linde GmbH & Co. KG · Regensburg'), null);
  const b = pruefeCopyrightZeile('© 2026 Alte Linde · GmbH & Co. KG · Regensburg');
  assert.ok(b);
  assert.equal(b.rechtsform, 'GmbH & Co. KG');
});

// 5 — verkürzte Marke mit angehängter Rechtsform (der Flotten-Fall)
test('meldet die verkürzte Marke mit danebenstehender Rechtsform', () => {
  const b = pruefeCopyrightZeile('© 2026 Donau-Profi · GmbH · Regensburg');
  assert.ok(b);
  assert.equal(b.traeger, 'Donau-Profi');
});

// 6 — Zeilen ohne Copyright oder ohne Trenner
test('ignoriert Zeilen ohne © und ohne zweites Segment', () => {
  assert.equal(pruefeCopyrightZeile('Impressum · Datenschutz'), null);
  assert.equal(pruefeCopyrightZeile('© 2026 Ralf Steller Spedition GmbH'), null);
});

// 7 — Jahresspanne
test('erkennt die Jahresspanne', () => {
  const b = pruefeCopyrightZeile('© 2024–2026 Ralf Steller · GmbH · Langquaid');
  assert.ok(b);
  assert.equal(b.rechtsform, 'GmbH');
});

// 8 — Ende-zu-Ende über echtes Markup inkl. Entity
test('findet die Zeile im gebauten HTML', () => {
  const html = `<footer><p data-astro-cid-popfuzrq>© 2026 Ralf Steller &middot; GmbH &middot; Langquaid</p></footer>`;
  const r = pruefeSeite(html);
  assert.equal(r.gefunden, 1);
  assert.equal(r.befunde.length, 1);
  assert.equal(r.befunde[0].rechtsform, 'GmbH');
});

// 9 — GEGENPROBE zu 8: dieselbe Seite, korrigierte Firmierung
test('dieselbe Seite mit korrekter Firmierung ist still', () => {
  const html = `<footer><p data-astro-cid-popfuzrq>© 2026 Ralf Steller Spedition GmbH &middot; Langquaid</p></footer>`;
  const r = pruefeSeite(html);
  assert.equal(r.gefunden, 1, 'die Zeile wird gefunden');
  assert.equal(r.befunde.length, 0, 'aber nicht gemeldet');
});

// 10 — Seite ohne Copyright-Zeile: unprüfbar, nicht grün
test('Seite ohne Copyright-Zeile liefert gefunden = 0', () => {
  const r = pruefeSeite('<footer><p>Impressum</p></footer>');
  assert.equal(r.gefunden, 0);
  assert.equal(r.befunde.length, 0);
});

// 11 — die Liste selbst: ohne sie kann Test 1 nicht melden (Sabotage-Anker)
test('die Rechtsformliste ist nicht leer und enthält die Langformen vor den Kurzformen', () => {
  assert.ok(REGISTER_RECHTSFORMEN.length > 0);
  assert.ok(erkenneRechtsform('GmbH & Co. KG'));
  assert.equal(erkenneRechtsform('Spedition'), null);
});
