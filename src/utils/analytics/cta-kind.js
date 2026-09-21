/**
 * cta-kind.js — trennt Conversion-Klicks von Navigation.
 *
 * Das Problem
 * -----------
 * Das Goal `CTA Click` sollte messen, wie oft jemand Kontakt aufnehmen will.
 * Gemessen hat es etwas anderes: Jedes Element mit `data-cta` zählte, und
 * `data-cta` saß auch auf Elementen, die nur weiterblättern — Leistungskarten,
 * sekundäre Hero-Buttons, der Kontakt-Link in der Navigationsleiste.
 *
 * Belegt an den Plausible-Exporten (Mai–Juli 2026), bereinigt um die in v0.66.0
 * bereits behobenen `nav:*`-Treffer: das Verhältnis lag bei rund 4:1 zugunsten
 * der Navigation. gottl-richter-gomeier 40 zu 9, schiller-gartenbau 36 zu 9.
 * Bei digital-direkt waren von 140 Besuchern mit `CTA Click` ganze 11 an einem
 * Angebot interessiert — beinahe hätte das zu einer Formular-Optimierung
 * geführt, wo in Wahrheit schlicht der Traffic fehlte.
 *
 * Die Lösung, und warum sie am href hängt
 * ---------------------------------------
 * Navigation trägt seit v0.156.0 `data-nav-click` statt `data-cta` und feuert
 * `Nav Click` (kein Goal, aber auswertbar). Dasselbe Muster hat v0.66.0 schon
 * für die Navigationsleiste angewandt.
 *
 * Welche der beiden Arten vorliegt, entscheidet nicht die Komponente, sondern
 * das Ziel des Links. Das ist Absicht: `hero-secondary` und `nav-highlight` sind
 * pro Kunde konfigurierbar. Bei einem Kunden zeigt der sekundäre Hero-Button auf
 * „Leistungen ansehen" (Navigation), beim nächsten auf eine Telefonnummer
 * (Conversion). Eine feste Regel „secondary ist immer Navigation" misst dann
 * falsch — und zwar still.
 *
 * Für die Fälle, die eine Heuristik nicht wissen kann, gibt es `force`.
 */

/** Direkte Kontaktaufnahme — unabhängig von der Domain immer Conversion. */
const CONVERSION_SCHEME = /^(tel:|mailto:|sms:)/i;

/** Buchungs- und Messenger-Ziele, bei denen der Klick die Handlung IST. */
const CONVERSION_HOST = /(^|\/\/|\.)(wa\.me|api\.whatsapp\.com|cal\.com|cal\.eu|calendly\.com)(\/|$)/i;

/**
 * Karten- und Routen-Ziele.
 *
 * Bei einem Geschaeft mit Ladenlokal ist „Route anzeigen" das Gegenstueck zum
 * Anruf: Wer sich den Weg zur Filiale heraussuchen laesst, will hin. Das als
 * Navigation zu zaehlen haette bei jedem lokalen Kunden ein echtes Kaufsignal
 * verschluckt — bei baeckerei-zink allein an elf Filialen.
 *
 * Nicht per `force` im Kundenrepo geloest, weil es kein Sonderfall ist, sondern
 * bei jedem Kunden mit Standort auftritt.
 */
const CONVERSION_MAP = /(^|\/\/|\.)(google\.[a-z.]+\/maps|maps\.google\.|maps\.apple\.com|goo\.gl\/maps|openstreetmap\.org)/i;

/**
 * Seitenpfade, auf denen eine Anfrage beginnt. Bewusst knapp gehalten: Jeder
 * zusätzliche Begriff hier macht aus Navigation eine gezählte Conversion, und
 * genau diese schleichende Aufweichung hat das Goal ursprünglich ruiniert.
 *
 * Der Bindestrich zählt als Worttrenner, sonst fielen reale Pfade durch —
 * `/angebot-anfordern` steht so in der vercel.json von digital-direkt,
 * `/kontakt-formular` ist ein gängiges Muster. Ohne ihn bliebe `/kontaktlinsen`
 * trotzdem Navigation: dort folgt auf „kontakt" kein Trenner.
 */
const CONVERSION_PATH = /(^|\/)(kontakt|contact|anfrage|angebot|termin|buchen|booking|bewerbung|beratung)(\/|-|$|[?#])/i;

/** Anker, die auf ein Formular auf derselben Seite springen. */
const CONVERSION_HASH = /#(anfrage|kontakt|contact|termin|angebot|formular|form)\b/i;

/**
 * Art eines Klickziels.
 *
 * Ohne `href` (Buttons, die JavaScript auslösen) lautet die Antwort
 * `navigation` — die vorsichtigere Annahme: Ein zu Unrecht nicht gezählter
 * Klick fehlt in der Statistik, ein zu Unrecht gezählter verfälscht sie.
 * Für echte Conversion-Buttons ohne href ist `force` gedacht.
 */
/**
 * @param {string} [href]
 * @returns {'conversion'|'navigation'}
 */
export function ctaKind(href) {
  if (!href) return 'navigation';
  const h = href.trim();
  if (!h) return 'navigation';
  if (CONVERSION_SCHEME.test(h)) return 'conversion';
  if (CONVERSION_HOST.test(h)) return 'conversion';
  if (CONVERSION_MAP.test(h)) return 'conversion';
  if (CONVERSION_HASH.test(h)) return 'conversion';
  if (CONVERSION_PATH.test(h)) return 'conversion';
  return 'navigation';
}

/**
 * Liefert GENAU EIN Attribut — `data-cta` oder `data-nav-click`, nie beides.
 *
 * Warum `data-nav-click` und nicht schlicht `data-nav`: Header.astro vergibt
 * `data-nav="compact"` bereits als CSS-Zustandsattribut am Header-Element. Ein
 * Listener mit `closest('[data-nav]')` haette von jedem Link aus nach oben
 * gesucht, dort angeschlagen und JEDEN Klick im Header als Navigation mit dem
 * Namen "compact" gezaehlt. Aufgefallen ist das erst, als der neue Guard es
 * meldete — von Hand war es nicht zu sehen.
 *
 * Im Markup per Spread verwenden:
 *   `<a href={x.href} {...ctaAttrs(x.href, `hero-secondary:${x.label}`)}>`
 *
 * Die Exklusivität ist der Punkt: Trüge ein Element beide Attribute, zählte ein
 * Klick als Conversion UND als Navigation. Ein Guard prüft sie zusätzlich im
 * Markup, weil sich diese Funktion umgehen lässt.
 */
/**
 * @param {string|null|undefined} href
 * @param {string} name
 * @param {'conversion'|'navigation'} [force]
 * @returns {{'data-cta': string}|{'data-nav-click': string}}
 */
export function ctaAttrs(href, name, force) {
  const kind = force ?? ctaKind(href);
  return kind === 'conversion' ? { 'data-cta': name } : { 'data-nav-click': name };
}
