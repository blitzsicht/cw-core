// @ts-check
import { buildLeadEmail } from '../utils/forms/build-lead-email.js';
import { getClientIp } from '../utils/net/get-client-ip.js';
import { emitLead } from './lead-sink.js';
import { recordConversion } from './conversion-store.js';

/**
 * @cw/core – createContactHandler
 *
 * Zentraler Form-Handler fuer alle Customer-Websites mit eigenem Vercel-Function-
 * Endpoint (api/contact.ts). Kapselt die komplette Spam-Defense-in-Depth in einem
 * Aufruf — keine inline-Logik mehr in den Customer-Repos.
 *
 * Schichten (in Pruef-Reihenfolge):
 *   1. Method-Check    — nur POST
 *   2. Origin-Check    — nur erlaubte Domains (verhindert Cross-Site-Submission)
 *   3. Rate-Limit      — pro IP (Upstash Redis wenn konfiguriert, sonst in-memory)
 *   4. Body-Parsing
 *   5. Honeypot        — botcheck + url_honey -> silent drop (200 ok)
 *   6. Turnstile       — optional: erzwungen NUR wenn TURNSTILE_SECRET_KEY gesetzt ist,
 *                        sonst übersprungen (Schichten 1-5 + 7-9 bleiben aktiv)
 *   7. Email-Validation
 *   8. Content-Filter  — Spam-Keywords / mehrere URLs / BTC/ETH / Cyrillic-Anteil
 *   9. Resend-Versand
 *
 * Erforderliche Vercel Env-Vars (Production):
 *   - CONTACT_EMAIL            — Empfaenger-Adresse (z.B. info@kunde.de)
 *   - RESEND_API_KEY           — Resend API Key
 *
 * Optional (Bot-Schutz-Verstärkung — Handler funktioniert auch ohne):
 *   - TURNSTILE_SECRET_KEY     — Cloudflare Turnstile Secret (+ PUBLIC_TURNSTILE_SITE_KEY
 *                                im Build + challenges.cloudflare.com in der CSP).
 *                                Fehlt der Key, wird Turnstile übersprungen.
 *
 * Optional (fuer persistenten Rate-Limit ueber alle Vercel-Function-Instances):
 *   - UPSTASH_REDIS_REST_URL
 *   - UPSTASH_REDIS_REST_TOKEN
 *
 * @example Customer-Repo api/contact.ts:
 *   import { createContactHandler } from '@cw/core/api/contact-handler';
 *
 *   export default createContactHandler({
 *     allowedOrigins: ['https://kunde.de', 'https://www.kunde.de'],
 *     fromName: 'Kunde GmbH',
 *     subject: 'Neue Anfrage ueber kunde.de',
 *   });
 */

/**
 * @typedef {Object} ContactHandlerConfig
 * @property {string[]} allowedOrigins
 * @property {string} fromName
 * @property {string} [fromEmail]
 * @property {string} subject
 * @property {number} [rateLimitMax]
 * @property {number} [rateLimitWindowMs]
 * @property {string[]} [extraSpamKeywords]
 */

/**
 * @typedef {Object} FormPayload
 * @property {string} [name]
 * @property {string} [email]
 * @property {string} [company]
 * @property {string} [phone]
 * @property {string} [message]
 * @property {string} [website]
 * @property {string|boolean} [botcheck]
 * @property {string} [url_honey]
 * @property {string} [cf-turnstile-response]
 * @property {string} [gclid]   – Ad-Attribution (Google-Klick-ID), s. ATTRIBUTION_KEYS
 * @property {string} [utm_source]
 * @property {string} [utm_medium]
 * @property {string} [utm_campaign]
 * @property {string|boolean} [marketing_consent]  – Einwilligung für Ads-Conversion-Messung (gclid-Upload). Default-Deny.
 * @property {string} [marketing_consent_version]  – Version des angezeigten Consent-Textes (DSGVO-Rechenschaft).
 */

/**
 * @typedef {Record<string, string>} Attribution
 * Gesammelte Ad-/Kampagnen-Attribution (gclid + utm_*). Wird cookielos über
 * Hidden-Form-Felder eingesammelt (URL-Parameter, kein Cookie/kein Consent-Banner)
 * und in Lead-Mail + Telegram-Payload durchgereicht → ermöglicht Offline-Conversion-
 * Zuordnung in Google Ads ohne Browser-Tag.
 */

const DEFAULT_SPAM_KEYWORDS = [
  'seo services', 'seo service', 'link building', 'backlink',
  'cooperation proposal', 'guest post', 'collaboration partnership',
  'crypto', 'bitcoin', 'btc wallet', 'eth wallet',
  'casino', 'viagra', 'cialis',
  'сотрудничество', 'продвижение', 'предложение',
  'click here now', 'limited time offer', 'act now',
];

const URL_PATTERN = /https?:\/\/[^\s<>"]+/gi;
const BTC_PATTERN = /\b(bc1|[13])[a-zA-HJ-NP-Z0-9]{25,62}\b/g;
const ETH_PATTERN = /\b0x[a-fA-F0-9]{40}\b/g;

// Ad-Klick-IDs + UTM-Parameter, die aus dem Formular-Body als Attribution
// durchgereicht werden. Whitelist (nie beliebige Keys übernehmen). Google:
// gclid/gbraid/wbraid · Microsoft/Bing: msclkid · Meta: fbclid.
const ATTRIBUTION_KEYS = [
  'gclid', 'gbraid', 'wbraid', 'msclkid', 'fbclid',
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
];
const ATTRIBUTION_MAX_LEN = 512; // harte Kappung gegen Payload-Missbrauch

/**
 * Sammelt nur die Whitelist-Attribution-Keys aus dem Body, getrimmt + gekappt.
 * Gibt undefined zurück, wenn keine Attribution vorhanden ist (abwärtskompatibel).
 * @param {Record<string, unknown>} body
 * @returns {Attribution | undefined}
 */
function collectAttribution(body) {
  /** @type {Attribution} */
  const out = {};
  for (const key of ATTRIBUTION_KEYS) {
    const raw = body[key];
    if (typeof raw !== 'string') continue;
    const val = raw.trim().slice(0, ATTRIBUTION_MAX_LEN);
    if (val) out[key] = val;
  }
  return Object.keys(out).length ? out : undefined;
}

/** @type {Map<string, number[]>} */
const inMemoryRateLimit = new Map();

/**
 * @param {string} message
 * @param {string[]} extraKeywords
 * @returns {boolean}
 */
function isSpamContent(message, extraKeywords) {
  if (!message) return false;
  const lower = message.toLowerCase();
  const keywords = [...DEFAULT_SPAM_KEYWORDS, ...(extraKeywords || [])];
  if (keywords.some(kw => lower.includes(kw))) return true;
  const urls = message.match(URL_PATTERN);
  if (urls && urls.length >= 2) return true;
  if (BTC_PATTERN.test(message) || ETH_PATTERN.test(message)) return true;
  const cyrillicCount = (message.match(/[Ѐ-ӿ]/g) || []).length;
  const cjkCount = (message.match(/[一-鿿぀-ヿ]/g) || []).length;
  const totalLetters = (message.match(/\p{L}/gu) || []).length;
  if (totalLetters > 20 && (cyrillicCount + cjkCount) / totalLetters > 0.3) return true;
  return false;
}

/**
 * @param {string} ip
 * @param {number} max
 * @param {number} windowMs
 * @returns {Promise<boolean>}
 */
async function checkRateLimit(ip, max, windowMs) {
  // Vercel-Upstash-Marketplace setzt KV_REST_API_*; ältere Setups nutzen UPSTASH_*
  const upstashUrl = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const upstashToken = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

  if (upstashUrl && upstashToken) {
    const key = `rl:contact:${ip}`;
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
      console.error('[contact-handler] Upstash error, fallback to in-memory:', err);
    }
  }

  const now = Date.now();
  const hits = (inMemoryRateLimit.get(ip) || []).filter(t => now - t < windowMs);
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
 * @param {ContactHandlerConfig} config
 * @returns {(req: any, res: any) => Promise<void>}
 */
export function createContactHandler(config) {
  const allowedOrigins = config.allowedOrigins;
  const fromName = config.fromName;
  const fromEmail = config.fromEmail || 'noreply@blitzsicht.com';
  const subject = config.subject;
  const rateLimitMax = config.rateLimitMax ?? 3;
  const rateLimitWindowMs = config.rateLimitWindowMs ?? 10 * 60 * 1000;
  const extraSpamKeywords = config.extraSpamKeywords || [];

  return async function handler(req, res) {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method Not Allowed' });
      return;
    }

    // Origin-Check
    const originHeader = req.headers.origin;
    const refererHeader = req.headers.referer;
    const origin = typeof originHeader === 'string' ? originHeader : '';
    const referer = typeof refererHeader === 'string' ? refererHeader : '';
    const sourceUrl = origin || (referer ? safeOrigin(referer) : '');
    if (sourceUrl && !allowedOrigins.includes(sourceUrl)) {
      console.warn('[contact-handler] blocked foreign origin:', sourceUrl);
      res.status(403).json({ ok: false, error: 'Forbidden origin.' });
      return;
    }

    // Rate-Limit
    const ip = getClientIp(req);
    const allowed = await checkRateLimit(ip, rateLimitMax, rateLimitWindowMs);
    if (!allowed) {
      res.status(429).json({ ok: false, error: 'Zu viele Anfragen. Bitte später erneut versuchen.' });
      return;
    }

    // Body parsen
    /** @type {FormPayload} */
    const body = (req.body && typeof req.body === 'object')
      ? req.body
      : (() => {
          try { return JSON.parse(req.body); }
          catch { return {}; }
        })();

    // Honeypot — silent drop
    if (body.botcheck || body.url_honey) {
      console.log('[contact-handler] honeypot triggered, ip=', ip);
      res.status(200).json({ ok: true });
      return;
    }

    // Turnstile — OPTIONAL: nur erzwingen, wenn TURNSTILE_SECRET_KEY gesetzt ist.
    // Ohne Secret degradiert der Schutz bewusst auf Honeypot + Rate-Limit + Origin-Check
    // + Content-Filter (vier aktive Schichten) — ein funktionierendes Formular ist besser
    // als ein totes. Turnstile ist jederzeit per Env (+ Widget + CSP-Host) nachrüstbar,
    // ohne Code-Änderung. Mit gesetztem Secret ist die Prüfung weiterhin Pflicht.
    const turnstileSecret = process.env.TURNSTILE_SECRET_KEY;
    if (turnstileSecret) {
      const token = typeof body['cf-turnstile-response'] === 'string'
        ? body['cf-turnstile-response'] : '';
      if (!token) {
        res.status(400).json({ ok: false, error: 'Bot-Schutz-Prüfung fehlt.' });
        return;
      }
      try {
        const cfRes = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ secret: turnstileSecret, response: token, remoteip: ip }),
        });
        const cfData = /** @type {{ success: boolean }} */ (await cfRes.json());
        if (!cfData.success) {
          res.status(400).json({ ok: false, error: 'Bot-Schutz-Prüfung fehlgeschlagen.' });
          return;
        }
      } catch (err) {
        console.error('[contact-handler] Turnstile fetch error:', err);
        res.status(500).json({ ok: false, error: 'Bot-Schutz-Prüfung fehlgeschlagen.' });
        return;
      }
    } else {
      console.warn('[contact-handler] TURNSTILE_SECRET_KEY nicht gesetzt — Turnstile übersprungen (Honeypot + Rate-Limit + Origin-Check + Content-Filter bleiben aktiv).');
    }

    // Email-Validation
    const email = typeof body.email === 'string' ? body.email.trim() : '';
    if (!email || !email.includes('@')) {
      res.status(400).json({ ok: false, error: 'E-Mail-Adresse fehlt oder ist ungültig.' });
      return;
    }

    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const company = typeof body.company === 'string' ? body.company.trim() : '';
    const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
    const message = typeof body.message === 'string' ? body.message.trim() : '';
    const website = typeof body.website === 'string' ? body.website.trim() : '';
    // Ad-Attribution (gclid + utm_*) cookielos aus Hidden-Feldern durchreichen.
    const attribution = collectAttribution(/** @type {Record<string, unknown>} */ (body));
    // Marketing-Consent-Signal (WS-E liefert die Checkbox/Consent-Mode-Flag). Gatet NUR
    // den conversion_queue-Write (gclid-Upload = einwilligungspflichtig). Default-Deny.
    const marketingConsent = body.marketing_consent === true
      || body.marketing_consent === 'true' || body.marketing_consent === '1';
    // Version des angezeigten Consent-Textes (WS-E liefert sie) — für DSGVO-Rechenschaft
    // (Art. 5(2)/7(1)) zusammen mit dem Zeitstempel in der conversion_queue protokolliert.
    const consentVersion = typeof body.marketing_consent_version === 'string'
      ? body.marketing_consent_version
      : undefined;

    // Content-Filter — silent drop
    const haystack = [name, company, message, website].filter(Boolean).join(' ');
    if (isSpamContent(haystack, extraSpamKeywords)) {
      console.log('[contact-handler] spam pattern matched, ip=', ip, 'preview=', haystack.slice(0, 80));
      res.status(200).json({ ok: true });
      return;
    }

    // Lead-Objekt (für Versand + für den Fehlmeldungs-Alarm bei fehlender Env).
    const leadData = {
      project: process.env.PROJECT_NAME || process.env.VERCEL_GIT_REPO_SLUG || '',
      fromName, name, email, company, phone, website, message,
      kind: /** @type {const} */ ('contact-form'),
      ...(attribution ? { attribution } : {}),
    };
    const leadCtx = {
      ip,
      ua: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : undefined,
      origin: sourceUrl,
    };

    // Resend-Versand. Fehlt eine Env-Var, wird der Lead trotzdem via Telegram gemeldet
    // (deliveryError) → Ops wird aktiv alarmiert UND der Lead geht nicht verloren.
    const recipient = process.env.CONTACT_EMAIL;
    if (!recipient) {
      console.error('[contact-handler] CONTACT_EMAIL missing');
      await emitLead(leadData, { ...leadCtx, deliveryError: 'CONTACT_EMAIL nicht in Vercel-Env gesetzt' });
      res.status(500).json({ ok: false, error: 'Empfänger nicht konfiguriert.' });
      return;
    }
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.error('[contact-handler] RESEND_API_KEY missing');
      await emitLead(leadData, { ...leadCtx, deliveryError: 'RESEND_API_KEY nicht in Vercel-Env gesetzt' });
      res.status(500).json({ ok: false, error: 'Email-Versand nicht konfiguriert.' });
      return;
    }

    const mail = buildLeadEmail({
      siteName: fromName,
      fromAddress: fromEmail,
      leadName: name,
      leadEmail: email,
      leadCompany: company,
      leadPhone: phone,
      leadWebsite: website,
      leadMessage: message,
      leadAttribution: attribution,
      subject,
    });

    try {
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: mail.fromHeader,
          to: recipient,
          reply_to: email,
          subject: mail.subject,
          html: mail.html,
          text: mail.text,
        }),
      });
      if (!r.ok) {
        const errText = await r.text().catch(() => 'Unknown');
        console.error('[contact-handler] Resend error', r.status, errText);
        res.status(400).json({ ok: false, error: 'Email konnte nicht gesendet werden.' });
        return;
      }
      // emitLead BEFORE res.json — sonst killt Vercel die Function bevor der Telegram-fetch
      // fertig ist. AbortSignal in lead-sink begrenzt das auf max 5s, normal ~200ms.
      // Beide Side-Channels parallel + gekapselt: Promise.allSettled rejected nie, also
      // kann weder ein Telegram- noch ein Store-Fehler die bereits gesendete Mail in ein
      // falsches 500 verwandeln; Worst-Case-Latenz bleibt ~5s statt 2×5s sequenziell.
      // recordConversion ist No-op ohne CW_CONVERSION_STORE_URL oder ohne Consent.
      await Promise.allSettled([
        emitLead(leadData, leadCtx),
        recordConversion(leadData, { ...leadCtx, marketingConsent, consentVersion }),
      ]);
      res.status(200).json({ ok: true });
    } catch (err) {
      console.error('[contact-handler] Resend fetch error:', err);
      res.status(500).json({ ok: false, error: 'Email konnte nicht gesendet werden.' });
    }
  };
}
