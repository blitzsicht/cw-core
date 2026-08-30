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
 *   12.-14. cw-core#105: Tiefe-1-Seiten bekommen ihren <title> statt des
 *      titelisierten Slugs — „Din 5008" war eine falsch geschriebene Norm
 *   15.-21. cw-core#105: Volltext der Seiten in llms-full.txt
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  resolveImportantPages,
  generateLlmsTxt,
  generateLlmsFullTxt,
  extractPageText,
  collectPageTexts,
} from '../../src/integrations/ai-discovery/index.ts';

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

// ─── cw-core#105: Tiefe-1-Seiten verlieren ihren Titel ─────────────────────────
//
// Gemessen an falzmarke.com am 30.08.2026: „Din 5008" statt „DIN 5008: alle
// Regeln mit Quellenangabe", „Brief Mit Ki" statt „Briefe mit KI, ohne dass man
// es merkt". Eine Norm und eine Abkuerzung, beide falsch geschrieben, in genau
// der Datei, die Sprachmodelle als Erstes lesen.

test('12. Tiefe-1-Seite bekommt ihren <title> statt des titelisierten Slugs', () => {
  const { dir, files } = makeDist([
    { route: '/' },
    { route: '/din-5008/', title: 'DIN 5008: alle Regeln mit Quellenangabe | falzmarke' },
    { route: '/brief-mit-ki/', title: 'Briefe mit KI, ohne dass man es merkt | falzmarke' },
  ]);
  try {
    const pages = resolveImportantPages(files, dir, BASE);
    const byHref = Object.fromEntries(pages.map((p) => [p.href, p.label]));
    assert.equal(byHref[`${BASE}/din-5008/`], 'DIN 5008: alle Regeln mit Quellenangabe');
    assert.equal(byHref[`${BASE}/brief-mit-ki/`], 'Briefe mit KI, ohne dass man es merkt');
    // Die alte Fassung lieferte genau diese beiden Zeichenketten — sie sind der
    // Gegenbeweis: vor dem Fix ist dieser Test rot, nicht nur "irgendwie anders".
    assert.ok(!pages.some((p) => p.label === 'Din 5008'), 'kein titelisierter Slug mehr');
    assert.ok(!pages.some((p) => p.label === 'Brief Mit Ki'), 'kein titelisierter Slug mehr');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('13. Ohne <title> greift auf Tiefe 1 weiter die Map, dann Title-Case', () => {
  // Der Rueckfall muss erreichbar bleiben — sonst waere Test 1 und 5 nur deshalb
  // gruen, weil dort ohnehin nie ein Titel steht.
  const { dir, files } = makeDist([
    { route: '/' },
    { route: '/impressum/' }, // in IMPORTANT_PAGE_LABELS
    { route: '/mein-bereich/' }, // nicht in der Map → Title-Case
  ]);
  try {
    const pages = resolveImportantPages(files, dir, BASE);
    const byHref = Object.fromEntries(pages.map((p) => [p.href, p.label]));
    assert.equal(byHref[`${BASE}/impressum/`], 'Impressum', 'Map-Rueckfall greift');
    assert.equal(byHref[`${BASE}/mein-bereich/`], 'Mein Bereich', 'Title-Case-Rueckfall greift');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('14. Entitaeten und ·-Trenner wirken jetzt auch auf Tiefe 1', () => {
  const { dir, files } = makeDist([
    { route: '/' },
    { route: '/kurse/', title: 'Kurse &amp; Kursplan &#39;26 · Marke' },
    // Gedankenstrich gehoert zum Titel, nur | und · trennen die Marke ab.
    { route: '/falzmarken/', title: 'Falzmarken bei 105 und 210 mm — warum dort | falzmarke' },
  ]);
  try {
    const pages = resolveImportantPages(files, dir, BASE);
    const byHref = Object.fromEntries(pages.map((p) => [p.href, p.label]));
    assert.equal(byHref[`${BASE}/kurse/`], "Kurse & Kursplan '26");
    assert.equal(
      byHref[`${BASE}/falzmarken/`],
      'Falzmarken bei 105 und 210 mm — warum dort',
      'Gedankenstrich bleibt, Marke faellt',
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ─── cw-core#105: Volltext der Seiten in llms-full.txt ─────────────────────────
//
// llms-full.txt trug bis v0.142.0 Unternehmensdaten und FAQ, aber keinen
// Seiteninhalt: bei falzmarke 2828 Bytes fuer 20 Seiten, von denen einzelne
// ueber 1400 Woerter haben.

/**
 * dist/ mit echtem Seitenkoerper — makeDist oben schreibt einen leeren <body>.
 * @param {Array<{route: string, title?: string, main?: string, body?: string, noindex?: boolean}>} pages
 * @returns {{ dir: string, files: string[] }}
 */
function makeDistWithMain(pages) {
  const dir = join(tmpdir(), `cw-full-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const files = [];
  for (const p of pages) {
    const sub = p.route.replace(/^\//, '').replace(/\/$/, '');
    const routeDir = sub ? join(dir, sub) : dir;
    mkdirSync(routeDir, { recursive: true });
    const robots = p.noindex ? '<meta name="robots" content="noindex, nofollow">' : '';
    const title = p.title ? `<title>${p.title}</title>` : '';
    const body = p.main !== undefined ? `<main>${p.main}</main>` : (p.body ?? '');
    const file = join(routeDir, 'index.html');
    writeFileSync(
      file,
      `<!doctype html><html><head>${robots}${title}</head><body><nav>Menue Start Kontakt</nav>${body}<footer>Impressum Datenschutz</footer></body></html>`,
      'utf-8',
    );
    files.push(file);
  }
  return { dir, files };
}

const LANG = 'Die Falzmarke sitzt bei 105 Millimetern, weil der Bogen dort in drei gleiche Teile faellt und die Anschrift im Fenster steht.';

test('15. extractPageText: <main> schlaegt <body>, Navigation und Fuss bleiben draussen', () => {
  const html = `<!doctype html><html><head><title>T | Marke</title></head><body><nav>NAVIGATION_MARKER</nav><main><p>${LANG}</p></main><footer>FUSS_MARKER</footer></body></html>`;
  const got = extractPageText(html);
  assert.ok(got, 'Seite liefert Text');
  assert.equal(got.title, 'T', 'Marken-Suffix faellt weg');
  assert.ok(got.text.includes('105 Millimetern'), 'Hauptinhalt ist drin');
  assert.ok(!got.text.includes('NAVIGATION_MARKER'), 'Navigation raus');
  assert.ok(!got.text.includes('FUSS_MARKER'), 'Fusszeile raus');
});

test('16. extractPageText: Script/Style raus, Ueberschriften und Listen bleiben', () => {
  const html =
    `<html><head><title>T</title></head><body><main>` +
    `<script>const GEHEIM = "SKRIPT_MARKER";</script>` +
    `<style>.x{content:"STIL_MARKER"}</style>` +
    `<h2>Was die Norm verlangt</h2><p>${LANG}</p>` +
    `<ul><li>Erstes</li><li>Zweites</li></ul>` +
    `<table><tr><th>Mass</th><th>Soll</th></tr><tr><td>Falzmarke</td><td>105 mm</td></tr></table>` +
    `</main></body></html>`;
  const got = extractPageText(html);
  assert.ok(got);
  assert.ok(!got.text.includes('SKRIPT_MARKER'), 'Skript-Inhalt raus');
  assert.ok(!got.text.includes('STIL_MARKER'), 'Stil-Inhalt raus');
  assert.ok(got.text.includes('#### Was die Norm verlangt'), 'h2 wird Markdown-Ueberschrift');
  assert.ok(got.text.includes('- Erstes'), 'Listenpunkt bleibt Listenpunkt');
  assert.ok(got.text.includes('Falzmarke | 105 mm'), 'Tabellenzeile bleibt eine Zeile');
  assert.ok(!/<[a-z]/i.test(got.text), 'kein Markup mehr im Text');
});

test('17. extractPageText: Entitaeten werden Text, zu kurze Seiten liefern null', () => {
  const lang = `<html><head><title>T</title></head><body><main><p>Kurse &amp; Kursplan &#39;26. ${LANG}</p></main></body></html>`;
  const got = extractPageText(lang);
  assert.ok(got);
  assert.ok(got.text.includes("Kurse & Kursplan '26"), 'Entitaet dekodiert');
  assert.ok(!got.text.includes('&amp;'), 'keine rohe Entitaet');

  // Gegenprobe: eine praktisch leere Seite darf keinen leeren Abschnitt erzeugen.
  const kurz = `<html><head><title>T</title></head><body><main><p>Hallo</p></main></body></html>`;
  assert.equal(extractPageText(kurz), null, 'zu kurz → null, kein leerer Abschnitt');
});

test('18. collectPageTexts: noindex raus, Reihenfolge Startseite → Tiefe 1 → Tiefe 2', () => {
  const { dir, files } = makeDistWithMain([
    { route: '/briefe/kuendigung/', title: 'Kuendigung | M', main: `<p>${LANG}</p>` },
    { route: '/zuletzt/', title: 'Zuletzt | M', main: `<p>${LANG}</p>` },
    { route: '/', title: 'Start | M', main: `<p>${LANG}</p>` },
    { route: '/aaa/', title: 'Aaa | M', main: `<p>${LANG}</p>` },
    { route: '/versteckt/', title: 'Versteckt | M', main: `<p>${LANG}</p>`, noindex: true },
  ]);
  try {
    const got = collectPageTexts(files, dir, BASE, 524288);
    assert.deepEqual(
      got.pages.map((p) => p.url),
      [`${BASE}/`, `${BASE}/aaa/`, `${BASE}/zuletzt/`, `${BASE}/briefe/kuendigung/`],
      'Startseite zuerst, dann Tiefe 1 alphabetisch, dann Tiefe 2',
    );
    assert.ok(!got.pages.some((p) => p.url.includes('versteckt')), 'noindex raus');
    assert.deepEqual(got.dropped, [], 'nichts gekappt bei grossem Budget');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('19. collectPageTexts: Budget greift und nennt die ausgelassenen URLs', () => {
  const { dir, files } = makeDistWithMain([
    { route: '/', title: 'Start | M', main: `<p>${LANG}</p>` },
    { route: '/aaa/', title: 'Aaa | M', main: `<p>${LANG}</p>` },
    { route: '/bbb/', title: 'Bbb | M', main: `<p>${LANG}</p>` },
    { route: '/ccc/', title: 'Ccc | M', main: `<p>${LANG}</p>` },
  ]);
  try {
    // Gegenprobe A: grosses Budget → alle vier drin, dropped leer.
    const weit = collectPageTexts(files, dir, BASE, 524288);
    assert.equal(weit.pages.length, 4);
    assert.equal(weit.dropped.length, 0);

    // Gegenprobe B: Budget fuer knapp zwei Seiten → zwei drin, zwei NAMENTLICH raus.
    const eng = collectPageTexts(files, dir, BASE, 400);
    assert.equal(eng.pages.length, 2, 'zwei passen ins Budget');
    assert.deepEqual(eng.dropped, [`${BASE}/bbb/`, `${BASE}/ccc/`], 'Rest namentlich gemeldet');
    assert.equal(eng.pages.length + eng.dropped.length, 4, 'keine Seite geht still verloren');

    // Gegenprobe C: 0 schaltet ab — und meldet dann auch nichts als "ausgelassen".
    const aus = collectPageTexts(files, dir, BASE, 0);
    assert.deepEqual(aus, { pages: [], dropped: [] });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

const FULL_DATA = {
  name: 'Marke',
  url: BASE,
  description: 'Beschreibung',
  contact: {},
  legal: {},
};

test('20. generateLlmsFullTxt traegt den Seitentext, nicht nur FAQ und Eckdaten', () => {
  const collected = {
    pages: [{ url: `${BASE}/falzmarken/`, title: 'Falzmarken bei 105 mm', text: LANG }],
    dropped: [],
  };
  const mit = generateLlmsFullTxt(FULL_DATA, undefined, undefined, collected);
  assert.ok(mit.includes('## Seiten im Volltext'), 'Abschnitt ist da');
  assert.ok(mit.includes('### Falzmarken bei 105 mm'), 'Seitentitel als Ueberschrift');
  assert.ok(mit.includes(`URL: ${BASE}/falzmarken/`), 'URL steht daneben');
  assert.ok(mit.includes('105 Millimetern'), 'der Satz steht wirklich in der Datei');

  // Gegenbeweis: ohne Seiten fehlt der Abschnitt komplett — genau der Zustand,
  // den falzmarke.com heute ausliefert (2828 Bytes, kein Seiteninhalt).
  const ohne = generateLlmsFullTxt(FULL_DATA, undefined, undefined);
  assert.ok(!ohne.includes('## Seiten im Volltext'), 'ohne Seiten kein Abschnitt');
  assert.ok(!ohne.includes('105 Millimetern'), 'und kein Seitentext');
});

test('21. generateLlmsFullTxt nennt eine Kappung IN der Datei, nicht nur im Log', () => {
  const collected = {
    pages: [{ url: `${BASE}/a/`, title: 'A', text: LANG }],
    dropped: [`${BASE}/b/`, `${BASE}/c/`],
  };
  const txt = generateLlmsFullTxt(FULL_DATA, undefined, undefined, collected);
  assert.ok(txt.includes('Byte-Budget'), 'die Kappung wird benannt');
  assert.ok(txt.includes(`${BASE}/b/`) && txt.includes(`${BASE}/c/`), 'beide URLs stehen da');

  // Gegenprobe: ohne Kappung steht der Hinweis NICHT da — sonst waere er Deko.
  const sauber = generateLlmsFullTxt(FULL_DATA, undefined, undefined, {
    pages: collected.pages,
    dropped: [],
  });
  assert.ok(!sauber.includes('Byte-Budget'), 'kein Hinweis ohne Kappung');
});

test('22. extractPageText: HTML-Kommentare und mehrzeilige Ueberschriften', () => {
  // Beides an falzmarkes Startseite gemessen (30.08.2026), bevor es gefixt war:
  // eine interne Notiz ueber ein totes Tracking-Event stand im Volltext, und die
  // H1 zerfiel am <br> in zwei Zeilen — die zweite davon keine Ueberschrift mehr.
  const html =
    `<html><head><title>T</title></head><body><main>` +
    `<!-- NOTIZ_MARKER: Guard: tests/ai-discovery/cta-double-fire.test.js. -->` +
    `<h1>Briefe schreiben mit KI —<br><span>nach Norm, nicht nach Gefuehl.</span></h1>` +
    `<p>${LANG}</p>` +
    `</main></body></html>`;
  const got = extractPageText(html);
  assert.ok(got);
  assert.ok(!got.text.includes('NOTIZ_MARKER'), 'interne Notiz raus');
  assert.ok(!got.text.includes('cta-double-fire'), 'auch der Test-Pfad darin raus');
  assert.ok(
    got.text.includes('#### Briefe schreiben mit KI — nach Norm, nicht nach Gefuehl.'),
    'Ueberschrift bleibt EINE Zeile',
  );
  // Gegenprobe: keine Zeile, die mit Text statt mit # beginnt und zur H1 gehoert.
  assert.ok(
    !got.text.split('\n').some((l) => l.trim() === 'nach Norm, nicht nach Gefuehl.'),
    'kein abgerissener Ueberschriften-Rest als eigene Zeile',
  );
});
