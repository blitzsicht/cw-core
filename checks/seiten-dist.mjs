/**
 * Seiten aus dem gebauten Verzeichnis — der Rückfall, wenn ein Build keine Sitemap hat.
 *
 * ANLASS (2026-10-07): gowohnen.com hat bewusst keine Sitemap (sie würde die Geheimlinks der
 * Exposés veröffentlichen). Ohne Sitemap fiel `seitenAusBuild` auf `/` und `/kontakt/` zurück —
 * `/kontakt/` gibt es dort nicht, geprüft wurde die 404-Seite. Mobil-, Layout- und a11y-Audit
 * liefen grün, ohne das Exposé je gesehen zu haben; ein Sonderlauf über alle Seiten fand
 * 10 von 10 a11y-Befunden. Was gebaut wird, ist die bessere Liste als zwei geratene Routen.
 *
 * Eine Route je `index.html`. Verzeichnisse mit `_` oder `.` am Anfang (`_astro`, `.vercel`)
 * und die 404-Seite zählen nicht.
 */
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/** @param {string} distDir @returns {string[]} sortierte Routen, z. B. ['/', '/impressum/'] */
export function seitenAusDist(distDir) {
  if (!existsSync(distDir)) return [];
  const routen = [];
  const gehe = (dir, pfad) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) {
        if (e.name.startsWith('_') || e.name.startsWith('.') || e.name === '404') continue;
        gehe(join(dir, e.name), `${pfad}${e.name}/`);
      } else if (e.name === 'index.html') {
        routen.push(pfad);
      }
    }
  };
  gehe(distDir, '/');
  return routen.sort();
}
