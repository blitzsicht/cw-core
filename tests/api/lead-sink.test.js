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

test('4. Ad-Attribution → 📣-Zeile mit Quelle/Kampagne + gclid', async () => {
  const lead = {
    ...baseLead,
    attribution: { utm_source: 'google', utm_medium: 'cpc', utm_campaign: 'kopierer-leasen', gclid: 'Cj0abc123' },
  };
  const text = await captureTelegram(lead, { origin: 'https://test.de' });
  assert.ok(text.includes('📣'), 'Herkunfts-Zeile vorhanden');
  assert.ok(text.includes('google'), 'utm_source enthalten');
  assert.ok(text.includes('kopierer'), 'utm_campaign enthalten');
  assert.ok(text.includes('gclid'), 'Klick-ID-Marker enthalten');
});

test('5. ohne Attribution → keine 📣-Zeile (abwärtskompatibel)', async () => {
  const text = await captureTelegram(baseLead, { origin: 'https://test.de' });
  assert.ok(!text.includes('📣'), 'keine Herkunfts-Zeile ohne Attribution');
});

test('6. waitlist-Lead → 📋-Warteliste-Header + Studio-Zeile', async () => {
  const lead = { ...baseLead, kind: 'waitlist', studio: 'Victory Gym Neutraubling' };
  const text = await captureTelegram(lead, { origin: 'https://platzfrei.club' });
  assert.ok(text.includes('📋'), 'Warteliste-Emoji');
  assert.ok(text.includes('Warteliste'), 'Warteliste-Label');
  assert.ok(text.includes('Victory Gym Neutraubling'), 'Studio-Zeile enthalten');
  assert.ok(!text.includes('🆕'), 'kein Standard-Lead-Header');
});

test('7. Studio mit MarkdownV2-Sonderzeichen wird escaped', async () => {
  const lead = { ...baseLead, kind: 'waitlist', studio: 'Gym-Mitte (Neu!)' };
  const text = await captureTelegram(lead, { origin: 'https://platzfrei.club' });
  assert.ok(text.includes('Gym\\-Mitte'), 'Bindestrich escaped');
  assert.ok(text.includes('\\(Neu\\!\\)'), 'Klammern + Ausrufezeichen escaped');
});

test('8. studio ohne kind waitlist → Studio-Zeile trotzdem, Header bleibt 🆕', async () => {
  const lead = { ...baseLead, studio: 'Testtempel' };
  const text = await captureTelegram(lead, { origin: 'https://test.de' });
  assert.ok(text.includes('🆕'), 'Standard-Header');
  assert.ok(text.includes('Testtempel'), 'Studio-Zeile generisch verfügbar');
});
