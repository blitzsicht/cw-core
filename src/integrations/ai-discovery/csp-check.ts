/**
 * @cw/core/integrations/quality-checks/csp-check
 *
 * Build-time-Guard gegen CSP-Drift in Customer-`vercel.json`.
 *
 * Hintergrund: Das "DD-CSP-Mystery" (11.–12.05.2026) zeigte das Symptom
 * `style-src-elem 'self'` blockt eigene `/_astro/*.css` — wir haben es damals
 * nur per Re-Deploy weggewischt, Root-Cause offen gelassen und KEINEN Guard
 * gebaut. Der wiederholbare Bug dahinter ist CSP-Drift: unvollständige
 * Direktiven (8/11 Customer-Repos hatten zeitweise keine `-elem`-Varianten)
 * + fehlendes `plausible.io` in `script-src-elem`/`connect-src` + Smart-Quotes
 * (U+2018/U+2019 statt ASCII `'`), die Chrome's Parser brechen.
 *
 * Dieser Modul kapselt das Parsen + Validieren als PURE Funktionen, damit es
 * ohne Astro/FS unit-testbar ist. Die Integration (index.ts) liefert nur den
 * CSP-String aus `vercel.json`.
 *
 * Bewusst konservativ: nur hochkonfidente Regeln, um die False-Positives zu
 * vermeiden, die ein naiver zeilenbasierter grep-Scan produziert (genau die
 * Lehre, die diesen Guard ausgelöst hat).
 */

export type CspIssueType =
  | 'csp_non_ascii'
  | 'missing_style_src_elem'
  | 'missing_script_src_elem'
  | 'missing_media_src'
  | 'elem_narrower_than_base'
  | 'plausible_missing_script_elem'
  | 'plausible_missing_connect'
  | 'self_without_origin';

export interface CspIssue {
  type: CspIssueType;
  details: string;
}

/**
 * Parst einen CSP-String in eine Map `directive → sources[]`.
 * Direktiven-Namen werden lowercased; Sources behalten ihre Schreibweise.
 */
export function parseCsp(csp: string): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const part of csp.split(';')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const tokens = trimmed.split(/\s+/);
    const directive = tokens[0].toLowerCase();
    if (!directive) continue;
    map.set(directive, tokens.slice(1));
  }
  return map;
}

/**
 * Liest alle `Content-Security-Policy`-Header-Werte aus einer (rohen) vercel.json.
 * Pure (String→String[]) für Testbarkeit; mehrere Header-Blöcke möglich.
 * Unparsebare JSON → leeres Array (nicht unser Check).
 */
export function extractCspValuesFromVercelJson(vercelJsonRaw: string): string[] {
  const values: string[] = [];
  let json: any;
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

/** Quellen aus `base`, die in `elem` fehlen (Set-Differenz, Reihenfolge egal). */
function missingSources(base: string[], elem: string[]): string[] {
  const have = new Set(elem);
  return base.filter((s) => !have.has(s));
}

/** Enthält irgendeine Quelle den Host `needle` (z. B. "plausible.io")? */
function sourcesIncludeHost(sources: string[] | undefined, needle: string): boolean {
  return !!sources && sources.some((s) => s.includes(needle));
}

export interface CspCheckOptions {
  /**
   * Host der Analytics-Domain, dessen Konsistenz geprüft wird, wenn er in der
   * CSP referenziert ist. Default: 'plausible.io'. `null` → Analytics-Check aus.
   */
  analyticsHost?: string | null;
  /**
   * Eigene Site-Domain (z. B. 'https://donau-profi.de' oder 'donau-profi.de').
   * Wenn gesetzt: prüft, dass jede `'self'`-Source-Direktive ZUSÄTZLICH den
   * expliziten Origin enthält. Hintergrund: `'self'` ALLEIN matcht same-origin
   * Assets in Chrome/Edge/Safari auf cw-core/Astro/Vercel-Static-Sites NICHT
   * zuverlässig (per Bisection bewiesen 12.05. + 09.06.2026) → CSS/JS/Analytics
   * geblockt, Seite ungestyled. Fix: expliziter Origin neben `'self'`.
   * `null`/`undefined` → Check aus.
   */
  siteOrigin?: string | null;
}

/**
 * Validiert eine CSP auf die bekannten Drift-Muster. Gibt eine (ggf. leere)
 * Liste von Issues zurück — wirft nie. Leerer/whitespace CSP → keine Issues
 * (Skip-Verantwortung liegt beim Aufrufer).
 */
export function checkCspCompleteness(csp: string, opts: CspCheckOptions = {}): CspIssue[] {
  const { analyticsHost = 'plausible.io', siteOrigin = null } = opts;
  const issues: CspIssue[] = [];
  if (!csp || !csp.trim()) return issues;

  // 1. ASCII-Hygiene — Smart-Quotes (U+2018/U+2019) statt ASCII U+0027 brechen
  //    Chrome's CSP-Parser still und blocken dann scheinbar erlaubte Quellen.
  const nonAscii = csp.match(/[^\x00-\x7F]/g);
  if (nonAscii) {
    const uniq = [...new Set(nonAscii)].map(
      (c) => `U+${c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')}`,
    );
    issues.push({
      type: 'csp_non_ascii',
      details: `CSP enthält Nicht-ASCII-Zeichen (${uniq.join(', ')}) — vermutlich Smart-Quotes statt ASCII '. Bricht Chrome's Parser.`,
    });
  }

  const map = parseCsp(csp);

  // 2./3. style-src/script-src vorhanden, aber -elem-Variante fehlt.
  //       Browser fällt zwar auf die Basis zurück, aber inkonsistent → Drift-Marker.
  if (map.has('style-src') && !map.has('style-src-elem')) {
    issues.push({
      type: 'missing_style_src_elem',
      details: "style-src gesetzt, aber style-src-elem fehlt — explizit ergänzen (z. B. \"style-src-elem 'self' 'unsafe-inline'\").",
    });
  }
  if (map.has('script-src') && !map.has('script-src-elem')) {
    issues.push({
      type: 'missing_script_src_elem',
      details: "script-src gesetzt, aber script-src-elem fehlt — explizit ergänzen (inkl. externer Script-Hosts).",
    });
  }

  // 4. media-src fehlt → fällt still auf default-src zurück (der DD-Fall).
  if (!map.has('media-src')) {
    issues.push({
      type: 'missing_media_src',
      details: "media-src fehlt — explizit setzen (z. B. \"media-src 'self'\"), sonst still default-src-Fallback.",
    });
  }

  // 5. -elem darf nicht schmaler sein als die Basis (z. B. 'unsafe-inline' in
  //    style-src, aber nicht in style-src-elem → externe + inline brechen).
  for (const base of ['style-src', 'script-src'] as const) {
    const elem = `${base}-elem`;
    if (map.has(base) && map.has(elem)) {
      const missing = missingSources(map.get(base)!, map.get(elem)!);
      if (missing.length > 0) {
        issues.push({
          type: 'elem_narrower_than_base',
          details: `${elem} fehlen Quellen aus ${base}: ${missing.join(', ')}.`,
        });
      }
    }
  }

  // 6. Analytics-Konsistenz: wenn der Host irgendwo in der CSP steht, muss er
  //    in der effektiven script-Element-Direktive UND in connect-src stehen.
  if (analyticsHost && csp.includes(analyticsHost)) {
    const effectiveScriptElem = map.get('script-src-elem') ?? map.get('script-src');
    if (!sourcesIncludeHost(effectiveScriptElem, analyticsHost)) {
      issues.push({
        type: 'plausible_missing_script_elem',
        details: `${analyticsHost} referenziert, fehlt aber in script-src-elem (bzw. script-src) — externes Analytics-Script wird geblockt.`,
      });
    }
    if (!sourcesIncludeHost(map.get('connect-src'), analyticsHost)) {
      issues.push({
        type: 'plausible_missing_connect',
        details: `${analyticsHost} referenziert, fehlt aber in connect-src — Analytics-Events (fetch/beacon) werden geblockt.`,
      });
    }
  }

  // 7. 'self'-Pragma — der teuerste cw-core-CSP-Bug (2× je mehrere Stunden
  //    Phantom-Debugging). `'self'` ALLEIN matcht same-origin Assets in
  //    Chrome/Edge/Safari auf Astro/Vercel-Static-Sites NICHT zuverlässig →
  //    CSS/JS/Analytics geblockt, Seite ungestyled. Browser- und curl-Header
  //    divergieren (curl sieht 'self' korrekt). Fix: expliziter Origin neben
  //    'self'. Per Bisection bewiesen (Template hat ihn, gedriftete Customer
  //    nicht). Siehe docs/CSP-rationale.md.
  if (siteOrigin) {
    const host = siteOrigin.replace(/^https?:\/\//, '').replace(/\/.*$/, '').toLowerCase();
    if (host) {
      const SELF_DIRECTIVES = [
        'default-src', 'script-src', 'script-src-elem',
        'style-src', 'style-src-elem', 'font-src', 'connect-src',
      ];
      const offenders = SELF_DIRECTIVES.filter((d) => {
        const sources = map.get(d);
        if (!sources || !sources.includes("'self'")) return false;
        return !sources.some((s) => s.includes(host));
      });
      if (offenders.length > 0) {
        issues.push({
          type: 'self_without_origin',
          details: `'self' ohne expliziten Origin in: ${offenders.join(', ')}. 'self' allein bricht same-origin Assets in Chrome/Edge/Safari auf Astro/Vercel — füge https://${host} neben 'self' ein.`,
        });
      }
    }
  }

  return issues;
}
