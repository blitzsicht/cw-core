/**
 * @cw/core/integrations/bing-indexnow
 *
 * Astro integration: pingt IndexNow-API (Bing/Yandex) nach jedem Build mit
 * der Liste der Site-URLs. Setzt zusätzlich eine `<key>.txt`-Verifikations-
 * Datei in `public/`.
 *
 * Hintergrund (Plan-Phase 1.4):
 * ChatGPT nutzt Bing-Index für Real-Time-Retrieval. IndexNow reduziert
 * Indexierungs-Lag von Wochen auf Stunden. Standard-aktiviert (im
 * Gegensatz zu llms.txt) wegen nachgewiesenem Nutzen.
 *
 * Usage in astro.config.ts:
 *
 *   import bingIndexNow from '@cw/core/integrations/bing-indexnow';
 *
 *   export default defineConfig({
 *     integrations: [
 *       bingIndexNow({
 *         siteUrl: 'https://example.com',
 *         apiKey: process.env.INDEXNOW_KEY, // oder aus 1Password
 *         // optional:
 *         enabled: process.env.VERCEL_ENV === 'production',
 *         host: 'example.com',
 *       }),
 *     ],
 *   });
 *
 * Opt-out: `enabled: false` setzen (Default true).
 *
 * IndexNow-Endpoint: https://www.bing.com/indexnow
 * Bulk-Limit: 10.000 URLs pro Request.
 * API-Doku: https://www.indexnow.org/documentation
 */

import { writeFileSync, existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import type { AstroIntegration } from 'astro';

export interface BingIndexNowOptions {
  /** Site-URL inkl. Protocol (https://...). Pflicht. */
  siteUrl: string;
  /**
   * IndexNow-API-Key (hex-Format, 8-128 Zeichen). Wird als `<key>.txt`
   * in public/ abgelegt und in den Ping-Requests verwendet.
   *
   * Wenn leer/undefined: Integration deaktiviert sich selbst mit Warning.
   */
  apiKey?: string;
  /**
   * Host für Ping (in der Regel die Domain ohne Protocol).
   * Wenn nicht gesetzt: aus siteUrl abgeleitet.
   */
  host?: string;
  /**
   * Default true. Setze false für Local-Dev/Preview-Branches.
   * Empfehlung: `enabled: process.env.VERCEL_ENV === 'production'`
   */
  enabled?: boolean;
  /**
   * Endpoint-Override (Default Bing). Yandex: https://yandex.com/indexnow
   * Microsoft empfiehlt einen Endpoint zu wählen (gepingte URLs werden
   * an alle teilnehmenden Search-Engines weitergegeben).
   */
  endpoint?: string;
  /**
   * Pre-existing sitemap.xml Pfad relativ zum dist/. Default '/sitemap-index.xml'
   * (Astro default). URL-Liste wird aus diesem Sitemap geparst.
   */
  sitemapPath?: string;
  /**
   * Falls true: schreibt nur den Key-File, pingt aber nicht (für initiale
   * Verifizierung).
   */
  verifyOnly?: boolean;
}

function deriveHost(siteUrl: string): string {
  try {
    return new URL(siteUrl).host;
  } catch {
    return siteUrl;
  }
}

function parseSitemapUrls(sitemapXml: string): string[] {
  const matches = sitemapXml.match(/<loc>([^<]+)<\/loc>/g) ?? [];
  return matches.map((m) => m.replace(/<\/?loc>/g, '').trim());
}

export default function bingIndexNow(opts: BingIndexNowOptions): AstroIntegration {
  const {
    siteUrl,
    apiKey,
    host: hostOpt,
    enabled = true,
    endpoint = 'https://www.bing.com/indexnow',
    sitemapPath = '/sitemap-index.xml',
    verifyOnly = false,
  } = opts;

  return {
    name: '@cw/core/bing-indexnow',
    hooks: {
      'astro:build:done': async ({ dir, logger }) => {
        if (!enabled) {
          logger.info('[bing-indexnow] disabled — skipping.');
          return;
        }
        if (!apiKey || apiKey.length < 8) {
          logger.warn('[bing-indexnow] apiKey fehlt oder zu kurz — Integration deaktiviert.');
          return;
        }
        if (!/^[a-f0-9]+$/i.test(apiKey)) {
          logger.warn('[bing-indexnow] apiKey muss hex sein (a-f, 0-9). Skip.');
          return;
        }

        const distDir = fileURLToPath(dir);
        const host = hostOpt ?? deriveHost(siteUrl);

        // 1. Verifikations-File: <key>.txt im public/dist/
        const keyFilePath = join(distDir, `${apiKey}.txt`);
        writeFileSync(keyFilePath, apiKey, 'utf-8');
        logger.info(`[bing-indexnow] verification key written: ${apiKey}.txt`);

        if (verifyOnly) {
          logger.info('[bing-indexnow] verifyOnly=true — skipping ping.');
          return;
        }

        // 2. URL-Liste aus Sitemap parsen
        const sitemapFile = join(distDir, sitemapPath.replace(/^\//, ''));
        if (!existsSync(sitemapFile)) {
          logger.warn(`[bing-indexnow] Sitemap nicht gefunden: ${sitemapFile}. Skip ping.`);
          return;
        }
        const sitemapXml = readFileSync(sitemapFile, 'utf-8');
        let urls = parseSitemapUrls(sitemapXml);

        // Astro generates sitemap-index pointing to sitemap-0.xml etc — follow
        const isIndex = /<sitemap>/.test(sitemapXml);
        if (isIndex) {
          const childUrls: string[] = [];
          for (const childPath of urls) {
            try {
              // Construct local path from URL
              const u = new URL(childPath);
              const localPath = join(distDir, u.pathname.replace(/^\//, ''));
              if (existsSync(localPath)) {
                const childXml = readFileSync(localPath, 'utf-8');
                childUrls.push(...parseSitemapUrls(childXml));
              }
            } catch {
              // skip invalid URLs
            }
          }
          urls = childUrls;
        }

        if (urls.length === 0) {
          logger.warn('[bing-indexnow] keine URLs aus Sitemap geparst — Skip.');
          return;
        }

        // 3. Bulk-Ping (max 10.000 URLs per Request)
        const chunkSize = 10000;
        for (let i = 0; i < urls.length; i += chunkSize) {
          const chunk = urls.slice(i, i + chunkSize);
          const payload = {
            host,
            key: apiKey,
            keyLocation: `${siteUrl.replace(/\/$/, '')}/${apiKey}.txt`,
            urlList: chunk,
          };

          try {
            const res = await fetch(endpoint, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json; charset=utf-8' },
              body: JSON.stringify(payload),
            });

            // IndexNow Response-Codes:
            //  200 OK — accepted
            //  202 Accepted — URLs accepted (asynchronous processing)
            //  400 Bad Request — invalid JSON
            //  403 Forbidden — key not matching
            //  422 Unprocessable Entity — URLs not within host
            //  429 Too Many Requests — slow down
            if (res.ok || res.status === 202) {
              logger.info(`[bing-indexnow] ${chunk.length} URLs pinged (status ${res.status}).`);
            } else {
              const body = await res.text().catch(() => '');
              logger.warn(`[bing-indexnow] ping failed: status ${res.status} ${body.slice(0, 120)}`);
            }
          } catch (err) {
            logger.warn(`[bing-indexnow] ping error: ${err instanceof Error ? err.message : String(err)}`);
            // Nicht throw — Build soll nicht failen wegen IndexNow.
          }
        }
      },
    },
  };
}
