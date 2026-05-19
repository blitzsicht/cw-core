export interface ContactHandlerConfig {
  /** Erlaubte Origin-URLs (z.B. ['https://kunde.de', 'https://www.kunde.de']) */
  allowedOrigins: string[];
  /** Anzeigename im From-Header (z.B. 'Kunde GmbH') */
  fromName: string;
  /** From-Adresse — Default 'noreply@blitzsicht.com' (Resend-verifizierte Domain) */
  fromEmail?: string;
  /** Subject-Zeile der Resend-Mail */
  subject: string;
  /** Rate-Limit max requests pro Window (Default 3) */
  rateLimitMax?: number;
  /** Rate-Limit Fenster in Millisekunden (Default 10 min) */
  rateLimitWindowMs?: number;
  /** Eigene Spam-Keywords zusätzlich zur Default-Liste */
  extraSpamKeywords?: string[];
}

type ContactHandler = (req: any, res: any) => Promise<void>;

export function createContactHandler(config: ContactHandlerConfig): ContactHandler;
