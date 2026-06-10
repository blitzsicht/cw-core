// @ts-check
/**
 * @cw/core/integrations/ai-discovery/csp-check
 *
 * Build-time-Guard gegen CSP-Drift in Customer-`vercel.json`.
 *
 * Reines JS (+ csp-check.d.ts), damit die CLI-Scripts (validate-csp.mjs,
 * gen-vercel-csp.mjs) es auch aus `node_modules` laden können — Node lehnt
 * TypeScript-type-stripping unter node_modules ab (ERR_UNSUPPORTED_NODE_
 * MODULES_TYPE_STRIPPING). Astro/Vite (index.ts) importiert dieselbe `.js`.
 *
 * Hintergrund: Das "DD-CSP-Mystery" — `'self'` ALLEIN matcht same-origin
 * Assets in Chrome/Edge/Safari auf Astro/Vercel-Sites nicht zuverlässig.
 * Siehe docs/CSP-rationale.md.
 *
 * @typedef {'csp_non_ascii'|'missing_style_src_elem'|'missing_script_src_elem'|'missing_media_src'|'elem_narrower_than_base'|'plausible_missing_script_elem'|'plausible_missing_connect'|'self_without_origin'|'unsafe_eval'|'script_src_wildcard'|'missing_object_src'|'missing_base_uri'} CspIssueType
 * @typedef {{ type: CspIssueType, details: string }} CspIssue
 * @typedef {{ analyticsHost?: string|null, siteOrigin?: string|null }} CspCheckOptions
 */

/**
 * Parst einen CSP-String in eine Map `directive → sources[]`.
 * Bei doppelter Direktive gilt die ERSTE (CSP-Spec / Browser-Verhalten).
 * @param {string} csp
 * @returns {Map<string, string[]>}
 */
export function parseCsp(csp) {
  const map = new Map();
  for (const part of csp.split(';')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const tokens = trimmed.split(/\s+/);
    const directive = tokens[0].toLowerCase();
    if (!directive) continue;
    if (!map.has(directive)) map.set(directive, tokens.slice(1));
  }
  return map;
}

/**
 * Liest alle `Content-Security-Policy`-Header-Werte aus einer rohen vercel.json.
 * Unparsebare JSON → leeres Array.
 * @param {string} vercelJsonRaw
 * @returns {string[]}
 */
export function extractCspValuesFromVercelJson(vercelJsonRaw) {
  /** @type {string[]} */
  const values = [];
  let json;
  try {
    json = JSON.parse(vercelJsonRaw);
  } catch {
    return values;
  }
  for (const block of json?.headers ?? []) {
    for (const h of block?.headers ?? []) {
      if (
        typeof h?.key === 'string' &&
        h.key.toLowerCase() === 'content-security-policy' &&
        typeof h?.value === 'string'
      ) {
        values.push(h.value);
      }
    }
  }
  return values;
}

/** @param {string[]} base @param {string[]} elem @returns {string[]} */
function missingSources(base, elem) {
  const have = new Set(elem);
  return base.filter((s) => !have.has(s));
}

/**
 * Normalisiert einen CSP-Source-Token ODER Origin auf den reinen Host:
 * ohne `https?://`, ohne Pfad, ohne führendes `www.`, lowercase.
 * @param {string} token
 * @returns {string}
 */
export function tokenHost(token) {
  return token
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .replace(/^www\./, '')
    .toLowerCase();
}

/** Host-genauer Match (kein Substring → kein `profi.de`⊂`donau-profi.de`-Bug). @param {string[]|undefined} sources @param {string} needle @returns {boolean} */
function sourcesIncludeHost(sources, needle) {
  const want = tokenHost(needle);
  return !!sources && sources.some((s) => tokenHost(s) === want);
}

// Source-Direktiven, in denen `'self'` den expliziten Origin daneben braucht.
const SELF_DIRECTIVES = [
  'default-src', 'script-src', 'script-src-elem',
  'style-src', 'style-src-elem', 'font-src', 'connect-src', 'media-src', 'img-src',
];

/**
 * Validiert eine CSP auf bekannte Drift-/Härtungs-Muster. Wirft nie.
 * Leerer CSP → keine Issues.
 * @param {string} csp
 * @param {CspCheckOptions} [opts]
 * @returns {CspIssue[]}
 */
export function checkCspCompleteness(csp, opts = {}) {
  const { analyticsHost = 'plausible.io', siteOrigin = null } = opts;
  /** @type {CspIssue[]} */
  const issues = [];
  if (!csp || !csp.trim()) return issues;

  // 1. ASCII-Hygiene — Smart-Quotes (U+2018/U+2019) statt ASCII U+0027.
  const nonAscii = csp.match(/[^\x00-\x7F]/g);
  if (nonAscii) {
    const uniq = [...new Set(nonAscii)].map(
      (c) => `U+${(c.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, '0')}`,
    );
    issues.push({
      type: 'csp_non_ascii',
      details: `CSP enthält Nicht-ASCII-Zeichen (${uniq.join(', ')}) — vermutlich Smart-Quotes statt ASCII '. Bricht Chrome's Parser.`,
    });
  }

  const map = parseCsp(csp);

  // 2./3. style-src/script-src ohne -elem-Variante.
  if (map.has('style-src') && !map.has('style-src-elem')) {
    issues.push({ type: 'missing_style_src_elem', details: "style-src gesetzt, aber style-src-elem fehlt — explizit ergänzen (z. B. \"style-src-elem 'self' 'unsafe-inline'\")." });
  }
  if (map.has('script-src') && !map.has('script-src-elem')) {
    issues.push({ type: 'missing_script_src_elem', details: 'script-src gesetzt, aber script-src-elem fehlt — explizit ergänzen (inkl. externer Script-Hosts).' });
  }

  // 4. media-src fehlt → stiller default-src-Fallback.
  if (!map.has('media-src')) {
    issues.push({ type: 'missing_media_src', details: "media-src fehlt — explizit setzen (z. B. \"media-src 'self'\"), sonst still default-src-Fallback." });
  }

  // 5. -elem darf nicht schmaler sein als die Basis.
  for (const base of ['style-src', 'script-src']) {
    const elem = `${base}-elem`;
    const baseSrc = map.get(base);
    const elemSrc = map.get(elem);
    if (baseSrc && elemSrc) {
      const missing = missingSources(baseSrc, elemSrc);
      if (missing.length > 0) {
        issues.push({ type: 'elem_narrower_than_base', details: `${elem} fehlen Quellen aus ${base}: ${missing.join(', ')}.` });
      }
    }
  }

  // 6. Analytics-Konsistenz.
  const allSources = [...map.values()].flat();
  if (analyticsHost && sourcesIncludeHost(allSources, analyticsHost)) {
    const effectiveScriptElem = map.get('script-src-elem') ?? map.get('script-src');
    if (!sourcesIncludeHost(effectiveScriptElem, analyticsHost)) {
      issues.push({ type: 'plausible_missing_script_elem', details: `${analyticsHost} referenziert, fehlt aber in script-src-elem (bzw. script-src) — externes Analytics-Script wird geblockt.` });
    }
    if (!sourcesIncludeHost(map.get('connect-src'), analyticsHost)) {
      issues.push({ type: 'plausible_missing_connect', details: `${analyticsHost} referenziert, fehlt aber in connect-src — Analytics-Events (fetch/beacon) werden geblockt.` });
    }
  }

  // 7. 'self'-Pragma — der teuerste cw-core-CSP-Bug. `'self'` allein matcht
  //    same-origin Assets in Chrome/Edge/Safari nicht zuverlässig.
  if (siteOrigin) {
    const host = tokenHost(siteOrigin);
    if (host) {
      const offenders = SELF_DIRECTIVES.filter((d) => {
        const sources = map.get(d);
        if (!sources || !sources.includes("'self'")) return false;
        return !sources.some((s) => tokenHost(s) === host);
      });
      if (offenders.length > 0) {
        issues.push({ type: 'self_without_origin', details: `'self' ohne expliziten Origin in: ${offenders.join(', ')}. 'self' allein bricht same-origin Assets in Chrome/Edge/Safari auf Astro/Vercel — füge https://${host} neben 'self' ein.` });
      }
    }
  }

  // 8. Härtung: 'unsafe-eval' / Wildcard in Script-Direktiven = echte XSS-Lücke.
  for (const d of ['script-src', 'script-src-elem']) {
    const sources = map.get(d);
    if (!sources) continue;
    if (sources.includes("'unsafe-eval'")) {
      issues.push({ type: 'unsafe_eval', details: `${d} enthält 'unsafe-eval' — hebelt den XSS-Schutz weitgehend aus. Entfernen.` });
    }
    if (sources.includes('*') || sources.includes('https:') || sources.includes('http:')) {
      issues.push({ type: 'script_src_wildcard', details: `${d} enthält eine Wildcard-Quelle (*, https: oder http:) — erlaubt beliebige Scripts. Auf konkrete Hosts einschränken.` });
    }
  }

  // 9. Härtung: object-src 'none' + base-uri 'self' (base-uri hat keinen Fallback).
  if (!map.has('object-src')) {
    issues.push({ type: 'missing_object_src', details: "object-src fehlt — \"object-src 'none'\" setzen (Plugin/<object>/<embed>-XSS)." });
  }
  if (!map.has('base-uri')) {
    issues.push({ type: 'missing_base_uri', details: "base-uri fehlt — \"base-uri 'self'\" setzen (kein default-src-Fallback → sonst <base href>-Hijacking möglich)." });
  }

  return issues;
}
