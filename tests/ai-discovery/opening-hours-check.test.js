// @ts-check
/**
 * Tests für den Öffnungszeiten-Guard (src/integrations/ai-discovery/opening-hours-check.js).
 *
 * Lauf: `node --test tests/ai-discovery/opening-hours-check.test.js`
 *
 * ANLASS (Lead-Rakete-Audit 26.09.2026): baeckereizink beschreibt sich im JSON-LD als
 * Bakery/LocalBusiness, gibt dem Hauptobjekt aber keine Öffnungszeiten mit —
 * `site-data.ts:91 seo.openingHours: [] as string[]`, SchemaOrg.astro lässt die leere Liste
 * weg. Google und KI-Assistenten beantworten „Hat Zink jetzt offen?“ dann aus fremden
 * Quellen oder gar nicht. Die Filialen tragen Zeiten, das Hauptobjekt nicht.
 *
 * Fixture `fixtures/zink-startseite-jsonld.json`: echter JSON-LD-Ausschnitt der gebauten
 * Startseite (origin/main 0e87a15), gekürzt ohne Einfluss auf Typ und Öffnungszeiten.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { checkOpeningHours, istLocalBusiness } from '../../src/integrations/ai-discovery/opening-hours-check.js';

const ZINK = JSON.parse(readFileSync(resolve(import.meta.dirname, 'fixtures/zink-startseite-jsonld.json'), 'utf8'));

/** @param {...unknown} bloecke */
const seite = (...bloecke) =>
  `<html><head>${bloecke.map((b) => `<script type="application/ld+json">${JSON.stringify(b)}</script>`).join('')}</head><body></body></html>`;

test('ZNK: Bakery-Hauptobjekt ohne Öffnungszeiten → genau eine Warnung, Filialen mit Zeiten still', () => {
  const issues = checkOpeningHours(seite(ZINK.hauptobjekt, ZINK.website, ZINK.filialen), 'index.html');
  assert.equal(issues.length, 1, JSON.stringify(issues, null, 2));
  assert.equal(issues[0].type, 'missing_opening_hours');
  assert.equal(issues[0].id, 'https://baeckereizink.de/#organization');
  assert.match(issues[0].details, /LocalBusiness\/ProfessionalService\/Bakery/);
  assert.match(issues[0].details, /openingHours/);
});

test('Gegenprobe: dasselbe Hauptobjekt MIT openingHours → keine Warnung', () => {
  const mit = { ...ZINK.hauptobjekt, openingHours: ['Mo-Sa 06:00-12:00'] };
  assert.deepEqual(checkOpeningHours(seite(mit, ZINK.website, ZINK.filialen), 'index.html'), []);
});

test('openingHours: [] wörtlich im JSON-LD (so steht es in site-data.ts) → Warnung', () => {
  const leer = { ...ZINK.hauptobjekt, openingHours: [] };
  assert.equal(checkOpeningHours(seite(leer)).length, 1);
});

test('leere Werte zählen als fehlend: "", [""], openingHoursSpecification: [] und [{}]', () => {
  for (const extra of [
    { openingHours: '' },
    { openingHours: [''] },
    { openingHoursSpecification: [] },
    { openingHoursSpecification: [{}] },
    { openingHours: [], openingHoursSpecification: [] },
  ]) {
    const node = { '@context': 'https://schema.org', '@type': 'Plumber', name: 'X', ...extra };
    assert.equal(checkOpeningHours(seite(node)).length, 1, JSON.stringify(extra));
  }
});

test('openingHoursSpecification allein genügt', () => {
  const node = {
    '@context': 'https://schema.org',
    '@type': 'Electrician',
    name: 'Mika',
    openingHoursSpecification: [{ '@type': 'OpeningHoursSpecification', dayOfWeek: ['Monday'], opens: '07:00', closes: '17:00' }],
  };
  assert.deepEqual(checkOpeningHours(seite(node)), []);
});

test('Organization, WebSite, Product und Typen ohne LocalBusiness-Bezug → keine Warnung', () => {
  for (const t of ['Organization', 'WebSite', 'Product', 'Person', 'Service', 'FAQPage', 'Place', 'SoftwareApplication']) {
    assert.deepEqual(checkOpeningHours(seite({ '@context': 'https://schema.org', '@type': t, name: 'X' })), [], t);
  }
});

test('Array-Typ mit LocalBusiness-Untertyp → Warnung (auch neben Organization)', () => {
  assert.equal(checkOpeningHours(seite({ '@type': ['LocalBusiness', 'HomeAndConstructionBusiness'], name: 'Donau-Profi' })).length, 1);
  assert.equal(checkOpeningHours(seite({ '@type': ['Organization', 'HairSalon'], name: 'Haarwerk' })).length, 1);
  assert.equal(checkOpeningHours(seite({ '@type': 'https://schema.org/Winery', name: 'Weinkontor' })).length, 1);
});

test('Knoten im @graph werden geprüft', () => {
  const g = { '@context': 'https://schema.org', '@graph': [{ '@type': 'WebSite', name: 'W' }, { '@type': 'Bakery', '@id': '#b', name: 'B' }] };
  const issues = checkOpeningHours(seite(g));
  assert.equal(issues.length, 1);
  assert.equal(issues[0].id, '#b');
});

test('reine Referenz ({@type,@id}) und verschachtelte Orte (containedInPlace) → keine Warnung', () => {
  assert.deepEqual(checkOpeningHours(seite({ '@type': 'Bakery', '@id': 'https://baeckereizink.de/#organization' })), []);
  const filiale = {
    '@type': 'Bakery',
    name: 'Zink Schierling',
    openingHours: ['Mo-Sa 06:00-12:00'],
    containedInPlace: { '@type': 'Store', name: 'Netto' },
  };
  assert.deepEqual(checkOpeningHours(seite(filiale)), []);
});

test('kaputtes JSON-LD wirft nicht (Sache des Schema-Linters)', () => {
  const html = '<script type="application/ld+json">{"@type":"Bakery",</script>';
  assert.deepEqual(checkOpeningHours(html), []);
});

test('istLocalBusiness: Liste + Endungen, aber nicht Organization/Service', () => {
  assert.equal(istLocalBusiness(['Bakery']), true);
  assert.equal(istLocalBusiness(['WineStore']), true);
  assert.equal(istLocalBusiness(['HVACBusiness']), true);
  assert.equal(istLocalBusiness(['ExerciseGym']), true);
  assert.equal(istLocalBusiness(['Organization']), false);
  assert.equal(istLocalBusiness(['Corporation']), false);
  assert.equal(istLocalBusiness(['Service']), false);
  assert.equal(istLocalBusiness(['SportsOrganization']), false);
});
