/** Typen zu `cta-icon.js` — Symbol eines CTA-Knopfs nach dem Link-Ziel. */
export declare const TELEFON_PFAD: string;
export declare const BRIEF_PFAD: string;
export declare const BRIEF_LINIE: string;
export declare const PFEIL_LINIEN: readonly string[];
export declare const PIN_PFADE: readonly string[];
export type CtaIconWahl = 'auto' | 'phone' | 'mail' | 'arrow' | 'pin' | 'none';
export declare function ctaIcon(
  href: string | undefined | null,
  wahl?: CtaIconWahl,
): {
  art: 'telefon' | 'brief' | 'pfeil' | 'pin' | 'keins';
  pfade: string[];
  linien: string[];
};
