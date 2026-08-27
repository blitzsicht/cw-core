// @ts-check
/**
 * Tests fuer briefing-handler — `node --test` (built-in, kein vitest noetig).
 *
 * Lauf: `node --test tests/api/briefing-handler.test.js`
 * Oder ueber Skript: `pnpm test`
 *
 * Abdeckung (MAJ-12):
 *   1. Required-Field-Validation derived from sections
 *   2. IP-Extraction prefers x-vercel-forwarded-for
 *   3. Promise.allSettled-Ordering (Telegram detached, Mails awaited)
 *   Plus Smoke:
 *   4. Payload-Size-Limit 413
 *   5. Telegram-Briefing-Branch formatting (CRIT-2)
 *   6. Method !== POST → 405
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBriefingHandler } from '../../src/api/briefing-handler.js';
import { getClientIp } from '../../src/utils/net/get-client-ip.js';

// ---------------------------------------------------------------------------
// Helpers: minimal req/res-Mocks
// ---------------------------------------------------------------------------
let reqCounter = 0;
function makeReq({ method = 'POST', headers = {}, body = {}, ip } = {}) {
  reqCounter += 1;
  const uniqueIp = ip || `10.${(reqCounter >> 16) & 0xff}.${(reqCounter >> 8) & 0xff}.${reqCounter & 0xff}`;
  return {
    method,
    headers: {
      origin: 'https://example.com',
      'content-length': String(JSON.stringify(body || '').length),
      'x-vercel-forwarded-for': uniqueIp,
      ...headers,
    },
    body,
    socket: { remoteAddress: '127.0.0.1' },
  };
}

function makeRes() {
  /** @type {{ statusCode: number, body: any }} */
  const captured = { statusCode: 0, body: null };
  const res = {
    statusCode: 0,
    status(code) {
      captured.statusCode = code;
      this.statusCode = code;
      return this;
    },
    json(payload) {
      captured.body = payload;
      return this;
    },
    end() { /* noop */ },
    _captured: captured,
  };
  return res;
}

// Fake fetch — captured per Aufruf, default success.
function installFakeFetch({
  resendOk = true,
  telegramOk = true,
  delayMs = 0,
  telegramDelayMs = null,
} = {}) {
  /** @type {Array<{ url: string, body: any, at: number }>} */
  const calls = [];
  const t0 = Date.now();
  const fake = async (url, init) => {
    calls.push({
      url: String(url),
      body: init && init.body ? JSON.parse(init.body) : null,
      at: Date.now() - t0,
    });
    // telegramDelayMs erlaubt es, Telegram absichtlich VIEL langsamer zu machen
    // als Resend. Damit misst der Detached-Test den Architektur-Unterschied
    // (wartet der Handler darauf?) statt der Maschinenlast — eine absolute
    // Wanduhr-Schwelle flakte auf langsamen Volumes reproduzierbar.
    const wait =
      telegramDelayMs !== null && String(url).includes('telegram.org') ? telegramDelayMs : delayMs;
    if (wait > 0) {
      // KEIN unref: der Timer wird hier awaited, ist also der einzige Grund,
      // warum der Event-Loop noch laufen muss. Mit unref darf Node ihn
      // abraeumen, bevor die Promise erfuellt ist — der Test-Runner meldet dann
      // "Promise resolution is still pending but the event loop has already
      // resolved" und reisst die Folgetests als cancelledByParent mit.
      //
      // Unter Node 26 faellt das nicht auf, unter Node 22 reproduzierbar — und
      // die CI faehrt 22. Isoliert nachgemessen am 27.08.2026: dasselbe
      // Vier-Zeilen-Muster, node:22 cancelled 1, node:26 pass 1.
      //
      // Die urspruengliche Sorge (ein detachter Telegram-Call haelt den Prozess
      // offen) ist gegenstandslos, seit emitLead awaited wird — genau das
      // prueft der MAJ-7-Test unten.
      await new Promise((r) => {
        setTimeout(r, wait);
      });
    }
    if (String(url).includes('resend.com')) {
      return {
        ok: resendOk,
        status: resendOk ? 200 : 500,
        text: async () => (resendOk ? 'OK' : 'fail'),
      };
    }
    if (String(url).includes('telegram.org')) {
      return {
        ok: telegramOk,
        status: telegramOk ? 200 : 500,
        text: async () => 'OK',
      };
    }
    return { ok: true, status: 200, text: async () => 'OK' };
  };
  const original = global.fetch;
  global.fetch = /** @type {any} */ (fake);
  return {
    calls,
    restore() {
      global.fetch = original;
    },
  };
}

// ---- Section-Fixture ----
const fixtureSections = [
  {
    id: 'stamm',
    priority: 'pflicht',
    emoji: '🔴',
    title: 'Stammdaten',
    fields: [
      { id: 'firmenname_offiziell', label: 'Firmenname', type: 'text', required: true },
      { id: 'plz', label: 'PLZ', type: 'text', required: true },
      { id: 'optional_text', label: 'Anmerkung', type: 'textarea', required: false },
    ],
  },
  {
    id: 'kontakt',
    priority: 'pflicht',
    emoji: '🔴',
    title: 'Kontakt',
    fields: [
      { id: 'email_kontakt', label: 'E-Mail', type: 'email', required: true },
    ],
  },
];

// Save + Reset Env
const savedEnv = {};
function setEnv(map) {
  for (const k of Object.keys(map)) {
    savedEnv[k] = process.env[k];
    if (map[k] === undefined) delete process.env[k];
    else process.env[k] = map[k];
  }
}
function restoreEnv() {
  for (const k of Object.keys(savedEnv)) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
}

// ===========================================================================
// TEST 1 — Required-Field-Validation derived from sections (MAJ-12.1)
// ===========================================================================
test('briefing-handler validates required fields derived from sections', async (t) => {
  setEnv({ RESEND_API_KEY: 'fake', CONTACT_EMAIL: 'servus@blitzsicht.com' });
  const fx = installFakeFetch();
  t.after(() => { fx.restore(); restoreEnv(); });

  const handler = createBriefingHandler({
    allowedOrigins: ['https://example.com'],
    fromName: 'Fixture GmbH',
    customerName: 'Fixture GmbH',
    sections: fixtureSections,
    submissionUrl: 'https://example.com/onboarding',
  });

  // Case A: alle Pflichtfelder fehlen
  let res = makeRes();
  await handler(
    makeReq({ body: {} }),
    res,
  );
  assert.equal(res._captured.statusCode, 400, 'should 400 when required missing');
  assert.match(
    String(res._captured.body.error),
    /Pflichtfelder fehlen/,
    'error should mention missing required fields',
  );
  // missing-IDs muessen aus den drei required-Feldern stammen
  assert.deepEqual(
    res._captured.body.missing.sort(),
    ['email_kontakt', 'firmenname_offiziell', 'plz'].sort(),
    'missing array reports the right field IDs',
  );

  // Case B: nur ein Pflichtfeld fehlt
  res = makeRes();
  await handler(
    makeReq({ body: { firmenname_offiziell: 'Acme GmbH', plz: '12345' } }),
    res,
  );
  assert.equal(res._captured.statusCode, 400, 'still 400 with one missing');
  assert.deepEqual(res._captured.body.missing, ['email_kontakt']);

  // Case C: alle gesetzt → 200
  res = makeRes();
  await handler(
    makeReq({
      body: {
        firmenname_offiziell: 'Acme GmbH',
        plz: '12345',
        email_kontakt: 'kunde@acme.de',
      },
    }),
    res,
  );
  assert.equal(res._captured.statusCode, 200, 'should 200 when all required filled');
  assert.equal(res._captured.body.ok, true);
});

// ===========================================================================
// TEST 2 — IP-Extraction prefers x-vercel-forwarded-for (MAJ-12.2 / CRIT-5)
// ===========================================================================
test('getClientIp prefers x-vercel-forwarded-for, falls back to XFF LAST', () => {
  // 1) Vercel-Header gewinnt
  assert.equal(
    getClientIp({
      headers: {
        'x-vercel-forwarded-for': '88.99.100.101',
        'x-forwarded-for': '1.2.3.4, 5.6.7.8',
        'x-real-ip': '9.9.9.9',
      },
    }),
    '88.99.100.101',
    'x-vercel-forwarded-for has highest priority',
  );

  // 2) Kein Vercel-Header → XFF LAST (NICHT FIRST)
  assert.equal(
    getClientIp({
      headers: { 'x-forwarded-for': '1.2.3.4, 5.6.7.8, 9.10.11.12' },
    }),
    '9.10.11.12',
    'must use LAST entry of x-forwarded-for (FIRST is client-spoofable)',
  );

  // 3) XFF single value
  assert.equal(
    getClientIp({ headers: { 'x-forwarded-for': '10.0.0.1' } }),
    '10.0.0.1',
    'XFF single value works',
  );

  // 4) Fallback auf x-real-ip
  assert.equal(
    getClientIp({ headers: { 'x-real-ip': '7.7.7.7' } }),
    '7.7.7.7',
    'x-real-ip fallback',
  );

  // 5) Fallback auf socket
  assert.equal(
    getClientIp({
      headers: {},
      socket: { remoteAddress: '192.168.1.1' },
    }),
    '192.168.1.1',
    'socket.remoteAddress is last fallback',
  );

  // 6) Nichts → 'unknown'
  assert.equal(getClientIp({ headers: {} }), 'unknown');
});

// ===========================================================================
// TEST 3 — Promise.allSettled-Ordering: Mails AWAITED, Telegram DETACHED (MAJ-12.3 / MAJ-7)
// ===========================================================================
test('briefing-handler: internal+confirmation mails UND telegram AWAITED vor 200 (MAJ-7)', async (t) => {
  setEnv({
    RESEND_API_KEY: 'fake',
    CONTACT_EMAIL: 'servus@blitzsicht.com',
    TELEGRAM_BOT_TOKEN: 'fakebot',
    TELEGRAM_CHAT_ID: '12345',
  });

  // Resend antwortet schnell (50ms), Telegram absichtlich sehr langsam (1500ms).
  // Der Handler darf nur auf die Resend-Calls warten — dadurch liegen die beiden
  // Ausgänge über eine Größenordnung auseinander, statt sich im Rauschen der
  // Maschinenlast zu berühren.
  const fx = installFakeFetch({ delayMs: 50, telegramDelayMs: 1500 });
  t.after(() => { fx.restore(); restoreEnv(); });

  const handler = createBriefingHandler({
    allowedOrigins: ['https://example.com'],
    fromName: 'Acme',
    customerName: 'Acme',
    sections: fixtureSections,
    submissionUrl: 'https://example.com/onboarding',
  });

  const res = makeRes();
  const t0 = Date.now();
  await handler(
    makeReq({
      body: {
        firmenname_offiziell: 'Acme GmbH',
        plz: '12345',
        email_kontakt: 'kunde@acme.de',
      },
    }),
    res,
  );
  const dt = Date.now() - t0;

  // 200 muss schon gekommen sein
  assert.equal(res._captured.statusCode, 200, 'should 200');

  // Vor Response: beide Resend-Calls (internal + confirmation)
  const resendCalls = fx.calls.filter((c) => c.url.includes('resend.com'));
  assert.ok(resendCalls.length >= 2, `expected at least 2 resend calls, got ${resendCalls.length}`);

  // Internal-Mail ist erster Resend-Call und geht an BRIEFING_EMAIL (Default Blitzsicht)
  assert.equal(resendCalls[0].body.to, 'servus@blitzsicht.com', 'first resend = internal mail');
  // Confirmation geht an Kunde
  assert.equal(resendCalls[1].body.to, 'kunde@acme.de', 'second resend = confirmation to customer');

  // Telegram muss VOR der Response durch sein — ohne nachtraegliches Warten im
  // Test. Genau das ist die Aussage des MAJ-7-Fixes (2026-05-21): das
  // Detached-Pattern funktionierte in Vercel Serverless nicht, weil die Function
  // nach res.status(200) gekillt wurde, bevor der Telegram-fetch resolvte.
  const tgCalls = fx.calls.filter((c) => c.url.includes('telegram.org'));
  assert.ok(
    tgCalls.length >= 1,
    'telegram muss vor dem Handler-Return gefeuert haben (emitLead ist awaited)',
  );

  // Beleg, dass wirklich gewartet wird: Telegram braucht im Fake 1500ms, der
  // Handler kehrt erst danach zurueck. Wuerde jemand emitLead wieder detachen,
  // faellt dt auf ~100ms und dieser Test wird rot — genau das soll er.
  //
  // Vorher stand hier das Gegenteil (`dt < 500`, Testname "telegram DETACHED").
  // Der Test war nur gruen, weil Telegram und Resend dieselbe Verzoegerung
  // hatten und der Unterschied gar nicht messbar war — er hat nie geprueft, was
  // sein Name behauptete, und flakte stattdessen unter Last
  // (siluri/blitzsicht-ops#606).
  assert.ok(
    dt >= 1500,
    `emitLead muss awaited sein (dt=${dt}ms, erwartet >= 1500ms Telegram-Latenz)`,
  );
});

// ===========================================================================
// TEST 4 — Payload-Size-Limit 413 (MAJ-10)
// ===========================================================================
test('briefing-handler rejects payloads > 256 KB with 413', async (t) => {
  setEnv({ RESEND_API_KEY: 'fake', CONTACT_EMAIL: 'servus@blitzsicht.com' });
  const fx = installFakeFetch();
  t.after(() => { fx.restore(); restoreEnv(); });

  const handler = createBriefingHandler({
    allowedOrigins: ['https://example.com'],
    fromName: 'Acme',
    customerName: 'Acme',
    sections: fixtureSections,
    submissionUrl: 'https://example.com/onboarding',
  });

  const res = makeRes();
  await handler(
    makeReq({
      headers: { 'content-length': String(300 * 1024) }, // 300 KB
      body: { firmenname_offiziell: 'x' },
    }),
    res,
  );
  assert.equal(res._captured.statusCode, 413, 'should 413 for oversized payload');
});

// ===========================================================================
// TEST 5 — Telegram-Briefing-Branch formatting (CRIT-2)
// ===========================================================================
test('lead-sink formats briefing-form differently than contact-form', async (t) => {
  // Import after handler tests so we share module instance
  const leadSink = await import('../../src/api/lead-sink.js');
  setEnv({ TELEGRAM_BOT_TOKEN: 'fakebot', TELEGRAM_CHAT_ID: '12345' });
  const fx = installFakeFetch();
  t.after(() => { fx.restore(); restoreEnv(); });

  await leadSink.emitLead(
    {
      project: 'mika',
      fromName: 'Mika Elektrotechnik',
      customerName: 'Mika Elektrotechnik',
      email: 'kunde@example.com',
      kind: 'briefing-form',
      requiredFilled: 11,
      requiredTotal: 11,
      briefingPayload: {
        firmenname_offiziell: 'Mika Elektrotechnik GmbH',
        plz: '93059',
      },
    },
    { ip: '1.2.3.4', origin: 'https://mikaelektro.com' },
  );

  const tg = fx.calls.find((c) => c.url.includes('telegram.org'));
  assert.ok(tg, 'telegram call fired');
  /** @type {string} */
  const text = tg.body.text;
  assert.match(text, /Briefing/, 'message starts with Briefing keyword');
  assert.match(text, /11\/11 Pflicht/, 'contains progress count');
  // Compact ≤200 chars per CRIT-2
  assert.ok(text.length <= 200, `telegram message should be <= 200 chars (got ${text.length})`);
});

// ===========================================================================
// TEST 6 — Method !== POST → 405
// ===========================================================================
test('briefing-handler returns 405 for non-POST methods', async (t) => {
  setEnv({ RESEND_API_KEY: 'fake', CONTACT_EMAIL: 'servus@blitzsicht.com' });
  const fx = installFakeFetch();
  t.after(() => { fx.restore(); restoreEnv(); });

  const handler = createBriefingHandler({
    allowedOrigins: ['https://example.com'],
    fromName: 'Acme',
    customerName: 'Acme',
    sections: fixtureSections,
    submissionUrl: 'https://example.com/onboarding',
  });

  const res = makeRes();
  await handler(makeReq({ method: 'GET' }), res);
  assert.equal(res._captured.statusCode, 405, 'GET should 405');
});

// ===========================================================================
// TEST 7 — Briefing-Empfaenger ist von CONTACT_EMAIL entkoppelt
//
// Vorfall zink-baeckerei (2026-07-17): beide Handler lasen `CONTACT_EMAIL`, mit
// gegensaetzlicher Bedeutung — Briefing gehoert Blitzsicht, der Website-Lead dem Kunden.
// Auf Sites mit beiden Routen (mika, blumen-schmid) war zwangsläufig eine Seite falsch
// adressiert. Dieser Test faellt, sobald jemand die Kopplung wieder einbaut.
// ===========================================================================
test('briefing-handler ignoriert CONTACT_EMAIL und nutzt BRIEFING_EMAIL', async (t) => {
  setEnv({
    RESEND_API_KEY: 'fake',
    CONTACT_EMAIL: 'info@kunden-domain.de',   // gehoert dem contact-handler
    BRIEFING_EMAIL: 'briefing@blitzsicht.com',
  });
  const fx = installFakeFetch();
  t.after(() => { fx.restore(); restoreEnv(); });

  const handler = createBriefingHandler({
    allowedOrigins: ['https://example.com'],
    fromName: 'Acme',
    customerName: 'Acme',
    sections: fixtureSections,
    submissionUrl: 'https://example.com/onboarding',
  });

  const res = makeRes();
  await handler(makeReq({
    body: {
      firmenname_offiziell: 'Acme GmbH',
      plz: '93055',
      email_kontakt: 'kunde@acme.de',
    },
  }), res);

  const resendCalls = fx.calls.filter((c) => c.url.includes('resend.com'));
  assert.ok(resendCalls.length >= 1, 'internal mail must be sent');
  assert.equal(
    resendCalls[0].body.to,
    'briefing@blitzsicht.com',
    'Briefing darf NIE an die Kunden-Adresse aus CONTACT_EMAIL gehen',
  );
});
