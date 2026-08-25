/**
 * Typen zu `utils/labelfarbe.js`. Siehe dort für die Begründung der Regel und die
 * Messwerte, auf denen sie beruht.
 */

export type LabelFarbe = 'schwarz' | 'weiss';

export interface LabelFarbeBereich {
  /** Breite des Messfelds als Anteil der Bildbreite. Standard 0.34. */
  anteilBreite?: number;
  /** Höhe des Messfelds als Anteil der Bildhöhe. Standard 0.22. */
  anteilHoehe?: number;
  /**
   * Deckkraft der dunklen Schicht zwischen Bild und Label, 0 (keine) bis 1.
   * Nur dunkle Überlagerungen — für helle Schleier ist die Rechnung eine andere.
   */
  ueberlagerung?: number;
}

/** Entscheidungsregel über einer bereits gemessenen Luminanz (0..1). */
export function farbeFuerLuminanz(luminanzDesBereichs: number): LabelFarbe;

/** Passende Badge-Fassung für eine Bilddatei. Nicht bestimmbar → `'schwarz'`. */
export function labelFarbeFuerBild(
  dateipfad: string,
  bereich?: LabelFarbeBereich,
): Promise<LabelFarbe>;
