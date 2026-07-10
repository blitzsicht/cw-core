// @ts-check
/**
 * Tests für den Alt-Text-Guard (lintPageImgAlt) in ai-discovery.
 *
 * Lauf: `node --test tests/ai-discovery/alt-text-linter.test.js`
 *
 * Auslöser (Review 2026-07-10): der Hero-Fallback konnte still auf alt="" kippen
 * (`alt={imageAlt ?? siteName ?? ''}`) → das LCP-Bild ohne Alt = Ranking-/A11y-
 * Verlust. Der Guard scannt dist-HTML nach <img> ohne verwertbaren Alt.
 *
 * Abdeckung (Temp-Dir-Stil wie brand-name robots.txt-Tests):
 *   1. Alle <img> mit Alt → keine Issues
 *   2. <img> ohne alt-Attribut → alt_missing
 *   3. <img alt=""> ohne Deko-Marker (der Hero-Bug) → alt_empty
 *   4. Dekorativ (role="presentation" / aria-hidden) → NICHT geflaggt
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { lintPageImgAlt } from '../../src/integrations/ai-discovery/index.ts';

/** Schreibt eine index.html in ein temp-dist und gibt {dist, file} zurück. */
function makePage(html) {
  const dist = mkdtempSync(join(tmpdir(), 'alt-lint-'));
  const dir = join(dist, 'seite');
  mkdirSync(dir, { recursive: true });
  const file = join(dir, 'index.html');
  writeFileSync(file, html);
  return { dist, file };
}

test('1. Alle <img> mit Alt → keine Issues', () => {
  const { dist, file } = makePage('<img src="/a.webp" alt="Ein Team vor dem Haus">');
  try {
    assert.equal(lintPageImgAlt(file, dist).length, 0);
  } finally {
    rmSync(dist, { recursive: true, force: true });
  }
});

test('2. <img> ohne alt-Attribut → alt_missing', () => {
  const { dist, file } = makePage('<img src="/a.webp" width="100">');
  try {
    const issues = lintPageImgAlt(file, dist);
    assert.equal(issues.length, 1);
    assert.equal(issues[0].type, 'alt_missing');
    assert.equal(issues[0].page, '/seite/');
  } finally {
    rmSync(dist, { recursive: true, force: true });
  }
});

test('3. <img alt=""> ohne Deko-Marker → alt_empty (der Hero-Bug)', () => {
  const { dist, file } = makePage('<img src="/hero.webp" alt="" fetchpriority="high">');
  try {
    const issues = lintPageImgAlt(file, dist);
    assert.equal(issues.length, 1);
    assert.equal(issues[0].type, 'alt_empty');
  } finally {
    rmSync(dist, { recursive: true, force: true });
  }
});

test('4. Dekorativ (role/aria-hidden) → NICHT geflaggt', () => {
  const { dist, file } = makePage(
    '<img src="/deko.svg" alt="" role="presentation">' +
      '<img src="/deko2.svg" aria-hidden="true">' +
      '<img src="/content.webp" alt="Echtes Bild">',
  );
  try {
    assert.equal(lintPageImgAlt(file, dist).length, 0);
  } finally {
    rmSync(dist, { recursive: true, force: true });
  }
});
