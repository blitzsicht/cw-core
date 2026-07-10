export type CacheIssueType =
  | 'vercel_json_unparseable'
  | 'missing_asset_cache_control'
  | 'missing_font_cache_control'
  | 'immutable_on_mutable_path'
  | 'no_store_on_assets';

export interface CacheIssue {
  type: CacheIssueType;
  details: string;
}

export interface HeaderRule {
  source: string;
  /** Wert des Cache-Control-Headers der Regel, oder null wenn keiner gesetzt. */
  cacheControl: string | null;
}

export interface CacheCheckOptions {
  /** true, wenn dist/fonts/ existiert (self-hosted Fonts) → Font-Cache-Regel wird verlangt. */
  hasFontsDir?: boolean;
}

export function extractHeaderRulesFromVercelJson(vercelJsonRaw: string): HeaderRule[] | null;
export function isAssetSource(source: string): boolean;
export function checkCacheHeaders(rules: HeaderRule[] | null, opts?: CacheCheckOptions): CacheIssue[];
