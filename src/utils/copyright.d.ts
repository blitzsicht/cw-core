/**
 * Typen zu `copyright.js`.
 *
 * Die Implementierung bleibt bewusst reines `.js` — sie wird sowohl per
 * `node:test` geprüft als auch vom plain-node-CLI-Twin (`scripts/geotag-dist.mjs`
 * über `geotag-core.js`) importiert, wo ein `.ts`-Import nicht ginge. Ohne diese
 * Deklarationsdatei bekommt jeder Kunde, der `page-config.ts` aus der Vorlage
 * nutzt, `astro check`-Fehler ts7016 („implicitly has an 'any' type"), weil das
 * exports-Ziel eine `.js`-Datei ohne Typen ist.
 *
 * Die `any`-Parameter spiegeln die JSDoc der Implementierung: `siteData` ist je
 * Kunde anders geformt, und ein engerer Typ hier würde bei jedem Kunden-Feld
 * nachgezogen werden müssen.
 */

/** Platzhalter der site-data-Vorlage erkennen: `TODO…`, `TBD`, `Muster…`, `[…]`. */
export function isTodo(v: unknown): boolean;

/** Kanonischer Rechteinhaber: `legal.company` vor `legal.owner` vor `name`. */
export function resolveCopyrightHolder(data: any): string | null;

/**
 * Rechteinhaber für ein einzelnes Bild. Berücksichtigt `siteData.imageRights`
 * (Pfad-Präfix → abweichende Entität, längster Treffer gewinnt) und fällt sonst
 * auf `resolveCopyrightHolder` zurück.
 */
export function resolveImageCopyrightHolder(data: any, relPath: string): string | null;
