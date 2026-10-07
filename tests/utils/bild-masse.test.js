// @ts-check
/**
 * Tests für src/utils/bild-masse.js — Bildmaße aus dem Dateikopf, ohne sharp.
 *
 * Lauf: `node --test tests/utils/bild-masse.test.js`
 *
 * Die Proben erzeugt sharp (devDependency) zur Laufzeit, also echte Encoder-Ausgaben
 * statt handgeschriebener Kopfbytes. Grund: ein Parser, der nur gegen selbst gebaute
 * Bytes getestet ist, prüft die eigene Vorstellung vom Format, nicht das Format. Bei
 * WEBP gibt es drei Kopfvarianten (VP8, VP8L, VP8X) — welche sharp schreibt, prüft jeder
 * Test deshalb mit, sonst testete „VP8X" womöglich still ein VP8.
 *
 * Anlass (07.10.2026): gowohnen zeigte als og:image ein SVG. Der Vorgänger dieses
 * Helfers kannte nur PNG und JPEG, gab für SVG `null` zurück, und quality-checks
 * übersprang die Prüfung — genau der Fall, der hätte rot werden müssen.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import sharp from 'sharp';

import { bildMasse, RASTER_FORMATE } from '../../src/utils/bild-masse.js';

const WURZEL = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Einfarbige Fläche als Ausgangsbild. */
function flaeche(width, height, channels = 3) {
  return sharp({
    create: { width, height, channels, background: channels === 4 ? { r: 10, g: 80, b: 160, alpha: 0.5 } : '#0a50a0' },
  });
}

/** WEBP-Chunk-Kennung an Byte 12 — welche der drei Varianten sharp geschrieben hat. */
const webpChunk = (buf) => buf.subarray(12, 16).toString('latin1');

test('PNG: Maße aus IHDR', async () => {
  const buf = await flaeche(1200, 630).png().toBuffer();
  assert.deepEqual(bildMasse(buf), { format: 'png', raster: true, width: 1200, height: 630 });
});

test('JPEG baseline: Maße aus SOF0', async () => {
  const buf = await flaeche(1200, 630).jpeg().toBuffer();
  assert.deepEqual(bildMasse(buf), { format: 'jpeg', raster: true, width: 1200, height: 630 });
});

test('JPEG progressive: Maße aus SOF2', async () => {
  const buf = await flaeche(1280, 640).jpeg({ progressive: true }).toBuffer();
  assert.deepEqual(bildMasse(buf), { format: 'jpeg', raster: true, width: 1280, height: 640 });
});

test('JPEG mit EXIF vor dem SOF: Segmentlängen werden übersprungen', async () => {
  // EXIF/ICC stehen VOR dem SOF-Marker. Wer am ersten 0xFFCx-Byte im Datenstrom
  // anhält statt Segment für Segment zu springen, liest dort Unsinn.
  const buf = await flaeche(801, 333).withMetadata({ exif: { IFD0: { Copyright: 'cw-core Test' } } }).jpeg().toBuffer();
  assert.deepEqual(bildMasse(buf), { format: 'jpeg', raster: true, width: 801, height: 333 });
});

test('WEBP verlustbehaftet (VP8): Maße aus dem Frame-Kopf', async () => {
  const buf = await flaeche(1200, 630).webp({ quality: 80 }).toBuffer();
  assert.equal(webpChunk(buf), 'VP8 ', 'Probe ist kein VP8 — Test prüft die falsche Variante');
  assert.deepEqual(bildMasse(buf), { format: 'webp', raster: true, width: 1200, height: 630 });
});

test('WEBP verlustfrei (VP8L): 14-Bit-Felder, ungerade Maße', async () => {
  // Ungerade Maße, weil Breite und Höhe in VP8L bitweise über Bytegrenzen gepackt
  // sind; bei glatten Werten fiele ein Schiebefehler womöglich nicht auf.
  const buf = await flaeche(1201, 631).webp({ lossless: true }).toBuffer();
  assert.equal(webpChunk(buf), 'VP8L', 'Probe ist kein VP8L — Test prüft die falsche Variante');
  assert.deepEqual(bildMasse(buf), { format: 'webp', raster: true, width: 1201, height: 631 });
});

test('WEBP erweitert (VP8X): Leinwandmaße, 24 Bit', async () => {
  // Verlustbehaftet MIT Alphakanal → libwebp schreibt VP8X + ALPH + VP8.
  const buf = await flaeche(1200, 630, 4).webp({ quality: 80 }).toBuffer();
  assert.equal(webpChunk(buf), 'VP8X', 'Probe ist kein VP8X — Test prüft die falsche Variante');
  assert.deepEqual(bildMasse(buf), { format: 'webp', raster: true, width: 1200, height: 630 });
});

test('GIF: Maße aus dem Logical Screen Descriptor', async () => {
  const buf = await flaeche(320, 200).gif().toBuffer();
  assert.deepEqual(bildMasse(buf), { format: 'gif', raster: true, width: 320, height: 200 });
});

test('SVG: erkannt, kein Raster, keine Maße — der gowohnen-Fall', () => {
  // Das echte gowohnen-Logo (206 Byte) begann genau so.
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64"/></svg>');
  assert.deepEqual(bildMasse(svg), { format: 'svg', raster: false, width: null, height: null });
});

test('SVG mit XML-Deklaration und Kommentar davor wird trotzdem als SVG erkannt', () => {
  const svg = Buffer.from('<?xml version="1.0"?>\n<!-- Illustrator -->\n<svg width="1200" height="630"></svg>');
  assert.equal(bildMasse(svg).format, 'svg');
  assert.equal(bildMasse(svg).raster, false);
});

test('HTML mit .png-Endung (Bot-Schutzseite) ist kein Raster', () => {
  const html = Buffer.from('<!DOCTYPE html><html><head><title>Access denied</title></head></html>');
  assert.deepEqual(bildMasse(html), { format: 'html', raster: false, width: null, height: null });
});

test('abgeschnittenes PNG: Raster erkannt, Maße null statt Unsinn', async () => {
  const buf = (await flaeche(1200, 630).png().toBuffer()).subarray(0, 20);
  assert.deepEqual(bildMasse(buf), { format: 'png', raster: true, width: null, height: null });
});

test('abgeschnittenes JPEG ohne SOF: Maße null', async () => {
  const buf = (await flaeche(1200, 630).jpeg().toBuffer()).subarray(0, 30);
  assert.deepEqual(bildMasse(buf), { format: 'jpeg', raster: true, width: null, height: null });
});

test('leerer Puffer', () => {
  assert.deepEqual(bildMasse(Buffer.alloc(0)), { format: 'empty', raster: false, width: null, height: null });
});

test('RASTER_FORMATE: genau die Formate, die Messenger als Vorschau zeigen', () => {
  assert.deepEqual([...RASTER_FORMATE].sort(), ['gif', 'jpeg', 'png', 'webp']);
});

test('Export: @cw/core/utils/bild-masse zeigt auf die .js und die .d.ts', () => {
  const pkg = JSON.parse(readFileSync(join(WURZEL, 'package.json'), 'utf8'));
  assert.deepEqual(pkg.exports['./utils/bild-masse'], {
    types: './src/utils/bild-masse.d.ts',
    default: './src/utils/bild-masse.js',
  });
});
