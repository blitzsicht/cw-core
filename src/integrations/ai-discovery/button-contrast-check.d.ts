export interface ButtonIssue {
  type: 'accent_button_contrast';
  detail: string;
  ratio: number;
}
export function kontrast(a: string, b: string): number;
export function alsHex(wert: string | undefined | null): string | null;
export function leseToken(css: string, name: string): string | null;
export function checkButtonContrast(css: string, schwelle?: number): ButtonIssue[];

/** Ergebnis mit dem dritten Zustand: "konnte nicht rechnen" ist nicht "bestanden". */
export interface ButtonKontrastErgebnis {
  status: 'ok' | 'befund' | 'nicht-rechenbar';
  /** Nur bei status 'nicht-rechenbar' gesetzt: warum nicht gerechnet werden konnte. */
  grund: string | null;
  issues: ButtonIssue[];
}
export function pruefeButtonKontrast(
  css: string,
  schwelle?: number,
): ButtonKontrastErgebnis;
