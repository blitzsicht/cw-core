// @ts-check
/**
 * ContactForm `formType="empfehlung"` + Byte-Gleichheit aller bestehenden formTypes.
 *
 * Lauf: `node --test tests/blocks/contactform-empfehlung.test.js`
 *
 * Datenschutz-Vorgabe: keine Pflichtfelder zu Dritten. Über die empfohlene Person gibt
 * es genau EIN freiwilliges Feld (Vorname oder Firma, max. 80 Zeichen) — keine Nummer,
 * keine Adresse. Pflicht ist nur der eigene Name; E-Mail ODER Telefon muss da sein,
 * das prüft der Client im Submit-Handler und der Server im contact-handler.
 *
 * Gegenprobe: die sechs bestehenden formTypes rendern Byte für Byte wie vorher.
 * contact/audit/bewerbung/waitlist/updates gegen den v0.159.1-Schnappschuss,
 * rueckruf gegen einen Schnappschuss, der auf 54746b39 VOR dieser Änderung
 * gerendert wurde.
 */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderer, schliessen, normalize } from './_render-astro.js';

after(schliessen);

const FORM = 'src/components/forms/ContactForm.astro';
const BASIS = { actionUrl: '/api/contact', turnstileSiteKey: 'test-sitekey', fallbackEmail: 'info@example.org', siteName: 'Testkunde' };
const FIXTURES = resolve(import.meta.dirname, 'fixtures');

/** @param {Record<string, unknown>} props */
async function form(props) {
  const r = await renderer();
  return normalize(await r.render(FORM, { ...BASIS, ...props }));
}

/** @param {string} html */
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

/** @param {string} html */
function sichtbareFelder(html) {
  return [...formElement(html).matchAll(/<(input|textarea|select)\b([^>]*)>/g)]
    .map(([, tag, attrs]) => ({
      tag,
      attrs,
      id: /\bid="([^"]*)"/.exec(attrs)?.[1] ?? '',
      name: /\bname="([^"]*)"/.exec(attrs)?.[1] ?? '',
      type: /\btype="([^"]*)"/.exec(attrs)?.[1] ?? '',
      required: /\srequired(?=[\s>=]|$)/.test(attrs),
    }))
    .filter((f) => f.type !== 'hidden' && f.name !== 'botcheck' && f.name !== 'url_honey');
}

/** Sichtbarer Text ohne Tags, Leerraum zusammengezogen. @param {string} html */
const text = (html) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

// ---------------------------------------------------------------------------
// Empfehlungs-Formular
// ---------------------------------------------------------------------------

test('empfehlung: genau ein Pflichtfeld im HTML — der eigene Name', async () => {
  const felder = sichtbareFelder(await form({ formType: 'empfehlung' }));
  assert.deepEqual(felder.filter((f) => f.required).map((f) => f.name), ['name']);
});

test('empfehlung: E-Mail und Telefon sind da, beide freiwillig (mindestens eins prüft das Skript)', async () => {
  const felder = sichtbareFelder(await form({ formType: 'empfehlung' }));
  const email = felder.find((f) => f.name === 'email');
  const tel = felder.find((f) => f.name === 'telefon');
  assert.ok(email && tel, 'Felder email und telefon');
  assert.equal(email.type, 'email');
  assert.equal(tel.type, 'tel');
  assert.equal(email.required, false);
  assert.equal(tel.required, false);
  assert.match(email.attrs, /\bautocomplete="email"/);
  assert.match(tel.attrs, /\bautocomplete="tel"/);
});

test('empfehlung: Hinweis „E-Mail oder Telefon“ ist per aria-describedby an beiden Feldern', async () => {
  const html = await form({ formType: 'empfehlung' });
  const f = formElement(html);
  const hinweis = /<p\b[^>]*\bid="([^"]+)"[^>]*>([^<]*)<\/p>/.exec(f.slice(f.indexOf('cf-email') - 400));
  assert.ok(hinweis, 'Hinweis-Absatz mit id');
  assert.match(hinweis[2], /E-Mail oder Telefon/);
  for (const name of ['email', 'telefon']) {
    const feld = sichtbareFelder(html).find((x) => x.name === name);
    assert.match(/** @type {any} */ (feld).attrs, new RegExp(`aria-describedby="[^"]*\\b${hinweis[1]}\\b`), `${name} verweist auf den Hinweis`);
  }
});

test('empfehlung: „Wen möchten Sie empfehlen?“ ist optional, maxlength=80, mit Einverständnis-Hinweis', async () => {
  const html = await form({ formType: 'empfehlung' });
  const feld = sichtbareFelder(html).find((f) => f.name === 'empfohlen');
  assert.ok(feld, 'kein Feld name="empfohlen"');
  assert.equal(feld.tag, 'input');
  assert.equal(feld.type, 'text');
  assert.equal(feld.required, false);
  assert.match(feld.attrs, /\smaxlength="80"/);
  assert.match(feld.attrs, /\sautocomplete="off"/, 'Browser soll keine eigenen Daten vorschlagen');
  const label = new RegExp(`<label for="${feld.id}">([\\s\\S]*?)</label>`).exec(html);
  assert.ok(label, 'Label am Feld');
  assert.match(text(label[1]), /^Wen möchten Sie empfehlen\? \(optional, nur Vorname oder Firma\)$/);
  const describedby = /aria-describedby="([^"]+)"/.exec(feld.attrs)?.[1];
  assert.ok(describedby, 'Hinweis per aria-describedby verknüpft');
  assert.match(html, new RegExp(`<p\\b[^>]*id="${describedby}"[^>]*>Bitte nur mit Einverständnis der Person\\.</p>`));
});

test('empfehlung: nur EIN Feld über Dritte — kein Telefon, keine Adresse der empfohlenen Person', async () => {
  const namen = sichtbareFelder(await form({ formType: 'empfehlung' })).map((f) => f.name);
  assert.deepEqual(namen, ['name', 'email', 'telefon', 'empfohlen', 'message']);
});

test('empfehlung: Nachricht ist eine optionale Textarea', async () => {
  const msg = sichtbareFelder(await form({ formType: 'empfehlung' })).find((f) => f.name === 'message');
  assert.ok(msg);
  assert.equal(msg.tag, 'textarea');
  assert.equal(msg.required, false);
});

test('empfehlung: Honeypots, Turnstile, Tracking-Felder, formType-Kennung', async () => {
  const f = formElement(await form({ formType: 'empfehlung' }));
  assert.match(f, /<input type="checkbox" name="botcheck"/);
  assert.match(f, /<input type="text" name="url_honey"/);
  assert.match(f, /<div class="cf-turnstile" data-sitekey="test-sitekey"/);
  assert.match(f, /<input type="hidden" name="gclid" data-attribution="gclid"/);
  assert.match(f, /data-form-type="empfehlung"/);
  assert.match(f, /<input type="hidden" name="formType" value="empfehlung"/);
});

test('empfehlung: Erfolgstext „Danke für Ihre Empfehlung! Wir melden uns bei Ihnen.“', async () => {
  const s = successBlock(await form({ formType: 'empfehlung' }));
  assert.equal(text(s), '✓ Danke für Ihre Empfehlung! Wir melden uns bei Ihnen.');
});

test('empfehlung: nextSteps wirken wie bei allen formTypes', async () => {
  const s = successBlock(await form({ formType: 'empfehlung', nextSteps: ['A', 'B'] }));
  assert.deepEqual([...s.matchAll(/<li>([^<]*)<\/li>/g)].map((m) => m[1]), ['A', 'B']);
});

test('empfehlung im Agent-Modus: Werkzeugname und Parameterbeschreibungen', async () => {
  const f = formElement(await form({ formType: 'empfehlung', agentTool: true }));
  assert.match(f, /toolname="empfehlung_abgeben"/);
  assert.match(f, /name="empfohlen"[^>]*toolparamdescription="[^"]+"/);
});

// ---------------------------------------------------------------------------
// Gegenproben: sechs bestehende formTypes Byte für Byte unverändert
// ---------------------------------------------------------------------------

const SNAP = {
  ...JSON.parse(readFileSync(resolve(FIXTURES, 'contactform-v0.159.1.json'), 'utf-8')),
  ...JSON.parse(readFileSync(resolve(FIXTURES, 'contactform-rueckruf-54746b39.json'), 'utf-8')),
};

test('Vorbedingung: sechs Schnappschüsse vorhanden und nicht leer', () => {
  assert.deepEqual(Object.keys(SNAP).sort(), ['audit', 'bewerbung', 'contact', 'rueckruf', 'updates', 'waitlist']);
  for (const [k, v] of Object.entries(SNAP)) assert.ok(v.length > 1000, `${k} zu kurz`);
});

for (const formType of ['contact', 'audit', 'bewerbung', 'waitlist', 'updates', 'rueckruf']) {
  test(`Gegenprobe ${formType}: Markup identisch zum Schnappschuss vor der Änderung`, async () => {
    assert.equal(await form({ formType }), SNAP[formType]);
  });
}
