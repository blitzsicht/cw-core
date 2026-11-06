// @ts-check
/**
 * @cw/core/integrations/ai-discovery/platzhaltertext-check
 *
 * Platzhaltertext-Guard: meldet sichtbaren Platzhaltertext auf einer gebauten Seite —
 * „Platzhalter: …“, „Lorem ipsum“, „[Preise folgen]“, „TODO“, „Foto folgt“. Pure
 * String-Logik pro Seiten-HTML; der Directory-Walk liegt beim Aufrufer (index.ts),
 * gleicher Split wie opening-hours-check.js.
 *
 * ANLASS (26.10.2026): Drei Kunden-Vorschauen lieferten Platzhaltertext an den Kunden aus.
 *   - levia-therapiezentrum: in allen sechs Aufklappern „Platzhalter: Hier steht bald in
 *     drei, vier Sätzen, was wir in ‚X‘ genau machen.“ — die Kundin hat das gelesen.
 *   - spedition-steller `/fahrer/`: drei Karten mit „[Platzhalter]“ im Titel, zwei Tage
 *     nachdem die Vorschau-Mail an den Betrieb ging.
 *   - brotzeithaeusl `/partyservice/`: „[Auswahl, Preise und Vorlaufzeit … folgen]“, während
 *     die Angebots-Mail auf genau diese Seite verwies.
 * Kein bestehender Guard sah das: `vorlagen-platzhalter-check.js` prüft `{{DOMAIN}}` im
 * Quelltext, nicht den sichtbaren Text der gebauten Seite.
 *
 * GEMESSEN WIRD DER SICHTBARE TEXT, nicht rohes HTML. Die erste Fassung dieses Musters lief
 * gegen das HTML und traf CSS-Attributselektoren wie `[title]` und `[hidden]` — sie meldete
 * jede Seite rot. Deshalb fallen `<script>`, `<style>`, Kommentare und alle Tags vorher weg.
 *
 * NICHT geprüft: Attributwerte. Ein `placeholder="Erika Muster"` im Formular ist gewollt
 * (falzmarke-Signaturbaukasten), ebenso `alt`-Texte mit eckigen Klammern. Ebenfalls außen
 * vor: `<pre>`, `<code>`, `<kbd>`, `<samp>` — Code zum Kopieren.
 *
 * GEEICHT AM 26.10.2026 GEGEN DIE FLOTTE: 589 gebaute Seiten in 31 Repos. Die erste,
 * weite Fassung meldete 26 Repos — fast alles Fehlalarme. Drei Klassen, alle gemessen:
 *   1. Code zum Kopieren: `[data-ogsc]` in den E-Mail-Signatur-Seiten von 20 Repos
 *      (CSS in einem Code-Block, nicht in `<style>`) → `<pre>`/`<code>` fallen weg.
 *   2. „coming soon" als Produktaussage: gympanzen „Drop coming soon.", preshot und
 *      platzfrei „Coming Soon · Warteliste offen" → Muster gestrichen, das ist eine
 *      Aussage und keine Lücke.
 *   3. Text, der ÜBER Platzhalter spricht: unsere eigene Vorschau-Kennzeichnung („Die
 *      Bilder sind Platzhalter, bis echte Fotos da sind." — haarwerk, braustall,
 *      arnold-lang, herztoene, notar-huber, haustechnik-pollinger), Prompt-Vorlagen in
 *      falzmarke-Anleitungen, Blog-Beispiele „Elektriker [Ihre Stadt]", SLA-Betreff
 *      „Eskalation [Kunde]" → „Platzhalter" zählt nur in Ankündigungsform
 *      (`[Platzhalter]`, `Platzhalter:`), eine Klammer nur mit Ankündigungs-Verb darin.
 *
 * Nach der Eichung blieben genau die echten Funde — darunter drei, die niemand kannte:
 * pferdesport-silberhorn trägt „TODO: vom Kunden bestätigen" im Footer JEDER Seite und in
 * der Datenschutzerklärung, blumen-schmid im Impressum bei USt-IdNr. und
 * Vertretungsberechtigten, itk-regensburg „[wird vom Unternehmen ergänzt]" bei der
 * USt-IdNr. — also bei § 5 DDG-Pflichtangaben.
 */

/**
 * Muster für sichtbaren Platzhaltertext. Jedes hat einen belegten Auslöser:
 * `Platzhalter`/`Hier steht bald` (levia, steller), `[…]` (steller, brotzeithaeusl),
 * `Lorem ipsum`/`Blindtext` (klassisch), `TODO`/`TBD`/`XXX` (vergessene Notiz),
 * `Foto folgt`/`folgt in Kürze`/`coming soon` (angekündigte Lücke).
 */
const MUSTER = [
  // „Platzhalter" NUR in Ankündigungsform. Blank steht das Wort auf sechs Kundenseiten
  // als bewusste Vorschau-Kennzeichnung („Die Bilder sind Platzhalter, bis echte Fotos
  // da sind.") — das ist Information für den Betrachter, keine Lücke im Text.
  /\[Platzhalter[^\]<>]{0,40}\]/i,
  /Platzhalter\s*:/i,
  /Lorem ipsum/i,
  /Blindtext/i,
  /Hier steht bald/i,
  /Foto folgt/i,
  /folgt in Kürze/i,
  /\bTODO\b/,
  // Klammer MIT Ankündigung darin: „[Auswahl, Preise und Vorlaufzeit … folgen]"
  // (brotzeithaeusl), „[wird vom Unternehmen ergänzt]" (itk-regensburg), „[TBD]"
  // (gympanzen-AGB). Ohne das Verb wären „[Ihre Stadt]" aus einem Blog-Beispiel,
  // „[Kunde]" aus einer Betreff-Vorlage und „[data-ogsc]" aus einem CSS-Block Treffer —
  // alle drei gemessen und alle drei falsch.
  /\[[^\]<>]{0,88}\b(folgt|folgen|fehlt|fehlen|ergänzt|ergänzen|nachtragen|nachtragen|ausfüllen|bestätigen|TODO|TBD)\b[^\]<>]{0,20}\]/i,
];

/**
 * Benannte Entities, die ein ZEICHEN sind und kein Trenner. Alles, was hier nicht steht,
 * wird zum Leerzeichen — eine unbekannte Entity trennt Wörter, sie zieht sie nicht zusammen
 * (`rechts&kaputt;sicher` ist kein Prädikat, Probe in verbotsliste-check.test.mjs).
 *
 * Die Liste ist nach dem Bedarf der deutschen Kundenseiten gewählt, nicht vollständig:
 * Umlaute und ß in allen Fällen, Typografie (Anführungen, Striche, Auslassung), Einheiten
 * und die vier, die schon vorher einzeln dastanden. `shy`, `zwnj`, `zwj` und `wj` ergeben
 * das jeweilige unsichtbare Zeichen und werden einen Schritt später mit ihm entfernt —
 * eine Quelle statt zwei Regeln an zwei Stellen.
 */
const BENANNTE_ENTITIES = Object.freeze({
  amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ',
  auml: 'ä', ouml: 'ö', uuml: 'ü', Auml: 'Ä', Ouml: 'Ö', Uuml: 'Ü', szlig: 'ß',
  agrave: 'à', aacute: 'á', eacute: 'é', egrave: 'è', ecirc: 'ê', iacute: 'í',
  oacute: 'ó', ocirc: 'ô', uacute: 'ú', ccedil: 'ç', ntilde: 'ñ',
  ndash: '–', mdash: '—', hellip: '…', middot: '·', bull: '•',
  bdquo: '„', ldquo: '“', rdquo: '”', sbquo: '‚', lsquo: '‘', rsquo: '’',
  laquo: '«', raquo: '»', prime: '′', Prime: '″',
  euro: '€', pound: '£', yen: '¥', cent: '¢', sect: '§', para: '¶',
  deg: '°', plusmn: '±', times: '×', divide: '÷', minus: '−', frac12: '½',
  copy: '©', reg: '®', trade: '™',
  shy: '­', zwnj: '‌', zwj: '‍', wj: '⁠',
});

/**
 * Ein Zeichen aus einem Codepunkt, oder ein Leerzeichen, wenn der Punkt keines ergibt
 * (Steuerzeichen, Surrogate, über U+10FFFF). `String.fromCodePoint` wirft dort.
 * @param {number} cp
 */
function ausCodepunkt(cp) {
  if (!Number.isFinite(cp) || cp <= 0 || cp > 0x10ffff) return ' ';
  if (cp >= 0xd800 && cp <= 0xdfff) return ' ';
  if (cp < 0x20 && cp !== 0x09 && cp !== 0x0a) return ' ';
  return String.fromCodePoint(cp);
}

/**
 * Entities zu ihren Zeichen, dann unsichtbare Trennzeichen weg. Geteilt von beiden Guards,
 * die über diese Datei laufen — Verbotsliste UND Platzhaltertext.
 *
 * ANLASS (cw-core#230, Befunde 1 und 2): bis zum 06.11.2026 wurde jede Entity außer vier
 * Sonderfällen zum Leerzeichen (`&[a-z]+;|&#\d+;`). Damit fanden `anwaltlich gepr&uuml;ft`,
 * `gepr&#252;ft` und `gepr&#xFC;ft` **null** Treffer — hexadezimale Entities fielen ganz
 * durch den Rost, weil das Muster nur Dezimalstellen kannte. Dasselbe für literales U+00AD:
 * `&shy;` war behandelt, das Zeichen selbst nicht, und genau das steht in sieben
 * Quelldateien der Flotte (gottl-richter-gomeier 5×, blitzsicht `agb.astro`, allstargirls
 * `index.astro`) und im blitzsicht-Build in `agb/index.html`.
 *
 * Reihenfolge ist nicht beliebig: erst hex, dann dezimal, dann benannt. Numerisch zuerst
 * heißt, dass ein dekodiertes `&` aus `&amp;` nicht nachträglich als Entity-Anfang gelesen
 * wird — `&amp;#173;` bleibt der Text „&#173;", wie es im Quelltext gemeint war.
 *
 * Zuletzt fallen die unsichtbaren Trenner: U+00AD (weiches Trennzeichen), Zero-Width-Space
 * und -Non-Joiner, Word-Joiner, BOM. Sie trennen für den Leser KEIN Wort, also dürfen sie
 * auch im Prüftext keines trennen. Ein echtes Leerzeichen bleibt ein Trenner (Gegenprobe).
 *
 * @param {string} s
 * @returns {string}
 */
export function entitiesUndTrennerWeg(s) {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_m, h) => ausCodepunkt(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_m, d) => ausCodepunkt(Number(d)))
    .replace(/&([a-z][a-z0-9]*);/gi, (_m, n) =>
      Object.prototype.hasOwnProperty.call(BENANNTE_ENTITIES, n)
        ? BENANNTE_ENTITIES[/** @type {keyof typeof BENANNTE_ENTITIES} */ (n)]
        : Object.prototype.hasOwnProperty.call(BENANNTE_ENTITIES, n.toLowerCase())
          ? BENANNTE_ENTITIES[/** @type {keyof typeof BENANNTE_ENTITIES} */ (n.toLowerCase())]
          : ' ',
    )
    .replace(/[­​‌‍⁠﻿]/g, '');
}

/**
 * Sichtbarer Text einer Seite: ohne Skripte, Stile, Code-Blöcke, Kommentare und Tags.
 * @param {string} html
 * @returns {string}
 */
export function sichtbarerText(html) {
  const ohneTags = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    // Code zum Kopieren ist kein Seitentext: in 20 Repos steht in den
    // E-Mail-Signatur-Seiten ein CSS-Block mit `[data-ogsc]`-Selektoren.
    .replace(/<(pre|code|kbd|samp)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    // `<wbr>` ist eine Trennstelle, kein Wortende — der Leser sieht „rechtssicher", auch
    // wenn die Zeile dort umbricht. Muss VOR dem Tag-Strip weg, denn der macht aus jedem
    // Tag ein Leerzeichen und damit aus einem Wort zwei (cw-core#230, Befund 2).
    .replace(/<wbr\b[^>]*>/gi, '')
    .replace(/<[^>]+>/g, ' ');
  // Entities zu Zeichen, unsichtbare Trenner weg — geteilt mit dem Verbotslisten-Guard;
  // Begründung und Reihenfolge stehen an `entitiesUndTrennerWeg`. Erst danach den
  // Whitespace kollabieren, sonst bliebe ein dekodiertes `&nbsp;` doppelt stehen.
  return entitiesUndTrennerWeg(ohneTags).replace(/\s+/g, ' ').trim();
}

/**
 * Vermerkt eine Fundstelle unter ihrem Schlüssel und führt die Seiten, auf denen sie steht —
 * JEDE Seite genau einmal. Geteilt von allen Guards, die über `walkHtml` laufen und ihre
 * Befunde über Seiten hinweg entdoppeln.
 *
 * ANLASS (06.11.2026, Review zu cw-core#220): beide Aufrufstellen in index.ts hatten
 * `if (e) e.seiten.push(rel)` ohne Prüfung. Stand derselbe Satz zweimal auf derselben Seite,
 * wuchs `seiten` auf `['x','x']` und die Logzeile behauptete „x + 1 weitere" — eine zweite
 * betroffene Seite, die es nicht gab. Ein Guard, der die Menge seiner Befunde übertreibt,
 * ist genauso wenig brauchbar wie einer, der sie verschweigt.
 *
 * `includes` statt „nur die letzte vergleichen": der Walk liefert heute alle Befunde einer
 * Seite zusammen, aber darauf soll sich die Funktion nicht verlassen — eine Annahme, die
 * der Aufrufer brechen kann, ist eine Falle. Bei zweistelligen Seitenzahlen kostet das nichts.
 *
 * @template {{ seiten: string[] }} T
 * @param {Map<string, T>} proKontext Sammler, wird verändert
 * @param {string} key Schlüssel der Fundstelle (z. B. `ort\u0000kontext`)
 * @param {string} seite relativer Pfad der Seite, auf der die Fundstelle steht
 * @param {() => T} anlegen baut den Eintrag, wenn der Schlüssel neu ist (inkl. `seiten`)
 */
export function vermerkeFundstelle(proKontext, key, seite, anlegen) {
  const e = proKontext.get(key);
  if (!e) proKontext.set(key, anlegen());
  else if (!e.seiten.includes(seite)) e.seiten.push(seite);
}

/**
 * @typedef {{ seite: string, treffer: string, kontext: string }} PlatzhalterBefund
 */

/**
 * Prüft eine gebaute Seite auf sichtbaren Platzhaltertext.
 *
 * Gemeldet wird JEDES Vorkommen, nicht nur das erste je Muster: bei der Sabotage-Probe
 * am 26.10.2026 verdeckte „[Platzhalter]" sonst den zweiten Klammersatz auf derselben
 * Seite — also genau den brotzeithaeusl-Fund. Doppelte Fundstellen (gleiche Position)
 * fallen weg, Entdopplung über Seiten hinweg macht der Aufrufer.
 *
 * @param {string} html roher HTML-Inhalt der Seite
 * @param {string} seite relativer Pfad für die Meldung, z. B. `fahrer/index.html`
 * @returns {PlatzhalterBefund[]} ein Befund je Fundstelle, nach Position sortiert
 */
export function pruefePlatzhaltertext(html, seite) {
  const text = sichtbarerText(html);
  /** @type {Map<number, PlatzhalterBefund>} */
  const proPosition = new Map();
  for (const muster of MUSTER) {
    for (const m of text.matchAll(new RegExp(muster.source, muster.flags + 'g'))) {
      const i = m.index ?? 0;
      if (proPosition.has(i)) continue;
      proPosition.set(i, {
        seite,
        treffer: m[0],
        kontext: text.slice(Math.max(0, i - 45), i + m[0].length + 45).trim(),
      });
    }
  }
  return [...proPosition.entries()].sort((a, b) => a[0] - b[0]).map(([, b]) => b);
}

/**
 * Soll diese Seite geprüft werden? Ausnahmen sind Seiten, die ÜBER Platzhalter sprechen,
 * statt welche zu zeigen — die Fragebogen-Seiten `/onboarding/` bei elektro-mika und
 * spedition-steller sagen dem Kunden gerade, dass Platzhalterbilder raus sollen.
 *
 * @param {string} seite relativer Pfad, z. B. `onboarding/index.html`
 * @param {readonly string[]} ausnahmen Pfad-Anfänge, die übersprungen werden
 * @returns {boolean}
 */
export function istZuPruefen(seite, ausnahmen) {
  return !ausnahmen.some((a) => seite === a || seite.startsWith(a.replace(/\/$/, '') + '/'));
}
