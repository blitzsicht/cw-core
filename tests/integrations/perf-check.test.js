// @ts-check
/**
 * Tests für perf-check — Render-Blocking-CSS + tote Font-Familien (`node --test`).
 *
 * Lauf: `node --test tests/integrations/perf-check.test.js`
 *
 * Cases:
 *   1. Inline-CSS-only HTML → 0 render_blocking_css
 *   2. <link rel="stylesheet" href="/_astro/…"> → render_blocking_css
 *   3. Externes Nicht-Astro-Stylesheet (z. B. Drittanbieter) → KEIN Issue (nur /_astro/ zählt)
 *   4. Font referenziert + @font-face vorhanden → clean (auch dateiübergreifend)
 *   5. Font referenziert ohne @font-face → dead_font_family (der steller-Bug)
 *   6. Reiner System-Stack → clean
 *   7. Font-Name nur im CSS-Kommentar → clean (Negativ-Test)
 *   8. extractInlineStyles holt mehrere <style>-Blöcke
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  checkRenderBlockingCss,
  checkDeadFontFamilies,
  extractReferencedFontFamilies,
  extractFontFaceFamilies,
  extractInlineStyles,
} from '../../src/integrations/ai-discovery/perf-check.js';

const types = (issues) => issues.map((i) => i.type);

test('1. Inline-CSS-only HTML → kein render_blocking_css', () => {
  const html = '<html><head><style>body{color:red}</style></head><body></body></html>';
  assert.deepEqual(checkRenderBlockingCss(html, 'index.html'), []);
});

test('2. <link rel="stylesheet"> auf /_astro/ → render_blocking_css', () => {
  const html =
    '<html><head><link rel="stylesheet" href="/_astro/index.CS-LaVLG.css"></head><body></body></html>';
  const issues = checkRenderBlockingCss(html, 'index.html');
  assert.deepEqual(types(issues), ['render_blocking_css']);
});

test('3. externes Nicht-Astro-Stylesheet → KEIN Issue', () => {
  const html =
    '<html><head><link rel="stylesheet" href="https://example.com/widget.css"></head></html>';
  assert.deepEqual(checkRenderBlockingCss(html), []);
});

test('4. Font referenziert + @font-face (dateiübergreifend) → clean', () => {
  const tokens = ":root { --font-sans: 'Inter', system-ui, sans-serif; }";
  const faces =
    "@font-face { font-family: 'Inter'; src: url('/fonts/inter.woff2') format('woff2'); }";
  assert.deepEqual(checkDeadFontFamilies([tokens, faces]), []);
});

test('5. Font referenziert ohne @font-face → dead_font_family (steller-Bug)', () => {
  const css =
    ":root { --font-sans: 'Inter', system-ui, sans-serif; --font-heading: 'Work Sans', system-ui, sans-serif; }";
  const issues = checkDeadFontFamilies([css]);
  assert.deepEqual(types(issues), ['dead_font_family', 'dead_font_family']);
  assert.ok(issues.some((i) => i.details.includes("'inter'")));
  assert.ok(issues.some((i) => i.details.includes("'work sans'")));
});

test('6. reiner System-Stack → clean', () => {
  const css =
    ":root { --font-sans: system-ui, -apple-system, 'Helvetica Neue', Arial, sans-serif; } body { font-family: var(--font-sans); }";
  assert.deepEqual(checkDeadFontFamilies([css]), []);
});

test('7. Font-Name nur im Kommentar → clean (Negativ-Test)', () => {
  const css =
    "/* Work Sans (Headings) + Inter (Body) — self-hosted */ :root { --font-sans: system-ui, sans-serif; }";
  assert.deepEqual(checkDeadFontFamilies([css]), []);
});

test('8. extractInlineStyles holt mehrere <style>-Blöcke', () => {
  const html =
    '<style>a{color:blue}</style><div></div><style media="print">b{font-weight:bold}</style>';
  const styles = extractInlineStyles(html);
  assert.equal(styles.length, 2);
  assert.ok(styles[0].includes('color:blue'));
});

test('10. var()-Fallback-Listen (Tailwind v4) → keine False-Positives', () => {
  // Reproduziert den hausamlago-E2E-Befund: Tokens wie 'monospace)' /
  // 'noto color emoji")' durch var(--x, fallback, …)-Wrapper.
  const css =
    'body { font-family: var(--default-font-family, ui-sans-serif, system-ui, "Noto Color Emoji"); } ' +
    'code { font-family: var(--font-mono, ui-monospace, SFMono-Regular, monospace); }';
  assert.deepEqual(checkDeadFontFamilies([css]), []);
});

test('9. Extraktions-Helfer: Referenzen vs. @font-face-Deklarationen', () => {
  const css =
    "@font-face { font-family: 'Inter'; src: url(x.woff2); } h1 { font-family: 'Inter', serif; }";
  assert.deepEqual([...extractFontFaceFamilies(css)], ['inter']);
  const refs = extractReferencedFontFamilies(css);
  assert.ok(refs.has('inter'));
  assert.ok(refs.has('serif'));
});
