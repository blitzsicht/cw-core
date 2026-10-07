/** Formate, die Messenger als Vorschaubild anzeigen (png, jpeg, webp, gif). */
export declare const RASTER_FORMATE: ReadonlySet<string>;

export interface BildMasse {
  /** Rückgabe von sniffImageFormat: `png`, `jpeg`, `webp`, `gif`, `svg`, `html`, `empty`, … */
  format: string;
  /** true, wenn Messenger das Format als Vorschau zeigen. */
  raster: boolean;
  /** null bei SVG/HTML oder unlesbarem Kopf. */
  width: number | null;
  height: number | null;
}

/** Format und Pixelmaße aus dem Dateikopf, ohne sharp. */
export declare function bildMasse(bytes: Buffer | Uint8Array): BildMasse;
