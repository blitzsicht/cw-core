export type CspIssueType =
  | 'csp_non_ascii'
  | 'missing_style_src_elem'
  | 'missing_script_src_elem'
  | 'missing_media_src'
  | 'elem_narrower_than_base'
  | 'plausible_missing_script_elem'
  | 'plausible_missing_connect'
  | 'self_without_origin'
  | 'unsafe_eval'
  | 'script_src_wildcard'
  | 'missing_object_src'
  | 'missing_base_uri';

export interface CspIssue {
  type: CspIssueType;
  details: string;
}

export interface CspCheckOptions {
  /** Analytics-Host für die Konsistenz-Prüfung. Default 'plausible.io'; null = aus. */
  analyticsHost?: string | null;
  /** Eigene Site-Domain (z. B. 'https://donau-profi.de'). Aktiviert den self_without_origin-Check. */
  siteOrigin?: string | null;
}

export function parseCsp(csp: string): Map<string, string[]>;
export function extractCspValuesFromVercelJson(vercelJsonRaw: string): string[];
export function tokenHost(token: string): string;
export function checkCspCompleteness(csp: string, opts?: CspCheckOptions): CspIssue[];
