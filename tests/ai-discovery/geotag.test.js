// @ts-check
/**
 * Tests für die reinen Tag-Builder in geotag-core (Bild-Metadaten-Pipeline).
 *
 * Lauf: `node --test tests/ai-discovery/geotag.test.js`
 * Oder über Skript: `pnpm test`
 *
 * Auslöser (2026-07-10): Audit ergab, dass der kanonische Geotag-Pfad
 * (geotag.js / geotag-dist.mjs) zwar Meta + GPS + Description schrieb, aber
 * WEDER Keyword-Tags (IPTC:Keywords/XMP:Subject) NOCH Ortsnamen-Geo-Tags
 * (XMP:City/State/Country) — und nur .webp, nie .png. Die Logik wurde in
 * geotag-core zentralisiert; diese Tests decken die neuen Anforderungen +
 * die alten Skip-Pfade ab (echte Symbolnamen, kein Mock-Patching).
 *
 * Abdeckung:
 *   1. Voll befülltes site-data → Meta + GPS + City/State/Country + Keywords
 *   2. Nur legal.owner, kein geo → Copyright/Artist, KEINE GPS (Negativ-Guard)
 *   3. Kein owner/kein geo/keine Keywords → leeres Tag-Set (Skip-Pfad)
 *   4. Keyword-Synthese: dedupe + cap MAX_KEYWORDS; explizite imageKeywords haben Vorrang
 *   5. walkImages findet .webp UND .png (Negativ gegen echten Bug: alter Walk nur .webp)
 *   6. buildDescByStem matcht hero.image + leistungen[].heroImage
 *   7. TODO-Platzhalter aus dem Template werden NICHT getaggt
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  buildCommonTags,
  buildDescByStem,
  synthesizeKeywords,
  walkImages,
  descForFile,
  MAX_KEYWORDS,
} from '../../src/integrations/ai-discovery/geotag-core.js';

test('1. Voll befülltes site-data → Meta + GPS + Ortsnamen + Keywords', () => {
  const data = {
    name: 'Steller Sanierungen',
    legal: { owner: 'Frank Steller', city: 'Barbing', region: 'Bayern', country: 'DE' },
    seo: {
      geo: { latitude: 49.0031, longitude: 12.1903 },
      knowsAbout: ['Sanierung', 'Trockenbau'],
      areaServed: ['Regensburg'],
    },
    leistungen: [{ title: 'Komplettsanierung' }],
  };
  const t = buildCommonTags(data);
  assert.equal(t.Copyright, '© Frank Steller');
  assert.equal(t.Artist, 'Frank Steller');
  assert.equal(t.GPSLatitude, 49.0031);
  assert.equal(t.GPSLatitudeRef, 'N');
  assert.equal(t.GPSLongitude, 12.1903);
  assert.equal(t.GPSLongitudeRef, 'E');
  assert.equal(t['XMP:City'], 'Barbing');
  assert.equal(t['XMP:State'], 'Bayern');
  assert.equal(t['XMP:Country'], 'DE');
  assert.deepEqual(t['IPTC:Keywords'], ['Sanierung', 'Trockenbau', 'Regensburg', 'Komplettsanierung']);
  assert.deepEqual(t['XMP:Subject'], t['IPTC:Keywords']);
});

test('2. Nur owner, kein geo → Copyright/Artist, KEINE GPS (Negativ-Guard)', () => {
  const t = buildCommonTags({ legal: { owner: 'Max Muster' } });
  assert.equal(t.Copyright, '© Max Muster');
  assert.equal(t.Artist, 'Max Muster');
  assert.equal(t.GPSLatitude, undefined);
  assert.equal(t.GPSLongitude, undefined);
  assert.equal(t['XMP:City'], undefined);
});

test('3. Kein owner/kein geo/keine Keywords → leeres Tag-Set (Skip-Pfad)', () => {
  const t = buildCommonTags({ legal: {}, seo: {} });
  assert.equal(Object.keys(t).length, 0);
});

test('4. Keyword-Synthese: dedupe, cap, explizite imageKeywords haben Vorrang', () => {
  // dedupe (case-insensitiv) über knowsAbout + areaServed + leistungen[].title
  const synth = synthesizeKeywords({
    seo: { knowsAbout: ['Webdesign', 'webdesign'], areaServed: ['Regensburg'] },
    leistungen: [{ title: 'Regensburg' }, { title: 'SEO' }],
  });
  assert.deepEqual(synth, ['Webdesign', 'Regensburg', 'SEO']);

  // cap bei MAX_KEYWORDS
  const many = Array.from({ length: MAX_KEYWORDS + 5 }, (_, i) => `kw${i}`);
  assert.equal(synthesizeKeywords({ seo: { knowsAbout: many } }).length, MAX_KEYWORDS);

  // explizite imageKeywords überschreiben die Synthese
  const explicit = synthesizeKeywords({
    seo: { imageKeywords: ['A', 'B'], knowsAbout: ['ignoriert'] },
  });
  assert.deepEqual(explicit, ['A', 'B']);
});

test('5. walkImages findet .webp UND .png (Negativ gegen echten Bug)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'geotag-walk-'));
  try {
    mkdirSync(join(dir, 'sub'));
    writeFileSync(join(dir, 'hero.abc123.webp'), 'x');
    writeFileSync(join(dir, 'og-image.png'), 'x'); // MUSS gefunden werden (PNG-Bug)
    writeFileSync(join(dir, 'sub', 'team.def456.WEBP'), 'x'); // case-insensitiv
    writeFileSync(join(dir, 'index.html'), 'x'); // kein Bild → ignoriert
    const found = walkImages(dir).map((p) => p.split('/').pop()).sort();
    assert.deepEqual(found, ['hero.abc123.webp', 'og-image.png', 'team.def456.WEBP']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('6. buildDescByStem matcht hero.image + leistungen[].heroImage', () => {
  const map = buildDescByStem({
    hero: { image: '/images/hero/hero.webp', imageAlt: 'Heller Sanierungsflur' },
    leistungen: [
      { heroImage: '/images/leistungen/komplettsanierung.webp', title: 'Komplettsanierung' },
      { image: 'trockenbau.webp', imageAlt: 'Trockenbauwand im Rohbau' },
    ],
  });
  // Lookup erfolgt über den dist-Basename-Stamm (vor dem ersten '.')
  assert.equal(descForFile('hero.CGE1a2b3.webp', map), 'Heller Sanierungsflur');
  assert.equal(descForFile('komplettsanierung.Xy9.webp', map), 'Komplettsanierung');
  assert.equal(descForFile('trockenbau.Z1.webp', map), 'Trockenbauwand im Rohbau');
  assert.equal(descForFile('unbekannt.webp', map), null);
});

test('7. TODO-Platzhalter aus dem Template werden NICHT getaggt', () => {
  const t = buildCommonTags({
    legal: { owner: 'TODO: Vor- und Nachname', city: 'TODO: Musterstadt', country: 'DE' },
    seo: {},
  });
  assert.equal(t.Copyright, undefined);
  assert.equal(t['XMP:City'], undefined);
  assert.equal(t['XMP:Country'], 'DE'); // echter Wert bleibt
});
