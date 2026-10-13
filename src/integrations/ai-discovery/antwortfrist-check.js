// @ts-check
/**
 * @cw/core/integrations/ai-discovery/antwortfrist-check
 *
 * Antwortfrist-Guard: meldet im gebauten HTML jede Zusage „Wir melden uns innerhalb von
 * 24 Stunden …“, die nicht aus der bewusst gesetzten Angabe `siteData.antwortfrist` stammt.
 * Pure String-Logik pro Seiten-HTML — der Directory-Walk passiert im Aufrufer (index.ts),
 * gleicher Split wie review-claims-check.js.
 *
 * Auslöser (blitzsicht-ops#950, Messung 13.10.2026): 10 von 15 Live-Seiten versprachen
 * Anfragenden eine Antwort „innerhalb von 24 Stunden“. Die Frist kam aus drei cw-core-
 * Defaults (ContactForm, DankePage, Bestätigungsmail) und war bei keinem Kunden belegt.
 * Seit v0.172.0 nennen die Defaults keine Frist mehr; dieser Guard hält fest, dass auch
 * kein Kundentext eine Frist verspricht, die der Kunde nicht als Angabe gesetzt hat.
 *
 * Zwei Befunde:
 *   (a) `frist_ohne_angabe` — eine Antwortfrist im Text, `siteData.antwortfrist` fehlt.
 *   (b) `frist_weicht_ab`   — eine Antwortfrist, die nicht zur Angabe passt
 *       (Angabe „24 Stunden“, Text „innerhalb von 48 Stunden“). „24 h“, „24 Std.“ und
 *       „24 Stunden“ gelten als gleich.
 *
 * Erkennung (utils/antwortfrist.js, dieselbe Stelle, die die Texte schreibt): eine Frist-
 * Phrase („innerhalb (von) N Stunden/Werktagen/…“, „binnen …“) in einem Satz mit Antwort-
 * Verb (melden, antworten, zurückrufen, reagieren …) und Selbstbezug (wir/uns/ich,
 * „erhalten Sie“).
 *
 * GRENZEN — bewusst einfach, soft-warn:
 *   - Inhalte von <script>, <style> und <template> zählen nicht (JSON-LD wiederholt den
 *     sichtbaren Text nur). Per CSS oder `hidden` versteckter Text zählt — die Erfolgs-
 *     meldung von ContactForm steht `hidden` im HTML und erscheint nach dem Absenden.
 *   - Fristen ohne „innerhalb/binnen“ („Antwort in 24 h“, „Rückruf am selben Tag“) fallen
 *     durch. Ebenso eine Zusage ohne Selbstbezug („Anfragen werden innerhalb von 24 h
 *     beantwortet“).
 *   - Ratgebertexte mit Selbstbezug („Wir empfehlen, innerhalb von 5 Minuten zu antworten“)
 *     melden fälschlich — dann hilft `checkAntwortfrist: false` pro Site oder Umformulieren.
 *
 * @typedef {'frist_ohne_angabe'|'frist_weicht_ab'} AntwortfristIssueType
 * @typedef {{ type: AntwortfristIssueType, page: string, frist: string, details: string }} AntwortfristIssue
 */

import { antwortfristAngabe, findeAntwortfristen, fristSchluessel } from '../../utils/antwortfrist.js';

/** Elemente, deren Inhalt kein sichtbarer Text ist. */
const UNSICHTBAR_RE = /<(script|style|template)\b[^>]*>[\s\S]*?<\/\1\s*>|<!--[\s\S]*?-->/gi;
/** Block-Elemente trennen Text wie ein Satzende. */
const BLOCK_TAG_RE =
  /<\/?(?:p|div|h[1-6]|li|ul|ol|dt|dd|td|th|tr|blockquote|figcaption|br|hr|section|article|header|footer|aside|main|nav|form|label|button|summary|details)\b[^>]*>/gi;

/** @type {Record<string, string>} */
const ENTITAETEN = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", ndash: '–', mdash: '—' };

/** @param {string} html */
export function sichtbarerText(html) {
  return String(html)
    .replace(UNSICHTBAR_RE, ' ')
    .replace(BLOCK_TAG_RE, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITAETEN[n.toLowerCase()] ?? m)
    .replace(/[ \t ]+/g, ' ');
}

/**
 * @param {string} html            – gebautes HTML einer Seite
 * @param {string} page            – Pfad relativ zu dist (für die Meldung)
 * @param {unknown} antwortfrist   – `siteData.antwortfrist`
 * @returns {AntwortfristIssue[]}
 */
export function checkAntwortfrist(html, page, antwortfrist) {
  const angabe = antwortfristAngabe(antwortfrist);
  const soll = angabe ? fristSchluessel(angabe) : null;
  /** @type {AntwortfristIssue[]} */
  const issues = [];
  const gesehen = new Set();
  for (const t of findeAntwortfristen(sichtbarerText(html))) {
    if (soll && t.schluessel === soll) continue;
    const key = `${t.satz}\u0000${t.frist}`;
    if (gesehen.has(key)) continue;
    gesehen.add(key);
    const satz = t.satz.length > 140 ? `${t.satz.slice(0, 137)}…` : t.satz;
    issues.push(
      soll
        ? {
            type: 'frist_weicht_ab',
            page,
            frist: t.frist,
            details:
              `${page}: „${satz}“ nennt „${t.frist}“, siteData.antwortfrist ist aber „${angabe}“. ` +
              `Text an die Angabe anpassen oder die Angabe korrigieren.`,
          }
        : {
            type: 'frist_ohne_angabe',
            page,
            frist: t.frist,
            details:
              `${page}: „${satz}“ verspricht eine Antwortfrist („${t.frist}“), aber ` +
              `siteData.antwortfrist ist nicht gesetzt. Nur mit Zusage des Kunden: ` +
              `antwortfrist setzen; sonst den Satz ohne Frist formulieren.`,
          },
    );
  }
  return issues;
}
