// @ts-check
/**
 * Tests für den Asset-Format-Guard (lintSourceAssetFormat + sniffImageFormat).
 *
 * Lauf: `node --test tests/ai-discovery/asset-format-linter.test.js`
 *
 * Auslöser (blitzsicht-ops#651): zwei Kunden, ein Fehlertyp — die Dateiendung lügt über
 * den Inhalt. gottls `rics.png` war 212 Byte HTML (Incapsula-Bot-Schutz statt Bild),
 * stellers `hero.webp` ein 1257-KB-PNG. Der zweite Fall verschwand still aus der
 * Fleet-Basiszahl, als die Bild-Pipeline anfing, echte WebP-Derivate zu erzeugen: der
 * Geotag-Guard sieht nur dist/, und dort war alles in Ordnung.
 *
 * Abdeckung:
 *   1. PNG-Bytes als .webp → Befund            ← der echte Bug; ohne ihn wäre jedes Grün leer
 *   2. HTML als .png → Befund „kein Bild"      ← gottls Fall (AC 4)
 *   3. HTML als .svg → Befund
 *   4. SVG mit <!-- … -->-Header → KEIN Befund ← die 4 gemessenen Falsch-Positiven (zink)
 *   5. SVG mit BOM + <?xml ?> → kein Befund
 *   6. Korrekt benannte PNG/WebP/JPEG/GIF/ICO → still
 *   7. .jpg und .jpeg tragen beide JPEG → still
 *   8. Leere Datei → Befund `empty`
 *   9. Fehlendes Verzeichnis → leer, kein Crash
 *  10. Nicht-Bild-Endungen (.txt/.pdf/.md) → ignoriert
 *  11. checked zählt die WIRKLICH gelesenen Dateien (Vorbedingungs-Beleg)
 *  12. Cursor als .ico → Befund (00 00 02 00 ist kein Icon)
 *  13. Unterverzeichnisse werden mitgenommen, node_modules/dist nicht
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { lintSourceAssetFormat } from '../../src/integrations/ai-discovery/index.ts';
import { sniffImageFormat, expectedFormatForExt } from '../../src/utils/image-format.js';

// ── Echte Datei-Header (die ersten Bytes sind das, worauf es ankommt) ──────────
const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(64, 0x11),
]);
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 0x22)]);
const WEBP = Buffer.concat([
  Buffer.from('RIFF', 'latin1'),
  Buffer.from([0x40, 0x00, 0x00, 0x00]),
  Buffer.from('WEBPVP8 ', 'latin1'),
  Buffer.alloc(64, 0x33),
]);
const GIF = Buffer.concat([Buffer.from('GIF89a', 'latin1'), Buffer.alloc(64, 0x44)]);
const ICO = Buffer.concat([Buffer.from([0x00, 0x00, 0x01, 0x00, 0x01, 0x00]), Buffer.alloc(64, 0x55)]);
const CUR = Buffer.concat([Buffer.from([0x00, 0x00, 0x02, 0x00, 0x01, 0x00]), Buffer.alloc(64, 0x55)]);
const AVIF = Buffer.concat([
  Buffer.from([0x00, 0x00, 0x00, 0x20]),
  Buffer.from('ftypavif', 'latin1'),
  Buffer.alloc(64, 0x66),
]);

const SVG_PLAIN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="M0 0h10v10z"/></svg>';
// Genau die Form, die 4 Falsch-Positive erzeugt hat: zinks Logo beginnt mit einem
// mehrzeiligen Kommentar über die Illustrator-Herkunft, erst danach kommt <svg>.
const SVG_COMMENT_HEADER = `<!-- Zink Baeckerei & Konditorei — offizielles Logo (Adobe-Illustrator-Pfade,
     Quelle: "Logodateien Zink/Logovarianten/logo_baeckerei_zink_pfade.pdf", uebernommen 2026-08-07).
     Variante fuer helle Hintergruende. -->
${SVG_PLAIN}`;
const SVG_BOM_XMLDECL = `﻿<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">\n${SVG_PLAIN}`;
// gottls rics.png: kein Bild, sondern die Bot-Schutz-Seite des Herkunftsservers.
const HTML_BOTWALL = '<!DOCTYPE html>\n<html><head><meta charset="utf-8"><title>Request unsuccessful.</title></head><body>Incapsula incident ID: 0-1234</body></html>';

/** Legt ein temporäres Quellverzeichnis an und schreibt {name: inhalt} hinein. */
function makeAssetDir(files) {
  const root = mkdtempSync(join(tmpdir(), 'asset-format-'));
  for (const [name, content] of Object.entries(files)) {
    const full = join(root, name);
    mkdirSync(join(full, '..'), { recursive: true });
    writeFileSync(full, content);
  }
  return root;
}

// ── 1. Der echte Bug ──────────────────────────────────────────────────────────
test('PNG-Bytes unter .webp-Endung werden gemeldet', () => {
  const dir = makeAssetDir({ 'images/hero/hero.webp': PNG });
  try {
    const { issues, checked } = lintSourceAssetFormat([dir]);
    assert.equal(checked, 1);
    assert.equal(issues.length, 1);
    assert.equal(issues[0].expected, 'webp');
    assert.equal(issues[0].actual, 'png');
    assert.match(issues[0].file, /hero\.webp$/);
    assert.equal(issues[0].bytes, PNG.length);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ── 2./3. Gar kein Bild (AC 4) ────────────────────────────────────────────────
test('HTML unter .png-Endung wird als "kein Bild" gemeldet', () => {
  const dir = makeAssetDir({ 'images/badges/rics.png': HTML_BOTWALL });
  try {
    const { issues } = lintSourceAssetFormat([dir]);
    assert.equal(issues.length, 1);
    assert.equal(issues[0].actual, 'html');
    assert.equal(issues[0].expected, 'png');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('HTML unter .svg-Endung wird gemeldet', () => {
  const dir = makeAssetDir({ 'images/badges/rics.svg': HTML_BOTWALL });
  try {
    const { issues } = lintSourceAssetFormat([dir]);
    assert.equal(issues.length, 1);
    assert.equal(issues[0].actual, 'html');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ── 4./5. Die gemessenen Falsch-Positiven dürfen NICHT wiederkommen ───────────
test('SVG mit vorangestelltem Kommentar-Header ist kein Befund', () => {
  const dir = makeAssetDir({
    'logo.svg': SVG_COMMENT_HEADER,
    'logo-dark.svg': SVG_COMMENT_HEADER,
  });
  try {
    const { issues, checked } = lintSourceAssetFormat([dir]);
    assert.equal(checked, 2);
    assert.deepEqual(issues, []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('SVG mit BOM, XML-Deklaration und SVG-DOCTYPE ist kein Befund', () => {
  const dir = makeAssetDir({ 'icon.svg': SVG_BOM_XMLDECL, 'plain.svg': SVG_PLAIN });
  try {
    const { issues } = lintSourceAssetFormat([dir]);
    assert.deepEqual(issues, []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ── 6./7. Korrekt benannte Dateien bleiben still ──────────────────────────────
test('korrekt benannte Bilder aller Formate melden nichts', () => {
  const dir = makeAssetDir({
    'a.png': PNG,
    'b.jpg': JPEG,
    'c.jpeg': JPEG,
    'd.webp': WEBP,
    'e.gif': GIF,
    'f.ico': ICO,
    'g.avif': AVIF,
    'h.svg': SVG_PLAIN,
  });
  try {
    const { issues, checked } = lintSourceAssetFormat([dir]);
    assert.equal(checked, 8);
    assert.deepEqual(issues, []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ── 8. Leere Datei ────────────────────────────────────────────────────────────
test('leere Datei wird gemeldet statt als Bild durchgewinkt', () => {
  const dir = makeAssetDir({ 'kaputt.webp': Buffer.alloc(0) });
  try {
    const { issues } = lintSourceAssetFormat([dir]);
    assert.equal(issues.length, 1);
    assert.equal(issues[0].actual, 'empty');
    assert.equal(issues[0].bytes, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ── 9. Robustheit ─────────────────────────────────────────────────────────────
test('fehlendes Verzeichnis liefert leer und crasht nicht', () => {
  const { issues, checked } = lintSourceAssetFormat([
    join(tmpdir(), 'gibt-es-nicht-asset-format'),
    '',
  ]);
  assert.deepEqual(issues, []);
  assert.equal(checked, 0);
});

// ── 10. Nicht-Bilder ignorieren ───────────────────────────────────────────────
test('Dateien ohne prüfbare Bild-Endung werden nicht angefasst', () => {
  const dir = makeAssetDir({
    'readme.md': '# kein Bild',
    'daten.txt': 'auch nicht',
    'vertrag.pdf': '%PDF-1.7\n',
    'echt.png': PNG,
  });
  try {
    const { issues, checked } = lintSourceAssetFormat([dir]);
    assert.equal(checked, 1, 'nur die .png zählt als geprüft');
    assert.deepEqual(issues, []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ── 11./13. Zählwert und Geltungsbereich ──────────────────────────────────────
test('checked zählt über mehrere Wurzeln und Unterverzeichnisse, überspringt Build-Ordner', () => {
  const a = makeAssetDir({
    'top.png': PNG,
    'tief/tiefer/nested.webp': WEBP,
    'node_modules/paket/ignoriert.png': HTML_BOTWALL,
    'dist/gebaut.webp': PNG,
  });
  const b = makeAssetDir({ 'zweite-wurzel.jpg': JPEG });
  try {
    const { issues, checked } = lintSourceAssetFormat([a, b]);
    assert.equal(checked, 3, 'top + nested + zweite Wurzel; node_modules und dist nicht');
    assert.deepEqual(issues, [], 'die kaputten Dateien liegen in übersprungenen Ordnern');
  } finally {
    rmSync(a, { recursive: true, force: true });
    rmSync(b, { recursive: true, force: true });
  }
});

// ── 12. Cursor ist kein Icon ──────────────────────────────────────────────────
test('Cursor-Datei unter .ico-Endung wird gemeldet', () => {
  const dir = makeAssetDir({ 'favicon.ico': CUR });
  try {
    const { issues } = lintSourceAssetFormat([dir]);
    assert.equal(issues.length, 1);
    assert.equal(issues[0].expected, 'ico');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ── Sniffer direkt (rein, ohne Dateisystem) ───────────────────────────────────
test('sniffImageFormat erkennt die Binärformate an ihren Magic Bytes', () => {
  assert.equal(sniffImageFormat(PNG), 'png');
  assert.equal(sniffImageFormat(JPEG), 'jpeg');
  assert.equal(sniffImageFormat(WEBP), 'webp');
  assert.equal(sniffImageFormat(GIF), 'gif');
  assert.equal(sniffImageFormat(ICO), 'ico');
  assert.equal(sniffImageFormat(AVIF), 'avif');
  assert.equal(sniffImageFormat(Buffer.alloc(0)), 'empty');
});

test('sniffImageFormat trennt SVG von HTML, auch hinter Kommentaren', () => {
  assert.equal(sniffImageFormat(Buffer.from(SVG_PLAIN)), 'svg');
  assert.equal(sniffImageFormat(Buffer.from(SVG_COMMENT_HEADER)), 'svg');
  assert.equal(sniffImageFormat(Buffer.from(SVG_BOM_XMLDECL)), 'svg');
  assert.equal(sniffImageFormat(Buffer.from(HTML_BOTWALL)), 'html');
  assert.equal(sniffImageFormat(Buffer.from('<html><body>x</body></html>')), 'html');
});

test('RIFF ohne WEBP-Marker ist kein WebP', () => {
  const riffWave = Buffer.concat([
    Buffer.from('RIFF', 'latin1'),
    Buffer.from([0x40, 0x00, 0x00, 0x00]),
    Buffer.from('WAVEfmt ', 'latin1'),
  ]);
  assert.notEqual(sniffImageFormat(riffWave), 'webp');
});

test('expectedFormatForExt kennt nur eindeutige Endungen', () => {
  assert.equal(expectedFormatForExt('.PNG'), 'png');
  assert.equal(expectedFormatForExt('.jpeg'), 'jpeg');
  assert.equal(expectedFormatForExt('.tiff'), 'tiff');
  assert.equal(expectedFormatForExt('.txt'), null);
  assert.equal(expectedFormatForExt(''), null);
  assert.equal(expectedFormatForExt(undefined), null);
});
