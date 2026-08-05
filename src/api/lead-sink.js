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
 * @property {string} [studio]  – Studio-/Betriebsname (Wartelisten-Formular)
 * @property {string} [phone]
 * @property {string} [website]
 * @property {string} [message]
 * @property {'contact-form'|'audit'|'bewerbung'|'briefing-form'|'waitlist'} [kind]
 * @property {Record<string,string>} [attribution] – gclid + utm_* (Ad-Herkunft), cookielos durchgereicht.
 * @property {string} [customerName]              – Briefing-only: Anzeigename des Kunden.
 * @property {number} [requiredFilled]            – Briefing-only: ausgefuellte Pflichtfelder.
 * @property {number} [requiredTotal]             – Briefing-only: Gesamt-Pflichtfelder.
 * @property {Record<string,string>} [briefingPayload] – Briefing-only: Form-Payload fuer Preview.
 */

/**
 * @typedef {Object} LeadCtx
 * @property {string} [ip]
 * @property {string} [ua]
 * @property {string} [origin]
 * @property {string} [deliveryError] – Wenn gesetzt: Mail-Zustellung schlug fehl (z.B.
 *   fehlende Env-Var). Lead wird trotzdem mit Warn-Header gesendet (Alarm + kein Lead-Verlust).
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
  const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');

  // Briefing-Form bekommt eine kompakte eigene Darstellung (≤200 Zeichen Pflicht aus CRIT-2).
  if (lead.kind === 'briefing-form') {
    const customer = esc(lead.customerName || lead.fromName || project);
    const filled = typeof lead.requiredFilled === 'number' ? lead.requiredFilled : 0;
    const total = typeof lead.requiredTotal === 'number' ? lead.requiredTotal : 0;

    // Preview: erste 2 ausgefuellte Felder aus dem Briefing-Payload — IDs wie
    // 'firmenname_offiziell', 'ansprechpartner', 'geschaeftsfuehrung' bevorzugen.
    /** @type {string[]} */
    const previewItems = [];
    const payload = lead.briefingPayload || {};
    const preferredKeys = ['firmenname_offiziell', 'firma', 'ansprechpartner', 'geschaeftsfuehrung', 'name'];
    for (const k of preferredKeys) {
      if (previewItems.length >= 2) break;
      const v = (payload[k] || '').trim();
      if (v) {
        const short = v.length > 40 ? v.slice(0, 40) + '…' : v;
        previewItems.push(`${esc(k)}: ${esc(short)}`);
      }
    }

    const lines = [
      `📋 *Briefing* · ${esc(customer)} · ${filled}/${total} Pflicht`,
    ];
    if (previewItems.length > 0) {
      lines.push('', ...previewItems);
    }
    // Footer-Zeile mit Stamp+Origin (gespiegelt vom Contact-Path)
    lines.push('', `_${esc(stamp + ' UTC')} · ${esc(ctx.origin || '')}_`);
    // Hard-Cap auf 200 Zeichen (inkl. Markdown-Escapes) wie in CRIT-2 spezifiziert
    return lines.join('\n').slice(0, 200);
  }

  // Default: Contact-Form / audit / bewerbung / waitlist — bisheriger Renderer;
  // waitlist bekommt nur einen eigenen Header + Studio-Zeile.
  // Bei deliveryError (z.B. RESEND_API_KEY/CONTACT_EMAIL fehlt) wird der Lead trotzdem
  // gesendet, mit Warn-Header — Ops wird alarmiert UND der Lead geht nicht verloren.
  const header = lead.kind === 'waitlist'
    ? `📋 *Warteliste* · ${project}`
    : `🆕 *Lead* · ${project}`;
  const lines = ctx.deliveryError
    ? [
        `⚠️ *ZUSTELLUNG FEHLGESCHLAGEN* · ${project}`,
        `_${esc(ctx.deliveryError)} — Lead per Mail nicht zugestellt, bitte manuell bearbeiten:_`,
        '',
        `*Name:*  ${esc(lead.name || '—')}`,
        `*Email:* ${esc(lead.email)}`,
      ]
    : [
        header,
        '',
        `*Name:*  ${esc(lead.name || '—')}`,
        `*Email:* ${esc(lead.email)}`,
      ];
  if (lead.studio)  lines.push(`*Studio:* ${esc(lead.studio)}`);
  if (lead.company) lines.push(`*Co\\.:*   ${esc(lead.company)}`);
  if (lead.phone)   lines.push(`*Tel:*   ${esc(lead.phone)}`);
  if (lead.message) {
    const trimmed = lead.message.length > 400
      ? lead.message.slice(0, 400) + '…'
      : lead.message;
    lines.push('', esc(trimmed));
  }
  // Ad-Herkunft kompakt: macht bezahlte Leads im Telegram sofort erkennbar.
  if (lead.attribution) {
    const a = lead.attribution;
    /** @type {string[]} */
    const bits = [];
    if (a.utm_source) bits.push(esc(a.utm_source + (a.utm_medium ? '/' + a.utm_medium : '')));
    if (a.utm_campaign) bits.push(esc(a.utm_campaign));
    if (a.gclid || a.gbraid || a.wbraid) bits.push('gclid');
    else if (a.msclkid) bits.push('msclkid');
    else if (a.fbclid) bits.push('fbclid');
    if (bits.length) lines.push('', `📣 ${bits.join(' · ')}`);
  }
  lines.push('', `_${esc(stamp + ' UTC')} · ${esc(ctx.origin || '')}_`);
  return lines.join('\n').slice(0, 1024);
}
