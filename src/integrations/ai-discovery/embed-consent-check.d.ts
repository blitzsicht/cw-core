export type EmbedConsentIssueType = 'eager_booking_embed';

export interface EmbedConsentIssue {
  type: EmbedConsentIssueType;
  details: string;
}

export function checkEmbedConsent(html: string, pagePath?: string): EmbedConsentIssue[];
