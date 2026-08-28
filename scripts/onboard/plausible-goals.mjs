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

/**
 * Funnel-Goals — Zwischenschritte auf dem Weg zur Conversion. Beantworten die
 * Frage, die `Form Submit` allein nicht beantwortet: Kommen keine Leads, weil
 * niemand das Formular sieht, oder weil alle darin abbrechen?
 *
 * Feuern aus cw-core `ContactForm.astro` und damit in JEDEM trackingMode, sobald
 * ein Formular gemountet ist. Auf einer Site ohne Formular (z. B. falzmarke)
 * bleiben sie tote Zeilen — deshalb prüft `plausible-reconcile.mjs` sie
 * mount-bewusst, analog zu OPTIONAL_GOALS.
 * @type {PlausibleGoal[]}
 */
export const FUNNEL_GOALS = [
  { type: 'event', value: 'Form Start',     note: 'Erste Eingabe im Formular — Nenner für die Abbruchquote' },
  { type: 'event', value: 'Form Abandoned', note: 'Formular begonnen, nicht abgeschickt' },
];

/**
 * Qualitäts-Goals — keine Leads, aber Signale, die still bleiben, wenn niemand
 * sie als Goal führt. Anlass (Messung 28.08.2026): `404 Error` feuerte auf
 * digital-direkt.com 442-mal in 90 Tagen, ohne dass es irgendwo sichtbar war.
 *
 * Feuern modus-unabhängig aus BaseLayout (`Outbound Click`, `File Download`)
 * bzw. NotFoundPage (`404 Error`).
 * @type {PlausibleGoal[]}
 */
export const QUALITY_GOALS = [
  { type: 'event', value: '404 Error',     note: 'Aufruf einer nicht existierenden Seite — kaputter Link oder toter Index-Eintrag' },
  { type: 'event', value: 'Outbound Click', note: 'Klick auf eine fremde Domain' },
  { type: 'event', value: 'File Download',  note: 'Download eines verlinkten .pdf' },
];

/**
 * Produktspezifische Goals je Registry-Slug. Anders als alle Gruppen darüber
 * NICHT clusterweit: diese Events existieren nur im jeweiligen Customer-Repo
 * und feuern über dessen eigenen `[data-event]`-Listener.
 *
 * Schlüssel ist der `slug` aus customer-registry.json, NICHT die Domain — die
 * Domain kann sich ändern, der Slug ist die stabile Kennung.
 *
 * Einträge nur für Sites, die wirklich eigene Events haben. `gympanzen` und
 * `preshot` stehen bewusst NICHT hier: sie feuern ausschliesslich cw-core-
 * Standard-Events, ein leerer Eintrag wäre irreführend.
 * @type {Record<string, PlausibleGoal[]>}
 */
export const SITE_GOALS = {
  blitzsicht: [
    // Vom Guard-Lauf am 28.08.2026 gefunden: feuern real auf blitzsicht.com,
    // standen aber in keiner Goal-Zeile. Genau der Fall, für den die
    // Gegenrichtung (`eventsWithoutGoal`) gebaut wurde.
    { type: 'event', value: 'Paket Card Detail-Link Click', note: 'Interesse an einem Paket — Vorstufe zur Anfrage' },
    { type: 'event', value: 'Paket-Detail FAQ Expand',      note: 'FAQ im Paket-Detail aufgeklappt' },
    { type: 'event', value: 'Paket-Detail Tech Expand',     note: 'Technik-Abschnitt im Paket-Detail aufgeklappt' },
    { type: 'event', value: 'Garantie CTA Click',           note: 'CTA im Garantie-Abschnitt' },
    { type: 'event', value: 'Audit CTA Click',              note: 'Einstieg in den Audit-Funnel' },
    { type: 'event', value: 'Audit Form Submit',            note: 'Audit angefragt — eigene Lead-Art' },
    { type: 'event', value: 'Audit PDF Downloaded',         note: 'Audit-Ergebnis heruntergeladen' },
    { type: 'event', value: 'Ownership CTA Click',          note: 'CTA im Ownership-Abschnitt' },
  ],
  falzmarke: [
    { type: 'event', value: 'skill_download',       note: 'Download des .skill-Release-Assets — die Haupt-Conversion' },
    { type: 'event', value: 'github_klick',         note: 'Klick auf Repository/Releases/PyPI (Prop `ziel`)' },
    { type: 'event', value: 'anleitung_fertig',     note: 'Anleitung durchlaufen, weiter zu /briefe' },
    { type: 'event', value: 'vorlage_kopiert',      note: 'Prompt in die Zwischenablage kopiert (Prop `slug`)' },
    { type: 'event', value: 'browserweg_interesse', note: 'Fake-Door — Entscheidungsgrundlage für Phase 5' },
  ],
};

/**
 * Engagement-Telemetrie: feuert überall, ist aber KEINE Conversion und wird
 * bewusst NICHT als Goal provisioniert.
 *
 * Warum das hier steht statt nirgends: `plausible-reconcile.mjs` prüft auch die
 * Gegenrichtung („feuert ein Event, für das niemand ein Goal angelegt hat?").
 * Ohne diese Liste meldete es diese vier bei jeder Site auf ewig als Lücke.
 *
 * Warum sie kein Goal werden (Entscheidung, keine Messung): sie würden das
 * Conversion-Panel dominieren. Gemessen am 28.08.2026 auf hausammincio.com:
 * `Scroll Depth` 4.519 Hits gegen `Form Start` 4. Goals wirken rückwirkend —
 * wer sie doch sehen will, legt sie jederzeit an und bekommt die Historie mit.
 * @type {string[]}
 */
export const ENGAGEMENT_IGNORE = [
  'Scroll Depth',
  'Time on Page',
  'Nav Click',
  'Mobile Nav Open',
];

/**
 * ─── Namens-Drift aus der plausible.io-Ära ──────────────────────────────────
 *
 * In der DB stehen für dieselbe Sache mehrere Namen nebeneinander. Sie stammen
 * aus der Zeit vor dem Umzug auf die self-hosted CE, als Goals von Hand im
 * Dashboard angelegt wurden. Gemessen am 28.08.2026:
 *
 *   Outbound Click        ← DER GÜLTIGE NAME (cw-core v0.134 emittiert diesen)
 *   Outbound Link: Click  ← Altname, u. a. elektro-mika.com, gympanzen.com
 *   Outbound Link         ← Altname, gottl-richter-gomeier.de
 *
 *   Form Submit           ← DER GÜLTIGE NAME
 *   Form: Submission      ← Altname, auf 8 Sites vorhanden
 *
 * Regel: Diese SSOT führt ausschliesslich den gültigen Namen. Die Altzeilen
 * werden NICHT gelöscht — sie tragen echte Historie, und ein `remove` würde die
 * zugehörigen Conversions aus dem Dashboard nehmen (die Events selbst bleiben
 * in ClickHouse, das Goal ist per `add` wiederherstellbar, aber der Verlust
 * wäre in der Zwischenzeit sichtbar). Sie laufen aus, wenn eine Site neu
 * aufgesetzt wird.
 *
 * Für den Reconcile-Guard heisst das: ein Altname ohne Gegenstück in dieser
 * Datei ist KEIN Befund. Er darf weder als „fehlend" noch als „Event ohne Goal"
 * gemeldet werden.
 */

/**
 * Altnamen aus der plausible.io-Ära, die real feuern, aber KEIN eigenes Goal
 * brauchen — sie sind Dubletten eines gültigen Namens (s. Drift-Block oben).
 *
 * Ohne diese Liste meldet die Gegenrichtung des Guards sie ewig als „Event ohne
 * Goal", obwohl die Sache längst gemessen wird. Gemessen 28.08.2026: betrifft
 * `Outbound Link: Click` (blitzsicht.com, elektro-mika.com) und `Outbound Link`
 * (gottl-richter-gomeier.de, hausamlago.com).
 *
 * Sie hier zu führen heisst NICHT, sie zu provisionieren — sie stehen in keiner
 * Goal-Gruppe. Es heisst nur: kein Befund.
 * @type {Record<string, string>}  Altname → gültiger Name
 */
export const LEGACY_ALIASES = {
  'Outbound Link: Click': 'Outbound Click',
  'Outbound Link': 'Outbound Click',
  'Form: Submission': 'Form Submit',
  'Thank You Page Viewed': 'Form Submit',
};

/**
 * Sites mit EIGENER Goal-Taxonomie, die das cw-core-Standard-Set NICHT bekommen.
 *
 * `siluri.de` ist kein cw-core-Kunde im üblichen Sinn: es führt 30 eigene,
 * deutschsprachige Goals (Preiskalkulator, DTF-B2B, Exit-Intent, Formular-Funnel).
 * Ihm das englische Standard-Set aufzuzwingen, hiesse 11 tote Zeilen anzulegen
 * und die gewachsene Taxonomie zu verwässern.
 *
 * Für diese Slugs meldet der Guard weiterhin Events ohne Goal und tote Goals —
 * nur „fehlende Standard-Goals" entfallen.
 * @type {string[]}
 */
export const OWN_TAXONOMY_SLUGS = ['siluri'];
