// @ts-check
/**
 * SchemaOrg.astro — `schemaType: 'Organization'` für Produkt-/SaaS-Seiten (#895).
 *
 * Lauf: `node --test tests/blocks/schemaorg-type.test.js`
 *
 * ANLASS (28.09.2026): Der Firmenknoten war hart `['LocalBusiness','ProfessionalService', …]`,
 * auch bei falzmarke, platzfrei, mazterplan und preshot. Der opening-hours-check (v0.162.0)
 * meldet dort dauerhaft fehlende Öffnungszeiten eines Ladens, den es nicht gibt.
 *
 * Gegenprobe: Schnappschüsse, VOR der Änderung aus v0.162.1 gerendert
 * (`fixtures/schemaorg-v0.162.1.json`, Prop-Sätze in `schemaorg-faelle.js`).
 */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderer, schliessen, normalize } from './_render-astro.js';
import { FAELLE } from './schemaorg-faelle.js';
import { checkOpeningHours, istLocalBusiness } from '../../src/integrations/ai-discovery/opening-hours-check.js';

after(schliessen);

const KOMPONENTE = 'src/components/seo/SchemaOrg.astro';
const GOLDEN = JSON.parse(readFileSync(resolve(import.meta.dirname, 'fixtures/schemaorg-v0.162.1.json'), 'utf8'));

/** @param {Record<string, unknown>} props */
async function render(props) {
  const r = await renderer();
  return normalize(await r.render(KOMPONENTE, props));
}

/** Alle JSON-LD-Blöcke als Objekte. @param {string} html */
function bloecke(html) {
  return [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
}

/** Der Firmenknoten (`#organization`). @param {string} html */
const firma = (html) => bloecke(html).find((b) => String(b['@id']).endsWith('#organization'));

for (const fall of Object.keys(FAELLE)) {
  test(`ohne schemaType: bytegleich zu v0.162.1 (${fall})`, async () => {
    assert.equal(await render(FAELLE[fall]), GOLDEN[fall]);
  });
  test(`schemaType 'LocalBusiness' explizit: bytegleich zu v0.162.1 (${fall})`, async () => {
    assert.equal(await render({ ...FAELLE[fall], schemaType: 'LocalBusiness' }), GOLDEN[fall]);
  });
}

test("schemaType 'Organization': kein LocalBusiness-Typ, keine LB-only-Felder, Rest bleibt", async () => {
  const n = firma(await render({ ...FAELLE.voll, schemaType: 'Organization' }));
  assert.deepEqual(n['@type'], ['Organization', 'RealEstateAgent']);
  assert.equal(istLocalBusiness(['Organization']), false);
  for (const feld of ['openingHours', 'priceRange', 'geo']) assert.equal(feld in n, false, `${feld} darf fehlen`);
  // Gegenprobe: im Default sind genau diese drei Felder da.
  const lb = firma(GOLDEN.voll);
  for (const feld of ['openingHours', 'priceRange', 'geo']) assert.equal(feld in lb, true, `${feld} im Default`);
  // Alles andere ist identisch.
  const ohne = (o) => Object.fromEntries(Object.entries(o).filter(([k]) => !['@type', 'openingHours', 'priceRange', 'geo'].includes(k)));
  assert.deepEqual(ohne(n), ohne(lb));
  assert.equal(n['@id'], 'https://example.test/#organization');
  assert.equal(n.address.streetAddress, 'Hauptstraße 1');
});

test('opening-hours-check: Default meldet 1, Organization 0 (gleicher Input)', async () => {
  const lb = checkOpeningHours(await render(FAELLE.ohneZeiten), '/');
  const org = checkOpeningHours(await render({ ...FAELLE.ohneZeiten, schemaType: 'Organization' }), '/');
  assert.equal(lb.length, 1);
  assert.equal(lb[0].id, 'https://example.test/#organization');
  assert.equal(org.length, 0);
});

test("Service-provider erbt den Typ des Firmenknotens", async () => {
  const html = await render({ ...FAELLE.voll, schemaType: 'Organization' });
  const service = bloecke(html).find((b) => b['@type'] === 'Service');
  assert.deepEqual(service.provider['@type'], ['Organization', 'RealEstateAgent']);
});
