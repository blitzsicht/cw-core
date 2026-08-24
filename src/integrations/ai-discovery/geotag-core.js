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
import { isTodo, resolveCopyrightHolder, resolveImageCopyrightHolder } from '../../utils/copyright.js';
import { resolveBildHerkunft } from '../../utils/bildherkunft.js';

// Öffentliche API stabil halten: bestehende Importer (geotag.js, Tests) beziehen
// resolveCopyrightHolder weiterhin aus geotag-core.
export { resolveCopyrightHolder, resolveImageCopyrightHolder };

/**
 * Copyright/Artist eines Tag-Satzes auf den Rechteinhaber DIESES Bildes umstellen.
 * Ohne passende `imageRights`-Regel unverändert — dann bleibt es beim Customer-Default.
 * Genutzt von beiden Twins (geotag.js + scripts/geotag-dist.mjs), damit die Tag-Logik
 * nicht divergiert.
 *
 * @param {Record<string, any>} common  Tags aus buildCommonTags()
 * @param {any} data                    aufgelöstes siteData
 * @param {string} relPath              dist-relativer Bildpfad
 * @returns {Record<string, any>}
 */
export function withImageRights(common, data, relPath) {
  const holder = resolveImageCopyrightHolder(data, relPath);
  if (!holder) return common;
  return { ...common, Copyright: `© ${holder}`, Artist: holder };
}

/**
 * IPTC-NewsCodes fuer `XMP-iptcExt:DigitalSourceType`.
 *
 * Volle Vokabular-URIs, nicht die Kurzformen: Das Feld verweist auf das IPTC-Vokabular,
 * ein blosses "trainedAlgorithmicMedia" sieht richtig aus und ist von keinem Leser
 * auswertbar.
 */
export const DIGITAL_SOURCE_TYPE = {
  erzeugt: 'http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia',
  veraendert: 'http://cv.iptc.org/newscodes/digitalsourcetype/compositeWithTrainedAlgorithmicMedia',
};

/**
 * Maschinenlesbare Herkunft fuer EIN konkretes Bild ergaenzen.
 *
 * Gegenstueck zu `withImageRights`: derselbe Per-Bild-Hook, andere Frage. Gespeist aus
 * `siteData.bildHerkunft` (siehe utils/bildherkunft.js), das die Herkunft ueber Pfad-Praefix
 * oder Stem aufloest — Letzteres, weil die Astro-Assetpipeline einen Content-Hash anhaengt.
 *
 * Nur `ki-erzeugt` und `ki-veraendert` bekommen einen Tag. `mensch` bekommt bewusst keinen:
 * ein Tag, der Abwesenheit von KI behauptet, existiert im Vokabular nicht, und eine falsche
 * KI-Behauptung auf einem echten Foto waere ein Fehler, den wir selbst ausliefern wuerden.
 * `ungeklaert` bekommt ebenfalls keinen — es gibt nichts zu behaupten.
 *
 * Ohne `bildHerkunft` aendert sich nichts (fleet-neutral), wie bei `imageRights`.
 *
 * **Nicht unsere Pflicht:** Die maschinenlesbare Markierung schuldet nach Art. 50 Abs. 2 der
 * Anbieter des KI-Systems, nicht der Betreiber. Dies ist die Antwort auf die EU-Forderung,
 * dass eine Kennzeichnung das Herunterladen ueberlebt — und weil `astro:assets` (sharp) beim
 * Transform alles strippt, ist dieser Post-Build-Hook die einzige Stelle, an der ein Tag
 * ueberhaupt ueberlebt.
 *
 * @param {Record<string, any>} tags  Tags aus buildCommonTags()/withImageRights()
 * @param {any} data                  aufgeloestes siteData
 * @param {string} relPath            dist-relativer Bildpfad
 * @returns {Record<string, any>}
 */
export function withDigitalSourceType(tags, data, relPath) {
  const h = resolveBildHerkunft(data, relPath);
  const wert =
    h.herkunft === 'ki-erzeugt' ? DIGITAL_SOURCE_TYPE.erzeugt :
    h.herkunft === 'ki-veraendert' ? DIGITAL_SOURCE_TYPE.veraendert :
    null;
  if (!wert) return tags;
  return { ...tags, 'XMP-iptcExt:DigitalSourceType': wert };
}

/** Endungen, die exiftool taggen kann (WebP + PNG + JPEG unterstützen EXIF/XMP). */
export const TAGGABLE_EXT = ['.webp', '.png', '.jpg', '.jpeg'];

/** Max. Anzahl Keyword-Tags pro Bild (SERP/IPTC-Hygiene). */
export const MAX_KEYWORDS = 20;

/**
 * Nicht-Content-Bilder vom Tagging ausschließen: Share-Cards (`/og/`), Icon-Sets
 * (`/icons/`), Favicons, Newsletter-Assets (`/email/`) und Social-Share-Grafiken
 * (`/social/`) sollen KEINE Keyword-/GPS-Payload tragen — sie haben keinen
 * fotografischen Inhalt, dieselben 20 Keywords auf einem 32px-Favicon sind ein
 * undifferenziertes (potenziell negatives) Signal. `/email/` + `/social/` zusätzlich,
 * damit der `strictImageBudget`-Guard (walkImages) sie nicht als Budget-Verstoß
 * flaggt — Newsletter-APNGs + Facebook-Share-PNGs haben spec-bedingt feste Größen.
 * Match auf den Pfad (POSIX-normalisiert, damit es auf Windows-Backslash-Pfaden greift).
 * Spiegelt die DENY_PATTERNS in scripts/optimize-images.mjs (Twin-Divergenz-Guard).
 */
export const TAG_DENY_RE = /(^|\/)(og|icons|email|social)\/|(^|\/)favicon[^/]*$|(^|\/)apple-touch-icon[^/]*$/i;

/**
 * Endungen fürs Größen-Budget — TAGGABLE_EXT plus `.avif`.
 *
 * 🔴 Bewusst eine eigene Liste, nicht TAGGABLE_EXT erweitert: die steuert das
 * exiftool-Geotagging, und AVIF gehört dort nicht hinein. Das Budget interessiert
 * dagegen jede ausgelieferte Bilddatei.
 *
 * Anlass (blitzsicht-ops#660, 12.08.2026): der Budget-Guard lieh sich TAGGABLE_EXT
 * und übersah damit AVIF vollständig. Bei gympanzen lagen 5 AVIF zwischen 215 und
 * 348 KB unbemerkt über Budget — und bei `<picture>` lädt der Browser genau die
 * zuerst. Die Guard-Meldung riet zugleich „(oder AVIF-Variante)": sie empfahl ein
 * Format, das sie anschliessend nicht mass. Cluster-Scan über alle customer-Repos:
 * ausser gympanzen hat keines ein AVIF über 200 KB.
 */
export const BUDGET_EXT = [...TAGGABLE_EXT, '.avif'];

/** Ob ein Pfad vom Tagging ausgeschlossen ist (OG/Icons/Favicons/Email/Social). */
export function isDenied(p) {
  return TAG_DENY_RE.test(String(p).replace(/\\/g, '/'));
}

/**
 * Rekursiver Walk über dist. Ohne `exts` taggbare Content-Bilder
 * (.webp/.png/.jpg, ohne OG/Icons/Favicons) — das ist der Geotag-Pfad.
 * Für das Größen-Budget mit `BUDGET_EXT` aufrufen.
 * @param {string} dir @param {string[]} [acc] @param {string[]} [exts]
 */
export function walkImages(dir, acc = [], exts = TAGGABLE_EXT) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walkImages(p, acc, exts);
    else if (st.isFile() && exts.some((e) => p.toLowerCase().endsWith(e)) && !isDenied(p))
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
