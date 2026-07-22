import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Ermittelt die Produktions-Domain eines Customer-Repos.
 *
 * Reihenfolge: `astro.config.*` (`site: '…'`) vor `src/data/site-data.ts` (`url: '…'`).
 * Bewusst regex-basiert — die Configs werden nicht ausgeführt. Deshalb muss `site:`
 * ein String-Literal sein, keine Variable (siehe Kommentar in den Customer-Configs).
 *
 * @param {string} dir Repo-Root
 * @returns {string|null} z. B. 'https://gympanzen.com'
 */
export function resolveOrigin(dir) {
  for (const f of ['astro.config.ts', 'astro.config.mjs', 'astro.config.js']) {
    const p = join(dir, f);
    if (existsSync(p)) {
      const m = readFileSync(p, 'utf-8').match(/site:\s*['"]https?:\/\/([^'"/]+)/);
      if (m) return `https://${m[1]}`;
    }
  }
  const sd = join(dir, 'src/data/site-data.ts');
  if (existsSync(sd)) {
    const m = readFileSync(sd, 'utf-8').match(/url:\s*['"]https?:\/\/([^'"/]+)/);
    if (m) return `https://${m[1]}`;
  }
  return null;
}
