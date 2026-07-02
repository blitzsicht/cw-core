/**
 * @cw/core/integrations/ai-discovery – geotag.js
 *
 * Post-Build Re-Tagging der dist-Bilder. Wird aus dem `astro:build:done`-Hook
 * der ai-discovery-Integration aufgerufen → ZERO-CONFIG: jeder Customer, der
 * die Integration nutzt (alle), taggt seine Bilder automatisch beim Build.
 *
 * Warum nach dem Build? astro:assets (sharp) STRIPPT EXIF beim Transform —
 * Geo-/Meta-Tags auf `src/assets/`-Quellen überleben nicht. exiftool injiziert
 * die Tags in die fertigen dist-WebP OHNE Pixel-Re-Encode (verlustfrei,
 * responsive srcset bleibt).
 *
 * Non-fatal: jeder Fehler (fehlendes exiftool-vendored, kein geo, Schreibfehler)
 * → Warnung + return, bricht NIE den Build.
 *
 * Als .js (nicht .ts) — wie csp-check.js —, damit der Zugriff auf optionale
 * site-data-Felder (seo.geo, leistungen[].image/imageAlt) ohne Typ-Reibung geht.
 */

import { readdirSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';

function walkWebp(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walkWebp(p, acc);
    else if (st.isFile() && p.toLowerCase().endsWith('.webp')) acc.push(p);
  }
  return acc;
}

/**
 * @param {string} distDir  Absoluter Pfad zum dist-Verzeichnis.
 * @param {any}    data     Das aufgelöste siteData-Objekt.
 * @param {{info:Function,warn:Function}} logger  Astro-Integration-Logger.
 */
export async function geotagDist(distDir, data, logger) {
  const owner = data?.legal?.owner || data?.name || null;
  const geo = data?.seo?.geo || null;
  const lat = geo && typeof geo.latitude === 'number' ? geo.latitude : null;
  const lng = geo && typeof geo.longitude === 'number' ? geo.longitude : null;

  if (!owner && lat === null) {
    logger.info('Geotag: weder legal.owner noch seo.geo in site-data — Skip.');
    return;
  }

  // image-Dateiname (ohne .webp) → imageAlt (für Description, best-effort)
  const descByStem = new Map();
  for (const l of data?.leistungen ?? []) {
    if (l?.image && l?.imageAlt) descByStem.set(String(l.image).replace(/\.webp$/i, ''), l.imageAlt);
  }

  let ExifTool;
  try {
    ({ ExifTool } = await import('exiftool-vendored'));
  } catch {
    logger.warn('Geotag: exiftool-vendored nicht installiert — kein Geo/Meta-Tagging (kein Build-Bruch).');
    return;
  }

  let files = [];
  try {
    files = walkWebp(distDir);
  } catch (e) {
    logger.warn(`Geotag: dist-Scan fehlgeschlagen (${e?.message ?? e}) — Skip.`);
    return;
  }
  if (files.length === 0) {
    logger.info('Geotag: keine .webp in dist — Skip.');
    return;
  }

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

  const et = new ExifTool({ taskTimeoutMillis: 20000 });
  let ok = 0;
  let failed = 0;
  try {
    for (const file of files) {
      const stem = basename(file).split('.')[0];
      const desc = descByStem.get(stem);
      const tags = { ...common };
      if (desc) {
        tags.ImageDescription = desc;
        tags['XMP:Description'] = desc;
      }
      try {
        await et.write(file, tags, { writeArgs: ['-overwrite_original'] });
        ok++;
      } catch (e) {
        failed++;
        logger.warn(`Geotag: ${basename(file)}: ${e?.message ?? e}`);
      }
    }
  } finally {
    await et.end();
  }

  const geoNote = lat !== null ? `GPS ${lat},${lng}` : 'ohne GPS';
  logger.info(
    `Geotag: ✓ ${ok}/${files.length} dist-Bilder getaggt (${geoNote}, © ${owner ?? '—'})` +
      (failed ? `, ${failed} Fehler` : ''),
  );
}
