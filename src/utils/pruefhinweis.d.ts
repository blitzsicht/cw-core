/** Typen zu `pruefhinweis.js` — Prüfhinweis für Bewertungen nach § 5b Abs. 3 UWG. */

/** Der Standardtext für wiedergegebene Google-Bewertungen. */
export declare const PRUEFHINWEIS_GOOGLE: string;

/** Enthält der Text eine Aussage darüber, ob geprüft wird (positiv oder negativ)? */
export declare function hatPruefhinweis(text: string | null | undefined): boolean;

/** Beschreibt der Text eine tatsächliche Prüfung (rechtfertigt „echte“/„verifizierte“)? */
export declare function hatPruefbeschreibung(text: string | null | undefined): boolean;
