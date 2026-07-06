/**
 * @cw/core/integrations/favicon-ico
 *
 * Astro integration that generates `favicon.ico` at build time from the
 * site's `public/favicon.svg`, so every customer site ships a working
 * `/favicon.ico` without a manual per-site step.
 *
 * Background (siluri/blitzsicht-ops#491): 3/6 sampled sites had no
 * `favicon.ico`, so Plausible's external icon service (which fetches
 * `/favicon.ico`, not `favicon.svg`) fell back to a generic placeholder.
 * Whether a site had one was pure onboarding-luck — this integration
 * removes that per-site guesswork.
 *
 * Usage in a customer site's astro.config.ts:
 *
 *   import faviconIco from '@cw/core/integrations/favicon-ico';
 *
 *   export default defineConfig({
 *     integrations: [faviconIco()],
 *   });
 *
 * Requires `sharp` to be resolvable from the site's own node_modules —
 * already an established devDependency in customer repos for the image
 * pipeline (see scripts/optimize-images.mjs). If `sharp` can't be
 * resolved, the integration logs a warning and skips generation instead
 * of failing the build (same fail-open posture as verify-form-health.mjs's
 * opt-outs).
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AstroIntegration } from 'astro';
import { buildIco } from './ico.js';

export interface FaviconIcoOptions {
  /** Square pixel sizes to embed in the generated favicon.ico. Default: [16, 32, 48]. */
  sizes?: number[];
  /** Source SVG file name inside `public/`. Default: 'favicon.svg'. */
  source?: string;
  /** Output file name inside the build output dir. Default: 'favicon.ico'. */
  output?: string;
}

// Minimal shape of the `sharp` API we actually use — avoids a hard
// dependency on @types/sharp while still typing our own call sites.
interface SharpLike {
  (input: Buffer): {
    resize: (width: number, height: number) => {
      png: () => { toBuffer: () => Promise<Buffer> };
    };
  };
}

export default function faviconIco(options: FaviconIcoOptions = {}): AstroIntegration {
  const sizes = options.sizes ?? [16, 32, 48];
  const sourceName = options.source ?? 'favicon.svg';
  const outputName = options.output ?? 'favicon.ico';

  let publicDirPath: string;
  let rootPath: string;

  return {
    name: '@cw/core/integrations/favicon-ico',
    hooks: {
      'astro:config:setup': ({ config }) => {
        publicDirPath = fileURLToPath(config.publicDir);
        rootPath = fileURLToPath(config.root);
      },
      'astro:build:done': async ({ dir, logger }) => {
        const svgPath = join(publicDirPath, sourceName);
        if (!existsSync(svgPath)) {
          logger.warn(
            `${sourceName} not found in public/ — skipping favicon.ico generation.`,
          );
          return;
        }

        let sharp: SharpLike;
        try {
          const require = createRequire(join(rootPath, 'node_modules', '.placeholder'));
          sharp = require('sharp');
        } catch {
          logger.warn(
            `sharp not resolvable from this site's node_modules — skipping ` +
              `favicon.ico generation. Add "sharp" as a devDependency (see ` +
              `scripts/optimize-images.mjs for the same requirement).`,
          );
          return;
        }

        const svgBuffer = readFileSync(svgPath);

        const images = await Promise.all(
          sizes.map(async (size) => ({
            size,
            png: await sharp(svgBuffer).resize(size, size).png().toBuffer(),
          })),
        );

        const ico = buildIco(images);

        const outDir = fileURLToPath(dir);
        mkdirSync(outDir, { recursive: true });
        writeFileSync(join(outDir, outputName), ico);
        logger.info(
          `favicon.ico generated from ${sourceName} (${sizes.join('/')}px) → ${outputName}`,
        );
      },
    },
  };
}

export { buildIco } from './ico.js';
export type { IcoImage } from './ico.js';
