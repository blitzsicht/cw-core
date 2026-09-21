/**
 * Typen zu `cta-kind.js`.
 *
 * Die Implementierung bleibt bewusst reines `.js`: Sie wird per `node:test`
 * geprüft, und ein `.ts`-Import ginge dort nicht ohne Transpilations-Schritt.
 * Dasselbe Muster wie `copyright.js`/`copyright.d.ts`.
 *
 * Ohne diese Deklarationsdatei bekäme jeder Kunde, der die Funktion aus einer
 * Komponente heraus nutzt, `astro check`-Fehler ts7016 („implicitly has an
 * 'any' type"), weil das exports-Ziel eine `.js`-Datei ohne Typen ist.
 */

/** Conversion = Kontaktaufnahme beginnt hier. Navigation = weiterblättern. */
export type CtaKind = 'conversion' | 'navigation';

/**
 * Art eines Klickziels, abgeleitet aus dem href.
 *
 * Ohne href lautet die Antwort `navigation` — die vorsichtigere Annahme: Ein zu
 * Unrecht nicht gezählter Klick fehlt in der Statistik, ein zu Unrecht
 * gezählter verfälscht sie.
 */
export function ctaKind(href?: string | null): CtaKind;

/**
 * Liefert GENAU EIN Attribut — `data-cta` oder `data-nav-click`, nie beides.
 *
 * Im Markup per Spread:
 *   `<a href={x.href} {...ctaAttrs(x.href, \`hero-secondary:${x.label}\`)}>`
 */
export function ctaAttrs(
  href: string | null | undefined,
  name: string,
  force?: CtaKind
): { 'data-cta': string } | { 'data-nav-click': string };
