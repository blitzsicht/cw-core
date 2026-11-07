import test from 'node:test';
import assert from 'node:assert/strict';
import {
  pruefeVerbotsliste,
  pruefeErlaubteListe,
  kopfInhalte,
  GARANTIE_PRAEDIKATE,
} from './verbotsliste-check.js';
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

// ── NACHLESE 06.11.2026 (Review zu cw-core#220). Fünf Proben, die der Guard vor diesem
//    Stand alle anders beantwortet hat — jede einmal gegen `HEAD` gefahren und rot gesehen,
//    Ergebnis 5/5 Unterschiede bei 0 unerwünschten Verhaltensänderungen. Ohne diesen
//    Gegenlauf wäre „grün" von „kann nicht rot werden" nicht zu unterscheiden.
//    Gemeinsame Ursache von A, B und C: `kopfInhalte()` scannte rohes HTML und brach damit
//    die Abgrenzung, die der Dateikopf selbst aufschreibt.

test('A auskommentiertes <meta> im Kopf ist kein Befund — Astro behält HTML-Kommentare im Output', () => {
  const html = '<html><head><!-- <meta name="description" content="rechtssicher seit 2026"> -->'
    + '<title>Websites für Betriebe</title></head><body><p>Pflichtangaben vollständig.</p></body></html>';
  assert.deepEqual(treffer(html), [], 'ein entfernter Claim im Kommentar darf nicht melden');
  // Gegenprobe: dasselbe <meta> ohne Kommentar meldet.
  assert.equal(treffer(html.replace('<!-- ', '').replace('> -->', '>')).length, 1);
});

test('B auskommentierter <title> VOR dem echten verdrängt den Dokumenttitel nicht', () => {
  const html = '<html><head><!-- <title>rechtssicher — alter Titel</title> -->'
    + '<title>Websites für Betriebe</title></head><body><p>Hallo.</p></body></html>';
  const k = kopfInhalte(html);
  assert.equal(k.find((x) => x.ort === 'title')?.inhalt, 'Websites für Betriebe',
    'TITLE ist unverankerter First-Match — ohne Vorreinigung gewinnt der Kommentar');
  assert.deepEqual(treffer(html), []);
});

test('C der echte Titel meldet als „title“, auch wenn ein Kommentar einen zweiten <title> trägt', () => {
  const html = '<html><head><!-- <title>alter Titel</title> --><title>Rechtssicher bauen</title></head><body><p>Hallo.</p></body></html>';
  const b = treffer(html);
  assert.equal(b.length, 1, 'ein Befund, nicht zwei');
  assert.equal(b[0].ort, 'title', 'vorher leckte der echte Titel in den Textstrom und meldete als „text“');
});

test('D weiches Trennzeichen versteckt kein Prädikat — im Text und im Titel', () => {
  // „rechts&shy;sicher“ wird vom Browser als ein Wort gelesen; als Leerzeichen behandelt
  // wäre es ein Weg, jedes deutsche Kompositum an der Liste vorbeizuschleusen.
  assert.equal(treffer('<p>Unsere Texte sind rechts&shy;sicher.</p>').length, 1);
  assert.equal(treffer('<p>Unsere Texte sind rechts&#173;sicher.</p>').length, 1, 'numerische Form genauso');
  assert.equal(kopfInhalte('<title>rechts&shy;sicher</title>')[0].inhalt, 'rechtssicher');
  // Gegenprobe: ein echtes Leerzeichen bleibt ein echtes Leerzeichen.
  assert.deepEqual(treffer('<p>Das Recht und die Sicherheit, rechts sicher abbiegen.</p>'), []);
});

test('E wörtliches > im content-Attribut: die Meta wird gelesen und richtig verortet', () => {
  // `<meta\b[^>]*>` brach am ersten `>` — auch an einem im Attributwert. Der Treffer fiel
  // nicht aus (er landete über `sichtbarerText` im Textstrom), aber am falschen Ort und mit
  // Attribut-Müll im Kontext. Der Text-Leck selbst stammt aus `sichtbarerText`s `<[^>]+>`
  // und bleibt offen — ein toleranter Tag-Regex dort kann bei ungeraden Anführungszeichen
  // über das Tag hinausgreifen und Text schlucken, also genau einen Guard still machen.
  const html = '<head><meta name="description" content="Preis > 500 € und rechtssicher"></head><body><p>Text.</p></body>';
  const b = treffer(html);
  assert.ok(b.some((x) => x.ort === 'meta:description'), 'der Ort, an dem die Formulierung wirklich steht');
  assert.equal(b.find((x) => x.ort === 'meta:description').kontext, 'Preis > 500 € und rechtssicher');
});

// ── Verdeckte Schreibweisen (cw-core#230, Befunde 1, 2 und 8) ───────────────────
//    Jede dieser Proben war am Stand `b8f04a8e` rot: der Guard fand 0 Treffer, obwohl
//    ein Besucher das Prädikat liest. Die Referenzprobe in jedem Block zeigt, dass
//    der Aufbau an sich trifft — ohne sie wäre jede 0 auch mit einem kaputten Test
//    erklärbar (Messfalle „Lief nie").

test('Befund 1: benannte Entity im Text — „gepr&uuml;ft“ ist für den Leser „geprüft“', () => {
  assert.equal(treffer('<html><body><p>Alle Texte anwaltlich gepr&uuml;ft.</p></body></html>').length, 1);
  // Referenz: dieselbe Seite ohne Entity trifft auch — der Aufbau misst.
  assert.equal(treffer('<html><body><p>Alle Texte anwaltlich geprüft.</p></body></html>').length, 1);
});

test('Befund 1: numerische Entity dezimal und hexadezimal, im Text und in der Meta', () => {
  assert.equal(treffer('<html><body><p>anwaltlich gepr&#252;ft</p></body></html>').length, 1, 'dezimal');
  assert.equal(treffer('<html><body><p>anwaltlich gepr&#xFC;ft</p></body></html>').length, 1, 'hexadezimal');
  const meta = '<html><head><meta name="description" content="anwaltlich gepr&#252;ft seit 2019"></head><body></body></html>';
  const b = treffer(meta);
  assert.equal(b.length, 1);
  assert.equal(b[0].ort, 'meta:description');
});

test('Befund 1: eine unbekannte Entity bleibt ein Trenner — sie darf kein Wort zusammenziehen', () => {
  // `&kaputt;` ist kein Zeichen. Würde es verschwinden, entstünde „rechtssicher“ aus
  // zwei Wortteilen, die nebeneinander nichts versprechen.
  assert.equal(treffer('<html><body><p>Wir arbeiten rechts&kaputt;sicher</p></body></html>').length, 0);
});

test('Befund 2: literales U+00AD trennt kein Wort (sieben Flottendateien nutzen es)', () => {
  assert.equal(treffer('<html><body><p>Alles rechts­sicher</p></body></html>').length, 1);
});

test('Befund 2: <wbr> trennt kein Wort — auch nicht als <wbr/> oder im Titel', () => {
  assert.equal(treffer('<html><body><p>Alles rechts<wbr>sicher</p></body></html>').length, 1, 'im Text');
  assert.equal(treffer('<html><body><p>Alles rechts<wbr/>sicher</p></body></html>').length, 1, 'selbstschließend');
  const b = treffer('<html><head><title>rechts<wbr>sicher bauen</title></head><body></body></html>');
  assert.equal(b.length, 1, 'im Dokumenttitel');
  assert.equal(b[0].ort, 'title');
});

test('Befund 2 GEGENPROBE: ein echtes Leerzeichen trennt weiter — die Normalisierung bleibt scharf', () => {
  assert.equal(treffer('<html><body><p>Zum Thema Rechts sicher beraten</p></body></html>').length, 0);
  assert.equal(treffer('<html><body><p>Ein Absatz endet.</p><p>Sicher ist das nicht.</p></body></html>').length, 0,
    'Absatzgrenze zieht zwei Wörter nicht zusammen');
});

test('Befund 8: Meta-Wert ohne Anführungszeichen wird geprüft', () => {
  const b = treffer('<html><head><meta name=description content=rechtssicher></head><body></body></html>');
  assert.equal(b.length, 1);
  assert.equal(b[0].ort, 'meta:description');
});

test('Befund 8: ein unangeführter Wert endet am Leerzeichen, nicht erst am Tag-Ende', () => {
  // `content=sauber rechtssicher` ist HTML-seitig der Wert „sauber"; „rechtssicher"
  // ist ein eigenes (ungültiges) Attribut und kein Inhalt, den jemand liest.
  assert.equal(treffer('<html><head><meta name=description content=sauber rechtssicher></head><body></body></html>').length, 0);
  // Gegenprobe zur Probe davor: derselbe Aufbau mit dem Wort IM Wert trifft.
  assert.equal(treffer('<html><head><meta name=description content=rechtssicher-gebaut></head><body></body></html>').length, 1);
});

test('kopfInhalte: unangeführter name und unangeführter content werden gelesen', () => {
  const k = kopfInhalte('<html><head><meta name=og:description content=Seite></head></html>');
  assert.deepEqual(k, [{ ort: 'meta:og:description', inhalt: 'Seite' }]);
});

// ── cw-core#236: `erlaubteFormulierungen` — eine Phrase hebt den Treffer auf, den sie
//    UMSCHLIESST. Der Punkt des Mechanismus ist die Trennschärfe, nicht das Stummstellen.
//
//    GEGENPROBEN, am selben Baum gemessen (42 Proben gesamt, ohne Sabotage 0 rot). Drei
//    Sabotagen mit verschiedenen Fehlermengen — eine allein würde nicht zeigen, dass die
//    Proben den Mechanismus und seine Grenze getrennt messen:
//
//      A  Umschließung → Überlappung aufgeweicht (`freigaben[0]` statt Positionsprüfung,
//         die naive Fassung „Phrase steht irgendwo in der Quelle"):  3 rot
//         — Kern, „umschließen, nicht überlappen", Datenschutz-Fall.
//      B  Ladeprüfung meldet nie etwas (`if (false && …)`):           1 rot
//         — und nur die Ladeprüfungs-Probe; die Gegenprobe dazu bleibt grün.
//      C  Mechanismus ganz aus (`aufgehobenDurch` wird nie gesetzt):  5 rot
//         — Kern, Datenschutz, Meta-Ort, Whitespace, Mehrfachvorkommen.
//
//    A∖C ist „umschließen, nicht überlappen", C∖A sind die drei Wirkungsproben: die eine
//    Richtung kann nicht für die andere einstehen.

const BEIDE_RICHTUNGEN =
  '<html><body>' +
  '<p>Eine Website, die ohne korrekte Inhalte keine Anfragen bringt, kostet nur Geld.</p>' +
  '<p>Der Kunde wollte es so: eine Website, die Anfragen bringt.</p>' +
  '</body></html>';

test('#236 Kern: die Ausnahme hebt das verneinte Vorkommen auf und lässt das unverneinte stehen', () => {
  const b = pruefeVerbotsliste(BEIDE_RICHTUNGEN, seite, ['Anfragen bringt'], [
    'keine Anfragen bringt',
  ]);
  assert.equal(b.length, 2, 'beide Vorkommen werden gefunden — die Ausnahme filtert nicht die Suche');
  const auf = b.filter((x) => x.aufgehobenDurch !== undefined);
  const offen = b.filter((x) => x.aufgehobenDurch === undefined);
  assert.equal(auf.length, 1, 'genau das verneinte Vorkommen ist aufgehoben');
  assert.equal(auf[0].aufgehobenDurch, 'keine Anfragen bringt', 'die Meldung nennt die Phrase');
  assert.ok(auf[0].kontext.includes('ohne korrekte Inhalte'), 'und zwar das im verneinten Satz');
  assert.equal(offen.length, 1, 'das unverneinte Vorkommen bleibt Treffer — sonst deckt die Ausnahme zu viel');
  assert.ok(offen[0].kontext.includes('Der Kunde wollte'), 'nämlich das im Zitat-Satz');
});

test('#236 GEGENPROBE: ohne die Ausnahme sind beide Vorkommen offene Treffer', () => {
  const b = pruefeVerbotsliste(BEIDE_RICHTUNGEN, seite, ['Anfragen bringt']);
  assert.equal(b.length, 2);
  assert.equal(
    b.filter((x) => x.aufgehobenDurch !== undefined).length,
    0,
    'ohne vierten Parameter hebt nichts auf — der Unterschied zur Probe davor ist die Ausnahme selbst',
  );
});

test('#236 umschließen, nicht überlappen: eine halb deckende Phrase hebt nicht auf', () => {
  // Treffer „100 Punkte" beginnt VOR der Phrase „Punkte von 100" — die Phrase deckt nur
  // das Ende. Würde Überlappung genügen, wäre jede Ausnahme ein Freibrief nach links.
  const html = '<html><body><p>Wir erreichen 100 Punkte von 100 im Test.</p></body></html>';
  const b = pruefeVerbotsliste(html, seite, ['100 Punkte'], ['Punkte von 100']);
  assert.equal(b.length, 1);
  assert.equal(b[0].aufgehobenDurch, undefined, 'teilweise Deckung hebt nicht auf');
});

test('#236 Datenschutz-Fall: die Rechtsgrundlage ist erlaubt, ein zweites „rechtssicher" nicht', () => {
  // Der echte Satz aus customer-blitzsicht/datenschutz, heute über eine PFAD-Ausnahme
  // stummgestellt — die dort alle 24 Muster auf der ganzen Seite mit abdeckt.
  const html =
    '<html><body>' +
    '<p>Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse an rechtssicherer Beweisführung).</p>' +
    '<p>Unsere Seiten sind rechtssicher gebaut.</p>' +
    '</body></html>';
  const b = pruefeVerbotsliste(html, seite, GARANTIE_PRAEDIKATE, [
    'an rechtssicherer Beweisführung',
  ]);
  assert.equal(b.length, 2);
  assert.equal(b.filter((x) => x.aufgehobenDurch !== undefined).length, 1);
  const offen = b.find((x) => x.aufgehobenDurch === undefined);
  assert.ok(offen.kontext.includes('gebaut'), 'das Werbeversprechen auf derselben Seite bleibt sichtbar');
});

test('#236 die Ausnahme wirkt an jedem Ort, auch in der Meta-Description', () => {
  const html =
    '<html><head><meta name="description" content="Keine Anfragen bringt eine Seite ohne Inhalte."></head>' +
    '<body><p>Sauber.</p></body></html>';
  const b = pruefeVerbotsliste(html, seite, ['Anfragen bringt'], ['keine Anfragen bringt']);
  assert.equal(b.length, 1);
  assert.equal(b[0].ort, 'meta:description');
  assert.equal(b[0].aufgehobenDurch, 'keine Anfragen bringt', 'Groß-/Kleinschreibung egal');
});

test('#236 Whitespace: die Phrase greift über einen Zeilenumbruch im Quelltext', () => {
  const html = '<html><body><p>Ohne Inhalte keine\n    Anfragen bringt das nichts.</p></body></html>';
  const b = pruefeVerbotsliste(html, seite, ['Anfragen bringt'], ['keine Anfragen bringt']);
  assert.equal(b.length, 1);
  assert.equal(b[0].aufgehobenDurch, 'keine Anfragen bringt');
});

test('#236 dieselbe Phrase zweimal auf der Seite hebt beide Vorkommen auf', () => {
  const html =
    '<html><body><p>Keine Anfragen bringt Variante A.</p><p>Und keine Anfragen bringt Variante B.</p></body></html>';
  const b = pruefeVerbotsliste(html, seite, ['Anfragen bringt'], ['keine Anfragen bringt']);
  assert.equal(b.length, 2);
  assert.equal(b.filter((x) => x.aufgehobenDurch !== undefined).length, 2);
});

test('#236 eine leere Ausnahmeliste ändert nichts', () => {
  const mit = pruefeVerbotsliste(BEIDE_RICHTUNGEN, seite, ['Anfragen bringt'], []);
  const ohne = pruefeVerbotsliste(BEIDE_RICHTUNGEN, seite, ['Anfragen bringt']);
  assert.deepEqual(mit, ohne);
});

test('#236 Ladeprüfung: eine Phrase ohne verbotenes Muster kann nie greifen und wird gemeldet', () => {
  const f = pruefeErlaubteListe(['Wir bauen Websites in Regensburg'], P18);
  assert.equal(f.length, 1);
  assert.equal(f[0].phrase, 'Wir bauen Websites in Regensburg', 'die Meldung nennt den Wortlaut');
  assert.ok(f[0].grund.includes('keinen Treffer aufheben'));
});

test('#236 Ladeprüfung GEGENPROBE: eine Phrase MIT Muster ist in Ordnung', () => {
  assert.deepEqual(pruefeErlaubteListe(['keine Anfragen bringt'], ['Anfragen bringt']), []);
  assert.deepEqual(
    pruefeErlaubteListe(['an rechtssicherer Beweisführung'], GARANTIE_PRAEDIKATE),
    [],
    'Groß-/Kleinschreibung und Teilstring wie in der Prüfung selbst',
  );
});

// ── Nachlese Review cw-core#238 (07.11.2026) ────────────────────────────────────────────

test('#238-Nachlese B1: eine Phrase, die nur das Muster selbst ist, hebt nichts auf und wird gemeldet', () => {
  // `erlaubteFormulierungen: ['rechtssicher']` enthielt das Muster und bestand deshalb die
  // Ladeprüfung — und hob dann JEDEN Treffer auf: die Pfad-Ausnahme, nur über alle Seiten.
  const f = pruefeErlaubteListe(['Rechtssicher'], GARANTIE_PRAEDIKATE);
  assert.equal(f.length, 1, 'die Ladeprüfung meldet den Gleichheitsfall');
  assert.ok(f[0].grund.includes('selbst ein verbotenes Muster'), f[0].grund);
  const b = pruefeVerbotsliste('<html><body><p>Dies ist rechtssicher.</p></body></html>', seite, ['rechtssicher'], ['Rechtssicher']);
  assert.equal(b.length, 1);
  assert.equal(b[0].aufgehobenDurch, undefined, 'und die Prüfung wendet ihn nicht an');
  // GEGENPROBE: mit Kontext ist dieselbe Formulierung eine echte Satz-Ausnahme.
  const g = pruefeVerbotsliste('<html><body><p>Dies ist rechtssicher.</p></body></html>', seite, ['rechtssicher'], ['ist rechtssicher']);
  assert.equal(g[0].aufgehobenDurch, 'ist rechtssicher');
});

test('#238-Nachlese B2: ein aufgehobener kurzer Treffer verdeckt keinen längeren offenen an derselben Stelle', () => {
  const html = '<html><body><p>keine rechtssichere Website garantiert</p></body></html>';
  const L = ['rechtssicher', 'rechtssichere Website garantiert'];
  for (const liste of [L, [...L].reverse()]) {
    const b = pruefeVerbotsliste(html, seite, liste, ['keine rechtssichere']);
    assert.ok(
      b.some((x) => x.aufgehobenDurch === undefined && x.formulierung === 'rechtssichere Website garantiert'),
      `Reihenfolge ${liste.join(' / ')}: ${JSON.stringify(b.map((x) => [x.formulierung, x.aufgehobenDurch ?? 'OFFEN']))}`,
    );
  }
});
