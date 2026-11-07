// @ts-check
/**
 * Tests für cache-header-check — Cache-Control-Guard (`node --test`).
 *
 * Lauf: `node --test tests/integrations/cache-header-check.test.js`
 *
 * Deckt den echten Cluster-Zustand vom Speed-Rollout 2026-07-09 ab:
 *   1. Template mit Cache-Regeln → 0 Issues
 *   2. Security-only vercel.json (der reale Cluster-Zustand) → missing_asset_cache_control
 *   3. immutable auf /images/ → immutable_on_mutable_path (Anti-Pattern)
 *   4. hasFontsDir=true ohne /fonts/-Regel → missing_font_cache_control
 *   5. Negativ: hasFontsDir=false → KEIN Font-Issue
 *   6. no-store auf Asset-Pfad → no_store_on_assets
 *   7. Kaputtes JSON → vercel_json_unparseable (kein Throw)
 *   8. immutable auf /_astro/ ist OK (kein False-Positive)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  extractHeaderRulesFromVercelJson,
  checkCacheHeaders,
  isAssetSource,
} from '../../src/integrations/ai-discovery/cache-header-check.js';

const types = (issues) => issues.map((i) => i.type);

/** vercel.json im Stil des aktualisierten Templates (Security + Cache). */
const GOOD_VERCEL_JSON = JSON.stringify({
  headers: [
    {
      source: '/(.*)',
      headers: [{ key: 'Strict-Transport-Security', value: 'max-age=63072000' }],
    },
    { source: '/images/(.*)', headers: [{ key: 'Cache-Control', value: 'public, max-age=86400' }] },
    { source: '/og/(.*)', headers: [{ key: 'Cache-Control', value: 'public, max-age=86400' }] },
    {
      source: '/(favicon|favicon-192|logo|logo-dark)\\.(svg|png|ico)',
      headers: [{ key: 'Cache-Control', value: 'public, max-age=86400' }],
    },
    { source: '/fonts/(.*)', headers: [{ key: 'Cache-Control', value: 'public, max-age=2592000' }] },
  ],
});

/** Der reale Cluster-Zustand vor dem Rollout: nur Security-Header. */
const SECURITY_ONLY_VERCEL_JSON = JSON.stringify({
  headers: [
    {
      source: '/(.*)',
      headers: [
        { key: 'Strict-Transport-Security', value: 'max-age=63072000' },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
      ],
    },
  ],
});

test('1. Template mit Cache-Regeln → 0 Issues (auch mit fonts-dir)', () => {
  const rules = extractHeaderRulesFromVercelJson(GOOD_VERCEL_JSON);
  const issues = checkCacheHeaders(rules, { hasFontsDir: true });
  assert.deepEqual(issues, [], `unerwartete Issues: ${JSON.stringify(types(issues))}`);
});

test('2. Security-only vercel.json (realer Cluster-Zustand) → missing_asset_cache_control', () => {
  const rules = extractHeaderRulesFromVercelJson(SECURITY_ONLY_VERCEL_JSON);
  const issues = checkCacheHeaders(rules);
  assert.ok(types(issues).includes('missing_asset_cache_control'));
});

test('3. immutable auf /images/ → immutable_on_mutable_path', () => {
  const raw = JSON.stringify({
    headers: [
      {
        source: '/images/(.*)',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
    ],
  });
  const issues = checkCacheHeaders(extractHeaderRulesFromVercelJson(raw));
  assert.ok(types(issues).includes('immutable_on_mutable_path'));
});

test('4. fonts-dir vorhanden, keine /fonts/-Regel → missing_font_cache_control', () => {
  const raw = JSON.stringify({
    headers: [
      { source: '/images/(.*)', headers: [{ key: 'Cache-Control', value: 'public, max-age=86400' }] },
    ],
  });
  const issues = checkCacheHeaders(extractHeaderRulesFromVercelJson(raw), { hasFontsDir: true });
  assert.ok(types(issues).includes('missing_font_cache_control'));
});

test('5. Negativ: kein fonts-dir → KEIN Font-Issue', () => {
  const raw = JSON.stringify({
    headers: [
      { source: '/images/(.*)', headers: [{ key: 'Cache-Control', value: 'public, max-age=86400' }] },
    ],
  });
  const issues = checkCacheHeaders(extractHeaderRulesFromVercelJson(raw), { hasFontsDir: false });
  assert.ok(!types(issues).includes('missing_font_cache_control'));
  assert.deepEqual(issues, []);
});

test('6. no-store auf Asset-Pfad → no_store_on_assets', () => {
  const raw = JSON.stringify({
    headers: [
      { source: '/og/(.*)', headers: [{ key: 'Cache-Control', value: 'no-store' }] },
    ],
  });
  const issues = checkCacheHeaders(extractHeaderRulesFromVercelJson(raw));
  assert.ok(types(issues).includes('no_store_on_assets'));
});

test('7. Kaputtes JSON → vercel_json_unparseable, kein Throw', () => {
  const rules = extractHeaderRulesFromVercelJson('{ "headers": [ kaputt');
  assert.equal(rules, null);
  const issues = checkCacheHeaders(rules);
  assert.deepEqual(types(issues), ['vercel_json_unparseable']);
});

test('8. immutable auf /_astro/ ist OK (kein False-Positive)', () => {
  const raw = JSON.stringify({
    headers: [
      { source: '/images/(.*)', headers: [{ key: 'Cache-Control', value: 'public, max-age=86400' }] },
      {
        source: '/_astro/(.*)',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
    ],
  });
  const issues = checkCacheHeaders(extractHeaderRulesFromVercelJson(raw));
  assert.ok(!types(issues).includes('immutable_on_mutable_path'));
});

test('9. isAssetSource-Heuristik', () => {
  assert.equal(isAssetSource('/images/(.*)'), true);
  assert.equal(isAssetSource('/videos/(.*)'), true); // soleno-Befund 2026-07-10
  assert.equal(isAssetSource('/og/(.*)'), true);
  assert.equal(isAssetSource('/(favicon|logo)\\.(svg|png)'), true);
  assert.equal(isAssetSource('/(.*)\\.(jpg|png|webp)'), true);
  assert.equal(isAssetSource('/_astro/(.*)'), false);
  assert.equal(isAssetSource('/(.*)'), false);
  assert.equal(isAssetSource('/api/(.*)'), false);
});

// ── Images-Verzeichnis (Anlass customer-zink-baeckerei, 27.09.2026) ─────────────────

/** Realer Zink-Stand: Security-Header + nur /og/ und Logo gecacht. */
const NUR_OG_VERCEL_JSON = JSON.stringify({
  headers: [
    { source: '/(.*)', headers: [{ key: 'X-Content-Type-Options', value: 'nosniff' }] },
    { source: '/og/(.*)', headers: [{ key: 'Cache-Control', value: 'public, max-age=86400' }] },
    { source: '/(favicon|logo)\\.(svg|png|ico|webp)', headers: [{ key: 'Cache-Control', value: 'public, max-age=86400' }] },
  ],
});

test('10. NEGATIV (Zink 27.09.): images-dir, aber nur /og/-Regel → missing_images_cache_control', () => {
  const issues = checkCacheHeaders(extractHeaderRulesFromVercelJson(NUR_OG_VERCEL_JSON), { hasImagesDir: true });
  assert.ok(types(issues).includes('missing_images_cache_control'));
  // Prüfung 1 allein war erfüllt — genau deshalb blieb es unbemerkt.
  assert.ok(!types(issues).includes('missing_asset_cache_control'));
});

test('11. Gegenprobe: ohne images-dir meldet dieselbe vercel.json nichts zu images', () => {
  const issues = checkCacheHeaders(extractHeaderRulesFromVercelJson(NUR_OG_VERCEL_JSON), { hasImagesDir: false });
  assert.ok(!types(issues).includes('missing_images_cache_control'));
});

test('12. /images/(.*)-Regel (Template) deckt images-dir ab', () => {
  const issues = checkCacheHeaders(extractHeaderRulesFromVercelJson(GOOD_VERCEL_JSON), { hasImagesDir: true, hasFontsDir: true });
  assert.deepEqual(types(issues), []);
});

test('13. Endungs-Regel (.*)\\.(webp|png) deckt images-dir ebenfalls ab', () => {
  const raw = JSON.stringify({
    headers: [{ source: '/(.*)\\.(webp|png|jpg)', headers: [{ key: 'Cache-Control', value: 'public, max-age=86400' }] }],
  });
  const issues = checkCacheHeaders(extractHeaderRulesFromVercelJson(raw), { hasImagesDir: true });
  assert.ok(!types(issues).includes('missing_images_cache_control'));
});

// ── missing_videos_cache_control (07.11.2026) ────────────────────────────────
// Header-Regeln von blitzsicht.com am ausgelieferten Stand vom 07.11.2026 (origin/main,
// nur die Cache-Werte): Prüfung 1 ist erfüllt, /videos/ deckt keine Regel ab.
const cc = (/** @type {string} */ v) => [{ key: 'Cache-Control', value: v }];
const BLITZSICHT_0711 = {
  headers: [
    { source: '/(.*)', headers: [{ key: 'X-Content-Type-Options', value: 'nosniff' }] },
    { source: '/images/(.*)', headers: cc('public, max-age=86400') },
    { source: '/og/(.*)', headers: cc('public, max-age=86400') },
    { source: '/(favicon|favicon-192|favicon-512|logo|logo-dark)\\.(svg|png|ico|webp)', headers: cc('public, max-age=86400') },
  ],
};
const mitRegel = (/** @type {any} */ basis, /** @type {any} */ regel) =>
  JSON.stringify({ headers: [...basis.headers, regel] });

test('14. NEGATIV (blitzsicht 07.11.): videos-dir, Regeln ohne /videos/ → missing_videos_cache_control', () => {
  const issues = checkCacheHeaders(extractHeaderRulesFromVercelJson(JSON.stringify(BLITZSICHT_0711)), {
    hasImagesDir: true,
    hasVideosDir: true,
  });
  assert.deepEqual(types(issues), ['missing_videos_cache_control']);
});

test('15. Gegenprobe: dieselbe vercel.json ohne videos-dir → sauber', () => {
  const issues = checkCacheHeaders(extractHeaderRulesFromVercelJson(JSON.stringify(BLITZSICHT_0711)), {
    hasImagesDir: true,
    hasVideosDir: false,
  });
  assert.deepEqual(types(issues), []);
});

test('16. blitzsicht mit /videos/(.*)-Regel → sauber', () => {
  const raw = mitRegel(BLITZSICHT_0711, { source: '/videos/(.*)', headers: cc('public, max-age=86400') });
  const issues = checkCacheHeaders(extractHeaderRulesFromVercelJson(raw), { hasImagesDir: true, hasVideosDir: true });
  assert.deepEqual(types(issues), []);
});

test('17. /videos/-Regel OHNE Cache-Control zählt nicht', () => {
  const raw = mitRegel(BLITZSICHT_0711, { source: '/videos/(.*)', headers: [{ key: 'X-Robots-Tag', value: 'noindex' }] });
  const issues = checkCacheHeaders(extractHeaderRulesFromVercelJson(raw), { hasVideosDir: true });
  assert.ok(types(issues).includes('missing_videos_cache_control'));
});

test('18. Endungsregel /(.*)\\.(mp4|webm) deckt videos-dir; Bild-Endungsregel nicht', () => {
  const mp4 = mitRegel(BLITZSICHT_0711, { source: '/(.*)\\.(mp4|webm)', headers: cc('public, max-age=86400') });
  assert.ok(!types(checkCacheHeaders(extractHeaderRulesFromVercelJson(mp4), { hasVideosDir: true })).includes('missing_videos_cache_control'));
  const bild = mitRegel(BLITZSICHT_0711, { source: '/(.*)\\.(webp|png)', headers: cc('public, max-age=86400') });
  assert.ok(types(checkCacheHeaders(extractHeaderRulesFromVercelJson(bild), { hasVideosDir: true })).includes('missing_videos_cache_control'));
});

test('19. immutable auf /videos/ bleibt immutable_on_mutable_path, auch mit videos-dir', () => {
  const raw = mitRegel(BLITZSICHT_0711, { source: '/videos/(.*)', headers: cc('public, max-age=31536000, immutable') });
  const issues = checkCacheHeaders(extractHeaderRulesFromVercelJson(raw), { hasVideosDir: true });
  assert.deepEqual(types(issues), ['immutable_on_mutable_path']);
});

test('20. Template deckt videos-dir ab (der nächste Kunde vergisst die Regel nicht)', () => {
  const raw = readFileSync(new URL('../../src/templates/vercel.template.json', import.meta.url), 'utf-8');
  const issues = checkCacheHeaders(extractHeaderRulesFromVercelJson(raw), { hasImagesDir: true, hasFontsDir: true, hasVideosDir: true });
  assert.deepEqual(types(issues), []);
});
