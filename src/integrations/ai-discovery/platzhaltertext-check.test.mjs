import test from 'node:test';
import assert from 'node:assert/strict';
import {
  pruefePlatzhaltertext,
  sichtbarerText,
  istZuPruefen,
} from './platzhaltertext-check.js';

const seite = 'index.html';
const treffer = (html) => pruefePlatzhaltertext(html, seite);

// ── Die drei echten Fundfälle vom 26.10.2026. Jeder muss melden; fällt einer aus,
//    ist der Guard gegen genau den Bug blind, der ihn ausgelöst hat.

test('Fundfall levia: „Platzhalter: Hier steht bald …“ im Aufklapper', () => {
  const html = `<html><body><details><summary>Mehr dazu</summary>
    <p>Platzhalter: Hier steht bald in drei, vier Sätzen, was wir in „Ergotherapie“ genau machen.</p>
    </details></body></html>`;
  const b = treffer(html);
  assert.ok(b.length >= 1, 'muss melden');
  assert.equal(b[0].seite, seite);
  assert.ok(b.some((x) => /Platzhalter/.test(x.treffer)));
  assert.ok(b[0].kontext.includes('Hier steht bald'), 'Kontext zeigt die Fundstelle');
});

test('Fundfall spedition-steller: „[Platzhalter]“ im Kartentitel', () => {
  const html = '<html><body><h3>[Platzhalter] Moderne Fahrzeuge</h3></body></html>';
  assert.ok(treffer(html).length >= 1, 'muss melden');
});

test('Fundfall brotzeithaeusl: Klammersatz als Absatz', () => {
  const html =
    '<html><body><p class="platzhalter">[Auswahl, Preise und Vorlaufzeit für den Partyservice folgen]</p></body></html>';
  const b = treffer(html);
  assert.ok(b.length >= 1, 'muss melden');
  // Der Klassenname allein darf NICHT der Grund sein — gemeldet wird der sichtbare Satz.
  assert.ok(b.every((x) => !x.treffer.includes('class')));
  assert.ok(b.some((x) => x.treffer.startsWith('[Auswahl')));
});

test('„Foto folgt“ als angekündigte Lücke', () => {
  assert.ok(treffer('<html><body><p>Foto folgt</p></body></html>').length >= 1);
});

test('Lorem ipsum und TODO', () => {
  assert.ok(treffer('<p>Lorem ipsum dolor sit amet</p>').length >= 1);
  assert.ok(treffer('<p>TODO: Preise nachtragen</p>').length >= 1);
});

// ── GEGENPROBEN: Diese Seiten müssen still bleiben. Ohne sie wäre „meldet immer“
//    von „meldet richtig“ nicht zu unterscheiden — die erste Fassung des Musters lief
//    gegen rohes HTML und meldete jede Seite rot.

test('GEGENPROBE saubere Seite — keine Meldung', () => {
  const html = `<html><head><title>Ergotherapie in Pentling</title></head><body>
    <h1>LeVia Therapiezentrum</h1><p>Seit 2009 in Pentling.</p></body></html>`;
  assert.deepEqual(treffer(html), []);
});

test('GEGENPROBE CSS-Attributselektoren im <style> — keine Meldung', () => {
  const html = `<html><head><style>
    [title]{cursor:help}[hidden]{display:none}a[href^="tel:"]{white-space:nowrap}
  </style></head><body><p>Ergotherapie und Handtherapie.</p></body></html>`;
  assert.deepEqual(treffer(html), [], 'CSS ist kein sichtbarer Text');
});

test('GEGENPROBE Skript und JSON-LD — keine Meldung', () => {
  const html = `<html><head>
    <script type="application/ld+json">{"@type":"LocalBusiness","name":"[Platzhalter]"}</script>
    <script>const vorlage = "TODO: füllen";</script>
    </head><body><p>Termine nach Vereinbarung.</p></body></html>`;
  assert.deepEqual(treffer(html), []);
});

test('GEGENPROBE HTML-Kommentar und Attributwerte — keine Meldung', () => {
  const html = `<html><body>
    <!-- Kein Platzhaltertext mehr hier: Aufklapper erst mit ihrem Text (26.10.2026). -->
    <input placeholder="Erika Muster" aria-label="[Name eingeben]">
    <img src="/raum.avif" alt="Behandlungsliege vor magentafarbener Wand">
    <p>Ruf uns gerne an.</p></body></html>`;
  assert.deepEqual(treffer(html), [], 'Kommentar und Attribute gehen den Besucher nichts an');
});

test('GEGENPROBE kurze Klammer „[1]“ bleibt still, lange Prosa-Klammer meldet', () => {
  assert.deepEqual(treffer('<p>Quelle [1] und [2]</p>'), []);
  assert.ok(treffer('<p>[Preise folgen]</p>').length >= 1);
});

// ── sichtbarerText: der Normalisierer selbst, einmal mit Gegenprobe

test('sichtbarerText entfernt Tags, Stile, Skripte, Kommentare und Entities', () => {
  const html =
    '<style>[title]{x}</style><script>let a="[b]"</script><!-- [c] --><p>Hallo&nbsp;Welt &amp; mehr</p>';
  const t = sichtbarerText(html);
  assert.equal(t, 'Hallo Welt mehr');
  assert.ok(!t.includes('['), 'kein Rest aus Stil, Skript oder Kommentar');
});

test('sichtbarerText behält echten Text — Gegenprobe zur Entfernung', () => {
  assert.equal(sichtbarerText('<div><b>Seit 2009</b> in Pentling</div>'), 'Seit 2009 in Pentling');
});

// ── Ausnahmen

test('istZuPruefen überspringt genau den Ausnahmepfad, nicht die Nachbarn', () => {
  const ausnahmen = ['onboarding/'];
  assert.equal(istZuPruefen('onboarding/index.html', ausnahmen), false);
  assert.equal(istZuPruefen('onboarding/fragen/index.html', ausnahmen), false);
  assert.equal(istZuPruefen('index.html', ausnahmen), true);
  // GEGENPROBE: Pfad, der nur so anfängt, ist eine andere Seite
  assert.equal(istZuPruefen('onboarding-alt/index.html', ausnahmen), true);
  // GEGENPROBE: ohne Ausnahmeliste wird alles geprüft
  assert.equal(istZuPruefen('onboarding/index.html', []), true);
});

// ── Verdeckung: gemessen am 26.10.2026 in der Build-Probe. Solange nur das erste
//    Vorkommen je Muster gemeldet wurde, verschluckte „[Platzhalter]" den zweiten
//    Klammersatz derselben Seite — also genau den brotzeithaeusl-Fund.
test('zwei Klammerfunde auf einer Seite werden beide gemeldet', () => {
  const html = `<html><body>
    <h3>[Platzhalter] Moderne Fahrzeuge</h3>
    <p>[Auswahl, Preise und Vorlaufzeit für den Partyservice folgen]</p>
    </body></html>`;
  const b = treffer(html);
  assert.ok(b.some((x) => x.treffer === '[Platzhalter]'), 'erster Klammerfund');
  assert.ok(b.some((x) => x.treffer.startsWith('[Auswahl')), 'zweiter Klammerfund');
});

test('Befunde sind nach Position sortiert und je Position nur einmal da', () => {
  const html = '<html><body><p>Lorem ipsum und später TODO: füllen</p></body></html>';
  const b = treffer(html);
  assert.equal(b.length, 2, 'genau zwei Fundstellen');
  assert.ok(/Lorem/.test(b[0].treffer) && /TODO/.test(b[1].treffer), 'Reihenfolge wie im Text');
});

// ── Die Eichung an der Flotte (26.10.2026, 589 gebaute Seiten in 31 Repos).
//    Die erste Fassung meldete 26 Repos, nach der Eichung 5 — und alle 5 echt.
//    Jede Gegenprobe hier ist ein gemessener Fehlalarm, nicht ein gedachter.

test('FLOTTE echt: pferdesport-silberhorn trägt „TODO" in der Fußzeile jeder Seite', () => {
  const html =
    '<footer><p>© 2026 Pferdesport Silberhorn · TODO: vom Kunden bestätigen (NorthData-Lead: GmbH)</p></footer>';
  assert.ok(treffer(html).length >= 1, 'muss melden');
});

test('FLOTTE echt: itk-regensburg lässt die USt-IdNr. im Impressum offen', () => {
  const html =
    '<p>Umsatzsteuer-Identifikationsnummer gemäß § 27 a Umsatzsteuergesetz: [wird vom Unternehmen ergänzt]</p>';
  const b = treffer(html);
  assert.ok(b.length >= 1, 'muss melden');
  assert.equal(b[0].treffer, '[wird vom Unternehmen ergänzt]');
});

test('FLOTTE echt: gympanzen-AGB mit „[TBD]"', () => {
  assert.ok(treffer('<p>Die mit [TBD] markierten Felder müssen vor dem Start gefüllt werden.</p>').length >= 1);
});

test('FLOTTE Fehlalarm 1: CSS-Selektoren in einem Code-Block zum Kopieren', () => {
  // So steht es in den E-Mail-Signatur-Seiten von 20 Repos — als Code, nicht als Stil.
  // Zwei Dinge halten das still, und beide werden hier einzeln geprüft:
  const html = `<p>Diesen Block in Outlook einfügen:</p>
    <pre><code>[data-ogsc] .esig-name { color: #ffffff !important; }
    [data-ogsc] .esig-link { color: #93c5fd !important; }</code></pre>`;
  assert.deepEqual(treffer(html), [], 'Code zum Kopieren ist kein Seitentext');
  // (1) die Verb-Bedingung — auch ohne Code-Zone trifft „[data-ogsc]" nicht,
  assert.deepEqual(treffer('<p>[data-ogsc] .esig-name { color: #fff }</p>'), []);
  // (2) die Code-Zone — ein „TODO" IM Codebeispiel ist Anleitung, keine Lücke im Text.
  //     Ohne diese Zone wäre jede Anleitungsseite mit Code-Kommentar ein Treffer.
  assert.deepEqual(
    treffer('<pre><code>const key = "…"; // TODO: eigenen Schlüssel einsetzen</code></pre>'),
    [],
    'TODO im Codebeispiel bleibt still',
  );
  // GEGENPROBE zu (2): dasselbe TODO als Seitentext meldet.
  assert.ok(treffer('<p>TODO: eigenen Schlüssel einsetzen</p>').length >= 1);
});

test('FLOTTE Fehlalarm 2: „coming soon" als Produktaussage', () => {
  assert.deepEqual(treffer('<p>Gymwear für Männer, die noch auftauchen. Drop coming soon.</p>'), []);
  assert.deepEqual(treffer('<p>Coming Soon · Warteliste offen</p>'), []);
});

test('FLOTTE Fehlalarm 3: Text, der ÜBER Platzhalter spricht', () => {
  // Unsere eigene Vorschau-Kennzeichnung auf sechs Kundenseiten — gewollt und informativ.
  assert.deepEqual(treffer('<p>Die Bilder sind Platzhalter, bis echte Fotos aus dem Salon da sind.</p>'), []);
  assert.deepEqual(treffer('<p>Texte, Fotos und Öffnungszeiten sind Platzhalter.</p>'), []);
  assert.deepEqual(treffer('<p>Die Bilder hier sind KI-Platzhalter und als solche gekennzeichnet.</p>'), []);
  // Blog-Beispiel und Betreff-Vorlage: Klammern ohne Ankündigung darin.
  assert.deepEqual(treffer('<p>Lokale SEO, die bei „Elektriker [Ihre Stadt]" auf Seite 1 rankt.</p>'), []);
  assert.deepEqual(treffer('<p>Mail an uns mit Betreff „Eskalation [Kunde]"</p>'), []);
});

test('GEGENPROBE zur Eichung: dieselben Wörter in Ankündigungsform melden doch', () => {
  // Die Verengung darf nicht alles stillstellen — das wäre ein Check, der nie rot wird.
  assert.ok(treffer('<p>Platzhalter: Hier kommt bald Text.</p>').length >= 1, 'Doppelpunkt zählt');
  assert.ok(treffer('<h3>[Platzhalter] Moderne Fahrzeuge</h3>').length >= 1, 'Klammerform zählt');
  assert.ok(treffer('<p>[Preise und Vorlaufzeit folgen]</p>').length >= 1, 'Klammer mit Verb zählt');
});
