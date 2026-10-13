// @ts-check
/**
 * Antwortfrist nur mit Angabe (blitzsicht-ops#950, v0.172.0).
 *
 * Lauf: `node --test tests/blocks/antwortfrist.test.js`
 *
 * ANLASS (Messung 13.10.2026): 10 von 15 Live-Seiten versprachen „Wir melden uns innerhalb
 * von 24 Stunden bei Ihnen.“ Die Frist stammte aus drei cw-core-Bausteinen — ContactForm
 * (formType 'contact'), DankePage (Default `message`) und der Bestätigungsmail aus
 * buildBriefingEmail — und war bei keinem Kunden belegt.
 *
 * Geprüft wird GERENDERTES HTML (Astro-Container) bzw. der fertige Mail-Body, und dieselben
 * Ausgaben laufen anschließend durch den echten Guard `checkAntwortfrist`: die Bausteine und
 * der Guard müssen sich einig sein, sonst meldete der Guard die eigene Ausgabe.
 */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { renderer, schliessen, normalize } from './_render-astro.js';
import { buildBriefingEmail } from '../../src/utils/forms/build-briefing-email.js';
import { checkAntwortfrist } from '../../src/integrations/ai-discovery/antwortfrist-check.js';
import { antwortBestaetigung, antwortZeitraum } from '../../src/utils/antwortfrist.js';

after(schliessen);

const FORM = 'src/components/forms/ContactForm.astro';
const DANKE = 'src/components/blocks/DankePage.astro';
const BASIS = { actionUrl: '/api/contact', turnstileSiteKey: 'test-sitekey', fallbackEmail: 'info@example.org', siteName: 'Testkunde' };

/** @param {Record<string, unknown>} props */
async function form(props) {
  const r = await renderer();
  return normalize(await r.render(FORM, { ...BASIS, formType: 'contact', ...props }));
}
/** @param {Record<string, unknown>} props */
async function danke(props) {
  const r = await renderer();
  return normalize(await r.render(DANKE, props));
}
/** @param {string | undefined} antwortfrist */
function mail(antwortfrist) {
  return buildBriefingEmail({
    customerName: 'Testkunde',
    payload: { firma: 'Test GmbH' },
    sections: [{ id: 's', emoji: '•', title: 'Firma', fields: [{ id: 'firma', label: 'Firma', required: true }] }],
    submissionUrl: 'https://example.org/onboarding',
    requiredFieldIds: ['firma'],
    ...(antwortfrist === undefined ? {} : { antwortfrist }),
  }).confirmation;
}

/** @param {string} html */
function successBlock(html) {
  const m = /<div class="form-success"[\s\S]*?<\/div>(?=\s*<div class="form-error")/.exec(html);
  assert.ok(m, 'kein .form-success-Block');
  return m[0];
}

const FRIST_ZAHL_RE = /\b24\b|Stunden|innerhalb/;

/** Nur der Nachrichtenabsatz — das SVG-Häkchen trägt `viewBox="0 0 24 24"`. @param {string} html */
function dankeText(html) {
  const m = /<p class="danke-message">[^<]*<\/p>/.exec(html);
  assert.ok(m, 'kein .danke-message-Absatz');
  return m[0];
}

// ---------------------------------------------------------------------------
// 1. Ohne Angabe: keine Frist an allen drei Stellen
// ---------------------------------------------------------------------------

test('ohne Angabe: ContactForm (contact) nennt keine Frist, sondern „so bald wie möglich“', async () => {
  const s = successBlock(await form({}));
  assert.doesNotMatch(s, FRIST_ZAHL_RE);
  assert.match(s, /<p>Ihre Anfrage ist angekommen\. Wir melden uns so bald wie möglich bei Ihnen\.<\/p>/);
});

test('ohne Angabe: DankePage-Default nennt keine Frist', async () => {
  const html = await danke({});
  assert.doesNotMatch(dankeText(html), FRIST_ZAHL_RE);
  assert.match(html, /<p class="danke-message">Ihre Anfrage ist angekommen\. Wir melden uns so bald wie möglich bei Ihnen\.<\/p>/);
});

test('ohne Angabe: Bestätigungsmail (HTML + Text) nennt keine Frist', () => {
  const m = mail(undefined);
  assert.doesNotMatch(m.html, /innerhalb|Stunden|>24</);
  assert.doesNotMatch(m.text, FRIST_ZAHL_RE);
  assert.match(m.text, /melden uns so bald wie möglich bei Ihnen\./);
  assert.match(m.html, /melden uns so bald wie möglich bei Ihnen/);
});

test('leere oder nur aus Leerzeichen bestehende Angabe gilt als nicht gesetzt', async () => {
  for (const leer of ['', '   ']) {
    assert.doesNotMatch(successBlock(await form({ antwortfrist: leer })), FRIST_ZAHL_RE);
    assert.doesNotMatch(dankeText(await danke({ antwortfrist: leer })), FRIST_ZAHL_RE);
    assert.doesNotMatch(mail(leer).text, FRIST_ZAHL_RE);
  }
});

// ---------------------------------------------------------------------------
// 2. Mit Angabe: dieselbe Frist an allen drei Stellen
// ---------------------------------------------------------------------------

test('mit Angabe „24 Stunden“: Frist in ContactForm, DankePage und Mail', async () => {
  const satz = 'Ihre Anfrage ist angekommen. Wir melden uns innerhalb von 24 Stunden bei Ihnen.';
  assert.match(successBlock(await form({ antwortfrist: '24 Stunden' })), new RegExp(`<p>${satz.replace(/\./g, '\\.')}</p>`));
  assert.match(await danke({ antwortfrist: '24 Stunden' }), new RegExp(`<p class="danke-message">${satz.replace(/\./g, '\\.')}</p>`));
  const m = mail('24 Stunden');
  assert.match(m.html, /melden uns <strong>innerhalb von 24 Stunden<\/strong> bei Ihnen/);
  assert.match(m.text, /melden uns innerhalb von 24 Stunden bei Ihnen\./);
});

test('mit anderer Angabe „2 Werktagen“: genau diese Frist, keine 24', async () => {
  assert.match(successBlock(await form({ antwortfrist: '2 Werktagen' })), /innerhalb von 2 Werktagen bei Ihnen/);
  assert.match(await danke({ antwortfrist: '2 Werktagen' }), /innerhalb von 2 Werktagen bei Ihnen/);
  assert.match(mail('2 Werktagen').text, /innerhalb von 2 Werktagen bei Ihnen/);
  assert.doesNotMatch(mail('2 Werktagen').text, /\b24\b/);
});

test('eigener DankePage-Text gewinnt über die Angabe (Mika/Zink übergeben `message`)', async () => {
  const html = await danke({ message: 'Eigener Text.', antwortfrist: '24 Stunden' });
  assert.match(html, /<p class="danke-message">Eigener Text\.<\/p>/);
  assert.doesNotMatch(html, /innerhalb/);
});

test('Angabe wird in der Mail HTML-escaped', () => {
  assert.match(mail('<b>1 Tag</b>').html, /&lt;b&gt;1 Tag&lt;\/b&gt;/);
});

test('eine Quelle: alle drei Stellen nutzen antwortZeitraum()', async () => {
  for (const f of [undefined, '24 Stunden', '3 Werktagen']) {
    assert.ok(successBlock(await form(f ? { antwortfrist: f } : {})).includes(antwortBestaetigung(f)));
    assert.ok((await danke(f ? { antwortfrist: f } : {})).includes(antwortBestaetigung(f)));
    assert.ok(mail(f).text.includes(`melden uns ${antwortZeitraum(f)} bei Ihnen.`));
  }
});

// ---------------------------------------------------------------------------
// 3. Bausteine und Guard sind sich einig
// ---------------------------------------------------------------------------

test('Guard: Ausgabe der Bausteine ohne Angabe → keine Warnung', async () => {
  assert.deepEqual(checkAntwortfrist(await form({}), 'kontakt/index.html', undefined), []);
  assert.deepEqual(checkAntwortfrist(await danke({}), 'danke/index.html', undefined), []);
  assert.deepEqual(checkAntwortfrist(mail(undefined).html, 'mail', undefined), []);
});

test('Guard: Ausgabe der Bausteine mit Angabe → keine Warnung', async () => {
  assert.deepEqual(checkAntwortfrist(await form({ antwortfrist: '24 Stunden' }), 'kontakt/index.html', '24 Stunden'), []);
  assert.deepEqual(checkAntwortfrist(await danke({ antwortfrist: '24 Stunden' }), 'danke/index.html', '24 Stunden'), []);
  assert.deepEqual(checkAntwortfrist(mail('24 Stunden').html, 'mail', '24 Stunden'), []);
});

test('Guard-Gegenprobe: Frist per Prop, aber siteData.antwortfrist fehlt → Warnung', async () => {
  const issues = checkAntwortfrist(await form({ antwortfrist: '24 Stunden' }), 'kontakt/index.html', undefined);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].type, 'frist_ohne_angabe');
});

test('Guard-Gegenprobe: der alte v0.171.0-Satz hart im HTML, ohne Angabe → Warnung', async () => {
  const alt = (await danke({ message: 'Wir melden uns innerhalb von 24 Stunden bei Ihnen.' }));
  const issues = checkAntwortfrist(alt, 'danke/index.html', undefined);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].type, 'frist_ohne_angabe');
  assert.match(issues[0].details, /danke\/index\.html/);
});
