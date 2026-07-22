// @ts-check
/**
 * @cw/core/integrations/ai-discovery/csp-match
 *
 * Der Matcher: beantwortet die einzige Frage, die zählt —
 * **würde diese CSP diese konkrete Ressource blocken?**
 *
 * Warum das existiert: `csp-check.js` vergleicht den CSP-*Text* mit bekannten
 * Fehlermustern. Es kann darum nur Brüche fangen, die schon einmal live waren
 * (5 Vorfälle bis 22.07.2026: soleno, digital-direkt, donau-profi, gympanzen).
 * Dieser Matcher vergleicht stattdessen die CSP mit dem, was der Build
 * tatsächlich ausliefert — und fängt damit auch Muster, die wir nie gesehen haben.
 *
 * Reines JS (+ csp-match.d.ts), ohne Node-APIs: derselbe Code läuft im
 * Cloudflare-Worker (cw-uptime Render-Smoke) und unter node_modules im
 * Customer-CI (siehe csp-check.js — ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING).
 *
 * @typedef {'url'|'inline'|'attr'} ResourceType
 * @typedef {{ type: ResourceType, directive: string, url?: string, nonce?: string|null, hashes?: string[], content?: string, where?: string }} Resource
 * @typedef {{ allowed: boolean, risky: boolean, directive: string|null, matchedBy: string|null, reason: string }} MatchResult
 * @typedef {{ siteOrigin?: string|null }} MatchOptions
 */

import { parseCsp, tokenHost } from './csp-check.js';

/**
 * Fallback-Ketten laut CSP-Spec. Erste vorhandene Direktive gewinnt; fehlen alle,
 * gibt es keine Einschränkung (→ erlaubt).
 * @type {Record<string, string[]>}
 */
const FALLBACK = {
  'script-src-elem': ['script-src-elem', 'script-src', 'default-src'],
  'script-src-attr': ['script-src-attr', 'script-src', 'default-src'],
  'style-src-elem': ['style-src-elem', 'style-src', 'default-src'],
  'style-src-attr': ['style-src-attr', 'style-src', 'default-src'],
  'img-src': ['img-src', 'default-src'],
  'font-src': ['font-src', 'default-src'],
  'media-src': ['media-src', 'default-src'],
  'connect-src': ['connect-src', 'default-src'],
  'manifest-src': ['manifest-src', 'default-src'],
  'frame-src': ['frame-src', 'child-src', 'default-src'],
  'worker-src': ['worker-src', 'child-src', 'script-src', 'default-src'],
  'object-src': ['object-src', 'default-src'],
  // form-action hat KEINEN default-src-Fallback (wie base-uri/frame-ancestors).
  'form-action': ['form-action'],
};

/** Direktiven ohne Source-Liste — nie als Erlaubnis-Quelle auswerten. */
const VALUELESS = new Set(['upgrade-insecure-requests', 'block-all-mixed-content']);

/**
 * Nur hier wird nacktes `'self'` als riskant markiert: die dokumentierte
 * Schwäche (docs/CSP-rationale.md) betrifft das **Laden von Assets**.
 * `form-action`/`frame-src` sind Navigations- bzw. Einbettungsziele — dort
 * `'self'` zu beanstanden erzeugt nur Rauschen, und ein verrauschter Gate
 * wird abgeschaltet (Lesson v0.31).
 */
const ASSET_DIRECTIVES = new Set([
  'default-src', 'script-src', 'script-src-elem', 'style-src', 'style-src-elem',
  'font-src', 'connect-src', 'media-src', 'img-src', 'manifest-src', 'worker-src',
]);

/** @param {string} s @returns {boolean} */
const isHashSource = (s) => /^'sha(256|384|512)-/.test(s);
/** @param {string} s @returns {boolean} */
const isNonceSource = (s) => /^'nonce-/.test(s);

/**
 * Schema einer URL (`https:`, `data:`, …) oder `null` bei relativer URL.
 * @param {string} url
 * @returns {string|null}
 */
function schemeOf(url) {
  const m = /^([a-z][a-z0-9+.-]*):/i.exec(url.trim());
  return m ? `${m[1].toLowerCase()}:` : null;
}

/**
 * Voller Host einer absoluten URL (ohne Port), `null` bei relativer URL.
 * `www.` bleibt erhalten — sonst könnten Subdomain-Wildcards (`*.foo.de`)
 * nicht mehr gegen `www.foo.de` matchen.
 * @param {string} url
 * @returns {string|null}
 */
function hostOf(url) {
  const m = /^[a-z][a-z0-9+.-]*:\/\/([^/?#]+)/i.exec(url.trim());
  if (!m) return null;
  return m[1].replace(/:\d+$/, '').toLowerCase();
}

/** www-Toleranz nur beim exakten Vergleich, nie beim Wildcard-Match. @param {string} h @returns {string} */
const stripWww = (h) => h.replace(/^www\./, '');

/**
 * Matcht eine URL gegen einen einzelnen CSP-Source-Token.
 * @param {string} source
 * @param {string} url
 * @param {string|null} siteHost
 * @returns {boolean}
 */
function sourceMatchesUrl(source, url, siteHost) {
  if (source === "'none'") return false;
  const scheme = schemeOf(url);
  const host = hostOf(url);

  // Wildcard: matcht alle Netzwerk-Schemas, aber NICHT data:/blob:/filesystem:.
  if (source === '*') return !scheme || !['data:', 'blob:', 'filesystem:'].includes(scheme);

  // 'self' — same-origin. Relative URLs sind per Definition same-origin.
  if (source === "'self'") {
    if (!host) return !scheme || ['http:', 'https:'].includes(scheme);
    return !!siteHost && stripWww(host) === siteHost;
  }

  // Schema-Source: "data:", "https:", "blob:" …
  if (/^[a-z][a-z0-9+.-]*:$/i.test(source)) {
    if (!scheme) return ['http:', 'https:'].includes(source.toLowerCase());
    return scheme === source.toLowerCase();
  }

  // Quoted Keywords, die nie eine URL erlauben.
  if (source.startsWith("'")) return false;

  // Host-Source, optional mit Schema/Port/Pfad/Subdomain-Wildcard.
  const srcHost = tokenHost(source);
  if (!srcHost) return false;
  const target = host ?? siteHost;
  if (!target) return false;
  // Wildcard gegen den vollen Host (www zählt als Subdomain), sonst exakt + www-tolerant.
  if (srcHost.startsWith('*.')) return target.endsWith(srcHost.slice(1));
  return stripWww(target) === srcHost;
}

/**
 * Prüft eine einzelne Ressource gegen eine geparste CSP.
 *
 * `risky` markiert Ressourcen, die laut Spec erlaubt sind, aber nur über ein
 * nacktes `'self'` matchen — das bekannte cw-core-Bruchmuster (donau-profi
 * 09.06.2026, siehe docs/CSP-rationale.md): `'self'` allein matcht same-origin
 * Assets in Chrome/Edge/Safari auf Astro/Vercel-Sites nicht zuverlässig.
 *
 * @param {Map<string, string[]>} map
 * @param {Resource} res
 * @param {MatchOptions} [opts]
 * @returns {MatchResult}
 */
export function checkResource(map, res, opts = {}) {
  const siteHost = opts.siteOrigin ? tokenHost(opts.siteOrigin) : null;
  const chain = FALLBACK[res.directive] ?? [res.directive, 'default-src'];

  /** @type {string|null} */
  let effective = null;
  /** @type {string[]} */
  let sources = [];
  for (const d of chain) {
    if (VALUELESS.has(d)) continue;
    const s = map.get(d);
    if (s) {
      effective = d;
      sources = s;
      break;
    }
  }

  // Keine Direktive der Kette gesetzt → keine Einschränkung.
  if (!effective) {
    return { allowed: true, risky: false, directive: null, matchedBy: null, reason: 'keine passende Direktive gesetzt' };
  }
  if (sources.includes("'none'")) {
    return { allowed: false, risky: false, directive: effective, matchedBy: null, reason: `${effective} ist 'none'` };
  }

  if (res.type === 'url') {
    const url = res.url ?? '';
    for (const s of sources) {
      if (sourceMatchesUrl(s, url, siteHost)) {
        const risky =
          s === "'self'" &&
          ASSET_DIRECTIVES.has(effective) &&
          !sources.some((o) => o !== "'self'" && tokenHost(o) === siteHost);
        return {
          allowed: true,
          risky,
          directive: effective,
          matchedBy: s,
          reason: risky
            ? `nur über nacktes 'self' erlaubt — bricht same-origin Assets in Chrome/Edge/Safari (docs/CSP-rationale.md)`
            : `erlaubt durch ${s}`,
        };
      }
    }
    return { allowed: false, risky: false, directive: effective, matchedBy: null, reason: `${effective} erlaubt ${url || '(leer)'} nicht` };
  }

  // --- Inline (<style>/<script>) und Attribute (style="…", on*=…) ---
  const hasNonceSrc = sources.some(isNonceSource);
  const hasHashSrc = sources.some(isHashSource);

  // Nonce gilt nur für Elemente, nie für Attribute.
  if (res.type === 'inline' && res.nonce && sources.includes(`'nonce-${res.nonce}'`)) {
    return { allowed: true, risky: false, directive: effective, matchedBy: `'nonce-${res.nonce}'`, reason: 'gültige Nonce' };
  }
  if (res.type === 'inline' && res.hashes?.length) {
    const hit = res.hashes.find((h) => sources.includes(h));
    if (hit) return { allowed: true, risky: false, directive: effective, matchedBy: hit, reason: 'gelisteter Hash' };
  }

  if (sources.includes("'unsafe-inline'")) {
    // CSP2+: sobald eine Nonce- oder Hash-Quelle präsent ist, ignoriert der
    // Browser 'unsafe-inline' — der häufigste Irrglaube bei Nonce-Migrationen.
    if (hasNonceSrc || hasHashSrc) {
      return {
        allowed: false,
        risky: false,
        directive: effective,
        matchedBy: null,
        reason: `${effective} enthält 'unsafe-inline', aber daneben Nonce/Hash-Quellen — Browser ignorieren 'unsafe-inline' dann (CSP2+)`,
      };
    }
    return { allowed: true, risky: false, directive: effective, matchedBy: "'unsafe-inline'", reason: "erlaubt durch 'unsafe-inline'" };
  }

  return {
    allowed: false,
    risky: false,
    directive: effective,
    matchedBy: null,
    reason: `${effective} erlaubt kein Inline — weder 'unsafe-inline' noch passender Hash/Nonce`,
  };
}

/**
 * Bequemlichkeits-Wrapper: prüft viele Ressourcen gegen einen CSP-String und
 * liefert nur die Beanstandungen (blockiert **oder** riskant).
 * @param {string} csp
 * @param {Resource[]} resources
 * @param {MatchOptions} [opts]
 * @returns {Array<Resource & { result: MatchResult }>}
 */
export function findViolations(csp, resources, opts = {}) {
  if (!csp || !csp.trim()) return [];
  const map = parseCsp(csp);
  /** @type {Array<Resource & { result: MatchResult }>} */
  const out = [];
  for (const res of resources) {
    const result = checkResource(map, res, opts);
    if (!result.allowed || result.risky) out.push({ ...res, result });
  }
  return out;
}
