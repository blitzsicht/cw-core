// @ts-check
/**
 * Tests für resolveImportantPages — die "Wichtige Seiten"-Liste in llms.txt.
 *
 * Lauf: `node --test tests/ai-discovery/llms-txt.test.js`
 * Oder über Skript: `pnpm test`
 *
 * Auslöser: customer-mazterplan (Single-Page-Produkt-Site) — die zuvor
 * hardcodeten Pfade /leistungen//faq//ueber-uns//kontakt erzeugten in der
 * generierten llms.txt 4 tote Links (404), weil diese Seiten nicht existieren.
 * Fix: Seiten aus den REAL gebauten dist/-Routen ableiten.
 *
 * Abdeckung:
 *   1. Happy-Path: echte Top-Level-Seiten → korrekte Labels/Hrefs, Homepage raus
 *   2. noindex-Seiten (z.B. /review) werden ausgeschlossen
 *   3. Detailseiten (Tiefe 2, z.B. /leistungen/solar/) werden ausgeschlossen
 *   4. REGRESSION gegen Phantom-Pages-Bug: dist nur mit / + /impressum →
 *      KEINE /faq//ueber-uns//kontakt//leistungen im Ergebnis
 *   5. Label-Fallback: unbekannter Slug → Title-Case
 *   6. Nur Homepage → leeres Ergebnis (Section wird in llms.txt weggelassen)
 *   7. Deterministische alphabetische Sortierung
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { resolveImportantPages } from '../../src/integrations/ai-discovery/index.ts';

const BASE = 'https://example.com';

/**
 * Legt eine temporäre dist/ mit index.html je Route an.
 * @param {Array<{route: string, noindex?: boolean}>} pages
 * @returns {{ dir: string, files: string[] }}
 */
function makeDist(pages) {
  const dir = join(tmpdir(), `cw-llms-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const files = [];
  for (const p of pages) {
    const sub = p.route.replace(/^\//, '').replace(/\/$/, '');
    const routeDir = sub ? join(dir, sub) : dir;
    mkdirSync(routeDir, { recursive: true });
    const robots = p.noindex ? '<meta name="robots" content="noindex, nofollow">' : '';
    const file = join(routeDir, 'index.html');
    writeFileSync(file, `<!doctype html><html><head>${robots}</head><body></body></html>`, 'utf-8');
    files.push(file);
  }
  return { dir, files };
}

test('1. Happy-Path: echte Top-Level-Seiten, Homepage ausgeschlossen', () => {
  const { dir, files } = makeDist([
    { route: '/' },
    { route: '/impressum/' },
    { route: '/datenschutz/' },
    { route: '/leistungen/' },
  ]);
  try {
    const pages = resolveImportantPages(files, dir, BASE);
    assert.equal(pages.length, 3, 'Homepage raus, 3 Top-Level übrig');
    const byHref = Object.fromEntries(pages.map((p) => [p.href, p.label]));
    assert.equal(byHref[`${BASE}/impressum/`], 'Impressum');
    assert.equal(byHref[`${BASE}/datenschutz/`], 'Datenschutz');
    assert.equal(byHref[`${BASE}/leistungen/`], 'Alle Leistungen');
    assert.ok(!pages.some((p) => p.href === `${BASE}/`), 'Homepage nicht in Liste');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('2. noindex-Seiten (/review) werden ausgeschlossen', () => {
  const { dir, files } = makeDist([
    { route: '/' },
    { route: '/impressum/' },
    { route: '/review/', noindex: true },
  ]);
  try {
    const pages = resolveImportantPages(files, dir, BASE);
    assert.ok(!pages.some((p) => p.href.includes('/review/')), '/review ist noindex → raus');
    assert.equal(pages.length, 1);
    assert.equal(pages[0].href, `${BASE}/impressum/`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('3. Detailseiten (Tiefe 2) werden ausgeschlossen', () => {
  const { dir, files } = makeDist([
    { route: '/' },
    { route: '/leistungen/' },
    { route: '/leistungen/solar/' },
  ]);
  try {
    const pages = resolveImportantPages(files, dir, BASE);
    assert.equal(pages.length, 1, 'nur Top-Level /leistungen/');
    assert.equal(pages[0].href, `${BASE}/leistungen/`);
    assert.ok(!pages.some((p) => p.href.includes('/solar/')), 'Detailseite raus');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('4. REGRESSION: keine Phantom-Pages bei Single-Page-Site', () => {
  // dist hat nur Homepage + Impressum — die alten hardcodeten 4 Links müssen WEG sein.
  const { dir, files } = makeDist([{ route: '/' }, { route: '/impressum/' }]);
  try {
    const pages = resolveImportantPages(files, dir, BASE);
    assert.equal(pages.length, 1);
    for (const phantom of ['/leistungen/', '/faq/', '/ueber-uns/', '/kontakt/']) {
      assert.ok(
        !pages.some((p) => p.href.endsWith(phantom)),
        `Phantom-Link ${phantom} darf nicht erscheinen`,
      );
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('5. Label-Fallback: unbekannter Slug → Title-Case', () => {
  const { dir, files } = makeDist([{ route: '/' }, { route: '/mein-bereich/' }]);
  try {
    const pages = resolveImportantPages(files, dir, BASE);
    assert.equal(pages.length, 1);
    assert.equal(pages[0].label, 'Mein Bereich');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('6. Nur Homepage → leeres Ergebnis', () => {
  const { dir, files } = makeDist([{ route: '/' }]);
  try {
    const pages = resolveImportantPages(files, dir, BASE);
    assert.equal(pages.length, 0, 'keine Sub-Pages → Section entfällt');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('7. Deterministische alphabetische Sortierung', () => {
  const { dir, files } = makeDist([
    { route: '/' },
    { route: '/kontakt/' },
    { route: '/datenschutz/' },
    { route: '/impressum/' },
  ]);
  try {
    const pages = resolveImportantPages(files, dir, BASE);
    const hrefs = pages.map((p) => p.href);
    assert.deepEqual(hrefs, [
      `${BASE}/datenschutz/`,
      `${BASE}/impressum/`,
      `${BASE}/kontakt/`,
    ]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
