// @ts-check
/**
 * @cw/core/integrations/ai-discovery/perf-check
 *
 * Build-time-Perf-Guards: Render-Blocking-CSS + tote Font-Familien.
 * Pure String-Logik pro Datei-Inhalt — der Directory-Walk passiert im
 * Aufrufer (index.ts, dort ist walkHtml in Scope). Gleicher Split wie
 * csp-check.js (extract/check pur, I/O beim Aufrufer).
 *
 * Hintergrund (Speed-Rollout 2026-07-09):
 *   - Render-Blocking: blitzsicht hat mit `build.inlineStylesheets: 'always'`
 *     ~720 ms gemessen gespart (4 CSS-Files). Andere Customer hatten den
 *     Astro-Default 'auto' → externe `<link rel="stylesheet">` blockieren
 *     First Paint.
 *   - Tote Fonts: steller referenzierte 'Inter'/'Work Sans' in tokens.css
 *     ohne jegliches @font-face/woff2 im Repo → stiller System-Fallback,
 *     toter Verweis, den nie jemand bemerkt hat.
 *
 * @typedef {'render_blocking_css'|'dead_font_family'|'image_over_budget'} PerfIssueType
 * @typedef {{ type: PerfIssueType, details: string }} PerfIssue
 */

/**
 * Findet render-blockende externe Stylesheets im HTML einer gebauten Seite.
 * Ein `<link rel="stylesheet" href="/_astro/...">` bedeutet:
 * `build.inlineStylesheets: 'always'` ist nicht aktiv.
 * @param {string} html
 * @param {string} [pagePath] Nur für die Meldung.
 * @returns {PerfIssue[]}
 */
export function checkRenderBlockingCss(html, pagePath = '') {
  /** @type {PerfIssue[]} */
  const issues = [];
  const linkRe = /<link\b[^>]*>/gi;
  for (const m of html.match(linkRe) ?? []) {
    const isStylesheet = /rel\s*=\s*["']?stylesheet["']?/i.test(m);
    const isAstroCss = /href\s*=\s*["']?[^"'>]*\/_astro\//i.test(m);
    if (isStylesheet && isAstroCss) {
      issues.push({
        type: 'render_blocking_css',
        details:
          `${pagePath || 'Seite'}: render-blockendes <link rel="stylesheet"> auf /_astro/-CSS — ` +
          "`build: { inlineStylesheets: 'always' }` in astro.config setzen (blitzsicht: ~720 ms gemessen).",
      });
      break; // Eine Meldung pro Seite reicht.
    }
  }
  return issues;
}

/**
 * Perf-Budget-Guard (blitzsicht-ops#541): flaggt dist-Bilder über dem KB-Budget.
 * Fängt das 2-MB-Hero, das durch die Cache-/CSS-/Font-Guards fällt. Reine
 * Größen-Logik — der Directory-Walk + `statSync` passiert im Aufrufer (index.ts,
 * reuse `walkImages`, das OG/Icons/Favicons schon ausschließt → keine FP auf
 * legitim großen OG-Bildern).
 * @param {{ path: string, sizeBytes: number }[]} images  dist-Bilder mit Größe.
 * @param {number} [maxKb=200] Schwelle pro Einzelbild in KB.
 * @returns {PerfIssue[]}
 */
export function checkImageBudget(images, maxKb = 200) {
  /** @type {PerfIssue[]} */
  const issues = [];
  const limitBytes = maxKb * 1024;
  for (const img of images ?? []) {
    if (img && typeof img.sizeBytes === 'number' && img.sizeBytes > limitBytes) {
      const kb = Math.round(img.sizeBytes / 1024);
      issues.push({
        type: 'image_over_budget',
        details:
          `${img.path || 'Bild'}: ${kb} KB > ${maxKb} KB — via optimize-images verkleinern ` +
          '(oder AVIF-Variante). Große Bilder verschlechtern LCP + Bandbreite.',
      });
    }
  }
  return issues;
}

/**
 * Font-Namen, die KEIN @font-face brauchen: generische Familien,
 * System-Stacks und Systemschriften der gängigen Plattformen.
 */
const SYSTEM_FONT_ALLOWLIST = new Set(
  [
    // CSS-wide keywords (blitzsicht-Canary-Befund 2026-07-10: 'inherit')
    'inherit', 'initial', 'unset', 'revert', 'revert-layer',
    // generisch (CSS-Spec)
    'sans-serif', 'serif', 'monospace', 'cursive', 'fantasy', 'math',
    'system-ui', 'ui-sans-serif', 'ui-serif', 'ui-monospace', 'ui-rounded',
    'emoji', 'fangsong',
    // System-Stacks
    '-apple-system', 'blinkmacsystemfont', 'segoe ui', 'roboto',
    'helvetica neue', 'helvetica', 'arial', 'arial black', 'verdana',
    'tahoma', 'trebuchet ms', 'georgia', 'times new roman', 'times',
    'courier new', 'courier', 'sfmono-regular', 'sf mono', 'menlo',
    'monaco', 'consolas', 'liberation mono', 'liberation sans',
    'lucida console', 'cantarell', 'ubuntu', 'noto sans', 'oxygen', 'fira sans', 'droid sans',
    // Emoji-Fallbacks üblicher Stacks
    'apple color emoji', 'segoe ui emoji', 'segoe ui symbol', 'noto color emoji',
  ].map((f) => f.toLowerCase()),
);

/** Entfernt CSS-Kommentare (damit auskommentierte Namen nicht zählen). @param {string} css @returns {string} */
function stripCssComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

/** @param {string} raw @returns {string} Font-Name ohne Quotes/Whitespace, lowercase. */
function normFontName(raw) {
  return raw.trim().replace(/^["']|["']$/g, '').trim().toLowerCase();
}

/**
 * Löst `var(--x, fallback, …)`-Wrapper auf, sodass nur die Fallback-Liste
 * übrig bleibt (Tailwind v4 emittiert font-family so). `var(--x)` ohne
 * Fallback verschwindet komplett; übrige `)` werden entfernt, damit kein
 * Token wie `monospace)` entsteht (False-Positive im hausamlago-E2E-Test).
 * @param {string} value
 * @returns {string}
 */
function expandVarFallbacks(value) {
  let v = value;
  for (let i = 0; i < 5; i++) {
    const next = v.replace(/var\(\s*--[a-zA-Z0-9_-]+\s*(?:,\s*)?/g, '');
    if (next === v) break;
    v = next;
  }
  return v.replace(/\)/g, ' ');
}

/**
 * Extrahiert alle Font-STACKS aus `font-family:`-Deklarationen und
 * `--font-*`-Custom-Properties (ohne @font-face-Blöcke selbst).
 * Jeder Stack ist die geordnete Namensliste einer Deklaration.
 * @param {string} css
 * @returns {string[][]}
 */
export function extractFontStacks(css) {
  const cleaned = stripCssComments(css)
    // @font-face-Blöcke ausblenden — deren font-family ist eine DEKLARATION.
    .replace(/@font-face\s*\{[^}]*\}/gi, '');
  /** @type {string[][]} */
  const stacks = [];
  // --font-weight-*/-size-* etc. sind Tailwind-v4-Property-Tokens (Wert z.B. `700`),
  // keine Familien-Stacks — ohne Ausschluss meldet der Dead-Font-Check '700' als Familie.
  const declRe =
    /(?:^|[;{\s])(?:font-family|--font-(?!(?:weight|size|style|stretch|variant|feature|variation|optical|kerning|smoothing|synthesis)\b)[a-z0-9-]+)\s*:\s*([^;}]+)/gi;
  let m;
  while ((m = declRe.exec(cleaned)) !== null) {
    const value = expandVarFallbacks(m[1]);
    const stack = [];
    for (const part of value.split(',')) {
      const name = normFontName(part);
      if (!name || name.includes('(')) continue;
      stack.push(name);
    }
    if (stack.length > 0) stacks.push(stack);
  }
  return stacks;
}

/**
 * Flache Menge aller referenzierten Familien (Kompat-Helfer über extractFontStacks).
 * @param {string} css
 * @returns {Set<string>}
 */
export function extractReferencedFontFamilies(css) {
  return new Set(extractFontStacks(css).flat());
}

/**
 * Extrahiert alle via `@font-face { font-family: … }` DEKLARIERTEN Familien.
 * @param {string} css
 * @returns {Set<string>}
 */
export function extractFontFaceFamilies(css) {
  const cleaned = stripCssComments(css);
  /** @type {Set<string>} */
  const families = new Set();
  const faceRe = /@font-face\s*\{([^}]*)\}/gi;
  let m;
  while ((m = faceRe.exec(cleaned)) !== null) {
    const fam = /font-family\s*:\s*([^;}]+)/i.exec(m[1]);
    if (fam) families.add(normFontName(fam[1]));
  }
  return families;
}

/**
 * Tote Font-Familien: ein Stack, dessen FÜHRENDER Name weder @font-face-
 * deklariert noch System-/generische Schrift ist → die Deklaration
 * suggeriert einen Custom-Font, liefert aber still den System-Fallback
 * (der steller-Bug). Spätere Stack-Namen ohne @font-face sind LEGITIME
 * lokale Fallbacks (blitzsicht-Muster: 'Inter Variable' deklariert,
 * dahinter 'Inter' für lokal installierte Fonts) und melden nicht.
 * Nimmt ALLE CSS-Texte einer Site zusammen (Inline-`<style>` + externe
 * .css), damit Deklaration und Referenz in unterschiedlichen Dateien
 * liegen dürfen. Wirft nie.
 * @param {string[]} cssTexts
 * @returns {PerfIssue[]}
 */
export function checkDeadFontFamilies(cssTexts) {
  /** @type {string[][]} */
  const stacks = [];
  /** @type {Set<string>} */
  const declared = new Set();
  for (const css of cssTexts) {
    if (typeof css !== 'string' || !css) continue;
    stacks.push(...extractFontStacks(css));
    for (const f of extractFontFaceFamilies(css)) declared.add(f);
  }
  /** @type {Set<string>} */
  const deadLeads = new Set();
  for (const stack of stacks) {
    const lead = stack[0];
    if (!lead || SYSTEM_FONT_ALLOWLIST.has(lead) || declared.has(lead)) continue;
    deadLeads.add(lead);
  }
  /** @type {PerfIssue[]} */
  const issues = [];
  for (const name of [...deadLeads].sort()) {
    issues.push({
      type: 'dead_font_family',
      details:
        `font-family-Stack führt mit '${name}', aber kein @font-face gefunden → stiller System-Fallback. ` +
        'Entweder Font self-hosten (@font-face + woff2) oder den toten Namen aus dem Stack entfernen.',
    });
  }
  return issues;
}

/**
 * Extrahiert die Inhalte aller Inline-`<style>`-Blöcke aus einem HTML-Dokument.
 * @param {string} html
 * @returns {string[]}
 */
export function extractInlineStyles(html) {
  /** @type {string[]} */
  const out = [];
  const styleRe = /<style\b[^>]*>([\s\S]*?)<\/style>/gi;
  let m;
  while ((m = styleRe.exec(html)) !== null) out.push(m[1]);
  return out;
}
