/** Neutrale Zeitangabe ohne gesetzte Frist: „so bald wie möglich“. */
export declare const ANTWORT_OHNE_FRIST: string;
/** „Ihre Anfrage ist angekommen.“ */
export declare const EINGANG_BESTAETIGT: string;
/** Bereinigte Frist (`siteData.antwortfrist`) oder `undefined`, wenn keine gesetzt ist. */
export declare function antwortfristAngabe(frist: unknown): string | undefined;
/** „innerhalb von <Frist>“ mit Angabe, sonst „so bald wie möglich“. */
export declare function antwortZeitraum(frist: unknown): string;
/** „Wir melden uns <Zeitraum> bei Ihnen.“ */
export declare function antwortSatz(frist: unknown): string;
/** „Ihre Anfrage ist angekommen. Wir melden uns <Zeitraum> bei Ihnen.“ */
export declare function antwortBestaetigung(frist: unknown): string;
/** Vergleichsschlüssel: „24 Stunden“, „24h“, „24 Std.“ → `24 stunde`. */
export declare function fristSchluessel(text: string): string;
/** Antwortfristen in Klartext: Frist-Phrase plus Antwort-Verb im selben Satz. */
export declare function findeAntwortfristen(
  text: string,
): { satz: string; frist: string; schluessel: string }[];
