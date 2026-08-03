// @ts-check
/**
 * Tests für den Embed-Consent-Guard (src/integrations/ai-discovery/embed-consent-check.js).
 *
 * Lauf: `node --test tests/ai-discovery/embed-consent-check.test.js`
 * Oder über Skript: `pnpm test`
 *
 * Auslöser (Live-Audit 2026-08-03): steller-sanierungen.com/kontakt lieferte den
 * Eager-Zweig von CalEmbed.astro aus — `app.cal.eu/embed/embed.js` wurde beim Parsen
 * injiziert, die Besucher-IP floss vor jeder Nutzeraktion an Cal.com Inc. Ursache war
 * der Default `lazy = false`. Blitzsicht war sauber (`lazy={true}` explizit gesetzt).
 *
 * Abdeckung:
 *   1. Negativ-Test gegen echten Bug: Steller-ALTCODE (Eager-Zweig) → MUSS flaggen
 *   2. Blitzsicht NACH Fix (Lazy-Zweig, click-Gate) → keine Violation
 *   3. TurnstilePreClearance (load + requestIdleCallback) → keine Violation
 *      — der teuerste False Positive: läuft auf JEDER Seite JEDES Kunden
 *   4. Externer Loader als <script src> → MUSS flaggen (kein Gate möglich)
 *   5. Cal-URL in application/ld+json → keine Violation (Daten, kein Ladevorgang)
 *   6. Seite ganz ohne Cal → keine Violation
 *   7. Deferral-Gate statt Klick-Gate (load) am Cal-Embed → MUSS flaggen
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { checkEmbedConsent } from '../../src/integrations/ai-discovery/embed-consent-check.js';

/** Eager-Zweig aus CalEmbed.astro (Stand vor dem Fix) — gekürzt, aber strukturgleich. */
const STELLER_EAGER = `
<div id="cal-embed" class="cal-embed" style="min-height:600px"></div>
<script data-cal-link="steller-sanierungen/kostenlose-erstbesichtigung">
  (function() {
    var s = document.currentScript;
    var ns = s.getAttribute('data-cal-namespace');
    (function (C, A, L) {
      var p = function (a, ar) { a.q.push(ar); };
      var d = C.document;
      C.Cal = C.Cal || function () {
        var cal = C.Cal; var ar = arguments;
        if (!cal.loaded) { cal.ns = {}; cal.q = cal.q || []; d.head.appendChild(d.createElement("script")).src = A; cal.loaded = true; }
        p(cal, ar);
      };
    })(window, "https://app.cal.eu/embed/embed.js", "init");
    Cal("init", ns, { origin: "https://app.cal.eu" });
    Cal.ns[ns]("inline", { elementOrSelector: "#cal-embed" });
  })();
</script>`;

/** Lazy-Zweig aus CalEmbed.astro — Loader steckt im click-Callback. */
const BLITZSICHT_LAZY = `
<div id="cal-kontakt-embed" class="cal-embed" style="min-height:280px">
  <div class="cal-placeholder"><button class="cal-trigger" type="button">Termin direkt buchen</button></div>
</div>
<script data-cal-link="blitzsicht/30min" data-cal-lazy="true">
  (function() {
    var s = document.currentScript;
    var container = document.querySelector('#cal-kontakt-embed');
    var btn = container.querySelector('.cal-trigger');
    var loaded = false;
    btn.addEventListener('click', function onTrigger() {
      if (loaded) return;
      loaded = true;
      (function (C, A, L) {
        var d = C.document;
        C.Cal = C.Cal || function () {
          var cal = C.Cal;
          if (!cal.loaded) { d.head.appendChild(d.createElement("script")).src = A; cal.loaded = true; }
        };
      })(window, "https://app.cal.eu/embed/embed.js", "init");
      Cal("init", 'x', { origin: "https://app.cal.eu" });
    });
  })();
</script>`;

/** TurnstilePreClearance.astro — Deferral per load+idle, KEIN Cal, darf nie flaggen. */
const TURNSTILE_PRECLEARANCE = `
<link rel="preconnect" href="https://challenges.cloudflare.com" />
<script>
  (function () {
    var w = window;
    var load = (w.__cwTsLoad = w.__cwTsLoad || function () {
      if (load.done) return;
      load.done = true;
      var s = document.createElement('script');
      s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
      s.async = true;
      document.head.appendChild(s);
    });
    var idle = function () {
      if ('requestIdleCallback' in w) requestIdleCallback(load, { timeout: 2000 });
      else setTimeout(load, 1500);
    };
    if (document.readyState === 'complete') idle();
    else w.addEventListener('load', idle, { once: true });
  })();
</script>`;

test('1. Negativ-Test echter Bug: Steller-Eager-Zweig wird geflaggt', () => {
  const issues = checkEmbedConsent(STELLER_EAGER, '/kontakt/index.html');
  assert.equal(issues.length, 1, 'genau eine Meldung erwartet');
  assert.equal(issues[0].type, 'eager_booking_embed');
  assert.match(issues[0].details, /\/kontakt\/index\.html/);
});

test('2. Blitzsicht-Lazy-Zweig (click-Gate) wird nicht geflaggt', () => {
  assert.deepEqual(checkEmbedConsent(BLITZSICHT_LAZY, '/kontakt/index.html'), []);
});

test('3. TurnstilePreClearance wird nicht geflaggt (der teuerste False Positive)', () => {
  assert.deepEqual(checkEmbedConsent(TURNSTILE_PRECLEARANCE, '/index.html'), []);
});

test('3b. Turnstile + Lazy-Cal auf derselben Seite bleibt still', () => {
  const page = `<html><body>${TURNSTILE_PRECLEARANCE}${BLITZSICHT_LAZY}</body></html>`;
  assert.deepEqual(checkEmbedConsent(page, '/kontakt/index.html'), []);
});

test('4. Externer Cal-Loader als <script src> wird geflaggt', () => {
  const html = '<script src="https://app.cal.eu/embed/embed.js" async></script>';
  const issues = checkEmbedConsent(html, '/index.html');
  assert.equal(issues.length, 1);
  assert.equal(issues[0].type, 'eager_booking_embed');
  assert.match(issues[0].details, /embed\.js/);
});

test('5. Cal-URL in application/ld+json wird nicht geflaggt', () => {
  const html =
    '<script type="application/ld+json">' +
    '{"@type":"Organization","potentialAction":{"target":"https://app.cal.eu/embed/embed.js"}}' +
    '</script>';
  assert.deepEqual(checkEmbedConsent(html, '/index.html'), []);
});

test('6. Seite ohne Cal-Embed bleibt still', () => {
  const html = '<html><body><script>console.log("hi");</script></body></html>';
  assert.deepEqual(checkEmbedConsent(html, '/index.html'), []);
});

test('7. load-Deferral ist KEIN Consent-Gate — Cal dahinter wird geflaggt', () => {
  const html = `
<script>
  window.addEventListener('load', function () {
    var s = document.createElement('script');
    s.src = "https://app.cal.eu/embed/embed.js";
    document.head.appendChild(s);
  });
</script>`;
  const issues = checkEmbedConsent(html, '/index.html');
  assert.equal(issues.length, 1, 'load/idle darf nicht als Einwilligung durchgehen');
  assert.equal(issues[0].type, 'eager_booking_embed');
});

test('8. .com-Instanz und www-Host werden ebenfalls erkannt', () => {
  const html = '<script>var a = "https://www.cal.com/embed/embed.js"; Cal("init");</script>';
  assert.equal(checkEmbedConsent(html, '/index.html').length, 1);
});

test('9. Leeres/ungültiges HTML wirft nicht', () => {
  assert.deepEqual(checkEmbedConsent('', '/x.html'), []);
  // @ts-expect-error — bewusst falscher Typ, darf nicht crashen
  assert.deepEqual(checkEmbedConsent(undefined, '/x.html'), []);
});
