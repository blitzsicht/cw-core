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

import { realpathSync } from 'node:fs';
import { basename } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  buildCommonTags,
  buildDescByStem,
  descForFile,
  walkImages,
} from './geotag-core.js';

/**
 * @param {string} distDir  Absoluter Pfad zum dist-Verzeichnis.
 * @param {any}    data     Das aufgelöste siteData-Objekt.
 * @param {{info:Function,warn:Function}} logger  Astro-Integration-Logger.
 */
export async function geotagDist(distDir, data, logger) {
  // Customer-globale Tags (Meta + GPS + Ortsnamen + Keywords) aus geotag-core.
  const common = buildCommonTags(data);
  const descByStem = buildDescByStem(data);

  if (Object.keys(common).length === 0 && descByStem.size === 0) {
    logger.info('Geotag: keine taggbaren Felder (owner/geo/keywords/alt) in site-data — Skip.');
    return;
  }

  // exiftool-vendored ist cw-core-Dependency. Astro lädt die Integration über den
  // pnpm-Symlink (node_modules/@cw/core/…) → import.meta.url zeigt auf den Symlink-
  // Pfad, von dem aus die Dep NICHT auflösbar ist. Wir lösen daher über den
  // REAL-Pfad des Moduls auf (folgt dem pnpm-Symlink in den .pnpm-Store), sonst
  // schlägt das Tagging in Customer-Builds still fehl.
  let ExifTool;
  try {
    const realUrl = pathToFileURL(realpathSync(fileURLToPath(import.meta.url))).href;
    const req = createRequire(realUrl);
    ({ ExifTool } = req('exiftool-vendored'));
  } catch (e) {
    logger.warn(`Geotag: exiftool-vendored nicht ladbar (${e?.code ?? e?.message ?? e}) — kein Geo/Meta-Tagging (kein Build-Bruch).`);
    return;
  }

  let files = [];
  try {
    files = walkImages(distDir);
  } catch (e) {
    logger.warn(`Geotag: dist-Scan fehlgeschlagen (${e?.message ?? e}) — Skip.`);
    return;
  }
  if (files.length === 0) {
    logger.info('Geotag: keine .webp/.png in dist — Skip.');
    return;
  }

  const et = new ExifTool({ taskTimeoutMillis: 20000 });
  let ok = 0;
  let failed = 0;
  const tagged = [];
  try {
    for (const file of files) {
      const desc = descForFile(basename(file), descByStem);
      const tags = { ...common };
      if (desc) {
        tags.ImageDescription = desc;
        tags['XMP:Description'] = desc;
      }
      if (Object.keys(tags).length === 0) continue; // nichts zu schreiben für diese Datei
      try {
        await et.write(file, tags, { writeArgs: ['-overwrite_original'] });
        ok++;
        tagged.push(file);
      } catch (e) {
        failed++;
        logger.warn(`Geotag: ${basename(file)}: ${e?.message ?? e}`);
      }
    }

    // ── Verify-Guard gegen stilles Stripping (exiftool-Ausfall im Vercel-Build) ──
    // Liest bis zu 3 frisch getaggte Bilder zurück und prüft, ob die erwarteten
    // Tags wirklich im File stehen. Non-fatal (bricht Deploy nicht), aber sichtbar
    // im Build-Log — sonst würde ein defektes exiftool Metadaten still strippen.
    const expectGps = common.GPSLatitude !== undefined;
    const expectCopyright = common.Copyright !== undefined;
    if ((expectGps || expectCopyright) && tagged.length > 0) {
      const sample = tagged.slice(0, 3);
      let verified = 0;
      for (const file of sample) {
        try {
          const t = await et.read(file);
          const gpsOk = !expectGps || t.GPSLatitude !== undefined;
          const cprOk = !expectCopyright || !!t.Copyright;
          if (gpsOk && cprOk) verified++;
        } catch {
          /* Lesefehler zählt als nicht verifiziert */
        }
      }
      if (verified === sample.length) {
        logger.info(`Geotag-Verify: ✓ ${verified}/${sample.length} Sample-Bilder tragen die Metadaten.`);
      } else {
        logger.warn(
          `Geotag-Verify: ✗ nur ${verified}/${sample.length} Sample-Bilder mit Metadaten — ` +
            `exiftool im Build gescheitert? Ausgelieferte Bilder ggf. OHNE Geo/Meta.`,
        );
      }
    }
  } finally {
    await et.end();
  }

  const geoNote = common.GPSLatitude !== undefined ? 'mit GPS' : 'ohne GPS';
  const kwNote = common['IPTC:Keywords'] ? `, ${common['IPTC:Keywords'].length} Keywords` : '';
  logger.info(
    `Geotag: ✓ ${ok}/${files.length} dist-Bilder getaggt (${geoNote}${kwNote}, © ${common.Artist ?? '—'})` +
      (failed ? `, ${failed} Fehler` : ''),
  );
}
