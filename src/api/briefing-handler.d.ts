import type { BriefingSection } from '../types/briefing.js';

export interface BriefingHandlerConfig {
  /** Erlaubte Origin-URLs (z.B. ['https://mikaelektro.com', 'https://www.mikaelektro.com']) */
  allowedOrigins: string[];
  /** Anzeigename im From-Header (z.B. 'Mika Elektrotechnik') */
  fromName: string;
  /** Customer-Anzeigename — wird in Mail-Header + Telegram-Push verwendet. */
  customerName: string;
  /** Section-Schema (Source of Truth — Customer-Repo importiert von hier). */
  sections: BriefingSection[];
  /** Vollstaendige Customer-Onboarding-URL (NICHT hardcoden — z.B. https://mikaelektro.com/onboarding). */
  submissionUrl: string;
  /** Default: `Onboarding-Briefing eingegangen: ${customerName}` */
  subjectInternal?: string;
  /** Default: `Wir haben Ihr Briefing erhalten — ${customerName}` */
  subjectConfirmation?: string;
  /** Default: 'Onboarding <onboarding@send.blitzsicht.com>' */
  fromEmail?: string;
  /** Default: gleich `fromEmail` */
  confirmationFromEmail?: string;
  /** Default: 3 Submits pro Window. */
  rateLimitMax?: number;
  /** Default: 600_000 (10 min). */
  rateLimitWindowMs?: number;
  /** Brand-Color-Overrides fuer die Mail-Bodies (siehe buildBriefingEmail). */
  brand?: { primary?: string; accent?: string };
  /** Default: true — *.vercel.app Origins werden zugelassen (Preview-Deploys). */
  allowVercelPreviewOrigins?: boolean;
}

export type BriefingHandler = (req: any, res: any) => Promise<void>;

/**
 * Factory fuer den Briefing-Form-Submit-Handler.
 *
 * Garantien:
 * - Required-Field-Validation derived aus `config.sections` (kein magic ID-Mapping).
 * - Internal-Mail wird AWAITED vor 200.
 * - Customer-Confirmation-Mail wird AWAITED vor 200 (war Mika's M1-Bug — siehe Plan).
 * - emitLead/Telegram-Push laeuft DETACHED nach Response (User wartet nicht auf 5s-Timeout).
 * - Payload-Cap 256 KB.
 * - IP-Extraction via shared `getClientIp` (x-vercel-forwarded-for > XFF LAST > x-real-ip > socket).
 */
export function createBriefingHandler(config: BriefingHandlerConfig): BriefingHandler;
