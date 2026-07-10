// @ts-check
/**
 * @cw/core/integrations/ai-discovery/cache-header-check
 *
 * Build-time-Guard für Cache-Control-Header in Customer-`vercel.json`.
 *
 * Reines JS (+ cache-header-check.d.ts) — gleiche Konvention wie csp-check.js,
 * damit CLI-Scripts es aus `node_modules` laden können (kein TS-type-stripping
 * unter node_modules). Astro/Vite (index.ts) importiert dieselbe `.js`.
 *
 * Hintergrund (Speed-Rollout 2026-07-09): Kein einziges Customer-`vercel.json`
 * im Cluster hatte Cache-Control-Header — alle public/-Assets (Hero-WebPs,
 * Logos, OG-Bilder) liefen mit Vercel-Default `max-age=0, must-revalidate`
 * zum Browser. Nur gehashte `/_astro/*` bekommen von Vercels Astro-Preset
 * automatisch `max-age=31536000, immutable`. Siehe docs/caching-rationale.md.
 *
 * Zwei Anti-Pattern werden zusätzlich abgefangen:
 *   - `immutable` auf public/-Pfaden: Dateinamen sind dort STABIL über
 *     Deploys → ein geänderter Inhalt unter gleichem Namen wäre für Browser
 *     für immer stale.
 *   - `no-store`/`max-age=0` auf Asset-Pfaden: deaktiviert Caching komplett.
 *
 * @typedef {'vercel_json_unparseable'|'missing_asset_cache_control'|'missing_font_cache_control'|'immutable_on_mutable_path'|'no_store_on_assets'} CacheIssueType
 * @typedef {{ type: CacheIssueType, details: string }} CacheIssue
 * @typedef {{ source: string, cacheControl: string|null }} HeaderRule
 * @typedef {{ hasFontsDir?: boolean }} CacheCheckOptions
 */

/**
 * Liest alle Header-Regeln (source + Cache-Control-Wert, falls vorhanden)
 * aus einer rohen vercel.json. Unparsebare JSON → null (Aufrufer meldet
 * `vercel_json_unparseable`, wirft nie).
 * @param {string} vercelJsonRaw
 * @returns {HeaderRule[]|null}
 */
export function extractHeaderRulesFromVercelJson(vercelJsonRaw) {
  let json;
  try {
    json = JSON.parse(vercelJsonRaw);
  } catch {
    return null;
  }
  /** @type {HeaderRule[]} */
  const rules = [];
  for (const block of json?.headers ?? []) {
    if (typeof block?.source !== 'string') continue;
    let cacheControl = null;
    for (const h of block?.headers ?? []) {
      if (
        typeof h?.key === 'string' &&
        h.key.toLowerCase() === 'cache-control' &&
        typeof h?.value === 'string'
      ) {
        cacheControl = h.value;
        break;
      }
    }
    rules.push({ source: block.source, cacheControl });
  }
  return rules;
}

/**
 * Heuristik: zielt eine source-Pattern auf public/-Assets?
 * (Bilder-/Icon-/OG-Verzeichnisse, Logo/Favicon-Dateien oder
 * Bild-Extension-Alternationen — nicht der Catch-all `/(.*)`.)
 * @param {string} source
 * @returns {boolean}
 */
export function isAssetSource(source) {
  const s = source.toLowerCase();
  if (s.startsWith('/_astro')) return false;
  return (
    /\/(images|img|icons|og|media|assets)\//.test(s) ||
    /favicon|logo/.test(s) ||
    /\((?:[a-z0-9]+\|)*(?:jpg|jpeg|png|webp|avif|gif|svg|ico)(?:\|[a-z0-9]+)*\)/.test(s)
  );
}

/**
 * Prüft die extrahierten Header-Regeln auf fehlende/kaputte Cache-Politik.
 * `rules === null` (Parse-Fehler) → genau ein `vercel_json_unparseable`-Issue.
 * Wirft nie.
 * @param {HeaderRule[]|null} rules
 * @param {CacheCheckOptions} [opts]
 * @returns {CacheIssue[]}
 */
export function checkCacheHeaders(rules, opts = {}) {
  const { hasFontsDir = false } = opts;
  /** @type {CacheIssue[]} */
  const issues = [];

  if (rules === null) {
    issues.push({
      type: 'vercel_json_unparseable',
      details: 'vercel.json ist kein gültiges JSON — Cache-Header-Check übersprungen.',
    });
    return issues;
  }

  // 1. Mindestens eine Cache-Control-Regel für public-Asset-Pfade.
  const assetRulesWithCache = rules.filter((r) => r.cacheControl && isAssetSource(r.source));
  if (assetRulesWithCache.length === 0) {
    issues.push({
      type: 'missing_asset_cache_control',
      details:
        'Keine Cache-Control-Regel für public/-Assets (z. B. "/images/(.*)", "/og/(.*)", Logo/Favicon) — ' +
        'Vercel liefert public/-Dateien sonst mit max-age=0 aus. Empfehlung: "public, max-age=86400". ' +
        'Siehe cw-core docs/caching-rationale.md bzw. src/templates/vercel.template.json.',
    });
  }

  // 2. Fonts werden self-hosted, aber ohne Cache-Regel.
  if (hasFontsDir) {
    const fontRule = rules.find((r) => r.cacheControl && /\/fonts\//.test(r.source.toLowerCase()));
    if (!fontRule) {
      issues.push({
        type: 'missing_font_cache_control',
        details:
          'dist/fonts/ existiert (self-hosted Fonts), aber keine Cache-Control-Regel für "/fonts/(.*)" — ' +
          'Empfehlung: "public, max-age=2592000" (Fonts ändern sich praktisch nie).',
      });
    }
  }

  for (const r of rules) {
    if (!r.cacheControl) continue;
    const cc = r.cacheControl.toLowerCase();

    // 3. immutable auf Nicht-/_astro-Pfaden: Dateinamen dort sind stabil
    //    über Deploys → geänderter Inhalt wäre für Browser für immer stale.
    if (cc.includes('immutable') && !r.source.startsWith('/_astro')) {
      issues.push({
        type: 'immutable_on_mutable_path',
        details:
          `"${r.source}": immutable auf public/-Pfad — Dateinamen sind dort NICHT content-gehasht. ` +
          'immutable nur für "/_astro/(.*)". Für public/-Assets: "public, max-age=86400".',
      });
    }

    // 4. no-store / max-age=0 auf Asset-Pfaden deaktiviert Caching komplett.
    if (isAssetSource(r.source) && (cc.includes('no-store') || /max-age=0(?![0-9])/.test(cc))) {
      issues.push({
        type: 'no_store_on_assets',
        details: `"${r.source}": "${r.cacheControl}" deaktiviert Asset-Caching — für statische Assets kontraproduktiv.`,
      });
    }
  }

  return issues;
}
