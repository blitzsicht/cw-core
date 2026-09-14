// @ts-check
/**
 * Tests fuer contact-handler — Empfaenger-Aufloesung + bcc.
 *
 * Lauf: `node --test tests/api/contact-handler.test.js`
 *
 * Hintergrund (Vorfall zink-baeckerei, 2026-07-17): ein Lead ueber baeckereizink.de
 * landete nie beim Kunden, weil `CONTACT_EMAIL` auf `servus@blitzsicht.com` stand —
 * gesetzt per `echo "…" | vercel env add`, was zusaetzlich ein `\n` anhaengte. Beides
 * ist hier abgedeckt: Whitespace-Normalisierung und die bcc-Kopie, die Blitzsicht den
 * Mitschnitt gibt, ohne dem Kunden seine Leads wegzunehmen.
 *
 * Abdeckung:
 *   1. Trailing-Newline in CONTACT_EMAIL wird getrimmt
 *   2. Komma-Liste → mehrere Empfaenger
 *   3. LEAD_BCC_EMAIL landet als bcc im Resend-Payload
 *   4. Ohne LEAD_BCC_EMAIL existiert kein bcc-Feld
 *   5. bcc == to → kein bcc (keine Doppel-Mail bei customer-blitzsicht)
 *   6. CONTACT_EMAIL nur Whitespace → 500 + Telegram-deliveryError (Lead geht nicht verloren)
 *   7. Stille Drops (Honeypot, Inhaltsfilter) aus einer bestandenen Turnstile-Sitzung
 *      werden an GlitchTip gemeldet — ohne Lead-Inhalt (14.09.2026)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createContactHandler } from '../../src/api/contact-handler.js';

// ---------------------------------------------------------------------------
// Helpers: minimal req/res-Mocks (Muster aus briefing-handler.test.js)
// ---------------------------------------------------------------------------
let reqCounter = 0;
function makeReq(body = {}) {
  reqCounter += 1;
  // Eigene IP je Request — sonst greift der in-memory Rate-Limit (max 3 / 10 min).
  const ip = `10.${(reqCounter >> 16) & 0xff}.${(reqCounter >> 8) & 0xff}.${reqCounter & 0xff}`;
  return {
    method: 'POST',
    headers: {
      origin: 'https://example.com',
      'x-vercel-forwarded-for': ip,
      'user-agent': 'node-test',
    },
    body,
    socket: { remoteAddress: '127.0.0.1' },
  };
}

function makeRes() {
  const captured = { statusCode: 0, body: /** @type {any} */ (null) };
  return {
    status(code) { captured.statusCode = code; return this; },
    json(payload) { captured.body = payload; return this; },
    end() { /* noop */ },
    _captured: captured,
  };
}

/**
 * Faengt den Resend-Payload ab. Telegram wird still geschluckt.
 * `turnstileOk` steuert die Antwort von Cloudflares siteverify.
 */
function installFakeFetch({ resendOk = true, resendStatus = 200, turnstileOk = true } = {}) {
  const calls = /** @type {Array<{url: string, body: any}>} */ ([]);
  const original = global.fetch;
  global.fetch = /** @type {any} */ (async (url, init) => {
    calls.push({ url: String(url), body: init && init.body ? JSON.parse(String(init.body)) : null });
    if (String(url).includes('resend.com') && !resendOk) {
      return { ok: false, status: resendStatus, text: async () => 'invalid recipient', json: async () => ({}) };
    }
    if (String(url).includes('challenges.cloudflare.com')) {
      return { ok: true, status: 200, text: async () => 'OK', json: async () => ({ success: turnstileOk }) };
    }
    return { ok: true, status: 200, text: async () => 'OK', json: async () => ({ success: true }) };
  });
  return {
    calls,
    resendBody() {
      const hit = calls.find((c) => c.url.includes('resend.com'));
      return hit ? hit.body : null;
    },
    restore() { global.fetch = original; },
  };
}

const savedEnv = {};
function setEnv(map) {
  for (const k of Object.keys(map)) {
    if (!(k in savedEnv)) savedEnv[k] = process.env[k];
    if (map[k] === undefined) delete process.env[k];
    else process.env[k] = map[k];
  }
}
function restoreEnv() {
  for (const k of Object.keys(savedEnv)) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
    delete savedEnv[k];
  }
}

const handler = createContactHandler({
  allowedOrigins: ['https://example.com'],
  fromName: 'Testkunde GmbH',
  subject: 'Neue Anfrage über testkunde.de',
});

const validLead = { name: 'Michaela Test', email: 'lead@example.org', message: 'Bitte um Rückruf.' };

async function run(env, body = validLead, fetchOpts = {}) {
  setEnv({ RESEND_API_KEY: 'fake', TURNSTILE_SECRET_KEY: undefined, LEAD_BCC_EMAIL: undefined, ...env });
  const fx = installFakeFetch(fetchOpts);
  const res = makeRes();
  try {
    await handler(makeReq(body), res);
    return { resend: fx.resendBody(), res: res._captured, calls: fx.calls };
  } finally {
    fx.restore();
    restoreEnv();
  }
}

// ===========================================================================
test('CONTACT_EMAIL mit Trailing-Newline wird getrimmt (echo-Artefakt)', async () => {
  const { resend, res } = await run({ CONTACT_EMAIL: 'info@testkunde.de\n' });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(resend.to, ['info@testkunde.de'], 'Newline darf nicht in der Adresse landen');
});

test('CONTACT_EMAIL als Komma-Liste ergibt mehrere Empfaenger', async () => {
  const { resend } = await run({ CONTACT_EMAIL: 'info@testkunde.de, buero@testkunde.de' });
  assert.deepEqual(resend.to, ['info@testkunde.de', 'buero@testkunde.de']);
});

test('LEAD_BCC_EMAIL landet als bcc im Resend-Payload', async () => {
  const { resend } = await run({
    CONTACT_EMAIL: 'info@testkunde.de',
    LEAD_BCC_EMAIL: 'servus@blitzsicht.com',
  });
  assert.deepEqual(resend.to, ['info@testkunde.de']);
  assert.deepEqual(resend.bcc, ['servus@blitzsicht.com']);
  assert.equal(resend.reply_to, 'lead@example.org', 'reply_to bleibt der Lead');
});

test('ohne LEAD_BCC_EMAIL existiert kein bcc-Feld', async () => {
  const { resend } = await run({ CONTACT_EMAIL: 'info@testkunde.de' });
  assert.equal('bcc' in resend, false);
});

test('bcc identisch zu to wird verworfen (keine Doppel-Mail)', async () => {
  const { resend } = await run({
    CONTACT_EMAIL: 'servus@blitzsicht.com',
    LEAD_BCC_EMAIL: 'Servus@Blitzsicht.com',
  });
  assert.deepEqual(resend.to, ['servus@blitzsicht.com']);
  assert.equal('bcc' in resend, false, 'Case-insensitiver Dedup');
});

test('Resend lehnt ab → Lead geht per Telegram raus statt verloren', async () => {
  const { res, calls } = await run(
    {
      CONTACT_EMAIL: 'info@testkunde.de',
      TELEGRAM_BOT_TOKEN: 'fake-token',
      TELEGRAM_CHAT_ID: '123',
    },
    validLead,
    { resendOk: false, resendStatus: 422 },
  );
  assert.equal(res.statusCode, 400);
  const tg = calls.find((c) => c.url.includes('telegram.org'));
  assert.ok(tg, 'ohne Telegram-Meldung waere der Lead an dieser Stelle komplett weg');
  assert.match(tg.body.text, /ZUSTELLUNG FEHLGESCHLAGEN/);
  assert.match(tg.body.text, /422/, 'der Resend-Status muss im Alarm stehen');
  // MarkdownV2 escaped den Punkt (`example\.org`) — daher auf den unescapten Teil pruefen.
  assert.ok(tg.body.text.includes('lead@example'), 'die Lead-Adresse muss erhalten bleiben');
});

test('CONTACT_EMAIL nur Whitespace → 500 + Telegram-Alarm statt stillem Lead-Verlust', async () => {
  const { resend, res, calls } = await run({
    CONTACT_EMAIL: '   ',
    TELEGRAM_BOT_TOKEN: 'fake-token',
    TELEGRAM_CHAT_ID: '123',
  });
  assert.equal(res.statusCode, 500);
  assert.equal(resend, null, 'kein Resend-Call ohne Empfaenger');
  const tg = calls.find((c) => c.url.includes('telegram.org'));
  assert.ok(tg, 'Telegram-Alarm muss trotzdem raus');
  assert.match(tg.body.text, /ZUSTELLUNG FEHLGESCHLAGEN/);
});

// ===========================================================================
// Waitlist (kind: 'waitlist', v0.91.0) — Studio-Feld + Telegram-Label.
// Hintergrund: customer-platzfrei (Produktseite mit Warteliste statt Kontaktformular).
// Vor v0.91.0 wurde ein `studio`-Feld vom Handler still verschluckt.
// ===========================================================================

const waitlistHandler = createContactHandler({
  allowedOrigins: ['https://example.com'],
  fromName: 'platzfrei',
  subject: 'Neuer Wartelisten-Eintrag über platzfrei.club',
  kind: 'waitlist',
});

const validWaitlistLead = {
  name: 'Michaela Test',
  studio: 'Victory Gym Neutraubling',
  email: 'studio@example.org',
  message: 'Wir wollen im Herbst starten.',
};

async function runWaitlist(env, body = validWaitlistLead, fetchOpts = {}) {
  setEnv({ RESEND_API_KEY: 'fake', TURNSTILE_SECRET_KEY: undefined, LEAD_BCC_EMAIL: undefined, ...env });
  const fx = installFakeFetch(fetchOpts);
  const res = makeRes();
  try {
    await waitlistHandler(makeReq(body), res);
    return { resend: fx.resendBody(), res: res._captured, calls: fx.calls };
  } finally {
    fx.restore();
    restoreEnv();
  }
}

test('waitlist: studio landet in Resend-Mail (HTML + Text)', async () => {
  const { resend, res } = await runWaitlist({ CONTACT_EMAIL: 'servus@blitzsicht.com' });
  assert.equal(res.statusCode, 200);
  assert.ok(resend, 'Resend-Call muss stattfinden');
  assert.ok(resend.html.includes('Victory Gym Neutraubling'), 'Studio muss im HTML stehen');
  assert.ok(resend.html.includes('Studio'), 'Studio-Label muss im HTML stehen');
  assert.ok(resend.text.includes('Studio:'), 'Studio-Zeile muss im Plain-Text stehen');
  assert.ok(resend.text.includes('Victory Gym Neutraubling'), 'Studio-Wert muss im Plain-Text stehen');
});

test('waitlist: Telegram-Push trägt 📋-Warteliste-Header + Studio-Zeile', async () => {
  const { calls } = await runWaitlist({
    CONTACT_EMAIL: 'servus@blitzsicht.com',
    TELEGRAM_BOT_TOKEN: 'fake-token',
    TELEGRAM_CHAT_ID: '123',
  });
  const tg = calls.find((c) => c.url.includes('telegram.org'));
  assert.ok(tg, 'Telegram-Push muss raus');
  assert.ok(tg.body.text.includes('📋'), 'Warteliste-Emoji im Header');
  assert.ok(tg.body.text.includes('Warteliste'), 'Warteliste-Label im Header');
  assert.ok(tg.body.text.includes('Victory Gym Neutraubling'), 'Studio-Zeile enthalten');
  assert.ok(!tg.body.text.includes('🆕'), 'kein Standard-Lead-Header');
});

test('waitlist: Spam im Studio-Feld triggert Content-Filter (silent drop, kein Resend)', async () => {
  const { resend, res } = await runWaitlist(
    { CONTACT_EMAIL: 'servus@blitzsicht.com' },
    { ...validWaitlistLead, studio: 'best casino backlink service' },
  );
  assert.equal(res.statusCode, 200, 'Spam wird still geschluckt (200 ok)');
  assert.equal(resend, null, 'kein Resend-Call bei Spam im Studio-Feld');
});

test('kind nicht gesetzt → Default contact-form bleibt (🆕-Header, abwärtskompatibel)', async () => {
  const { calls } = await run({
    CONTACT_EMAIL: 'info@testkunde.de',
    TELEGRAM_BOT_TOKEN: 'fake-token',
    TELEGRAM_CHAT_ID: '123',
  });
  const tg = calls.find((c) => c.url.includes('telegram.org'));
  assert.ok(tg, 'Telegram-Push muss raus');
  assert.ok(tg.body.text.includes('🆕'), 'Standard-Header unverändert');
  assert.ok(!tg.body.text.includes('Warteliste'), 'kein Warteliste-Label ohne kind waitlist');
});

// ===========================================================================
// Stille Verluste melden (14.09.2026). Ein Drop antwortet weiter 200 — Spammer sollen
// nichts merken. Kommt die Anfrage aber aus einer bestandenen Turnstile-Sitzung, war ein
// Browser dran (Mensch, Autofill oder KI-Agent). Dann geht ein GlitchTip-Event raus, damit
// ein verlorener Lead auffällt. Das Event traegt nur den Grund, keinen Lead-Inhalt.
// ===========================================================================

const DSN = 'https://k@errors.example/1';
const MIT_TURNSTILE = { CONTACT_EMAIL: 'info@testkunde.de', TURNSTILE_SECRET_KEY: 'ts-secret', GLITCHTIP_DSN: DSN };
const TOKEN = { 'cf-turnstile-response': 'tok' };
const glitchtip = (calls) => calls.filter((c) => c.url.includes('/api/1/store/')).map((c) => c.body);
const ohnePii = (event) => {
  const roh = JSON.stringify(event);
  return !roh.includes('Michaela') && !roh.includes('lead@example') && !roh.includes('https://a.example');
};

test('Inhaltsfilter (2 URLs) nach bestandenem Turnstile → 200, kein Versand, ein Event mit Grund', async () => {
  const { res, resend, calls } = await run(MIT_TURNSTILE, {
    ...validLead, ...TOKEN, message: 'Unsere Seiten: https://a.example und https://b.example',
  });
  assert.equal(res.statusCode, 200);
  assert.equal(resend, null);
  const events = glitchtip(calls);
  assert.equal(events.length, 1);
  assert.equal(events[0].exception.values[0].value, 'contact-drop:spam:urls');
  assert.equal(events[0].extra.grund, 'urls');
  assert.ok(ohnePii(events[0]), 'kein Lead-Inhalt im Event');
});

test('Inhaltsfilter ohne Turnstile-Secret → still, kein Event (sonst meldet jeder Bot)', async () => {
  const { res, calls } = await run({ CONTACT_EMAIL: 'info@testkunde.de', GLITCHTIP_DSN: DSN }, {
    ...validLead, message: 'best casino backlink service',
  });
  assert.equal(res.statusCode, 200);
  assert.equal(glitchtip(calls).length, 0);
});

test('Honeypot ohne Token → 200, kein Event (echter Bot)', async () => {
  const { res, calls } = await run(MIT_TURNSTILE, { ...validLead, url_honey: 'https://spam.example' });
  assert.equal(res.statusCode, 200);
  assert.equal(glitchtip(calls).length, 0);
});

test('Honeypot mit gueltigem Turnstile-Token → 200, genau ein Event, Feld benannt, ohne PII', async () => {
  const { res, resend, calls } = await run(MIT_TURNSTILE, { ...validLead, ...TOKEN, url_honey: 'x' });
  assert.equal(res.statusCode, 200);
  assert.equal(resend, null, 'der Drop bleibt ein Drop');
  const events = glitchtip(calls);
  assert.equal(events.length, 1);
  assert.equal(events[0].exception.values[0].value, 'contact-drop:honeypot-bei-gueltigem-turnstile');
  assert.equal(events[0].extra.feld, 'url_honey');
  assert.ok(ohnePii(events[0]));
});

test('Honeypot mit ungueltigem Turnstile-Token → kein Event', async () => {
  const { calls } = await run(MIT_TURNSTILE, { ...validLead, ...TOKEN, botcheck: 'on' }, { turnstileOk: false });
  assert.equal(glitchtip(calls).length, 0);
});

test('normaler Lead mit Turnstile → Versand, kein Drop-Event', async () => {
  const { res, resend, calls } = await run(MIT_TURNSTILE, { ...validLead, ...TOKEN });
  assert.equal(res.statusCode, 200);
  assert.ok(resend);
  assert.equal(glitchtip(calls).length, 0);
});

test('das Log des Inhaltsfilters traegt keinen Nachrichtentext mehr', async () => {
  const zeilen = [];
  const original = console.log;
  console.log = (...args) => { zeilen.push(args.join(' ')); };
  try {
    await run(MIT_TURNSTILE, { ...validLead, ...TOKEN, message: 'Seiten: https://a.example und https://b.example' });
  } finally {
    console.log = original;
  }
  const spam = zeilen.filter((z) => z.includes('spam pattern matched'));
  assert.equal(spam.length, 1, 'die Log-Zeile selbst muss es noch geben');
  assert.ok(!spam[0].includes('Michaela') && !spam[0].includes('https://a.example'), spam[0]);
});
