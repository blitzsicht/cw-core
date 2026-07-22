// @ts-check
/**
 * Tests für html-resources + csp-audit — die Output-Verifikation.
 *
 * Lauf: `node --test tests/integrations/csp-audit.test.js`
 *
 * Kernfrage dieser Ebene: „blockt die CSP etwas, das der Build tatsächlich
 * ausliefert?" — im Gegensatz zu csp-check, das nur den CSP-Text mit bekannten
 * Fehlermustern vergleicht.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { extractResources, extractCssUrls, parseAttrs } from '../../src/integrations/ai-discovery/html-resources.js';
import { auditHtml, formatFinding } from '../../src/integrations/ai-discovery/csp-audit.js';

const ORIGIN = 'https://gympanzen.com';
const sha256 = (c) => createHash('sha256').update(c, 'utf8').digest('base64');
const hashFn = (c, a) => createHash(a).update(c, 'utf8').digest('base64');

/** gympanzens echte CSP vom 22.07.2026 — Style-Direktiven ohne Inline-Erlauber. */
const BROKEN =
  "default-src 'self' https://gympanzen.com; object-src 'none'; base-uri 'self'; " +
  "img-src 'self' https://gympanzen.com data:; font-src 'self' https://gympanzen.com; " +
  "style-src 'self' https://gympanzen.com; style-src-elem 'self' https://gympanzen.com; " +
  "script-src 'self' https://gympanzen.com; script-src-elem 'self' https://gympanzen.com; " +
  "media-src 'self' https://gympanzen.com; manifest-src 'self' https://gympanzen.com";

const FIXED = BROKEN.replace(/style-src(-elem)? '/g, (m) => m).replace(
  "style-src 'self' https://gympanzen.com; style-src-elem 'self' https://gympanzen.com;",
  "style-src 'self' https://gympanzen.com 'unsafe-inline'; style-src-elem 'self' https://gympanzen.com 'unsafe-inline';",
);

/** Verkürzter, aber strukturgleicher Astro-Output mit inlineStylesheets:'always'. */
const ASTRO_INLINE_CSS = `<!DOCTYPE html><html lang="de"><head>
<meta charset="utf-8">
<link rel="icon" href="/favicon.svg">
<style>:root{--c:#1D1E3B}body{margin:0}</style>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization"}</script>
</head><body>
<img src="/assets/logo.png" alt="Logo">
<script src="/js/nav.js"></script>
</body></html>`;

// ------------------------------------------------------------- Gegenbeweis

test('GEGENBEWEIS gympanzen: kaputte CSP blockt den Inline-<style>', () => {
  const f = auditHtml(ASTRO_INLINE_CSS, BROKEN, { siteOrigin: ORIGIN, file: 'dist/index.html' });
  const blocked = f.filter((x) => !x.result.allowed);
  assert.equal(blocked.length, 1, 'genau der <style>-Block muss blockiert sein');
  assert.equal(blocked[0].resource.type, 'inline');
  assert.equal(blocked[0].resource.directive, 'style-src-elem');
  assert.match(formatFinding(blocked[0]), /Inline-<style>-Block/);
});

test('GEGENBEWEIS gympanzen: derselbe Output ist mit gefixter CSP sauber', () => {
  assert.deepEqual(auditHtml(ASTRO_INLINE_CSS, FIXED, { siteOrigin: ORIGIN }), []);
});

test('GEGENBEWEIS: leere CSP → keine Funde (kein Crash)', () => {
  assert.deepEqual(auditHtml(ASTRO_INLINE_CSS, '', { siteOrigin: ORIGIN }), []);
});

// ------------------------------------------------- False-Positive-Fallgruben

test('FALLGRUBE: application/ld+json ist kein ausführbares Script', () => {
  const html = `<script type="application/ld+json">{"a":1}</script>`;
  const res = extractResources(html);
  assert.equal(res.length, 0, 'JSON-LD darf nie als Script gewertet werden');
  // Und im Audit mit script-strikter CSP entsprechend kein Fund:
  assert.deepEqual(auditHtml(html, "script-src-elem 'self' https://a.de", { siteOrigin: 'https://a.de' }), []);
});

test('FALLGRUBE: externes Stylesheet (inlineStylesheets:\'never\') wird gegen den Host geprüft', () => {
  const html = `<link rel="stylesheet" href="/_astro/index.CmMy.css">`;
  const ok = auditHtml(html, "style-src-elem 'self' https://a.de", { siteOrigin: 'https://a.de' });
  assert.deepEqual(ok, []);
  const bad = auditHtml(html, "style-src-elem https://cdn.fremd.de", { siteOrigin: 'https://a.de' });
  assert.equal(bad.length, 1);
  assert.equal(bad[0].result.allowed, false);
});

test('FALLGRUBE: Hash-basierte CSP wird korrekt aufgelöst', () => {
  const css = ':root{--c:#000}';
  const html = `<style>${css}</style>`;
  const csp = `style-src-elem 'self' 'sha256-${sha256(css)}'`;
  assert.deepEqual(auditHtml(html, csp, { siteOrigin: 'https://a.de', hashFn }), [], 'gelisteter Hash muss greifen');
  const wrong = `style-src-elem 'self' 'sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='`;
  assert.equal(auditHtml(html, wrong, { siteOrigin: 'https://a.de', hashFn }).length, 1);
});

test('mehrfach identische Blockade wird zusammengefasst, nicht 50× gemeldet', () => {
  const html = Array.from({ length: 50 }, () => '<img src="https://fremd.de/a.png">').join('');
  const f = auditHtml(html, "img-src 'self' https://a.de", { siteOrigin: 'https://a.de' });
  assert.equal(f.length, 1);
  assert.equal(f[0].count, 50);
  assert.match(formatFinding(f[0]), /50×/);
});

// ------------------------------------------------------- Extraktor-Abdeckung

test('Extraktor: <link>-Varianten landen in der richtigen Direktive', () => {
  const html = `
    <link rel="stylesheet" href="/a.css">
    <link rel="modulepreload" href="/a.js">
    <link rel="manifest" href="/site.webmanifest">
    <link rel="preload" as="font" href="/f.woff2">
    <link rel="preload" as="image" href="/i.avif">
    <link rel="icon" href="/favicon.svg">
    <link rel="preconnect" href="https://fonts.example">`;
  const byUrl = Object.fromEntries(extractResources(html).map((r) => [r.url, r.directive]));
  assert.equal(byUrl['/a.css'], 'style-src-elem');
  assert.equal(byUrl['/a.js'], 'script-src-elem');
  assert.equal(byUrl['/site.webmanifest'], 'manifest-src');
  assert.equal(byUrl['/f.woff2'], 'font-src');
  assert.equal(byUrl['/i.avif'], 'img-src');
  assert.equal(byUrl['/favicon.svg'], 'img-src');
  assert.equal(byUrl['https://fonts.example'], undefined, 'preconnect ist CSP-irrelevant');
});

test('Extraktor: <a href> ist keine CSP-Ressource, <link href> schon', () => {
  const res = extractResources('<a href="https://fremd.de/seite">x</a><link rel="stylesheet" href="/a.css">');
  assert.equal(res.length, 1);
  assert.equal(res[0].url, '/a.css');
});

test('Extraktor: mailto/tel/#-Anker werden ignoriert', () => {
  assert.deepEqual(extractResources('<link rel="icon" href="#x"><img src="mailto:a@b.de">'), []);
});

test('Extraktor: <source> — srcset ist Bild, src in <video> ist Medium', () => {
  const html = `<picture><source srcset="/a.avif 1x, /b.avif 2x"><img src="/c.jpg"></picture>
                <video poster="/p.jpg"><source src="/v.mp4"></video>
                <picture><source src="/d.jpg"></picture>`;
  const res = extractResources(html);
  const d = (u) => res.find((r) => r.url === u)?.directive;
  assert.equal(d('/a.avif'), 'img-src');
  assert.equal(d('/b.avif'), 'img-src');
  assert.equal(d('/v.mp4'), 'media-src');
  assert.equal(d('/p.jpg'), 'img-src');
  assert.equal(d('/d.jpg'), 'img-src', 'nach </video> darf der Medien-Kontext nicht kleben');
});

test('Extraktor: style="…" und on*="…" werden als Attribut-Ressourcen erkannt', () => {
  const res = extractResources('<div style="color:red" onclick="go()">x</div>');
  assert.ok(res.some((r) => r.type === 'attr' && r.directive === 'style-src-attr'));
  assert.ok(res.some((r) => r.type === 'attr' && r.directive === 'script-src-attr'));
});

test('Extraktor: url() in Inline-CSS — @font-face ist Font, sonst Bild', () => {
  const css = '@font-face{font-family:X;src:url(/f.woff2)}body{background:url("/bg.jpg")}';
  const res = extractCssUrls(css, 'x');
  assert.equal(res.find((r) => r.url === '/f.woff2')?.directive, 'font-src');
  assert.equal(res.find((r) => r.url === '/bg.jpg')?.directive, 'img-src');
});

test('Extraktor: <iframe> → frame-src, <form action> → form-action', () => {
  const res = extractResources('<iframe src="https://challenges.cloudflare.com/x"></iframe><form action="/api/contact"></form>');
  assert.equal(res.find((r) => r.url?.includes('cloudflare'))?.directive, 'frame-src');
  assert.equal(res.find((r) => r.url === '/api/contact')?.directive, 'form-action');
});

test('Extraktor: Fundstelle trägt die Zeilennummer', () => {
  const html = 'a\nb\n<style>x{}</style>';
  assert.equal(extractResources(html, 'dist/i.html')[0].where, 'dist/i.html:3');
});

test('parseAttrs: Quotes, unquoted, leere Attribute', () => {
  const a = parseAttrs(`rel="stylesheet" as=font defer data-x='1'`);
  assert.equal(a.rel, 'stylesheet');
  assert.equal(a.as, 'font');
  assert.equal(a.defer, '');
  assert.equal(a['data-x'], '1');
});
