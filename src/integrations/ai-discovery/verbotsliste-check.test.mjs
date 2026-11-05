import test from 'node:test';
import assert from 'node:assert/strict';
import { pruefeVerbotsliste, kopfInhalte, GARANTIE_PRAEDIKATE } from './verbotsliste-check.js';
import { istZuPruefen } from './platzhaltertext-check.js';

const seite = 'index.html';
/** Die Akquise-Verbotsliste P18, so wie sie der Grep in blitzsicht-ops#1042 benutzt. */
const P18 = [
  'bringt Anfragen', 'mehr Kunden', 'mehr Umsatz', 'zahlen erst', '100 Punkte',
  'die Besten', 'rechtssicher', 'abmahnsicher', 'anwaltlich geprüft',
];
const treffer = (html, liste = GARANTIE_PRAEDIKATE) => pruefeVerbotsliste(html, seite, liste);

// ── Die echten Fundstellen aus blitzsicht-ops#1042 (customer-blitzsicht, main 00353e4).
//    Jede muss melden; fällt eine aus, ist der Guard gegen genau den Bug blind, der ihn
//    ausgelöst hat.

test('Fundfall Blog „Was rechtssichere DSGVO-Konformität …“ als h2 (dsgvo-ohne-cookie-banner.md:223)', () => {
  const html = '<html><body><h2>Was rechtssichere DSGVO-Konformität in der Praxis bedeutet</h2></body></html>';
  const b = treffer(html);
  assert.equal(b.length, 1);
  assert.equal(b[0].seite, seite);
  assert.equal(b[0].ort, 'text');
  assert.equal(b[0].formulierung, 'rechtssicher');
  assert.equal(b[0].treffer, 'rechtssicher', 'Treffer ist so lang wie der Eintrag, nicht das ganze Wort');
  assert.ok(b[0].kontext.includes('DSGVO-Konformität'), 'Kontext zeigt die Fundstelle');
});

test('Fundfall Meta-Description „Beste Webagenturen in Regensburg 2026“ (webagenturen-regensburg-vergleich.astro:13)', () => {
  const html = `<html><head><meta name="description" content="Beste Webagenturen in Regensburg 2026 im Vergleich: seitenwind, andré media und mehr."></head>
    <body><p>Wir vergleichen Agenturen nach Kategorie.</p></body></html>`;
  const b = treffer(html, ['Beste Webagentur']);
  assert.equal(b.length, 1);
  assert.equal(b[0].ort, 'meta:description', 'Attribute sind kein sichtbarer Text — der Ort muss das sagen');
  assert.equal(b[0].treffer, 'Beste Webagentur');
});

test('Fundfall Keywords-Meta „ki bilder rechtssicher“ (ki-bilder-kennzeichnen-ai-act.md:18)', () => {
  const html = '<head><meta name="keywords" content="ki bilder kennzeichnen, ai act artikel 50, ki bilder rechtssicher, transparenzpflicht ki"></head><body><p>Text ohne Prädikat.</p></body>';
  const b = treffer(html);
  assert.equal(b.length, 1);
  assert.equal(b[0].ort, 'meta:keywords');
});

test('Fundfall „über 95 von 100 Punkten“ gegen „100 Punkte“ (website-anforderungen.astro:118)', () => {
  const html = '<div class="solution"><strong>So lösen wir das:</strong> Google gibt unseren Seiten regelmäßig über 95 von 100 Punkten.</div>';
  const b = treffer(html, P18);
  assert.equal(b.length, 1);
  assert.equal(b[0].formulierung, '100 Punkte');
  assert.equal(b[0].treffer, '100 Punkte');
});

test('Fundfall Paketmatrix „Rechtssicher (DSGVO, DDG, TDDDG)“ — Großschreibung am Wortanfang (pakete-details.ts:195)', () => {
  assert.equal(treffer('<h3>Rechtssicher (DSGVO, DDG, TDDDG)</h3>').length, 1);
});

// ── Teilstring und Normalisierung: das ist die bewusste Entscheidung, mit beiden Seiten.

test('Teilstring: „DSGVO-rechtssichere“ und „Rechtssicherheit“ melden (website-kosten-handwerker.md:50, ki-bilder:109)', () => {
  assert.equal(treffer('<p>DSGVO-rechtssichere Cookie-Konfiguration ohne Mahn-Risiko.</p>').length, 1);
  assert.equal(treffer('<p>Wer seine Rechtssicherheit darauf baut, baut auf Sand.</p>').length, 1);
});

test('Teilstring-Kehrseite: ein kurzes Wort trifft Nachbarn — deshalb nur mit Kontext eintragen', () => {
  // So steht es im Kopfkommentar: „Beste" allein ist kein brauchbarer Eintrag …
  assert.equal(treffer('<p>Jetzt bestellen, wir bestehen auf Qualität.</p>', ['Beste']).length, 2);
  // … „Beste Webagentur" dagegen trifft nur, was gemeint ist.
  assert.deepEqual(treffer('<p>Jetzt bestellen, wir bestehen auf Qualität.</p>', ['Beste Webagentur']), []);
});

test('Whitespace und Zeilenumbruch mitten im Eintrag ändern nichts', () => {
  const b = treffer('<p>Unsere Texte sind anwaltlich\n      geprüft.</p>');
  assert.equal(b.length, 1);
  assert.equal(b[0].treffer, 'anwaltlich geprüft', 'Kontext und Treffer mit einem Leerzeichen');
  assert.equal(treffer('<p>Texte</p>', ['  Anwaltlich   Geprüft ']).length, 0, 'leerer Text bleibt leer');
  assert.equal(treffer('<p>anwaltlich geprüft</p>', ['  Anwaltlich   Geprüft ']).length, 1, 'Listeneintrag wird genauso normalisiert');
});

// ── GEGENPROBEN: Diese Seiten müssen still bleiben. Ohne sie wäre „meldet immer" von
//    „meldet richtig" nicht zu unterscheiden.

test('GEGENPROBE saubere Seite mit der ganzen P18-Liste — keine Meldung', () => {
  const html = `<html><head><title>Website für Handwerker in Regensburg</title>
    <meta name="description" content="Websites für Betriebe aus Regensburg: Festpreis, ohne Cookie-Banner, Dateien gehören Ihnen."></head>
    <body><h1>Blitzsicht</h1><p>Pflichtangaben nach DSGVO, DDG und TDDDG. Google PageSpeed 100/100 mobil, Labormessung vom 5. November 2026.</p></body></html>`;
  assert.deepEqual(treffer(html, P18), []);
});

test('GEGENPROBE Kommentar, JSON-LD, Stil, Code und alt-Attribut — keine Meldung', () => {
  const html = `<html><head>
    <script type="application/ld+json">{"@type":"Service","name":"rechtssicher"}</script>
    <style>.rechtssicher{display:none}</style>
    </head><body>
    <!-- rechtssicher: alter Claim, raus seit 05.11.2026 -->
    <pre><code>// rechtssicher ist Teil der Verbotsliste</code></pre>
    <img src="/x.webp" alt="rechtssicher">
    <p>Pflichtangaben vollständig.</p></body></html>`;
  assert.deepEqual(treffer(html), [], 'nichts davon sieht ein Besucher');
  // Gegenprobe zur Gegenprobe: dasselbe Wort als Seitentext meldet.
  assert.equal(treffer('<p>rechtssicher</p>').length, 1);
});

test('leere Liste und Liste aus Leerstrings — keine Befunde, auch bei Treffern im Text', () => {
  assert.deepEqual(treffer('<p>rechtssicher und abmahnsicher</p>', []), []);
  assert.deepEqual(treffer('<p>rechtssicher und abmahnsicher</p>', ['', '   ']), []);
});

// ── Ausnahmen laufen über istZuPruefen aus dem Platzhaltertext-Guard (gleiche Semantik).
//    Die Datenschutzerklärung von blitzsicht.com (datenschutz.astro:67) ist die eine
//    Fundstelle, die bleibt: „berechtigtes Interesse an rechtssicherer …" ist die
//    Standardformulierung zu Art. 6 Abs. 1 lit. f DSGVO.

test('Ausnahme datenschutz/: die Seite wird übersprungen, ihr Nachbar nicht — und ihr Satz wäre ein Treffer', () => {
  const ausnahmen = ['datenschutz/'];
  assert.equal(istZuPruefen('datenschutz/index.html', ausnahmen), false);
  assert.equal(istZuPruefen('datenschutz-hinweise/index.html', ausnahmen), true);
  assert.equal(istZuPruefen('index.html', ausnahmen), true);
  // Die Ausnahme ist das Einzige, was den Satz still hält:
  const satz = '<p>Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse an rechtssicherer Darstellung)</p>';
  assert.equal(pruefeVerbotsliste(satz, 'datenschutz/index.html', GARANTIE_PRAEDIKATE).length, 1);
});

// ── Orte: Titel, Metas, und die Verdeckungsfalle.

test('Dokumenttitel meldet als „title“ und steht nicht zusätzlich im Textstrom', () => {
  const html = '<html><head><title>Rechtssicher bauen — Blitzsicht</title></head><body><p>Hallo.</p></body></html>';
  const b = treffer(html);
  assert.equal(b.length, 1, 'ein Befund, nicht zwei');
  assert.equal(b[0].ort, 'title');
});

test('SVG-Titel im Body ist sichtbarer Text, kein Dokumenttitel', () => {
  const html = '<html><head><title>Blitzsicht</title></head><body><svg><title>abmahnsicher</title></svg></body></html>';
  const b = treffer(html);
  assert.equal(b.length, 1);
  assert.equal(b[0].ort, 'text');
});

test('kopfInhalte: og:description per property, twitter per name, einfache Anführungszeichen, Entities — viewport und robots bleiben außen vor', () => {
  const html = `<head>
    <meta charset="utf-8"><meta name="viewport" content="width=device-width">
    <meta name="robots" content="index, follow">
    <meta property="og:description" content="Websites &amp; Software, &quot;ehrlich&quot; gebaut">
    <meta name='twitter:description' content='Websites für Betriebe'>
    <meta name="description" content="Beschreibung">
    <title>Titel &amp; mehr</title></head>`;
  const k = kopfInhalte(html);
  assert.deepEqual(k.map((x) => x.ort), ['title', 'meta:og:description', 'meta:twitter:description', 'meta:description']);
  assert.equal(k[0].inhalt, 'Titel & mehr');
  assert.equal(k[1].inhalt, 'Websites & Software, "ehrlich" gebaut');
});

test('zwei Fundstellen auf einer Seite werden beide gemeldet, in Textreihenfolge — und derselbe Ort nur einmal je Position', () => {
  const html = '<p>abmahnsicher und später rechtssicher, am Ende DSGVO-rechtssicher.</p>';
  const b = pruefeVerbotsliste(html, seite, ['rechtssicher', 'DSGVO-rechtssicher', 'abmahnsicher']);
  assert.deepEqual(b.map((x) => x.formulierung), ['abmahnsicher', 'rechtssicher', 'DSGVO-rechtssicher', 'rechtssicher'],
    'Position 3 trifft zweimal (einmal „DSGVO-rechtssicher", einmal „rechtssicher" fünf Zeichen später) — beide stehen an verschiedenen Positionen');
  assert.equal(new Set(b.map((x) => x.kontext + x.ort)).size, b.length, 'keine zwei identischen Fundstellen');
});

test('Meta und Text getrennt: trifft nur die Meta, bleibt der Text ohne Befund', () => {
  const html = '<head><meta name="description" content="anwaltlich geprüft"></head><body><p>Pflichtangaben.</p></body>';
  const b = treffer(html);
  assert.deepEqual(b.map((x) => x.ort), ['meta:description']);
});

test('GARANTIE_PRAEDIKATE sind genau die drei Prädikate aus P18 und unveränderlich', () => {
  assert.deepEqual([...GARANTIE_PRAEDIKATE], ['rechtssicher', 'abmahnsicher', 'anwaltlich geprüft']);
  assert.ok(Object.isFrozen(GARANTIE_PRAEDIKATE));
  for (const p of GARANTIE_PRAEDIKATE) assert.ok(P18.includes(p), `${p} steht in P18`);
});
