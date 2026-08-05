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
  /**
   * Lead-Art des Endpoints. Default 'contact-form' (bisheriges Verhalten).
   * 'waitlist' für Wartelisten-Formulare (ContactForm formType="waitlist"):
   * extrahiert zusätzlich `studio` und labelt den Telegram-Push als Warteliste.
   */
  kind?: 'contact-form' | 'waitlist';
}

type ContactHandler = (req: any, res: any) => Promise<void>;

export function createContactHandler(config: ContactHandlerConfig): ContactHandler;
