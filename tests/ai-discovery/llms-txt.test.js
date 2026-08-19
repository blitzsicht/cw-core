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
 *   8.-10. importantPageDepth: Standort-/Katalogseiten unterhalb der ersten
 *      Ebene, Label aus <title>, noindex greift auch in der Tiefe
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { resolveImportantPages, generateLlmsTxt } from '../../src/integrations/ai-discovery/index.ts';

const BASE = 'https://example.com';

/**
 * Legt eine temporäre dist/ mit index.html je Route an.
 * @param {Array<{route: string, noindex?: boolean, title?: string}>} pages
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
    const title = p.title ? `<title>${p.title}</title>` : '';
    const file = join(routeDir, 'index.html');
    writeFileSync(
      file,
      `<!doctype html><html><head>${robots}${title}</head><body></body></html>`,
      'utf-8',
    );
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

// ─── Eckdaten: Firmierung + Registerdaten (blitzsicht-ops#648) ──────────────
//
// mika und zink pflegten Firma, Handelsregister und USt-IdNr. in einer statischen
// public/llms.txt und legten sie per postbuild-cp über die generierte Datei —
// weil generateLlmsTxt diese Felder nicht ausgab. Damit fror die ausgelieferte
// Fassung auf einem Stand ein, den niemand mehr pflegte. Jetzt kommen sie aus
// siteData, und der cp kann weg.

const SITE = {
  name: 'Elektrotechnik Mika',
  description: 'Meisterbetrieb für Elektrotechnik.',
  url: 'https://elektro-mika.com',
  contact: { phone: '0160 91172381', email: 'info@elektro-mika.com' },
  legal: {
    street: 'Xaver-Winklmann-Straße 19',
    zip: '92444',
    city: 'Rötz',
    owner: 'Elektrotechnik Mika GmbH',
    registerNumber: 'HRB 21336',
    registerCourt: 'Amtsgericht Regensburg',
    ustIdNr: 'DE451598291',
    representatives: ['Kewin Mika'],
  },
};

test('generateLlmsTxt: Firma, Handelsregister und USt-IdNr. stehen in den Eckdaten', () => {
  const out = generateLlmsTxt(SITE, undefined, []);
  assert.match(out, /- Firma: Elektrotechnik Mika GmbH/);
  assert.match(out, /- Handelsregister: HRB 21336, Amtsgericht Regensburg/);
  assert.match(out, /- USt-IdNr\.: DE451598291/);
  assert.match(out, /- Vertretungsberechtigt: Kewin Mika/);
});

test('generateLlmsTxt: fehlende Rechtsform-Felder erzeugen keine leeren Zeilen', () => {
  // Kunden ohne gepflegtes Rechtsform-Schema (Einzelunternehmer) dürfen keine
  // "- Firma: undefined"-Zeilen bekommen.
  const out = generateLlmsTxt(
    { ...SITE, legal: { street: 'A 1', zip: '1', city: 'B' } },
    undefined,
    [],
  );
  assert.doesNotMatch(out, /Firma:|Handelsregister:|USt-IdNr|Vertretungsberechtigt/);
  assert.doesNotMatch(out, /undefined/);
});

test('generateLlmsTxt: Registergericht optional — Nummer allein reicht', () => {
  const legal = { ...SITE.legal, registerCourt: undefined };
  const out = generateLlmsTxt({ ...SITE, legal }, undefined, []);
  assert.match(out, /- Handelsregister: HRB 21336$/m, 'kein baumelndes Komma ohne Gericht');
});

test('generateLlmsTxt: leere USt-IdNr. wird weggelassen (zink pflegt sie als "")', () => {
  const legal = { ...SITE.legal, ustIdNr: '' };
  const out = generateLlmsTxt({ ...SITE, legal }, undefined, []);
  assert.doesNotMatch(out, /USt-IdNr/);
});

// ── importantPageDepth ────────────────────────────────────────────────────────
//
// Ausloeser: platzfrei.club (19.08.2026). Der gesamte inhaltliche Wert der Site
// liegt unter /studios/<studio>/ und /studios/<studio>/kurse/<kursart>/. Die
// llms.txt nannte davon nichts — aufgefuehrt waren Datenschutz und Impressum,
// null Treffer fuer Studio oder Kursart. Der Default (nur Top-Level) unterstellt,
// dass Detailseiten Leistungen sind; fuer Standort- und Katalogstrukturen
// stimmt das nicht.

test('8. Default-Tiefe laesst verschachtelte Seiten weiterhin draussen', () => {
  const { dir, files } = makeDist([
    { route: '/' },
    { route: '/impressum/' },
    { route: '/studios/victory-gym/', title: 'Kurse & Kursplan – Victory Gym | Marke' },
  ]);
  try {
    // Ohne viertes Argument muss sich nichts aendern — 23 bestehende Sites
    // haengen an diesem Verhalten.
    const pages = resolveImportantPages(files, dir, BASE);
    assert.equal(pages.length, 1, 'nur /impressum/');
    assert.ok(!pages.some((p) => p.href.includes('/studios/')), 'Tiefe 2 bleibt aussen vor');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('9. importantPageDepth nimmt tiefe Seiten auf, Label kommt aus dem <title>', () => {
  const { dir, files } = makeDist([
    { route: '/' },
    { route: '/impressum/' },
    { route: '/studios/victory-gym/', title: 'Kurse & Kursplan – Victory Gym | Marke' },
    {
      route: '/studios/victory-gym/kurse/spinning/',
      title: 'Spinning in Neutraubling bei Regensburg buchen | Marke',
    },
  ]);
  try {
    const pages = resolveImportantPages(files, dir, BASE, 4);
    const byHref = Object.fromEntries(pages.map((p) => [p.href, p.label]));

    assert.equal(byHref[`${BASE}/impressum/`], 'Impressum', 'Top-Level weiter per Slug-Label');
    // Das Marken-Suffix faellt weg: es steht in llms.txt schon in der H1.
    assert.equal(byHref[`${BASE}/studios/victory-gym/`], 'Kurse & Kursplan – Victory Gym');
    // „Spinning" allein waere wertlos — der Ort steht nur im Titel.
    assert.equal(
      byHref[`${BASE}/studios/victory-gym/kurse/spinning/`],
      'Spinning in Neutraubling bei Regensburg buchen',
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('10. noindex greift auch unterhalb der ersten Ebene', () => {
  const { dir, files } = makeDist([
    { route: '/' },
    { route: '/studios/geheim/', title: 'Nicht fuer den Index | Marke', noindex: true },
    { route: '/studios/offen/', title: 'Oeffentlich | Marke' },
  ]);
  try {
    const pages = resolveImportantPages(files, dir, BASE, 4);
    assert.equal(pages.length, 1, 'nur die indexierbare Seite');
    assert.equal(pages[0].href, `${BASE}/studios/offen/`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('11. Titel-Label wird aus HTML-Entitaeten zurueck in Text gewandelt', () => {
  // llms.txt ist eine Textdatei. „Kurse &amp; Kursplan" ist dort schlicht
  // falsch — im Markup ist der Titel korrekt escaped, im Label darf er es
  // nicht bleiben. Aufgefallen an platzfrei.club beim ersten echten Lauf.
  const { dir, files } = makeDist([
    { route: '/' },
    { route: '/studios/x/', title: 'Kurse &amp; Kursplan &#39;26 | Marke' },
  ]);
  try {
    const pages = resolveImportantPages(files, dir, BASE, 4);
    assert.equal(pages[0].label, "Kurse & Kursplan '26");
    assert.ok(!pages[0].label.includes('&amp;'), 'keine rohe Entitaet im Label');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
