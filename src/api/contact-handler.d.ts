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
  /** Whitelist zusätzlicher Body-Felder (Strings, getrimmt, je max. 2000 Zeichen); erscheinen als "Feld: Wert"-Block in der Mail ans Postfach, in dieser Reihenfolge */
  extraFields?: string[];
  /** true → body.consent muss truthy sein ("on"/"true"/true), sonst 400 */
  requireConsent?: boolean;
  /** Nach erfolgreicher Postfach-Mail eine zweite Mail (nur Text) an body.email; Fehler hier ändern die 200-Antwort nicht */
  confirmation?: ContactConfirmation;
}

export interface ContactConfirmation {
  subject: string;
  /** fields = name, email, company, phone, message, website + extraFields */
  text: (fields: Record<string, string>) => string;
  /** Default: CONTACT_EMAIL (bisheriger Postfach-Empfänger) */
  replyTo?: string;
}

type ContactHandler = (req: any, res: any) => Promise<void>;

export function createContactHandler(config: ContactHandlerConfig): ContactHandler;
