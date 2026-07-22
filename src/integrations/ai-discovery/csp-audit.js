// @ts-check
/**
 * @cw/core/integrations/ai-discovery/csp-audit
 *
 * Verbindet Extraktor und Matcher: **prüft die CSP gegen das, was der Build
 * tatsächlich ausliefert** — statt gegen einen Katalog bekannter Fehlermuster.
 *
 * Genau das ist der Unterschied zu `csp-check.js`: dieser Audit hätte alle
 * fünf CSP-Vorfälle (soleno 05., digital-direkt 05., donau-profi 06.,
 * gympanzen 07.2026) gefangen, ohne sie vorher zu kennen.
 *
 * Reines JS ohne Node-APIs — Hash-Berechnung wird bei Bedarf injiziert.
 *
 * @typedef {import('./csp-match.js').Resource} Resource
 * @typedef {import('./csp-match.js').MatchResult} MatchResult
 * @typedef {{ resource: Resource, result: MatchResult, count: number }} Finding
 * @typedef {{ siteOrigin?: string|null, file?: string, hashFn?: ((content: string, algo: string) => string)|null }} AuditOptions
 */

import { extractResources } from './html-resources.js';
import { findViolations } from './csp-match.js';

/**
 * Fasst identische Beanstandungen zusammen (eine Seite hat schnell 50 Bilder
 * derselben blockierten Quelle) — erste Fundstelle bleibt erhalten.
 * @param {Array<Resource & { result: MatchResult }>} violations
 * @returns {Finding[]}
 */
function dedupe(violations) {
  /** @type {Map<string, Finding>} */
  const byKey = new Map();
  for (const v of violations) {
    const { result, ...resource } = v;
    const key = `${resource.type}|${resource.directive}|${resource.url ?? ''}|${result.allowed}`;
    const hit = byKey.get(key);
    if (hit) hit.count++;
    else byKey.set(key, { resource, result, count: 1 });
  }
  return [...byKey.values()];
}

/**
 * Prüft ein HTML-Dokument gegen eine CSP.
 * @param {string} html
 * @param {string} csp
 * @param {AuditOptions} [opts]
 * @returns {Finding[]}
 */
export function auditHtml(html, csp, opts = {}) {
  if (!csp || !csp.trim()) return [];
  const resources = extractResources(html, opts.file);

  // Hash-Sources in der CSP → Hashes der Inline-Blöcke nachrüsten, sonst
  // meldeten wir hash-basierte CSPs fälschlich als kaputt.
  if (opts.hashFn) {
    const algos = ['sha256', 'sha384', 'sha512'].filter((a) => csp.includes(`'${a}-`));
    if (algos.length) {
      for (const r of resources) {
        if (r.type !== 'inline' || typeof r.content !== 'string') continue;
        r.hashes = algos.map((a) => `'${a}-${opts.hashFn?.(r.content ?? '', a)}'`);
      }
    }
  }

  return dedupe(findViolations(csp, resources, { siteOrigin: opts.siteOrigin }));
}

/**
 * Formatiert einen Fund als einzeilige, direkt umsetzbare Meldung.
 * @param {Finding} f
 * @returns {string}
 */
export function formatFinding(f) {
  const { resource: r, result, count } = f;
  const what =
    r.type === 'inline'
      ? `Inline-<${r.directive.startsWith('style') ? 'style' : 'script'}>-Block`
      : r.type === 'attr'
        ? `${r.directive.startsWith('style') ? 'style="…"' : 'on*="…"'}-Attribut`
        : r.url;
  const mark = result.allowed ? '⚠' : '❌';
  const times = count > 1 ? ` (${count}×)` : '';
  return `${mark} ${r.where ?? '?'}${times}  ${what}\n   → ${result.reason}`;
}
