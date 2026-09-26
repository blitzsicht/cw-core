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
  /**
   * Opt-in für ContactForm `formType="rueckruf"` (Default false). Nur mit `true` nimmt der
   * Endpoint einen Rückruf-Wunsch ohne E-Mail an (Telefon Pflicht) und labelt den Lead als
   * `kind: 'rueckruf'`. Ohne Opt-in bleibt die E-Mail Pflicht und `kind` unverändert; ein
   * Rückruf ohne E-Mail wird mit 400 beantwortet und als Zustellfehler an Telegram +
   * GlitchTip gemeldet (kein stiller Lead-Verlust).
   */
  allowRueckruf?: boolean;
}

type ContactHandler = (req: any, res: any) => Promise<void>;

/**
 * Body-Felder mit `formType: 'rueckruf'` (ContactForm `formType="rueckruf"`, nur mit
 * `allowRueckruf: true`): E-Mail freiwillig, `telefon` Pflicht, `zeitfenster` optional
 * (max. 60 Zeichen).
 */
export function createContactHandler(config: ContactHandlerConfig): ContactHandler;

/**
 * Nur Ziffern, Leerzeichen, + ( ) / - . und ein Durchwahl-Trenner (ext, x, DW, Durchwahl);
 * max. 40 Zeichen; mindestens 6 Ziffern.
 */
export function telefonGueltig(telefon: string): boolean;
