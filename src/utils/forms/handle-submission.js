// @ts-check
/** @typedef {{ name?: string; email?: string; company?: string; phone?: string; message?: string; website?: string; botcheck?: string | boolean; [key: string]: unknown }} FormPayload */
/** @typedef {{ recipientEmail: string; resendApiKey: string; senderEmail?: string; siteName?: string }} FormSubmissionConfig */
/** @typedef {{ ok: boolean; error?: string }} FormSubmissionResult */

/**
 * @param {FormPayload} data
 * @param {FormSubmissionConfig} config
 * @returns {Promise<FormSubmissionResult>}
 */
export async function handleFormSubmission(data, config) {
  const {
    recipientEmail,
    resendApiKey,
    senderEmail = 'noreply@blitzsicht.com',
    siteName = '',
  } = config;

  if (data.botcheck) return { ok: true };

  const email = typeof data.email === 'string' ? data.email.trim() : '';
  if (!email || !email.includes('@')) {
    return { ok: false, error: 'E-Mail-Adresse fehlt oder ist ungültig.' };
  }

  const name = typeof data.name === 'string' ? data.name.trim() : '';
  const message = typeof data.message === 'string' ? data.message.trim() : '';
  const company = typeof data.company === 'string' ? data.company.trim() : '';
  const phone = typeof data.phone === 'string' ? data.phone.trim() : '';
  const website = typeof data.website === 'string' ? data.website.trim() : '';

  const isAudit = !!website;
  const isBewerbung = message.toLowerCase().includes('bewerbung') || !!phone;

  let subject = `Neue Anfrage über ${siteName || 'Website'}`;
  if (isAudit) subject = `Audit-Anfrage über ${siteName || 'Website'}`;
  if (isBewerbung && !isAudit) subject = `Neue Bewerbung über ${siteName || 'Website'}`;

  /** @type {string[]} */
  const lines = [];
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

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: senderEmail, to: recipientEmail, reply_to: email, subject, text: textBody }),
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
