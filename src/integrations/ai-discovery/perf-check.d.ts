export type PerfIssueType = 'render_blocking_css' | 'dead_font_family' | 'image_over_budget';

export interface PerfIssue {
  type: PerfIssueType;
  details: string;
}

export function checkRenderBlockingCss(html: string, pagePath?: string): PerfIssue[];
export function checkImageBudget(
  images: { path: string; sizeBytes: number }[] | undefined,
  maxKb?: number,
): PerfIssue[];
export function extractReferencedFontFamilies(css: string): Set<string>;
export function extractFontFaceFamilies(css: string): Set<string>;
export function checkDeadFontFamilies(cssTexts: string[]): PerfIssue[];
export function extractInlineStyles(html: string): string[];
