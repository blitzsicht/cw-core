// @ts-check
/**
 * @cw/core/integrations/ai-discovery/verbotsliste-check
 *
 * Verbotslisten-Guard: meldet Formulierungen aus einer Liste im ausgelieferten Text einer
 * gebauten Seite — im sichtbaren Text, im `<title>` und in den Meta-Beschreibungen
 * (`description`, `keywords`, `og:description`, `twitter:description`). Pure String-Logik
 * pro Seiten-HTML; der Directory-Walk, die Entdopplung über Seiten und die Ausnahmen
 * (`istZuPruefen` aus platzhaltertext-check.js) liegen beim Aufrufer (index.ts).
 *
 * ANLASS (blitzsicht-ops#1042, 05.11.2026): blitzsicht.com trug nach der Akquise-Verbotsliste
 * zehn Altlasten in `src/` — „rechtssicher" in drei Blogartikeln, der Paketmatrix und der
 * Datenschutzerklärung, „über 95 von 100 Punkten" ohne Quelle und Datum auf
 * /website-anforderungen, „Beste Webagenturen in Regensburg" als Meta-Description der
 * Vergleichsseite. Kein Guard sah das: der Platzhaltertext-Guard kennt nur Lücken, nicht
 * Versprechen, und Meta-Inhalte gehen in `sichtbarerText()` verloren (Attribute fallen weg).
 *
 * ZWEI LISTEN, ZWEI STUFEN — und die zweite ERGÄNZT die erste. Die Flotte bekommt immer die
 * drei Garantie-Prädikate (`GARANTIE_PRAEDIKATE`): ein Prädikat, das ein Ergebnis zusagt,
 * das keine Seite belegen kann. Treffer darauf meldet der Aufrufer als Info, nie als Warnung
 * — der Release-Train zählt WARN-Köpfe, und ein neuer Guard darf seinen eigenen Rollout
 * nicht blocken (cw-core#196). Eine eigene Kundenliste (`verboteneFormulierungen`) kommt
 * HINZU; ihre Treffer sind WARN, `strictVerbotsliste` hebt sie auf Abbruch.
 *
 * Bis zum 06.11.2026 ersetzte die Kundenliste den Flottendefault (`eigene ?? …` in index.ts,
 * cw-core#230 Befund 3). Wer eine eigene Liste anlegte, schaltete damit still die drei
 * Prädikate ab — genau die Regression, gegen die dieser Guard gebaut wurde. customer-blitzsicht
 * schrieb sie deshalb in seiner Liste ab: eine Kopie, die niemand nachzieht.
 *
 * TEILSTRING, nicht Wortgrenze: „rechtssicher" soll „rechtssichere", „DSGVO-rechtssicherer"
 * und „Rechtssicherheit" treffen. Die Kehrseite steht beim Eintragen: ein kurzes Wort wie
 * „Beste" trifft auch „bestellen" und „bestehen" — in die Liste gehört es nur mit Kontext
 * („Beste Webagentur"). Groß-/Kleinschreibung und Whitespace werden vorher normalisiert,
 * ein Zeilenumbruch mitten in „anwaltlich geprüft" ändert nichts.
 *
 * NICHT geprüft: `<script>` (auch JSON-LD), `<style>`, HTML-Kommentare, `<pre>`/`<code>`,
 * sonstige Attributwerte (alt, aria-label, placeholder) — dieselbe Abgrenzung wie beim
 * Platzhaltertext-Guard, aus denselben dort gemessenen Gründen. Sie gilt für Kopf UND
 * Textstrom: `ohneUnsichtbares()` räumt vor der Trennung auf. Bis zum 06.11.2026 galt sie
 * nur für den Textstrom, `kopfInhalte()` scannte rohes HTML und meldete auskommentierte
 * Metas und Titel (Fälle A–C dort).
 */

import { sichtbarerText, entitiesUndTrennerWeg } from './platzhaltertext-check.js';

/**
 * Flottendefault: Garantie-Prädikate, die auf keiner Kundenseite belegbar sind. Alle drei
 * stehen so in der Akquise-Verbotsliste (`.agents/product-marketing-context.md`, P18).
 * Bewusst nicht dabei: Ergebnisversprechen wie „mehr Kunden" — die sind je Kunde eine
 * Textentscheidung und gehören in dessen eigene Liste.
 */
export const GARANTIE_PRAEDIKATE = Object.freeze(['rechtssicher', 'abmahnsicher', 'anwaltlich geprüft']);

/** Meta-Felder, deren Inhalt mitgeprüft wird — die Suchmaschine zeigt sie, der Besucher liest sie. */
const META_FELDER = Object.freeze(['description', 'keywords', 'og:description', 'twitter:description']);

/**
 * @typedef {'text' | 'title' | 'meta:description' | 'meta:keywords' | 'meta:og:description' | 'meta:twitter:description'} VerbotslistenOrt
 * @typedef {{ seite: string, ort: VerbotslistenOrt, formulierung: string, treffer: string, kontext: string, aufgehobenDurch?: string, alleAufhebungen?: string[] }} VerbotslistenBefund
 */

/**
 * Ein Attributwert aus einem Tag-String: doppelt angeführt, einfach angeführt oder GAR
 * NICHT angeführt.
 *
 * Der unangeführte Fall fehlte bis zum 06.11.2026 (cw-core#230, Befund 8):
 * `<meta name=description content=rechtssicher>` wurde still übersprungen, der Guard
 * meldete 0 Treffer. Astro quotet, deshalb heute selten — aber „selten" und „still" ist
 * die Verbindung, die einen Guard unbrauchbar macht.
 *
 * Der unangeführte Wert endet am ersten Whitespace oder am `>`, genau wie im HTML-Standard:
 * `content=sauber rechtssicher` hat den Wert „sauber", „rechtssicher" ist dort ein eigenes
 * (ungültiges) Attribut und kein Inhalt, den jemand liest. Deshalb `[^\s"'=<>`]+` und
 * nicht „bis zum Tag-Ende" — sonst meldete der Guard Text, der nie angezeigt wird.
 *
 * @param {string} tag
 * @param {string} name
 * @returns {string | undefined}
 */
function attribut(tag, name) {
  const m = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'=<>\`]+))`, 'i').exec(tag);
  if (!m) return undefined;
  return m[1] ?? m[2] ?? m[3];
}

const TITLE = /<title\b[^>]*>([\s\S]*?)<\/title>/i;

/**
 * Was ein Besucher nie sieht, FÜLLT auch keinen Kopf: Skripte (auch JSON-LD), Stile und
 * HTML-Kommentare fallen weg, bevor Kopf und Textstrom getrennt werden. Die Tags selbst
 * bleiben stehen — `kopfInhalte()` braucht `<title>` und `<meta>` noch.
 *
 * Warum das hier und nicht erst in `sichtbarerText()`: ohne diesen Schritt scannte
 * `kopfInhalte()` rohes HTML und brach damit die Abgrenzung, die der Dateikopf aufschreibt
 * („NICHT geprüft: … HTML-Kommentare"). Astro behält Kommentare im Output. Gemessen am
 * 06.11.2026, drei Fälle aus einem Lauf:
 *   A ein auskommentiertes `<meta name="description">` ergab einen Befund `meta:description`
 *     für Text, den niemand sieht;
 *   B ein auskommentierter `<title>` VOR dem echten wurde als Dokumenttitel gemeldet
 *     (`TITLE` ist unverankerter First-Match);
 *   C derselbe Fall entfernte in `html.replace(TITLE, ' ')` den falschen Titel, der echte
 *     leckte in den Textstrom und der Befund trug `ort: 'text'` statt `'title'`.
 * Alle drei lösen sich mit derselben Reinigung: der erste verbliebene `<title>` IST der
 * Dokumenttitel.
 *
 * @param {string} html
 */
function ohneUnsichtbares(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    // `<wbr>` trennt für den Leser kein Wort (cw-core#230, Befund 2). Hier UND in
    // `sichtbarerText()`, weil beide eigenständig aufgerufen werden: hier erwischt es
    // auch den Dokumenttitel, dort den Textstrom des Platzhaltertext-Guards.
    .replace(/<wbr\b[^>]*>/gi, '');
}

/**
 * Titel und Meta-Inhalte einer Seite, jeweils mit ihrem Ort. `sichtbarerText()` lässt den
 * Titel als Text stehen und wirft Meta-Inhalte weg (Attribute) — hier werden beide getrennt
 * eingesammelt, damit der Befund sagt, WO die Formulierung steht. Nur das erste `<title>`
 * zählt (der Dokumenttitel); SVG-Titel im Body bleiben Teil des sichtbaren Texts.
 *
 * Reinigt selbst über `ohneUnsichtbares()` — die Funktion ist exportiert und wird direkt
 * aufgerufen, ihr Vertrag darf nicht davon abhängen, dass der Aufrufer vorgereinigt hat.
 * Der zweite Lauf aus `pruefeVerbotsliste()` findet dann nichts mehr zu entfernen.
 * @param {string} html
 * @returns {{ ort: VerbotslistenOrt, inhalt: string }[]}
 */
export function kopfInhalte(html) {
  const rein = ohneUnsichtbares(html);
  /** @type {{ ort: VerbotslistenOrt, inhalt: string }[]} */
  const aus = [];
  const t = TITLE.exec(rein);
  if (t) aus.push({ ort: 'title', inhalt: entitiesUndTrennerWeg(t[1]) });
  // `[^>]*` bräche am ersten `>` — auch an einem in einem Attributwert. Ein `content="a > b"`
  // ließ die ganze Meta still ausfallen: der Tag endete für den Regex mitten im Wert, der
  // Rest matchte nicht mehr. Angeführte Werte werden deshalb als Ganzes übersprungen.
  for (const m of rein.matchAll(/<meta\b(?:"[^"]*"|'[^']*'|[^>])*>/gi)) {
    const tag = m[0];
    const name = (attribut(tag, 'name') ?? attribut(tag, 'property') ?? '').toLowerCase();
    if (!META_FELDER.includes(name)) continue;
    const content = attribut(tag, 'content');
    if (content === undefined) continue;
    aus.push({ ort: /** @type {VerbotslistenOrt} */ (`meta:${name}`), inhalt: entitiesUndTrennerWeg(content) });
  }
  return aus;
}

/**
 * Die Liste, wie der Checker sie wirklich sieht: Whitespace zusammengezogen, getrimmt,
 * kleingeschrieben, leere Einträge weg, Dubletten weg. Schlüssel ist die normalisierte
 * Fassung, Wert das erste Original — der Befund soll den Eintrag so zeigen, wie er in der
 * Kundenkonfiguration steht.
 *
 * Exportiert, weil der Aufrufer dieselbe Zahl nennen muss, die hier gilt (cw-core#230,
 * Befund 7): `index.ts` zählte `formulierungen.filter(f => f.trim() !== '').length` und
 * meldete für `['rechtssicher', 'Rechtssicher']` „2 Formulierung(en)", geprüft wurde eine.
 * Eine Zahl, zwei Quellen — jetzt eine.
 *
 * @param {readonly string[]} formulierungen
 * @returns {Map<string, string>} normalisiert → Original (erstes Vorkommen)
 */
export function normalisierteListe(formulierungen) {
  /** @type {Map<string, string>} */
  const liste = new Map();
  for (const f of formulierungen) {
    const n = f.replace(/\s+/g, ' ').trim().toLowerCase();
    if (n && !liste.has(n)) liste.set(n, f.trim());
  }
  return liste;
}

/**
 * Ist eine erlaubte Phrase ein Freibrief statt eines Satz-Teils? Ja, wenn sie das Muster
 * selbst ist (Review cw-core#238, Befund 1) ODER ein Muster enthält, ohne ein Wort mehr als
 * dieses zu haben: `rechtssichere`, `DSGVO-rechtssicher`, `Anfragen bringt.` umschließen fast
 * jeden Treffer ihres Musters — die Pfad-Ausnahme über alle Seiten, nur mit einem Buchstaben
 * mehr (Review cw-core#242, Befund 3). Ein Satz-Teil braucht mindestens ein eigenes Wort.
 *
 * @param {string} n normalisierte Phrase
 * @param {Iterable<string>} muster normalisierte Muster
 * @returns {'gleich' | 'ohne-wort' | null}
 */
function freibrief(n, muster) {
  // Ein Wort trägt mindestens einen Buchstaben oder eine Ziffer: „rechtssicher –" hat EIN
  // Wort, nicht zwei — sonst hob der Gedankenstrich die Sperre auf (Review cw-core#248, B4).
  const woerter = (t) => t.split(' ').filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
  /** @type {'gleich' | 'ohne-wort' | null} */
  let art = null;
  for (const m of muster) {
    if (n === m) return 'gleich';
    if (beugt(n, m) && woerter(n) <= woerter(m)) art = 'ohne-wort';
  }
  return art;
}

/**
 * Enthält `n` das Muster `m` an einem Wortanfang? `rechtssichere` und `dsgvo-rechtssicher`
 * ja (Beugung, Bindestrich-Vorsatz), `bestpreisgarantie` für `garantie` nein: eine
 * Zusammensetzung deckt nur ihre eigenen Treffer, nicht fast jeden des Musters, und ist
 * damit kein Freibrief (Review cw-core#248, B5).
 *
 * @param {string} n normalisierte Phrase
 * @param {string} m normalisiertes Muster
 */
function beugt(n, m) {
  for (let i = n.indexOf(m); i !== -1; i = n.indexOf(m, i + 1)) {
    if (i === 0 || !/[\p{L}\p{N}]/u.test(n[i - 1])) return true;
  }
  return false;
}

/**
 * Prüft eine gebaute Seite gegen die Formulierungsliste.
 *
 * Gemeldet wird JEDES Vorkommen je Ort — dieselbe Verdeckungsfalle wie beim Platzhaltertext-
 * Guard: ein Treffer darf den zweiten auf derselben Seite nicht verschlucken. Entdoppelt wird
 * nur, was an GENAU DERSELBEN Position im selben Ort landet (zwei Listeneinträge, die sich
 * auf dasselbe Zeichen normalisieren).
 *
 * Überlappende Treffer fallen ausdrücklich NICHT weg: stehen „rechtssicher" und
 * „DSGVO-rechtssicher" beide in der Liste, meldet „DSGVO-rechtssicher" an seiner Position und
 * „rechtssicher" fünf Zeichen später — zwei Befunde, so gewollt und so getestet. Wer eine
 * Formulierung einmal gemeldet haben will, trägt sie einmal ein.
 *
 * Eine `erlaubte` Formulierung hebt einen Treffer auf, wenn sie ihn UMSCHLIESST — der
 * Trefferbereich muss vollständig innerhalb eines Vorkommens der erlaubten Phrase liegen.
 * Aufgehobene Befunde fallen NICHT aus dem Ergebnis, sie tragen `aufgehobenDurch`. Ein stiller
 * Wegfall wäre der nächste stumme Schalter: so kann der Aufrufer melden, WAS eine Ausnahme
 * gerade zudeckt, und eine Probe kann prüfen, dass sie nur das verneinte Vorkommen deckt und
 * nicht auch das unverneinte (cw-core#236).
 *
 * @param {string} html roher HTML-Inhalt der Seite
 * @param {string} seite relativer Pfad für die Meldung, z. B. `blog/dsgvo/index.html`
 * @param {readonly string[]} formulierungen Teilstrings, Groß-/Kleinschreibung egal; leer → keine Befunde
 * @param {readonly string[]} [erlaubte] Phrasen, die einen umschlossenen Treffer aufheben
 * @returns {VerbotslistenBefund[]} erst der sichtbare Text, dann Titel und Metas; je Ort nach Position
 */
export function pruefeVerbotsliste(html, seite, formulierungen, erlaubte = []) {
  const liste = normalisierteListe(formulierungen);
  if (liste.size === 0) return [];
  // Eine Phrase, die nur das Muster selbst ist oder es ohne eigenes Wort beugt, wäre die
  // Pfad-Ausnahme über alle Seiten (Review cw-core#238 B1, cw-core#242 B3). Sie wird nicht
  // angewandt; `pruefeErlaubteListe()` meldet sie beim Laden.
  const erlaubtListe = new Map(
    [...normalisierteListe(erlaubte)].filter(([n]) => freibrief(n, liste.keys()) === null),
  );

  // Einmal reinigen, dann beide Quellen daraus: nur so entfernt `replace(TITLE, ' ')` den
  // Titel, den `kopfInhalte()` auch als Titel gezählt hat. Auf rohem HTML konnten die zwei
  // auf verschiedene `<title>` zeigen (Fall B/C in `ohneUnsichtbares`).
  const rein = ohneUnsichtbares(html);
  /** @type {{ ort: VerbotslistenOrt, inhalt: string }[]} */
  const quellen = [
    // Der Dokumenttitel wird vor dem Textstrom entfernt, sonst stünde er zweimal da.
    { ort: 'text', inhalt: sichtbarerText(rein.replace(TITLE, ' ')) },
    ...kopfInhalte(rein),
  ];

  /** @type {VerbotslistenBefund[]} */
  const befunde = [];
  for (const { ort, inhalt } of quellen) {
    const text = inhalt.replace(/\s+/g, ' ').trim();
    const klein = text.toLowerCase();
    // toLowerCase() kann die Länge ändern (etwa bei „İ"); dann kommt der Kontext aus der
    // Kleinfassung, sonst stimmen die Positionen nicht mehr.
    const anzeige = klein.length === text.length ? text : klein;
    // Die Vorkommen der erlaubten Phrasen EINMAL je Quelle, nicht je Treffer — und in
    // `klein` gesucht, derselben Zeichenkette wie die Muster, sonst stimmen die Positionen
    // nicht zusammen.
    /** @type {{ von: number, bis: number, original: string }[]} */
    const freigaben = [];
    for (const [n, original] of erlaubtListe) {
      for (let i = klein.indexOf(n); i !== -1; i = klein.indexOf(n, i + 1)) {
        freigaben.push({ von: i, bis: i + n.length, original });
      }
    }
    /** @type {Map<number, VerbotslistenBefund>} */
    const proPosition = new Map();
    // Jede Phrase, die an einer Stelle einen Treffer aufhebt, auch wenn ein anderer Treffer
    // dort den Befund stellt. Sonst trug der Befund nur eine von zwei nötigen Phrasen, die
    // andere galt als ungenutzt, und der Build riet zum Streichen (Review cw-core#242, B2).
    /** @type {Map<number, Set<string>>} */
    const aufhebungen = new Map();
    for (const [n, original] of liste) {
      for (let i = klein.indexOf(n); i !== -1; i = klein.indexOf(n, i + 1)) {
        const ende = i + n.length;
        // UMSCHLIESSEN, nicht überlappen: der ganze Treffer muss in einem Vorkommen der
        // erlaubten Phrase liegen. Nur so trennt die Ausnahme „ohne korrekte Inhalte keine
        // Anfragen bringt" von „eine Website, die Anfragen bringt" im selben Dokument.
        const freigabe = freigaben.find((f) => f.von <= i && ende <= f.bis);
        // ALLE umschließenden Phrasen, nicht nur die erste: sonst hinge an der Reihenfolge der
        // Ausnahmeliste, welche als ungenutzt gemeldet wird.
        for (const f of freigaben) {
          if (f.von <= i && ende <= f.bis) aufhebungen.set(i, (aufhebungen.get(i) ?? new Set()).add(f.original));
        }
        // Ein Befund je Startposition, der erste Listeneintrag gewinnt (die Kundenliste steht
        // vorn, ihr Treffer ist WARN). AUSSER der vorhandene ist aufgehoben und dieser nicht:
        // sonst verdeckte ein aufgehobenes kurzes Muster ein längeres, das die Phrase NICHT
        // umschließt, und das Ergebnis hinge an der Reihenfolge der Liste (Review #238, B2).
        const vorher = proPosition.get(i);
        if (vorher && !(vorher.aufgehobenDurch !== undefined && !freigabe)) continue;
        /** @type {VerbotslistenBefund} */
        const befund = {
          seite,
          ort,
          formulierung: original,
          treffer: anzeige.slice(i, ende),
          kontext: anzeige.slice(Math.max(0, i - 45), ende + 45).trim(),
        };
        if (freigabe) befund.aufgehobenDurch = freigabe.original;
        proPosition.set(i, befund);
      }
    }
    // Nur wenn an der Stelle KEIN offener Treffer gewinnt, zählt jede umschließende Phrase als
    // genutzt: gewinnt ein offener, ändert das Streichen einer Phrase am Ergebnis nichts.
    // „Genutzt" heißt nicht „einzeln nötig": zwei Phrasen, die dieselbe Stelle decken, gelten
    // beide als genutzt, obwohl jede allein reichte (Review cw-core#248, B6). Gewollt: ein
    // Streich-Rat für eine von beiden ist ein Urteil über Wortlaut, nicht über Wirkung.
    for (const [i, b] of proPosition) {
      if (b.aufgehobenDurch !== undefined) b.alleAufhebungen = [...(aufhebungen.get(i) ?? [])];
    }
    befunde.push(...[...proPosition.entries()].sort((a, b) => a[0] - b[0]).map(([, b]) => b));
  }
  return befunde;
}

/**
 * Ladeprüfung der Ausnahmeliste: eine erlaubte Formulierung, die KEIN verbotenes Muster
 * enthält, kann niemals einen Treffer aufheben. Sie ist dann toter Eintrag, der Sicherheit
 * vorspiegelt — und zwar schon vor dem ersten Build, also prüfbar ohne eine einzige Seite.
 *
 * Das ist der Grund, warum die Ausnahme ein exakter Teilstring ist und keine Satzgrenze:
 * ein exakter Teilstring lässt sich gegen die Verbotsliste selbst prüfen. Eine Satzgrenze
 * müsste der Guard raten, und Raten im Stummschalter ist genau das, was cw-core#236
 * verhindern soll.
 *
 * @param {readonly string[]} erlaubte
 * @param {readonly string[]} formulierungen
 * @returns {{ phrase: string, grund: string }[]} leer = alle Einträge können greifen
 */
export function pruefeErlaubteListe(erlaubte, formulierungen) {
  const verboten = normalisierteListe(formulierungen);
  const muster = [...verboten.keys()];
  /** @type {{ phrase: string, grund: string }[]} */
  const befunde = [];
  for (const [n, original] of normalisierteListe(erlaubte)) {
    // Enthalten heißt nicht umschließen MIT Kontext: ist die Phrase das Muster selbst, hebt
    // sie jeden Treffer auf (Review cw-core#238, Befund 1). `pruefeVerbotsliste()` wendet
    // sie deshalb nicht an — hier steht, warum.
    const art = freibrief(n, muster);
    if (art === 'gleich') {
      befunde.push({
        phrase: original,
        grund: 'ist selbst ein verbotenes Muster und würde jeden Treffer darauf aufheben, deshalb wird der Eintrag nicht angewandt',
      });
      continue;
    }
    if (art === 'ohne-wort') {
      befunde.push({
        phrase: original,
        grund: 'beugt ein verbotenes Muster, hat aber kein eigenes Wort und würde fast jeden Treffer darauf aufheben, deshalb wird der Eintrag nicht angewandt',
      });
      continue;
    }
    if (!muster.some((m) => n.includes(m))) {
      befunde.push({
        phrase: original,
        grund: 'enthält keine der verbotenen Formulierungen und kann deshalb keinen Treffer aufheben',
      });
    }
  }
  return befunde;
}
