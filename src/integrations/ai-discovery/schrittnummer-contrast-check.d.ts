export type Variante = 'raster' | 'weg';
export interface SchrittnummerIssue {
  type: 'schrittnummer_contrast';
  variante: Variante;
  detail: string;
  ratio: number;
}
export const ABSCHNITT_HINTERGRUND: string;
export const DECKKRAFT: number;
export function ueberlagert(farbe: string, deckkraft: number, grund: string): string;

/** Ergebnis mit dem dritten Zustand: "konnte nicht rechnen" ist nicht "bestanden". */
export interface SchrittnummerErgebnis {
  status: 'ok' | 'befund' | 'nicht-rechenbar';
  grund: string | null;
  issues: SchrittnummerIssue[];
}
export function pruefeSchrittnummerKontrast(
  css: string,
  schwelle?: number,
): SchrittnummerErgebnis;
