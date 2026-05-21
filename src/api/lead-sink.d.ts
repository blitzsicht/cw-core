export interface Lead {
  /** Customer-Slug für Message-Header (z.B. 'soleno'). */
  project: string;
  /** Anzeigename des Customers (gleich wie ContactHandlerConfig.fromName). */
  fromName: string;
  name?: string;
  /** Bei `kind: 'briefing-form'` darf email leer sein (Briefing kann ohne Mail-Adresse abgegeben werden). */
  email: string;
  company?: string;
  phone?: string;
  website?: string;
  message?: string;
  kind?: 'contact-form' | 'audit' | 'bewerbung' | 'briefing-form';

  /** Briefing-only: Anzeigename des Kunden ("Mika Elektrotechnik"). */
  customerName?: string;
  /** Briefing-only: ausgefuellte Pflichtfelder. */
  requiredFilled?: number;
  /** Briefing-only: Gesamt-Pflichtfelder. */
  requiredTotal?: number;
  /** Briefing-only: Form-Payload fuer Telegram-Preview. */
  briefingPayload?: Record<string, string>;
}

export interface LeadCtx {
  ip?: string;
  ua?: string;
  origin?: string;
}

/**
 * Fire-and-forget Telegram-Push für erfolgreiche Form-Submits.
 * No-op wenn TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID nicht gesetzt.
 * Wirft niemals — sicher in `void emitLead(...)` zu callen.
 */
export function emitLead(lead: Lead, ctx: LeadCtx): Promise<void>;
