import type { Resource } from './csp-match';

/** Parst Tag-Attribute in ein lowercase-keyed Objekt. */
export function parseAttrs(raw: string): Record<string, string>;

/** Zieht `url(...)`-Referenzen aus CSS; innerhalb `@font-face` als font-src, sonst img-src. */
export function extractCssUrls(css: string, where: string): Resource[];

/** Sammelt alle CSP-relevanten Ressourcen eines HTML-Dokuments. */
export function extractResources(html: string, file?: string): Resource[];
