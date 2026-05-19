/**
 * @cw/core/integrations/quality-checks
 *
 * Astro-Integration: prüft Build-Output (dist/) auf Quality-Marker.
 * Soft-Warnings (kein Build-Fail) per Default — kann via `strict: true`
 * hart gemacht werden.
 *
 * Hintergrund (Plan-Phase 1.3):
 *   - **1× <h1> pro Page** (Cyrus Shepard AI Citation Ranking: query-answer
 *     match = 9.2). Multiple h1s konfundieren die Page-Topic für AI-Crawler.
 *   - **AnswerBlock-Pflicht für Service-Pages** (Plan-Pattern):
 *     44.2% AI-Citations aus ersten 30% Page-Content. Service-Pages ohne
 *     Lead-with-Answer verschwenden die kritischste Position.
 *
 * Usage in astro.config.ts:
 *
 *   import qualityChecks from '@cw/core/integrations/quality-checks';
 *
 *   export default defineConfig({
 *     integrations: [
 *       qualityChecks({
 *         servicePagePatterns: [/^\/leistungen\//, /^\/services\//],
 *         // optional:
 *         strict: false,           // true → Build-Fail bei Verstoß
 *         requireAnswerBlock: true,
 *         requireSingleH1: true,
 *       }),
 *     ],
 *   });
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import type { AstroIntegration } from 'astro';

export interface QualityChecksOptions {
  /**
   * Regex-Patterns für Pages die als "Service-Page" gelten (für AnswerBlock-Pflicht).
   * Beispiel: [/^\/leistungen\//, /^\/services\//, /^\/angebote\//]
   * Default: [] (alle AnswerBlock-Checks aus).
   */
  servicePagePatterns?: RegExp[];
  /** Default false. Bei true → Build-Fail (throw) bei Verstoß. */
  strict?: boolean;
  /** Default true. Prüft 1× h1 pro Page. */
  requireSingleH1?: boolean;
  /** Default true. Prüft AnswerBlock auf Service-Pages. */
  requireAnswerBlock?: boolean;
  /** Default ['/404', '/danke', '/impressum', '/datenschutz']. Exclude paths from h1-check. */
  ignorePaths?: string[];
}

type Issue = {
  page: string;
  type: 'h1_missing' | 'h1_multiple' | 'answer_block_missing';
  details: string;
};

function walkHtml(dir: string, baseDir: string, results: string[] = []): string[] {
  if (!existsSync(dir)) return results;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      walkHtml(full, baseDir, results);
    } else if (entry === 'index.html' || (entry.endsWith('.html') && entry !== '404.html')) {
      results.push(full);
    }
  }
  return results;
}

function htmlToPath(htmlPath: string, distDir: string): string {
  const rel = htmlPath.slice(distDir.length).replace(/\/index\.html$/, '/').replace(/\.html$/, '');
  return rel.startsWith('/') ? rel : `/${rel}`;
}

function countH1(html: string): number {
  // Strip script/style first (vermeidet false-positives wenn JS-String "<h1>" enthält)
  const stripped = html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '');
  const matches = stripped.match(/<h1\b[^>]*>/gi);
  return matches?.length ?? 0;
}

function hasAnswerBlock(html: string): boolean {
  // AnswerBlock.astro emittiert ein <section class="answer-block" data-cw-answer-block>
  // oder ein script[type=application/ld+json] mit @type:Question.
  return /data-cw-answer-block/.test(html) ||
         /"@type"\s*:\s*"Question"/.test(html);
}

export default function qualityChecks(opts: QualityChecksOptions = {}): AstroIntegration {
  const {
    servicePagePatterns = [],
    strict = false,
    requireSingleH1 = true,
    requireAnswerBlock = true,
    ignorePaths = ['/404', '/danke/', '/impressum/', '/datenschutz/', '/agb/'],
  } = opts;

  return {
    name: '@cw/core/quality-checks',
    hooks: {
      'astro:build:done': async ({ dir, logger }) => {
        const distDir = fileURLToPath(dir).replace(/\/$/, '');
        const htmlFiles = walkHtml(distDir, distDir);

        if (htmlFiles.length === 0) {
          logger.warn('[quality-checks] keine HTML-Files im dist/ gefunden — Skip.');
          return;
        }

        const issues: Issue[] = [];

        for (const file of htmlFiles) {
          const pagePath = htmlToPath(file, distDir);

          // Skip ignore-paths
          const isIgnored = ignorePaths.some((p) => pagePath.startsWith(p) || pagePath === p.replace(/\/$/, ''));
          if (isIgnored) continue;

          const html = readFileSync(file, 'utf-8');

          // H1-Check
          if (requireSingleH1) {
            const h1Count = countH1(html);
            if (h1Count === 0) {
              issues.push({
                page: pagePath,
                type: 'h1_missing',
                details: 'Keine <h1> gefunden — Page-Topic für Crawler unklar.',
              });
            } else if (h1Count > 1) {
              issues.push({
                page: pagePath,
                type: 'h1_multiple',
                details: `${h1Count} <h1>-Elemente gefunden — verwirrt AI-Crawler-Topic-Extraction.`,
              });
            }
          }

          // AnswerBlock-Check für Service-Pages
          if (requireAnswerBlock && servicePagePatterns.length > 0) {
            const isServicePage = servicePagePatterns.some((re) => re.test(pagePath));
            if (isServicePage && !hasAnswerBlock(html)) {
              issues.push({
                page: pagePath,
                type: 'answer_block_missing',
                details: 'Service-Page ohne <AnswerBlock> — Lead-with-Answer fehlt für AI-Citations.',
              });
            }
          }
        }

        if (issues.length === 0) {
          logger.info(`[quality-checks] ✓ alle ${htmlFiles.length} Pages bestanden (h1-Count + AnswerBlock).`);
          return;
        }

        // Reporting
        const grouped = {
          h1_missing: issues.filter((i) => i.type === 'h1_missing'),
          h1_multiple: issues.filter((i) => i.type === 'h1_multiple'),
          answer_block_missing: issues.filter((i) => i.type === 'answer_block_missing'),
        };

        logger.warn(`[quality-checks] ${issues.length} Quality-Issues in ${htmlFiles.length} Pages:`);
        if (grouped.h1_missing.length > 0) {
          logger.warn(`  · ${grouped.h1_missing.length}× h1 missing: ${grouped.h1_missing.map((i) => i.page).join(', ')}`);
        }
        if (grouped.h1_multiple.length > 0) {
          logger.warn(`  · ${grouped.h1_multiple.length}× h1 multiple: ${grouped.h1_multiple.map((i) => i.page).join(', ')}`);
        }
        if (grouped.answer_block_missing.length > 0) {
          logger.warn(`  · ${grouped.answer_block_missing.length}× AnswerBlock missing: ${grouped.answer_block_missing.map((i) => i.page).join(', ')}`);
        }

        if (strict) {
          throw new Error(`[quality-checks] strict=true: Build abgebrochen wegen ${issues.length} Quality-Issues. Siehe Warnings oben.`);
        } else {
          logger.warn('[quality-checks] strict=false — Build fortgesetzt. Aktivieren via { strict: true } im astro.config.');
        }
      },
    },
  };
}
