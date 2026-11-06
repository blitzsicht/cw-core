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
 * Sichtbarer Text einer Seite: ohne Skripte, Stile, Code-Blöcke, Kommentare und Tags.
 * @param {string} html
 * @returns {string}
 */
export function sichtbarerText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    // Code zum Kopieren ist kein Seitentext: in 20 Repos steht in den
    // E-Mail-Signatur-Seiten ein CSS-Block mit `[data-ogsc]`-Selektoren.
    .replace(/<(pre|code|kbd|samp)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    // Weiches Trennzeichen trennt kein Wort: es MUSS verschwinden, nicht zum Leerzeichen
    // werden. Vor dem 06.11.2026 wurde es wie jede unbekannte Entity zum Leerzeichen —
    // „rechts&shy;sicher" kam im Textstrom als „rechts sicher" an und rutschte am
    // Verbotslisten-Guard vorbei (gemessen). Bei deutschen Komposita, wo die Trennung
    // sinnvoll ist, ein realistischer Weg, ein Prädikat zu verstecken. Betrifft beide
    // Guards, die diese Funktion teilen.
    .replace(/&shy;|&#0*173;|&#x0*ad;/gi, '')
    .replace(/&[a-z]+;|&#\d+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
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
