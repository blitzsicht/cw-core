/**
 * @cw/core — RichContentBlock Types
 *
 * Strukturierter Fließ-Content für Detail-/Leistungsseiten: mehrere Abschnitts-
 * überschriften (h2), Zwischenüberschriften (h3), Absätze (p) und Stichpunktlisten
 * (ul) mit optionalem fettem Lead-in pro Punkt. Bildet die Original-Copy-Struktur
 * (Markdown mit `##`/`###`/`- **Lead:** Text`) 1:1 ab, ohne Markdown-Parsing.
 *
 * Customer-Repos importieren von hier:
 *
 *   import type { RichContentBlock } from '@cw/core/types/rich-content';
 *
 * und rendern das Array via `<RichContentBlocks blocks={…} />`.
 */

/** Ein Stichpunkt: optionaler fetter Lead-in vor dem Fließtext. */
export interface RichListItem {
  /** Fettes Lead-in vor dem Doppelpunkt/Text (z. B. „Neubau & Großprojekte"). Optional. */
  lead?: string;
  /** Fließtext des Punktes. */
  text: string;
}

/** Ein Content-Block. Discriminated union über `kind`. */
export type RichContentBlock =
  | { kind: 'h2'; text: string } // Abschnitts-Überschrift
  | { kind: 'h3'; text: string } // Zwischenüberschrift
  | { kind: 'p'; text: string } // Fließtext-Absatz
  | { kind: 'ul'; items: readonly RichListItem[] }; // Stichpunktliste
