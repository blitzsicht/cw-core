// @ts-check
import { buildLeadEmail } from '../utils/forms/build-lead-email.js';
import { getClientIp } from '../utils/net/get-client-ip.js';
import { emitLead } from './lead-sink.js';
import { recordConversion } from './conversion-store.js';
import { captureError } from './error-sink.js';

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
 *   5. Honeypot        — botcheck + url_honey -> silent drop (200 ok); mit gültigem
 *                        Turnstile-Token zusätzlich GlitchTip-Meldung (Feld, kein Inhalt)
 *   6. Turnstile       — optional: erzwungen NUR wenn TURNSTILE_SECRET_KEY gesetzt ist,
 *                        sonst übersprungen (Schichten 1-5 + 7-9 bleiben aktiv)
 *   7. Email-Validation — bei `formType=rueckruf` UND `allowRueckruf: true` stattdessen
 *                        Telefon Pflicht, E-Mail freiwillig (wenn angegeben, muss sie
 *                        plausibel sein). Ohne Opt-in bleibt die E-Mail Pflicht, s. u.
 *                        Telefon + Zeitfenster werden in jedem Formular geprüft, sobald
 *                        sie gesendet werden (Telefon: nur Ziffern, Leerzeichen, + ( ) / - .
 *                        und ein Durchwahl-Trenner).
 *                        Bei `formType=empfehlung` UND `allowEmpfehlung: true`: Name
 *                        Pflicht, E-Mail ODER Telefon (mindestens eins), `empfohlen`
 *                        freiwillig und max. 80 Zeichen.
 *   8. Content-Filter  — Spam-Keywords / mehrere URLs / BTC/ETH / Cyrillic-Anteil
 *                        -> silent drop (200 ok); mit Turnstile-Secret zusätzlich
 *                        GlitchTip-Meldung (nur der Grund, kein Inhalt)
 *   9. Resend-Versand
 *
 * Erforderliche Vercel Env-Vars (Production):
 *   - CONTACT_EMAIL            — Empfaenger-Adresse (z.B. info@kunde.de). Muss die Adresse
 *                                DES KUNDEN sein, nicht die von Blitzsicht — sonst bekommt
 *                                der Kunde seine Leads nie (Vorfall zink-baeckerei 2026-07-17,
 *                                Guard: scripts/validate-contact-recipient.mjs).
 *                                Komma-Liste erlaubt; Whitespace wird getrimmt.
 *   - RESEND_API_KEY           — Resend API Key
 *
 * Optional (Blitzsicht-Mitschnitt — Handler funktioniert auch ohne):
 *   - LEAD_BCC_EMAIL           — bcc-Kopie jedes Leads (z.B. servus@blitzsicht.com), sinnvoll
 *                                als Shared Env auf Team-Ebene. Adressen, die schon im `to`
 *                                stehen, werden automatisch uebersprungen.
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
 * @property {'contact-form'|'waitlist'} [kind] – Lead-Art des Endpoints. Default
 *   'contact-form' (bisheriges Verhalten). 'waitlist' für Wartelisten-Formulare
 *   (ContactForm formType="waitlist"): extrahiert zusätzlich `studio` und labelt
 *   den Telegram-Push als Warteliste.
 * @property {boolean} [allowRueckruf] – Opt-in für ContactForm formType="rueckruf".
 *   Default false. Nur mit `true` nimmt der Endpoint einen Rückruf-Wunsch OHNE E-Mail
 *   an (Telefon ist dann Pflicht) und labelt den Lead als `kind: 'rueckruf'`. Grund:
 *   `formType` kommt vom Client — ohne Opt-in könnte ein handgebauter POST an jedem
 *   Endpoint die E-Mail-Pflicht aufheben und `kind` (z. B. 'waitlist') überschreiben.
 *   Ohne Opt-in wird `formType=rueckruf` wie ein normaler Kontakt behandelt; fehlt dann
 *   die E-Mail, antwortet der Endpoint 400, meldet den Lead aber als Zustellfehler an
 *   Telegram + GlitchTip (eingebautes Formular, vergessenes Opt-in → kein stiller Verlust).
 * @property {boolean} [allowEmpfehlung] – Opt-in für ContactForm formType="empfehlung".
 *   Default false, Begründung wie bei `allowRueckruf`. Nur mit `true` gilt: Name Pflicht,
 *   E-Mail ODER Telefon (mindestens eins), Feld `empfohlen` (max. 80 Zeichen, läuft durch
 *   den Inhaltsfilter), Lead als `kind: 'empfehlung'`. Ohne Opt-in wie ein Kontakt; eine
 *   Empfehlung ohne E-Mail, aber mit Telefon → 400 + Alarm an Telegram und GlitchTip.
 */

/**
 * @typedef {Object} FormPayload
 * @property {string} [name]
 * @property {string} [email]
 * @property {string} [company]
 * @property {string} [phone]
 * @property {string} [message]
 * @property {string} [website]
 * @property {string} [studio]  – Studio-/Betriebsname (formType="waitlist")
 * @property {string} [formType] – nur 'rueckruf' und 'empfehlung' werden ausgewertet (Hidden-Feld)
 * @property {string} [telefon]  – Rückrufnummer (formType="rueckruf"), mind. 6 Ziffern
 * @property {string} [zeitfenster] – gewünschtes Rückruf-Zeitfenster, max. 60 Zeichen
 * @property {string} [empfohlen] – Vorname oder Firma der empfohlenen Person (formType="empfehlung"), max. 80 Zeichen
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

/**
 * Zerlegt eine Env-Adressliste (`CONTACT_EMAIL`, `LEAD_BCC_EMAIL`) in saubere Einzeladressen.
 *
 * Robust gegen zwei real aufgetretene Konfig-Artefakte:
 *   - Trailing-`\n` durch `echo "adresse@x.de" | vercel env add …` (das alte Onboarding-Howto
 *     schrieb genau das — mehrere Projekte trugen den Newline im Wert).
 *   - Komma-Liste, wenn ein Kunde mehrere Empfaenger will.
 *
 * @param {string|undefined} raw
 * @returns {string[]}
 */
function parseAddressList(raw) {
  return String(raw || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

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

// Rückruf-Wunsch (ContactForm formType="rueckruf").
const TELEFON_MIN_ZIFFERN = 6;
const TELEFON_MAX_LEN = 40;     // „+49 (0) 941 123 456-78 Durchwahl 12“ passt, ein Roman nicht
const ZEITFENSTER_MAX_LEN = 60;
// Empfehlung (ContactForm formType="empfehlung"): nur Vorname oder Firma — mehr über
// Dritte soll das Formular nicht erheben. Gleiche Grenze wie `maxlength` im Formular.
const EMPFOHLEN_MAX_LEN = 80;
// Erlaubte Zeichen: Ziffern, Leerzeichen, + ( ) / - . — optional EIN Durchwahl-Trenner
// („ext“, „ext.“, „x“, „DW“, „Durchwahl“) mit Ziffern dahinter. Buchstaben sonst nie:
// die Nummer steht in der Lead-Mail als tel:-Link, dort hat Text nichts verloren.
const TELEFON_ZEICHEN = /^[\d +()\/.-]+(?:(?:ext\.?|x|dw\.?|durchwahl)[ ]*[\d -]+)?$/i;

/**
 * Plausible Telefonnummer: nur erlaubte Zeichen (s. TELEFON_ZEICHEN), max. 40 Zeichen,
 * und nach dem Entfernen aller Zeichen außer Ziffern und `+` bleiben mindestens 6 Ziffern.
 * @param {string} telefon – bereits getrimmt
 * @returns {boolean}
 */
export function telefonGueltig(telefon) {
  if (!telefon || telefon.length > TELEFON_MAX_LEN) return false;
  if (!TELEFON_ZEICHEN.test(telefon)) return false;
  const ziffern = telefon.replace(/[^\d+]/g, '').replace(/\+/g, '');
  return ziffern.length >= TELEFON_MIN_ZIFFERN;
}

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
 * Warum der Inhaltsfilter anschlägt — oder `null`, wenn nicht. Der Grund geht in die
 * Drop-Meldung an GlitchTip: nur die Kategorie, nie der Inhalt.
 * @param {string} message
 * @param {string[]} extraKeywords
 * @returns {'keyword'|'urls'|'crypto'|'script'|null}
 */
function spamGrund(message, extraKeywords) {
  if (!message) return null;
  const lower = message.toLowerCase();
  const keywords = [...DEFAULT_SPAM_KEYWORDS, ...(extraKeywords || [])];
  if (keywords.some(kw => lower.includes(kw))) return 'keyword';
  const urls = message.match(URL_PATTERN);
  if (urls && urls.length >= 2) return 'urls';
  if (BTC_PATTERN.test(message) || ETH_PATTERN.test(message)) return 'crypto';
  const cyrillicCount = (message.match(/[Ѐ-ӿ]/g) || []).length;
  const cjkCount = (message.match(/[一-鿿぀-ヿ]/g) || []).length;
  const totalLetters = (message.match(/\p{L}/gu) || []).length;
  if (totalLetters > 20 && (cyrillicCount + cjkCount) / totalLetters > 0.3) return 'script';
  return null;
}

/** Customer-Slug für GlitchTip-Events. */
function projektSlug() {
  return process.env.PROJECT_NAME || process.env.VERCEL_GIT_REPO_SLUG || '';
}

/**
 * Fragt Cloudflare, ob ein Turnstile-Token gültig ist. Wirft bei Netzfehlern — was das
 * bedeutet, entscheidet der Aufrufer.
 * @param {string} secret
 * @param {string} token
 * @param {string} ip
 * @returns {Promise<boolean>}
 */
async function turnstileGueltig(secret, token, ip) {
  const cfRes = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ secret, response: token, remoteip: ip }),
  });
  const cfData = /** @type {{ success: boolean }} */ (await cfRes.json());
  return cfData.success === true;
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
  const kind = config.kind || 'contact-form';
  const allowRueckruf = config.allowRueckruf === true;
  const allowEmpfehlung = config.allowEmpfehlung === true;

  const inner = async function handleContact(req, res) {
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

    // Honeypot — silent drop. Ein echter Bot bleibt still. Bringt die Anfrage aber ein
    // gültiges Turnstile-Token mit, saß ein Browser davor (Autofill oder ein KI-Agent, der
    // das versteckte Feld mitfüllt) — dann ist gerade ein echter Lead verloren gegangen.
    // Das melden wir an GlitchTip, ohne Inhalt: nur welches Feld. Die Antwort bleibt 200.
    if (body.botcheck || body.url_honey) {
      console.log('[contact-handler] honeypot triggered, ip=', ip);
      const secret = process.env.TURNSTILE_SECRET_KEY;
      const token = typeof body['cf-turnstile-response'] === 'string' ? body['cf-turnstile-response'] : '';
      if (secret && token && (await turnstileGueltig(secret, token, ip).catch(() => false))) {
        await captureError(new Error('contact-drop:honeypot-bei-gueltigem-turnstile'), {
          project: projektSlug(),
          where: 'contact-handler:honeypot',
          extra: { feld: body.url_honey ? 'url_honey' : 'botcheck', formular: kind },
        });
      }
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
        if (!(await turnstileGueltig(turnstileSecret, token, ip))) {
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

    // Email-Validation. Beim Rückruf-Wunsch ist die E-Mail freiwillig — wer zurück-
    // gerufen werden will, gibt eine Nummer an, keine Adresse. `formType` kommt aber vom
    // Client: es wirkt nur an Endpoints mit `allowRueckruf: true`. Alle anderen Formulare
    // senden kein `formType` und laufen exakt durch die bisherige Prüfung.
    const rueckrufAngefragt = body.formType === 'rueckruf';
    const istRueckruf = rueckrufAngefragt && allowRueckruf;
    const email = typeof body.email === 'string' ? body.email.trim() : '';
    const telefon = typeof body.telefon === 'string' ? body.telefon.trim() : '';
    // Rückruf-Formular an einem Endpoint ohne Opt-in: vermutlich ein vergessenes
    // `allowRueckruf`. Nicht annehmen, aber auch nicht still verlieren — der Lead geht
    // unten als Zustellfehler an Telegram (+ GlitchTip), der Nutzer bekommt 400.
    const rueckrufNichtFreigeschaltet = rueckrufAngefragt && !allowRueckruf && !email && !!telefon;
    // Empfehlung: dasselbe Muster mit eigenem Opt-in `allowEmpfehlung`. Die beiden
    // Opt-ins sind getrennt — ein Rückruf-Endpoint nimmt keine Empfehlung an und umgekehrt.
    const empfehlungAngefragt = body.formType === 'empfehlung';
    const istEmpfehlung = empfehlungAngefragt && allowEmpfehlung;
    const empfehlungNichtFreigeschaltet = empfehlungAngefragt && !allowEmpfehlung && !email && !!telefon;
    if (istRueckruf) {
      if (email && !email.includes('@')) {
        res.status(400).json({ ok: false, error: 'E-Mail-Adresse ist ungültig.' });
        return;
      }
    } else if (istEmpfehlung) {
      if (!email && !telefon) {
        res.status(400).json({ ok: false, error: 'Bitte E-Mail-Adresse oder Telefonnummer angeben.' });
        return;
      }
      if (email && !email.includes('@')) {
        res.status(400).json({ ok: false, error: 'E-Mail-Adresse ist ungültig.' });
        return;
      }
    } else if (!rueckrufNichtFreigeschaltet && !empfehlungNichtFreigeschaltet && (!email || !email.includes('@'))) {
      res.status(400).json({ ok: false, error: 'E-Mail-Adresse fehlt oder ist ungültig.' });
      return;
    }

    // Telefon + Zeitfenster (Rückruf). Geprüft, sobald gesendet; Pflicht nur beim Rückruf.
    if (istRueckruf && !telefon) {
      res.status(400).json({ ok: false, error: 'Telefonnummer fehlt.' });
      return;
    }
    if (telefon && !telefonGueltig(telefon)) {
      res.status(400).json({ ok: false, error: 'Telefonnummer ist ungültig.' });
      return;
    }
    const zeitfenster = typeof body.zeitfenster === 'string' ? body.zeitfenster.trim() : '';
    if (zeitfenster.length > ZEITFENSTER_MAX_LEN) {
      res.status(400).json({ ok: false, error: 'Zeitfenster ist zu lang.' });
      return;
    }

    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (istEmpfehlung && !name) {
      res.status(400).json({ ok: false, error: 'Name fehlt.' });
      return;
    }
    // `empfohlen` nur mit Opt-in auswerten — ohne bleibt die Anfrage ein Kontakt, und
    // der kennt das Feld nicht.
    const empfohlen = istEmpfehlung && typeof body.empfohlen === 'string' ? body.empfohlen.trim() : '';
    if (empfohlen.length > EMPFOHLEN_MAX_LEN) {
      res.status(400).json({ ok: false, error: 'Angabe zur empfohlenen Person ist zu lang (höchstens 80 Zeichen).' });
      return;
    }
    const company = typeof body.company === 'string' ? body.company.trim() : '';
    // `telefon` (Rückruf) vor `phone` (Bewerbung) — beide landen im selben Lead-Feld.
    const phone = telefon || (typeof body.phone === 'string' ? body.phone.trim() : '');
    const message = typeof body.message === 'string' ? body.message.trim() : '';
    const website = typeof body.website === 'string' ? body.website.trim() : '';
    const studio = typeof body.studio === 'string' ? body.studio.trim() : '';
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

    // Content-Filter — silent drop. Mit gesetztem Turnstile-Secret hat die Anfrage die
    // Prüfung oben bestanden, ein Browser saß also davor. Dann melden wir den Drop — ein
    // KI-Agent, der zwei Links in die Nachricht schreibt, verschwindet sonst spurlos. Ohne
    // Secret bleibt es still, sonst meldet jeder Bot. Weder Log noch Meldung tragen Inhalte.
    const haystack = [name, company, studio, message, website, zeitfenster, telefon, empfohlen].filter(Boolean).join(' ');
    const grund = spamGrund(haystack, extraSpamKeywords);
    if (grund) {
      console.log('[contact-handler] spam pattern matched, ip=', ip, 'grund=', grund);
      if (turnstileSecret) {
        await captureError(new Error(`contact-drop:spam:${grund}`), {
          project: projektSlug(),
          where: 'contact-handler:content-filter',
          extra: { grund, formular: kind },
        });
      }
      res.status(200).json({ ok: true });
      return;
    }

    // Lead-Objekt (für Versand + für den Fehlmeldungs-Alarm bei fehlender Env).
    const leadData = {
      project: process.env.PROJECT_NAME || process.env.VERCEL_GIT_REPO_SLUG || '',
      fromName, name, email, company, phone, website, message,
      kind: istRueckruf
        ? /** @type {const} */ ('rueckruf')
        : istEmpfehlung ? /** @type {const} */ ('empfehlung') : kind,
      ...(studio ? { studio } : {}),
      ...(zeitfenster ? { zeitfenster } : {}),
      ...(empfohlen ? { empfohlen } : {}),
      ...(attribution ? { attribution } : {}),
    };
    const leadCtx = {
      ip,
      ua: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : undefined,
      origin: sourceUrl,
    };

    // Rückruf ohne Opt-in (s. o.): kein Versand, aber Alarm mit dem Lead statt stillem Verlust.
    if (rueckrufNichtFreigeschaltet) {
      console.error('[contact-handler] formType=rueckruf ohne allowRueckruf — Lead nur per Telegram gemeldet');
      await emitLead(leadData, {
        ...leadCtx,
        deliveryError: 'Rückruf-Formular an diesem Endpoint nicht freigeschaltet (allowRueckruf fehlt in api/contact)',
      });
      await captureError(new Error('contact-drop:rueckruf-ohne-opt-in'), {
        project: leadData.project,
        where: 'contact-handler:rueckruf-ohne-opt-in',
        extra: { formular: kind },
      });
      res.status(400).json({ ok: false, error: 'Rückruf-Formular ist hier nicht freigeschaltet.' });
      return;
    }

    // Empfehlung ohne Opt-in: wie beim Rückruf kein Versand, aber Alarm statt Verlust.
    if (empfehlungNichtFreigeschaltet) {
      console.error('[contact-handler] formType=empfehlung ohne allowEmpfehlung — Lead nur per Telegram gemeldet');
      await emitLead(leadData, {
        ...leadCtx,
        deliveryError: 'Empfehlungs-Formular an diesem Endpoint nicht freigeschaltet (allowEmpfehlung fehlt in api/contact)',
      });
      await captureError(new Error('contact-drop:empfehlung-ohne-opt-in'), {
        project: leadData.project,
        where: 'contact-handler:empfehlung-ohne-opt-in',
        extra: { formular: kind },
      });
      res.status(400).json({ ok: false, error: 'Empfehlungs-Formular ist hier nicht freigeschaltet.' });
      return;
    }

    // Resend-Versand. Fehlt eine Env-Var, wird der Lead trotzdem via Telegram gemeldet
    // (deliveryError) → Ops wird aktiv alarmiert UND der Lead geht nicht verloren.
    const recipients = parseAddressList(process.env.CONTACT_EMAIL);
    if (recipients.length === 0) {
      console.error('[contact-handler] CONTACT_EMAIL missing');
      await emitLead(leadData, { ...leadCtx, deliveryError: 'CONTACT_EMAIL nicht in Vercel-Env gesetzt' });
      res.status(500).json({ ok: false, error: 'Empfänger nicht konfiguriert.' });
      return;
    }

    // Optionale Blitzsicht-Kopie: `LEAD_BCC_EMAIL` (Shared Env auf Team-Ebene). Ohne die
    // Var verhaelt sich der Handler exakt wie vorher. Adressen, die ohnehin schon im
    // `to` stehen, werden rausgefiltert — sonst bekaeme z.B. customer-blitzsicht
    // (CONTACT_EMAIL == LEAD_BCC_EMAIL) jeden Lead doppelt.
    const toLower = new Set(recipients.map((a) => a.toLowerCase()));
    const bccList = parseAddressList(process.env.LEAD_BCC_EMAIL)
      .filter((a) => !toLower.has(a.toLowerCase()));
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
      leadStudio: studio,
      leadPhone: phone,
      leadWebsite: website,
      leadMessage: message,
      leadCallbackSlot: zeitfenster,
      leadEmpfohlen: empfohlen,
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
          to: recipients,
          ...(bccList.length ? { bcc: bccList } : {}),
          // Ohne Lead-Adresse (Rückruf) kein reply_to — Resend lehnt einen leeren Wert ab.
          ...(email ? { reply_to: email } : {}),
          subject: mail.subject,
          html: mail.html,
          text: mail.text,
        }),
      });
      if (!r.ok) {
        const errText = await r.text().catch(() => 'Unknown');
        console.error('[contact-handler] Resend error', r.status, errText);
        // Bis hierher ging der Lead an dieser Stelle komplett verloren: kein emitLead,
        // kein Alarm — nur eine Fehlermeldung im Browser des Interessenten. Resend lehnt
        // u.a. ungueltige Empfaenger ab, also genau die Faelle, die man mitbekommen muss.
        await emitLead(leadData, {
          ...leadCtx,
          deliveryError: `Resend lehnte den Versand ab (HTTP ${r.status})`,
        });
        await captureError(new Error(`Resend ${r.status}: ${String(errText).slice(0, 300)}`), {
          project: leadData.project,
          where: 'contact-handler:resend-rejected',
          extra: { status: r.status, recipients: recipients.length },
        });
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
      await emitLead(leadData, { ...leadCtx, deliveryError: 'Resend nicht erreichbar' });
      await captureError(err, { project: leadData.project, where: 'contact-handler:resend-fetch' });
      res.status(500).json({ ok: false, error: 'Email konnte nicht gesendet werden.' });
    }
  };

  // Aeusseres Netz: alles, was die Schichten oben NICHT selbst abfangen (Upstash-Ausfall,
  // kaputter Body, Config-Drift), endete bisher als nackter Vercel-500 — ohne Log-Eintrag,
  // den jemand sieht, und ohne Alarm. Der Interessent bekam eine Fehlermeldung, Blitzsicht
  // erfuhr nie davon. Genau diese Klasse faengt GlitchTip ab.
  return async function handler(req, res) {
    try {
      await inner(req, res);
    } catch (err) {
      console.error('[contact-handler] uncaught:', err);
      await captureError(err, {
        project: process.env.PROJECT_NAME || process.env.VERCEL_GIT_REPO_SLUG || '',
        where: 'contact-handler:uncaught',
      });
      try {
        res.status(500).json({ ok: false, error: 'Interner Fehler.' });
      } catch {
        // Response war schon raus — nichts mehr zu tun.
      }
    }
  };
}
