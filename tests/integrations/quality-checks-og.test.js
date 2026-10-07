// @ts-check
/**
 * Tests für den og:image-Teil der quality-checks-Integration.
 *
 * Lauf: `node --test tests/integrations/quality-checks-og.test.js`
 *
 * Vor dem 07.10.2026 las quality-checks nur PNG und JPEG. Für SVG und WEBP gab
 * `imageDimensions` `null` zurück, und `if (dim && …)` übersprang die Prüfung —
 * gowohnens `/logo.svg` als og:image wäre hier grün durchgelaufen. Die Proben unten
 * sind so gewählt, dass jede am alten Code anders ausfällt als am neuen:
 *   - SVG             → alt: kein Befund · neu: og_image_not_raster
 *   - WEBP 1280×640   → alt: kein Befund · neu: og_image_wrong_dims
 *   - WEBP 1200×630   → alt und neu: kein Befund (Gegenprobe: WEBP ist erlaubt)
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import sharp from 'sharp';

import qualityChecks from '../../src/integrations/quality-checks/index.ts';

const seite = (og) => `<!doctype html><html><head>
<meta property="og:image" content="${og}">
</head><body><h1>Titel</h1></body></html>`;

/** Baut ein Mini-dist mit einer Seite und einem Bild, lässt den Hook laufen, liefert die Warnungen. */
async function lauf(bildName, bildBuf) {
  const dist = mkdtempSync(join(tmpdir(), 'qc-og-'));
  try {
    mkdirSync(join(dist, 'og'), { recursive: true });
    writeFileSync(join(dist, 'og', bildName), bildBuf);
    writeFileSync(join(dist, 'index.html'), seite(`https://kunde.de/og/${bildName}`));
    /** @type {string[]} */
    const warnungen = [];
    const logger = { warn: (m) => warnungen.push(m), info: () => {}, error: () => {} };
    const integration = qualityChecks({ requireSingleH1: false, requireAnswerBlock: false });
    const hook = /** @type {any} */ (integration.hooks['astro:build:done']);
    await hook({ dir: pathToFileURL(dist + '/'), logger });
    return warnungen.join('\n');
  } finally {
    rmSync(dist, { recursive: true, force: true });
  }
}

const flaeche = (w, h) => sharp({ create: { width: w, height: h, channels: 3, background: '#336699' } });

test('SVG als og:image wird gemeldet (og_image_not_raster) statt still übersprungen', async () => {
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"></svg>');
  const out = await lauf('logo.svg', svg);
  assert.match(out, /kein Rasterbild/);
  assert.match(out, /SVG/);
});

test('WEBP mit falschen Maßen wird gemeldet (früher: null → übersprungen)', async () => {
  const out = await lauf('default.webp', await flaeche(1280, 640).webp().toBuffer());
  assert.match(out, /1280×640/);
});

test('Gegenprobe: WEBP 1200×630 ist kein Befund', async () => {
  const out = await lauf('default.webp', await flaeche(1200, 630).webp().toBuffer());
  assert.equal(out, '');
});

test('Gegenprobe: JPEG 1200×630 ist kein Befund', async () => {
  const out = await lauf('default.jpg', await flaeche(1200, 630).jpeg().toBuffer());
  assert.equal(out, '');
});
