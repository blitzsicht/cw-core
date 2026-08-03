// @ts-check
/**
 * @cw/core/integrations/ai-discovery/embed-consent-check
 *
 * Consent-Guard für Drittanbieter-Embeds: findet Buchungs-Embeds, die schon beim
 * Parsen der Seite laden statt erst nach einer Nutzeraktion. Pure String-Logik pro
 * Seiten-HTML — der Directory-Walk passiert im Aufrufer (index.ts), gleicher Split
 * wie perf-check.js und csp-check.js.
 *
 * Hintergrund (Vorfall 2026-08-03):
 *   `steller-sanierungen.com/kontakt` lieferte live den Eager-Zweig von CalEmbed.astro
 *   aus — `app.cal.eu/embed/embed.js` wurde beim Parsen in den <head> injiziert und
 *   `Cal("init")` sofort aufgerufen. Damit floss die IP jedes Besuchers an Cal.com Inc.,
 *   bevor er irgendetwas getan hatte. Ursache war der Default `lazy = false`, den die
 *   Seite geerbt hat, weil niemand den Prop gesetzt hat. Blitzsicht war sauber, weil es
 *   `lazy={true}` explizit setzte — der sichere Weg existierte also, wurde aber nicht
 *   vererbt. Der Default steht seit demselben Tag auf `true`; dieser Guard ist der
 *   Regressions-Wächter dazu.
 *
 * **Bewusst eng geschnitten (v1).** Der Check matcht ausschließlich die Cal-Signatur,
 * nicht generisch „irgendein Drittanbieter-Host ohne Klick-Gate". Grund: der Fleet
 * lädt `challenges.cloudflare.com/turnstile/v0/api.js` auf JEDER Seite JEDES Kunden
 * über `addEventListener('load', …)` + `requestIdleCallback` (TurnstilePreClearance.astro).
 * Das ist ein Performance-Deferral, kein Consent-Gate — eine generische Regel würde
 * dort ab dem ersten Build fleet-weit Alarm schlagen. Ein Guard im Dauer-Alarm wird
 * ignoriert und schützt dann gar nichts.
 *
 * Für eine spätere Verallgemeinerung gilt diese Gate-Taxonomie:
 *   - `click` / `pointerup` / `touchend` → echte Nutzeraktion, zählt als Gate
 *   - `load` / `requestIdleCallback` / `setTimeout` → reines Deferral, KEIN Gate
 *   - technisch erforderliche Dienste (Turnstile, § 25 Abs. 2 TDDDG) gehören auf eine
 *     explizite Allowlist mit Begründung — nicht durch eine Lücke der Heuristik
 *
 * @typedef {'eager_booking_embed'} EmbedConsentIssueType
 * @typedef {{ type: EmbedConsentIssueType, details: string }} EmbedConsentIssue
 */

import { parseAttrs } from './html-resources.js';

/**
 * `type`-Werte eines `<script>`, die nicht ausgeführt werden. Deckungsgleich mit
 * html-resources.js — ein `application/ld+json` mit einer Cal-URL darin ist Daten,
 * kein Ladevorgang.
 */
const NON_EXECUTABLE_SCRIPT_TYPES = new Set([
  'application/ld+json',
  'application/json',
  'text/template',
  'text/html',
]);

/** Die Cal-Embed-Loader-URL — EU- wie .com-Instanz, mit und ohne `www.`/`app.`. */
const CAL_EMBED_RE = /https?:\/\/[a-z0-9.-]*cal\.(?:eu|com)\/embed\/embed\.js/i;

/**
 * Echte Nutzeraktion als Gate. Bewusst NUR interaktive Event-Typen —
 * `load`/`idle` sind Deferrals und dürfen hier nicht durchrutschen.
 */
const CLICK_GATE_RE = /addEventListener\s*\(\s*['"](?:click|pointerup|touchend)['"]/i;

/** Alle `<script>`-Blöcke inklusive Attributen und Body. */
const SCRIPT_RE = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;

/**
 * Findet Cal-Buchungs-Embeds, die ohne Nutzeraktion laden.
 *
 * Zwei Fälle werden gemeldet:
 *   1. Inline-Script, dessen Body die Loader-URL enthält, ohne dass irgendwo im
 *      selben Block ein interaktiver Listener registriert wird (= Eager-Zweig).
 *   2. `<script src="https://app.cal.eu/embed/embed.js">` als Tag — das lädt per
 *      Definition beim Parsen, da hilft kein Gate.
 *
 * @param {string} html  Fertiges HTML einer gebauten Seite.
 * @param {string} [pagePath] Nur für die Meldung.
 * @returns {EmbedConsentIssue[]}
 */
export function checkEmbedConsent(html, pagePath = '') {
  /** @type {EmbedConsentIssue[]} */
  const issues = [];
  if (!html) return issues;

  const where = pagePath || 'Seite';
  SCRIPT_RE.lastIndex = 0;
  let m;

  while ((m = SCRIPT_RE.exec(html))) {
    const attrs = parseAttrs(m[1] ?? '');
    const type = (attrs.type ?? '').trim().toLowerCase();
    if (type && NON_EXECUTABLE_SCRIPT_TYPES.has(type)) continue;

    // Fall 2: externer Loader als Tag — lädt beim Parsen, kein Gate möglich.
    if (attrs.src && CAL_EMBED_RE.test(attrs.src)) {
      issues.push({
        type: 'eager_booking_embed',
        details:
          `${where}: <script src="…/embed/embed.js"> lädt das Cal-Embed beim Seitenaufruf. ` +
          'Der Besucher überträgt seine IP an Cal.com, bevor er etwas getan hat. ' +
          'Über <CalEmbed lazy={true} … /> einbinden statt das Script direkt zu setzen.',
      });
      continue;
    }

    // Fall 1: Inline-Loader ohne interaktives Gate (der echte Steller-Bug).
    const body = m[2] ?? '';
    if (CAL_EMBED_RE.test(body) && !CLICK_GATE_RE.test(body)) {
      issues.push({
        type: 'eager_booking_embed',
        details:
          `${where}: Cal-Embed lädt ohne Nutzeraktion — kein click/pointerup/touchend-Gate ` +
          'im Script. Der Besucher überträgt seine IP an Cal.com Inc., bevor er etwas getan ' +
          'hat; Art. 6 Abs. 1 lit. b DSGVO trägt für einen reinen Seitenaufruf nicht. ' +
          'Fix: `lazy={true}` am <CalEmbed> setzen (ist seit 03.08.2026 der Default).',
      });
    }
  }

  return issues;
}
