// @ts-check
/**
 * SchemaOrg.astro — optionale Namensfelder `alternateName`, `legalName`, `additionalName`.
 *
 * Lauf: `node --test tests/blocks/schemaorg-namen.test.js`
 *
 * ANLASS (03.11.2026, [steller-sanierungen]): Der Inhaber heißt Frank Arno Steller, Google
 * kennt ihn als „Arno Steller“. Person und Organisation brauchen beide Namensformen, der
 * Rechtsname grenzt von der Vorfirma ab.
 *
 * Gegenproben: ohne die Felder stehen sie nicht im Output; leere Arrays werden nicht
 * gerendert. Kundenseiten setzen das Schema über `<BaseLayout schema={…}>`, nicht an der
 * Komponente — deshalb wird die Durchreichung am Layout geprüft (Review 03.11.2026:
 * `SchemaProps` in BaseLayout.astro kannte die vier Felder nicht, der Output blieb leer).
 */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { renderer, schliessen } from './_render-astro.js';
import { BASIS } from './schemaorg-faelle.js';

after(schliessen);

const KOMPONENTE = 'src/components/seo/SchemaOrg.astro';
const LAYOUT = 'src/layouts/BaseLayout.astro';

/** Alle JSON-LD-Blöcke als Objekte. @param {string} html */
function bloecke(html) {
  return [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
}
/** Der Firmenknoten (`#organization`). @param {string} html */
const firma = (html) => bloecke(html).find((b) => String(b['@id']).endsWith('#organization'));
/** Der Personenknoten des Gründers. @param {string} html */
const person = (html) => bloecke(html).find((b) => b['@type'] === 'Person');
/** @param {unknown} typ */
const typen = (typ) => (Array.isArray(typ) ? typ : [typ]);

/** @param {Record<string, unknown>} props */
async function render(props) {
  return (await renderer()).render(KOMPONENTE, { ...BASIS, ...props });
}

/** Pflicht-Props von BaseLayout; das Schema kommt wie bei Kundenseiten über `schema`. */
const LAYOUT_BASIS = {
  siteUrl: 'https://example.test',
  defaultTitle: 'Testbetrieb',
  defaultDescription: 'Ein Betrieb für Tests.',
  defaultOgImage: '/og/start.png',
};

const NAMEN = {
  alternateName: ['Testbetrieb', 'Huber Sanierung'],
  legalName: 'Testbetrieb Huber, Inh. Max Huber',
  founder: { name: 'Max Josef Huber', additionalName: 'Josef', alternateName: ['Josef Huber'] },
};

test('gesetzt: alternateName + legalName an der Firma, additionalName + alternateName an der Person', async () => {
  const html = await render(NAMEN);
  assert.deepEqual(firma(html).alternateName, ['Testbetrieb', 'Huber Sanierung']);
  assert.equal(firma(html).legalName, 'Testbetrieb Huber, Inh. Max Huber');
  assert.equal(person(html).additionalName, 'Josef');
  assert.deepEqual(person(html).alternateName, ['Josef Huber']);
  // Die @id der Person hängt nicht an den neuen Feldern: gleich wie ohne sie.
  const ohne = await render({ founder: { name: 'Max Josef Huber' } });
  assert.equal(person(html)['@id'], person(ohne)['@id'], 'Person-@id unverändert');
  assert.match(String(person(html)['@id']), /^https:\/\/example\.test\/#/);
});

test("schemaType 'Organization': dieselben Felder am Organization-Knoten", async () => {
  const html = await render({ ...NAMEN, schemaType: 'Organization' });
  assert.ok(typen(firma(html)['@type']).includes('Organization'));
  assert.ok(!typen(firma(html)['@type']).includes('LocalBusiness'));
  assert.deepEqual(firma(html).alternateName, ['Testbetrieb', 'Huber Sanierung']);
  assert.equal(firma(html).legalName, 'Testbetrieb Huber, Inh. Max Huber');
});

test('Gegenprobe: ohne die Felder stehen sie NICHT im Output', async () => {
  const html = await render({ founder: { name: 'Max Huber' } });
  assert.ok(person(html), 'Person-Block muss existieren (sonst Vakuum-Grün)');
  assert.ok(firma(html), 'Firmenknoten muss existieren');
  for (const k of ['alternateName', 'legalName']) assert.equal(k in firma(html), false, `firma.${k}`);
  for (const k of ['alternateName', 'additionalName']) assert.equal(k in person(html), false, `person.${k}`);
});

test('Gegenprobe: leere alternateName-Arrays werden nicht gerendert', async () => {
  const html = await render({ alternateName: [], founder: { name: 'Max Huber', alternateName: [] } });
  assert.equal('alternateName' in firma(html), false);
  assert.equal('alternateName' in person(html), false);
});

test('Durchreichung: <BaseLayout schema={…}> gibt alle vier Felder an SchemaOrg weiter', async () => {
  const r = await renderer();
  const mit = await r.render(LAYOUT, { ...LAYOUT_BASIS, schema: { ...BASIS, ...NAMEN } });
  assert.deepEqual(firma(mit).alternateName, ['Testbetrieb', 'Huber Sanierung']);
  assert.equal(firma(mit).legalName, 'Testbetrieb Huber, Inh. Max Huber');
  assert.equal(person(mit).additionalName, 'Josef');
  assert.deepEqual(person(mit).alternateName, ['Josef Huber']);
  // Gegenprobe im selben Lauf: ohne die Felder im schema-Prop fehlen sie auch hinter dem Layout.
  const ohne = await r.render(LAYOUT, { ...LAYOUT_BASIS, schema: { ...BASIS, founder: { name: 'Max Huber' } } });
  assert.ok(firma(ohne) && person(ohne), 'beide Knoten müssen existieren');
  for (const k of ['alternateName', 'legalName']) assert.equal(k in firma(ohne), false, `firma.${k}`);
  for (const k of ['alternateName', 'additionalName']) assert.equal(k in person(ohne), false, `person.${k}`);
});
