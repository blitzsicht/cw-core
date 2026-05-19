// @ts-check
/**
 * @cw/core – buildLeadEmail
 *
 * Erzeugt FROM-Header, Subject, HTML + Plain-Text fuer eine Lead-Notification-Mail.
 * Wird von createContactHandler aufgerufen — alle Customer-Sites bekommen das gleiche
 * Branding (Blitzsicht-Header + Footer-Stripe + Direkt-Antworten-Button).
 *
 * Brand-Farben aus customer-websites/CLAUDE.md:
 *   - Nachtblau:   #1D1E3B
 *   - Orange:      #EF7612
 *
 * Logo:  https://blitzsicht.com/lead-mail/logo-white.png  (240x64, weiss auf transparent)
 */

const BRAND_PRIMARY = '#1D1E3B';
const BRAND_ACCENT = '#EF7612';
const LOGO_URL = 'https://blitzsicht.com/lead-mail/logo-white.png';
const FOOTER_LINK = 'https://blitzsicht.com';

/**
 * @typedef {Object} BuildLeadEmailInput
 * @property {string} siteName       – z.B. 'Sachverstaendigenbuero Gottl Richter Gomeier'
 * @property {string} fromAddress    – z.B. 'noreply@blitzsicht.com'
 * @property {string} [leadName]
 * @property {string}  leadEmail
 * @property {string} [leadCompany]
 * @property {string} [leadPhone]
 * @property {string} [leadWebsite]
 * @property {string} [leadMessage]
 * @property {string}  subject       – Betreff der Lead-Mail (intern)
 */

/**
 * @typedef {Object} BuildLeadEmailOutput
 * @property {string} fromHeader     – RFC-5322 quoted From-Header inkl. Display-Name
 * @property {string} subject
 * @property {string} html
 * @property {string} text
 */

/**
 * @param {string} s
 * @returns {string}
 */
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * RFC-5322 quoted-string fuer Display-Name. Escapt " und \.
 * @param {string} s
 * @returns {string}
 */
function quoteDisplayName(s) {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/**
 * @param {BuildLeadEmailInput} input
 * @returns {BuildLeadEmailOutput}
 */
export function buildLeadEmail(input) {
  const {
    siteName,
    fromAddress,
    leadName = '',
    leadEmail,
    leadCompany = '',
    leadPhone = '',
    leadWebsite = '',
    leadMessage = '',
    subject,
  } = input;

  // FROM-Display-Name: "{Lead-Name} via {Customer-Site}" — wenn kein Lead-Name,
  // dann "Anonyme Anfrage via {Customer-Site}".
  const displayPerson = leadName.trim() || 'Anonyme Anfrage';
  const displayName = `${displayPerson} via ${siteName}`;
  const fromHeader = `"${quoteDisplayName(displayName)}" <${fromAddress}>`;

  // Mailto-Body mit freundlichem Opener + originaler Anfrage als Quote
  const replyGreeting = leadName.trim() ? `Hallo ${leadName},` : 'Hallo,';
  const replyBody =
    `${replyGreeting}\n\n` +
    `vielen Dank für Ihre Anfrage über unsere Website. ` +
    `Gerne komme ich auf Ihr Anliegen zurück.\n\n` +
    `Mit freundlichen Grüßen\n\n\n` +
    `---\nUrsprüngliche Anfrage:\n${leadMessage || '(keine Nachricht)'}`;
  const replySubject = `Re: Ihre Anfrage über ${siteName}`;
  const mailtoHref =
    `mailto:${encodeURIComponent(leadEmail)}` +
    `?subject=${encodeURIComponent(replySubject)}` +
    `&body=${encodeURIComponent(replyBody)}`;

  // ---------- Plain-Text-Fallback ----------
  const textLines = [];
  textLines.push(`Lead-Anfrage über ${siteName}`);
  textLines.push('');
  if (leadName) textLines.push(`Name:    ${leadName}`);
  textLines.push(`E-Mail:  ${leadEmail}`);
  if (leadPhone) textLines.push(`Telefon: ${leadPhone}`);
  if (leadCompany) textLines.push(`Firma:   ${leadCompany}`);
  if (leadWebsite) textLines.push(`Website: ${leadWebsite}`);
  if (leadMessage) {
    textLines.push('');
    textLines.push('Nachricht:');
    textLines.push(leadMessage);
  }
  textLines.push('');
  textLines.push('---');
  textLines.push(`Direkt antworten: ${mailtoHref}`);
  textLines.push('');
  textLines.push('—');
  textLines.push(`Lead-Erfassung • blitzsicht.com`);
  const text = textLines.join('\n');

  // ---------- HTML-Template ----------
  const safeSiteName = escapeHtml(siteName);
  const safeLeadName = leadName ? escapeHtml(leadName) : '';
  const safeLeadEmail = escapeHtml(leadEmail);
  const safeLeadCompany = leadCompany ? escapeHtml(leadCompany) : '';
  const safeLeadPhone = leadPhone ? escapeHtml(leadPhone) : '';
  const safeLeadWebsite = leadWebsite ? escapeHtml(leadWebsite) : '';
  const safeLeadMessage = leadMessage ? escapeHtml(leadMessage) : '';
  const buttonLabel = leadName.trim()
    ? `Direkt an ${escapeHtml(leadName.split(/\s+/)[0])} antworten →`
    : `Direkt antworten →`;

  /** @type {string[]} */
  const rows = [];
  if (safeLeadName) rows.push(detailRow('Name', safeLeadName));
  rows.push(detailRow('E-Mail', `<a href="mailto:${safeLeadEmail}" style="color:${BRAND_PRIMARY};text-decoration:underline;">${safeLeadEmail}</a>`));
  if (safeLeadPhone) rows.push(detailRow('Telefon', `<a href="tel:${safeLeadPhone}" style="color:${BRAND_PRIMARY};text-decoration:underline;">${safeLeadPhone}</a>`));
  if (safeLeadCompany) rows.push(detailRow('Firma', safeLeadCompany));
  if (safeLeadWebsite) rows.push(detailRow('Website', safeLeadWebsite));

  const messageBlock = safeLeadMessage
    ? `
        <h2 style="font-size:12px;color:#6b7280;margin:28px 0 10px;text-transform:uppercase;letter-spacing:0.6px;font-weight:600;">Nachricht</h2>
        <div style="background:#f9fafb;border-left:3px solid ${BRAND_ACCENT};padding:14px 18px;border-radius:6px;font-size:14px;line-height:1.65;color:#1f2937;white-space:pre-wrap;">${safeLeadMessage}</div>`
    : '';

  const html = `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="only light">
  <meta name="supported-color-schemes" content="light">
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1f2937;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f5f5f7;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.06);">

        <tr><td style="background:${BRAND_PRIMARY};padding:24px 32px;">
          <img src="${LOGO_URL}" width="120" height="32" alt="Blitzsicht" style="display:block;border:0;outline:none;text-decoration:none;height:32px;">
          <div style="color:#ffffff;font-size:12px;letter-spacing:0.6px;margin-top:10px;opacity:0.85;font-weight:600;text-transform:uppercase;">Neuer Lead über Blitzsicht</div>
        </td></tr>

        <tr><td style="padding:32px;">
          <h1 style="margin:0 0 4px;font-size:18px;color:${BRAND_PRIMARY};font-weight:700;">Lead-Anfrage über ${safeSiteName}</h1>
          <p style="margin:0;font-size:13px;color:#6b7280;">Diese Anfrage kam soeben über Ihr Kontaktformular ein.</p>
          <hr style="border:0;border-top:1px solid #e5e7eb;margin:20px 0;">

          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="font-size:14px;">
            ${rows.join('')}
          </table>
${messageBlock}

          <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:28px 0 4px;">
            <tr><td bgcolor="${BRAND_ACCENT}" style="border-radius:8px;">
              <a href="${mailtoHref}" style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">${buttonLabel}</a>
            </td></tr>
          </table>
          <p style="margin:8px 0 0;font-size:12px;color:#9ca3af;">Antwort geht direkt an ${safeLeadEmail}</p>
        </td></tr>

        <tr><td style="background:${BRAND_PRIMARY};padding:14px 32px;color:#ffffff;font-size:12px;text-align:center;">
          <span style="opacity:0.8;">Lead-Erfassung &bull; </span><a href="${FOOTER_LINK}" style="color:#ffffff;text-decoration:underline;">blitzsicht.com</a>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

  return { fromHeader, subject, html, text };
}

/**
 * @param {string} label
 * @param {string} value  – bereits HTML-escaped
 * @returns {string}
 */
function detailRow(label, value) {
  return `
            <tr>
              <td style="padding:6px 12px 6px 0;color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;font-weight:600;width:90px;vertical-align:top;">${escapeHtml(label)}</td>
              <td style="padding:6px 0;color:#1f2937;font-size:14px;vertical-align:top;">${value}</td>
            </tr>`;
}
