#!/usr/bin/env node
/**
 * Tests für src/api/contact-handler.js — Bestätigungsmail, extraFields, requireConsent.
 * fetch ist gemockt (Turnstile, Resend, Telegram); kein Netzwerk.
 *
 * Ausführen: node scripts/contact-handler.test.mjs
 */
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createContactHandler } from '../src/api/contact-handler.js';

const realFetch = globalThis.fetch;
const realErr = console.error;
const realLog = console.log;
let resendCalls;
let resendFail;
let ipCounter = 0;

beforeEach(() => {
  resendCalls = [];
  resendFail = (n) => false;
  process.env.TURNSTILE_SECRET_KEY = 'ts';
  process.env.CONTACT_EMAIL = 'postfach@kunde.de';
  process.env.RESEND_API_KEY = 'SECRET-KEY';
  delete process.env.TELEGRAM_BOT_TOKEN;
  delete process.env.KV_REST_API_URL;
  delete process.env.UPSTASH_REDIS_REST_URL;
  console.error = () => {};
  console.log = () => {};
  globalThis.fetch = async (url, init) => {
    if (String(url).includes('turnstile')) return { ok: true, json: async () => ({ success: true }) };
    if (String(url).includes('api.resend.com')) {
      resendCalls.push(JSON.parse(init.body));
      const fail = resendFail(resendCalls.length);
      if (fail === 'throw') throw new Error('network down');
      return { ok: !fail, status: fail ? 500 : 200, text: async () => 'err' };
    }
    throw new Error('unexpected fetch ' + url);
  };
});
afterEach(() => {
  globalThis.fetch = realFetch;
  console.error = realErr;
  console.log = realLog;
});

async function call(config, body) {
  const handler = createContactHandler({
    allowedOrigins: ['https://kunde.de'], fromName: 'Kunde', subject: 'Anfrage', ...config,
  });
  const out = { status: 0, json: null };
  const res = { status(c) { out.status = c; return this; }, json(j) { out.json = j; return this; } };
  await handler({
    method: 'POST',
    headers: { origin: 'https://kunde.de', 'x-forwarded-for': `10.0.0.${++ipCounter}` },
    body: { 'cf-turnstile-response': 'tok', email: 'kunde@example.com', name: 'Max Muster', message: 'Hallo', ...body },
  }, res);
  return out;
}

const confirmation = { subject: 'Danke', text: (f) => `Hallo ${f.name}, Paket ${f.paket ?? '-'}` };

test('1: ohne neue Optionen genau 1 Resend-Aufruf, unveränderte Form', async () => {
  const r = await call({}, { consent: 'on', paket: 'X' });
  assert.equal(r.status, 200);
  assert.equal(resendCalls.length, 1);
  assert.equal(resendCalls[0].to, 'postfach@kunde.de');
  assert.equal(resendCalls[0].reply_to, 'kunde@example.com');
  assert.ok(!resendCalls[0].text.includes('paket'));
  assert.deepEqual(Object.keys(resendCalls[0]), ['from', 'to', 'reply_to', 'subject', 'html', 'text']);
});

test('2: mit confirmation genau 2 Aufrufe, zweiter an body.email, nur Text', async () => {
  const r = await call({ confirmation, extraFields: ['paket'] }, { paket: 'Pro' });
  assert.equal(r.status, 200);
  assert.equal(resendCalls.length, 2);
  const c = resendCalls[1];
  assert.equal(c.to, 'kunde@example.com');
  assert.equal(c.reply_to, 'postfach@kunde.de');
  assert.equal(c.subject, 'Danke');
  assert.equal(c.text, 'Hallo Max Muster, Paket Pro');
  assert.equal(c.html, undefined);
});

test('2b: confirmation.replyTo überschreibt den Default', async () => {
  await call({ confirmation: { ...confirmation, replyTo: 'bestellung@kunde.de' } }, {});
  assert.equal(resendCalls[1].reply_to, 'bestellung@kunde.de');
});

test('3: requireConsent ohne consent -> 400 und 0 Aufrufe', async () => {
  const r = await call({ requireConsent: true, confirmation }, {});
  assert.equal(r.status, 400);
  assert.equal(r.json.ok, false);
  assert.equal(resendCalls.length, 0);
});

test('3b: requireConsent akzeptiert on / true / "true", lehnt "false" ab', async () => {
  for (const c of ['on', true, 'true']) {
    assert.equal((await call({ requireConsent: true }, { consent: c })).status, 200);
  }
  assert.equal((await call({ requireConsent: true }, { consent: 'false' })).status, 400);
});

test('4: Honeypot mit confirmation -> 0 Aufrufe', async () => {
  const r = await call({ confirmation }, { botcheck: 'x' });
  assert.equal(r.status, 200);
  assert.equal(resendCalls.length, 0);
});

test('4b: Spam-Pfad mit confirmation -> 0 Aufrufe', async () => {
  const r = await call({ confirmation }, { message: 'buy bitcoin now' });
  assert.equal(r.status, 200);
  assert.equal(resendCalls.length, 0);
});

test('5: Bestätigung liefert Fehlerstatus -> trotzdem 200', async () => {
  resendFail = (n) => n === 2;
  const r = await call({ confirmation }, {});
  assert.equal(r.status, 200);
  assert.equal(resendCalls.length, 2);
});

test('5b: Bestätigung wirft (fetch/text-Funktion) -> trotzdem 200, kein Secret im Log', async () => {
  const logged = [];
  console.error = (...a) => logged.push(a.join(' '));
  resendFail = (n) => (n === 2 ? 'throw' : false);
  assert.equal((await call({ confirmation }, {})).status, 200);
  const r2 = await call({ confirmation: { subject: 's', text: () => { throw new Error('boom'); } } }, {});
  assert.equal(r2.status, 200);
  assert.ok(logged.length >= 2);
  assert.ok(!logged.join('\n').includes('SECRET-KEY'));
});

test('5c: scheitert die Postfach-Mail, keine Bestätigung', async () => {
  resendFail = () => true;
  const r = await call({ confirmation }, {});
  assert.equal(r.status, 400);
  assert.equal(resendCalls.length, 1);
});

test('6: extraFields: Whitelist, Reihenfolge, Trim, 2000-Limit, Rest ignoriert', async () => {
  await call({ extraFields: ['zweites', 'erstes'] }, {
    erstes: '  A  ', zweites: 'B'.repeat(2500), geheim: 'nicht', zweites_nicht: 'x',
  });
  const t = resendCalls[0].text;
  assert.ok(t.indexOf(`zweites: ${'B'.repeat(2000)}\n`) < t.indexOf('erstes: A\n'));
  assert.ok(!t.includes('B'.repeat(2001)));
  assert.ok(!t.includes('geheim'));
  assert.ok(resendCalls[0].html.includes('erstes'));
});

test('7: Spamprüfung bezieht extraFields ein', async () => {
  const r = await call({ extraFields: ['paket'], confirmation }, { paket: 'casino' });
  assert.equal(r.status, 200);
  assert.equal(resendCalls.length, 0);
  const r2 = await call({}, { paket: 'casino' });
  assert.equal(resendCalls.length, 1, 'ohne extraFields wird das Feld nicht geprüft (Abwärtskompatibilität)');
  assert.equal(r2.status, 200);
});
