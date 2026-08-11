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
import { lintBrandNameInSiteData, lintBrandNameInRobotsTxt, lintBrandNameInSeoSource, lintBrandNameInFaqSource } from '../../src/integrations/ai-discovery/index.ts';

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

test('4. Leistungen am Wert geprüft, FAQs NICHT (die macht der Quelltext-Check)', () => {
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
  const locations = issues.map((i) => i.location);

  // leistungen bleibt Wert-Check: dort ist "generisch formulieren" die richtige Antwort.
  assert.ok(locations.includes('siteData.leistungen[0].title'), 'leistungen muss weiter flaggen.');

  // FAQs nicht mehr — am Wert ist `${BRAND}` nicht von einem Literal zu unterscheiden,
  // und in einer FAQ gehört die Marke hin. Zuständig: lintBrandNameInFaqSource.
  assert.ok(
    !locations.some((l) => l.startsWith('siteData.faqs')),
    `FAQs dürfen hier nicht mehr auftauchen, bekam: ${locations.join(', ')}`,
  );
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
  // faqs[0].q ist hier bewusst NICHT dabei — siehe Case 4.
  assert.equal(issues.length, 2);
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

// ---------------------------------------------------------------------------
// Wortgrenzen (Fleet-Scan 2026-08-10, Issue #642)
//
// Der Zähler lief auf reinem indexOf — ohne Wortgrenze. Damit schlug jede Marke an,
// die als Teil eines deutschen Kompositums auftritt: "Haus am Lago" traf in
// "Privates Ferienhaus am Lago di Ledro" (hausamlago, siteData.description).
//
// Entscheidend ist die Rename-Probe der Konvention selbst: eine Umbenennung müsste
// diesen Satz NICHT anfassen — also ist er kein Literal. Unter --strict-warnings
// (#646) wäre daraus ein harter Build-Fail auf korrektem Deutsch geworden.
//
// Umgesetzt ist das über eine Unicode-taugliche isWordChar-Prüfung, NICHT über \b:
// \b ist ASCII-only, "ä"/"ü" gelten dort nicht als Wortzeichen. Case 14 hält das fest.
// ---------------------------------------------------------------------------

test('12. [Negativ — echter Bug] Marke als Kompositum-Teil → KEIN Issue', () => {
  // hausamlago: Marke "Haus am Lago", Prosa "Privates Ferienhaus am Lago di Ledro".
  // Der Treffer steckt in "Ferienhaus" — vermeidbar ist daran nichts.
  const data = makeSiteData({
    name: 'Haus am Lago',
    description: 'Privates Ferienhaus am Lago di Ledro, Trentino — ideale Basis für Angelurlaub.',
    tagline: 'Ferienhaus für Angler am Lago di Ledro.',
    faqs: [],
    leistungen: [],
  });
  const issues = lintBrandNameInSiteData(data, data.name);
  assert.deepEqual(
    issues,
    [],
    'REGRESSION: "Ferienhaus am Lago" ist kein Brand-Literal — der Name steht dort nicht als eigenes Wort.',
  );
});

test('13. Gegenprobe zu 12: dieselbe Marke freistehend → Issue', () => {
  // Ohne diesen Case könnte 12 auch dadurch grün sein, dass der Guard gar nichts mehr findet.
  const data = makeSiteData({
    name: 'Haus am Lago',
    description: 'Haus am Lago liegt direkt am Bergsee.',
    tagline: 'Angelurlaub im Trentino.',
    faqs: [],
    leistungen: [],
  });
  const issues = lintBrandNameInSiteData(data, data.name);
  assert.equal(issues.length, 1, 'Freistehender Markenname MUSS weiter flaggen.');
  assert.equal(issues[0].location, 'siteData.description');
  assert.equal(issues[0].count, 1);
});

test('14. Umlaut-Marke freistehend → Issue (Beweis gegen ASCII-\\b)', () => {
  // Mit /\bSachverständigenbüro …\b/ wäre die rechte Grenze nach "o" noch ok, die
  // linke aber bricht, sobald davor ein Umlaut steht. Der Case sichert ab, dass die
  // Grenzprüfung Unicode-Wortzeichen kennt und die Marke trotzdem gefunden wird.
  const data = makeSiteData({
    name: 'Sachverständigenbüro Gottl Richter Gomeier',
    description: 'Sachverständigenbüro Gottl Richter Gomeier bewertet Immobilien in Regensburg.',
    tagline: 'Unabhängig und IHK-zertifiziert.',
    faqs: [],
    leistungen: [],
  });
  const issues = lintBrandNameInSiteData(data, data.name);
  assert.equal(issues.length, 1, 'Marke mit Umlauten muss freistehend gefunden werden.');
  assert.equal(issues[0].count, 1);
});

test('15. Bindestrich-Anschluss → Issue (Bindestrich ist keine Wortgrenze-Ausnahme)', () => {
  // "Soleno GmbH-Team" ist ein echtes Literal: der Name steht als eigenes Wort da,
  // nur direkt gefolgt von einem Trennzeichen. Muss weiter flaggen.
  const data = makeSiteData({
    name: 'Soleno GmbH',
    description: 'Das Soleno GmbH-Team berät Sie zu Photovoltaik.',
    tagline: 'Mehr Ertrag. Weniger Kosten.',
    faqs: [],
    leistungen: [],
  });
  const issues = lintBrandNameInSiteData(data, data.name);
  assert.equal(issues.length, 1, 'Bindestrich hinter der Marke hebt das Literal nicht auf.');
  assert.equal(issues[0].count, 1);
});

test('16. [Negativ — echter Bug] robots.txt: Kompositum → KEIN Issue', () => {
  const distDir = makeTempDist(
    '# Ferienhaus am Lago di Ledro — Crawl-Regeln\nUser-agent: *\nAllow: /\n',
  );
  try {
    const issues = lintBrandNameInRobotsTxt(distDir, 'Haus am Lago');
    assert.deepEqual(issues, [], 'REGRESSION: "Ferienhaus am Lago" in robots.txt ist kein Literal.');
  } finally {
    rmSync(distDir, { recursive: true, force: true });
  }
});

test('17. Gegenprobe zu 16: freistehende Marke in robots.txt → Issue', () => {
  // Das ist die Zeile, die bei allen 6 Kunden aus #642 tatsächlich drinstand.
  const distDir = makeTempDist('# Haus am Lago robots.txt\nUser-agent: *\nAllow: /\n');
  try {
    const issues = lintBrandNameInRobotsTxt(distDir, 'Haus am Lago');
    assert.equal(issues.length, 1, 'Die Kommentarzeile aus #642 MUSS weiter flaggen.');
    assert.equal(issues[0].type, 'static_asset_literal');
    assert.equal(issues[0].count, 1);
  } finally {
    rmSync(distDir, { recursive: true, force: true });
  }
});


// ---------------------------------------------------------------------------
// Tests: seo-Block (blitzsicht-ops#647)
//
// Der Linter prüfte description/tagline/faqs/leistungen — aber nicht die Felder, aus
// denen die ausgelieferte <title>/<meta description> entsteht. donau-profi und platzfrei
// galten damit als sauber und hätten bei einer Umbenennung trotzdem Handarbeit gekostet.
// Fleet-Messung 10.08.2026: 31 Felder in 14 Repos.
//
// Zwei getrennte Checks, weil die Zielzustände verschieden sind:
//   - titleTemplate byte-gleich mit `%s | ${name}` → redundant, Feld kann weg (Wert-Check)
//   - Marke ausgeschrieben im seo-Block → interpolieren (QUELLTEXT-Check, s.u.)
// ---------------------------------------------------------------------------

test('18. titleTemplate identisch mit dem abgeleiteten Default → redundant_title_template', () => {
  const data = makeSiteData({ seo: { titleTemplate: '%s | Mika Elektrotechnik' } });
  const issues = lintBrandNameInSiteData(data, data.name);
  assert.equal(issues.length, 1, 'Genau ein Befund — nicht zusätzlich als Literal.');
  assert.equal(issues[0].type, 'redundant_title_template');
  assert.match(issues[0].detail, /BaseLayout|löschen/i);
});

test('19. [Negativ] Abweichendes Template ohne Literal → KEIN Issue', () => {
  // Kurzformen und andere Trennzeichen sind erlaubt: gottl "%s | GRG",
  // digital-direkt "%s | DD", preshot "%s · PRESHOT". Der Guard kennt die Absicht
  // nicht und darf hier nicht übergriffig werden.
  for (const tpl of ['%s | GRG', '%s · Elektro', '%s']) {
    const data = makeSiteData({ seo: { titleTemplate: tpl } });
    assert.deepEqual(lintBrandNameInSiteData(data, data.name), [], `"${tpl}" darf nicht flaggen.`);
  }
});

test('20. seo-Block fehlt komplett → kein Crash, keine Issues', () => {
  const data = makeSiteData();
  delete data.seo;
  assert.deepEqual(lintBrandNameInSiteData(data, data.name), []);
});

// --- Quelltext-Check: lintBrandNameInSeoSource --------------------------------

/** Schreibt eine site-data.ts in ein temp-srcDir und gibt den Dateipfad zurück. */
function makeSiteDataSource(seoBlockBody, { brandConst = null } = {}) {
  const dir = join(tmpdir(), `cw-test-src-${process.pid}-${Math.random().toString(36).slice(2)}`, 'data');
  mkdirSync(dir, { recursive: true });
  const file = join(dir, 'site-data.ts');
  writeFileSync(
    file,
    [
      brandConst ? `const BRAND = '${brandConst}';` : '',
      'export const siteData = {',
      `  name: ${brandConst ? 'BRAND' : "'Mika Elektrotechnik'"},`,
      "  description: 'Ihr Fachbetrieb.',",
      '  seo: {',
      seoBlockBody,
      '  },',
      '  contact: { phone: undefined },',
      '};',
    ].join('\n'),
    'utf-8',
  );
  return file;
}

test('21. Ausgeschriebene Marke in seo.defaultTitle → seo_literal mit Zeilennummer', () => {
  const file = makeSiteDataSource("    defaultTitle: 'Elektroinstallation Muenchen – Mika Elektrotechnik',");
  const issues = lintBrandNameInSeoSource(file, 'Mika Elektrotechnik');
  assert.equal(issues.length, 1);
  assert.equal(issues[0].type, 'seo_literal');
  assert.match(issues[0].location, /site-data\.ts:\d+ \(seo\.defaultTitle\)/);
  assert.match(issues[0].detail, /interpolieren/i);
});

test('22. [Kern von #647] Interpolierte Marke → KEIN Issue, obwohl der Wert identisch ist', () => {
  // Das ist der Grund, warum dieser Check den Quelltext liest und nicht das Objekt:
  // zur Laufzeit sind beide Strings gleich, nur einer ist rename-sicher.
  const file = makeSiteDataSource(
    '    defaultTitle: `Elektroinstallation Muenchen – ${BRAND}`,',
    { brandConst: 'Mika Elektrotechnik' },
  );
  assert.deepEqual(lintBrandNameInSeoSource(file, 'Mika Elektrotechnik'), []);
});

test('23. Mehrere seo-Felder ausgeschrieben → je ein Issue, count pro Zeile', () => {
  const file = makeSiteDataSource(
    [
      "    defaultDescription: 'Mika Elektrotechnik installiert in Muenchen.',",
      "    schemaDescription: 'Mika Elektrotechnik ist ein Meisterbetrieb. Mika Elektrotechnik seit 2019.',",
    ].join('\n'),
  );
  const issues = lintBrandNameInSeoSource(file, 'Mika Elektrotechnik');
  assert.deepEqual(
    issues.map((i) => [i.location.replace(/:\d+ /, ' '), i.count]),
    [['site-data.ts (seo.defaultDescription)', 1], ['site-data.ts (seo.schemaDescription)', 2]],
  );
});

test('24. [Negativ] Marke außerhalb des seo-Blocks → kein Issue aus diesem Check', () => {
  // name + description liegen außerhalb; die deckt der Prosa-Check ab. Doppelmeldung
  // würde die Fleet-Zahl aufblähen.
  const file = makeSiteDataSource("    defaultTitle: 'Elektroinstallation Muenchen',");
  assert.deepEqual(lintBrandNameInSeoSource(file, 'Mika Elektrotechnik'), []);
});

test('25. [Negativ] Marke nur im Kommentar → kein Issue', () => {
  const file = makeSiteDataSource(
    [
      '    // Bsp: "Elektriker Muenchen | Mika Elektrotechnik"',
      "    defaultTitle: 'Elektroinstallation Muenchen',",
    ].join('\n'),
  );
  assert.deepEqual(lintBrandNameInSeoSource(file, 'Mika Elektrotechnik'), []);
});

test('26. Kompositum im seo-Block → kein Issue (Wortgrenze gilt auch hier)', () => {
  const file = makeSiteDataSource("    defaultTitle: 'Privates Ferienhaus am Lago di Ledro',");
  assert.deepEqual(lintBrandNameInSeoSource(file, 'Haus am Lago'), []);
});

test('27. Datei fehlt oder kein seo-Block → leer, kein Crash', () => {
  assert.deepEqual(lintBrandNameInSeoSource('/pfad/gibt/es/nicht/site-data.ts', 'Mika Elektrotechnik'), []);
  const dir = join(tmpdir(), `cw-test-src-${process.pid}-noseo`, 'data');
  mkdirSync(dir, { recursive: true });
  const file = join(dir, 'site-data.ts');
  writeFileSync(file, "export const siteData = { name: 'Mika Elektrotechnik' };\n", 'utf-8');
  assert.deepEqual(lintBrandNameInSeoSource(file, 'Mika Elektrotechnik'), []);
});

// ---------------------------------------------------------------------------
// Tests: lintBrandNameInFaqSource (blitzsicht-ops#640)
//
// Der Wert-Check prüfte FAQs mit. Das traf aber nur Marken, deren siteData.name
// wörtlich in der Prosa steht — also einwortige. Gemessen 11.08.2026:
//   zink   name "Zink Bäckerei & Konditorei", FAQ "Wie viele Filialen hat Zink?" → 0
//   blitzsicht name "Blitzsicht",             FAQ "Was ist Blitzsicht?"          → 7
// Derselbe Stil, verschiedenes Urteil. Der Guard maß die Länge des Namens.
//
// In einer FAQ gehört die Marke hin (Entitäts-Definition für AI Overviews). Erfüllbar
// bleibt die Konvention über Interpolation — die ist nur im QUELLTEXT sichtbar.
// ---------------------------------------------------------------------------

/** Schreibt eine site-data.ts mit faqs-Block und gibt den Dateipfad zurück. */
function makeFaqSource(faqLines, { brandConst = null } = {}) {
  const dir = join(tmpdir(), `cw-test-faq-${process.pid}-${Math.random().toString(36).slice(2)}`, 'data');
  mkdirSync(dir, { recursive: true });
  const file = join(dir, 'site-data.ts');
  writeFileSync(
    file,
    [
      brandConst ? `const BRAND = '${brandConst}';` : '',
      'export const siteData = {',
      `  name: ${brandConst ? 'BRAND' : "'Mika Elektrotechnik'"},`,
      "  description: 'Ihr Fachbetrieb.',",
      '  faqs: [',
      faqLines,
      '  ],',
      '};',
    ].join('\n'),
    'utf-8',
  );
  return file;
}

test('29. [Gegenprobe] Ausgeschriebene Marke in einer FAQ → Issue', () => {
  // Ohne diesen Case wäre Case 30 auch dadurch grün, dass der Check gar nichts mehr findet.
  const file = makeFaqSource(
    [
      '    {',
      "      q: 'Was ist Mika Elektrotechnik?',",
      "      a: 'Mika Elektrotechnik ist Ihr Elektrofachbetrieb. Mika Elektrotechnik seit 2019.',",
      '    },',
    ].join('\n'),
  );
  const issues = lintBrandNameInFaqSource(file, 'Mika Elektrotechnik');
  assert.equal(issues.length, 2, 'q und a je ein Issue.');
  assert.equal(issues[0].type, 'prose_literal');
  assert.match(issues[0].location, /site-data\.ts:\d+ \(faqs\.q\)/);
  assert.equal(issues[1].count, 2, 'zwei Vorkommen in der a-Zeile.');
  assert.match(issues[1].detail, /interpolieren/i);
});

test('30. [Kern von #640] Interpolierte Marke in FAQ → KEIN Issue, obwohl der Wert gleich ist', () => {
  const file = makeFaqSource(
    [
      '    {',
      '      q: `Was ist ${BRAND}?`,',
      '      a: `${BRAND} ist Ihr Elektrofachbetrieb.`,',
      '    },',
    ].join('\n'),
    { brandConst: 'Mika Elektrotechnik' },
  );
  assert.deepEqual(
    lintBrandNameInFaqSource(file, 'Mika Elektrotechnik'),
    [],
    'Interpolation ist rename-sicher und muss durchgehen.',
  );
});

test('31. Gemischt: interpolierte und hartkodierte FAQ → nur die hartkodierte flaggt', () => {
  const file = makeFaqSource(
    [
      '    {',
      '      q: `Was ist ${BRAND}?`,',
      "      a: 'Mika Elektrotechnik ist Ihr Elektrofachbetrieb.',",
      '    },',
    ].join('\n'),
    { brandConst: 'Mika Elektrotechnik' },
  );
  const issues = lintBrandNameInFaqSource(file, 'Mika Elektrotechnik');
  assert.equal(issues.length, 1);
  assert.match(issues[0].location, /\(faqs\.a\)/);
});

test('32. Kompositum in FAQ → kein Issue (Wortgrenze gilt auch hier)', () => {
  const file = makeFaqSource(
    ["    { q: 'Wo liegt das Ferienhaus am Lago di Ledro?', a: 'Im Trentino.' },"].join('\n'),
  );
  assert.deepEqual(lintBrandNameInFaqSource(file, 'Haus am Lago'), []);
});

test('33. Marke nur im Kommentar innerhalb der FAQs → kein Issue', () => {
  const file = makeFaqSource(
    [
      '    // Mika Elektrotechnik: Reihenfolge nach Suchvolumen',
      "    { q: 'Wie schnell kommen Sie?', a: 'Binnen 24 Stunden.' },",
    ].join('\n'),
  );
  assert.deepEqual(lintBrandNameInFaqSource(file, 'Mika Elektrotechnik'), []);
});

test('34. Kein faqs-Block / Datei fehlt / leerer Markenname → leer, kein Crash', () => {
  assert.deepEqual(lintBrandNameInFaqSource('/pfad/gibt/es/nicht/site-data.ts', 'Mika Elektrotechnik'), []);

  const dir = join(tmpdir(), `cw-test-faq-${process.pid}-nofaq`, 'data');
  mkdirSync(dir, { recursive: true });
  const file = join(dir, 'site-data.ts');
  writeFileSync(file, "export const siteData = { name: 'Mika Elektrotechnik' };\n", 'utf-8');
  assert.deepEqual(lintBrandNameInFaqSource(file, 'Mika Elektrotechnik'), []);

  const withFaq = makeFaqSource("    { q: 'Was ist Mika Elektrotechnik?', a: 'Ein Betrieb.' },");
  assert.deepEqual(lintBrandNameInFaqSource(withFaq, ''), [], 'Leerer Markenname deaktiviert den Guard.');
});

test('35. [Ungleichbehandlung behoben] mehrwortige und einwortige Marke werden gleich behandelt', () => {
  // Das war der eigentliche Befund: der Wert-Check traf nur einwortige Marken.
  // Am Quelltext zählt jetzt allein, ob interpoliert wurde — unabhängig von der Namenslänge.
  const hardcodedShort = makeFaqSource("    { q: 'Was ist Blitzsicht?', a: 'Ein Website-Anbieter.' },");
  const hardcodedLong = makeFaqSource("    { q: 'Was ist Zink Bäckerei & Konditorei?', a: 'Eine Bäckerei.' },");
  assert.equal(lintBrandNameInFaqSource(hardcodedShort, 'Blitzsicht').length, 1, 'einwortig: flaggt');
  assert.equal(
    lintBrandNameInFaqSource(hardcodedLong, 'Zink Bäckerei & Konditorei').length,
    1,
    'mehrwortig: flaggt genauso',
  );

  const interpShort = makeFaqSource('    { q: `Was ist ${BRAND}?`, a: `Ein Website-Anbieter.` },', {
    brandConst: 'Blitzsicht',
  });
  assert.deepEqual(lintBrandNameInFaqSource(interpShort, 'Blitzsicht'), [], 'interpoliert: beide sauber');
});

test('28. Redundantes titleTemplate wird NICHT doppelt gemeldet', () => {
  // Der Wert-Check meldet es als redundant_title_template mit der Handlung "Feld löschen".
  // Würde der Quelltext-Check dieselbe Zeile zusätzlich als Literal melden, zählte ein
  // Fehler doppelt — und die Fleet-Zahl wäre um 7 zu hoch (Messung 10.08.2026).
  const file = makeSiteDataSource("    titleTemplate: '%s | Mika Elektrotechnik',");
  assert.deepEqual(lintBrandNameInSeoSource(file, 'Mika Elektrotechnik'), []);

  // Abweichendes Template MIT ausgeschriebener Marke bleibt ein Quelltext-Befund
  // (donau-profi: name "Donau-Profi", template "%s | Donau-Profi Gebäudereinigung").
  const diverging = makeSiteDataSource("    titleTemplate: '%s | Mika Elektrotechnik Muenchen',");
  const issues = lintBrandNameInSeoSource(diverging, 'Mika Elektrotechnik');
  assert.equal(issues.length, 1);
  assert.match(issues[0].location, /seo\.titleTemplate/);
});
