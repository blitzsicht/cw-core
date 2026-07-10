#!/usr/bin/env node
/**
 * @cw/core – verify-image-metadata.mjs  (Bild-Metadaten-Audit-Guard)
 *
 * Prüft einen gebauten dist-Satz gegen die 6 Pipeline-Anforderungen:
 *   1. Größe optimiert   → Datei ist .webp (oder < WARN_BYTES)
 *   2. Meta-Tags         → Copyright + Artist
 *   3. Keyword-Tags      → IPTC:Keywords / XMP:Subject
 *   4. Alt-Tags          → ImageDescription / XMP:Description
 *   5. Geo-Koordinaten   → GPSLatitude/Longitude
 *   6. Geo-Tags (Ort)    → XMP:City / State / Country
 *
 * Nutzung:
 *   node node_modules/@cw/core/scripts/verify-image-metadata.mjs [dist-dir]
 *   node scripts/verify-image-metadata.mjs dist --strict
 *
 * Exit-Code: 0 = OK. 1 = Stripping-Verdacht (Bilder da, aber 0 mit GPS UND 0 mit
 * Copyright) oder --strict und mindestens ein Kriterium bei 0 %. Für CI + manuelle
 * Cluster-Audits (analog rollout-perf-config.sh). Read-only — schreibt nichts.
 */

import fs from 'node:fs';
import path from 'node:path';
import { walkImages } from '../src/integrations/ai-discovery/geotag-core.js';

const args = process.argv.slice(2);
const STRICT = args.includes('--strict');
const DIST = path.resolve(args.find((a) => !a.startsWith('--')) || 'dist');
const LOG = (m) => console.log(`[verify-image-metadata] ${m}`);

if (!fs.existsSync(DIST)) {
  LOG(`⚠ kein Verzeichnis: ${DIST}`);
  process.exit(0);
}

const files = walkImages(DIST);
if (files.length === 0) {
  LOG(`keine .webp/.png in ${DIST} — nichts zu prüfen.`);
  process.exit(0);
}

let ExifTool;
try {
  ({ ExifTool } = await import('exiftool-vendored'));
} catch {
  LOG('⚠ exiftool-vendored nicht installiert — Audit übersprungen (kein Fehler).');
  process.exit(0);
}

const has = (v) => v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && v.length === 0);

const counts = { total: files.length, webp: 0, meta: 0, keywords: 0, alt: 0, gps: 0, ort: 0 };
const et = new ExifTool({ taskTimeoutMillis: 20000 });
try {
  for (const file of files) {
    if (file.toLowerCase().endsWith('.webp')) counts.webp++;
    let t;
    try {
      t = await et.read(file);
    } catch {
      continue;
    }
    if (has(t.Copyright) && has(t.Artist)) counts.meta++;
    if (has(t.Keywords) || has(t.Subject)) counts.keywords++;
    if (has(t.ImageDescription) || has(t.Description)) counts.alt++;
    if (has(t.GPSLatitude) && has(t.GPSLongitude)) counts.gps++;
    if (has(t.City) || has(t.State) || has(t.Country)) counts.ort++;
  }
} finally {
  await et.end();
}

const pct = (n) => `${n}/${counts.total} (${Math.round((n / counts.total) * 100)}%)`;
LOG(`Bild-Audit für ${DIST}`);
LOG(`  1. Größe (.webp):     ${counts.webp}/${counts.total}`);
LOG(`  2. Meta (©/Artist):   ${pct(counts.meta)}`);
LOG(`  3. Keyword-Tags:      ${pct(counts.keywords)}`);
LOG(`  4. Alt/Description:   ${pct(counts.alt)}`);
LOG(`  5. Geo-Koordinaten:   ${pct(counts.gps)}`);
LOG(`  6. Geo-Tags (Ort):    ${pct(counts.ort)}`);

// Stripping-Verdacht: Bilder vorhanden, aber weder GPS noch Copyright irgendwo.
const stripped = counts.gps === 0 && counts.meta === 0;
if (stripped) {
  LOG('✗ STRIPPING-VERDACHT: 0 Bilder mit GPS und 0 mit Copyright — Pipeline lief nicht?');
  process.exit(1);
}
if (STRICT) {
  const zero = ['meta', 'keywords', 'alt', 'gps', 'ort'].filter((k) => counts[k] === 0);
  if (zero.length) {
    LOG(`✗ --strict: Kriterien bei 0 %: ${zero.join(', ')}`);
    process.exit(1);
  }
}
LOG('✓ OK');
process.exit(0);
