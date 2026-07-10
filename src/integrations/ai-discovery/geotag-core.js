/**
 * @cw/core/integrations/ai-discovery – geotag-core.js
 *
 * Shared, FS-arme Bausteine für das Post-Build-Geotagging der dist-Bilder.
 * Importiert von BEIDEN Pfaden:
 *   - geotag.js            (astro:build:done-Hook, zero-config aktiv)
 *   - scripts/geotag-dist.mjs (CLI-Twin, manueller postbuild)
 * damit die Tag-Logik NIE divergiert (Twin-Divergenz-Guard, CLAUDE.md #1-Rule).
 *
 * `buildCommonTags` / `buildDescByStem` / `synthesizeKeywords` sind rein
 * (keine I/O) → per node:test ohne exiftool/Dateisystem testbar.
 * `walkImages` liest nur das Verzeichnis (read-only), findet .webp UND .png.
 */

import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
// Kanonischer Copyright-/Urheber-Name + TODO-Guard leben in einem reinen `.js`-Util,
// damit EXIF (hier) und JSON-LD (SchemaOrg) dieselbe Logik nutzen (Single Source of
// Truth). Import bleibt plain-node-tauglich (kein `.ts`) für den CLI-Twin geotag-dist.mjs.
import { isTodo, resolveCopyrightHolder } from '../../utils/copyright.js';

// Öffentliche API stabil halten: bestehende Importer (geotag.js, Tests) beziehen
// resolveCopyrightHolder weiterhin aus geotag-core.
export { resolveCopyrightHolder };

/** Endungen, die exiftool taggen kann (WebP + PNG + JPEG unterstützen EXIF/XMP). */
export const TAGGABLE_EXT = ['.webp', '.png', '.jpg', '.jpeg'];

/** Max. Anzahl Keyword-Tags pro Bild (SERP/IPTC-Hygiene). */
export const MAX_KEYWORDS = 20;

/**
 * Nicht-Content-Bilder vom Tagging ausschließen: Share-Cards (`/og/`), Icon-Sets
 * (`/icons/`) und Favicons sollen KEINE Keyword-/GPS-Payload tragen — sie haben
 * keinen fotografischen Inhalt, dieselben 20 Keywords auf einem 32px-Favicon sind
 * ein undifferenziertes (potenziell negatives) Signal. Match auf den Pfad (POSIX-
 * normalisiert, damit es auf Windows-Backslash-Pfaden ebenfalls greift).
 */
export const TAG_DENY_RE = /(^|\/)(og|icons)\/|(^|\/)favicon[^/]*$|(^|\/)apple-touch-icon[^/]*$/i;

/** Ob ein Pfad vom Tagging ausgeschlossen ist (OG/Icons/Favicons). */
export function isDenied(p) {
  return TAG_DENY_RE.test(String(p).replace(/\\/g, '/'));
}

/** Rekursiver Walk über dist → taggbare Content-Bilder (.webp/.png/.jpg, ohne OG/Icons/Favicons). */
export function walkImages(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walkImages(p, acc);
    else if (
      st.isFile() &&
      TAGGABLE_EXT.some((e) => p.toLowerCase().endsWith(e)) &&
      !isDenied(p)
    )
      acc.push(p);
  }
  return acc;
}

/**
 * Keyword-Tags synthetisieren. Explizite `seo.imageKeywords` haben Vorrang;
 * sonst aus knowsAbout + areaServed + leistungen[].title (dedupe, cap MAX_KEYWORDS).
 * @param {any} data  aufgelöstes siteData
 * @returns {string[]}
 */
export function synthesizeKeywords(data) {
  const explicit = data?.seo?.imageKeywords;
  const pool =
    Array.isArray(explicit) && explicit.length
      ? explicit
      : [
          ...(data?.seo?.knowsAbout ?? []),
          ...(data?.seo?.areaServed ?? []),
          // Service-Titel: canonical `leistungen[].title` UND divergentes `services[].label`
          // (z.B. gottl) tolerieren, damit divergente Kunden nicht still weniger getaggt werden.
          ...((data?.leistungen ?? []).map((l) => l?.title).filter(Boolean)),
          ...((data?.services ?? []).map((s) => s?.label ?? s?.title).filter(Boolean)),
        ];
  const seen = new Set();
  const out = [];
  for (const raw of pool) {
    const k = String(raw ?? '').trim();
    if (!k || isTodo(k)) continue;
    const key = k.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(k);
    if (out.length >= MAX_KEYWORDS) break;
  }
  return out;
}

/**
 * Customer-globale Tags für ALLE Bilder bauen:
 *   Meta:   Copyright, Artist
 *   Geo-Koordinaten: GPSLatitude/Ref, GPSLongitude/Ref
 *   Geo-Tags (Ortsnamen): XMP:City, XMP:State, XMP:Country
 *   Keyword-Tags: IPTC:Keywords, XMP:Subject
 * Nur gesetzte/valide Felder landen im Objekt (rückwärtskompatibel).
 * @param {any} data  aufgelöstes siteData
 * @returns {Record<string, any>}
 */
export function buildCommonTags(data) {
  const owner = resolveCopyrightHolder(data);
  const geo = data?.seo?.geo || null;
  const lat = geo && typeof geo.latitude === 'number' ? geo.latitude : null;
  const lng = geo && typeof geo.longitude === 'number' ? geo.longitude : null;
  const city = data?.legal?.city || data?.seo?.areaServed?.[0] || null;
  const region = data?.legal?.region || null;
  const country = data?.legal?.country || null;

  const tags = {};
  if (owner) {
    tags.Copyright = `© ${owner}`;
    tags.Artist = owner;
  }
  if (lat !== null && lng !== null) {
    tags.GPSLatitude = Math.abs(lat);
    tags.GPSLatitudeRef = lat >= 0 ? 'N' : 'S';
    tags.GPSLongitude = Math.abs(lng);
    tags.GPSLongitudeRef = lng >= 0 ? 'E' : 'W';
  }
  // Ortsnamen-Geo-Tags (XMP-photoshop) — getrennt von den reinen GPS-Zahlen.
  if (city && !isTodo(city)) tags['XMP:City'] = city;
  if (region && !isTodo(region)) tags['XMP:State'] = region;
  if (country && !isTodo(country)) tags['XMP:Country'] = country;
  // Keyword-Tags (IPTC + XMP-dc:Subject).
  const keywords = synthesizeKeywords(data);
  if (keywords.length) {
    tags['IPTC:Keywords'] = keywords;
    tags['XMP:Subject'] = keywords;
  }
  return tags;
}

/**
 * Dateiname-Stamm (basename ohne Endung) → Alt-Text/Description.
 * Quellen: hero.image/imageAlt, leistungen[].image/imageAlt,
 * leistungen[].heroImage/(imageAlt||title). Best-effort pro Datei-Prefix.
 * @param {any} data  aufgelöstes siteData
 * @returns {Map<string,string>}
 */
export function buildDescByStem(data) {
  const map = new Map();
  const add = (img, alt) => {
    if (!img || !alt) return; // Orphan (Alt ohne Bild, z.B. donau) → sauber überspringen
    const stem = String(img)
      .replace(/\.(webp|png|jpe?g)$/i, '')
      .split('/')
      .pop();
    if (stem) map.set(stem, alt);
  };
  // Canonical Hero (`hero.image`) UND divergenter String-Hero (`images.hero`, z.B. gottl/Ferienhäuser).
  // Divergente Kunden haben KEINEN top-level `hero`-Key → als Caption der Firmen-/Objektname
  // (`data.name`) als sinnvoller Fallback (kein toter `hero.imageAlt`-Verweis, den es dort nie gibt).
  add(data?.hero?.image, data?.hero?.imageAlt);
  add(data?.images?.hero, data?.hero?.imageAlt || data?.name);
  for (const l of data?.leistungen ?? []) {
    add(l?.image, l?.imageAlt);
    add(l?.heroImage, l?.imageAlt || l?.title);
  }
  return map;
}

/** Description für eine dist-Datei nachschlagen (Stamm vor dem ersten '.'). */
export function descForFile(fileBasename, descByStem) {
  const stem = fileBasename.split('.')[0];
  return descByStem.get(stem) || null;
}
