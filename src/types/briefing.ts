/**
 * @cw/core — Briefing-Form Types
 *
 * Shared schema fuer den generischen Briefing-Handler + BriefingForm-Component.
 * Customer-Repos importieren von hier:
 *
 *   import type {
 *     BriefingField,
 *     BriefingSection,
 *     FieldType,
 *     SectionPriority,
 *   } from '@cw/core/types/briefing';
 *
 * Konvention:
 *   - Field-IDs sind snake_case und global eindeutig ueber alle Sektionen.
 *   - Section-IDs sind kebab-case (TOC-Anker).
 *   - `priority` steuert das Rendering der Section-Border (rot/orange/gruen).
 *   - `required: true` Felder werden im Submit-Handler validiert und im Progress-Bar
 *     als separater Counter gefuehrt.
 */

export type FieldType =
  | 'text'
  | 'textarea'
  | 'email'
  | 'phone'
  | 'select'
  | 'checkbox'
  | 'radio';

export type SectionPriority = 'pflicht' | 'wichtig' | 'nice';

export interface BriefingField {
  /** Slug, snake_case, eindeutig ueber alle Sektionen hinweg. */
  id: string;
  /** Sichtbare Frage / Label. */
  label: string;
  /** Hilfetext / Beispiel — wird in grau unter dem Input gerendert. */
  hint?: string;
  type: FieldType;
  /** Optionen fuer `select` / `radio`. */
  options?: string[];
  required?: boolean;
  placeholder?: string;
  /**
   * Vorausgefuellter Wert (Recherche/Vermutung). Wird als initialer Feld-Wert
   * gerendert und sichtbar als "bitte pruefen" markiert (amber). Beim ersten
   * User-Edit verschwindet die Markierung. Optional — Felder ohne `prefill`
   * rendern unveraendert leer.
   */
  prefill?: string;
  /**
   * Optionaler Marker-Text statt des Defaults ("Vorausgefuellt — bitte pruefen").
   * Nutze ihn fuer Confidence/Quelle, z.B. "aus Handelsregister — bitte bestaetigen".
   * Nur wirksam wenn `prefill` gesetzt ist.
   */
  prefillNote?: string;
}

export interface BriefingSection {
  /** Slug, kebab-case — TOC-Anker (`#section-${id}`). */
  id: string;
  priority: SectionPriority;
  /** Single emoji oder Icon-Glyph fuer Section-Header + TOC-List. */
  emoji: string;
  title: string;
  subtitle?: string;
  fields: BriefingField[];
}

/**
 * Convenience-Helpers — Customer-Repos koennen die selbst implementieren
 * oder von hier importieren wenn sie keine eigene Logik brauchen.
 */
export function getRequiredFieldIds(sections: BriefingSection[]): string[] {
  const ids: string[] = [];
  for (const section of sections) {
    for (const field of section.fields) {
      if (field.required) ids.push(field.id);
    }
  }
  return ids;
}

export function getTotalFieldCount(sections: BriefingSection[]): number {
  return sections.reduce((sum, s) => sum + s.fields.length, 0);
}

export function findFieldById(
  sections: BriefingSection[],
  id: string,
): BriefingField | undefined {
  for (const section of sections) {
    const f = section.fields.find((x) => x.id === id);
    if (f) return f;
  }
  return undefined;
}
