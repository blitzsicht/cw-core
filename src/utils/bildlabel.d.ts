import type { BildHerkunftErgebnis } from './bildherkunft';

export interface BildLabel {
  /** Für die `ergebnis`-Prop von AiLabel. */
  ergebnis: Pick<BildHerkunftErgebnis, 'herkunft' | 'deepfake'>;
  /** Passend zum gemessenen Untergrund an der Label-Position. */
  theme: 'hell' | 'dunkel';
}

/**
 * Dateisystem-Pfad zu einem Bild aus `public/`, relativ zum Projektwurzelverzeichnis.
 * `null`, wenn der Pfad kein public-URL-Pfad ist oder die Datei nicht existiert.
 */
export function publicFsPath(src: unknown): string | null;

/**
 * Ermittelt, ob ein gerendertes Bild ein KI-Label braucht — und in welcher Farbe.
 * `null`, wenn keine Deklaration vorliegt oder kein Bild übergeben wurde.
 */
export function bildLabel(
  daten: { bildHerkunft?: unknown[] } | null | undefined,
  bild: string | { src?: string; fsPath?: string } | null | undefined,
  optionen?: { ueberlagerung?: number },
): Promise<BildLabel | null>;
