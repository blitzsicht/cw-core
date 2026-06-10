/**
 * @cw/core/integrations/ai-discovery/csp-build
 *
 * Single Source of Truth für die Customer-CSP. Verhindert CSP-Drift by-design:
 * statt handgepflegter `'self'`-Direktiven (die in Chrome/Edge/Safari same-origin
 * Assets brechen — siehe csp-check.ts + docs/CSP-rationale.md) wird die CSP aus
 * dem Origin + Dienst-Flags generiert.
 *
 * - `buildCsp(origin, opts)` — baut die kanonische cw-core-CSP von Grund auf (Onboarding).
 * - `fixCsp(existing, origin)` — repariert eine bestehende CSP strukturell (Pragma-Origin
 *   neben jedes `'self'`, object-src/base-uri ergänzen, *-elem-Konsistenz), OHNE
 *   customer-spezifische Dienst-Hosts zu verlieren (Cluster-Rollout).
 *
 * Beide Outputs bestehen `checkCspCompleteness()` mit 0 Issues.
 */

import { parseCsp, tokenHost } from './csp-check.ts';

/** Normalisiert einen Origin auf `https://host` (Schema ergänzen, trailing slash weg). */
export function normOrigin(o: string): string {
  let s = o.trim().replace(/\/+$/, '');
  if (!/^https?:\/\//.test(s)) s = `https://${s}`;
  return s;
}

export interface BuildCspOptions {
  /** Plausible Analytics (plausible.io). Default true. */
  plausible?: boolean;
  /** Cloudflare Turnstile (challenges.cloudflare.com) — ContactForm-Spamschutz. Default true. */
  turnstile?: boolean;
  /** Cal.com Booking (app.cal.eu). Default false. */
  cal?: boolean;
  /** Tally Forms (tally.so). Default false. */
  tally?: boolean;
}

const HOSTS = {
  plausible: 'https://plausible.io',
  turnstile: 'https://challenges.cloudflare.com',
  cal: 'https://app.cal.eu',
  tally: 'https://tally.so',
} as const;

/** Baut die kanonische cw-core-CSP für einen Origin (SSOT). */
export function buildCsp(siteOrigin: string, opts: BuildCspOptions = {}): string {
  const { plausible = true, turnstile = true, cal = false, tally = false } = opts;
  const O = normOrigin(siteOrigin);
  const SELF = `'self' ${O}`;

  const pick = (sel: Partial<Record<keyof typeof HOSTS, boolean>>) =>
    (Object.keys(HOSTS) as (keyof typeof HOSTS)[]).filter((k) => sel[k]).map((k) => HOSTS[k]);

  const scriptHosts = pick({ plausible, turnstile, cal, tally });
  const connectHosts = pick({ plausible, turnstile, cal });
  const frameHosts = pick({ turnstile, cal, tally });

  const script = [SELF, "'unsafe-inline'", ...scriptHosts].join(' ');

  const directives: string[] = [
    `default-src ${SELF}`,
    `script-src ${script}`,
    `script-src-elem ${script}`,
    `style-src ${SELF} 'unsafe-inline'`,
    `style-src-elem ${SELF} 'unsafe-inline'`,
    `img-src ${SELF} data: https:`,
    `font-src ${SELF}`,
    `connect-src ${[SELF, ...connectHosts].join(' ')}`,
    `media-src ${SELF}`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `frame-ancestors 'none'`,
  ];
  if (frameHosts.length) directives.push(`frame-src ${frameHosts.join(' ')}`);
  return directives.join('; ');
}

// Direktiven, in denen 'self' den expliziten Origin daneben braucht (Pragma-Fix).
const SELF_DIRECTIVES = [
  'default-src', 'script-src', 'script-src-elem',
  'style-src', 'style-src-elem', 'font-src', 'connect-src', 'media-src', 'img-src',
];

/**
 * Repariert eine bestehende CSP strukturell, ohne Dienst-Hosts zu verlieren:
 * - Pragma-Origin neben jedes `'self'` in den Source-Direktiven.
 * - `script-src-elem`/`style-src-elem` ⊇ Basis (Konsistenz).
 * - `object-src 'none'` + `base-uri 'self'` ergänzen falls fehlend.
 * - `media-src` ergänzen falls fehlend (und default-src existiert).
 * Reihenfolge der vorhandenen Direktiven bleibt erhalten (Map-Insertion-Order).
 */
export function fixCsp(existing: string, siteOrigin: string): string {
  const O = normOrigin(siteOrigin);
  const host = tokenHost(O);
  const map = parseCsp(existing);

  // 1. Pragma-Origin neben 'self'
  for (const d of SELF_DIRECTIVES) {
    const sources = map.get(d);
    if (!sources || !sources.includes("'self'")) continue;
    if (!sources.some((s) => tokenHost(s) === host)) {
      sources.splice(sources.indexOf("'self'") + 1, 0, O);
    }
  }

  // 2. -elem ⊇ Basis (fehlende Basis-Quellen ergänzen; -elem anlegen falls Basis existiert)
  for (const base of ['script-src', 'style-src']) {
    const elem = `${base}-elem`;
    const baseSrc = map.get(base);
    if (!baseSrc) continue;
    if (!map.has(elem)) {
      map.set(elem, [...baseSrc]);
    } else {
      const elemSrc = map.get(elem)!;
      for (const s of baseSrc) if (!elemSrc.includes(s)) elemSrc.push(s);
    }
  }

  // 3. Härtung ergänzen
  if (!map.has('media-src') && map.has('default-src')) map.set('media-src', ['\'self\'', O]);
  if (!map.has('object-src')) map.set('object-src', ["'none'"]);
  if (!map.has('base-uri')) map.set('base-uri', ["'self'"]);

  return [...map.entries()].map(([d, s]) => (s.length ? `${d} ${s.join(' ')}` : d)).join('; ');
}
