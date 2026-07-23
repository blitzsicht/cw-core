// @ts-check
/**
 * @cw/core/integrations/ai-discovery/csp-build
 *
 * Single Source of Truth für die Customer-CSP (drift-frei by-design).
 * Reines JS (+ csp-build.d.ts) — siehe csp-check.js (node_modules-type-stripping).
 *
 * - `buildCsp(origin, opts)` — kanonische cw-core-CSP von Grund auf (Onboarding).
 * - `fixCsp(existing, origin)` — repariert bestehende CSP: Pragma-Origin neben
 *   jedes `'self'`, object-src/base-uri/frame-ancestors ergänzen, *-elem-Konsistenz,
 *   UND aktive Security-Sanitisierung (entfernt 'unsafe-eval'/Wildcards aus
 *   script-Direktiven) — ohne customer-spezifische Dienst-Hosts zu verlieren.
 *   Idempotent. Output besteht checkCspCompleteness mit 0 Issues.
 *
 * @typedef {{ plausible?: boolean, turnstile?: boolean, cal?: boolean, tally?: boolean, youtube?: boolean, osm?: boolean, vercelToolbar?: boolean, googleMaps?: boolean, inlineStyles?: boolean, inlineScripts?: boolean }} BuildCspOptions
 */

import { parseCsp, tokenHost } from './csp-check.js';

/** Normalisiert einen Origin auf `https://host` (Schema ergänzen, trailing slash weg). @param {string} o @returns {string} */
export function normOrigin(o) {
  let s = o.trim().replace(/\/+$/, '');
  if (!/^https?:\/\//.test(s)) s = `https://${s}`;
  return s;
}

/** Bekannte Dienst-Hosts. Exportiert, damit gen-vercel-csp sie nachrüsten kann. */
export const HOSTS = {
  plausible: 'https://plausible.io',
  turnstile: 'https://challenges.cloudflare.com',
  cal: 'https://app.cal.eu',
  tally: 'https://tally.so',
  // Ergänzt 22.07.2026 aus dem Fleet-Ist-Stand — ohne diese Hosts kann buildCsp
  // die real gewachsenen CSPs nicht reproduzieren und taugt nicht als SSOT.
  youtube: 'https://www.youtube-nocookie.com',
  osm: 'https://tile.openstreetmap.org',
  vercelToolbar: 'https://vercel.live',
  // Ergänzt 23.07.2026: schiller-gartenbau.de/service/ liefert eine Maps-Embed-iframe
  // aus, die die eigene CSP live blockt (frame-src kannte nur self + turnstile). Ohne
  // diesen Host konnte gen-vercel-csp den Fall nicht lösen — der Build-Guard brach ab,
  // ohne dass es eine Abhilfe gab. Nur der Embed-Host, nicht maps.googleapis.com.
  googleMaps: 'https://www.google.com',
};

// Quellen, die in Script-Direktiven nie erlaubt sein dürfen (XSS-Vektoren).
const UNSAFE_SCRIPT_SOURCES = new Set(["'unsafe-eval'", '*', 'https:', 'http:']);

/**
 * Baut die kanonische cw-core-CSP für einen Origin (SSOT).
 * @param {string} siteOrigin
 * @param {BuildCspOptions} [opts]
 * @returns {string}
 */
export function buildCsp(siteOrigin, opts = {}) {
  const {
    plausible = true,
    turnstile = true,
    cal = false,
    tally = false,
    youtube = false,
    osm = false,
    vercelToolbar = false,
    googleMaps = false,
    // Astros `inlineStylesheets: 'always'` (Perf-Standard) erzeugt einen
    // <style>-Block — ohne 'unsafe-inline' wäre die Seite komplett ungestylt.
    // Das war der gympanzen-Vorfall. Default true, weil der Perf-Standard gilt.
    inlineStyles = true,
    // Default true = Fleet-Ist-Stand. Auf false setzen, wenn der Build keine
    // ausführbaren Inline-Scripts erzeugt (JSON-LD zählt nicht) — dann bleibt
    // die CSP strenger. Der Output-Check (csp-audit) verifiziert das je Build.
    inlineScripts = true,
  } = opts;
  const O = normOrigin(siteOrigin);
  const SELF = `'self' ${O}`;
  const flags = { plausible, turnstile, cal, tally, youtube, osm, vercelToolbar, googleMaps };

  /** @param {(keyof typeof HOSTS)[]} keys */
  const pick = (keys) => keys.filter((k) => flags[k]).map((k) => HOSTS[k]);

  const scriptHosts = pick(['plausible', 'turnstile', 'cal', 'tally', 'vercelToolbar']);
  const connectHosts = pick(['plausible', 'turnstile', 'cal', 'vercelToolbar']);
  const frameHosts = pick(['turnstile', 'cal', 'tally', 'youtube', 'vercelToolbar', 'googleMaps']);
  const imgHosts = pick(['osm']);
  const script = [SELF, ...(inlineScripts ? ["'unsafe-inline'"] : []), ...scriptHosts].join(' ');
  const style = [SELF, ...(inlineStyles ? ["'unsafe-inline'"] : [])].join(' ');

  const directives = [
    `default-src ${SELF}`,
    `script-src ${script}`,
    `script-src-elem ${script}`,
    `style-src ${style}`,
    `style-src-elem ${style}`,
    `img-src ${[SELF, 'data:', 'https:', ...imgHosts].join(' ')}`,
    `font-src ${SELF}`,
    `connect-src ${[SELF, ...connectHosts].join(' ')}`,
    `media-src ${SELF}`,
    `manifest-src ${SELF}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    'upgrade-insecure-requests',
  ];
  if (frameHosts.length) directives.push(`frame-src ${frameHosts.join(' ')}`);
  return directives.join('; ');
}

// Direktiven, in denen 'self' den expliziten Origin daneben braucht.
const SELF_DIRECTIVES = [
  'default-src', 'script-src', 'script-src-elem',
  'style-src', 'style-src-elem', 'font-src', 'connect-src', 'media-src', 'img-src',
  // Muss mit csp-check.js SELF_DIRECTIVES deckungsgleich bleiben — sonst
  // repariert fixCsp genau die Direktiven nicht, die der Check beanstandet.
  'manifest-src', 'worker-src',
];

/**
 * Repariert eine bestehende CSP strukturell + sicherheitstechnisch, ohne
 * Dienst-Hosts zu verlieren. Idempotent.
 * @param {string} existing
 * @param {string} siteOrigin
 * @returns {string}
 */
export function fixCsp(existing, siteOrigin) {
  const O = normOrigin(siteOrigin);
  const host = tokenHost(O);
  const map = parseCsp(existing);

  // 1. Security-Sanitisierung: gefährliche Quellen aus Script-Direktiven entfernen
  //    (NICHT nur melden — defense-in-depth, falls der Validator-Gate mal nicht läuft).
  for (const d of ['script-src', 'script-src-elem']) {
    const sources = map.get(d);
    if (sources) map.set(d, sources.filter((s) => !UNSAFE_SCRIPT_SOURCES.has(s)));
  }

  // 2. Pragma-Origin neben 'self'.
  for (const d of SELF_DIRECTIVES) {
    const sources = map.get(d);
    if (!sources || !sources.includes("'self'")) continue;
    if (!sources.some((s) => tokenHost(s) === host)) {
      sources.splice(sources.indexOf("'self'") + 1, 0, O);
    }
  }

  // 3. -elem ⊇ Basis (Konsistenz; gefährliche Quellen wurden in Schritt 1 entfernt).
  for (const base of ['script-src', 'style-src']) {
    const elem = `${base}-elem`;
    const baseSrc = map.get(base);
    if (!baseSrc) continue;
    if (!map.has(elem)) {
      map.set(elem, [...baseSrc]);
    } else {
      const elemSrc = map.get(elem);
      for (const s of baseSrc) if (!elemSrc.includes(s)) elemSrc.push(s);
    }
  }

  // 4. Härtung ergänzen (idempotent).
  if (!map.has('media-src') && map.has('default-src')) map.set('media-src', ["'self'", O]);
  if (!map.has('object-src')) map.set('object-src', ["'none'"]);
  if (!map.has('base-uri')) map.set('base-uri', ["'self'"]);
  if (!map.has('frame-ancestors')) map.set('frame-ancestors', ["'none'"]);

  return [...map.entries()].map(([d, s]) => (s.length ? `${d} ${s.join(' ')}` : d)).join('; ');
}
