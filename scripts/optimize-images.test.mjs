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
import { shouldRewriteWebp, isDenied, formatMismatch } from './optimize-images.mjs';

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

// ── isDenied — Denylist für --dir=public (blitzsicht-ops#541-Nachlauf) ──────
test('Denylist: OG-Bilder werden NICHT optimiert', () => {
  assert.equal(isDenied('public/og/default.png'), true);
  assert.equal(isDenied('public/og/home.webp'), true);
});

test('Denylist: Icons + Favicons ausgenommen', () => {
  assert.equal(isDenied('public/icons/star.png'), true);
  assert.equal(isDenied('public/icon/star.png'), true); // icon ODER icons
  assert.equal(isDenied('public/favicon-192.png'), true);
  assert.equal(isDenied('public/images/favicon.png'), true); // favicon egal wo
});

test('Denylist: /email/ (animierte PNGs) ausgenommen', () => {
  assert.equal(isDenied('public/email/logo-light-animated.png'), true);
});

test('Denylist: /social/ (FB-Share-PNGs, spec-fixe Größe) ausgenommen — v0.81.0', () => {
  assert.equal(isDenied('public/social/titelbild.png'), true);
  assert.equal(isDenied('public/images/social/fb-card.png'), true);
  // Negativ-Guard: „social" als Teilstring im Dateinamen greift NICHT (nur Segment /social/).
  assert.equal(isDenied('public/images/social-media-tipps.webp'), false);
});

test('Denylist: echte Content-Bilder werden optimiert (Negativ-Test)', () => {
  assert.equal(isDenied('public/images/hero/bodenrichtwerte.webp'), false);
  assert.equal(isDenied('public/staedte/tegernheim.webp'), false); // die #541-Lücke
  assert.equal(isDenied('public/leistungen/gruenanlagenpflege.webp'), false);
});

test('Denylist: Windows-Backslash-Pfade normalisiert', () => {
  assert.equal(isDenied('public\\og\\default.png'), true);
  assert.equal(isDenied('public\\images\\hero.webp'), false);
});

// ── Maskierungs-Guard (blitzsicht-ops#651) ────────────────────────────────────
// Die Pipeline darf eine falsch benannte Datei nicht mehr still reparieren, sonst
// sieht der Asset-Format-Guard sie nie. Ohne den ersten Fall wäre jedes Grün leer.

test('ECHTER BUG-FALL stellers hero.webp: PNG-Inhalt unter .webp → Mismatch', () => {
  assert.deepEqual(formatMismatch('.webp', 'png'), { expected: 'webp', actual: 'png' });
});

test('gottls rics.png: sharp erkennt kein Bild → Mismatch sobald ein Format kommt', () => {
  assert.deepEqual(formatMismatch('.png', 'svg'), { expected: 'png', actual: 'svg' });
});

test('passende Datei ist KEIN Mismatch (Negativ-Test)', () => {
  assert.equal(formatMismatch('.webp', 'webp'), null);
  assert.equal(formatMismatch('.png', 'png'), null);
  assert.equal(formatMismatch('.JPG', 'jpeg'), null);
});

test('sharps jpg/jpeg-Schreibweisen gelten als dasselbe Format', () => {
  assert.equal(formatMismatch('.jpg', 'jpg'), null);
  assert.equal(formatMismatch('.jpeg', 'jpeg'), null);
});

test('.avif als heif gemeldet ist kein Befund (sharps Sammelbegriff)', () => {
  assert.equal(formatMismatch('.avif', 'heif'), null);
  assert.equal(formatMismatch('.avif', 'avif'), null);
});

test('ohne beurteilbare Endung oder Format wird nichts behauptet', () => {
  assert.equal(formatMismatch('.txt', 'png'), null);
  assert.equal(formatMismatch('.webp', undefined), null);
});
