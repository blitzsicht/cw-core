// @ts-check
/**
 * astro.config-Template für neue Customer-Sites.
 * Kopieren nach <customer-repo>/astro.config.mjs und TODO-Felder ersetzen.
 *
 * Enthält den verbindlichen Performance-Standard (Speed-Rollout 2026-07,
 * Rationale: cw-core docs/caching-rationale.md):
 *   - prefetch (viewport): Folge-Seiten laden quasi-instant; Astro
 *     respektiert Save-Data/langsame Verbindungen automatisch.
 *   - inlineStylesheets 'always': eliminiert render-blockende
 *     <link rel="stylesheet"> (blitzsicht-Messung: ~720 ms). Der
 *     ai-discovery-Perf-Linter warnt, wenn das fehlt.
 *   - faviconIco(): generiert favicon.ico aus public/favicon.svg.
 *
 * Flankierend gehört zur neuen Site die vercel.json aus
 * src/templates/vercel.template.json (Security-Header + Cache-Control).
 */
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';
import aiDiscovery from '@cw/core/integrations/ai-discovery';
import bingIndexNow from '@cw/core/integrations/bing-indexnow';
import faviconIco from '@cw/core/integrations/favicon-ico';
import { siteData } from './src/data/site-data';
import pkg from './package.json' with { type: 'json' };

// cw-core ≥0.16.0 liest CW_CUSTOMER_SLUG für Footer-statusBadge-Auto-Detection.
const customerSlug = pkg.name.replace(/^customer-/, '');

export default defineConfig({
  site: 'https://firma.de', // TODO: Kunden-URL eintragen (muss zu siteData.url passen — Domain-Guard prüft)
  output: 'static',
  // Performance-Standard (Pflicht — siehe cw-core docs/caching-rationale.md):
  prefetch: { prefetchAll: true, defaultStrategy: 'viewport' },
  build: {
    inlineStylesheets: 'always',
  },
  integrations: [
    faviconIco(),
    sitemap({
      filter: (page) => !page.includes('/danke/'),
    }),
    aiDiscovery({ siteData: async () => siteData }),
    bingIndexNow({
      siteUrl: siteData.url,
      apiKey: process.env.INDEXNOW_KEY,
      enabled: process.env.VERCEL_ENV === 'production',
    }),
  ],
  vite: {
    plugins: [tailwindcss()],
    define: {
      'import.meta.env.CW_CUSTOMER_SLUG': JSON.stringify(customerSlug),
    },
  },
});
