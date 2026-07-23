// @ts-check

/**
 * @cw/core – captureError
 *
 * Meldet Server-Fehler aus den Vercel-Functions der Customer-Sites an das self-hosted
 * GlitchTip (https://errors.blitzsicht.com). Von dort laufen Alerts ueber den
 * `glitchtip-telegram-relay` (siluri-infra/services/) in den Blitzsicht-Telegram-Thread.
 *
 * Bewusst OHNE `@sentry/node`: cw-core wird von 15 Customer-Repos konsumiert, ein
 * schweres SDK in jedem davon waere unverhaeltnismaessig. Fuer reines Error-Reporting
 * reicht ein POST an die Sentry-kompatible Store-API — gleiche Bauart wie `lead-sink.js`
 * (plain fetch, fire-and-forget, kein Throw).
 *
 * Der Serverless-Gotcha aus siluri-de/src/lib/sentry.ts entfaellt damit ebenfalls: es gibt
 * keinen SDK-Puffer, der vor dem Function-Freeze geflusht werden muesste — der Aufrufer
 * awaitet den fetch direkt.
 *
 * Env-Var (optional — ohne sie ist die Funktion ein No-op):
 *   - GLITCHTIP_DSN   z.B. https://<public_key>@errors.blitzsicht.com/<project_id>
 *                     Der DSN ist public (schreibt nur, kann nichts lesen).
 */

/**
 * @typedef {Object} ErrorContext
 * @property {string} [project]     – Customer-Slug (PROJECT_NAME / VERCEL_GIT_REPO_SLUG)
 * @property {string} [where]       – Fehlerstelle, z.B. 'contact-handler:resend'
 * @property {Record<string, unknown>} [extra] – Zusatzdaten (keine Lead-PII!)
 */

/**
 * Zerlegt einen Sentry/GlitchTip-DSN in Store-URL + Public-Key.
 * @param {string} dsn
 * @returns {{ storeUrl: string, key: string } | null}
 */
function parseDsn(dsn) {
  try {
    const u = new URL(dsn);
    const projectId = u.pathname.replace(/^\/+/, '');
    if (!projectId || !u.username) return null;
    return {
      storeUrl: `${u.protocol}//${u.host}/api/${projectId}/store/`,
      key: u.username,
    };
  } catch {
    return null;
  }
}

/**
 * Meldet einen Fehler an GlitchTip. Schluckt jeden eigenen Fehler — Monitoring darf
 * niemals der Grund sein, warum eine Anfrage scheitert.
 *
 * @param {unknown} err
 * @param {ErrorContext} [ctx]
 * @returns {Promise<void>}
 */
export async function captureError(err, ctx = {}) {
  const dsn = process.env.GLITCHTIP_DSN;
  if (!dsn) return;
  const parsed = parseDsn(dsn);
  if (!parsed) {
    console.error('[error-sink] GLITCHTIP_DSN unparsebar — Event verworfen.');
    return;
  }

  const error = err instanceof Error ? err : new Error(String(err));
  const eventId = globalThis.crypto?.randomUUID
    ? globalThis.crypto.randomUUID().replace(/-/g, '')
    : `${Date.now().toString(16)}`.padEnd(32, '0').slice(0, 32);

  const payload = {
    event_id: eventId,
    timestamp: new Date().toISOString(),
    platform: 'node',
    level: 'error',
    logger: ctx.where || 'cw-core',
    environment: process.env.VERCEL_ENV || 'production',
    server_name: ctx.project || process.env.VERCEL_GIT_REPO_SLUG || 'unknown',
    transaction: ctx.where,
    tags: {
      project: ctx.project || process.env.VERCEL_GIT_REPO_SLUG || 'unknown',
      ...(ctx.where ? { where: ctx.where } : {}),
    },
    extra: ctx.extra || {},
    exception: {
      values: [{
        type: error.name || 'Error',
        value: error.message,
        stacktrace: { frames: parseStack(error.stack) },
      }],
    },
  };

  try {
    await fetch(parsed.storeUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Sentry-Auth': `Sentry sentry_version=7, sentry_key=${parsed.key}, sentry_client=cw-core/1.0`,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(3_000),
    });
  } catch {
    // Monitoring-Ausfall darf die Anfrage nicht kippen.
  }
}

/**
 * Minimaler Stack-Parser → Sentry-Frames (aeltester Frame zuerst, wie das Format verlangt).
 * @param {string|undefined} stack
 * @returns {Array<{ filename: string, function: string, lineno?: number, colno?: number }>}
 */
function parseStack(stack) {
  if (!stack) return [];
  const frames = [];
  for (const line of stack.split('\n').slice(1, 21)) {
    const m = line.match(/at\s+(?:(.+?)\s+\()?(.+?):(\d+):(\d+)\)?$/);
    if (!m) continue;
    frames.push({
      filename: m[2],
      function: m[1] || '<anonymous>',
      lineno: Number(m[3]),
      colno: Number(m[4]),
    });
  }
  return frames.reverse();
}
