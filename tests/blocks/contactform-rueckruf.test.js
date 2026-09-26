// @ts-check
/**
 * Rückruf-Wunsch: ContactForm `formType="rueckruf"`, `nextSteps` für alle formTypes,
 * DankePage mit `nextSteps`/`callbackNote`.
 *
 * Lauf: `node --test tests/blocks/contactform-rueckruf.test.js`
 *
 * ANLASS (26.09.2026): Audit über 12 Kundenseiten — 9 bieten weder Online-Termin noch
 * Rückruf-Zeitfenster. Eine Buchung ist ein bezahltes Add-on, also ein schlankes
 * Rückruf-Formular: Name + Telefon Pflicht, Zeitfenster und Anliegen optional.
 *
 * Geprüft wird GERENDERTES HTML (Astro-Container, s. `_render-astro.js`), nicht der
 * Quelltext — ein `includes('required')` im Quelltext wäre auch bei falscher
 * Verschachtelung grün. Die Gegenproben vergleichen gegen Schnappschüsse, die VOR der
 * Änderung aus v0.159.1 gerendert wurden (`fixtures/`).
 */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderer, schliessen, normalize } from './_render-astro.js';

after(schliessen);

const FORM = 'src/components/forms/ContactForm.astro';
const DANKE = 'src/components/blocks/DankePage.astro';
const BASIS = { actionUrl: '/api/contact', turnstileSiteKey: 'test-sitekey', fallbackEmail: 'info@example.org', siteName: 'Testkunde' };
const FIXTURES = resolve(import.meta.dirname, 'fixtures');

/** @param {Record<string, unknown>} props */
async function form(props) {
  const r = await renderer();
  return normalize(await r.render(FORM, { ...BASIS, ...props }));
}

/** Nur das <form>-Element (ohne Erfolgs-/Fehlerblock). @param {string} html */
function formElement(html) {
  const m = /<form\b[\s\S]*?<\/form>/.exec(html);
  assert.ok(m, 'kein <form> im Markup');
  return m[0];
}

/** @param {string} html */
function successBlock(html) {
  const m = /<div class="form-success"[\s\S]*?<\/div>(?=\s*<div class="form-error")/.exec(html);
  assert.ok(m, 'kein .form-success-Block');
  return m[0];
}

/**
 * Sichtbare Felder: input/textarea/select ohne type=hidden und ohne die beiden Honeypots.
 * @param {string} html
 */
function sichtbareFelder(html) {
  return [...formElement(html).matchAll(/<(input|textarea|select)\b([^>]*)>/g)]
    .map(([, tag, attrs]) => ({
      tag,
      attrs,
      name: /\bname="([^"]*)"/.exec(attrs)?.[1] ?? '',
      type: /\btype="([^"]*)"/.exec(attrs)?.[1] ?? '',
      required: /\srequired(?=[\s>=]|$)/.test(attrs),
    }))
    .filter((f) => f.type !== 'hidden' && f.name !== 'botcheck' && f.name !== 'url_honey');
}

/** @param {string} html */
const pflichtNamen = (html) => sichtbareFelder(html).filter((f) => f.required).map((f) => f.name);

// ---------------------------------------------------------------------------
// Rückruf-Formular
// ---------------------------------------------------------------------------

test('rueckruf: genau zwei Pflichtfelder sichtbar — Name und Telefon, E-Mail nicht Pflicht', async () => {
  const html = await form({ formType: 'rueckruf' });
  assert.deepEqual(pflichtNamen(html), ['name', 'telefon']);
  const email = sichtbareFelder(html).find((f) => f.name === 'email');
  assert.ok(!email || !email.required, 'E-Mail darf beim Rückruf nicht Pflicht sein');
});

test('rueckruf: Telefon ist type="tel", autocomplete="tel", required', async () => {
  const tel = sichtbareFelder(await form({ formType: 'rueckruf' })).find((f) => f.name === 'telefon');
  assert.ok(tel, 'kein Feld name="telefon"');
  assert.equal(tel.tag, 'input');
  assert.equal(tel.type, 'tel');
  assert.match(tel.attrs, /\bautocomplete="tel"/);
  assert.equal(tel.required, true);
});

test('rueckruf: Anliegen ist eine optionale Textarea', async () => {
  const felder = sichtbareFelder(await form({ formType: 'rueckruf' }));
  const anliegen = felder.find((f) => f.tag === 'textarea');
  assert.ok(anliegen, 'keine Textarea für das Anliegen');
  assert.equal(anliegen.required, false);
});

test('rueckruf: ohne callbackSlots greifen die drei Standard-Zeitfenster, erste Option „egal“ mit leerem Wert', async () => {
  const f = formElement(await form({ formType: 'rueckruf' }));
  const select = /<select\b[^>]*\bname="zeitfenster"[^>]*>([\s\S]*?)<\/select>/.exec(f);
  assert.ok(select, 'kein <select name="zeitfenster">');
  assert.doesNotMatch(select[0].slice(0, select[0].indexOf('>')), /\srequired/, 'Zeitfenster ist optional');
  const optionen = [...select[1].matchAll(/<option\b[^>]*value="([^"]*)"[^>]*>([^<]*)<\/option>/g)]
    .map(([, value, text]) => ({ value, text: text.trim() }));
  assert.deepEqual(optionen, [
    { value: '', text: 'egal' },
    { value: 'vormittags (8–12 Uhr)', text: 'vormittags (8–12 Uhr)' },
    { value: 'nachmittags (12–17 Uhr)', text: 'nachmittags (12–17 Uhr)' },
    { value: 'abends (17–19 Uhr)', text: 'abends (17–19 Uhr)' },
  ]);
});

test('rueckruf: callbackSlots-Prop ersetzt die Standard-Zeitfenster im select', async () => {
  const f = formElement(await form({ formType: 'rueckruf', callbackSlots: ['Mo–Fr 7–9 Uhr', 'Sa vormittags'] }));
  const select = /<select\b[^>]*\bname="zeitfenster"[^>]*>([\s\S]*?)<\/select>/.exec(f);
  assert.ok(select);
  const werte = [...select[1].matchAll(/<option\b[^>]*value="([^"]*)"/g)].map((m) => m[1]);
  assert.deepEqual(werte, ['', 'Mo–Fr 7–9 Uhr', 'Sa vormittags']);
  assert.doesNotMatch(select[1], /vormittags \(8–12 Uhr\)/, 'Default darf nicht zusätzlich erscheinen');
});

test('rueckruf: Honeypots, Turnstile, Tracking-Felder und formType-Kennung sind da', async () => {
  const f = formElement(await form({ formType: 'rueckruf' }));
  assert.match(f, /<input type="checkbox" name="botcheck"/);
  assert.match(f, /<input type="text" name="url_honey"/);
  assert.match(f, /<div class="cf-turnstile" data-sitekey="test-sitekey"/);
  for (const k of ['gclid', 'utm_source', 'utm_campaign']) {
    assert.match(f, new RegExp(`<input type="hidden" name="${k}" data-attribution="${k}"`), `Tracking-Feld ${k} fehlt`);
  }
  assert.match(f, /data-form-type="rueckruf"/, 'Plausible liest den Typ aus data-form-type');
  assert.match(f, /<input type="hidden" name="formType" value="rueckruf"/, 'der Handler braucht den Typ im Body');
});

test('rueckruf: Consent-Checkbox erscheint mit adsConsent wie bei contact', async () => {
  const f = formElement(await form({ formType: 'rueckruf', adsConsent: true }));
  assert.match(f, /name="marketing_consent"/);
  assert.match(f, /name="marketing_consent_version" value="ads-consent-v1"/);
});

test('rueckruf: Erfolgsblock nennt das Zeitfenster', async () => {
  const s = successBlock(await form({ formType: 'rueckruf' }));
  assert.match(s, /<p>Wir rufen Sie im gewünschten Zeitfenster zurück, spätestens am nächsten Werktag\.<\/p>/);
  assert.doesNotMatch(s, /<ol\b/, 'ohne nextSteps keine Liste');
});

// ---------------------------------------------------------------------------
// nextSteps im Erfolgsblock (alle formTypes)
// ---------------------------------------------------------------------------

test('nextSteps: erscheint als <ol> unter dem Text, auch bei contact', async () => {
  const s = successBlock(await form({ formType: 'contact', nextSteps: ['Wir lesen Ihre Nachricht.', 'Wir rufen an.'] }));
  const p = s.indexOf('<p>Wir melden uns');
  const ol = s.indexOf('<ol');
  assert.ok(p > -1 && ol > p, 'die Liste steht unter dem Text');
  const punkte = [...s.matchAll(/<li>([^<]*)<\/li>/g)].map((m) => m[1]);
  assert.deepEqual(punkte, ['Wir lesen Ihre Nachricht.', 'Wir rufen an.']);
});

test('nextSteps: leeres Array rendert keine Liste', async () => {
  assert.doesNotMatch(successBlock(await form({ formType: 'contact', nextSteps: [] })), /<ol\b/);
});

// ---------------------------------------------------------------------------
// Gegenproben: bestehende formTypes unverändert
// ---------------------------------------------------------------------------

test('Gegenprobe contact: Name*, E-Mail*, Nachricht* bleiben Pflicht, kein Telefon', async () => {
  const html = await form({ formType: 'contact' });
  assert.deepEqual(pflichtNamen(html), ['name', 'email', 'message']);
  assert.ok(!sichtbareFelder(html).some((f) => f.name === 'telefon'));
});

const SNAP = JSON.parse(readFileSync(resolve(FIXTURES, 'contactform-v0.159.1.json'), 'utf-8'));
for (const formType of ['contact', 'audit', 'bewerbung', 'waitlist', 'updates']) {
  test(`Gegenprobe ${formType}: Markup ohne neue Props identisch zu v0.159.1`, async () => {
    assert.equal(await form({ formType }), SNAP[formType]);
  });
}

// ---------------------------------------------------------------------------
// DankePage
// ---------------------------------------------------------------------------

const DANKE_SNAP = readFileSync(resolve(FIXTURES, 'dankepage-v0.159.1.html'), 'utf-8')
  .split('\n<!-- ===== eigene Props ===== -->\n')
  .map((s) => s.replace(/\n$/, ''));

/** @param {Record<string, unknown>} props */
async function danke(props) {
  const r = await renderer();
  return normalize(await r.render(DANKE, props));
}

test('DankePage ohne neue Props: Markup identisch zu v0.159.1 (Default-Props)', async () => {
  assert.equal(await danke({}), DANKE_SNAP[0]);
});

test('DankePage ohne neue Props: Markup identisch zu v0.159.1 (eigene Texte)', async () => {
  assert.equal(
    await danke({ heading: 'Danke!', message: 'Wir melden uns.', ctaLabel: 'Zurück', ctaHref: '/kontakt' }),
    DANKE_SNAP[1],
  );
});

test('DankePage: nextSteps als <ol> unter der Nachricht, callbackNote als <p>', async () => {
  const html = await danke({ nextSteps: ['Eins', 'Zwei'], callbackNote: 'Wir rufen Sie heute noch an.' });
  const msg = html.indexOf('class="danke-message"');
  const ol = html.indexOf('<ol');
  assert.ok(msg > -1 && ol > msg, 'Liste steht unter der Nachricht');
  assert.deepEqual([...html.matchAll(/<li>([^<]*)<\/li>/g)].map((m) => m[1]), ['Eins', 'Zwei']);
  assert.match(html, /<p class="danke-callback-note">Wir rufen Sie heute noch an\.<\/p>/);
  assert.ok(html.indexOf('danke-callback-note') < html.indexOf('class="danke-cta"'), 'Hinweis vor dem CTA');
});
