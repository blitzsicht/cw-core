export type VerbotslistenOrt =
  | 'text'
  | 'title'
  | 'meta:description'
  | 'meta:keywords'
  | 'meta:og:description'
  | 'meta:twitter:description';

export interface VerbotslistenBefund {
  /** relativer Pfad der Seite, z. B. `blog/dsgvo/index.html` */
  seite: string;
  ort: VerbotslistenOrt;
  /** der Listeneintrag, der getroffen hat (Original-Schreibweise aus der Liste) */
  formulierung: string;
  /** die Fundstelle im Text, so lang wie der Eintrag */
  treffer: string;
  /** ±45 Zeichen um die Fundstelle */
  kontext: string;
}

/** Flottendefault: `rechtssicher`, `abmahnsicher`, `anwaltlich geprüft`. */
export const GARANTIE_PRAEDIKATE: readonly string[];

export function kopfInhalte(html: string): { ort: VerbotslistenOrt; inhalt: string }[];

export function pruefeVerbotsliste(
  html: string,
  seite: string,
  formulierungen: readonly string[],
): VerbotslistenBefund[];

/**
 * Die Liste, wie der Checker sie sieht: normalisiert → Original, ohne Leere und Dubletten.
 * Der Aufrufer braucht sie, um dieselbe Zahl zu nennen, die wirklich geprüft wird
 * (cw-core#230, Befund 7) und um Treffer nach Herkunft zu trennen (Befund 3).
 */
export function normalisierteListe(formulierungen: readonly string[]): Map<string, string>;
