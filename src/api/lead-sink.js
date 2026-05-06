// @ts-check

/**
 * @cw/core – emitLead
 *
 * Optionaler Side-Channel für erfolgreiche Form-Submits — pusht den Lead
 * fire-and-forget an Telegram. Kein Throw, kein Block der HTTP-Response.
 *
 * Stille Degradation: wenn TELEGRAM_BOT_TOKEN oder TELEGRAM_CHAT_ID fehlen,
 * tut die Funktion nichts. Resend-Mail-Pfad bleibt davon unberührt.
 *
 * Benötigte Env-Vars (Production, optional):
 *   - TELEGRAM_BOT_TOKEN   — vom @BotFather
 *   - TELEGRAM_CHAT_ID     — Owner-DM- oder Group-Chat-ID
 *   - PROJECT_NAME         — Customer-Slug für Message-Header
 *                            (Fallback: VERCEL_GIT_REPO_SLUG)
 */

/**
 * @typedef {Object} Lead
 * @property {string} project
 * @property {string} fromName
 * @property {string} [name]
 * @property {string} email
 * @property {string} [company]
 * @property {string} [phone]
 * @property {string} [website]
 * @property {string} [message]
 * @property {'contact-form'|'audit'|'bewerbung'} [kind]
 */

/**
 * @typedef {Object} LeadCtx
 * @property {string} [ip]
 * @property {string} [ua]
 * @property {string} [origin]
 */

/**
 * @param {Lead} lead
 * @param {LeadCtx} ctx
 * @returns {Promise<void>}
 */
export async function emitLead(lead, ctx) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;

  const text = formatTelegramMessage(lead, ctx);
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'MarkdownV2',
        disable_web_page_preview: true,
      }),
      signal: AbortSignal.timeout(5_000),
    });
  } catch {
    // never block form-response on TG outage
  }
}

/**
 * Telegram MarkdownV2 verlangt Escape für: _ * [ ] ( ) ~ ` > # + - = | { } . !
 * @param {string} [s]
 * @returns {string}
 */
function esc(s = '') {
  return String(s).replace(/[_*\[\]()~`>#+\-=|{}.!\\]/g, '\\$&');
}

/**
 * @param {Lead} lead
 * @param {LeadCtx} ctx
 * @returns {string}
 */
function formatTelegramMessage(lead, ctx) {
  const project = esc(lead.project || 'unknown');
  const lines = [
    `🆕 *Lead* · ${project}`,
    '',
    `*Name:*  ${esc(lead.name || '—')}`,
    `*Email:* ${esc(lead.email)}`,
  ];
  if (lead.company) lines.push(`*Co\\.:*   ${esc(lead.company)}`);
  if (lead.phone)   lines.push(`*Tel:*   ${esc(lead.phone)}`);
  if (lead.message) {
    const trimmed = lead.message.length > 400
      ? lead.message.slice(0, 400) + '…'
      : lead.message;
    lines.push('', esc(trimmed));
  }
  const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
  lines.push('', `_${esc(stamp + ' UTC')} · ${esc(ctx.origin || '')}_`);
  return lines.join('\n').slice(0, 1024);
}
