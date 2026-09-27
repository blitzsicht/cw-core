// @ts-check
/**
 * pruefhinweis.js — der Prüfhinweis für Bewertungen nach § 5b Abs. 3 UWG, an EINER Stelle.
 *
 * Wer Bewertungen zugänglich macht, muss angeben, ob und wie er sicherstellt, dass sie
 * von Kunden stammen, die die Leistung tatsächlich genutzt haben. Für Google-Bewertungen,
 * die ein Kunde nur wiedergibt, lautet die ehrliche Antwort: gar nicht. Genau das sagt
 * der Satz unten.
 *
 * Drei Stellen brauchen ihn, und sie dürfen nicht auseinanderlaufen:
 *   - GoogleBewertungen.astro zeigt ihn unter den Zahlen,
 *   - Testimonials.astro zeigt ihn bei `reviewSource="google"`,
 *   - der Guard `checkReviewClaims` (ai-discovery) sucht ihn im gebauten HTML.
 * Deshalb liegen Text UND Erkennung hier. Eine zweite, leicht abweichende Regex im Guard
 * hätte irgendwann einen korrekt gesetzten Hinweis als fehlend gemeldet — oder umgekehrt.
 */

/** Der Standardtext für wiedergegebene Google-Bewertungen. */
export const PRUEFHINWEIS_GOOGLE =
  'Die Bewertungen stammen von Google-Nutzern. Wir prüfen nicht, ob die Verfasser unsere Leistungen tatsächlich in Anspruch genommen haben.';

/**
 * Erkennt eine Aussage darüber, OB geprüft wird — positiv („Wir prüfen jede Bewertung …“)
 * wie negativ („Wir prüfen nicht, ob …“, „werden nicht geprüft“). Beides erfüllt die
 * Informationspflicht; § 5b Abs. 3 UWG verlangt Transparenz, keine Prüfung.
 *
 * Grenze: erkannt werden die üblichen deutschen Satzbauten mit „prüfen/überprüfen/
 * verifizieren“. Eine Umschreibung ohne diese Verben („Wir kontrollieren …“) fällt durch
 * und erzeugt eine Warnung — bewusst, der Guard ist soft-warn.
 */
// Wortgrenzen für deutsche Wörter: `\b` kennt nur ASCII, vor „über…“ fände es keine
// Grenze. Deshalb Lookarounds über Unicode-Buchstaben (Flag `u`).
const A = '(?<![\\p{L}\\p{N}])';
const E = '(?![\\p{L}\\p{N}])';

const HINWEIS_RE = new RegExp(
  `${A}(?:wir\\s+(?:über)?prüfen|(?:über)?prüfen\\s+wir|wir\\s+verifizieren|verifizieren\\s+wir` +
    `|(?:wird|werden)\\s+(?:nicht\\s+)?(?:über)?geprüft|(?:wird|werden)\\s+(?:nicht\\s+)?verifiziert` +
    `|nicht\\s+(?:über)?geprüft|keine\\s+(?:über)?prüfung)${E}`,
  'iu',
);

/**
 * Nur die POSITIVE Prüfbeschreibung — sie allein rechtfertigt Wörter wie „echte“ oder
 * „verifizierte“ Bewertungen (UWG Anhang Nr. 23b). „Wir prüfen nicht“ tut das nicht.
 */
const PRUEFBESCHREIBUNG_RE = new RegExp(
  `${A}(?:wir\\s+(?:über)?prüfen|(?:über)?prüfen\\s+wir|wir\\s+verifizieren|verifizieren\\s+wir)${E}` +
    `(?!\\s*,?\\s*(?:nicht|keine)${E})` +
    `|${A}(?:wird|werden)\\s+(?:vor\\s+\\S+\\s+)?(?:über)?geprüft${E}` +
    `|${A}(?:wird|werden)\\s+(?:vor\\s+\\S+\\s+)?verifiziert${E}`,
  'iu',
);

/**
 * Worauf sich die Prüfaussage beziehen muss. Ohne diesen Bezug zählte jedes „wir prüfen“
 * auf der Seite — gefunden am echten Build von donau-profi (26.09.2026): „Sprechen Sie uns
 * einfach an — wir prüfen gerne, ob wir auch Ihr Objekt betreuen können.“ hätte den
 * fehlenden Prüfhinweis dort verdeckt.
 */
const BEZUG_RE = /bewertung|rezension|verfasser|kundenstimme|kundenmeinung|erfahrungsbericht/i;

/**
 * Sätze, in denen die Prüfaussage stehen darf: der Satz selbst oder, falls er selbst
 * keinen Bezug nennt („Wir prüfen nicht, ob sie …“), zusammen mit dem Satz davor.
 * @param {string} text
 * @returns {string[]}
 */
function saetzeMitBezug(text) {
  const saetze = text.split(/(?<=[.!?])\s+|\n+/).map((x) => x.trim()).filter(Boolean);
  /** @type {string[]} */
  const out = [];
  for (let i = 0; i < saetze.length; i++) {
    const kontext = i > 0 ? `${saetze[i - 1]} ${saetze[i]}` : saetze[i];
    if (BEZUG_RE.test(kontext)) out.push(saetze[i]);
  }
  return out;
}

/**
 * Enthält der Text einen Prüfhinweis (positiv oder negativ), der sich auf Bewertungen
 * bezieht?
 * @param {string | null | undefined} text
 * @returns {boolean}
 */
export function hatPruefhinweis(text) {
  if (!text) return false;
  // Eine positive Prüfbeschreibung ist immer auch ein Hinweis.
  return saetzeMitBezug(text).some((s) => HINWEIS_RE.test(s) || PRUEFBESCHREIBUNG_RE.test(s));
}

/**
 * Beschreibt der Text eine tatsächliche Prüfung von Bewertungen?
 * @param {string | null | undefined} text
 * @returns {boolean}
 */
export function hatPruefbeschreibung(text) {
  if (!text) return false;
  return saetzeMitBezug(text).some((s) => PRUEFBESCHREIBUNG_RE.test(s));
}
