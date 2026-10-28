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
test('die Rechtsformliste trägt mehrteilige Formen als Ganzes, Branchenwörter nicht', () => {
  assert.ok(REGISTER_RECHTSFORMEN.length > 0);
  assert.ok(erkenneRechtsform('GmbH & Co. KG'));
  assert.equal(erkenneRechtsform('Spedition'), null);
});

// ─── Langformen und Klammerzusätze (28.10.2026, Fundfall allstargirls) ───────────

// 12 — der echte Fundfall: der Guard lief, fand die Zeile und meldete „✓ sauber“.
//      allstargirls.de lieferte sie am 28.10.2026 so aus.
test('meldet die ausgeschriebene Langform (Fundfall allstargirls)', () => {
  const b = pruefeCopyrightZeile('© 2026 ALL STAR GIRLS Regensburg e.V. · Eingetragener Verein (e.V.)');
  assert.ok(b, 'muss melden');
  assert.equal(b.rechtsform, 'Eingetragener Verein (e.V.)');
  assert.equal(b.traeger, 'ALL STAR GIRLS Regensburg e.V.');
});

// 13 — GEGENPROBE zu 12: dieselbe Firma, Rechtsform nur noch in der Firma → still
test('derselbe Verein ohne eigenes Rechtsform-Segment ist still', () => {
  assert.equal(pruefeCopyrightZeile('© 2026 ALL STAR GIRLS Regensburg e.V.'), null);
  const r = pruefeSeite('<footer><p>© 2026 ALL STAR GIRLS Regensburg e.V. &middot; Sinzing</p></footer>');
  assert.equal(r.gefunden, 1, 'die Zeile wird gefunden');
  assert.equal(r.befunde.length, 0, 'aber nicht gemeldet');
});

// 14 — weitere Langformen, je mit Gegenprobe in der Firma
test('weitere ausgeschriebene Rechtsformen melden daneben, nicht in der Firma', () => {
  for (const form of [
    'Gesellschaft mit beschränkter Haftung',
    'Aktiengesellschaft',
    'Offene Handelsgesellschaft',
    'Eingetragene Genossenschaft',
  ]) {
    const b = pruefeCopyrightZeile(`© 2026 Musterbetrieb · ${form} · Regensburg`);
    assert.ok(b, `${form} muss melden`);
    assert.equal(b.rechtsform, form);
    assert.equal(
      pruefeCopyrightZeile(`© 2026 Musterbetrieb ${form} · Regensburg`),
      null,
      `${form} in der Firma muss still bleiben`,
    );
  }
});

// 15 — Klammer-Stamm: `GbR (…)` trifft über `gbr`
test('Klammerzusatz wird abgetrennt, der Stamm entscheidet', () => {
  const b = pruefeCopyrightZeile('© 2026 Sachverständigenbüro · GbR (Gesellschaft bürgerlichen Rechts) · Tegernheim');
  assert.ok(b);
  assert.equal(b.rechtsform, 'GbR (Gesellschaft bürgerlichen Rechts)');
});

// 16 — GEGENPROBE zu 15, der teuerste Fehlalarm: ein NAME mit Klammer darf nicht melden.
//      Deshalb prüft erkenneRechtsform nur den Stamm, nie den Klammerinhalt allein.
test('ein Name mit Rechtsform in Klammern meldet nicht', () => {
  assert.equal(erkenneRechtsform('Musterfirma (GmbH)'), null);
  assert.equal(erkenneRechtsform('Bauhof (AG)'), null);
  assert.equal(pruefeCopyrightZeile('© 2026 Inhaber · Musterfirma (GmbH) · Regensburg'), null);
});

// 17 — `UG (haftungsbeschränkt)` darf NICHT auf `ug` verkürzt werden: der Ganz-Treffer
//      muss vor dem Stamm-Treffer greifen, sonst steht eine andere Rechtsform im Befund
test('UG (haftungsbeschränkt) wird als Ganzes erkannt, nicht als Stamm', () => {
  assert.equal(erkenneRechtsform('UG (haftungsbeschränkt)'), 'UG (haftungsbeschränkt)');
  const b = pruefeCopyrightZeile('© 2026 Startbahn · UG (haftungsbeschränkt) · Regensburg');
  assert.ok(b);
  assert.equal(b.rechtsform, 'UG (haftungsbeschränkt)');
});

// 18 — Überempfindlichkeit nach der Erweiterung: die gemessene Flotte muss still bleiben.
//      Alle Zeilen am 28.10.2026 von den ausgelieferten Seiten abgerufen.
test('die gemessenen Flotten-Fußzeilen bleiben still', () => {
  for (const zeile of [
    '© 2026 Johannes-Maximilian Gottl · Einzelunternehmen · Regensburg',
    '© 2026 Gottl Richter Gomeier GbR · Tegernheim',
    '© 2026 Haus am Lago · Mantova',
    '© 2026 Digital-Direkt GmbH · Barbing-Unterheising',
    '© 2026 Zink Bäckerei & Konditorei · Pfakofen',
    '© 2026 Gebäudereinigung Donauprofi GmbH · Regensburg',
    '© 2026 Schiller Service GmbH · Mintraching',
    '© 2026 Elektrotechnik Mika · Rötz',
    '© 2026 mazterplan · Einzelunternehmen · Regensburg',
    '© 2026 GYMPANZEN. Alle Rechte vorbehalten.',
    '© 2026 Gottl Wohnen',
  ]) {
    assert.equal(pruefeCopyrightZeile(zeile), null, zeile);
  }
});

// 19 — Entwurfs- und Platzhalter-Werte aus `legal.form` dürfen nicht melden
test('Entwurfs- und Nicht-Rechtsform-Werte bleiben still', () => {
  for (const form of [
    'Einzelunternehmen (Entwurf, vom Inhaber zu bestätigen)',
    'Rechtsform folgt',
    'Private Vermietung',
    'Privatbrauerei',
    'Notar',
  ]) {
    assert.equal(erkenneRechtsform(form), null, form);
  }
});
