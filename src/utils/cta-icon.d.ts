/** Typen zu `cta-icon.js` — Symbol eines CTA-Knopfs nach dem Link-Ziel. */
export declare const TELEFON_PFAD: string;
export declare const BRIEF_PFAD: string;
export declare const BRIEF_LINIE: string;
export declare function ctaIcon(href: string | undefined | null): {
  art: 'telefon' | 'brief';
  pfade: string[];
  linien: string[];
};
