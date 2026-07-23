// @ts-check
import { buildBriefingEmail } from '../utils/forms/build-briefing-email.js';
import { getClientIp } from '../utils/net/get-client-ip.js';
import { emitLead } from './lead-sink.js';

/**
 * @cw/core – createBriefingHandler
 *
 * Generischer Briefing-Form-Submit-Handler fuer alle Customer-Websites.
 * Pattern aus customer-mika-elektrotechnik/api/onboarding.ts extrahiert.
 *
 * Schichten (Pruef-Reihenfolge):
 *   1. Method-Check         — nur POST
 *   2. Origin-Check         — nur erlaubte Domains (verhindert Cross-Site-Submission)
 *   3. Payload-Size-Check   — Content-Length max 256 KB (MAJ-10)
 *   4. Rate-Limit           — pro IP (Upstash KV wenn konfiguriert, sonst in-memory)
 *   5. Body-Parsing         — JSON
 *   6. Required-Field-Validation — derived from `sections`
 *   7. (Optional) Email-Regex-Check — wenn email_kontakt-Feld gesetzt
 *   8. Mail-Versand         — internal AWAITED, customer-confirmation AWAITED (MAJ-7)
 *   9. emitLead(briefing-form) — DETACHED nach 200-Response (MAJ-7)
 *
 * Erforderliche Vercel Env-Vars (Production):
 *   - RESEND_API_KEY
 *
 * Optional:
 *   - BRIEFING_EMAIL         (default: 'servus@blitzsicht.com') — Empfaenger der internen
 *                            Briefing-Mail. NICHT `CONTACT_EMAIL` verwenden: die gehoert dem
 *                            contact-handler und muss dort auf die KUNDEN-Adresse zeigen.
 *                            Bis 2026-07 teilten sich beide Handler diese eine Var — auf Sites
 *                            mit beiden Routen war dadurch immer eine Seite falsch adressiert.
 *   - ONBOARDING_FROM_EMAIL  (default: 'Onboarding <onboarding@send.blitzsicht.com>')
 *   - UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN (persistenter Rate-Limit)
 *   - KV_REST_API_URL + KV_REST_API_TOKEN (Vercel-Upstash-Marketplace)
 *   - TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID (Side-Channel-Push)
 *
 * @example Customer-Repo api/onboarding.ts:
 *   import { createBriefingHandler } from '@cw/core/api/briefing-handler';
 *   import { briefingSections } from '../src/data/briefing-fields';
 *
 *   export default createBriefingHandler({
 *     allowedOrigins: ['https://mikaelektro.com', 'https://www.mikaelektro.com'],
 *     fromName: 'Mika Elektrotechnik',
 *     customerName: 'Mika Elektrotechnik',
 *     sections: briefingSections,
 *     submissionUrl: 'https://mikaelektro.com/onboarding',
 *   });
 */

/** @typedef {import('../types/briefing.js').BriefingSection} BriefingSection */

/**
 * @typedef {Object} BriefingHandlerConfig
 * @property {string[]} allowedOrigins
 * @property {string}  fromName
 * @property {string}  customerName
 * @property {BriefingSection[]} sections
 * @property {string}  submissionUrl
 * @property {string} [subjectInternal]
 * @property {string} [subjectConfirmation]
 * @property {string} [fromEmail]
 * @property {string} [confirmationFromEmail]
 * @property {number} [rateLimitMax]
 * @property {number} [rateLimitWindowMs]
 * @property {{ primary?: string, accent?: string }} [brand]
 * @property {boolean} [allowVercelPreviewOrigins]  – Default true: *.vercel.app durchlassen.
 * @property {string} [photoUploadDestination]      – Wenn gesetzt: Confirmation-Mail enthält Foto-Upload-Anleitung (WeTransfer-Pattern). Beispiel: 'servus@blitzsicht.com'.
 * @property {string} [photoUploadServiceLabel]     – Service-Name in der Anleitung. Default: 'WeTransfer'.
 * @property {string} [photoUploadServiceUrl]       – Upload-Service-URL. Default: 'https://wetransfer.com/'.
 */

const MAX_PAYLOAD_BYTES = 256 * 1024; // 256 KB (MAJ-10)
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/; // m13 — server-side check

/** @type {Map<string, number[]>} */
const inMemoryRateLimit = new Map();

/**
 * @param {string} ip
 * @param {number} max
 * @param {number} windowMs
 * @returns {Promise<boolean>}
 */
async function checkRateLimit(ip, max, windowMs) {
  const upstashUrl = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const upstashToken = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

  if (upstashUrl && upstashToken) {
    const key = `rl:briefing:${ip}`;
    try {
      const incrRes = await fetch(`${upstashUrl}/incr/${encodeURIComponent(key)}`, {
        headers: { Authorization: `Bearer ${upstashToken}` },
      });
      const incrData = /** @type {{ result: number }} */ (await incrRes.json());
      if (incrData.result === 1) {
        await fetch(`${upstashUrl}/expire/${encodeURIComponent(key)}/${Math.floor(windowMs / 1000)}`, {
          headers: { Authorization: `Bearer ${upstashToken}` },
        });
      }
      return incrData.result <= max;
    } catch (err) {
      console.error('[briefing-handler] Upstash error, fallback to in-memory:', err);
    }
  }

  const now = Date.now();
  const hits = (inMemoryRateLimit.get(ip) || []).filter((t) => now - t < windowMs);
  if (hits.length >= max) return false;
  hits.push(now);
  inMemoryRateLimit.set(ip, hits);
  return true;
}

/**
 * @param {string} url
 * @returns {string}
 */
function safeOrigin(url) {
  try { return new URL(url).origin; }
  catch { return ''; }
}

/**
 * @param {string[]} sections
 * @returns {string[]}
 */
function flattenRequiredIds(/** @type {BriefingSection[]} */ sections) {
  /** @type {string[]} */
  const ids = [];
  for (const section of sections) {
    for (const field of section.fields) {
      if (field.required) ids.push(field.id);
    }
  }
  return ids;
}

/**
 * @param {BriefingSection[]} sections
 * @param {string} id
 * @returns {{ label: string } | undefined}
 */
function findFieldLabel(sections, id) {
  for (const section of sections) {
    const f = section.fields.find((x) => x.id === id);
    if (f) return { label: f.label };
  }
  return undefined;
}

/**
 * @param {Object} opts
 * @param {string} opts.apiKey
 * @param {string} opts.from
 * @param {string} opts.to
 * @param {string} [opts.replyTo]
 * @param {string} opts.subject
 * @param {string} opts.html
 * @param {string} opts.text
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
async function sendResendMail(opts) {
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${opts.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: opts.from,
        to: opts.to,
        reply_to: opts.replyTo,
        subject: opts.subject,
        html: opts.html,
        text: opts.text,
      }),
    });
    if (!r.ok) {
      const errText = await r.text().catch(() => 'unknown');
      console.error('[briefing-handler] Resend error', r.status, errText);
      return { ok: false, error: `Resend ${r.status}` };
    }
    return { ok: true };
  } catch (err) {
    console.error('[briefing-handler] Resend fetch error:', err);
    return { ok: false, error: 'fetch failed' };
  }
}

/**
 * @param {BriefingHandlerConfig} config
 * @returns {(req: any, res: any) => Promise<void>}
 */
export function createBriefingHandler(config) {
  const allowedOrigins = config.allowedOrigins;
  const fromName = config.fromName;
  const customerName = config.customerName;
  const sections = config.sections;
  const submissionUrl = config.submissionUrl;
  const subjectInternal =
    config.subjectInternal || `Onboarding-Briefing eingegangen: ${customerName}`;
  const subjectConfirmation =
    config.subjectConfirmation || `Wir haben Ihr Briefing erhalten — ${customerName}`;
  const fromEmail =
    config.fromEmail || 'Onboarding <onboarding@send.blitzsicht.com>';
  const confirmationFromEmail = config.confirmationFromEmail || fromEmail;
  const rateLimitMax = config.rateLimitMax ?? 3;
  const rateLimitWindowMs = config.rateLimitWindowMs ?? 10 * 60 * 1000;
  const allowVercelPreviewOrigins = config.allowVercelPreviewOrigins !== false; // default true

  return async function handler(req, res) {
    // ---- 1. Method ----
    if (req.method !== 'POST') {
      res.status(405).json({ ok: false, error: 'Method Not Allowed' });
      return;
    }

    // ---- 2. Origin-Check ----
    const originHeader = req.headers.origin;
    const refererHeader = req.headers.referer;
    const origin = typeof originHeader === 'string' ? originHeader : '';
    const referer = typeof refererHeader === 'string' ? refererHeader : '';
    const sourceUrl = origin || (referer ? safeOrigin(referer) : '');
    if (sourceUrl) {
      let allowed = allowedOrigins.includes(sourceUrl);
      if (!allowed && allowVercelPreviewOrigins) {
        try {
          const host = new URL(sourceUrl).hostname;
          if (host.endsWith('.vercel.app')) allowed = true;
        } catch { /* invalid URL */ }
      }
      if (!allowed) {
        console.warn('[briefing-handler] blocked foreign origin:', sourceUrl);
        res.status(403).json({ ok: false, error: 'Forbidden origin.' });
        return;
      }
    }

    // ---- 3. Payload-Size (MAJ-10) ----
    const contentLengthHeader = req.headers['content-length'];
    const contentLength = typeof contentLengthHeader === 'string'
      ? parseInt(contentLengthHeader, 10)
      : NaN;
    if (Number.isFinite(contentLength) && contentLength > MAX_PAYLOAD_BYTES) {
      res.status(413).json({ ok: false, error: 'Payload zu groß (max 256 KB).' });
      return;
    }

    // ---- 4. Rate-Limit ----
    const ip = getClientIp(req);
    const allowed = await checkRateLimit(ip, rateLimitMax, rateLimitWindowMs);
    if (!allowed) {
      res.status(429).json({
        ok: false,
        error: 'Zu viele Anfragen. Bitte später erneut versuchen.',
      });
      return;
    }

    // ---- 5. Body-Parsing ----
    /** @type {Record<string, string>} */
    let body;
    try {
      if (req.body && typeof req.body === 'object') {
        body = /** @type {Record<string,string>} */ (req.body);
      } else if (typeof req.body === 'string' && req.body.length > 0) {
        // Auch hier hart cappen falls Content-Length-Header fehlt
        if (req.body.length > MAX_PAYLOAD_BYTES) {
          res.status(413).json({ ok: false, error: 'Payload zu groß (max 256 KB).' });
          return;
        }
        body = JSON.parse(req.body);
      } else {
        body = {};
      }
    } catch {
      res.status(400).json({ ok: false, error: 'Ungültiger Body (JSON erwartet).' });
      return;
    }

    // ---- 6. Required-Field-Validation (derived from sections) ----
    const requiredIds = flattenRequiredIds(sections);
    /** @type {string[]} */
    const missing = [];
    for (const id of requiredIds) {
      const v = body[id];
      if (typeof v !== 'string' || v.trim().length === 0) {
        missing.push(id);
      }
    }
    if (missing.length > 0) {
      const labels = missing
        .map((id) => findFieldLabel(sections, id)?.label || id)
        .slice(0, 5)
        .join(', ');
      res.status(400).json({
        ok: false,
        error: `Pflichtfelder fehlen: ${labels}${missing.length > 5 ? ' …' : ''}`,
        missing,
      });
      return;
    }

    // ---- 7. Optional Email-Regex (m13) ----
    const customerEmailRaw =
      (body.email_kontakt || body.email || '').trim();
    if (customerEmailRaw && !EMAIL_REGEX.test(customerEmailRaw)) {
      res.status(400).json({ ok: false, error: 'E-Mail-Adresse ist ungültig.' });
      return;
    }

    // ---- 8. Env-Vars ----
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.error('[briefing-handler] RESEND_API_KEY missing');
      res.status(500).json({
        ok: false,
        error: 'Versand nicht konfiguriert (RESEND_API_KEY).',
      });
      return;
    }
    // BRIEFING_EMAIL statt CONTACT_EMAIL (seit dem zink-Vorfall 2026-07-17): beide Handler
    // teilten sich `CONTACT_EMAIL`, mit gegensaetzlicher Bedeutung — das Briefing gehoert zu
    // Blitzsicht, der Website-Lead zum Kunden. Auf Sites mit beiden Routen (mika, blumen-schmid)
    // war zwangsläufig eine der beiden falsch adressiert. Der Default deckt den Normalfall ab,
    // eine Migration ist deshalb nicht noetig.
    const recipient = process.env.BRIEFING_EMAIL || 'servus@blitzsicht.com';
    const fromAddress = process.env.ONBOARDING_FROM_EMAIL || fromEmail;
    const confirmationFrom =
      process.env.ONBOARDING_FROM_EMAIL || confirmationFromEmail;

    // ---- 9. Build Mails ----
    const mails = buildBriefingEmail({
      customerName,
      payload: body,
      sections,
      submissionUrl,
      requiredFieldIds: requiredIds,
      brand: config.brand,
      photoUploadDestination: config.photoUploadDestination,
      photoUploadServiceLabel: config.photoUploadServiceLabel,
      photoUploadServiceUrl: config.photoUploadServiceUrl,
    });

    // ---- 10. Internal Mail — AWAITED (MAJ-7) ----
    const internalResult = await sendResendMail({
      apiKey,
      from: fromAddress,
      to: recipient,
      replyTo: customerEmailRaw || undefined,
      subject: subjectInternal,
      html: mails.internal.html,
      text: mails.internal.text,
    });
    if (!internalResult.ok) {
      res.status(500).json({
        ok: false,
        error: 'Versand der Briefing-Mail fehlgeschlagen. Bitte später erneut versuchen.',
      });
      return;
    }

    // ---- 11. Customer-Confirmation — AWAITED (MAJ-7 — das war Mika's M1-Bug) ----
    // Fehler hier ist non-fatal fuer den Submit, weil die interne Mail bereits raus ist —
    // wir loggen aber, damit Probleme aufgedeckt werden.
    if (customerEmailRaw && EMAIL_REGEX.test(customerEmailRaw)) {
      const confResult = await sendResendMail({
        apiKey,
        from: confirmationFrom,
        to: customerEmailRaw,
        replyTo: 'servus@blitzsicht.com',
        subject: subjectConfirmation,
        html: mails.confirmation.html,
        text: mails.confirmation.text,
      });
      if (!confResult.ok) {
        console.warn(
          '[briefing-handler] confirmation mail to customer failed (non-fatal):',
          confResult.error,
        );
      }
    }

    // ---- 12. emitLead — AWAITED vor 200 ----
    // Detached/void-Pattern hat in Vercel Serverless NICHT funktioniert: die Function
    // wurde nach res.status(200) gekillt bevor der Telegram-fetch resolved (MAJ-7-Bug
    // identifiziert 2026-05-21 in Mika-Production-Test). emitLead hat in lead-sink eine
    // 5s-AbortSignal-Timeout, also worst-case 5s zusätzliche Response-Latenz —
    // akzeptabel für Briefing-Forms (low traffic). Outage-tolerant: lead-sink wirft nie,
    // wir wrappen trotzdem in catch falls sich das später ändert.
    await emitLead(
      {
        project: process.env.PROJECT_NAME || process.env.VERCEL_GIT_REPO_SLUG || '',
        fromName,
        customerName,
        email: customerEmailRaw || '',
        kind: 'briefing-form',
        requiredFilled: mails.filledRequired,
        requiredTotal: mails.totalRequired,
        briefingPayload: body,
      },
      {
        ip,
        ua: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : undefined,
        origin: sourceUrl,
      },
    ).catch((err) => {
      console.warn('[briefing-handler] emitLead failed (non-fatal):', err);
    });

    // ---- 13. Antwort raus ----
    res.status(200).json({ ok: true });
  };
}
