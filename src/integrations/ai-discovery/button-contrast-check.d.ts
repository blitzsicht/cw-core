export interface ButtonIssue {
  type: 'accent_button_contrast';
  detail: string;
  ratio: number;
}
export function kontrast(a: string, b: string): number;
export function alsHex(wert: string | undefined | null): string | null;
export function leseToken(css: string, name: string): string | null;
export function checkButtonContrast(css: string, schwelle?: number): ButtonIssue[];
