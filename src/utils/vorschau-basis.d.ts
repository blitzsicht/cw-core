/** Typen zu `vorschau-basis.js` — Host der Link-Vorschau-Tags in der Pre-Sale-Phase. */

/** `https://<slug>.vercel.app`, solange am Vercel-Projekt keine eigene Domain hängt, sonst `null`. */
export declare function vorschauBasis(env?: Record<string, string | undefined>): string | null;

/** Host aus `og:image`, wenn er nicht der Vorschau-Host ist, sonst `null`. */
export declare function fremderOgHost(html: string, basis: string): string | null;

/** Alle Seiten im dist, deren `og:image` auf einen fremden Host zeigt. */
export declare function seitenMitFremdemOgHost(
  dist: string,
  basis: string,
): Promise<Array<{ seite: string; host: string }>>;
