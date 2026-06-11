// Tests für emitLead — insb. die deliveryError-Fehlmeldung (Env fehlt → Lead trotzdem
// melden + alarmieren). `node --test`. Stubt global.fetch, um den Telegram-Body zu prüfen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emitLead } from '../../src/api/lead-sink.js';

/** Fängt den an Telegram gesendeten Text ab. */
async function captureTelegram(lead, ctx) {
  process.env.TELEGRAM_BOT_TOKEN = 'test-token';
  process.env.TELEGRAM_CHAT_ID = '123';
  let captured = null;
  const orig = global.fetch;
  global.fetch = async (_url, opts) => {
    captured = JSON.parse(opts.body).text;
    return { ok: true };
  };
  try {
    await emitLead(lead, ctx);
  } finally {
    global.fetch = orig;
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_CHAT_ID;
  }
  return captured;
}

const baseLead = { project: 'customer-test', name: 'Max', email: 'max@example.com', message: 'Hallo', kind: 'contact-form' };

// Hinweis: Telegram-MarkdownV2 escaped . _ - etc. → Substring-Checks auf escape-freie Teile.
test('1. normaler Lead → 🆕-Header, keine Warnung', async () => {
  const text = await captureTelegram(baseLead, { origin: 'https://test.de' });
  assert.ok(text.includes('🆕'), 'Lead-Emoji');
  assert.ok(text.includes('Lead'), 'Lead-Header');
  assert.ok(!text.includes('ZUSTELLUNG FEHLGESCHLAGEN'), 'keine Warnung');
  assert.ok(text.includes('max@example'), 'Email enthalten');
});

test('2. deliveryError → Warn-Header + Lead bleibt enthalten', async () => {
  const text = await captureTelegram(baseLead, { origin: 'https://test.de', deliveryError: 'RESEND_API_KEY nicht in Vercel-Env gesetzt' });
  assert.ok(text.includes('ZUSTELLUNG FEHLGESCHLAGEN'), 'Warn-Header');
  assert.ok(text.includes('RESEND'), 'Grund genannt');
  assert.ok(text.includes('max@example'), 'Lead-Daten bleiben → kein Verlust');
  assert.ok(!text.includes('🆕'), 'kein normaler Lead-Header');
});

test('3. ohne TELEGRAM-Env → kein fetch, kein Throw', async () => {
  delete process.env.TELEGRAM_BOT_TOKEN;
  delete process.env.TELEGRAM_CHAT_ID;
  let called = false;
  const orig = global.fetch;
  global.fetch = async () => { called = true; return { ok: true }; };
  try {
    await emitLead(baseLead, { deliveryError: 'X' });
  } finally {
    global.fetch = orig;
  }
  assert.equal(called, false);
});
