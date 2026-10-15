/** Preis in Cent aus „9,90“, „14,90 €“; wirft bei „Preis folgt“, „ab 3,20 €“, leer. */
export declare function preisCent(betrag: string): number;
/** 1630 → „16,30 €“. */
export declare function euro(cent: number): string;
/** Summe Menge × Preis in Cent. */
export declare function summeCent(positionen: readonly { menge: number; preisCent: number }[]): number;
export interface Abholtag {
  /** 'YYYY-MM-DD' (lokale Datumsteile). */
  datum: string;
  /** „Heute“, „Morgen“ oder „Mo 19.10.“. */
  label: string;
  /** Abholzeiten 'HH:MM', letzte = Schluss minus ein Raster. */
  zeiten: string[];
}
/** Die nächsten offenen Tage mit Abholzeiten. `tage` wie Date.getDay() (0 = Sonntag). */
export declare function abholtage(o: {
  jetzt: Date;
  tage: readonly number[];
  von: string;
  bis: string;
  vorlaufMinuten?: number;
  rasterMinuten?: number;
  geschlossen?: readonly string[];
  anzahl?: number;
  maxSuche?: number;
}): Abholtag[];
export interface BestellPosition {
  name: string;
  menge: number;
  preisCent: number;
}
/** Bestelltext für WhatsApp; wirft ohne Position oder ohne Namen. */
export declare function bestellText(b: {
  nummer: number;
  tagLabel: string;
  datum: string;
  zeit: string;
  positionen: readonly BestellPosition[];
  name: string;
  hinweis?: string;
}): string;
/** Nach Datum, Abholzeit, Nummer; neue Liste. */
export declare function sortiereBestellungen<T extends { nummer: number; datum: string; zeit: string }>(
  liste: readonly T[],
): T[];
/** Laufende Nummer je Tag, beginnt an jedem neuen Tag bei 1. */
export declare function naechsteNummer(
  stand: { datum: string; zaehler: number } | undefined,
  datum: string,
): { nummer: number; stand: { datum: string; zaehler: number } };
