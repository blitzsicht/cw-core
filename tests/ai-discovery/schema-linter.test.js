// @ts-check
/**
 * Tests fuer den Schema-Linter (JSON-LD) in ai-discovery.
 *
 * Lauf: `node --test tests/ai-discovery/schema-linter.test.js`
 * Oder ueber Skript: `pnpm test`
 *
 * Issue: siluri/digital-direkt-ops#14
 * Ausloeser: `/karriere/` wurde mit "JSON-LD-Block #4 hat kein @context / kein @type"
 * gemeldet. Der Block ist ein Top-Level-**Array** aus zwei JobPostings, jedes mit
 * @context und @type — nach JSON-LD-Spec gueltig und von Google unterstuetzt. Der
 * Linter las die Pflichtfelder am Wurzelknoten; auf einem Array ist `root['@context']`
 * immer undefined, also feuerten beide Warnungen. Der Guard war der Fehler, nicht die Seite.
 *
 * Zweite Luecke im selben Zug: `collectIds` stieg auf Top-Level-Arrays gar nicht ein
 * (`o['@id']` und `o['@graph']` sind auf einem Array undefined) — die Duplikat-Erkennung,
 * der Kern-Check dieses Linters, war auf Array-Bloecken blind.
 *
 * Dieser Linter war bis v0.103.0 als einziger der Datei weder exportiert noch getestet.
 * Genau deshalb blieb beides unsichtbar.
 *
 * Abdeckung:
 *   1. Array aus zwei vollstaendigen JobPostings → keine Issues (dds echter Fall)
 *   2. Einzelobjekt ohne @context → missing_context (Gegenprobe: Guard kann noch rot)
 *   3. Einzelobjekt ohne @type → missing_type
 *   4. Array-Element ohne @type → genau ein missing_type, mit Index im Detail
 *   5. @graph-Form → unveraendert keine Issues
 *   6. Kaputtes JSON → invalid_json, kein Crash
 *   7. Array-Element ist kein Objekt → invalid_json statt zweier Falschmeldungen
 *   8. Doppelte @id ueber Array-Elemente hinweg → duplicate_id (war blind)
 *   9. Doppelte @id ueber zwei Bloecke hinweg → duplicate_id (mikas echter Fall, #643)
 *  10. Doppelte @id im @graph → duplicate_id (Kern-Check bleibt scharf)
 *  11. Seite ohne JSON-LD → keine Issues
 *  12. Page-Pfad wird aus dem dist-Pfad korrekt abgeleitet
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { lintPageSchema } from '../../src/integrations/ai-discovery/index.ts';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Schreibt eine dist-Page mit den gegebenen JSON-LD-Bloecken und lintet sie.
 * `blocks` ist ein Array von Strings — jeder String wird ein eigenes <script>.
 */
function lintBlocks(blocks, pagePath = 'karriere/index.html') {
  const html = [
    '<!DOCTYPE html><html lang="de"><head><title>T</title>',
    ...blocks.map((b) => `<script type="application/ld+json">${b}</script>`),
    '</head><body></body></html>',
  ].join('\n');
  const distDir = join(tmpdir(), `cw-test-schema-${process.pid}-${Math.random().toString(36).slice(2)}`);
  const htmlPath = join(distDir, pagePath);
  mkdirSync(join(htmlPath, '..'), { recursive: true });
  writeFileSync(htmlPath, html, 'utf-8');
  try {
    return lintPageSchema(htmlPath, distDir);
  } finally {
    rmSync(distDir, { recursive: true, force: true });
  }
}

/** Kuerzel: JSON-LD-Block aus einem JS-Wert. */
const ld = (value) => JSON.stringify(value);

const types = (issues) => issues.map((i) => i.type).sort();

/** Ein vollstaendiges JobPosting, wie StellenListe.astro es erzeugt. */
function jobPosting(title) {
  return {
    '@context': 'https://schema.org',
    '@type': 'JobPosting',
    title,
    description: `Beschreibung fuer ${title}`,
    hiringOrganization: { '@type': 'Organization', name: 'Digital-Direkt GmbH' },
  };
}

// ---------------------------------------------------------------------------
// Array-Form (der eigentliche Bug)
// ---------------------------------------------------------------------------

test('1. Array aus zwei vollstaendigen JobPostings → keine Issues (dd /karriere/)', () => {
  const block = ld([jobPosting('Servicetechniker (m/w/d)'), jobPosting('Vertriebsmitarbeiter (m/w/d)')]);
  assert.deepEqual(lintBlocks([block]), []);
});

test('2. Einzelobjekt ohne @context → missing_context (Guard kann noch rot werden)', () => {
  const block = ld({ '@type': 'JobPosting', title: 'Ohne Kontext' });
  assert.deepEqual(types(lintBlocks([block])), ['missing_context']);
});

test('3. Einzelobjekt ohne @type → missing_type', () => {
  const block = ld({ '@context': 'https://schema.org', name: 'Ohne Typ' });
  assert.deepEqual(types(lintBlocks([block])), ['missing_type']);
});

test('4. Array-Element ohne @type → genau ein missing_type, mit Index im Detail', () => {
  const kaputt = { '@context': 'https://schema.org', title: 'Kein Typ' };
  const issues = lintBlocks([ld([jobPosting('Heil'), kaputt])]);
  assert.deepEqual(types(issues), ['missing_type']);
  // Ohne Index waere der Befund in einem Block mit N Elementen nicht auffindbar.
  assert.match(issues[0].detail, /#1\[1\]/);
});

test('5. @graph-Form → unveraendert keine Issues', () => {
  const block = ld({
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'Organization', '@id': 'https://x.de/#organization' },
      { '@type': 'WebSite', '@id': 'https://x.de/#website' },
    ],
  });
  assert.deepEqual(lintBlocks([block]), []);
});

// ---------------------------------------------------------------------------
// Robustheit
// ---------------------------------------------------------------------------

test('6. Kaputtes JSON → invalid_json, kein Crash', () => {
  assert.deepEqual(types(lintBlocks(['{ "@type": "Foo", }}'])), ['invalid_json']);
});

test('7. Array-Element ist kein Objekt → invalid_json statt zweier Falschmeldungen', () => {
  const issues = lintBlocks([ld([jobPosting('Heil'), 'ein String'])]);
  assert.deepEqual(types(issues), ['invalid_json']);
  assert.match(issues[0].detail, /#1\[1\]/);
});

// ---------------------------------------------------------------------------
// Duplikat-Erkennung (Kern-Check)
// ---------------------------------------------------------------------------

test('8. Doppelte @id ueber Array-Elemente hinweg → duplicate_id (war blind)', () => {
  const block = ld([
    { '@context': 'https://schema.org', '@type': 'Organization', '@id': 'https://x.de/#organization' },
    { '@context': 'https://schema.org', '@type': 'LocalBusiness', '@id': 'https://x.de/#organization' },
  ]);
  const issues = lintBlocks([block]);
  assert.deepEqual(types(issues), ['duplicate_id']);
  assert.match(issues[0].detail, /#organization/);
});

test('9. Doppelte @id ueber zwei Bloecke hinweg → duplicate_id (mika, #643)', () => {
  const a = ld({ '@context': 'https://schema.org', '@type': 'Organization', '@id': 'https://x.de/#organization' });
  const b = ld({ '@context': 'https://schema.org', '@type': 'LocalBusiness', '@id': 'https://x.de/#organization' });
  assert.deepEqual(types(lintBlocks([a, b])), ['duplicate_id']);
});

test('10. Doppelte @id im @graph → duplicate_id', () => {
  const block = ld({
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'Organization', '@id': 'https://x.de/#organization' },
      { '@type': 'LocalBusiness', '@id': 'https://x.de/#organization' },
    ],
  });
  assert.deepEqual(types(lintBlocks([block])), ['duplicate_id']);
});

// ---------------------------------------------------------------------------
// Rahmen
// ---------------------------------------------------------------------------

test('11. Seite ohne JSON-LD → keine Issues', () => {
  assert.deepEqual(lintBlocks([]), []);
});

test('12. Page-Pfad wird aus dem dist-Pfad abgeleitet', () => {
  const block = ld({ '@type': 'JobPosting' }); // ohne @context → erzeugt ein Issue
  const issues = lintBlocks([block], 'karriere/index.html');
  assert.equal(issues[0].page, '/karriere/');
});
