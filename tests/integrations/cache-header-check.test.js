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
  assert.equal(isAssetSource('/og/(.*)'), true);
  assert.equal(isAssetSource('/(favicon|logo)\\.(svg|png)'), true);
  assert.equal(isAssetSource('/(.*)\\.(jpg|png|webp)'), true);
  assert.equal(isAssetSource('/_astro/(.*)'), false);
  assert.equal(isAssetSource('/(.*)'), false);
  assert.equal(isAssetSource('/api/(.*)'), false);
});
