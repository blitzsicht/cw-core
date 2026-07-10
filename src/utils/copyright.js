/**
 * @cw/core/utils/copyright — kanonischer Copyright-/Urheber-Name.
 *
 * Single Source of Truth für die rechtlich verantwortliche Entität, genutzt von
 * BEIDEN Consumer-Pfaden, damit EXIF-Copyright und JSON-LD NIE divergieren
 * (CLAUDE.md #1-Rule, analog Twin-Divergenz-Guard in geotag-core.js):
 *   - EXIF/XMP:  buildCommonTags() in ai-discovery/geotag-core.js (`© <holder>`)
 *   - JSON-LD:   <SchemaOrg copyrightHolder={resolveCopyrightHolder(siteData)} />
 *
 * Rein (keine I/O), reines `.js` → per node:test testbar, in Kunden-`page-config.ts`
 * via `@cw/core/utils/copyright` importierbar UND vom plain-node-CLI-Twin
 * (scripts/geotag-dist.mjs) über geotag-core.js nutzbar (kein `.ts`-Import).
 */

/**
 * Platzhalter aus der site-data-Vorlage nicht als echten Wert verwenden.
 * Fängt `TODO…`, `TBD`, `Muster…` (Musterstadt/Musterstraße) und Bracket-Slots `[…]`.
 * @param {unknown} v
 * @returns {boolean}
 */
export function isTodo(v) {
  if (typeof v !== 'string') return false;
  const t = v.trim();
  return /^(TODO|TBD)\b/i.test(t) || /^Muster/i.test(t) || /^\[.*\]$/.test(t);
}

/**
 * Kanonischer Copyright-/Urheber-Name = die rechtlich verantwortliche Entität.
 * `legal.company` (Firma) hat Vorrang vor `legal.owner` (kann Privatperson sein) —
 * verhindert den gottl-Fehler (`© Gottl Reiner` statt „Gottl Richter Gomeier GbR").
 * Spiegelt die Firmennamen-Logik des Impressum-Linters (company-first). Bei
 * Einzelunternehmern ohne `company` ist `owner` (= die Person) korrekt der Rechteinhaber.
 * @param {any} data  aufgelöstes siteData
 * @returns {string|null}
 */
export function resolveCopyrightHolder(data) {
  const holder = data?.legal?.company || data?.legal?.owner || data?.name || null;
  return holder && !isTodo(holder) ? holder : null;
}
