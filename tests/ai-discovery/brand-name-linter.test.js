// @ts-check
/**
 * Tests fuer den Brand-Name-Literal-Guard in ai-discovery.
 *
 * Lauf: `node --test tests/ai-discovery/brand-name-linter.test.js`
 * Oder ueber Skript: `pnpm test`
 *
 * Issue: siluri/blitzsicht-ops#316
 * Ausloeser: customer-mika-elektrotechnik hatte ~30 Literal-Duplikate in 13 Dateien.
 * Triviale Umbenennung wurde zur teuren Multi-File-Aktion.
 *
 * Abdeckung:
 *   1. Clean siteData (keine Literale) → keine Issues
 *   2. Literal in description → Issue mit count=1
 *   3. Literal in tagline → Issue
 *   4. Mehrere Literale in FAQs + Leistungen → mehrere Issues, korrekter count
 *   5. Groß-/Kleinschreibungs-Varianten werden erkannt (case-insensitive)
 *   6. Literal in mehreren Feldern gleichzeitig → alle Issues gemeldet
 *   7. robots.txt ohne Literal → keine Issues
 *   8. robots.txt mit Literal → Issue (static_asset_literal)
 *   9. robots.txt nicht vorhanden → keine Issues (kein Crash)
 *  10. Kurzer/leerer Markenname → Guard deaktiviert (keine false-positives)
 *  11. Negativ-Test gegen echten Bug: "Mika Elektrotechnik" in description → MUSS flaggen
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { lintBrandNameInSiteData, lintBrandNameInRobotsTxt } from '../../src/integrations/ai-discovery/index.ts';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimale valide siteData-Struktur ohne Brand-Literal-Probleme. */
function makeSiteData(overrides = {}) {
  return {
    name: 'Mika Elektrotechnik',
    description: 'Ihr Elektrofachbetrieb in Muenchen fuer Privat- und Gewerbekunden.',
    url: 'https://mika-elektrotechnik.de',
    tagline: 'Sicher und zuverlaessig.',
    contact: { phone: '+49 89 12345678', email: 'info@mika-elektrotechnik.de' },
    legal: { street: 'Musterstr. 1', zip: '80331', city: 'Muenchen' },
    faqs: [
      { q: 'Wie schnell koennen Sie kommen?', a: 'Wir sind in der Regel innerhalb von 24 Stunden vor Ort.' },
    ],
    leistungen: [
      { title: 'Elektroinstallation', description: 'Fachgerechte Installation in Privat- und Gewerbe-Objekten.', slug: 'elektroinstallation' },
    ],
    ...overrides,
  };
}

/** Legt eine temporaere robots.txt an und gibt den distDir-Pfad zurueck. */
function makeTempDist(robotsContent = '') {
  const dir = join(tmpdir(), `cw-test-dist-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  if (robotsContent !== null) {
    writeFileSync(join(dir, 'robots.txt'), robotsContent, 'utf-8');
  }
  return dir;
}

// ---------------------------------------------------------------------------
// Tests: lintBrandNameInSiteData
// ---------------------------------------------------------------------------

test('1. Clean siteData ohne Literale → keine Issues', () => {
  const data = makeSiteData();
  const issues = lintBrandNameInSiteData(data, data.name);
  assert.deepEqual(issues, [], 'Erwartet: keine Issues bei generischer Prosa.');
});

test('2. Literal in description → 1 Issue vom Typ prose_literal', () => {
  const data = makeSiteData({
    description: 'Mika Elektrotechnik ist Ihr Elektrofachbetrieb in Muenchen.',
  });
  const issues = lintBrandNameInSiteData(data, data.name);
  assert.equal(issues.length, 1, 'Erwartet genau 1 Issue.');
  assert.equal(issues[0].type, 'prose_literal');
  assert.equal(issues[0].location, 'siteData.description');
  assert.equal(issues[0].count, 1);
});

test('3. Literal in tagline → Issue mit korrektem location-Feld', () => {
  const data = makeSiteData({
    tagline: 'Mika Elektrotechnik — Ihr Partner.',
  });
  const issues = lintBrandNameInSiteData(data, data.name);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].location, 'siteData.tagline');
});

test('4. Literale in FAQs + Leistungen → mehrere Issues, korrekter count', () => {
  const data = makeSiteData({
    faqs: [
      {
        q: 'Was macht Mika Elektrotechnik?',
        a: 'Mika Elektrotechnik bietet Elektroinstallation an. Kontaktieren Sie Mika Elektrotechnik jetzt.',
      },
      { q: 'Wo ist Mika Elektrotechnik?', a: 'In Muenchen.' },
    ],
    leistungen: [
      { title: 'Mika Elektrotechnik Notdienst', description: 'Rund um die Uhr verfuegbar.', slug: 'notdienst' },
    ],
  });
  const issues = lintBrandNameInSiteData(data, data.name);
  // Erwartet: faqs[0].q (1x), faqs[0].a (2x → zwei Vorkommen in einem Satz), faqs[1].q (1x), leistungen[0].title (1x)
  assert.ok(issues.length >= 4, `Erwartet mindestens 4 Issues, bekam ${issues.length}.`);
  const faq0a = issues.find(i => i.location === 'siteData.faqs[0].a');
  assert.ok(faq0a, 'Erwartet Issue fuer siteData.faqs[0].a.');
  assert.equal(faq0a.count, 2, 'Erwartet count=2 (2 Vorkommen in faq[0].a).');
});

test('5. Case-insensitive: Kleinschreibungs-Variante wird erkannt', () => {
  const data = makeSiteData({
    description: 'mika elektrotechnik ist fuer Sie da.',
  });
  const issues = lintBrandNameInSiteData(data, data.name);
  assert.equal(issues.length, 1, 'Erwartet Issue auch bei Kleinschreibung.');
  assert.equal(issues[0].count, 1);
});

test('6. Literal in mehreren Feldern → alle Issues gemeldet', () => {
  const data = makeSiteData({
    description: 'Mika Elektrotechnik ist Ihr Partner.',
    tagline: 'Mika Elektrotechnik — sicher.',
    faqs: [
      { q: 'Kontakt zu Mika Elektrotechnik?', a: 'Rufen Sie uns an.' },
    ],
  });
  const issues = lintBrandNameInSiteData(data, data.name);
  const locations = issues.map(i => i.location);
  assert.ok(locations.includes('siteData.description'), 'description muss gemeldet werden.');
  assert.ok(locations.includes('siteData.tagline'), 'tagline muss gemeldet werden.');
  assert.ok(locations.includes('siteData.faqs[0].q'), 'faqs[0].q muss gemeldet werden.');
  assert.equal(issues.length, 3);
});

test('10. Leerer Markenname → Guard deaktiviert, keine false-positives', () => {
  const data = makeSiteData({ description: 'Ein kurzer Text.' });
  assert.deepEqual(lintBrandNameInSiteData(data, ''), []);
  assert.deepEqual(lintBrandNameInSiteData(data, ' '), []);
});

test('11. [Negativ — echter Bug] "Mika Elektrotechnik" Literal in description MUSS flaggen', () => {
  // Das ist der exakte Ausloeser aus dem Issue. Dieser Test haette den Bug vor dem Commit gefangen.
  const bugData = {
    name: 'Mika Elektrotechnik',
    description: 'Mika Elektrotechnik GmbH ist Ihr zuverlaessiger Elektrofachbetrieb.',
    url: 'https://mika-elektrotechnik.de',
    contact: {},
    legal: {},
  };
  const issues = lintBrandNameInSiteData(bugData, bugData.name);
  assert.ok(issues.length > 0, 'REGRESSION: description mit Literal-Brand-Name muss ein Issue erzeugen.');
  assert.equal(issues[0].type, 'prose_literal');
});

// ---------------------------------------------------------------------------
// Tests: lintBrandNameInRobotsTxt
// ---------------------------------------------------------------------------

test('7. robots.txt ohne Literal → keine Issues', () => {
  const distDir = makeTempDist(
    'User-agent: *\nDisallow: /admin/\nSitemap: https://mika-elektrotechnik.de/sitemap.xml\n',
  );
  try {
    const issues = lintBrandNameInRobotsTxt(distDir, 'Mika Elektrotechnik');
    assert.deepEqual(issues, []);
  } finally {
    rmSync(distDir, { recursive: true, force: true });
  }
});

test('8. robots.txt mit Literal → Issue vom Typ static_asset_literal', () => {
  const distDir = makeTempDist(
    '# Mika Elektrotechnik robots.txt\nUser-agent: *\nDisallow:\n',
  );
  try {
    const issues = lintBrandNameInRobotsTxt(distDir, 'Mika Elektrotechnik');
    assert.equal(issues.length, 1);
    assert.equal(issues[0].type, 'static_asset_literal');
    assert.equal(issues[0].location, 'dist/robots.txt');
    assert.equal(issues[0].count, 1);
  } finally {
    rmSync(distDir, { recursive: true, force: true });
  }
});

test('9. robots.txt nicht vorhanden → keine Issues, kein Crash', () => {
  const distDir = makeTempDist(null);
  try {
    const issues = lintBrandNameInRobotsTxt(distDir, 'Mika Elektrotechnik');
    assert.deepEqual(issues, []);
  } finally {
    rmSync(distDir, { recursive: true, force: true });
  }
});

test('10. Brand==Domain in Sitemap-URL → KEIN Issue (False-Positive-Guard)', () => {
  // Marke "mazterplan" == Domain-Root mazterplan.com. Die Sitemap-URL enthält den
  // Namen zwangsläufig — das darf NICHT als vermeidbares Prosa-Literal flaggen.
  const distDir = makeTempDist(
    'User-agent: *\nAllow: /\nDisallow: /review\n\nSitemap: https://mazterplan.com/sitemap-index.xml\n',
  );
  try {
    const issues = lintBrandNameInRobotsTxt(distDir, 'mazterplan');
    assert.deepEqual(issues, [], 'Domain in Sitemap-URL ist kein vermeidbares Literal');
  } finally {
    rmSync(distDir, { recursive: true, force: true });
  }
});

test('11. Brand im Kommentar wird trotz URL-Strip erkannt', () => {
  // Echtes Literal im Kommentar bleibt erfasst — nur http(s)-URLs werden ausgeklammert.
  const distDir = makeTempDist(
    '# mazterplan robots\nUser-agent: *\n\nSitemap: https://mazterplan.com/sitemap-index.xml\n',
  );
  try {
    const issues = lintBrandNameInRobotsTxt(distDir, 'mazterplan');
    assert.equal(issues.length, 1);
    assert.equal(issues[0].count, 1, 'nur das Kommentar-Literal, nicht die URL-Domain');
  } finally {
    rmSync(distDir, { recursive: true, force: true });
  }
});
