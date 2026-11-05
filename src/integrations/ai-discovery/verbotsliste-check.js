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
 * ZWEI LISTEN, ZWEI STUFEN. Die Flotte bekommt ohne Konfiguration die drei Garantie-Prädikate
 * (`GARANTIE_PRAEDIKATE`): ein Prädikat, das ein Ergebnis zusagt, das keine Seite belegen
 * kann. Treffer darauf meldet der Aufrufer als Info, nie als Warnung — der Release-Train
 * zählt WARN-Köpfe, und ein neuer Guard darf seinen eigenen Rollout nicht blocken
 * (cw-core#196). Erst eine eigene Kundenliste (`verboteneFormulierungen`) hebt auf WARN,
 * `strictVerbotsliste` auf Abbruch.
 *
 * TEILSTRING, nicht Wortgrenze: „rechtssicher" soll „rechtssichere", „DSGVO-rechtssicherer"
 * und „Rechtssicherheit" treffen. Die Kehrseite steht beim Eintragen: ein kurzes Wort wie
 * „Beste" trifft auch „bestellen" und „bestehen" — in die Liste gehört es nur mit Kontext
 * („Beste Webagentur"). Groß-/Kleinschreibung und Whitespace werden vorher normalisiert,
 * ein Zeilenumbruch mitten in „anwaltlich geprüft" ändert nichts.
 *
 * NICHT geprüft: `<script>` (auch JSON-LD), `<style>`, HTML-Kommentare, `<pre>`/`<code>`,
 * sonstige Attributwerte (alt, aria-label, placeholder) — dieselbe Abgrenzung wie beim
 * Platzhaltertext-Guard, aus denselben dort gemessenen Gründen.
 */

import { sichtbarerText } from './platzhaltertext-check.js';

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
 * Entities in Attributwerten und im Titel: `&amp;`, `&quot;`, `&#39;` werden zu ihrem
 * Zeichen, der Rest zu einem Leerzeichen (wie in `sichtbarerText`).
 * @param {string} s
 */
function entitiesWeg(s) {
  return s
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;|&apos;/gi, "'")
    .replace(/&nbsp;/gi, ' ')
    .replace(/&[a-z]+;|&#\d+;/gi, ' ');
}

/**
 * Ein Attributwert aus einem Tag-String, doppelt oder einfach angeführt.
 * @param {string} tag
 * @param {string} name
 * @returns {string | undefined}
 */
function attribut(tag, name) {
  const m = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i').exec(tag);
  return m ? (m[1] ?? m[2]) : undefined;
}

const TITLE = /<title\b[^>]*>([\s\S]*?)<\/title>/i;

/**
 * Titel und Meta-Inhalte einer Seite, jeweils mit ihrem Ort. `sichtbarerText()` lässt den
 * Titel als Text stehen und wirft Meta-Inhalte weg (Attribute) — hier werden beide getrennt
 * eingesammelt, damit der Befund sagt, WO die Formulierung steht. Nur das erste `<title>`
 * zählt (der Dokumenttitel); SVG-Titel im Body bleiben Teil des sichtbaren Texts.
 * @param {string} html
 * @returns {{ ort: VerbotslistenOrt, inhalt: string }[]}
 */
export function kopfInhalte(html) {
  /** @type {{ ort: VerbotslistenOrt, inhalt: string }[]} */
  const aus = [];
  const t = TITLE.exec(html);
  if (t) aus.push({ ort: 'title', inhalt: entitiesWeg(t[1]) });
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = m[0];
    const name = (attribut(tag, 'name') ?? attribut(tag, 'property') ?? '').toLowerCase();
    if (!META_FELDER.includes(name)) continue;
    const content = attribut(tag, 'content');
    if (content === undefined) continue;
    aus.push({ ort: /** @type {VerbotslistenOrt} */ (`meta:${name}`), inhalt: entitiesWeg(content) });
  }
  return aus;
}

/**
 * Prüft eine gebaute Seite gegen die Formulierungsliste.
 *
 * Gemeldet wird JEDES Vorkommen je Ort — dieselbe Verdeckungsfalle wie beim Platzhaltertext-
 * Guard: ein Treffer darf den zweiten auf derselben Seite nicht verschlucken. Doppelte
 * Fundstellen (gleicher Ort, gleiche Position) fallen weg, etwa wenn „rechtssicher" und
 * „DSGVO-rechtssicher" beide in der Liste stehen.
 *
 * @param {string} html roher HTML-Inhalt der Seite
 * @param {string} seite relativer Pfad für die Meldung, z. B. `blog/dsgvo/index.html`
 * @param {readonly string[]} formulierungen Teilstrings, Groß-/Kleinschreibung egal; leer → keine Befunde
 * @returns {VerbotslistenBefund[]} erst der sichtbare Text, dann Titel und Metas; je Ort nach Position
 */
export function pruefeVerbotsliste(html, seite, formulierungen) {
  /** @type {Map<string, string>} normalisiert → Original aus der Liste (erstes Vorkommen) */
  const liste = new Map();
  for (const f of formulierungen) {
    const n = f.replace(/\s+/g, ' ').trim().toLowerCase();
    if (n && !liste.has(n)) liste.set(n, f.trim());
  }
  if (liste.size === 0) return [];

  /** @type {{ ort: VerbotslistenOrt, inhalt: string }[]} */
  const quellen = [
    // Der Dokumenttitel wird vor dem Textstrom entfernt, sonst stünde er zweimal da.
    { ort: 'text', inhalt: sichtbarerText(html.replace(TITLE, ' ')) },
    ...kopfInhalte(html),
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
