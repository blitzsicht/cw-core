export interface FocusableErgebnis {
  html: string;
  ergaenzt: number;
}
export function ergaenzeTabellenTabindex(html: string): FocusableErgebnis;
export function ergaenzeWrapperTabindex(html: string): FocusableErgebnis;
