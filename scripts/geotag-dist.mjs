#!/usr/bin/env node
/**
 * @cw/core – geotag-dist.mjs  (Post-Build Re-Tagging)
 *
 * Läuft als `postbuild`-Step im Customer-Repo (nach `astro build`):
 *   "postbuild": "... && node node_modules/@cw/core/scripts/geotag-dist.mjs"
 *
 * Warum Post-Build? astro:assets (sharp) STRIPPT beim Build alle EXIF/XMP —
 * Geo-/Meta-Tags auf `src/assets/`-Quellen überleben nicht. Dieses Script
 * taggt daher die FERTIGEN `dist/**\/*.webp` (inkl. gehashte _astro-Derivate
 * UND kopierte public/-Bilder). exiftool injiziert die Metadaten in den
 * WebP-Container OHNE Pixel-Re-Encode → kein Qualitätsverlust, responsive
 * srcset bleibt erhalten.
 *
 * Werte kommen aus `src/data/site-data.ts` (seo.geo, legal.owner/name,
 * leistungen[].image→imageAlt). Setzt clusterweit einheitlich:
 *   Copyright = © {owner} · Artist = {owner}
 *   GPSLatitude/GPSLongitude (+Refs) = {geo}   (customer-global, alle Bilder)
 *   ImageDescription/XMP:Description = {imageAlt}   (best-effort per Datei-Prefix)
 *
 * Non-fatal: Fehler/fehlende Werte/fehlendes exiftool-vendored → Warnung +
 * exit 0 (bricht NIE den Build/Deploy).
 */

import fs from 'node:fs';
import path from 'node:path';

const CWD = process.cwd();
const DIST = path.join(CWD, 'dist');
const SITE_DATA = path.join(CWD, 'src', 'data', 'site-data.ts');
const LOG = (m) => console.log(`[@cw/core/geotag-dist] ${m}`);

function fail(msg) {
  LOG(`⚠ übersprungen: ${msg}`);
  process.exit(0);
}

if (!fs.existsSync(DIST)) fail(`kein dist/ gefunden (${DIST})`);
if (!fs.existsSync(SITE_DATA)) fail(`keine site-data.ts gefunden (${SITE_DATA})`);

const src = fs.readFileSync(SITE_DATA, 'utf8');

// ── Werte aus site-data.ts extrahieren (defensiv) ───────────────────────────
const geoM = src.match(/geo:\s*\{\s*latitude:\s*(-?[\d.]+)\s*,\s*longitude:\s*(-?[\d.]+)/);
const ownerM = src.match(/legal:\s*\{[\s\S]*?owner:\s*['"]([^'"]+)['"]/);
const nameM = src.match(/\bname:\s*['"]([^'"]+)['"]/);
const owner = (ownerM && ownerM[1]) || (nameM && nameM[1]) || null;
const lat = geoM ? Number(geoM[1]) : null;
const lng = geoM ? Number(geoM[2]) : null;

// image-Dateiname → imageAlt (für Description, best-effort)
const descByStem = new Map();
const pairRe = /image:\s*['"]([\w.\-]+)\.webp['"][\s\S]{0,160}?imageAlt:\s*['"]([^'"]+)['"]/g;
let pm;
while ((pm = pairRe.exec(src)) !== null) descByStem.set(pm[1], pm[2]);

if (!owner && lat === null) fail('weder owner noch geo in site-data.ts gefunden');

// ── exiftool-vendored laden (optional, non-fatal) ───────────────────────────
let ExifTool;
try {
  ({ ExifTool } = await import('exiftool-vendored'));
} catch {
  fail('exiftool-vendored nicht installiert (cw-core dependency) — kein Geotagging');
}

// ── alle dist-WebP sammeln ──────────────────────────────────────────────────
function walk(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, acc);
    else if (e.isFile() && p.toLowerCase().endsWith('.webp')) acc.push(p);
  }
  return acc;
}
const files = walk(DIST);
if (files.length === 0) fail('keine .webp in dist/ gefunden');

// gemeinsame Tags (customer-global)
const common = {};
if (owner) {
  common.Copyright = `© ${owner}`;
  common.Artist = owner;
}
if (lat !== null && lng !== null) {
  common.GPSLatitude = Math.abs(lat);
  common.GPSLatitudeRef = lat >= 0 ? 'N' : 'S';
  common.GPSLongitude = Math.abs(lng);
  common.GPSLongitudeRef = lng >= 0 ? 'E' : 'W';
}

// Datei-Prefix (vor dem ersten '.') → Description-Lookup
function descFor(file) {
  const base = path.basename(file);
  const stem = base.split('.')[0]; // "hero.CGE...webp" → "hero"
  return descByStem.get(stem) || null;
}

const et = new ExifTool({ taskTimeoutMillis: 20000 });
let ok = 0;
let failed = 0;
try {
  for (const file of files) {
    const tags = { ...common };
    const d = descFor(file);
    if (d) {
      tags.ImageDescription = d;
      tags['XMP:Description'] = d;
    }
    try {
      await et.write(file, tags, { writeArgs: ['-overwrite_original'] });
      ok++;
    } catch (e) {
      failed++;
      LOG(`⚠ ${path.relative(CWD, file)}: ${e?.message ?? e}`);
    }
  }
} finally {
  await et.end();
}

const geoNote = lat !== null ? `GPS ${lat},${lng}` : 'ohne GPS';
LOG(`✓ getaggt: ${ok}/${files.length} Bilder (${geoNote}, © ${owner ?? '—'})${failed ? `, ${failed} Fehler` : ''}`);
process.exit(0);
