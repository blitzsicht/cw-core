// @ts-check
/**
 * Pfad-Helfer für Prüfskripte über dem gebauten dist/, ohne Paket-Abhängigkeiten.
 *
 * Diese Datei darf nur `node:`-Module und andere Dateien ohne Paket-Importe laden.
 * Grund: Der Sicht-Guard (`site-checks.yml`) ruft `node cw-core/scripts/og-audit.mjs`
 * im ausgecheckten cw-core auf und installiert dort nur `checks/`, nicht die Wurzel.
 * Bis v0.196.0 kamen beide Funktionen aus `verify-touchpoints.mjs`, das über
 * `html-resources.js` `parse5` lädt. Am 23.11.2026 scheiterte deshalb die
 * Vorschaubild-Prüfung in allen 22 Pin-PRs mit „Cannot find package 'parse5'“,
 * und die Barrierefreiheits-Prüfung dahinter lief nicht mehr.
 * `scripts/og-audit-imports.test.mjs` hält den Import-Graph von og-audit paketfrei.
 */
import { join } from 'node:path';

/**
 * Wurzel des ausgelieferten HTML im dist-Verzeichnis.
 *
 * Astro MIT Adapter (blitzsicht: `output:'static'` + `adapter: vercel()`) legt
 * das Output unter `dist/client/` ab, `dist/` selbst bleibt bis auf den
 * Adapter-Kram leer. Ein naives join(dist, urlPath) findet dort KEINE einzige
 * Datei und meldet jeden Link der Site als tot — bei blitzsicht 131 Stück,
 * gemessen 12.08.2026. Darum die Fallunterscheidung statt eines festen Pfads.
 *
 * @param {string} distDir @param {string[]} entries Namen direkt unter distDir
 * @returns {string} distDir oder distDir/client
 */
export function pickDistRoot(distDir, entries) {
  const hasHtmlHere = entries.some((e) => e.toLowerCase().endsWith('.html'));
  if (!hasHtmlHere && entries.includes('client')) return join(distDir, 'client');
  return distDir;
}

/**
 * URL-Pfad für den Dateisystem-Vergleich normalisieren.
 *
 * Prozent-Encoding UND Unicode-Form zählen beide: digital-direkt verlinkt
 * dieselbe Seite als `/leistungen/druck-kopierl%C3%B6sungen/` und als
 * `/leistungen/druck-kopierlösungen`. readdir liefert auf macOS/Linux NFC —
 * ein NFD-kodierter Href wäre ohne normalize() ein Fehlalarm.
 *
 * @param {string} raw @returns {string}
 */
export function normalizeUrlPath(raw) {
  let p = raw.split('#')[0].split('?')[0];
  try {
    p = decodeURIComponent(p);
  } catch {
    // Kaputtes Encoding (einzelnes %) — roh weiterverwenden statt zu werfen.
  }
  return p.normalize('NFC');
}
