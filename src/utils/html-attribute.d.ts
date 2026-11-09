/** Ein Zeichen aus einer numerischen Entity nach WHATWG (0, Surrogate, > 0x10FFFF → U+FFFD; 0x80–0x9F → Windows-1252). */
export declare function entityZeichen(nr: number): string;

/** HTML-Entities in einem Attributwert auflösen, in einem Durchgang. `null`/`undefined` bleiben, wie sie sind. */
export declare function dekodiereEntities<T extends string | null | undefined>(wert: T): T;

/** Die Attribute eines Tags: Schlüssel klein, Werte dekodiert, erstes Vorkommen gewinnt. */
export declare function attribute(tag: string): Record<string, string>;

/** Die URLs eines srcset-Werts nach WHATWG „parse a srcset attribute". */
export declare function srcsetUrls(wert: string | null | undefined): string[];
