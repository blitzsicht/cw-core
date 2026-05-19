import { defineConfig } from "astro/config";

/**
 * Base Astro config for @cw/core.
 *
 * This package is a component library consumed by customer sites, so we do not
 * ship a full Astro build here — but keeping a config file means:
 *   - `astro check` works against the package
 *   - the package is integration-ready (can later add `integrations: [...]`)
 *   - customer repos can mirror this config as a reference
 */
export default defineConfig({
  // No site/base: consumed as a library, not deployed standalone.
  // Tailwind v4 is wired up via Vite/PostCSS inside consumer projects.
  integrations: [],
  vite: {
    // Placeholder for future shared Vite plugins (e.g. svg, mdx).
  },
});
