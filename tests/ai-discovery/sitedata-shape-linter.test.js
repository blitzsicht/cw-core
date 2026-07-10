// @ts-check
/**
 * Tests für den Schema-Consistency-Guard (lintSiteDataShape) in ai-discovery.
 *
 * Lauf: `node --test tests/ai-discovery/sitedata-shape-linter.test.js`
 *
 * Auslöser (Review 2026-07-10): divergente Kunden-site-data-Shapes (gottl
 * services[]/images.hero, Ferienhäuser images.hero, donau hero.imageAlt ohne
 * image) ließen die Bild-Pipeline still WENIGER tun. Der Guard macht die
 * Abweichung sichtbar (die Pipeline toleriert sie bereits).
 *
 * Abdeckung:
 *   1. Canonical-Shape → keine Issues (nur ggf. SEO-Hinweise separat)
 *   2. images.hero-String ohne hero.image (gottl/Ferienhäuser) → warn
 *   3. .jpg-Hero → zusätzlicher warn
 *   4. hero.imageAlt ohne hero.image (donau, Orphan) → warn
 *   5. services[] ohne leistungen[] (gottl) → warn
 *   6. fehlendes legal.region / seo.knowsAbout → info (bricht strict NICHT)
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lintSiteDataShape } from '../../src/integrations/ai-discovery/index.ts';

const warns = (issues) => issues.filter((i) => i.severity === 'warn');
const fields = (issues) => issues.map((i) => i.field);

test('1. Canonical-Shape → keine warn-Abweichungen', () => {
  const issues = lintSiteDataShape({
    hero: { image: '/images/hero/hero.webp', imageAlt: 'Hero' },
    leistungen: [{ title: 'Sanierung' }],
    legal: { region: 'Bayern' },
    seo: { knowsAbout: ['Sanierung'] },
  });
  assert.equal(warns(issues).length, 0);
});

test('2. images.hero-String ohne hero.image → warn (images.hero)', () => {
  const issues = lintSiteDataShape({
    images: { hero: '/images/hero.webp' },
    leistungen: [{ title: 'X' }],
    legal: { region: 'Bayern' },
    seo: { knowsAbout: ['X'] },
  });
  assert.ok(fields(warns(issues)).includes('images.hero'));
});

test('3. .jpg-Hero → zusätzlicher warn', () => {
  const issues = lintSiteDataShape({
    images: { hero: '/images/hero.jpg' },
    leistungen: [{ title: 'X' }],
    legal: { region: 'Bayern' },
    seo: { knowsAbout: ['X'] },
  });
  // zwei images.hero-warns: Shape + .jpg
  assert.equal(warns(issues).filter((i) => i.field === 'images.hero').length, 2);
});

test('4. hero.imageAlt ohne hero.image (donau-Orphan) → warn', () => {
  const issues = lintSiteDataShape({
    hero: { imageAlt: 'verwaist' },
    leistungen: [{ title: 'X' }],
    legal: { region: 'Bayern' },
    seo: { knowsAbout: ['X'] },
  });
  assert.ok(fields(warns(issues)).includes('hero.imageAlt'));
});

test('5. services[] ohne leistungen[] (gottl) → warn', () => {
  const issues = lintSiteDataShape({
    hero: { image: '/images/hero/hero.webp', imageAlt: 'H' },
    services: [{ label: 'Wertermittlung' }],
    legal: { region: 'Bayern' },
    seo: { knowsAbout: ['X'] },
  });
  assert.ok(fields(warns(issues)).includes('services'));
});

test('6. fehlendes region/knowsAbout → nur info (NICHT warn)', () => {
  const issues = lintSiteDataShape({
    hero: { image: '/images/hero/hero.webp', imageAlt: 'H' },
    leistungen: [{ title: 'X' }],
    legal: {},
    seo: {},
  });
  assert.equal(warns(issues).length, 0);
  assert.ok(fields(issues).includes('legal.region'));
  assert.ok(fields(issues).includes('seo.knowsAbout'));
});
