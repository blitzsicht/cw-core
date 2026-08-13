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
 *   7.–9. planShapeReport: Log-Level + Abbruch (Nachtrag 13.08.2026, s.u.)
 *
 * Fall 7–9 prüfen NICHT die Klassifikation, sondern was daraus im Build-Log wird.
 * Die Lücke war genau dort: `lintSiteDataShape` stufte `legal.region` korrekt als
 * `info` ein, der Astro-Hook loggte es trotzdem per `logger.warn` — und der
 * strict-warnings-Gate des Release-Trains liest nur `[WARN]`, keine Severity.
 * Zwei dev-Repos hingen deshalb auf v0.110.0 fest. Ein Test auf der Klassifikation
 * allein konnte das nie rot melden.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lintSiteDataShape, planShapeReport } from '../../src/integrations/ai-discovery/index.ts';

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

// --- planShapeReport: was im Build-Log landet -------------------------------

/** site-data ohne region/knowsAbout, sonst canonical → nur info-Issues. */
const NUR_HINWEISE = {
  hero: { image: '/images/hero/hero.webp', imageAlt: 'H' },
  leistungen: [{ title: 'X' }],
  legal: {},
  seo: {},
};

/** donau-Orphan: imageAlt ohne image → echte warn-Abweichung. */
const ECHTE_ABWEICHUNG = {
  hero: { imageAlt: 'verwaist' },
  leistungen: [{ title: 'X' }],
  legal: { region: 'Bayern' },
  seo: { knowsAbout: ['X'] },
};

test('7. nur SEO-Hinweise → level info, kein Abbruch, Hinweise bleiben sichtbar', () => {
  const report = planShapeReport(lintSiteDataShape(NUR_HINWEISE), true);

  assert.equal(report.level, 'info');
  assert.equal(report.throws, false);
  // Leiser werden ja, verschwinden nein: beide Hinweise stehen weiter im Log.
  assert.equal(report.lines.length, 2);
  assert.ok(report.lines.some((l) => l.includes('legal.region')));
  assert.ok(report.lines.some((l) => l.includes('seo.knowsAbout')));
  // Der Report des Trains hängt Detailzeilen über die zwei führenden Leerzeichen
  // an ihren Kopf — ohne die zerfiele ein Befund in drei.
  assert.ok(report.lines.every((l) => l.startsWith('  [info] ')));
  // guardOk zählt Info-Zeilen mit ✓ als Beleg, dass der Guard lief.
  assert.ok(report.header.includes('✓'));
});

test('8. GEGENBEWEIS: echte Shape-Abweichung → level warn UND Abbruch bei strict', () => {
  const strikt = planShapeReport(lintSiteDataShape(ECHTE_ABWEICHUNG), true);
  assert.equal(strikt.level, 'warn');
  assert.equal(strikt.throws, true);
  assert.match(strikt.throwMessage, /strictSiteDataShape/);
  assert.ok(!strikt.header.includes('✓'));

  // Und ohne strict: weiterhin warn (sichtbar), aber kein Abbruch.
  const weich = planShapeReport(lintSiteDataShape(ECHTE_ABWEICHUNG), false);
  assert.equal(weich.level, 'warn');
  assert.equal(weich.throws, false);
  assert.equal(weich.throwMessage, '');
});

test('9. warn + info gemischt → warn gewinnt, der Hinweis stuft nicht herunter', () => {
  const report = planShapeReport(
    lintSiteDataShape({ hero: { imageAlt: 'verwaist' }, leistungen: [{ title: 'X' }], legal: {}, seo: {} }),
    true,
  );
  assert.equal(report.level, 'warn');
  assert.equal(report.throws, true);
  assert.match(report.header, /1 Shape-Abweichung\(en\), 2 SEO-Hinweis\(e\)/);
  assert.equal(report.lines.length, 3);
});

test('10. canonical + vollständig → ✓-Zeile ohne Details', () => {
  const report = planShapeReport(
    lintSiteDataShape({
      hero: { image: '/images/hero/hero.webp', imageAlt: 'H' },
      leistungen: [{ title: 'X' }],
      legal: { region: 'Bayern' },
      seo: { knowsAbout: ['X'] },
    }),
    true,
  );
  assert.equal(report.level, 'info');
  assert.equal(report.lines.length, 0);
  assert.equal(report.throws, false);
});
