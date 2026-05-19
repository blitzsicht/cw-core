/**
 * @cw/core – plausible-events.ts
 *
 * TypeScript-Helper für Plausible-Custom-Events. Dünner Wrapper um den
 * globalen `window.plausible(...)` Call mit typed event-name + props.
 *
 * Verwendung in inline `<script>`-Blöcken oder externen Astro-Components:
 *
 * @example
 *   import { trackPlausible } from '@cw/core/components/analytics/plausible-events';
 *   trackPlausible('CTA Click', { name: 'hero-primary' });
 *
 * @example Default-event-Konstanten
 *   import { PlausibleEvents } from '@cw/core/components/analytics/plausible-events';
 *   trackPlausible(PlausibleEvents.PhoneClick, { location: 'header' });
 */

export type PlausibleProps = Record<string, string | number>;

type PlausibleFn = (event: string, opts?: { props?: PlausibleProps; callback?: () => void }) => void;

/**
 * Default-event-Namen, wie sie von `<PlausibleEvents>` automatisch ausgelöst
 * werden. Custom Sites können zusätzliche Events emittieren — die Liste hier
 * dient als Konvention, nicht als Whitelist (Plausible-Dashboard zeigt
 * jeden eindeutigen event-Namen automatisch).
 */
export const PlausibleEvents = {
  PhoneClick: 'Phone Click',
  WhatsAppClick: 'WhatsApp Click',
  EmailClick: 'Email Click',
  CtaClick: 'CTA Click',
  FormSubmit: 'Form Submit',
  ScrollDepth: 'Scroll Depth',
  FaqOpen: 'FAQ Open',
  StickyContactClick: 'Sticky Contact Click',
} as const;

export type PlausibleEventName = typeof PlausibleEvents[keyof typeof PlausibleEvents] | string;

/**
 * Plausible-Track-Helper. No-op wenn das Plausible-Script (noch) nicht
 * geladen ist — die Queue-Shim aus `<Plausible>` puffert bis dahin.
 */
export function trackPlausible(event: PlausibleEventName, props?: PlausibleProps): void {
  if (typeof window === 'undefined') return;
  const p = (window as unknown as { plausible?: PlausibleFn }).plausible;
  if (typeof p === 'function') {
    p(event, props ? { props } : undefined);
  }
}
