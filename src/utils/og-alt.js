/**
 * @cw/core/utils/og-alt — die KI-Offenlegung im Alt-Text der Vorschaubilder.
 *
 * WARUM ES DAS GIBT
 * Ein Open-Graph-Bild wird nie als `<img>` gerendert. Social- und Messenger-Crawler holen
 * die Datei direkt vom Server und zeigen sie außerhalb der Website — ein Badge im DOM
 * erreicht sie nicht. Deshalb steckt die Kennzeichnung dort in den Pixeln
 * (`src/og/ai-label.mjs`, seit v0.147.0).
 *
 * Pixel tragen aber keinen Text. Das EU-Symbol enthält null `<text>`-Elemente, seine
 * Beschriftung ist Vektorpfad. Art. 50 Abs. 5 AI Act verlangt, dass die Information den
 * Barrierefreiheitsanforderungen entspricht — dafür braucht es eine textliche Fassung, und
 * `og:image:alt` ist die einzige Stelle, an der ein Vorschaubild eine bekommt.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  DIESER KANAL ERFÜLLT DIE PFLICHT NICHT — ER ERGÄNZT SIE.
 *
 *  Facebook, WhatsApp und Signal zeigen `og:image:alt` in der Regel gar nicht an. Wer die
 *  Offenlegung allein hierher legte, hätte sie faktisch nirgends. Die Pflicht erfüllen die
 *  eingebrannten Pixel; dieser Text bedient den Barrierefreiheits-Teil und die Clients,
 *  die ihn vorlesen.
 *
 *  Wer diesen Kanal später ausbaut, darf daraus nicht schließen, das Einbrennen sei
 *  entbehrlich geworden.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Herkunft: portiert aus `siluri.de/src/lib/og-alt.ts`, wo dieselbe Aufteilung seit dem
 * 31.08.2026 für die statischen OG-Bilder läuft. Abweichung: der Wortlaut kommt hier aus
 * `bildherkunft.js` statt aus einer eigenen Konstante — siluri.de führt ihn an drei Stellen
 * und hält sie per Test gegeneinander, was dort als offene Rechnung vermerkt ist.
 *
 * Rein rechnend, kein I/O — damit die Logik ohne Astro-Build prüfbar ist.
 *
 * Rechtsstand: VO (EU) 2024/1689, Fassung 02024R1689-20260727. Keine amtliche Fassung,
 * keine Rechtsberatung.
 */
import { OFFENLEGUNG_TEXT } from './bildherkunft.js';

/** Trennzeichen zwischen Bildbeschreibung und Offenlegung. */
const TRENNER = ' — ';

/**
 * Obergrenze für `og:image:alt`.
 *
 * Verschiedene Validatoren kappen zwischen 420 und 1000 Zeichen; 420 ist der strengste
 * Wert, der uns begegnet ist. Gekappt wird die **Beschreibung**, nie die Offenlegung —
 * sonst fiele beim Kürzen ausgerechnet das weg, wofür die Zeile da ist.
 */
export const MAX_ALT_LAENGE = 420;

/** Regex-Metazeichen entschärfen, damit ein späterer Wortlaut mit `.` oder `(` nicht still danebengreift. */
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Den Alt-Text um die Offenlegung ergänzen — oder unverändert lassen.
 *
 * @param {string} basis      bisheriger Alt-Text (in der Praxis `ogImageAlt ?? description`)
 * @param {{herkunft?: string}|null|undefined} ergebnis  Rückgabe von `resolveBildHerkunft`
 * @param {boolean} pflichtig `istKennzeichnungspflichtig` für dasselbe Ergebnis
 * @param {number} [maxLaenge=MAX_ALT_LAENGE]
 * @returns {string}
 *
 * Die Pflichtfrage wird bewusst **übergeben** statt hier entschieden: Die Antwort darauf
 * gehört in `bildherkunft.js` und nirgendwo sonst. Zwei Stellen, die dieselbe Rechtsfrage
 * beantworten, driften auseinander.
 */
export function altMitOffenlegung(basis, ergebnis, pflichtig, maxLaenge = MAX_ALT_LAENGE) {
  const text = typeof basis === 'string' ? basis : '';
  if (!pflichtig) return text;

  const herkunft = ergebnis?.herkunft;
  const wortlaut =
    herkunft === 'ki-veraendert' ? OFFENLEGUNG_TEXT['ki-veraendert'] : OFFENLEGUNG_TEXT['ki-erzeugt'];
  const suffix = TRENNER + wortlaut;

  if (!text) return wortlaut;
  if (text.length + suffix.length <= maxLaenge) return text + suffix;

  // Zu lang: die Beschreibung kürzen, nie die Offenlegung. Bleibt für die Beschreibung
  // nichts Sinnvolles übrig, steht dort nur noch der Wortlaut — eine abgeschnittene
  // Beschreibung ohne Offenlegung wäre die schlechtere Zeile von beiden.
  const platz = maxLaenge - suffix.length;
  if (platz <= 1) return wortlaut;
  return text.slice(0, platz - 1).trimEnd() + '…' + suffix;
}

/**
 * Die Offenlegung wieder abstreifen — die Umkehrung von {@link altMitOffenlegung}.
 *
 * WARUM DAS NÖTIG IST (und nicht in der siluri.de-Vorlage steht)
 * `og-pages.js` läuft **nach** dem Build und kann über ein bereits verarbeitetes `dist/`
 * erneut laufen — bei einem Rebuild ohne `dist`-Löschung, oder wenn ein Aufrufer die
 * Funktion zweimal ruft. Ohne Abstreifen stünde danach `… — Mit KI erzeugt — Mit KI
 * erzeugt` in der Zeile. Damit ist das Umschreiben idempotent.
 *
 * Zweiter Zweck: einen kundeneigenen Alt-Text erhalten, statt ihn zu überschreiben. Was
 * vor dem Suffix stand, bleibt stehen.
 *
 * Der Trenner ist **erforderlich** — sonst verlöre eine Beschreibung, die zufällig auf
 * „Mit KI erzeugt" endet, ihr letztes Satzstück. Einzige Ausnahme ist der Text, der nur
 * aus dem Wortlaut besteht: genau so gibt `altMitOffenlegung()` ihn bei leerer Basis aus.
 *
 * @param {string} text
 * @returns {string}  der Text ohne Offenlegung; `''`, wenn nichts anderes darin stand
 */
export function ohneOffenlegung(text) {
  if (typeof text !== 'string') return '';
  const alle = Object.values(OFFENLEGUNG_TEXT);

  let t = text.trimEnd();
  if (alle.includes(t.trim())) return '';

  const muster = new RegExp(`${esc(TRENNER)}(?:${alle.map(esc).join('|')})$`);
  // Schleife statt einfachem replace: ein Bestand, der schon doppelt gestempelt wurde,
  // soll in einem Durchgang sauber werden und nicht bei jedem Lauf eine Lage verlieren.
  let vorher;
  do {
    vorher = t;
    t = t.replace(muster, '').trimEnd();
  } while (t !== vorher);
  return t;
}
