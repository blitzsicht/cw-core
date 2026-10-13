import type { BriefingSection } from '../../types/briefing.js';

export interface BriefingBrandColors {
  /** Header/Heading-Farbe — Default Blitzsicht-Nachtblau #1D1E3B. */
  primary?: string;
  /** Akzent-Farbe (Section-Underline) — Default Blitzsicht-Orange #EF7612. */
  accent?: string;
}

export interface BuildBriefingEmailInput {
  /** Anzeigename des Kunden, z.B. "Mika Elektrotechnik". */
  customerName: string;
  /** Form-Payload (fieldId → string-Wert). */
  payload: Record<string, string>;
  /** Section-Schema — kompatibel mit `BriefingSection` aus `@cw/core/types/briefing`. */
  sections: BriefingSection[];
  /** URL der Customer-Onboarding-Page (NICHT hardcoden, pro Customer setzen). */
  submissionUrl: string;
  /** Liste der Pflichtfeld-IDs — fuer den Progress-Header. */
  requiredFieldIds: string[];
  /** Optionale Brand-Color-Overrides — fuer customer-spezifische Akzente. */
  brand?: BriefingBrandColors;
  /** Foto-Upload-Anleitung in der Confirmation-Mail, wenn gesetzt (z.B. 'servus@blitzsicht.com'). */
  photoUploadDestination?: string;
  /** Default: 'WeTransfer'. */
  photoUploadServiceLabel?: string;
  /** Default: 'https://wetransfer.com/'. */
  photoUploadServiceUrl?: string;
  /**
   * Selbst zugesagte Antwortfrist (`siteData.antwortfrist`), z.B. '24 Stunden'. Ohne den
   * Wert nennt die Confirmation-Mail keine Frist („so bald wie möglich“), blitzsicht-ops#950.
   */
  antwortfrist?: string;
}

export interface BuildBriefingEmailOutput {
  /** Interne Mail an Blitzsicht — Sektion-by-Sektion Tabellen-Layout. */
  internal: { html: string; text: string };
  /** Customer-Confirmation-Mail — Frist nur mit `antwortfrist`, sonst „so bald wie möglich“. */
  confirmation: { html: string; text: string };
  /** Anzahl ausgefuellter Pflichtfelder. */
  filledRequired: number;
  /** Gesamtzahl der Pflichtfelder. */
  totalRequired: number;
}

/**
 * Rendert die beiden Mail-Bodies (intern + Confirmation) fuer ein Briefing-Submit.
 * Pattern aus customer-mika-elektrotechnik/api/onboarding.ts uebernommen.
 */
export function buildBriefingEmail(input: BuildBriefingEmailInput): BuildBriefingEmailOutput;
