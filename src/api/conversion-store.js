// @ts-check

/**
 * @cw/core – recordConversion
 *
 * Persistiert consent-gegatet einen Offline-Conversion-Datensatz (Google-Klick-ID +
 * Zeitstempel + utm_*) in die geteilte `conversion_queue` (Neon/Postgres). Der
 * cw-ads-Cron liest daraus später `pending`-Rows und lädt sie via Google Ads
 * ConversionUploadService als Offline-Conversions hoch. Schwester von `emitLead`:
 * additiv, fire-and-forget, KEIN Throw, blockt die HTTP-Response nie.
 *
 * DOPPEL-GATE — beide Bedingungen müssen erfüllt sein, sonst stiller No-op:
 *   1. `CW_CONVERSION_STORE_URL` gesetzt (Neon-DSN). Ohne Env schreibt KEINE Site —
 *      alle Nicht-Ads-Customer bleiben unberührt (abwärtskompatibel).
 *   2. Marketing-Consent (`ctx.marketingConsent === true`). DSGVO: der gclid-Upload
 *      zu Google Ads ist Marketing-Messung + US-Transfer → braucht Einwilligung.
 *      Die Lead-Zustellung (Mail/Telegram) bleibt davon unberührt.
 * Zusätzlich: nur wenn eine Google-Klick-ID (gclid|gbraid|wbraid) vorliegt.
 *
 * Env-Vars (Production, optional):
 *   - CW_CONVERSION_STORE_URL — Postgres/Neon-DSN der conversion_queue.
 *
 * Hinweis: Der Neon-HTTP-Treiber (`@neondatabase/serverless`) wird NUR dynamisch
 * importiert, wenn beide Gates offen sind. Nicht-Ads-Sites brauchen die Dependency
 * also nicht; fehlt sie auf einer Ads-Site, degradiert der Write still (try/catch).
 *
 * Anti-Abuse: der Write erbt alle Spam-Schichten des contact-handlers (Origin-Check,
 * Rate-Limit, Honeypot, Content-Filter). Ads-Sites (CW_CONVERSION_STORE_URL gesetzt)
 * MÜSSEN zusätzlich Turnstile aktivieren — sonst kann ein Nicht-Browser-POST ohne
 * Origin-Header gefälschte Conversions einschleusen (Smart-Bidding-Poisoning).
 * DSGVO-Rechenschaft: consent_at + consent_version werden mitgeschrieben.
 */

import { createHash } from 'node:crypto';

/**
 * @typedef {Object} ConversionRecord
 * @property {string} customer_slug
 * @property {string} click_id
 * @property {'gclid'|'gbraid'|'wbraid'} click_id_type
 * @property {string} conversion_datetime  – ISO-8601, tz-aware (UTC 'Z').
 * @property {string|null} utm_source
 * @property {string|null} utm_medium
 * @property {string|null} utm_campaign
 * @property {string|null} utm_term
 * @property {string|null} utm_content
 * @property {string} [dedupe_key]
 */

/** Google-Klick-IDs in Prioritätsreihenfolge (gclid schlägt gbraid schlägt wbraid). */
const CLICK_ID_KEYS = /** @type {('gclid'|'gbraid'|'wbraid')[]} */ (['gclid', 'gbraid', 'wbraid']);

/**
 * Baut den Conversion-Datensatz aus einem Lead — oder null, wenn keine Google-Klick-ID
 * oder kein Customer-Slug vorliegt. Reine Funktion (testbar ohne DB).
 * @param {import('./lead-sink.js').Lead} lead
 * @param {{ now?: Date }} [opts]
 * @returns {ConversionRecord | null}
 */
export function buildConversionRecord(lead, opts = {}) {
  const attr = lead.attribution || {};
  /** @type {'gclid'|'gbraid'|'wbraid'|null} */
  let clickIdType = null;
  let clickId = '';
  for (const k of CLICK_ID_KEYS) {
    const v = attr[k];
    if (typeof v === 'string' && v) {
      clickIdType = k;
      clickId = v;
      break;
    }
  }
  if (!clickIdType) return null;

  const customerSlug = (lead.project || '').trim();
  if (!customerSlug) return null;

  const conversionDatetime = (opts.now || new Date()).toISOString();
  return {
    customer_slug: customerSlug,
    click_id: clickId,
    click_id_type: clickIdType,
    conversion_datetime: conversionDatetime,
    utm_source: attr.utm_source || null,
    utm_medium: attr.utm_medium || null,
    utm_campaign: attr.utm_campaign || null,
    utm_term: attr.utm_term || null,
    utm_content: attr.utm_content || null,
  };
}

/**
 * Idempotenz-Schlüssel: sha256(click_id + conversion_action + minute-gerundeter ts).
 * `conversion_action` ist beim Website-Insert noch null (der Cron enriched es später)
 * → hier leerer String. Der click_id+Minute-Anteil verhindert zuverlässig
 * Doppel-Submits UND Vercel-Function-Retries. Reine Funktion.
 *
 * Tradeoff: zwei Submits mit identischer click_id in derselben UTC-Minute verschmelzen
 * (ON CONFLICT DO NOTHING) — nur der erste utm-Snapshot überlebt. Bewusst akzeptiert
 * (dieselbe Klick-ID = i.d.R. dieselbe Conversion; Google dedupliziert ohnehin).
 * @param {ConversionRecord} rec
 * @returns {string}
 */
export function computeDedupeKey(rec) {
  const minute = rec.conversion_datetime.slice(0, 16); // YYYY-MM-DDTHH:MM
  return createHash('sha256')
    .update(`${rec.click_id}|${rec.conversion_action || ''}|${minute}`)
    .digest('hex');
}

/**
 * @param {import('./lead-sink.js').Lead} lead
 * @param {import('./lead-sink.js').LeadCtx & { marketingConsent?: boolean, consentVersion?: string }} ctx
 * @returns {Promise<void>}
 */
export async function recordConversion(lead, ctx) {
  const dsn = process.env.CW_CONVERSION_STORE_URL;
  if (!dsn) return;                          // Gate 1: kein Store konfiguriert
  if (ctx.marketingConsent !== true) return; // Gate 2: kein Consent → DSGVO

  const rec = buildConversionRecord(lead);
  if (!rec) return;                          // keine Google-Klick-ID / kein Slug
  rec.dedupe_key = computeDedupeKey(rec);

  try {
    const { neon } = await import('@neondatabase/serverless');
    const sql = neon(dsn, { fetchOptions: { signal: AbortSignal.timeout(5_000) } });
    // consent_at = Zeitpunkt der eingewilligten Submission; consent_version = angezeigter
    // Consent-Text (WS-E). DSGVO-Rechenschaftspflicht (Art. 5(2)/7(1)).
    const consentVersion = ctx.consentVersion ?? null;
    await sql`
      INSERT INTO conversion_queue
        (customer_slug, click_id, click_id_type, conversion_datetime,
         utm_source, utm_medium, utm_campaign, utm_term, utm_content,
         consent_at, consent_version, dedupe_key)
      VALUES
        (${rec.customer_slug}, ${rec.click_id}, ${rec.click_id_type}, ${rec.conversion_datetime},
         ${rec.utm_source}, ${rec.utm_medium}, ${rec.utm_campaign}, ${rec.utm_term}, ${rec.utm_content},
         ${rec.conversion_datetime}, ${consentVersion}, ${rec.dedupe_key})
      ON CONFLICT (dedupe_key) DO NOTHING
    `;
  } catch (err) {
    // Store-Ausfall / fehlende optionale Dependency darf die Form-Response nie blocken.
    console.error('[conversion-store] write failed:', err instanceof Error ? err.message : err);
  }
}
