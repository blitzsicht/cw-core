#!/usr/bin/env node
/**
 * Tests für scripts/optimize-images.mjs — Idempotenz-Guard shouldRewriteWebp.
 *
 * Auslöser (Drift-Vorfall blitzsicht 2026-07-08): bereits optimierte WebPs
 * wurden bei JEDEM Build re-encodet, sobald 1 Byte gespart wurde —
 * generationsweiser Qualitätsverlust + dauernd dirty Working Tree.
 *
 * Ausführen:
 *   node scripts/optimize-images.test.mjs
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shouldRewriteWebp } from './optimize-images.mjs';

test('jpg/png wird immer konvertiert (auch wenn WebP größer würde)', () => {
  assert.equal(
    shouldRewriteWebp({ isWebP: false, needsResize: false, sizeBefore: 50_000, sizeAfter: 60_000 }),
    true,
  );
});

test('WebP mit anstehendem Resize wird geschrieben (auch bei Mini-Ersparnis)', () => {
  assert.equal(
    shouldRewriteWebp({ isWebP: true, needsResize: true, sizeBefore: 100_000, sizeAfter: 99_900 }),
    true,
  );
});

test('ECHTER BUG-FALL dachdecker.webp: -108 B (0,11 %) → SKIP', () => {
  // 2026-07-08: 95068 → 94960 bei jedem Build — durfte nie geschrieben werden.
  assert.equal(
    shouldRewriteWebp({ isWebP: true, needsResize: false, sizeBefore: 95_068, sizeAfter: 94_960 }),
    false,
  );
});

test('ECHTER BUG-FALL handwerker-sanitaer.webp: ±2 B Flip → SKIP', () => {
  assert.equal(
    shouldRewriteWebp({ isWebP: true, needsResize: false, sizeBefore: 45_572, sizeAfter: 45_570 }),
    false,
  );
});

test('WebP wird größer → SKIP', () => {
  assert.equal(
    shouldRewriteWebp({ isWebP: true, needsResize: false, sizeBefore: 45_572, sizeAfter: 45_574 }),
    false,
  );
});

test('substanzielle Ersparnis (>2 % UND >2 KB) → schreiben', () => {
  // 100 KB → 90 KB: 10 % / 10 KB — klar über beiden Schwellen.
  assert.equal(
    shouldRewriteWebp({ isWebP: true, needsResize: false, sizeBefore: 100_000, sizeAfter: 90_000 }),
    true,
  );
});

test('Grenzfall: >2 % aber <2 KB gespart → SKIP (kleine Datei)', () => {
  // 50 KB → 49 KB: 2,4 % aber nur 1,2 KB — beide Schwellen müssen reißen.
  assert.equal(
    shouldRewriteWebp({ isWebP: true, needsResize: false, sizeBefore: 50_000, sizeAfter: 48_800 }),
    false,
  );
});

test('Grenzfall: >2 KB aber <2 % gespart → SKIP (große Datei)', () => {
  // 500 KB → 497 KB: 3 KB aber nur 0,6 %.
  assert.equal(
    shouldRewriteWebp({ isWebP: true, needsResize: false, sizeBefore: 500_000, sizeAfter: 497_000 }),
    false,
  );
});
