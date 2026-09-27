/**
 * Baut `https://wa.me/<ziffern>[?text=…]` aus einer Telefonnummer.
 * Nationale Schreibweise (führende 0) wird zu 49…, `00` fällt weg, Nicht-Ziffern fallen weg.
 * Wirft bei weniger als 6 Ziffern.
 */
export function waHref(nummer: string, text?: string): string;
