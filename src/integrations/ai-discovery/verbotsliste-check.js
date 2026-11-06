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
 * @typedef {{ seite: string, ort: VerbotslistenOrt, formulierung: string, treffer: string, kontext: string }} VerbotslistenBefund
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
 * @param {string} html roher HTML-Inhalt der Seite
 * @param {string} seite relativer Pfad für die Meldung, z. B. `blog/dsgvo/index.html`
 * @param {readonly string[]} formulierungen Teilstrings, Groß-/Kleinschreibung egal; leer → keine Befunde
 * @returns {VerbotslistenBefund[]} erst der sichtbare Text, dann Titel und Metas; je Ort nach Position
 */
export function pruefeVerbotsliste(html, seite, formulierungen) {
  const liste = normalisierteListe(formulierungen);
  if (liste.size === 0) return [];

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
    /** @type {Map<number, VerbotslistenBefund>} */
    const proPosition = new Map();
    for (const [n, original] of liste) {
      for (let i = klein.indexOf(n); i !== -1; i = klein.indexOf(n, i + 1)) {
        if (proPosition.has(i)) continue;
        proPosition.set(i, {
          seite,
          ort,
          formulierung: original,
          treffer: anzeige.slice(i, i + n.length),
          kontext: anzeige.slice(Math.max(0, i - 45), i + n.length + 45).trim(),
        });
      }
    }
    befunde.push(...[...proPosition.entries()].sort((a, b) => a[0] - b[0]).map(([, b]) => b));
  }
  return befunde;
}
