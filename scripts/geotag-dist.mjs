#!/usr/bin/env node
/**
 * @cw/core – geotag-dist.mjs  (Post-Build Re-Tagging, CLI-Twin)
 *
 * Läuft als `postbuild`-Step im Customer-Repo (nach `astro build`):
 *   "postbuild": "... && node node_modules/@cw/core/scripts/geotag-dist.mjs"
 *
 * Warum Post-Build? astro:assets (sharp) STRIPPT beim Build alle EXIF/XMP —
 * Geo-/Meta-Tags auf `src/assets/`-Quellen überleben nicht. Dieses Script
 * taggt daher die FERTIGEN `dist/**\/*.webp` + `*.png` (inkl. gehashte _astro-
 * Derivate UND kopierte public/-Bilder). exiftool injiziert die Metadaten OHNE
 * Pixel-Re-Encode → kein Qualitätsverlust, responsive srcset bleibt erhalten.
 *
 * Diese CLI-Variante teilt die Tag-Logik mit dem aktiven astro:build:done-Hook
 * (src/integrations/ai-discovery/geotag.js) über das gemeinsame Modul
 * `geotag-core.js` (Twin-Divergenz-Guard). Da sie als eigener Prozess läuft,
 * parst sie `site-data.ts` als Text in ein data-Objekt und reicht es an
 * `buildCommonTags`/`buildDescByStem`. Best-effort — der Hook ist autoritativ.
 *
 * Non-fatal: Fehler/fehlende Werte/fehlendes exiftool-vendored → Warnung +
 * exit 0 (bricht NIE den Build/Deploy).
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  buildCommonTags,
  buildDescByStem,
  descForFile,
  walkImages,
} from '../src/integrations/ai-discovery/geotag-core.js';

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

// ── site-data.ts → data-Objekt (defensiv, best-effort) ──────────────────────
const scalar = (re) => {
  const m = src.match(re);
  return m ? m[1] : undefined;
};
const arr = (name) => {
  const m = src.match(new RegExp(`${name}\\s*:\\s*\\[([\\s\\S]*?)\\]`));
  if (!m) return undefined;
  const items = m[1].match(/(['"])(.*?)\1/g);
  return items ? items.map((s) => s.slice(1, -1)) : [];
};
const geoM = src.match(/geo:\s*\{\s*latitude:\s*(-?[\d.]+)\s*,\s*longitude:\s*(-?[\d.]+)/);

const data = {
  name: scalar(/\bname:\s*['"]([^'"]+)['"]/),
  legal: {
    owner: scalar(/legal:\s*\{[\s\S]*?owner:\s*['"]([^'"]+)['"]/),
    city: scalar(/legal:\s*\{[\s\S]*?city:\s*['"]([^'"]+)['"]/),
    region: scalar(/legal:\s*\{[\s\S]*?region:\s*['"]([^'"]+)['"]/),
    country: scalar(/legal:\s*\{[\s\S]*?country:\s*['"]([^'"]+)['"]/),
  },
  seo: {
    geo: geoM ? { latitude: Number(geoM[1]), longitude: Number(geoM[2]) } : undefined,
    knowsAbout: arr('knowsAbout'),
    areaServed: arr('areaServed'),
    imageKeywords: arr('imageKeywords'),
  },
  hero: {
    image: scalar(/hero:\s*\{[\s\S]*?image:\s*['"]([^'"]+)['"]/),
    imageAlt: scalar(/hero:\s*\{[\s\S]*?imageAlt:\s*['"]([^'"]+)['"]/),
  },
};

const common = buildCommonTags(data);
const descByStem = buildDescByStem(data);

if (Object.keys(common).length === 0 && descByStem.size === 0) {
  fail('keine taggbaren Felder (owner/geo/keywords/alt) in site-data.ts gefunden');
}

// ── exiftool-vendored laden (optional, non-fatal) ───────────────────────────
let ExifTool;
try {
  ({ ExifTool } = await import('exiftool-vendored'));
} catch {
  fail('exiftool-vendored nicht installiert (cw-core dependency) — kein Geotagging');
}

// ── alle dist-Bilder (.webp + .png) sammeln ─────────────────────────────────
const files = walkImages(DIST);
if (files.length === 0) fail('keine .webp/.png in dist/ gefunden');

const et = new ExifTool({ taskTimeoutMillis: 20000 });
let ok = 0;
let failed = 0;
try {
  for (const file of files) {
    const tags = { ...common };
    const d = descForFile(path.basename(file), descByStem);
    if (d) {
      tags.ImageDescription = d;
      tags['XMP:Description'] = d;
    }
    if (Object.keys(tags).length === 0) continue;
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

const geoNote = common.GPSLatitude !== undefined ? 'mit GPS' : 'ohne GPS';
const kwNote = common['IPTC:Keywords'] ? `, ${common['IPTC:Keywords'].length} Keywords` : '';
LOG(
  `✓ getaggt: ${ok}/${files.length} Bilder (${geoNote}${kwNote}, © ${common.Artist ?? '—'})` +
    (failed ? `, ${failed} Fehler` : ''),
);
process.exit(0);
