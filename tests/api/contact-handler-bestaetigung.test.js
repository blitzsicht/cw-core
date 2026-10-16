// @ts-check
/**
 * contact-handler: Bestätigungsmail (`confirmation`), `extraFields`, `requireConsent`.
 *
 * Lauf: `node --test tests/api/contact-handler-bestaetigung.test.js`
 *
 * Harness wie contact-handler-empfehlung.test.js. Alle Aufrufe laufen über ein gemocktes
 * fetch (Resend, Turnstile, Telegram, GlitchTip, Conversion-Store); kein Netzwerk.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createContactHandler } from '../../src/api/contact-handler.js';

let reqCounter = 0;
function makeReq(body = {}) {
  reqCounter += 1;
  const ip = `10.98.${(reqCounter >> 8) & 0xff}.${reqCounter & 0xff}`;
  return {
    method: 'POST',
    headers: { origin: 'https://example.com', 'x-vercel-forwarded-for': ip, 'user-agent': 'node-test' },
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

const ENV_KEYS = ['RESEND_API_KEY', 'CONTACT_EMAIL', 'TURNSTILE_SECRET_KEY', 'LEAD_BCC_EMAIL', 'TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID', 'GLITCHTIP_DSN', 'CW_CONVERSION_STORE_URL', 'PROJECT_NAME'];
const DSN = 'https://k@errors.example/1';
const STORE_HOST = 'store.example'; // neon-HTTP-Treiber ruft https://api.<domain>/sql auf
const STORE_URL_PART = 'api.example/sql';

const confirmation = { subject: 'Danke für Ihre Bestellung', text: (/** @type {Record<string,string>} */ f) => `Hallo ${f.name}, Paket ${f.paket ?? '-'}` };
const basis = { allowedOrigins: ['https://example.com'], fromName: 'Testkunde GmbH', subject: 'Neue Anfrage' };

/**
 * @param {Record<string, unknown>} config
 * @param {Record<string, unknown>} body
 * @param {{ env?: Record<string, string>, resendFail?: (n: number) => false | true | 'throw', turnstileOk?: boolean }} [opt]
 */
async function run(config, body, opt = {}) {
  const saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  Object.assign(process.env, {
    RESEND_API_KEY: 'SECRET-KEY', CONTACT_EMAIL: 'info@testkunde.de, zweit@testkunde.de',
    TELEGRAM_BOT_TOKEN: 'fake-token', TELEGRAM_CHAT_ID: '123', GLITCHTIP_DSN: DSN,
    PROJECT_NAME: 'testkunde',
  });
  delete process.env.TURNSTILE_SECRET_KEY;
  delete process.env.LEAD_BCC_EMAIL;
  delete process.env.CW_CONVERSION_STORE_URL;
  Object.assign(process.env, opt.env || {});

  const calls = /** @type {Array<{url: string, body: any}>} */ ([]);
  const errors = /** @type {string[]} */ ([]);
  const origFetch = global.fetch;
  const origErr = console.error;
  const origLog = console.log;
  const origWarn = console.warn;
  console.error = (...a) => { errors.push(a.map(String).join(' ')); };
  console.log = () => {};
  console.warn = () => {};
  let resendN = 0;
  global.fetch = /** @type {any} */ (async (url, init) => {
    const u = String(url);
    let parsed = null;
    try { parsed = init && init.body ? JSON.parse(String(init.body)) : null; } catch { /* kein JSON */ }
    calls.push({ url: u, body: parsed });
    if (u.includes('turnstile')) return { ok: true, status: 200, json: async () => ({ success: opt.turnstileOk !== false }) };
    if (u.includes('api.resend.com')) {
      resendN += 1;
      const f = opt.resendFail ? opt.resendFail(resendN) : false;
      if (f === 'throw') throw new Error('network down');
      return { ok: !f, status: f ? 500 : 200, text: async () => 'err', json: async () => ({}) };
    }
    return { ok: true, status: 200, text: async () => 'OK', json: async () => ({ success: true, results: [] }) };
  });
  const res = makeRes();
  try {
    await createContactHandler(/** @type {any} */ ({ ...basis, ...config }))(
      makeReq({ email: 'kunde@example.com', name: 'Max Muster', message: 'Hallo', ...body }), res);
    const resend = calls.filter((c) => c.url.includes('api.resend.com')).map((c) => c.body);
    return {
      res: res._captured,
      resend,
      telegram: calls.filter((c) => c.url.includes('telegram.org')),
      glitchtip: calls.filter((c) => c.url.includes('/api/1/store/')),
      store: calls.filter((c) => c.url.includes(STORE_URL_PART)),
      errors,
    };
  } finally {
    global.fetch = origFetch;
    console.error = origErr;
    console.log = origLog;
    console.warn = origWarn;
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

test('1: ohne neue Optionen genau 1 Resend-Aufruf, unveränderte Form', async () => {
  const r = await run({}, { consent: 'on', paket: 'X' });
  assert.equal(r.res.statusCode, 200);
  assert.equal(r.resend.length, 1);
  assert.deepEqual(r.resend[0].to, ['info@testkunde.de', 'zweit@testkunde.de']);
  assert.equal(r.resend[0].reply_to, 'kunde@example.com');
  assert.ok(!r.resend[0].text.includes('paket'));
  assert.deepEqual(Object.keys(r.resend[0]), ['from', 'to', 'reply_to', 'subject', 'html', 'text']);
});

test('2: mit confirmation genau 2 Aufrufe, zweiter an body.email, nur Text', async () => {
  const r = await run({ confirmation, extraFields: ['paket'] }, { paket: 'Pro' });
  assert.equal(r.res.statusCode, 200);
  assert.equal(r.resend.length, 2);
  const c = r.resend[1];
  assert.equal(c.to, 'kunde@example.com');
  assert.equal(c.reply_to, 'info@testkunde.de');
  assert.equal(c.subject, 'Danke für Ihre Bestellung');
  assert.equal(c.text, 'Hallo Max Muster, Paket Pro');
  assert.equal(c.html, undefined);
});

test('2b: confirmation.replyTo überschreibt den Default', async () => {
  const r = await run({ confirmation: { ...confirmation, replyTo: 'bestellung@testkunde.de' } }, {});
  assert.equal(r.resend[1].reply_to, 'bestellung@testkunde.de');
});

test('2c: ohne E-Mail (Rückruf) keine Bestätigung', async () => {
  const r = await run({ confirmation, allowRueckruf: true },
    { formType: 'rueckruf', email: '', telefon: '+49 941 123456' });
  assert.equal(r.res.statusCode, 200);
  assert.equal(r.resend.length, 1);
});

test('3: requireConsent ohne consent → 400 und 0 Aufrufe', async () => {
  const r = await run({ requireConsent: true, confirmation }, {});
  assert.equal(r.res.statusCode, 400);
  assert.equal(r.res.body.ok, false);
  assert.equal(r.resend.length, 0);
  assert.equal(r.telegram.length, 0);
});

test('3b: requireConsent akzeptiert on / true / "true", lehnt "false" ab', async () => {
  for (const c of ['on', true, 'true']) {
    assert.equal((await run({ requireConsent: true }, { consent: c })).res.statusCode, 200);
  }
  assert.equal((await run({ requireConsent: true }, { consent: 'false' })).res.statusCode, 400);
});

test('4: Honeypot mit confirmation → 0 Aufrufe', async () => {
  const r = await run({ confirmation }, { botcheck: 'x' });
  assert.equal(r.res.statusCode, 200);
  assert.equal(r.resend.length, 0);
});

test('4b: Spam-Pfad mit confirmation → 0 Aufrufe', async () => {
  const r = await run({ confirmation }, { message: 'buy bitcoin now' });
  assert.equal(r.res.statusCode, 200);
  assert.equal(r.resend.length, 0);
});

test('4c: Turnstile aktiv und fehlgeschlagen → 400, 0 Aufrufe; bestanden → 2', async () => {
  const bad = await run({ confirmation }, { 'cf-turnstile-response': 't' },
    { env: { TURNSTILE_SECRET_KEY: 's' }, turnstileOk: false });
  assert.equal(bad.res.statusCode, 400);
  assert.equal(bad.resend.length, 0);
  const ok = await run({ confirmation }, { 'cf-turnstile-response': 't' }, { env: { TURNSTILE_SECRET_KEY: 's' } });
  assert.equal(ok.res.statusCode, 200);
  assert.equal(ok.resend.length, 2);
});

test('4d: Postfach-Mail scheitert → keine Bestätigung', async () => {
  const r = await run({ confirmation }, {}, { resendFail: () => true });
  assert.equal(r.res.statusCode, 400);
  assert.equal(r.resend.length, 1);
});

test('5: Bestätigung liefert Fehlerstatus → trotzdem 200, kein GlitchTip', async () => {
  const r = await run({ confirmation }, {}, { resendFail: (n) => n === 2 });
  assert.equal(r.res.statusCode, 200);
  assert.equal(r.resend.length, 2);
  assert.equal(r.glitchtip.length, 0);
});

test('5b: Bestätigung wirft (fetch bzw. text()) → 200, Grund geloggt, kein Secret', async () => {
  const a = await run({ confirmation }, {}, { resendFail: (n) => (n === 2 ? 'throw' : false) });
  assert.equal(a.res.statusCode, 200);
  const b = await run({ confirmation: { subject: 's', text: () => { throw new Error('boom'); } } }, {});
  assert.equal(b.res.statusCode, 200);
  assert.equal(b.resend.length, 1, 'text() wirft vor dem Versand');
  assert.ok(a.errors.length >= 1 && b.errors.length >= 1);
  assert.ok(![...a.errors, ...b.errors].join('\n').includes('SECRET-KEY'));
});

test('6: Zusammenspiel mit Bcc: Bestätigung ohne Bcc, Postfach-Mail mit Bcc', async () => {
  const r = await run({ confirmation }, {}, { env: { LEAD_BCC_EMAIL: 'servus@blitzsicht.com' } });
  assert.deepEqual(r.resend[0].bcc, ['servus@blitzsicht.com']);
  assert.equal('bcc' in r.resend[1], false);
});

test('7: Zusammenspiel mit Telegram/GlitchTip/Conversion-Store: Zählwerte gleich mit und ohne confirmation', async () => {
  const env = { CW_CONVERSION_STORE_URL: `postgres://u:p@${STORE_HOST}/db` };
  const body = { gclid: 'abc123', marketing_consent: 'true', marketing_consent_version: 'v1' };
  const ohne = await run({}, body, { env });
  const mit = await run({ confirmation }, body, { env });
  assert.equal(mit.resend.length, 2);
  assert.equal(mit.telegram.length, 1);
  assert.equal(mit.telegram.length, ohne.telegram.length);
  assert.equal(mit.store.length, ohne.store.length);
  assert.equal(ohne.store.length, 1, 'Store-Schreibvorgang muss im Basisfall stattfinden (sonst ist der Vergleich leer)');
  assert.equal(mit.store.length, 1);
  assert.equal(mit.glitchtip.length, ohne.glitchtip.length);
  assert.equal(mit.glitchtip.length, 0);
});

test('8: extraFields: Whitelist, Reihenfolge, Trim, 2000-Limit, Rest ignoriert', async () => {
  const r = await run({ extraFields: ['zweites', 'erstes'] }, {
    erstes: '  A  ', zweites: 'B'.repeat(2500), geheim: 'nicht',
  });
  const t = r.resend[0].text;
  assert.ok(t.indexOf(`zweites: ${'B'.repeat(2000)}\n`) >= 0);
  assert.ok(t.indexOf('zweites: ') < t.indexOf('erstes: A'));
  assert.ok(!t.includes('B'.repeat(2001)));
  assert.ok(!t.includes('geheim'));
  assert.ok(r.resend[0].html.includes('erstes'));
});

test('9: Spamprüfung bezieht extraFields ein; ohne extraFields nicht (Abwärtskompatibilität)', async () => {
  const a = await run({ extraFields: ['paket'], confirmation }, { paket: 'casino' });
  assert.equal(a.res.statusCode, 200);
  assert.equal(a.resend.length, 0);
  const b = await run({}, { paket: 'casino' });
  assert.equal(b.resend.length, 1);
});

// ---------------------------------------------------------------------------
// leadSink (Datenschutz: kein Personenbezug im Telegram-Push)
// ---------------------------------------------------------------------------

const PII = {
  name: 'Erika Mustermann', email: 'erika.privat@example.org', phone: '+49 941 7654321',
  company: 'Geheimfirma', message: 'Vertraulicher Nachrichtentext',
};
const pii = { ...PII, paket: 'Wachstum', adresse: 'Privatstrasse 7' };
const tgText = (/** @type {any} */ r) => r.telegram.map((/** @type {any} */ c) => c.body.text).join('\n');

test('10: leadSink minimal → 1 Telegram-Aufruf, keinerlei Personendaten, aber paket', async () => {
  const r = await run({ leadSink: 'minimal', extraFields: ['paket', 'adresse'] }, pii);
  assert.equal(r.res.statusCode, 200);
  assert.equal(r.telegram.length, 1);
  const t = tgText(r);
  for (const [feld, wert] of Object.entries({ ...PII, adresse: pii.adresse })) {
    assert.ok(!t.includes(wert), `${feld} darf nicht im Telegram-Text stehen`);
    assert.ok(!t.includes(wert.replace(/[.+-]/g, '\\$&')), `${feld} (escaped) darf nicht im Text stehen`);
  }
  assert.ok(!t.includes('Erika') && !t.includes('Mustermann') && !t.includes('privat'));
  assert.ok(!t.includes('10.98.'), 'keine IP');
  assert.ok(!t.includes('node-test'), 'kein UA');
  assert.ok(t.includes('Wachstum'), 'paket steht drin');
  assert.ok(t.includes('Neue Anfrage'), 'Betreff steht drin');
  assert.ok(t.includes('testkunde'), 'Projekt steht drin');
  assert.ok(t.includes('https://example\\.com'), 'Origin steht drin');
  assert.ok(t.trimEnd().endsWith('Details im Postfach'));
  // Postfach-Mail bleibt vollständig
  assert.ok(r.resend[0].text.includes(PII.email) && r.resend[0].text.includes('Privatstrasse 7'));
});

test('10b: leadSink minimal bei Zustellfehler → Alarm ohne Personendaten', async () => {
  const r = await run({ leadSink: 'minimal' }, pii, { resendFail: () => true });
  assert.equal(r.res.statusCode, 400);
  assert.equal(r.telegram.length, 1);
  const t = tgText(r);
  assert.ok(t.includes('ZUSTELLUNG FEHLGESCHLAGEN'));
  assert.ok(!t.includes(PII.name) && !t.includes('erika') && !t.includes('Geheimfirma') && !t.includes('Vertraulicher'));
});

test('11: leadSink false → 0 Telegram-Aufrufe, Mail und 200 unverändert', async () => {
  const r = await run({ leadSink: false }, pii);
  assert.equal(r.res.statusCode, 200);
  assert.equal(r.telegram.length, 0);
  assert.equal(r.resend.length, 1);
});

test('12: Default (und leadSink "full") → Telegram-Inhalt wie vorher (Snapshot)', async () => {
  const erwartet = [
    '🆕 *Lead* · testkunde', '',
    '*Name:*  Erika Mustermann',
    '*Email:* erika\\.privat@example\\.org',
    '*Co\\.:*   Geheimfirma',
    '*Tel:*   \\+49 941 7654321',
    '', 'Vertraulicher Nachrichtentext',
    '', '_STAMP UTC · https://example\\.com_',
  ].join('\n');
  for (const cfg of [{}, { leadSink: 'full' }]) {
    const r = await run(cfg, { ...PII, paket: 'Wachstum' });
    assert.equal(r.telegram.length, 1);
    const t = tgText(r).replace(/\d{4}\\-\d\d\\-\d\d \d\d:\d\d/, "STAMP");
    assert.equal(t, erwartet);
  }
});

// ---------------------------------------------------------------------------
// Header-Injection in der Bestätigung
// ---------------------------------------------------------------------------

test('13: CR/LF in confirmation.subject und fromName gelangen nicht in den Resend-Payload', async () => {
  const bos = '\r\nBcc: x@y.z';
  const r = await run(
    { fromName: `Testkunde${bos}`, confirmation: { subject: `Danke${bos}`, text: () => 'ok' } }, {});
  assert.equal(r.res.statusCode, 200);
  const c = r.resend[1];
  assert.equal(c.to, 'kunde@example.com');
  assert.ok(!/[\r\n]/.test(c.subject), 'Betreff ohne Zeilenumbruch');
  assert.ok(!/[\r\n]/.test(c.from), 'From ohne Zeilenumbruch');
  assert.ok(c.subject.startsWith('Danke') && c.from.includes('Testkunde'));
  assert.equal(c.bcc, undefined);
});
