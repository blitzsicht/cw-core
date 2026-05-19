export interface BuildLeadEmailInput {
  /** z.B. 'Sachverständigenbüro Gottl Richter Gomeier' */
  siteName: string;
  /** z.B. 'noreply@blitzsicht.com' */
  fromAddress: string;
  leadName?: string;
  leadEmail: string;
  leadCompany?: string;
  leadPhone?: string;
  leadWebsite?: string;
  leadMessage?: string;
  /** Betreff der Lead-Mail (intern beim Customer) */
  subject: string;
}

export interface BuildLeadEmailOutput {
  /** RFC-5322 quoted From-Header inkl. Display-Name "Lead-Name via Customer" */
  fromHeader: string;
  subject: string;
  /** Branded HTML mit Blitzsicht-Header + Direkt-Antworten-Button */
  html: string;
  /** Plain-Text-Fallback */
  text: string;
}

export function buildLeadEmail(input: BuildLeadEmailInput): BuildLeadEmailOutput;
