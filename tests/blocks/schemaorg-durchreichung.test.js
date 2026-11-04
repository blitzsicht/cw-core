// @ts-check
/**
 * BaseLayout.astro reicht `schema` vollständig an SchemaOrg.astro weiter.
 *
 * Lauf: `node --test tests/blocks/schemaorg-durchreichung.test.js`
 *
 * ANLASS (Review cw-core #198, 03.11.2026): `SchemaProps` war eine Kopie der SchemaOrg-Props,
 * BaseLayout gab 30 Felder einzeln weiter. Neue Felder (alternateName, legalName, Founder-Namen)
 * kamen an der Komponente an, hinter dem Layout aber nicht. Seit dem Umbau ist `SchemaProps`
 * aus SchemaOrg abgeleitet und die Weitergabe ein Spread ohne `faqs`.
 *
 * Geprüft wird das Ergebnis, nicht die Mechanik: JSON-LD hinter dem Layout = JSON-LD der
 * Komponente, für einen Prop-Satz, der jedes Feld setzt. Zwei Wächter halten den Test scharf:
 *   - Abdeckung: jedes Feld aus `interface Props` und aus der Destrukturierung von
 *     `Astro.props` steht in JEDES_FELD, ebenso jedes Feld von FounderData, EmployeeData und
 *     ServiceData im jeweiligen Unterobjekt.
 *   - Trennschärfe: lässt man ein Feld weg, ändert sich der Output. Das gilt auch für die
 *     Founder-Unterfelder, denn genau dort fehlten in #198 die Namen. Sonst fiele ein Feld,
 *     das hinter dem Layout verloren geht, nicht auf.
 *
 * Die Feldnamen kommen aus dem TypeScript-AST des Frontmatters, nicht aus einem Komma-Split:
 * Defaults wie `['German', 'English']` oder Kommentare in der Destrukturierung erzeugten
 * sonst Scheinfelder (Review cw-core #200, 04.11.2026).
 */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { renderer, schliessen } from './_render-astro.js';

after(schliessen);

const KOMPONENTE = 'src/components/seo/SchemaOrg.astro';
const LAYOUT = 'src/layouts/BaseLayout.astro';

const LAYOUT_BASIS = {
  siteUrl: 'https://example.test',
  defaultTitle: 'Testbetrieb',
  defaultDescription: 'Ein Betrieb für Tests.',
  defaultOgImage: '/og/start.png',
};

/** Pflichtfelder: ohne sie gibt es keinen sinnvollen Knoten, sie werden nicht weggelassen. */
const PFLICHT = ['name', 'description', 'url', 'ogImage'];

/** Jedes Feld gesetzt, jeder Wert ungleich dem Default der Komponente. */
const JEDES_FELD = {
  name: 'Testbetrieb Huber',
  description: 'Ein Betrieb für Tests.',
  alternateName: ['Huber Sanierung'],
  legalName: 'Testbetrieb Huber, Inh. Max Huber',
  url: 'https://example.test',
  ogImage: '/og/start.png',
  logoUrl: 'https://example.test/logo.svg',
  copyrightHolder: 'Huber Holding',
  street: 'Hauptstraße 1',
  zip: '93047',
  city: 'Regensburg',
  country: 'DE',
  email: 'info@example.test',
  phone: '+49 941 123456',
  areaServed: ['Regensburg', 'Barbing'],
  priceRange: '€€€',
  sameAs: ['https://www.facebook.com/test'],
  availableLanguage: ['German', 'English'],
  openingHours: ['Mo-Fr 08:00-17:00'],
  geo: { latitude: 49.01, longitude: 12.1 },
  foundingDate: '2010-01-01',
  slogan: 'Gut getestet.',
  numberOfEmployees: 12,
  additionalTypes: ['RealEstateAgent'],
  schemaType: 'LocalBusiness',
  employees: [
    {
      name: 'Erika Muster',
      role: 'Leitung',
      title: 'Dipl.-Ing.',
      phone: '+49 941 111222',
      email: 'erika@example.test',
      credentials: ['Meisterin'],
    },
  ],
  services: [{ label: 'Prüfen', shortDesc: 'Wir prüfen.', href: '/pruefen' }],
  service: { label: 'Prüfen', shortDesc: 'Wir prüfen.', href: '/pruefen' },
  knowsAbout: ['Testen'],
  founder: {
    name: 'Max Josef Huber',
    additionalName: 'Josef',
    alternateName: ['Josef Huber'],
    jobTitle: 'Inhaber',
    description: 'Seit 2010 im Betrieb.',
    image: '/team/max.jpg',
    email: 'max@example.test',
    phone: '+49 941 654321',
    knowsAbout: ['Sanierung'],
    credentials: ['Meister'],
    sameAs: ['https://www.linkedin.com/in/max'],
  },
};

/** Alle JSON-LD-Blöcke als Objekte. @param {string} html */
function bloecke(html) {
  return [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
}

/** Frontmatter von SchemaOrg.astro als TypeScript-AST. */
function frontmatter() {
  const quelle = readFileSync(KOMPONENTE, 'utf8');
  const fm = quelle.match(/^---\n([\s\S]*?)\n---/);
  assert.ok(fm, 'Frontmatter in SchemaOrg.astro nicht gefunden');
  return ts.createSourceFile('SchemaOrg.ts', fm[1], ts.ScriptTarget.Latest, true);
}

/** Feldnamen eines Interfaces im Frontmatter. @param {ts.SourceFile} sf @param {string} name */
function felderVon(sf, name) {
  const decl = sf.statements.find((s) => ts.isInterfaceDeclaration(s) && s.name.text === name);
  assert.ok(decl && ts.isInterfaceDeclaration(decl), `interface ${name} nicht gefunden`);
  return decl.members.filter(ts.isPropertySignature).map((m) => m.name.getText(sf));
}

/** Namen, die aus `Astro.props` destrukturiert werden (alle Statements dieser Form). @param {ts.SourceFile} sf */
function destrukturiert(sf) {
  /** @type {string[]} */
  const namen = [];
  for (const s of sf.statements) {
    if (!ts.isVariableStatement(s)) continue;
    for (const d of s.declarationList.declarations) {
      if (!d.initializer || d.initializer.getText(sf) !== 'Astro.props' || !ts.isObjectBindingPattern(d.name)) continue;
      for (const el of d.name.elements) namen.push((el.propertyName ?? el.name).getText(sf));
    }
  }
  return namen;
}

const SF = frontmatter();

/**
 * JSON-LD der Grundseite (Layout ohne `schema`), einmal je Lauf gerendert.
 * @type {Promise<string[]> | undefined}
 */
let grundBloecke;

/** @param {Record<string, unknown>} props */
async function direkt(props) {
  return bloecke(await (await renderer()).render(KOMPONENTE, props));
}

/** JSON-LD hinter dem Layout, ohne die Blöcke, die das Layout auch ohne `schema` ausgibt. */
async function hinterLayout(/** @type {Record<string, unknown>} */ schema) {
  const r = await renderer();
  grundBloecke ??= r.render(LAYOUT, LAYOUT_BASIS).then((html) => bloecke(html).map((b) => JSON.stringify(b)));
  const grund = await grundBloecke;
  return bloecke(await r.render(LAYOUT, { ...LAYOUT_BASIS, schema })).filter((b) => !grund.includes(JSON.stringify(b)));
}

test('Abdeckung: JEDES_FELD setzt jedes Feld, das SchemaOrg liest', () => {
  const props = felderVon(SF, 'Props');
  const gelesen = destrukturiert(SF);
  assert.ok(props.length >= 25, `nur ${props.length} Felder in Props erkannt, Parser prüfen`);
  assert.ok(gelesen.length >= 25, `nur ${gelesen.length} destrukturierte Felder erkannt, Parser prüfen`);
  const fehlt = [...new Set([...props, ...gelesen])].filter((f) => !(f in JEDES_FELD));
  assert.deepEqual(fehlt, [], `in JEDES_FELD fehlen: ${fehlt.join(', ')}`);
});

test('Abdeckung: Unterobjekte setzen jedes Feld ihres Typs', () => {
  /** @type {Array<[string, Record<string, unknown>]>} */
  const faelle = [
    ['FounderData', JEDES_FELD.founder],
    ['EmployeeData', JEDES_FELD.employees[0]],
    ['ServiceData', JEDES_FELD.service],
  ];
  for (const [typ, objekt] of faelle) {
    const felder = felderVon(SF, typ);
    assert.ok(felder.length >= 2, `interface ${typ}: nur ${felder.length} Felder erkannt`);
    const fehlt = felder.filter((f) => !(f in objekt));
    assert.deepEqual(fehlt, [], `${typ}: im Testobjekt fehlen ${fehlt.join(', ')}`);
  }
});

test('Trennschärfe: jedes optionale Feld verändert den Output der Komponente', async () => {
  const voll = JSON.stringify(await direkt(JEDES_FELD));
  // schemaType 'LocalBusiness' ist der Default; seine Wirkung prüft der Organization-Fall.
  const optional = Object.keys(JEDES_FELD).filter((k) => !PFLICHT.includes(k) && k !== 'schemaType');
  assert.ok(optional.length >= 25, 'zu wenige optionale Felder');
  /** @type {string[]} */
  const unsichtbar = [];
  for (const k of optional) {
    const { [k]: _weg, ...ohne } = JEDES_FELD;
    if (JSON.stringify(await direkt(ohne)) === voll) unsichtbar.push(k);
  }
  assert.deepEqual(unsichtbar, [], `ohne Wirkung im JSON-LD: ${unsichtbar.join(', ')}`);
});

test('Trennschärfe: jedes optionale Founder-Feld verändert den Output', async () => {
  const voll = JSON.stringify(await direkt(JEDES_FELD));
  const optional = Object.keys(JEDES_FELD.founder).filter((k) => k !== 'name');
  assert.ok(optional.length >= 10, 'zu wenige optionale Founder-Felder');
  const ausgaben = await Promise.all(
    optional.map(async (k) => {
      const { [k]: _weg, ...founder } = JEDES_FELD.founder;
      return [k, JSON.stringify(await direkt({ ...JEDES_FELD, founder }))];
    }),
  );
  const unsichtbar = ausgaben.filter(([, a]) => a === voll).map(([k]) => k);
  assert.deepEqual(unsichtbar, [], `founder: ohne Wirkung im JSON-LD: ${unsichtbar.join(', ')}`);
});

for (const schemaType of /** @type {const} */ (['LocalBusiness', 'Organization'])) {
  test(`<BaseLayout schema={…}> = SchemaOrg direkt (schemaType ${schemaType})`, async () => {
    const props = { ...JEDES_FELD, schemaType };
    const erwartet = await direkt(props);
    assert.ok(erwartet.length >= 2, 'Komponente muss mindestens Firma und WebSite ausgeben');
    assert.deepEqual(await hinterLayout(props), erwartet);
  });
}

test('faqs im schema-Prop: ignoriert, kein FAQPage-Block, Rest unverändert', async () => {
  const faqs = [{ question: 'Testfrage?', answer: 'Eine Antwort für den Test.' }];
  const mitFaqs = await hinterLayout({ ...JEDES_FELD, faqs });
  assert.deepEqual(mitFaqs, await direkt(JEDES_FELD));
  assert.equal(JSON.stringify(mitFaqs).includes('FAQPage'), false);
  assert.equal(JSON.stringify(mitFaqs).includes('Testfrage?'), false);
});
