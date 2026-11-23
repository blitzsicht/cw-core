// @ts-check
/**
 * Kontaktformular mit Telefon und Zusatzfeldern: ContactForm `phone` + `extraFields`
 * (nur `formType="contact"`).
 *
 * Lauf: `node --test tests/blocks/contactform-pflichtfelder.test.js`
 *
 * ANLASS (18.11.2026): Eine Kundin wünscht im Kontaktformular Telefon (Pflicht), ein
 * freies Feld für den besten Zeitraum für Anrufe (optional), Anliegen/Thema (Pflicht) und
 * Ausführungsort (Pflicht). Das Kundenrepo soll nur konfigurieren, die Felder kommen aus
 * cw-core.
 *
 * Geprüft wird GERENDERTES HTML (Astro-Container, s. `_render-astro.js`). Die Gegenprobe
 * vergleicht gegen Schnappschüsse, die VOR der Änderung vom Stand 41192995
 * (origin/release/cw-core) gerendert wurden: ohne die neuen Props muss das Markup Byte für
 * Byte gleich bleiben.
 */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderer, schliessen, normalize } from './_render-astro.js';
import { checkWebMcpForms, schemaFelder } from '../../src/integrations/ai-discovery/webmcp-form-check.js';

after(schliessen);

const FORM = 'src/components/forms/ContactForm.astro';
const BASIS = { actionUrl: '/api/contact', turnstileSiteKey: 'test-sitekey', fallbackEmail: 'info@example.org', siteName: 'Testkunde' };
const SNAP = JSON.parse(readFileSync(resolve(import.meta.dirname, 'fixtures/contactform-pflichtfelder-41192995.json'), 'utf-8'));

/** Die Konfiguration aus dem Anlass. */
const MIKA_FELDER = [
  { name: 'zeitfenster', label: 'Wann sind Sie am besten erreichbar?', type: 'text', maxlength: 60, placeholder: 'z. B. werktags ab 17 Uhr' },
  { name: 'anliegen', label: 'Anliegen / Thema', type: 'select', required: true, options: ['Elektroinstallation', 'Photovoltaik', 'Sonstiges'] },
  { name: 'ausfuehrungsort', label: 'Ausführungsort', type: 'text', required: true, autocomplete: 'address-level2' },
];

/** @param {Record<string, unknown>} props */
async function form(props) {
  const r = await renderer();
  return normalize(await r.render(FORM, { ...BASIS, ...props }));
}

/** Nur das <form>-Element. @param {string} html */
function formElement(html) {
  const m = /<form\b[\s\S]*?<\/form>/.exec(html);
  assert.ok(m, 'kein <form> im Markup');
  return m[0];
}

/**
 * Sichtbare Felder in Markup-Reihenfolge: input/textarea/select ohne type=hidden und ohne
 * die beiden Honeypots.
 * @param {string} html
 */
function sichtbareFelder(html) {
  return [...formElement(html).matchAll(/<(input|textarea|select)\b([^>]*)>/g)]
    .map(([, tag, attrs]) => ({
      tag,
      attrs,
      name: /\bname="([^"]*)"/.exec(attrs)?.[1] ?? '',
      type: /\btype="([^"]*)"/.exec(attrs)?.[1] ?? '',
      id: /\bid="([^"]*)"/.exec(attrs)?.[1] ?? '',
      required: /\srequired(?=[\s>=]|$)/.test(attrs),
    }))
    .filter((f) => f.type !== 'hidden' && f.name !== 'botcheck' && f.name !== 'url_honey');
}

/** @param {string} html @param {string} name */
function feld(html, name) {
  const f = sichtbareFelder(html).find((x) => x.name === name);
  assert.ok(f, `kein Feld name="${name}"`);
  return f;
}

/** Label-Inhalt zum Feld (über `for`). @param {string} html @param {string} id */
function label(html, id) {
  const m = new RegExp(`<label for="${id}">([\\s\\S]*?)</label>`).exec(formElement(html));
  assert.ok(m, `kein <label for="${id}">`);
  return m[1];
}

/** Optionen eines Selects als {value, text}. @param {string} html @param {string} name */
function optionen(html, name) {
  const m = new RegExp(`<select\\b[^>]*\\bname="${name}"[^>]*>([\\s\\S]*?)</select>`).exec(formElement(html));
  assert.ok(m, `kein <select name="${name}">`);
  return [...m[1].matchAll(/<option\b[^>]*value="([^"]*)"[^>]*>([^<]*)<\/option>/g)]
    .map(([, value, text]) => ({ value, text: text.trim() }));
}

// ---------------------------------------------------------------------------
// Gegenprobe: ohne neue Props Byte für Byte wie vorher
// ---------------------------------------------------------------------------

test('Vorbedingung: vier Schnappschüsse vorhanden und nicht leer', () => {
  assert.deepEqual(Object.keys(SNAP).sort(), ['contact', 'contact-ads', 'contact-agent', 'contact-default']);
  for (const [k, v] of Object.entries(SNAP)) assert.ok(v.length > 1000, `${k} zu kurz`);
});

const OHNE = {
  contact: { formType: 'contact' },
  'contact-default': {},
  'contact-agent': { formType: 'contact', agentTool: true },
  'contact-ads': { formType: 'contact', adsConsent: true },
};
for (const [fall, props] of Object.entries(OHNE)) {
  test(`Gegenprobe ${fall}: ohne phone/extraFields identisch zum Stand vor der Änderung`, async () => {
    assert.equal(await form(props), SNAP[fall]);
  });
  test(`Gegenprobe ${fall}: phone="off" und extraFields=[] ausdrücklich gesetzt, identisch`, async () => {
    assert.equal(await form({ ...props, phone: 'off', extraFields: [] }), SNAP[fall]);
  });
}

// ---------------------------------------------------------------------------
// Telefon
// ---------------------------------------------------------------------------

test('phone="required": telefon ist type="tel", autocomplete="tel", required, Pflicht-Stern im Label', async () => {
  const html = await form({ phone: 'required' });
  const tel = feld(html, 'telefon');
  assert.equal(tel.tag, 'input');
  assert.equal(tel.type, 'tel');
  assert.match(tel.attrs, /\bautocomplete="tel"/);
  assert.equal(tel.required, true);
  assert.equal(label(html, tel.id), 'Telefon <span aria-hidden="true">*</span>');
});

test('phone="optional": telefon ohne required, Label mit (optional)', async () => {
  const html = await form({ phone: 'optional' });
  const tel = feld(html, 'telefon');
  assert.equal(tel.type, 'tel');
  assert.equal(tel.required, false);
  assert.equal(label(html, tel.id), 'Telefon <span class="optional">(optional)</span>');
});

test('phone fehlt: kein Feld telefon (heutiges Verhalten)', async () => {
  assert.ok(!sichtbareFelder(await form({})).some((f) => f.name === 'telefon'));
});

// ---------------------------------------------------------------------------
// Zusatzfelder
// ---------------------------------------------------------------------------

test('Reihenfolge: Name, E-Mail, Telefon, Unternehmen, Zusatzfelder in Listenreihenfolge, Nachricht', async () => {
  const html = await form({ phone: 'required', extraFields: MIKA_FELDER });
  assert.deepEqual(
    sichtbareFelder(html).map((f) => f.name),
    ['name', 'email', 'telefon', 'company', 'zeitfenster', 'anliegen', 'ausfuehrungsort', 'message'],
  );
});

test('Pflichtfelder mit Mika-Konfiguration: name, email, telefon, anliegen, ausfuehrungsort, message', async () => {
  const html = await form({ phone: 'required', extraFields: MIKA_FELDER });
  assert.deepEqual(
    sichtbareFelder(html).filter((f) => f.required).map((f) => f.name),
    ['name', 'email', 'telefon', 'anliegen', 'ausfuehrungsort', 'message'],
  );
});

test('select mit required: leere erste Option „Bitte wählen“, danach die Optionen', async () => {
  const html = await form({ extraFields: MIKA_FELDER });
  const sel = feld(html, 'anliegen');
  assert.equal(sel.tag, 'select');
  assert.equal(sel.required, true);
  assert.deepEqual(optionen(html, 'anliegen'), [
    { value: '', text: 'Bitte wählen' },
    { value: 'Elektroinstallation', text: 'Elektroinstallation' },
    { value: 'Photovoltaik', text: 'Photovoltaik' },
    { value: 'Sonstiges', text: 'Sonstiges' },
  ]);
});

test('select ohne required: ebenfalls leere erste Option (sonst sendet der Browser stets die erste)', async () => {
  const html = await form({ extraFields: [{ name: 'thema', label: 'Thema', type: 'select', options: ['A', 'B'] }] });
  assert.equal(feld(html, 'thema').required, false);
  assert.deepEqual(optionen(html, 'thema').map((o) => o.value), ['', 'A', 'B']);
});

test('extraFields ohne required: kein required-Attribut, Label mit (optional)', async () => {
  const html = await form({ extraFields: MIKA_FELDER });
  const z = feld(html, 'zeitfenster');
  assert.equal(z.required, false);
  assert.equal(label(html, z.id), 'Wann sind Sie am besten erreichbar? <span class="optional">(optional)</span>');
});

test('extraFields mit required: required-Attribut und Pflicht-Stern wie bei den festen Feldern', async () => {
  const html = await form({ extraFields: MIKA_FELDER });
  const ort = feld(html, 'ausfuehrungsort');
  assert.equal(ort.required, true);
  assert.equal(label(html, ort.id), 'Ausführungsort <span aria-hidden="true">*</span>');
});

test('extraFields: type, maxlength, placeholder, autocomplete werden gesetzt; id cf-<name>', async () => {
  const html = await form({ extraFields: MIKA_FELDER });
  const z = feld(html, 'zeitfenster');
  assert.equal(z.tag, 'input');
  assert.equal(z.type, 'text');
  assert.equal(z.id, 'cf-zeitfenster');
  assert.match(z.attrs, /\bmaxlength="60"/);
  assert.match(z.attrs, /\bplaceholder="z\. B\. werktags ab 17 Uhr"/);
  assert.match(feld(html, 'ausfuehrungsort').attrs, /\bautocomplete="address-level2"/);
});

test('extraFields: textarea und tel', async () => {
  const html = await form({
    extraFields: [
      { name: 'details', label: 'Details', type: 'textarea', maxlength: 500 },
      { name: 'mobil', label: 'Mobil', type: 'tel', autocomplete: 'tel' },
    ],
  });
  const d = feld(html, 'details');
  assert.equal(d.tag, 'textarea');
  assert.match(d.attrs, /\bmaxlength="500"/);
  const m = feld(html, 'mobil');
  assert.equal(m.tag, 'input');
  assert.equal(m.type, 'tel');
});

test('phone und extraFields wirken nur bei formType="contact" (rueckruf unverändert)', async () => {
  const ohne = await form({ formType: 'rueckruf' });
  const mit = await form({ formType: 'rueckruf', phone: 'required', extraFields: MIKA_FELDER });
  assert.equal(mit, ohne);
});

// ---------------------------------------------------------------------------
// WebMCP (agentTool)
// ---------------------------------------------------------------------------

test('agentTool: telefon und alle Zusatzfelder tragen toolparamdescription', async () => {
  const html = await form({ agentTool: true, phone: 'required', extraFields: MIKA_FELDER });
  for (const name of ['telefon', 'zeitfenster', 'anliegen', 'ausfuehrungsort']) {
    assert.match(feld(html, name).attrs, /\btoolparamdescription="[^"]+"/, `${name} ohne toolparamdescription`);
  }
});

test('agentTool: eigene toolparamdescription aus extraFields wird übernommen', async () => {
  const html = await form({
    agentTool: true,
    extraFields: [{ name: 'ausfuehrungsort', label: 'Ausführungsort', type: 'text', required: true, toolparamdescription: 'Ort, an dem die Arbeiten ausgeführt werden sollen' }],
  });
  assert.match(feld(html, 'ausfuehrungsort').attrs, /\btoolparamdescription="Ort, an dem die Arbeiten ausgeführt werden sollen"/);
});

test('ohne agentTool: neue Felder ohne toolparamdescription', async () => {
  const html = await form({ phone: 'required', extraFields: MIKA_FELDER });
  for (const name of ['telefon', 'zeitfenster', 'anliegen', 'ausfuehrungsort']) {
    assert.doesNotMatch(feld(html, name).attrs, /toolparamdescription/, `${name} trägt toolparamdescription ohne agentTool`);
  }
});

test('agentTool: Guard checkWebMcpForms ohne Befund, Schema enthält telefon und Zusatzfelder', async () => {
  const html = await form({ agentTool: true, phone: 'required', extraFields: MIKA_FELDER });
  assert.deepEqual(checkWebMcpForms([{ page: '/kontakt', html }]), []);
  const innen = formElement(html).replace(/^<form\b[^>]*>/, '').replace(/<\/form>$/, '');
  const namen = schemaFelder(innen).map((f) => f.name);
  for (const name of ['telefon', 'zeitfenster', 'anliegen', 'ausfuehrungsort']) {
    assert.ok(namen.includes(name), `${name} fehlt im WebMCP-Schema (${namen.join(', ')})`);
  }
});
