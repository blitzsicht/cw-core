/**
 * @cw/core – server-side form submission handler
 *
 * Validates form data, checks honeypot, sends email via Resend (EU region).
 * Designed to be called from a Vercel Function (`/api/contact.ts`).
 *
 * @example
 *   import { handleFormSubmission } from '@cw/core/utils/forms/handle-submission';
 *
 *   export default async function handler(req, res) {
 *     const result = await handleFormSubmission(req.body, {
 *       recipientEmail: process.env.CONTACT_EMAIL!,
 *       resendApiKey: process.env.RESEND_API_KEY!,
 *       senderEmail: 'noreply@blitzsicht.com',
 *       siteName: 'Kundenname',
 *     });
 *     res.status(result.ok ? 200 : 400).json(result);
 *   }
 */

export interface FormSubmissionConfig {
  /** Email address that receives the form submission. */
  recipientEmail: string;
  /** Resend API key. */
  resendApiKey: string;
  /** Verified sender email (e.g. noreply@blitzsicht.com). */
  senderEmail?: string;
  /** Site name for the email subject line. */
  siteName?: string;
  /** Cloudflare Turnstile secret key. When set, validates the CAPTCHA token. */
  turnstileSecretKey?: string;
}

export interface FormSubmissionResult {
  ok: boolean;
  error?: string;
}

interface FormPayload {
  name?: string;
  email?: string;
  company?: string;
  phone?: string;
  message?: string;
  website?: string;
  botcheck?: string | boolean;
  [key: string]: unknown;
}

/**
 * Handle a form submission: validate, check honeypot, send via Resend.
 *
 * @param data - Parsed JSON body from the form POST
 * @param config - Recipient, API key, sender identity
 */
export async function handleFormSubmission(
  data: FormPayload,
  config: FormSubmissionConfig,
): Promise<FormSubmissionResult> {
  const {
    recipientEmail,
    resendApiKey,
    senderEmail = 'noreply@blitzsicht.com',
    siteName = '',
    turnstileSecretKey,
  } = config;

  // --- Honeypot check ---
  if (data.botcheck) {
    // Bots fill hidden fields. Silently accept to not reveal detection.
    return { ok: true };
  }

  // --- Turnstile verification ---
  if (turnstileSecretKey) {
    const token = typeof data['cf-turnstile-response'] === 'string'
      ? data['cf-turnstile-response'] : '';
    if (!token) {
      return { ok: false, error: 'Bot-Schutz-Prüfung fehlt.' };
    }
    const cfRes = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret: turnstileSecretKey, response: token }),
    });
    const cfData = await cfRes.json() as { success: boolean };
    if (!cfData.success) {
      return { ok: false, error: 'Bot-Schutz-Prüfung fehlgeschlagen.' };
    }
  }

  // --- Validation ---
  const email = typeof data.email === 'string' ? data.email.trim() : '';
  if (!email || !email.includes('@')) {
    return { ok: false, error: 'E-Mail-Adresse fehlt oder ist ungültig.' };
  }

  const name = typeof data.name === 'string' ? data.name.trim() : '';
  const message = typeof data.message === 'string' ? data.message.trim() : '';
  const company = typeof data.company === 'string' ? data.company.trim() : '';
  const phone = typeof data.phone === 'string' ? data.phone.trim() : '';
  const website = typeof data.website === 'string' ? data.website.trim() : '';

  // --- Build email ---
  const isAudit = !!website;
  const isBewerbung = message.toLowerCase().includes('bewerbung') || !!phone;

  let subject = `Neue Anfrage über ${siteName || 'Website'}`;
  if (isAudit) subject = `Audit-Anfrage über ${siteName || 'Website'}`;
  if (isBewerbung && !isAudit) subject = `Neue Bewerbung über ${siteName || 'Website'}`;

  const lines: string[] = [];
  if (name) lines.push(`Name: ${name}`);
  lines.push(`Email: ${email}`);
  if (company) lines.push(`Unternehmen: ${company}`);
  if (phone) lines.push(`Telefon: ${phone}`);
  if (website) lines.push(`Website: ${website}`);
  if (message) {
    lines.push('');
    lines.push('Nachricht:');
    lines.push(message);
  }

  const textBody = lines.join('\n');

  // --- Send via Resend ---
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: senderEmail,
        to: recipientEmail,
        reply_to: email,
        subject,
        text: textBody,
      }),
    });

    if (!res.ok) {
      const err = await res.text().catch(() => 'Unknown error');
      console.error('[cw/core] Resend error:', res.status, err);
      return { ok: false, error: 'Email konnte nicht gesendet werden.' };
    }

    return { ok: true };
  } catch (err) {
    console.error('[cw/core] Resend fetch error:', err);
    return { ok: false, error: 'Email konnte nicht gesendet werden.' };
  }
}
