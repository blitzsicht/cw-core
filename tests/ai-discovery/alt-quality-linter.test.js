// @ts-check
/**
 * Tests für den Alt-QUALITÄT-Guard (lintPageImgAltQuality + aggregateCrossPageDupAlts).
 *
 * Lauf: `node --test tests/ai-discovery/alt-quality-linter.test.js`
 *
 * Auslöser (Audit 2026-07-10): die 3 Strict-Guards sichern nur die EXISTENZ von Alt-
 * Text, nicht die Güte. Dieser Guard flaggt nicht-leere, aber generische/schwache Alts
 * (Firmenname/Leistungstitel-Fallbacks, „Bild:"-Platzhalter, Dateiname-als-Alt) als
 * SOFT-WARN (nie Build-Fail per Default — Qualität ist fuzzy). Nur objektive Smells,
 * exact-match, low false-positive. Brand-Marks/Chrome (logo/favicon/signet/badge) sind
 * ausgenommen — deren Alt (Markenname/festes Label) ist bewusst überall gleich.
 *
 * Abdeckung (Temp-Dir-Stil wie alt-text-linter):
 *   1. alt === Firmenname (genericTerm)          → alt_generic_term
 *   2. alt === Leistungstitel (genericTerm)       → alt_generic_term
 *   3. „Bild: X" Platzhalter                       → alt_placeholder
 *   4. Dateiname-/Slug-als-Alt                     → alt_filename
 *   5. alt < 5 Zeichen                             → alt_too_short
 *   6. NEG Brand-Mark/Chrome via src (signet/badge) → Ausnahme
 *   7. NEG Deko (aria-hidden/role) übersprungen    → keine Issues
 *   8. NEG beschreibender Orts-Alt (soleno)        → keine Issues (kein FP)
 *   9. NEG Logo-Alt (=== Firmenname, class=logo)   → keine Issues (Ausnahme)
 *  9b. NEG Logo via src (Klasse am Eltern-<a>)     → keine Issues (Ausnahme)
 *  10. NEG genericTerms undefined                  → kein Crash, keine Issues
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { lintPageImgAltQuality } from '../../src/integrations/ai-discovery/index.ts';

/** Schreibt eine index.html in ein temp-dist und gibt {dist, file} zurück. */
function makePage(html) {
  const dist = mkdtempSync(join(tmpdir(), 'alt-qual-'));
  const dir = join(dist, 'seite');
  mkdirSync(dir, { recursive: true });
  const file = join(dir, 'index.html');
  writeFileSync(file, html);
  return { dist, file };
}

test('1. alt === Firmenname → alt_generic_term', () => {
  const { dist, file } = makePage('<img src="/hero.webp" alt="Soleno GmbH">');
  try {
    const issues = lintPageImgAltQuality(file, dist, ['Soleno GmbH', 'Photovoltaik']);
    assert.equal(issues.length, 1);
    assert.equal(issues[0].type, 'alt_generic_term');
  } finally {
    rmSync(dist, { recursive: true, force: true });
  }
});

test('2. alt === Leistungstitel → alt_generic_term (case-insensitive)', () => {
  const { dist, file } = makePage('<img src="/l.webp" alt="photovoltaik">');
  try {
    const issues = lintPageImgAltQuality(file, dist, ['Soleno GmbH', 'Photovoltaik']);
    assert.equal(issues.length, 1);
    assert.equal(issues[0].type, 'alt_generic_term');
  } finally {
    rmSync(dist, { recursive: true, force: true });
  }
});

test('3. „Bild: X" → alt_placeholder', () => {
  const { dist, file } = makePage('<img src="/g.webp" alt="Bild: Familie Huber">');
  try {
    const issues = lintPageImgAltQuality(file, dist, []);
    assert.equal(issues.length, 1);
    assert.equal(issues[0].type, 'alt_placeholder');
  } finally {
    rmSync(dist, { recursive: true, force: true });
  }
});

test('4. Dateiname-/Slug-als-Alt → alt_filename', () => {
  const { dist, file } = makePage(
    '<img src="/a.webp" alt="hero-image-2.webp">' + '<img src="/b.webp" alt="hero_bg_desktop">',
  );
  try {
    const issues = lintPageImgAltQuality(file, dist, []);
    assert.equal(issues.length, 2);
    assert.ok(issues.every((i) => i.type === 'alt_filename'));
  } finally {
    rmSync(dist, { recursive: true, force: true });
  }
});

test('5. alt < 5 Zeichen → alt_too_short', () => {
  const { dist, file } = makePage('<img src="/a.webp" alt="PV">');
  try {
    const issues = lintPageImgAltQuality(file, dist, []);
    assert.equal(issues.length, 1);
    assert.equal(issues[0].type, 'alt_too_short');
  } finally {
    rmSync(dist, { recursive: true, force: true });
  }
});

test('6. NEG Brand-Mark/Chrome via src (signet, badge) → Ausnahme', () => {
  // Echte Funde: mika-„signet" (alt===Firmenname) + Status-/PageSpeed-Badge
  // (status.…/badge/…svg, festes Label auf jeder Seite) → dürfen nicht flaggen.
  const { dist, file } = makePage(
    '<img src="/signet.svg" alt="Elektrotechnik Mika">' +
      '<img src="https://status.blitzsicht.com/badge/psi.svg" alt="Google PageSpeed Score — täglich gemessen">',
  );
  try {
    const issues = lintPageImgAltQuality(file, dist, ['Elektrotechnik Mika']);
    assert.equal(issues.length, 0);
  } finally {
    rmSync(dist, { recursive: true, force: true });
  }
});

test('7. NEG Deko (aria-hidden/role) → keine Issues', () => {
  const { dist, file } = makePage(
    '<img src="/d.svg" alt="Soleno GmbH" aria-hidden="true">' +
      '<img src="/d2.svg" alt="Soleno GmbH" role="presentation">',
  );
  try {
    const issues = lintPageImgAltQuality(file, dist, ['Soleno GmbH']);
    assert.equal(issues.length, 0);
  } finally {
    rmSync(dist, { recursive: true, force: true });
  }
});

test('8. NEG beschreibender Orts-Alt → keine Issues (kein False-Positive)', () => {
  const { dist, file } = makePage(
    '<img src="/h.webp" alt="Photovoltaik-Anlage auf Hausdach bei Sonnenschein im Raum Regensburg">',
  );
  try {
    const issues = lintPageImgAltQuality(file, dist, ['Soleno GmbH', 'Photovoltaik', 'Regensburg']);
    assert.equal(issues.length, 0);
  } finally {
    rmSync(dist, { recursive: true, force: true });
  }
});

test('9. NEG Logo-Alt (=== Firmenname, class=logo) → Ausnahme, keine Issue', () => {
  const { dist, file } = makePage('<img src="/logo.svg" alt="Soleno GmbH" class="site-logo">');
  try {
    const issues = lintPageImgAltQuality(file, dist, ['Soleno GmbH']);
    assert.equal(issues.length, 0);
  } finally {
    rmSync(dist, { recursive: true, force: true });
  }
});

test('9b. NEG Logo-Alt via src (Klasse am Eltern-<a>, NICHT am img) → Ausnahme', () => {
  // Echter Fund (soleno v0.77.0): <a class="logo-img"><img src="/logo-soleno.svg"
  // alt="Soleno GmbH"> — img hat KEINE logo-Klasse, nur src verrät das Logo.
  const { dist, file } = makePage('<img src="/logo-soleno.svg" alt="Soleno GmbH" width="50">');
  try {
    const issues = lintPageImgAltQuality(file, dist, ['Soleno GmbH']);
    assert.equal(issues.length, 0);
  } finally {
    rmSync(dist, { recursive: true, force: true });
  }
});

test('10. NEG genericTerms undefined → kein Crash, keine generic_term-Issue', () => {
  const { dist, file } = makePage('<img src="/a.webp" alt="Ein Team vor dem Haus in Regensburg">');
  try {
    // Default-Parameter (kein 3. Argument) darf nicht crashen.
    const issues = lintPageImgAltQuality(file, dist);
    assert.equal(issues.length, 0);
  } finally {
    rmSync(dist, { recursive: true, force: true });
  }
});
