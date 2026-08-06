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

/**
 * Rechteinhaber für EIN konkretes Bild.
 *
 * Nicht jedes Bild auf einer Kundenseite stammt vom Kunden: Partner-, Lieferanten-
 * oder Herstellerfotos gehören jemand anderem. Der Default stempelt aber
 * `© <eigene Entität>` in JEDES taggbare Bild und überschreibt vorhandene Angaben —
 * bei Fremdmaterial ist das eine sachlich falsche Urheberbehauptung, die wir dann
 * auch noch selbst ausliefern. Nutzungserlaubnis ≠ Urheberschaft.
 *
 * Deshalb kann `siteData.imageRights` Pfad-Präfixe einer abweichenden Entität zuordnen:
 *
 *   imageRights: [
 *     { pathPrefix: 'images/studios/', holder: 'Victory Gym Neutraubling' },
 *   ]
 *
 * Ohne `imageRights` ändert sich nichts (Fleet-neutral). Präfixe matchen auf den
 * dist-relativen Pfad ohne führenden Slash; der längste Treffer gewinnt, damit
 * Ausnahmen innerhalb eines Ordners möglich sind.
 *
 * @param {any} data     aufgelöstes siteData
 * @param {string} relPath  dist-relativer Bildpfad, z. B. 'images/studios/foo.webp'
 * @returns {string|null}
 */
export function resolveImageCopyrightHolder(data, relPath) {
  const regeln = Array.isArray(data?.imageRights) ? data.imageRights : [];
  const pfad = String(relPath ?? '').replace(/\\/g, '/').replace(/^\/+/, '');
  let treffer = null;
  for (const r of regeln) {
    if (!r || typeof r.pathPrefix !== 'string' || typeof r.holder !== 'string') continue;
    if (isTodo(r.holder) || !r.holder.trim()) continue;
    const praefix = r.pathPrefix.replace(/\\/g, '/').replace(/^\/+/, '');
    if (!praefix || !pfad.startsWith(praefix)) continue;
    if (!treffer || praefix.length > treffer.praefix.length) treffer = { praefix, holder: r.holder };
  }
  return treffer ? treffer.holder : resolveCopyrightHolder(data);
}
