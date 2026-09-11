import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkWebMcpForms, schemaFelder } from './webmcp-form-check.js';

// Das ContactForm-Markup (contact-Variante, mit Ads-Consent), naiv um toolname und
// tooldescription ergänzt. Genau so am 11.09.2026 in Chrome 153 geladen; das Schema
// aus CDP `WebMCP.toolsAdded` hatte die Parameter
//   botcheck, url_honey, name, email, company, message, marketing_consent.
const NAIV =
  '<form class="contact-form" action="/api/contact" method="POST" data-web3form ' +
  'toolname="kontakt_anfrage" tooldescription="Kontaktanfrage an Musterfirma vorbereiten.">' +
  '<input type="checkbox" name="botcheck" style="display:none" tabindex="-1" autocomplete="off" aria-hidden="true" />' +
  '<input type="text" name="url_honey" tabindex="-1" autocomplete="off" style="position:absolute;left:-9999px;opacity:0" aria-hidden="true" />' +
  '<input type="hidden" name="gclid" data-attribution="gclid" value="" />' +
  '<input type="text" id="cf-name" name="name" required autocomplete="name" />' +
  '<input type="email" id="cf-email" name="email" required autocomplete="email" />' +
  '<input type="text" id="cf-company" name="company" autocomplete="organization" />' +
  '<textarea id="cf-message" name="message" rows="4" required></textarea>' +
  '<input type="checkbox" id="cf-ads-consent" name="marketing_consent" value="true" />' +
  '<input type="hidden" name="marketing_consent_version" value="ads-consent-v1" />' +
  '<button type="submit">Absenden</button></form>';

// Der Agent-Modus: botcheck entfällt, url_honey ist readonly, keine Einwilligung.
// In Chrome 153 gemessen: Parameter name, email, company, message — sonst nichts.
const AGENT =
  '<form class="contact-form" action="/api/contact" method="POST" data-web3form ' +
  'toolname="kontakt_anfrage" tooldescription="Kontaktanfrage an Musterfirma vorbereiten.">' +
  '<input type="text" name="url_honey" tabindex="-1" autocomplete="off" style="position:absolute;left:-9999px;opacity:0" aria-hidden="true" readonly />' +
  '<input type="hidden" name="gclid" data-attribution="gclid" value="" />' +
  '<input type="text" id="cf-name" name="name" required autocomplete="name" toolparamdescription="Vor- und Nachname" />' +
  '<input type="email" id="cf-email" name="email" required autocomplete="email" toolparamdescription="E-Mail" />' +
  '<input type="text" id="cf-company" name="company" autocomplete="organization" toolparamdescription="Firma" />' +
  '<textarea id="cf-message" name="message" rows="4" required toolparamdescription="Anliegen"></textarea>' +
  '<button type="submit">Absenden</button></form>';

const namen = (html) => schemaFelder(html.replace(/^<form[^>]*>|<\/form>$/g, '')).map((f) => f.name);

test('GEGENPROBE: das naive Markup wird gemeldet — 2 Honeypots, 1 Einwilligung', () => {
  const typen = checkWebMcpForms([{ page: '/kontakt/', html: NAIV }]).map((i) => i.type).sort();
  assert.deepEqual(typen, ['consent_in_schema', 'honeypot_in_schema', 'honeypot_in_schema']);
});

test('der Agent-Modus ist sauber', () => {
  assert.deepEqual(checkWebMcpForms([{ page: '/kontakt/', html: AGENT }]), []);
});

test('Schema-Nachbildung trifft Chromes gemessene Parameterliste — naiv und Agent-Modus', () => {
  assert.deepEqual(namen(NAIV), ['botcheck', 'url_honey', 'name', 'email', 'company', 'message', 'marketing_consent']);
  assert.deepEqual(namen(AGENT), ['name', 'email', 'company', 'message']);
});

test('Ausschluss-Varianten wie in Chrome 153 gemessen', () => {
  const drin = (feld) => namen(`<input name="keep">${feld}`).includes('probe');
  // raus
  assert.equal(drin('<input type="text" name="probe" disabled>'), false, 'disabled');
  assert.equal(drin('<input type="text" name="probe" readonly>'), false, 'readonly Textfeld');
  assert.equal(drin('<fieldset disabled><input type="text" name="probe"></fieldset>'), false, 'fieldset disabled');
  assert.equal(drin('<output name="probe"></output>'), false, 'output');
  assert.equal(drin('<input type="hidden" name="probe">'), false, 'type=hidden');
  // drin — diese schützen NICHT
  assert.equal(drin('<input type="text" name="probe" hidden>'), true, 'hidden-Attribut');
  assert.equal(drin('<input type="text" name="probe" inert>'), true, 'inert');
  assert.equal(drin('<input type="text" name="probe" style="display:none">'), true, 'display:none');
  assert.equal(drin('<input type="checkbox" name="probe" readonly>'), true, 'readonly Checkbox');
  assert.equal(drin('<input type="text" name="probe" toolparamdescription="">'), true, 'leere Beschreibung');
});

test('Formulare ohne toolname bleiben unberührt, auch mit Honeypots', () => {
  const ohne = NAIV.replace(/ toolname="[^"]*" tooldescription="[^"]*"/, '');
  assert.deepEqual(checkWebMcpForms([{ page: '/kontakt/', html: ohne }]), []);
});

test('Lighthouse-Regeln: toolname und tooldescription nur zusammen, Pflichtfeld braucht name', () => {
  const typ = (html) => checkWebMcpForms([{ page: '/x/', html }]).map((i) => i.type);
  assert.deepEqual(typ('<form toolname="a"><input name="q"><button>OK</button></form>'), ['tool_without_description']);
  assert.deepEqual(typ('<form tooldescription="b"><input name="q"></form>'), ['description_without_toolname']);
  assert.deepEqual(typ('<form toolname="a" tooldescription="b"><input required><button>OK</button></form>'), ['required_field_without_name']);
});

test('ohne Absende-Knopf lehnt Chrome jeden Aufruf ab — wird gemeldet', () => {
  // Chrome 153, 11.09.2026: "No submit button was found, but for a form without
  // `toolautosubmit`, there must be a submit button".
  const typ = (knopf) =>
    checkWebMcpForms([{ page: '/x/', html: `<form toolname="a" tooldescription="b"><input name="q">${knopf}</form>` }])
      .map((i) => i.type);
  assert.deepEqual(typ(''), ['no_submit_button']);
  assert.deepEqual(typ('<button type="button">Zurück</button>'), ['no_submit_button']);
  assert.deepEqual(typ('<button>Senden</button>'), []);
  assert.deepEqual(typ('<button type="submit" class="btn-accent"><span>Absenden</span></button>'), []);
  assert.deepEqual(typ('<input type="submit" value="Senden">'), []);
});

test('toolautosubmit wird gemeldet — abschicken muss der Mensch', () => {
  const issues = checkWebMcpForms([{ page: '/x/', html: '<form toolname="a" tooldescription="b" toolautosubmit><input name="q"></form>' }]);
  assert.deepEqual(issues.map((i) => i.type), ['autosubmit']);
});

test('doppelter toolname auf einer Seite wird gemeldet, auf zwei Seiten nicht', () => {
  const f = '<form toolname="a" tooldescription="b"><input name="q"><button>OK</button></form>';
  assert.deepEqual(checkWebMcpForms([{ page: '/x/', html: f + f }]).map((i) => i.type), ['duplicate_toolname']);
  assert.deepEqual(checkWebMcpForms([{ page: '/x/', html: f }, { page: '/y/', html: f }]), []);
});

test('"<form toolname" als Text in Skript, JSON-LD oder Kommentar löst nichts aus', () => {
  const roh =
    '<script type="application/ld+json">{"t":"<form toolname=\\"a\\"><input name=\\"botcheck\\"></form>"}</script>' +
    '<!-- <form toolname="a"><input type="checkbox" name="botcheck"></form> -->';
  assert.deepEqual(checkWebMcpForms([{ page: '/x/', html: roh }]), []);
});
