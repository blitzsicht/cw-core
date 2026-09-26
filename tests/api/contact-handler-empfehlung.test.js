// @ts-check
/**
 * contact-handler: Empfehlung (ContactForm `formType="empfehlung"`).
 *
 * Lauf: `node --test tests/api/contact-handler-empfehlung.test.js`
 *
 * Name Pflicht, E-Mail ODER Telefon (mindestens eins), `empfohlen` freiwillig und
 * höchstens 80 Zeichen — über die empfohlene Person wird nichts verlangt.
 *
 * Wie beim Rückruf wirkt `formType` nur an Endpoints mit Opt-in
 * (`allowEmpfehlung: true`): `formType` kommt vom Client, ohne Opt-in könnte ein
 * handgebauter POST die E-Mail-Pflicht an jedem Endpoint aufheben. Ohne Opt-in wird
 * die Empfehlung wie ein Kontakt behandelt; fehlt die E-Mail, gibt es 400 plus Alarm.
 *
 * Harness 1:1 aus contact-handler-rueckruf.test.js.
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
  allowEmpfehlung: true,
});

/** Endpoint ohne Opt-in — so, wie alle bestehenden Kunden-Endpoints konfiguriert sind. */
const ohneOptIn = createContactHandler({
  allowedOrigins: ['https://example.com'],
  fromName: 'Testkunde GmbH',
  subject: 'Neue Anfrage über testkunde.de',
});

/** Nur Rückruf freigeschaltet: darf eine Empfehlung NICHT annehmen. */
const nurRueckruf = createContactHandler({
  allowedOrigins: ['https://example.com'],
  fromName: 'Testkunde GmbH',
  subject: 'Neue Anfrage über testkunde.de',
  allowRueckruf: true,
});

/** Beide Opt-ins zugleich — so sieht ein Kunde mit Rückruf- UND Empfehlungsformular aus. */
const beide = createContactHandler({
  allowedOrigins: ['https://example.com'],
  fromName: 'Testkunde GmbH',
  subject: 'Neue Anfrage über testkunde.de',
  allowRueckruf: true,
  allowEmpfehlung: true,
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

const empfehlung = { formType: 'empfehlung', name: 'Anna Test', telefon: '+49 941 123456', empfohlen: 'Firma Huber' };

// ---------------------------------------------------------------------------
// Mit Opt-in
// ---------------------------------------------------------------------------

test('mit Opt-in: Name + Telefon, ohne E-Mail → 200, Versand, Empfehlungs-Kopf', async () => {
  const { res, resend, telegram } = await run(empfehlung);
  assert.equal(res.statusCode, 200);
  assert.ok(resend, 'Resend-Call muss stattfinden');
  assert.equal('reply_to' in resend, false, 'ohne Lead-Adresse kein reply_to');
  assert.ok(resend.text.includes('+49 941 123456'), 'Telefon im Plain-Text');
  assert.ok(telegram, 'Telegram-Push muss raus');
  assert.ok(telegram.text.startsWith('🤝 *Empfehlung*'), `Kopf: ${telegram.text.split('\n')[0]}`);
});

test('mit Opt-in: Name + E-Mail, ohne Telefon → 200 mit reply_to', async () => {
  const { res, resend } = await run({ formType: 'empfehlung', name: 'Anna Test', email: 'anna@example.org' });
  assert.equal(res.statusCode, 200);
  assert.equal(resend.reply_to, 'anna@example.org');
});

test('mit Opt-in: „empfohlen“ steht in Mail (HTML + Text) und Telegram', async () => {
  const { resend, telegram } = await run(empfehlung);
  assert.ok(resend.text.includes('Empfohlen: Firma Huber'), 'Plain-Text');
  assert.ok(resend.html.includes('Firma Huber'), 'HTML');
  assert.ok(telegram.text.includes('Firma Huber'), 'Telegram');
});

test('mit Opt-in: ohne „empfohlen“ → 200, keine leere Zeile dafür', async () => {
  const { res, resend, telegram } = await run({ formType: 'empfehlung', name: 'Anna Test', telefon: '+49 941 123456' });
  assert.equal(res.statusCode, 200);
  assert.ok(!resend.text.includes('Empfohlen'));
  assert.ok(!telegram.text.includes('Empfohlen'));
});

test('mit Opt-in: weder E-Mail noch Telefon → 400, kein Versand', async () => {
  const { res, resend } = await run({ formType: 'empfehlung', name: 'Anna Test', empfohlen: 'Firma Huber' });
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.ok, false);
  assert.match(res.body.error, /E-Mail.*Telefon|Telefon.*E-Mail/);
  assert.equal(resend, null);
});

test('mit Opt-in: ohne Name → 400', async () => {
  const { res, resend } = await run({ ...empfehlung, name: '   ' });
  assert.equal(res.statusCode, 400);
  assert.match(res.body.error, /Name/);
  assert.equal(resend, null);
});

test('mit Opt-in: „empfohlen“ mit 81 Zeichen → 400', async () => {
  const { res, resend } = await run({ ...empfehlung, empfohlen: 'x'.repeat(81) });
  assert.equal(res.statusCode, 400);
  assert.match(res.body.error, /empfohlenen Person.*80/);
  assert.equal(resend, null);
});

test('mit Opt-in: „empfohlen“ mit genau 80 Zeichen → 200', async () => {
  const { res } = await run({ ...empfehlung, empfohlen: 'x'.repeat(80) });
  assert.equal(res.statusCode, 200);
});

test('mit Opt-in: ungültige E-Mail → 400 (freiwillig heißt nicht beliebig)', async () => {
  const { res } = await run({ ...empfehlung, email: 'keine-adresse' });
  assert.equal(res.statusCode, 400);
  assert.match(res.body.error, /E-Mail/);
});

test('mit Opt-in: ungültiges Telefon → 400', async () => {
  const { res } = await run({ ...empfehlung, telefon: 'spam casino 123456' });
  assert.equal(res.statusCode, 400);
  assert.match(res.body.error, /Telefon/);
});

test('Honeypot → still verworfen, kein Versand', async () => {
  const a = await run({ ...empfehlung, url_honey: 'https://spam.example' });
  assert.equal(a.res.statusCode, 200);
  assert.equal(a.resend, null);
  const b = await run({ ...empfehlung, botcheck: 'on' });
  assert.equal(b.res.statusCode, 200);
  assert.equal(b.resend, null);
});

test('„empfohlen“ läuft durch den Inhaltsfilter → Spam still verworfen', async () => {
  const { res, resend } = await run({ ...empfehlung, empfohlen: 'best casino backlink' });
  assert.equal(res.statusCode, 200);
  assert.equal(resend, null);
});

// ---------------------------------------------------------------------------
// Ohne Opt-in: wie contact, Alarm bei Fehlkonfiguration
// ---------------------------------------------------------------------------

test('ohne Opt-in: Empfehlung ohne E-Mail → 400, kein Versand, Alarm an Telegram + GlitchTip', async () => {
  const { res, resend, telegram, glitchtip } = await run(empfehlung, ohneOptIn);
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.ok, false);
  assert.equal(resend, null);
  assert.ok(telegram, 'Lead als Alarm an Telegram, sonst still weg');
  assert.match(telegram.text, /ZUSTELLUNG FEHLGESCHLAGEN/);
  assert.match(telegram.text, /allowEmpfehlung/);
  assert.ok(!telegram.text.includes('🤝'), 'kein Empfehlungs-Kopf ohne Opt-in');
  assert.equal(glitchtip.length, 1, 'genau ein GlitchTip-Event');
  assert.ok(!JSON.stringify(glitchtip[0]).includes('123456'), 'kein Lead-Inhalt im Event');
});

test('ohne Opt-in: Empfehlung mit E-Mail → normaler Kontakt-Lead, kein Empfehlungs-Kopf', async () => {
  const { res, resend, telegram } = await run({ ...empfehlung, email: 'anna@example.org' }, ohneOptIn);
  assert.equal(res.statusCode, 200);
  assert.ok(resend);
  assert.ok(telegram.text.startsWith('🆕 *Lead*'), 'Standard-Lead-Kopf');
  assert.ok(!telegram.text.includes('🤝'));
});

test('ohne Opt-in: weder E-Mail noch Telefon → 400 wie contact, ohne Alarm', async () => {
  const { res, telegram, glitchtip } = await run({ formType: 'empfehlung', name: 'Anna Test' }, ohneOptIn);
  assert.equal(res.statusCode, 400);
  assert.match(res.body.error, /E-Mail/);
  assert.equal(telegram, null);
  assert.equal(glitchtip.length, 0);
});

test('ohne Opt-in: „empfohlen“ mit 81 Zeichen wird wie bei contact ignoriert (kein 400)', async () => {
  const { res } = await run({ ...empfehlung, email: 'anna@example.org', empfohlen: 'x'.repeat(81) }, ohneOptIn);
  assert.equal(res.statusCode, 200);
});

// ---------------------------------------------------------------------------
// Opt-ins sind getrennt
// ---------------------------------------------------------------------------

test('allowRueckruf schaltet die Empfehlung NICHT frei', async () => {
  const { res, resend, telegram } = await run(empfehlung, nurRueckruf);
  assert.equal(res.statusCode, 400);
  assert.equal(resend, null);
  assert.match(telegram.text, /allowEmpfehlung/);
});

test('allowEmpfehlung schaltet den Rückruf NICHT frei', async () => {
  const { res, resend } = await run({ formType: 'rueckruf', name: 'Anna Test', telefon: '+49 941 123456' });
  assert.equal(res.statusCode, 400);
  assert.equal(resend, null);
});

test('Gegenprobe: contact ohne E-Mail an einem Empfehlungs-Endpoint → weiterhin 400', async () => {
  const { res, resend } = await run({ name: 'Anna Test', message: 'Hallo', telefon: '+49 941 123456' });
  assert.equal(res.statusCode, 400);
  assert.match(res.body.error, /E-Mail/);
  assert.equal(resend, null);
});

test('beide Opt-ins: Rückruf ohne E-Mail → 200 mit Rückruf-Kopf', async () => {
  const { res, resend, telegram } = await run({ formType: 'rueckruf', name: 'Anna Test', telefon: '+49 941 123456' }, beide);
  assert.equal(res.statusCode, 200);
  assert.ok(resend);
  assert.ok(telegram.text.startsWith('📞 *Rückruf*'), telegram.text.split('\n')[0]);
});

test('beide Opt-ins: Empfehlung mit Telefon → 200 mit Empfehlungs-Kopf', async () => {
  const { res, resend, telegram } = await run(empfehlung, beide);
  assert.equal(res.statusCode, 200);
  assert.ok(resend);
  assert.ok(telegram.text.startsWith('🤝 *Empfehlung*'), telegram.text.split('\n')[0]);
});

test('beide Opt-ins: contact ohne E-Mail → weiterhin 400', async () => {
  const { res, resend } = await run({ name: 'Anna Test', message: 'Hallo', telefon: '+49 941 123456' }, beide);
  assert.equal(res.statusCode, 400);
  assert.match(res.body.error, /E-Mail/);
  assert.equal(resend, null);
});
