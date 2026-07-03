/**
 * Baut eine getrackte Buchungs-URL (Cal.com / cal.eu).
 *
 * Hängt UTM-Parameter (Attribution) + optional `notes` (Prefill des Cal-Notiz-Felds)
 * an die Basis-Buchungs-URL. So weiß man bei jeder Buchung, **wo** geklickt wurde,
 * und der Termin ist vorqualifiziert.
 *
 * UTM-Konvention (SSOT — siehe docs/utm-event-conventions.md):
 *   utm_source   = Ursprung   (website | report | gbp | outreach)
 *   utm_medium   = Fläche     (web | email)
 *   utm_campaign = Kontext    (booking | monthly-report | …)
 *   utm_content  = Placement  (header | footer | sticky | hero | branche-elektriker | blog | audit …)
 *   utm_term     = optional   (z. B. <customer-slug>-<YYYY-MM>)
 *   notes        = optional   Prefill-Text für das Notiz-Feld (Cal.com `notes`)
 *
 * Defaults: source=website, medium=web, campaign=booking. Leere Basis → "" zurück.
 *
 * @example
 *   buildBookingUrl("https://app.cal.eu/blitzsicht/30min", { content: "sticky" })
 *   // → ".../30min?utm_source=website&utm_medium=web&utm_campaign=booking&utm_content=sticky"
 */
export interface BookingUtm {
  /** Pflicht: Placement bzw. Add-on — ohne `content` gibt es keinen Tracking-Mehrwert. */
  content: string;
  source?: string;
  medium?: string;
  campaign?: string;
  term?: string;
  /** Optionaler Prefill des Cal-Notiz-Felds (z. B. "Interesse: SEO-Sprint Local"). */
  notes?: string;
}

export function buildBookingUrl(base: string, utm: BookingUtm): string {
  if (!base) return base;
  const params = new URLSearchParams();
  params.set('utm_source', utm.source ?? 'website');
  params.set('utm_medium', utm.medium ?? 'web');
  params.set('utm_campaign', utm.campaign ?? 'booking');
  params.set('utm_content', utm.content);
  if (utm.term) params.set('utm_term', utm.term);
  if (utm.notes) params.set('notes', utm.notes);
  const sep = base.includes('?') ? '&' : '?';
  return `${base}${sep}${params.toString()}`;
}
