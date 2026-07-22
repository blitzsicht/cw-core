import type { Resource, MatchResult } from './csp-match';

export interface Finding {
  resource: Resource;
  result: MatchResult;
  /** Wie oft dieselbe Beanstandung im Dokument vorkam. */
  count: number;
}

export interface AuditOptions {
  siteOrigin?: string | null;
  /** Dateiname für Fundstellen, z. B. 'dist/index.html'. */
  file?: string;
  /** Hash-Berechnung (base64), nur nötig wenn die CSP Hash-Sources enthält. */
  hashFn?: ((content: string, algo: string) => string) | null;
}

/** Prüft ein HTML-Dokument gegen eine CSP und liefert Beanstandungen. */
export function auditHtml(html: string, csp: string, opts?: AuditOptions): Finding[];

/** Formatiert einen Fund als umsetzbare Meldung. */
export function formatFinding(f: Finding): string;
