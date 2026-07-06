#!/usr/bin/env node
/**
 * Tests für src/integrations/favicon-ico — ICO-Container-Builder +
 * End-to-End SVG→ICO-Generierung via sharp (siluri/blitzsicht-ops#491).
 *
 * Ausführen:
 *   node scripts/favicon-ico.test.mjs
 *
 * Exit-Code:
 *   0 — alle Tests bestanden
 *   1 — mindestens ein Test fehlgeschlagen
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildIco } from '../src/integrations/favicon-ico/ico.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Minimal 1x1 transparent PNG (67 bytes) — real PNG magic bytes, used as a
// stand-in "rendered" image so we can test the ICO container format without
// needing sharp for the pure-container tests.
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

test('buildIco: throws on empty image list', () => {
  assert.throws(() => buildIco([]), /at least one image is required/);
});

test('buildIco: throws on out-of-range size', () => {
  assert.throws(
    () => buildIco([{ size: 0, png: TINY_PNG }]),
    /size must be between 1 and 256/,
  );
  assert.throws(
    () => buildIco([{ size: 300, png: TINY_PNG }]),
    /size must be between 1 and 256/,
  );
});

test('buildIco: produces a valid ICONDIR header for a single image', () => {
  const ico = buildIco([{ size: 32, png: TINY_PNG }]);

  // ICONDIR: reserved=0, type=1 (icon), count=1
  assert.equal(ico.readUInt16LE(0), 0);
  assert.equal(ico.readUInt16LE(2), 1);
  assert.equal(ico.readUInt16LE(4), 1);

  // ICONDIRENTRY at offset 6
  assert.equal(ico.readUInt8(6), 32); // width
  assert.equal(ico.readUInt8(7), 32); // height
  assert.equal(ico.readUInt16LE(10), 1); // planes
  assert.equal(ico.readUInt16LE(12), 32); // bitCount
  assert.equal(ico.readUInt32LE(14), TINY_PNG.length); // bytesInRes

  const imageOffset = ico.readUInt32LE(18);
  assert.equal(imageOffset, 6 + 16); // header + 1 entry
  assert.equal(ico.length, imageOffset + TINY_PNG.length);

  // Embedded bytes match the source PNG exactly (PNG-in-ICO, no re-encoding).
  const embedded = ico.subarray(imageOffset, imageOffset + TINY_PNG.length);
  assert.ok(embedded.equals(TINY_PNG));
});

test('buildIco: size 256 is encoded as 0 per ICO spec', () => {
  const ico = buildIco([{ size: 256, png: TINY_PNG }]);
  assert.equal(ico.readUInt8(6), 0);
  assert.equal(ico.readUInt8(7), 0);
});

test('buildIco: multi-size ICO has one ICONDIRENTRY per image, correct offsets', () => {
  const png32 = Buffer.concat([TINY_PNG, Buffer.from([1, 2, 3])]);
  const ico = buildIco([
    { size: 16, png: TINY_PNG },
    { size: 32, png: png32 },
  ]);

  assert.equal(ico.readUInt16LE(4), 2); // count = 2

  const headerSize = 6 + 2 * 16;
  const offset0 = ico.readUInt32LE(6 + 0 * 16 + 12);
  const offset1 = ico.readUInt32LE(6 + 1 * 16 + 12);

  assert.equal(offset0, headerSize);
  assert.equal(offset1, headerSize + TINY_PNG.length);
  assert.equal(ico.length, headerSize + TINY_PNG.length + png32.length);
});

// ─── End-to-end: real SVG → real ICO via sharp ─────────────────────────────
// Proves the actual generation path (not just the container format) produces
// a valid, parseable multi-resolution favicon.ico from a real favicon.svg.

test('end-to-end: sharp renders favicon.svg into a valid multi-size ICO', async () => {
  // sharp is a real devDependency of cw-core (see package.json) precisely so
  // this test can run for real instead of silently skipping — a skip here
  // would be a false PASS (the exact pitfall this repo's CLAUDE.md warns
  // about). If this import ever fails, that's a real regression, not a
  // reason to soft-skip.
  const { default: sharp } = await import('sharp');

  const svgPath = join(__dirname, 'fixtures', 'favicon-test.svg');
  const { readFileSync } = await import('node:fs');
  const svgBuffer = readFileSync(svgPath);

  const sizes = [16, 32, 48];
  const images = await Promise.all(
    sizes.map(async (size) => ({
      size,
      png: await sharp(svgBuffer).resize(size, size).png().toBuffer(),
    })),
  );

  const ico = buildIco(images);

  // ICO magic: reserved=0, type=1
  assert.equal(ico.readUInt16LE(0), 0);
  assert.equal(ico.readUInt16LE(2), 1);
  assert.equal(ico.readUInt16LE(4), sizes.length);

  // Each embedded blob must itself be a valid PNG (magic bytes 89 50 4E 47).
  const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
  let cursor = 6 + sizes.length * 16;
  for (let i = 0; i < sizes.length; i++) {
    const entryOffset = 6 + i * 16;
    const size = ico.readUInt32LE(entryOffset + 8);
    const offset = ico.readUInt32LE(entryOffset + 12);
    assert.equal(offset, cursor);
    const magic = ico.subarray(offset, offset + 4);
    assert.ok(magic.equals(PNG_MAGIC), `entry ${i} is not a valid PNG`);
    cursor += size;
  }
  assert.equal(ico.length, cursor);
});
