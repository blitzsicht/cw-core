// @ts-check
// Tests für csp-build (SSOT-Generator + fixCsp-Transform). `node --test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCsp, fixCsp, normOrigin } from '../../src/integrations/ai-discovery/csp-build.ts';
import { checkCspCompleteness } from '../../src/integrations/ai-discovery/csp-check.ts';

const ORIGIN = 'https://donau-profi.de';
const clean = (csp) => checkCspCompleteness(csp, { siteOrigin: ORIGIN });

test('buildCsp() Output besteht checkCspCompleteness mit 0 Issues', () => {
  const csp = buildCsp(ORIGIN);
  assert.deepEqual(clean(csp), [], `Issues: ${JSON.stringify(clean(csp).map((i) => i.type))}`);
});

test('buildCsp() enthält Pragma-Origin, object-src, base-uri, plausible, turnstile', () => {
  const csp = buildCsp(ORIGIN);
  assert.ok(csp.includes("'self' https://donau-profi.de"));
  assert.ok(csp.includes("object-src 'none'"));
  assert.ok(csp.includes("base-uri 'self'"));
  assert.ok(csp.includes('https://plausible.io'));
  assert.ok(csp.includes('https://challenges.cloudflare.com'));
});

test('buildCsp({cal,tally}) ergänzt frame-src + Hosts', () => {
  const csp = buildCsp(ORIGIN, { cal: true, tally: true });
  assert.ok(csp.includes('https://app.cal.eu'));
  assert.ok(csp.includes('https://tally.so'));
  assert.ok(csp.includes('frame-src'));
  assert.deepEqual(clean(csp), []);
});

test('buildCsp(ohne schema) normalisiert Origin', () => {
  assert.equal(normOrigin('donau-profi.de'), 'https://donau-profi.de');
  assert.equal(normOrigin('https://donau-profi.de/'), 'https://donau-profi.de');
  assert.deepEqual(clean(buildCsp('donau-profi.de')), []);
});

// fixCsp: nimmt die alte kaputte donau-profi-CSP (nur 'self', kein object-src/base-uri)
const BROKEN = (
  "default-src 'self'; script-src 'self' 'unsafe-inline' https://plausible.io; " +
  "style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self'; " +
  "connect-src 'self' https://plausible.io; frame-ancestors 'none'; " +
  "script-src-elem 'self' 'unsafe-inline' https://plausible.io; " +
  "style-src-elem 'self' 'unsafe-inline'; media-src 'self'"
);

test('fixCsp() repariert kaputte CSP → 0 Issues', () => {
  const fixed = fixCsp(BROKEN, ORIGIN);
  assert.deepEqual(clean(fixed), [], `Rest-Issues: ${JSON.stringify(clean(fixed).map((i) => i.type))}`);
});

test('fixCsp() bewahrt Dienst-Hosts (plausible bleibt erhalten)', () => {
  const fixed = fixCsp(BROKEN, ORIGIN);
  assert.ok(fixed.includes('https://plausible.io'), 'plausible verloren');
  assert.ok(fixed.includes("'self' https://donau-profi.de"), 'Pragma fehlt');
  assert.ok(fixed.includes("object-src 'none'") && fixed.includes("base-uri 'self'"));
});

test('fixCsp() ist idempotent', () => {
  const once = fixCsp(BROKEN, ORIGIN);
  const twice = fixCsp(once, ORIGIN);
  assert.equal(once, twice, 'fixCsp nicht idempotent');
});

test('fixCsp() bewahrt customer-spezifische Extra-Hosts (cal, vercel.live)', () => {
  const withExtras = BROKEN.replace(
    "script-src-elem 'self' 'unsafe-inline' https://plausible.io",
    "script-src-elem 'self' 'unsafe-inline' https://plausible.io https://app.cal.eu https://vercel.live",
  );
  const fixed = fixCsp(withExtras, ORIGIN);
  assert.ok(fixed.includes('https://app.cal.eu'), 'cal verloren');
  assert.ok(fixed.includes('https://vercel.live'), 'vercel.live verloren');
  assert.deepEqual(clean(fixed), []);
});
