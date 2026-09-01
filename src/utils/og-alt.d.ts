/** Typen zu `og-alt.js` — die KI-Offenlegung im Alt-Text der Vorschaubilder. */

/** Obergrenze für `og:image:alt`; gekappt wird die Beschreibung, nie die Offenlegung. */
export declare const MAX_ALT_LAENGE: number;

/** Den Alt-Text um die Offenlegung ergänzen — oder unverändert lassen. */
export declare function altMitOffenlegung(
  basis: string,
  ergebnis: { herkunft?: string } | null | undefined,
  pflichtig: boolean,
  maxLaenge?: number,
): string;

/** Die Offenlegung wieder abstreifen; macht das Umschreiben idempotent. */
export declare function ohneOffenlegung(text: string): string;
