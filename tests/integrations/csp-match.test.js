// @ts-check
/**
 * Tests für csp-match — der Matcher, der fragt „würde diese CSP das blocken?".
 *
 * Lauf: `node --test tests/integrations/csp-match.test.js`
 *
 * Enthält bewusst die drei realen Vorfälle als Gegenbeweis (ein Check, der nie
 * rot werden kann, ist kein Nachweis):
 *   - gympanzen 22.07.2026 — Inline-CSS ohne 'unsafe-inline'
 *   - donau-profi 09.06.2026 — nacktes 'self'
 *   - soleno/DD 05/2026 — fehlende -elem/media-src
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCsp } from '../../src/integrations/ai-discovery/csp-check.js';
import { checkResource, findViolations } from '../../src/integrations/ai-discovery/csp-match.js';

const ORIGIN = 'https://gympanzen.com';

/** Die echte, kaputte gympanzen-CSP vom 22.07.2026 (gekürzt auf das Relevante). */
const GYMPANZEN_BROKEN =
  "default-src 'self' https://gympanzen.com; base-uri 'self'; form-action 'self'; " +
  "frame-ancestors 'none'; object-src 'none'; img-src 'self' https://gympanzen.com data:; " +
  "font-src 'self' https://gympanzen.com; style-src 'self' https://gympanzen.com; " +
  "script-src 'self' https://gympanzen.com https://challenges.cloudflare.com; " +
  'frame-src https://challenges.cloudflare.com; ' +
  "connect-src 'self' https://gympanzen.com https://challenges.cloudflare.com; " +
  "manifest-src 'self'; upgrade-insecure-requests; " +
  "script-src-elem 'self' https://gympanzen.com https://challenges.cloudflare.com; " +
  "style-src-elem 'self' https://gympanzen.com; media-src 'self' https://gympanzen.com";

/** Dieselbe CSP nach dem Hotfix. */
const GYMPANZEN_FIXED = GYMPANZEN_BROKEN.replace(
  "style-src 'self' https://gympanzen.com;",
  "style-src 'self' https://gympanzen.com 'unsafe-inline';",
).replace(
  "style-src-elem 'self' https://gympanzen.com;",
  "style-src-elem 'self' https://gympanzen.com 'unsafe-inline';",
);

// ---------------------------------------------------------------- Gegenbeweise

test('GEGENBEWEIS gympanzen: Inline-<style> wird von der echten CSP geblockt', () => {
  const v = findViolations(
    GYMPANZEN_BROKEN,
    [{ type: 'inline', directive: 'style-src-elem', where: 'dist/index.html' }],
    { siteOrigin: ORIGIN },
  );
  assert.equal(v.length, 1);
  assert.equal(v[0].result.allowed, false);
  assert.equal(v[0].result.directive, 'style-src-elem');
  assert.match(v[0].result.reason, /kein Inline/);
});

test('GEGENBEWEIS gympanzen: nach dem Hotfix ist derselbe Block erlaubt', () => {
  const v = findViolations(
    GYMPANZEN_FIXED,
    [{ type: 'inline', directive: 'style-src-elem', where: 'dist/index.html' }],
    { siteOrigin: ORIGIN },
  );
  assert.deepEqual(v, []);
});

test('GEGENBEWEIS donau-profi: nacktes \'self\' ist spec-erlaubt, aber risky', () => {
  const csp = "default-src 'self'; style-src-elem 'self'; script-src-elem 'self'";
  const v = findViolations(
    csp,
    [{ type: 'url', directive: 'style-src-elem', url: '/_astro/index.abc.css' }],
    { siteOrigin: 'https://donau-profi.de' },
  );
  assert.equal(v.length, 1, 'nacktes self muss beanstandet werden');
  assert.equal(v[0].result.allowed, true);
  assert.equal(v[0].result.risky, true);
  assert.match(v[0].result.reason, /Chrome\/Edge\/Safari/);
});

test('GEGENBEWEIS donau-profi: mit explizitem Origin daneben ist es sauber', () => {
  const csp = "default-src 'self' https://donau-profi.de; style-src-elem 'self' https://donau-profi.de";
  const v = findViolations(
    csp,
    [{ type: 'url', directive: 'style-src-elem', url: '/_astro/index.abc.css' }],
    { siteOrigin: 'https://donau-profi.de' },
  );
  assert.deepEqual(v, []);
});

test('GEGENBEWEIS soleno/DD: fehlendes media-src fällt auf default-src zurück und blockt', () => {
  const csp = "default-src 'self' https://soleno.de; style-src 'self' https://soleno.de 'unsafe-inline'";
  const v = findViolations(
    csp,
    [{ type: 'url', directive: 'media-src', url: 'https://cdn.example.com/clip.mp4' }],
    { siteOrigin: 'https://soleno.de' },
  );
  assert.equal(v.length, 1);
  assert.equal(v[0].result.allowed, false);
  assert.equal(v[0].result.directive, 'default-src', 'Fallback muss greifen');
});

// ------------------------------------------------------- False-Positive-Schutz

test('sauberer Kunden-Build erzeugt keine Funde', () => {
  const csp =
    "default-src 'self' https://blitzsicht.com; " +
    "style-src 'self' https://blitzsicht.com 'unsafe-inline'; " +
    "style-src-elem 'self' https://blitzsicht.com 'unsafe-inline'; " +
    "script-src-elem 'self' https://blitzsicht.com https://plausible.io; " +
    "img-src 'self' https://blitzsicht.com data:; font-src 'self' https://blitzsicht.com; " +
    "media-src 'self' https://blitzsicht.com; frame-src https://challenges.cloudflare.com";
  const resources = [
    { type: /** @type {const} */ ('inline'), directive: 'style-src-elem' },
    { type: /** @type {const} */ ('url'), directive: 'script-src-elem', url: '/js/nav.js' },
    { type: /** @type {const} */ ('url'), directive: 'script-src-elem', url: 'https://plausible.io/js/script.js' },
    { type: /** @type {const} */ ('url'), directive: 'img-src', url: 'data:image/svg+xml;base64,AAA' },
    { type: /** @type {const} */ ('url'), directive: 'font-src', url: '/fonts/inter.woff2' },
    { type: /** @type {const} */ ('url'), directive: 'frame-src', url: 'https://challenges.cloudflare.com/x' },
  ];
  assert.deepEqual(findViolations(csp, resources, { siteOrigin: 'https://blitzsicht.com' }), []);
});

test('leere CSP → keine Funde (kein Crash)', () => {
  assert.deepEqual(findViolations('', [{ type: 'inline', directive: 'style-src-elem' }]), []);
  assert.deepEqual(findViolations('   ', [{ type: 'inline', directive: 'style-src-elem' }]), []);
});

test('fehlende Direktive ohne default-src → erlaubt', () => {
  const map = parseCsp("script-src 'self'");
  const r = checkResource(map, { type: 'url', directive: 'img-src', url: 'https://x.de/a.png' });
  assert.equal(r.allowed, true);
  assert.equal(r.directive, null);
});

// ------------------------------------------------------------ Matcher-Details

test('Fallback-Kette: style-src-elem → style-src → default-src', () => {
  const only = parseCsp("default-src 'none'; style-src 'self' https://a.de 'unsafe-inline'");
  const r = checkResource(only, { type: 'inline', directive: 'style-src-elem' }, { siteOrigin: 'https://a.de' });
  assert.equal(r.allowed, true);
  assert.equal(r.directive, 'style-src', 'style-src muss vor default-src greifen');
});

test("'none' blockt alles", () => {
  const map = parseCsp("style-src-elem 'none'");
  assert.equal(checkResource(map, { type: 'inline', directive: 'style-src-elem' }).allowed, false);
});

test("Nonce/Hash neben 'unsafe-inline' → Browser ignoriert 'unsafe-inline'", () => {
  const csp = "style-src-elem 'self' 'unsafe-inline' 'nonce-abc123'";
  const map = parseCsp(csp);
  const ohne = checkResource(map, { type: 'inline', directive: 'style-src-elem' });
  assert.equal(ohne.allowed, false, "'unsafe-inline' darf hier nicht mehr greifen");
  assert.match(ohne.reason, /CSP2\+/);
  const mit = checkResource(map, { type: 'inline', directive: 'style-src-elem', nonce: 'abc123' });
  assert.equal(mit.allowed, true, 'passende Nonce muss greifen');
});

test('gelisteter Hash erlaubt den Block', () => {
  const map = parseCsp("style-src-elem 'self' 'sha256-AAA='");
  const r = checkResource(map, { type: 'inline', directive: 'style-src-elem', hashes: ["'sha256-AAA='"] });
  assert.equal(r.allowed, true);
  assert.equal(r.matchedBy, "'sha256-AAA='");
});

test('Nonce gilt nicht für style="…"-Attribute', () => {
  const map = parseCsp("style-src-attr 'nonce-abc123'");
  assert.equal(checkResource(map, { type: 'attr', directive: 'style-src-attr', nonce: 'abc123' }).allowed, false);
});

test('Schema-Sources: data: und https:', () => {
  const map = parseCsp("img-src 'self' data:");
  assert.equal(checkResource(map, { type: 'url', directive: 'img-src', url: 'data:image/png;base64,AA' }).allowed, true);
  assert.equal(checkResource(map, { type: 'url', directive: 'img-src', url: 'blob:https://x.de/1' }).allowed, false);
  const wide = parseCsp("img-src https:");
  assert.equal(checkResource(wide, { type: 'url', directive: 'img-src', url: 'https://beliebig.de/a.png' }).allowed, true);
});

test('Wildcard * matcht keine data:-URLs (Spec)', () => {
  const map = parseCsp('img-src *');
  assert.equal(checkResource(map, { type: 'url', directive: 'img-src', url: 'https://x.de/a.png' }).allowed, true);
  assert.equal(checkResource(map, { type: 'url', directive: 'img-src', url: 'data:image/png;base64,AA' }).allowed, false);
});

test('Host-Match ist www-tolerant und port-tolerant', () => {
  const map = parseCsp('script-src-elem https://plausible.io');
  assert.equal(checkResource(map, { type: 'url', directive: 'script-src-elem', url: 'https://www.plausible.io/js/s.js' }).allowed, true);
  assert.equal(checkResource(map, { type: 'url', directive: 'script-src-elem', url: 'https://plausible.io:443/js/s.js' }).allowed, true);
});

test('Host-Match ist exakt — kein Substring (profi.de ⊄ donau-profi.de)', () => {
  const map = parseCsp('script-src-elem https://profi.de');
  assert.equal(checkResource(map, { type: 'url', directive: 'script-src-elem', url: 'https://donau-profi.de/a.js' }).allowed, false);
});

test('Subdomain-Wildcard *.example.com', () => {
  const map = parseCsp('frame-src https://*.youtube-nocookie.com');
  assert.equal(checkResource(map, { type: 'url', directive: 'frame-src', url: 'https://www.youtube-nocookie.com/embed/x' }).allowed, true);
  assert.equal(checkResource(map, { type: 'url', directive: 'frame-src', url: 'https://youtube.com/embed/x' }).allowed, false);
});

test('relative URL zählt als same-origin', () => {
  const map = parseCsp("script-src-elem 'self' https://a.de");
  assert.equal(checkResource(map, { type: 'url', directive: 'script-src-elem', url: '/js/nav.js' }, { siteOrigin: 'https://a.de' }).allowed, true);
});

test('upgrade-insecure-requests wird nie als Erlaubnis-Quelle gewertet', () => {
  const map = parseCsp("upgrade-insecure-requests; default-src 'self' https://a.de");
  const r = checkResource(map, { type: 'url', directive: 'img-src', url: 'https://fremd.de/a.png' }, { siteOrigin: 'https://a.de' });
  assert.equal(r.allowed, false);
  assert.equal(r.directive, 'default-src');
});

test('frame-src fällt über child-src auf default-src zurück', () => {
  const map = parseCsp("default-src 'self'; child-src https://cal.eu");
  const r = checkResource(map, { type: 'url', directive: 'frame-src', url: 'https://cal.eu/x' }, { siteOrigin: 'https://a.de' });
  assert.equal(r.allowed, true);
  assert.equal(r.directive, 'child-src');
});
