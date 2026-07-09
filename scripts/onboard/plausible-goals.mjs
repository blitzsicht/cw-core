/**
 * plausible-goals.mjs — SSOT für Plausible-Conversion-Goals (self-hosted CE).
 *
 * Warum diese Datei existiert (Root-Cause-Fix):
 * Goals waren bisher reiner Dashboard-Zustand ohne Code-SSOT. Beim Umzug
 * plausible.io → self-hosted CE gingen alle Goal-Definitionen verloren (der
 * CSV-Import übertrug nur Statistiken), und `onboard-site` legte nie Goals an.
 * Ergebnis: lückenhafte Conversion-Messung über den ganzen Cluster.
 *
 * Diese Liste ist die deklarative Quelle, aus der `plausible-add-goals.mjs`
 * provisioniert. Die Event-Namen MÜSSEN mit den von `<PlausibleEvents>`
 * gefeuerten Events übereinstimmen (src/components/analytics/plausible-events.ts).
 *
 * @typedef {Object} PlausibleGoal
 * @property {'event'|'page'} type   – 'event' = Custom-Event-Goal, 'page' = Pageview-Goal
 * @property {string} value          – event_name (bei 'event') bzw. page_path (bei 'page')
 * @property {string} [note]         – interne Notiz, nicht in die DB geschrieben
 */

/**
 * Kern-Conversion-Goals für JEDE Customer-Site. Nur Events, die in JEDEM
 * trackingMode real feuern können — sowohl im Default `inline` (BaseLayout-
 * Auto-Listener) als auch im `full`-Modus (<PlausibleEvents>). So ist ein
 * provisioniertes CORE_GOAL nie eine tote DB-Zeile.
 *
 * WICHTIG (Root-Cause, Tracking-Audit 2026-07-09): `Paid Visit` wurde hier
 * ENTFERNT und nach PAID_GOALS verschoben — es feuert nur bei gclid/utm-Traffic
 * und nur über die Attribution-Logik in <PlausibleEvents> (full-Modus). Für
 * inline-Kunden ohne Paid-Traffic war es eine tote CORE-Zeile. `CTA Click`
 * bleibt CORE, weil BaseLayout seit v0.63 auch im inline-Modus einen
 * [data-cta]-Listener feuert.
 * @type {PlausibleGoal[]}
 */
export const CORE_GOALS = [
  { type: 'event', value: 'Form Submit',    note: 'Primäre Lead-Conversion (Kontakt/Briefing)' },
  { type: 'event', value: 'Phone Click',    note: 'Anruf-Intent — bei B2B oft 30–50% der Leads' },
  { type: 'event', value: 'Email Click',    note: 'mailto-Klick' },
  { type: 'event', value: 'WhatsApp Click', note: 'WhatsApp-Kontakt' },
  { type: 'event', value: 'CTA Click',      note: 'CTA-Button-Klick (data-cta) — inline + full' },
  { type: 'page',  value: '/danke',         note: 'Danke-/Bestätigungsseite nach Absenden' },
];

/**
 * Paid-Attribution-Goal — nur für Kunden mit bezahltem Traffic (Google/Meta Ads).
 * Feuert ausschliesslich über die gclid/utm-Attribution in <PlausibleEvents>
 * (full-Modus). Bei einem Kunden ohne Ads / im inline-Modus feuert es strukturell
 * nie → nicht clusterweit provisionieren, sonst tote Goal-Zeile.
 * @type {PlausibleGoal[]}
 */
export const PAID_GOALS = [
  { type: 'event', value: 'Paid Visit', note: 'Bezahlter Klick (gclid/utm) — trennt Paid von Organic' },
];

/**
 * Optionale Goals — nur relevant, wenn die Site die jeweilige Funktion nutzt
 * (Buchungs-Widget, Sticky-Contact-Bar, FAQ-Akkordeon).
 * @type {PlausibleGoal[]}
 */
export const OPTIONAL_GOALS = [
  { type: 'event', value: 'Booking Completed',   note: 'Cal.com/Calendly-Buchung abgeschlossen' },
  { type: 'event', value: 'Calendar Opened',     note: 'Buchungs-Widget geöffnet' },
  { type: 'event', value: 'Sticky Contact Click', note: 'Sticky-Mobile-CTA' },
  { type: 'event', value: 'FAQ Open',            note: 'FAQ-Eintrag aufgeklappt' },
];
