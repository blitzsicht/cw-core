// @ts-check
/**
 * Tests für den ImageObject-Schema-Builder (src/schema/image-object.ts).
 *
 * Lauf: `node --test tests/schema/image-object.test.js`
 *
 * Abdeckung:
 *   1. Minimal → @type + url + contentUrl, KEIN @context (eingebetteter Knoten)
 *   2. Volle Felder → caption/credit/copyright/creator-@id
 *   3. width/height nur bei echten Zahlen (falsche Maße = Rich-Results-Warnung)
 *   4. Optionale Lizenz-Felder (Licensable) nur wenn gesetzt
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { imageObjectSchema } from '../../src/schema/image-object.ts';

test('1. Minimal → @type/url/contentUrl, kein @context', () => {
  const s = imageObjectSchema({ url: 'https://x.de/og.png' });
  assert.equal(s['@type'], 'ImageObject');
  assert.equal(s.url, 'https://x.de/og.png');
  assert.equal(s.contentUrl, 'https://x.de/og.png');
  assert.equal(s['@context'], undefined); // eingebetteter Knoten, kein Top-Level
});

test('2. Volle Felder inkl. creator-@id', () => {
  const s = imageObjectSchema({
    id: 'https://x.de/#primaryimage',
    url: 'https://x.de/og.png',
    caption: 'Firma XY',
    creditText: 'Firma XY',
    copyrightNotice: '© Firma XY',
    creatorId: 'https://x.de/#organization',
  });
  assert.equal(s['@id'], 'https://x.de/#primaryimage');
  assert.equal(s.caption, 'Firma XY');
  assert.equal(s.copyrightNotice, '© Firma XY');
  assert.deepEqual(s.creator, { '@id': 'https://x.de/#organization' });
});

test('3. width/height nur bei echten Zahlen', () => {
  const withDims = imageObjectSchema({ url: 'u', width: 1200, height: 630 });
  assert.equal(withDims.width, 1200);
  assert.equal(withDims.height, 630);
  const noDims = imageObjectSchema({ url: 'u' });
  assert.equal(noDims.width, undefined);
  assert.equal(noDims.height, undefined);
});

test('4. Lizenz-Felder nur wenn gesetzt', () => {
  assert.equal(imageObjectSchema({ url: 'u' }).license, undefined);
  const lic = imageObjectSchema({ url: 'u', license: 'https://x.de/impressum', acquireLicensePage: 'https://x.de/impressum' });
  assert.equal(lic.license, 'https://x.de/impressum');
  assert.equal(lic.acquireLicensePage, 'https://x.de/impressum');
});
