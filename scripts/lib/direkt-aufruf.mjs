// @ts-check
/**
 * Erkennt, ob ein Skript direkt aufgerufen wurde (`node …/skript.mjs`) oder nur
 * importiert wird — symlink-fest.
 *
 * pnpm verlinkt `node_modules/@cw/core` → `node_modules/.pnpm/…`. Node löst beim
 * Start den Symlink auf: `import.meta.url` trägt den echten Pfad, `process.argv[1]`
 * den Symlink-Pfad. Ein Vergleich ohne realpath auf beiden Seiten schlägt fehl,
 * `main()` läuft nie, das Skript endet still mit Exit 0 (Messfalle „Lief nie“).
 *
 * Vorfälle: verify-touchpoints (eigener Fix mit realpath), bild-einbauen
 * (Alte-Linde-Bau 20.10.2026: Exit 0, leeres Log, kein Bild abgelegt; derselbe
 * Aufruf über realpath legte 7 Bilder ab).
 *
 *   import { istDirektAufruf } from './lib/direkt-aufruf.mjs';
 *   if (istDirektAufruf(import.meta.url)) await main();
 */
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * @param {string} metaUrl `import.meta.url` des aufrufenden Skripts
 * @param {string|undefined} [einstieg] Standard: `process.argv[1]`
 * @returns {boolean}
 */
export function istDirektAufruf(metaUrl, einstieg = process.argv[1]) {
  if (!einstieg) return false;
  try {
    return realpathSync(fileURLToPath(metaUrl)) === realpathSync(einstieg);
  } catch {
    return false;
  }
}
