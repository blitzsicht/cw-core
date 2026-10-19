/** Ist eines der Honeypot-Felder (`botcheck`, `url_honey`) belegt? */
export function honeypotGefuellt(formData: { get(name: string): unknown }): boolean;

/** Plausible-Meldung nach dem Absenden: ein Honeypot-Treffer ist `Form Bot`, nie `Form Submit`. */
export function submitMeldung(
  antwortOk: boolean,
  honeypot: boolean,
): { event: 'Form Submit' | 'Form Bot'; status: 'success' | 'error' };
