// @ts-check
/**
 * contact-handler: Rückruf-Wunsch (ContactForm `formType="rueckruf"`).
 *
 * Lauf: `node --test tests/api/contact-handler-rueckruf.test.js`
 *
 * Der Rückruf braucht keine E-Mail, aber eine Telefonnummer. Der Typ kommt als
 * Hidden-Feld `formType` im Body (das Formular sendet sonst keinen Typ mit). Alle
 * anderen Formulare bleiben unverändert: ohne `formType=rueckruf` ist die E-Mail
 * weiter Pflicht.
 *
 * `formType` kommt vom Client. Deshalb wirkt es nur an Endpoints, die den Rückruf per
 * `allowRueckruf: true` freischalten (Review-Befund 26.09.2026: sonst hebt ein
 * handgebauter POST die E-Mail-Pflicht an JEDEM Endpoint auf und überschreibt `kind`).
 *
 * Mocks nach dem Muster von contact-handler.test.js.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createContactHandler } from '../../src/api/contact-handler.js';

let reqCounter = 0;
function makeReq(body = {}) {
  reqCounter += 1;
  // Eigene IP je Request — sonst greift der in-memory Rate-Limit (max 3 / 10 min).
  const ip = `10.99.${(reqCounter >> 8) & 0xff}.${reqCounter & 0xff}`;
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

function installFakeFetch() {
  const calls = /** @type {Array<{url: string, body: any}>} */ ([]);
  const original = global.fetch;
  global.fetch = /** @type {any} */ (async (url, init) => {
    calls.push({ url: String(url), body: init && init.body ? JSON.parse(String(init.body)) : null });
    return { ok: true, status: 200, text: async () => 'OK', json: async () => ({ success: true }) };
  });
  return { calls, restore() { global.fetch = original; } };
}

const ENV_KEYS = ['RESEND_API_KEY', 'CONTACT_EMAIL', 'TURNSTILE_SECRET_KEY', 'LEAD_BCC_EMAIL', 'TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID', 'GLITCHTIP_DSN'];

const handler = createContactHandler({
  allowedOrigins: ['https://example.com'],
  fromName: 'Testkunde GmbH',
  subject: 'Neue Anfrage über testkunde.de',
  allowRueckruf: true,
});

/** Endpoint ohne Opt-in — so, wie alle bestehenden Kunden-Endpoints konfiguriert sind. */
const ohneOptIn = createContactHandler({
  allowedOrigins: ['https://example.com'],
  fromName: 'Testkunde GmbH',
  subject: 'Neue Anfrage über testkunde.de',
});

const waitlist = createContactHandler({
  allowedOrigins: ['https://example.com'],
  fromName: 'platzfrei',
  subject: 'Neuer Wartelisten-Eintrag',
  kind: 'waitlist',
});

const DSN = 'https://k@errors.example/1';

/**
 * @param {Record<string, unknown>} body
 * @param {(req: any, res: any) => Promise<void>} [h]
 */
async function run(body, h = handler) {
  const saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  Object.assign(process.env, {
    RESEND_API_KEY: 'fake', CONTACT_EMAIL: 'info@testkunde.de',
    TELEGRAM_BOT_TOKEN: 'fake-token', TELEGRAM_CHAT_ID: '123', GLITCHTIP_DSN: DSN,
  });
  delete process.env.TURNSTILE_SECRET_KEY;
  delete process.env.LEAD_BCC_EMAIL;
  const fx = installFakeFetch();
  const res = makeRes();
  try {
    await h(makeReq(body), res);
    return {
      res: res._captured,
      resend: fx.calls.find((c) => c.url.includes('resend.com'))?.body ?? null,
      telegram: fx.calls.find((c) => c.url.includes('telegram.org'))?.body ?? null,
      glitchtip: fx.calls.filter((c) => c.url.includes('/api/1/store/')).map((c) => c.body),
    };
  } finally {
    fx.restore();
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

const rueckruf = { formType: 'rueckruf', name: 'Anna Test', telefon: '+49 941 123456', zeitfenster: 'vormittags (8–12 Uhr)' };

test('rueckruf ohne Telefon → 400, kein Versand', async () => {
  const { res, resend } = await run({ formType: 'rueckruf', name: 'Anna Test' });
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.ok, false);
  assert.match(res.body.error, /Telefon/, 'abgelehnt wegen Telefon, nicht wegen E-Mail');
  assert.equal(resend, null);
});

test('rueckruf mit Telefon, ohne E-Mail → angenommen und versendet', async () => {
  const { res, resend } = await run(rueckruf);
  assert.equal(res.statusCode, 200);
  assert.ok(resend, 'Resend-Call muss stattfinden');
  assert.equal('reply_to' in resend, false, 'ohne Lead-Adresse kein reply_to');
  assert.ok(resend.text.includes('+49 941 123456'), 'Telefon im Plain-Text');
  assert.ok(resend.html.includes('tel:+49 941 123456'), 'Telefon als tel:-Link im HTML');
  assert.ok(!resend.html.includes('mailto:?'), 'kein leerer mailto-Knopf');
});

test('zeitfenster wird in Mail (HTML + Text) und Telegram durchgereicht', async () => {
  const { resend, telegram } = await run(rueckruf);
  assert.ok(resend.text.includes('vormittags (8–12 Uhr)'), 'Zeitfenster im Plain-Text');
  assert.ok(resend.html.includes('vormittags (8–12 Uhr)'), 'Zeitfenster im HTML');
  assert.ok(telegram, 'Telegram-Push muss raus');
  // MarkdownV2 escaped die Klammern — auf den unescapten Teil prüfen.
  assert.ok(telegram.text.includes('vormittags'), 'Zeitfenster im Telegram-Push');
  assert.ok(telegram.text.includes('Rückruf'), 'Push ist als Rückruf erkennbar');
});

test('rueckruf mit zu kurzer Telefonnummer (5 Ziffern) → 400', async () => {
  const { res, resend } = await run({ ...rueckruf, telefon: '12-3 45' });
  assert.equal(res.statusCode, 400);
  assert.match(res.body.error, /Telefon/);
  assert.equal(resend, null);
});

test('Telefon: 6 Ziffern mit Trennzeichen reichen', async () => {
  const { res } = await run({ ...rueckruf, telefon: '(09) 41-23 4' });
  assert.equal(res.statusCode, 200);
});

test('zeitfenster über 60 Zeichen → 400', async () => {
  const { res, resend } = await run({ ...rueckruf, zeitfenster: 'x'.repeat(61) });
  assert.equal(res.statusCode, 400);
  assert.match(res.body.error, /Zeitfenster/);
  assert.equal(resend, null);
});

test('zeitfenster mit genau 60 Zeichen → angenommen', async () => {
  const { res } = await run({ ...rueckruf, zeitfenster: 'x'.repeat(60) });
  assert.equal(res.statusCode, 200);
});

test('rueckruf mit ungültiger E-Mail → 400 (freiwillig heißt nicht beliebig)', async () => {
  const { res } = await run({ ...rueckruf, email: 'keine-adresse' });
  assert.equal(res.statusCode, 400);
  assert.match(res.body.error, /E-Mail/);
});

test('rueckruf mit gültiger E-Mail → reply_to gesetzt', async () => {
  const { resend } = await run({ ...rueckruf, email: 'anna@example.org' });
  assert.equal(resend.reply_to, 'anna@example.org');
});

test('Gegenprobe: contact ohne E-Mail → weiterhin 400', async () => {
  const { res, resend } = await run({ name: 'Anna Test', message: 'Hallo', telefon: '+49 941 123456' });
  assert.equal(res.statusCode, 400);
  assert.match(res.body.error, /E-Mail/);
  assert.equal(resend, null);
});

test('Gegenprobe: rueckruf mit gefülltem Honeypot → still verworfen, kein Versand', async () => {
  const a = await run({ ...rueckruf, url_honey: 'https://spam.example' });
  assert.equal(a.res.statusCode, 200);
  assert.equal(a.resend, null);
  const b = await run({ ...rueckruf, botcheck: 'on' });
  assert.equal(b.resend, null);
});

test('Gegenprobe: Spam im Anliegen eines Rückrufs → still verworfen', async () => {
  const { res, resend } = await run({ ...rueckruf, message: 'best casino backlink service' });
  assert.equal(res.statusCode, 200);
  assert.equal(resend, null);
});

// ===========================================================================
// Opt-in `allowRueckruf` (Review-Befund 1) + Zeichenklasse Telefon (Befund 2)
// ===========================================================================

test('(a) ohne Opt-in: formType=rueckruf ohne E-Mail → 400, kein Versand, kein Rückruf-Lead', async () => {
  const { res, resend, telegram, glitchtip } = await run({ ...rueckruf }, ohneOptIn);
  assert.equal(res.statusCode, 400, 'der Exploit darf nicht mit 200 durchgehen');
  assert.equal(res.body.ok, false);
  assert.equal(resend, null, 'keine Lead-Mail ohne E-Mail an einem Endpoint ohne Opt-in');
  // Nicht still verloren: der Lead geht als Zustellfehler an Telegram, Ops sieht die Fehlkonfiguration.
  assert.ok(telegram, 'Lead muss als Alarm an Telegram, sonst ist er still weg');
  assert.match(telegram.text, /ZUSTELLUNG FEHLGESCHLAGEN/);
  assert.match(telegram.text, /allowRueckruf/);
  assert.ok(!telegram.text.includes('📞'), 'kein Rückruf-Kopf ohne Opt-in');
  assert.equal(glitchtip.length, 1, 'genau ein GlitchTip-Event zur Fehlkonfiguration');
  assert.ok(!JSON.stringify(glitchtip[0]).includes('123456'), 'kein Lead-Inhalt im Event');
});

test('(a2) ohne Opt-in: formType=rueckruf MIT E-Mail → normaler Kontakt-Lead, kind unverändert', async () => {
  const { res, resend, telegram } = await run({ ...rueckruf, email: 'anna@example.org' }, ohneOptIn);
  assert.equal(res.statusCode, 200);
  assert.ok(resend);
  assert.equal(resend.reply_to, 'anna@example.org');
  assert.ok(telegram.text.includes('🆕'), 'Standard-Lead-Kopf');
  assert.ok(!telegram.text.includes('📞'), 'kein Rückruf-Kopf');
});

test('(b) kind waitlist + formType=rueckruf → kind bleibt waitlist, E-Mail bleibt Pflicht', async () => {
  const ohneMail = await run({ ...rueckruf }, waitlist);
  assert.equal(ohneMail.res.statusCode, 400);
  assert.equal(ohneMail.resend, null);
  const mitMail = await run({ ...rueckruf, email: 'studio@example.org', studio: 'Gym' }, waitlist);
  assert.equal(mitMail.res.statusCode, 200);
  assert.ok(mitMail.telegram.text.includes('Warteliste'), 'Warteliste-Kopf bleibt');
  assert.ok(!mitMail.telegram.text.includes('📞'), 'kein Rückruf-Kopf');
});

test('(c) mit Opt-in: Rückruf ohne E-Mail → 200 mit Rückruf-Kopf', async () => {
  const { res, resend, telegram } = await run({ ...rueckruf });
  assert.equal(res.statusCode, 200);
  assert.ok(resend);
  assert.ok(telegram.text.includes('📞'), 'Rückruf-Kopf im Push');
});

test('(d) Telefon mit Buchstaben („spam casino 123456“) → 400', async () => {
  const { res, resend } = await run({ ...rueckruf, telefon: 'spam casino 123456' });
  assert.equal(res.statusCode, 400);
  assert.match(res.body.error, /Telefon/);
  assert.equal(resend, null);
});

test('(e) Telefon „+49 (0)941 / 123-45“ → angenommen', async () => {
  const { res, resend } = await run({ ...rueckruf, telefon: '+49 (0)941 / 123-45' });
  assert.equal(res.statusCode, 200);
  assert.ok(resend.text.includes('+49 (0)941 / 123-45'));
});

test('Telefon mit Durchwahl-Trenner („0941 123456 ext. 12“, „… Durchwahl 12“, „… x12“) → angenommen', async () => {
  for (const telefon of ['0941 123456 ext. 12', '0941 123456 Durchwahl 12', '0941 123456 x12', '0941.123456-0']) {
    const { res } = await run({ ...rueckruf, telefon });
    assert.equal(res.statusCode, 200, telefon);
  }
});

test('Telefon mit fremden Zeichen (<, @, Zeilenumbruch) → 400', async () => {
  for (const telefon of ['0941<script>123456', 'a@b.de 123456', '0941 123\n456789']) {
    const { res } = await run({ ...rueckruf, telefon });
    assert.equal(res.statusCode, 400, JSON.stringify(telefon));
  }
});
