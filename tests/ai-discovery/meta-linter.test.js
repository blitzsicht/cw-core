// @ts-check
/**
 * Tests fuer den Meta-Laengen-Linter (Title/Description) in ai-discovery.
 *
 * Lauf: `node --test tests/ai-discovery/meta-linter.test.js`
 * Oder ueber Skript: `pnpm test`
 *
 * Issue: siluri/blitzsicht-ops#644
 * Ausloeser: zink-baeckerei `/festival/` wurde mit "Title 61 Zeichen > 60" gemeldet.
 * Der Title enthaelt `&` — als `&amp;` geschrieben. `extractTitle` zaehlte die rohe
 * Escape-Sequenz (5 Zeichen statt 1), `extractDescription` dekodierte daneben
 * ausdruecklich. Real hat der Title 57 Zeichen. Der Guard war der Fehler, nicht die Copy.
 * Zweite Luecke im selben Zug: Astro schreibt `&` im description-Attribut als `&#38;`,
 * die alte Dekodier-Tabelle kannte nur `&amp;` — fleet-weit 62 betroffene Descriptions.
 *
 * Abdeckung:
 *   1. Title knapp unter der Grenze, keine Entity → kein Issue
 *   2. Title 61 roh / 57 dekodiert (`&amp;`) → kein Issue (Gegenprobe zum echten Bug)
 *   3. Title real ueber der Grenze, keine Entity → title_too_long (Guard greift weiter)
 *   4. Numerische Entities im Title (`&#38;`, `&#x26;`) werden dekodiert
 *   5. Description mit `&#38;` knapp unter der Grenze → kein Issue (zweite Gegenprobe)
 *   6. Description real ueber der Grenze → description_too_long (mikas echter Befund)
 *   7. `&amp;lt;` zerfaellt nur eine Stufe (kein Mehrfach-Dekodieren)
 *   8. Kaputte numerische Entity bleibt Literal, kein Crash
 *   9. Fehlender/leerer Title und fehlende Description → *_missing
 *  10. Page-Pfad wird aus dem dist-Pfad korrekt abgeleitet
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { lintPageMeta } from '../../src/integrations/ai-discovery/index.ts';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MAX_TITLE = 60;
const MAX_DESC = 160;

/** Description-Fuelltext exakter Laenge (ASCII, damit die Laenge offensichtlich bleibt). */
function filler(len) {
  return 'x'.repeat(len);
}

/**
 * Schreibt eine dist-Page und lintet sie. Gibt { issues, cleanup } zurueck.
 * `pagePath` ist relativ zu dist, z.B. 'festival/index.html'.
 */
function lintHtml(html, pagePath = 'festival/index.html') {
  const distDir = join(tmpdir(), `cw-test-meta-${process.pid}-${Math.random().toString(36).slice(2)}`);
  const htmlPath = join(distDir, pagePath);
  mkdirSync(join(htmlPath, '..'), { recursive: true });
  writeFileSync(htmlPath, html, 'utf-8');
  try {
    return lintPageMeta(htmlPath, distDir, MAX_TITLE, MAX_DESC);
  } finally {
    rmSync(distDir, { recursive: true, force: true });
  }
}

/** Baut eine minimale Page mit gegebenem Title und gegebener Description. */
function page(title, description = filler(100)) {
  return [
    '<!DOCTYPE html><html lang="de"><head>',
    `<title>${title}</title>`,
    `<meta name="description" content="${description}">`,
    '</head><body></body></html>',
  ].join('\n');
}

const types = (issues) => issues.map((i) => i.type).sort();

// ---------------------------------------------------------------------------
// Title-Laenge
// ---------------------------------------------------------------------------

test('1. Title unter der Grenze ohne Entity → keine Issues', () => {
  const title = filler(57);
  assert.equal(title.length, 57);
  assert.deepEqual(lintHtml(page(title)), []);
});

test('2. Title 61 roh / 57 dekodiert (&amp;) → kein Issue — Gegenprobe zu zink /festival/', () => {
  // Exakt zinks Fall: "Festival — Baeckerstand fuer Feste & Events | Baeckerei Zink"
  const decoded = `${filler(56)}&`; // 57 Zeichen wie Google sie sieht
  const raw = decoded.replace('&', '&amp;'); // 61 Zeichen im HTML
  assert.equal(raw.length, 61);
  assert.equal(decoded.length, 57);

  const issues = lintHtml(page(raw));
  assert.deepEqual(issues, [], `Escape-Sequenz darf nicht mitgezaehlt werden, war: ${JSON.stringify(issues)}`);
});

test('3. Title real ueber der Grenze → title_too_long (Guard greift weiter)', () => {
  const issues = lintHtml(page(filler(61)));
  assert.deepEqual(types(issues), ['title_too_long']);
  assert.match(issues[0].detail, /61 Zeichen > 60/);
});

test('4. Numerische Entities im Title werden dekodiert', () => {
  for (const entity of ['&#38;', '&#x26;', '&#X26;']) {
    const raw = `${filler(56)}${entity}`;
    assert.deepEqual(lintHtml(page(raw)), [], `${entity} wurde nicht dekodiert`);
  }
});

// ---------------------------------------------------------------------------
// Description-Laenge
// ---------------------------------------------------------------------------

test('5. Description mit &#38; unter der Grenze → kein Issue (Astro-Attribut-Escaping)', () => {
  const decoded = `${filler(159)}&`; // 160 Zeichen — exakt an der Grenze
  const raw = decoded.replace('&', '&#38;'); // 164 Zeichen im HTML
  assert.equal(raw.length, 164);

  const issues = lintHtml(page(filler(30), raw));
  assert.deepEqual(issues, [], `&#38; darf nicht als 5 Zeichen zaehlen, war: ${JSON.stringify(issues)}`);
});

test('6. Description real ueber der Grenze → description_too_long — mikas /ueber-uns/', () => {
  const issues = lintHtml(page(filler(30), filler(177)));
  assert.deepEqual(types(issues), ['description_too_long']);
  assert.match(issues[0].detail, /177 Zeichen > 160/);
});

// ---------------------------------------------------------------------------
// Dekodier-Kanten
// ---------------------------------------------------------------------------

test('7. &amp;lt; zerfaellt nur eine Stufe — kein Mehrfach-Dekodieren', () => {
  // Dekodiert zu "&lt;" (4 Zeichen), nicht zu "<" (1 Zeichen).
  // 58 Fuellzeichen + 4 = 62 > 60 → muss flaggen.
  const issues = lintHtml(page(`${filler(58)}&amp;lt;`));
  assert.deepEqual(types(issues), ['title_too_long']);
  assert.match(issues[0].detail, /62 Zeichen > 60/);
});

test('8. Ungueltige numerische Entity bleibt Literal, kein Crash', () => {
  // 0x110000 liegt ausserhalb des Unicode-Bereichs → String.fromCodePoint wuerde werfen.
  // 55 Fuellzeichen + 10 Literal-Zeichen = 65. Waere die Entity dekodiert worden, waeren es 56.
  const issues = lintHtml(page(`${filler(55)}&#1114112;`));
  assert.deepEqual(types(issues), ['title_too_long']);
  assert.match(issues[0].detail, /65 Zeichen > 60/);
});

test('9. Unbekannte Named-Entity bleibt Literal', () => {
  // &copy; ist nicht in der Tabelle — bewusst klein gehalten, darf nicht still verschwinden.
  const issues = lintHtml(page(`${filler(55)}&copy;`));
  assert.deepEqual(types(issues), ['title_too_long']);
  assert.match(issues[0].detail, /61 Zeichen > 60/);
});

// ---------------------------------------------------------------------------
// Fehlende Felder / Pfad-Ableitung
// ---------------------------------------------------------------------------

test('10. Fehlender Title und fehlende Description → beide *_missing', () => {
  const html = '<!DOCTYPE html><html lang="de"><head><title>   </title></head><body></body></html>';
  assert.deepEqual(types(lintHtml(html)), ['description_missing', 'title_missing']);
});

test('11. Page-Pfad wird aus dem dist-Pfad abgeleitet', () => {
  const issues = lintHtml(page(filler(61)), 'festival/index.html');
  assert.equal(issues[0].page, '/festival/');

  const root = lintHtml(page(filler(61)), 'index.html');
  assert.equal(root[0].page, '/');
});
