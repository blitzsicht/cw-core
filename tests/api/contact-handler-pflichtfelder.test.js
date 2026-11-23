// @ts-check
/**
 * contact-handler: Pflichtfelder des Kontaktformulars (`requiredFields`) und Anzeigenamen
 * der Zusatzfelder (`extraFieldLabels`).
 *
 * Lauf: `node --test tests/api/contact-handler-pflichtfelder.test.js`
 *
 * ANLASS (18.11.2026): Eine Kundin wünscht im Kontaktformular Telefon, Anliegen/Thema und
 * Ausführungsort als Pflicht, dazu ein freies Feld für den besten Zeitraum für Anrufe. Das
 * Formular setzt `required`, das hält aber nur den Browser auf. `requiredFields` prüft
 * dieselben Felder am Server.
 *
 * `requiredFields` gilt nur für Anfragen ohne Rückruf-/Empfehlungs-Typ. Ein Rückruf oder eine
 * Empfehlung an DEMSELBEN Endpoint läuft unverändert durch (Gegenproben unten).
 *
 * Mocks nach dem Muster von contact-handler-rueckruf.test.js.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createContactHandler } from '../../src/api/contact-handler.js';

let reqCounter = 0;
function makeReq(body = {}) {
  reqCounter += 1;
  // Eigene IP je Request — sonst greift der in-memory Rate-Limit (max 3 / 10 min).
  const ip = `10.77.${(reqCounter >> 8) & 0xff}.${reqCounter & 0xff}`;
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

/** Konfiguration wie im Anlass: Telefon, Anliegen, Ausführungsort Pflicht; Rückruf und Empfehlung freigeschaltet. */
const KONFIG = {
  allowedOrigins: ['https://example.com'],
  fromName: 'Testkunde GmbH',
  subject: 'Neue Anfrage über testkunde.de',
  extraFields: ['anliegen', 'ausfuehrungsort'],
  requiredFields: ['telefon', 'anliegen', 'ausfuehrungsort'],
  extraFieldLabels: { anliegen: 'Anliegen / Thema', ausfuehrungsort: 'Ausführungsort' },
  allowRueckruf: true,
  allowEmpfehlung: true,
};
const handler = createContactHandler(KONFIG);

/** Dieselbe Kundin ohne die neuen Optionen — heutiges Verhalten. */
const ohneNeueOptionen = createContactHandler({
  allowedOrigins: ['https://example.com'],
  fromName: 'Testkunde GmbH',
  subject: 'Neue Anfrage über testkunde.de',
  extraFields: ['anliegen', 'ausfuehrungsort'],
  allowRueckruf: true,
  allowEmpfehlung: true,
});

/**
 * @param {Record<string, unknown>} body
 * @param {(req: any, res: any) => Promise<void>} [h]
 */
async function run(body, h = handler) {
  const saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  Object.assign(process.env, {
    RESEND_API_KEY: 'fake', CONTACT_EMAIL: 'info@testkunde.de',
    TELEGRAM_BOT_TOKEN: 'fake', TELEGRAM_CHAT_ID: '123', GLITCHTIP_DSN: 'https://k@errors.example/1',
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
    };
  } finally {
    fx.restore();
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

/** Vollständige Kontaktanfrage, wie das Formular sie sendet (ohne formType). */
const KONTAKT = {
  name: 'Anna Test',
  email: 'anna@example.org',
  telefon: '+49 941 123456',
  zeitfenster: 'werktags ab 17 Uhr',
  anliegen: 'Photovoltaik',
  ausfuehrungsort: 'Regensburg',
  message: 'Bitte um ein Angebot.',
};

/** @param {Record<string, unknown>} b @param {string} k */
const ohne = (b, k) => Object.fromEntries(Object.entries(b).filter(([key]) => key !== k));

// ---------------------------------------------------------------------------
// requiredFields
// ---------------------------------------------------------------------------

test('requiredFields: alle Pflichtfelder da → 200 und Versand', async () => {
  const { res, resend } = await run(KONTAKT);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.ok, true);
  assert.ok(resend, 'Resend-Call muss stattfinden');
});

for (const [feld, meldung] of /** @type {const} */ ([
  ['telefon', 'Telefonnummer fehlt.'],
  ['anliegen', 'Anliegen / Thema fehlt.'],
  ['ausfuehrungsort', 'Ausführungsort fehlt.'],
])) {
  test(`requiredFields: ${feld} fehlt → 400 „${meldung}“, kein Versand`, async () => {
    const { res, resend } = await run(ohne(KONTAKT, feld));
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.ok, false);
    assert.equal(res.body.error, meldung);
    assert.equal(resend, null, 'kein Resend-Call');
  });

  test(`requiredFields: ${feld} nur Leerraum → 400 „${meldung}“`, async () => {
    const { res, resend } = await run({ ...KONTAKT, [feld]: '  \n\t ' });
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.error, meldung);
    assert.equal(resend, null);
  });
}

test('requiredFields: Feld ohne Label → Meldung nennt den Feldnamen', async () => {
  const h = createContactHandler({ ...KONFIG, extraFields: ['objekt'], requiredFields: ['objekt'], extraFieldLabels: {} });
  const { res } = await run({ name: 'A', email: 'a@example.org', message: 'x' }, h);
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.error, 'Pflichtfeld „objekt“ fehlt.');
});

test('requiredFields: Name wie eine Object-Eigenschaft (constructor) → Feldname in der Meldung', async () => {
  const h = createContactHandler({ ...KONFIG, requiredFields: ['constructor'], extraFieldLabels: {} });
  const { res } = await run(KONTAKT, h);
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.error, 'Pflichtfeld „constructor“ fehlt.');
});

test('requiredFields: festes Feld company ohne Label → „Unternehmen fehlt.“', async () => {
  const h = createContactHandler({ ...KONFIG, requiredFields: ['company'] });
  const { res } = await run(KONTAKT, h);
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.error, 'Unternehmen fehlt.');
});

test('requiredFields: nicht-String-Wert zählt als fehlend', async () => {
  const { res } = await run({ ...KONTAKT, anliegen: 42 });
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.error, 'Anliegen / Thema fehlt.');
});

test('ohne requiredFields: dieselbe unvollständige Anfrage → 200 (heutiges Verhalten)', async () => {
  const { res, resend } = await run({ name: 'Anna Test', email: 'anna@example.org', message: 'Hallo' }, ohneNeueOptionen);
  assert.equal(res.statusCode, 200);
  assert.ok(resend);
});

// ---------------------------------------------------------------------------
// Gegenproben: Rückruf und Empfehlung an demselben Endpoint unverändert
// ---------------------------------------------------------------------------

test('Gegenprobe Rückruf: ohne anliegen/ausfuehrungsort → 200 wie ohne requiredFields', async () => {
  const body = { formType: 'rueckruf', name: 'Anna Test', telefon: '+49 941 123456' };
  const mit = await run(body);
  const vorher = await run(body, ohneNeueOptionen);
  assert.equal(vorher.res.statusCode, 200, 'Vorbedingung: heute 200');
  assert.equal(mit.res.statusCode, 200);
  assert.deepEqual(mit.res.body, vorher.res.body);
  assert.ok(mit.resend, 'Rückruf wird versendet');
});

test('Gegenprobe Rückruf ohne Telefon: weiter die Rückruf-Meldung, nicht requiredFields', async () => {
  const body = { formType: 'rueckruf', name: 'Anna Test' };
  const mit = await run(body);
  const vorher = await run(body, ohneNeueOptionen);
  assert.equal(mit.res.statusCode, 400);
  assert.deepEqual(mit.res.body, vorher.res.body);
});

test('Gegenprobe Empfehlung: nur Name + E-Mail → 200 wie ohne requiredFields', async () => {
  const body = { formType: 'empfehlung', name: 'Bernd Test', email: 'bernd@example.org', empfohlen: 'Firma X' };
  const mit = await run(body);
  const vorher = await run(body, ohneNeueOptionen);
  assert.equal(vorher.res.statusCode, 200, 'Vorbedingung: heute 200');
  assert.equal(mit.res.statusCode, 200);
  assert.deepEqual(mit.res.body, vorher.res.body);
  assert.ok(mit.resend, 'Empfehlung wird versendet');
});

test('Gegenprobe Empfehlung ohne Kontaktweg: weiter die Empfehlungs-Meldung', async () => {
  const body = { formType: 'empfehlung', name: 'Bernd Test' };
  const mit = await run(body);
  const vorher = await run(body, ohneNeueOptionen);
  assert.equal(mit.res.statusCode, 400);
  assert.deepEqual(mit.res.body, vorher.res.body);
});

test('requiredFields greift auch bei unbekanntem formType (nur rueckruf/empfehlung sind ausgenommen)', async () => {
  const { res } = await run({ ...ohne(KONTAKT, 'ausfuehrungsort'), formType: 'irgendwas' });
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.error, 'Ausführungsort fehlt.');
});

// ---------------------------------------------------------------------------
// extraFieldLabels
// ---------------------------------------------------------------------------

test('extraFieldLabels: Anzeigenamen in Text- und HTML-Mail, Feldnamen nicht', async () => {
  const { resend } = await run(KONTAKT);
  assert.ok(resend.text.includes('Anliegen / Thema: Photovoltaik'), 'Label im Text');
  assert.ok(resend.text.includes('Ausführungsort: Regensburg'), 'Label im Text');
  assert.ok(!/^anliegen:/m.test(resend.text), 'roher Feldname nicht im Text');
  assert.ok(!/^ausfuehrungsort:/m.test(resend.text), 'roher Feldname nicht im Text');
  assert.ok(resend.html.includes('>Anliegen / Thema</td>'), 'Label im HTML');
  assert.ok(resend.html.includes('>Ausführungsort</td>'), 'Label im HTML');
  assert.ok(!resend.html.includes('>ausfuehrungsort</td>'), 'roher Feldname nicht im HTML');
});

test('extraFieldLabels: Label wird im HTML escaped', async () => {
  const h = createContactHandler({ ...KONFIG, requiredFields: [], extraFieldLabels: { anliegen: 'Thema <b>&</b>' } });
  const { resend } = await run(KONTAKT, h);
  assert.ok(resend.html.includes('>Thema &lt;b&gt;&amp;&lt;/b&gt;</td>'), 'Label escaped');
  assert.ok(resend.text.includes('Thema <b>&</b>: Photovoltaik'), 'Text roh');
});

test('ohne extraFieldLabels: roher Feldname bleibt (heutiges Verhalten)', async () => {
  const { resend } = await run(KONTAKT, ohneNeueOptionen);
  assert.ok(resend.text.includes('anliegen: Photovoltaik'));
  assert.ok(resend.text.includes('ausfuehrungsort: Regensburg'));
  assert.ok(resend.html.includes('>anliegen</td>'));
});

test('Bestätigungsmail bekommt Zusatzfelder weiter unter ihrem Feldnamen', async () => {
  /** @type {Record<string, string> | null} */
  let gesehen = null;
  const h = createContactHandler({
    ...KONFIG,
    confirmation: { subject: 'Danke', text: (f) => { gesehen = f; return 'Danke'; } },
  });
  await run(KONTAKT, h);
  assert.ok(gesehen);
  assert.equal(/** @type {any} */ (gesehen).ausfuehrungsort, 'Regensburg');
});

// ---------------------------------------------------------------------------
// Telefon + Zeitfenster im Kontaktformular (ohne formType)
// ---------------------------------------------------------------------------

test('Kontaktformular: telefon kommt in Mail (Text + HTML) und Telegram an', async () => {
  const { resend, telegram } = await run(KONTAKT);
  assert.ok(resend.text.includes('Telefon: +49 941 123456'));
  assert.ok(resend.html.includes('tel:+49 941 123456'));
  assert.ok(telegram, 'Telegram-Push muss raus');
  assert.ok(telegram.text.includes('941'), 'Telefon im Telegram-Push');
});

test('Kontaktformular: zeitfenster (ohne formType) kommt in Mail (Text + HTML) und Telegram an', async () => {
  const { resend, telegram } = await run(KONTAKT);
  assert.ok(resend.text.includes('Zeitfenster: werktags ab 17 Uhr'), 'Zeitfenster im Text');
  assert.ok(resend.html.includes('werktags ab 17 Uhr'), 'Zeitfenster im HTML');
  assert.ok(telegram.text.includes('werktags ab 17 Uhr'), 'Zeitfenster im Telegram-Push');
});

test('Kontaktformular: zeitfenster über 60 Zeichen → 400 (Formular braucht maxlength 60)', async () => {
  const { res } = await run({ ...KONTAKT, zeitfenster: 'x'.repeat(61) });
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.error, 'Zeitfenster ist zu lang.');
});

test('Kontaktformular: ungültige Telefonnummer → 400 wie bisher', async () => {
  const { res } = await run({ ...KONTAKT, telefon: 'ruf mich an' });
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.error, 'Telefonnummer ist ungültig.');
});
