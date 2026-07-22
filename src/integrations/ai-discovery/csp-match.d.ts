export type ResourceType = 'url' | 'inline' | 'attr';

export interface Resource {
  /** 'url' = externe/relative Referenz, 'inline' = <style>/<script>-Block, 'attr' = style="…"/on*=… */
  type: ResourceType;
  /** Ziel-Direktive, z. B. 'style-src-elem'. Fallback-Kette wird intern aufgelöst. */
  directive: string;
  /** Nur bei type 'url'. */
  url?: string;
  /** nonce-Attribut des Elements (nur type 'inline'). */
  nonce?: string | null;
  /** Vorberechnete Hash-Sources, z. B. ["'sha256-…'"] (nur type 'inline'). */
  hashes?: string[];
  /** Roher Inhalt eines Inline-Blocks — Basis für die Hash-Berechnung. */
  content?: string;
  /** Fundstelle für die Fehlermeldung, z. B. 'dist/index.html:42'. */
  where?: string;
}

export interface MatchResult {
  allowed: boolean;
  /** Spec-erlaubt, aber nur über nacktes 'self' — bekanntes Bruchmuster (docs/CSP-rationale.md). */
  risky: boolean;
  /** Die tatsächlich greifende Direktive nach Fallback-Auflösung. */
  directive: string | null;
  /** Der Source-Token, der gematcht hat. */
  matchedBy: string | null;
  reason: string;
}

export interface MatchOptions {
  /** Eigene Site-Domain, z. B. 'https://gympanzen.com'. Nötig für 'self'-Auflösung. */
  siteOrigin?: string | null;
}

export function checkResource(
  map: Map<string, string[]>,
  res: Resource,
  opts?: MatchOptions,
): MatchResult;

export function findViolations(
  csp: string,
  resources: Resource[],
  opts?: MatchOptions,
): Array<Resource & { result: MatchResult }>;
