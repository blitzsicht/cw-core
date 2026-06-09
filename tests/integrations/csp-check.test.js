// @ts-check
/**
 * Tests für csp-check — CSP-Drift-Guard (`node --test`, kein vitest nötig).
 *
 * Lauf: `node --test tests/integrations/csp-check.test.js`
 *
 * Deckt die echten, wiederholbaren Bugs aus dem DD-CSP-Mystery ab:
 *   1. Vollständige CSP (donau-profi live) → 0 Issues
 *   2. style-src ohne style-src-elem → missing_style_src_elem
 *   3. media-src fehlt (der DD-Fall) → missing_media_src
 *   4. plausible.io referenziert, fehlt in script-src-elem/connect-src
 *   5. Smart-Quote U+2019 statt ASCII ' → csp_non_ascii (der damals nie geprüfte Verdacht)
 *   6. Keine/leere CSP → 0 Issues (kein Crash)
 *   7. script-src-elem schmaler als script-src ('unsafe-inline' fehlt) → elem_narrower_than_base
 *   8. parseCsp-Korrektheit
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseCsp,
  checkCspCompleteness,
  extractCspValuesFromVercelJson,
} from '../../src/integrations/ai-discovery/csp-check.ts';

// Die echte, live-verifizierte donau-profi.de CSP (vollständig, byte-rein).
const GOOD_CSP =
  "default-src 'self'; script-src 'self' 'unsafe-inline' https://plausible.io; " +
  "style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self'; " +
  "connect-src 'self' https://plausible.io; frame-ancestors 'none'; " +
  "script-src-elem 'self' 'unsafe-inline' https://plausible.io; " +
  "style-src-elem 'self' 'unsafe-inline'; media-src 'self'";

const types = (issues) => issues.map((i) => i.type);

test('1. vollständige CSP → keine Issues', () => {
  const issues = checkCspCompleteness(GOOD_CSP);
  assert.deepEqual(issues, [], `unerwartete Issues: ${JSON.stringify(types(issues))}`);
});

test('2. style-src ohne style-src-elem → missing_style_src_elem', () => {
  const csp = "default-src 'self'; style-src 'self' 'unsafe-inline'; media-src 'self'";
  const issues = checkCspCompleteness(csp);
  assert.ok(types(issues).includes('missing_style_src_elem'));
});

test('3. media-src fehlt (DD-Fall) → missing_media_src', () => {
  const csp =
    "default-src 'self'; script-src 'self' https://plausible.io; " +
    "script-src-elem 'self' https://plausible.io; style-src 'self'; style-src-elem 'self'; " +
    "connect-src 'self' https://plausible.io";
  const issues = checkCspCompleteness(csp);
  assert.ok(types(issues).includes('missing_media_src'));
});

test('4. plausible.io referenziert, fehlt in script-src-elem + connect-src', () => {
  const csp =
    "default-src 'self'; script-src 'self' https://plausible.io; " +
    "script-src-elem 'self'; style-src 'self'; style-src-elem 'self'; " +
    "connect-src 'self'; media-src 'self'";
  const issues = checkCspCompleteness(csp);
  const t = types(issues);
  assert.ok(t.includes('plausible_missing_script_elem'), 'script-elem-Lücke nicht erkannt');
  assert.ok(t.includes('plausible_missing_connect'), 'connect-src-Lücke nicht erkannt');
});

test('5. Smart-Quote U+2019 statt ASCII → csp_non_ascii', () => {
  // ’ = ’ (right single quotation mark) — bricht Chrome's Parser still.
  const csp =
    "default-src ’self’; style-src 'self'; style-src-elem 'self'; media-src 'self'";
  const issues = checkCspCompleteness(csp);
  assert.ok(types(issues).includes('csp_non_ascii'));
  // Detail soll den konkreten Codepoint nennen.
  const detail = issues.find((i) => i.type === 'csp_non_ascii').details;
  assert.ok(detail.includes('U+2019'), `Codepoint nicht im Detail: ${detail}`);
});

test('6. leere / fehlende CSP → keine Issues, kein Crash', () => {
  assert.deepEqual(checkCspCompleteness(''), []);
  assert.deepEqual(checkCspCompleteness('   '), []);
  // @ts-expect-error – defensiver Aufruf
  assert.deepEqual(checkCspCompleteness(undefined ?? ''), []);
});

test('7. script-src-elem schmaler als script-src → elem_narrower_than_base', () => {
  // script-src hat 'unsafe-inline', script-src-elem nicht → inline-Scripts brechen.
  const csp =
    "default-src 'self'; script-src 'self' 'unsafe-inline'; script-src-elem 'self'; " +
    "style-src 'self'; style-src-elem 'self'; media-src 'self'";
  const issues = checkCspCompleteness(csp);
  assert.ok(types(issues).includes('elem_narrower_than_base'));
});

test('8. parseCsp parst Direktiven korrekt (lowercased, sources erhalten)', () => {
  const map = parseCsp("Default-Src 'self'; media-src 'self' data:");
  assert.deepEqual(map.get('default-src'), ["'self'"]);
  assert.deepEqual(map.get('media-src'), ["'self'", 'data:']);
  assert.equal(map.has('Default-Src'), false, 'Direktive sollte lowercased sein');
});

test('9. analyticsHost=null deaktiviert den Plausible-Check', () => {
  const csp =
    "default-src 'self'; script-src 'self' https://plausible.io; script-src-elem 'self'; " +
    "style-src 'self'; style-src-elem 'self'; connect-src 'self'; media-src 'self'";
  const issues = checkCspCompleteness(csp, { analyticsHost: null });
  const t = types(issues);
  assert.ok(!t.includes('plausible_missing_script_elem'));
  assert.ok(!t.includes('plausible_missing_connect'));
});

test('10. extractCspValuesFromVercelJson liest CSP-Header (mehrere Blöcke, key case-insensitiv)', () => {
  const vercelJson = JSON.stringify({
    headers: [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Content-Security-Policy', value: GOOD_CSP },
        ],
      },
      {
        source: '/masterplan',
        headers: [{ key: 'content-security-policy', value: "default-src 'self'" }],
      },
    ],
  });
  const values = extractCspValuesFromVercelJson(vercelJson);
  assert.equal(values.length, 2);
  assert.equal(values[0], GOOD_CSP);
  // Round-trip: extrahierte gute CSP hat keine Issues.
  assert.deepEqual(checkCspCompleteness(values[0]), []);
});

test('11. extractCspValuesFromVercelJson: unparsebar/keine Header → []', () => {
  assert.deepEqual(extractCspValuesFromVercelJson('{ not json'), []);
  assert.deepEqual(extractCspValuesFromVercelJson('{}'), []);
  assert.deepEqual(extractCspValuesFromVercelJson(JSON.stringify({ headers: [] })), []);
});
