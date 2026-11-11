import type { Resource } from './csp-match';

/** Parst Tag-Attribute in ein lowercase-keyed Objekt. */
export function parseAttrs(raw: string): Record<string, string>;

/** Zieht `url(...)`-Referenzen aus CSS; innerhalb `@font-face` als font-src, sonst img-src. */
export function extractCssUrls(css: string, where: string): Resource[];

/** Sammelt alle CSP-relevanten Ressourcen eines HTML-Dokuments; ohne Eingabe `[]`. */
export function extractResources(html: string | null | undefined, file?: string): Resource[];

/** Ein Element aus `elementeAusHtml`. `el` ist der parse5-Knoten. */
export interface HtmlElement {
  tag: string;
  attrs: Record<string, string>;
  el: unknown;
  zeile: number;
  inMedia: boolean;
  ohneJs: boolean;
}

/** Jedes Element in Dokumentreihenfolge, iterativ, Klone einmal; `<noscript>` zusätzlich ohne JS gelesen. */
export function elementeAusHtml(html: string | null | undefined): Generator<HtmlElement>;

/** Direkter Textinhalt eines Elements aus `elementeAusHtml` (Körper von script/style). */
export function textVon(el: unknown): string;
