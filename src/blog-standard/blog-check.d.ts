export interface HerkunftErgebnis {
  quelle: string | null;
  deepfake: string;
  herkunft?: string;
}
export interface PruefOptionen {
  /** Resolver für die Bildherkunft; ohne ihn entfällt Prüfung 5. */
  herkunft?: (pfad: string) => HerkunftErgebnis | null | undefined;
  /** Pflichtfeld kurzGesagt prüfen (Default true). */
  kurzGesagt?: boolean;
  /** KI-Bilder brauchen den Titel „…KI-generiert“ (Default true). */
  kiUnterschrift?: boolean;
  /** Frontmatter-Felder des Hero-Bilds (Default ['heroImage', 'image']). */
  heroFelder?: string[];
  /** Bildmangel als Fehler statt Hinweis (Default BILDZAHL_STRENG). */
  streng?: boolean;
}
export interface PruefErgebnis {
  fehler: string[];
  hinweise: string[];
  ist: number;
  soll: number;
  entwurf?: boolean;
}
export declare const BILDZAHL_STRENG: boolean;
export declare const WOERTER_JE_BILD: number;
export declare const MIN_BILDER: number;
export declare const KURZ_MIN: number;
export declare const KURZ_MAX: number;
export declare function norm(p: string): string;
export declare function zerlege(text: string): { fm: string; body: string } | null;
export declare function feld(fm: string, schluessel: string): string | null;
export declare function bilderMitTitel(body: string): { src: string; titel: string }[];
export declare function bilderImText(body: string): string[];
export declare function woerter(body: string): number;
export declare function sollBilder(anzahlWoerter: number): number;
export declare function pruefe(name: string, text: string, opt?: PruefOptionen): PruefErgebnis;
export declare function pruefeVerzeichnis(
  dir: string,
  opt?: PruefOptionen,
): Promise<{ artikel: number; bilder: number; fehler: string[]; hinweise: string[] }>;
export declare function befunde(name: string, text: string): string[];
