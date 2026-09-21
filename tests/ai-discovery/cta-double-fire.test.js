// @ts-check
/**
 * Tests für den CTA-Doppelfeuer-Guard (scripts/lint/cta-double-fire-check.mjs).
 *
 * Lauf: `node --test tests/ai-discovery/cta-double-fire.test.js`
 * Oder über Skript: `pnpm test`
 *
 * Auslöser (Live-Audit 2026-07-10): blitzsicht.com — ein Hero-CTA-Klick feuerte
 * "Hero CTA Click" + "CTA Click", ein Nav-Klick "Nav Click" + "CTA Click".
 * Ursache: Komponenten-lokale click→track-Listener auf Elementen, die auch der
 * globale [data-cta]-SSOT-Listener abfängt.
 *
 * Abdeckung:
 *   1. Clean: click→track ohne data-cta → keine Violation
 *   2. data-cta ohne Listener (Hero NACH Fix) → keine Violation
 *   3. Negativ-Test gegen echten Bug: Hero-ALTCODE (Listener + data-cta) → MUSS flaggen
 *   4. Negativ-Test gegen echten Bug: Header-ALTCODE (#main-nav a + nav:data-cta) → MUSS flaggen
 *   5. Header NACH Fix (Listener + data-cta + cw-tracking-safe) → keine Violation
 *   6. LeistungenSection NACH Fix (annotiert) → keine Violation
 *   7. Allowlist BaseLayout (Listener + data-cta) → keine Violation
 *   8. Allowlist PlausibleEvents → keine Violation
 *   9. Komponente ganz ohne Tracking → keine Violation
 *  10. findViolations meldet mehrere gleichzeitig
 *  11. Integration: echter src-Tree hat NULL Violations (Fix-Verifikation)
 *
 * Erweiterung 2026-09-21 — der Guard war fuer zwei reale Bugs blind:
 *  12. MapEmbed-Altcode: data-cta + window.plausible() → MUSS flaggen.
 *      Der alte Detektor prueft nur `track(` und sah den Direktaufruf nicht.
 *  13. ContactForm ohne Marker: <form> + submit→track → MUSS flaggen.
 *      Der alte Detektor prueft nur 'click', nie 'submit'.
 *  14. Dieselbe Form MIT Marker → keine Violation.
 *  15. Formular ohne eigenes Tracking (BriefingForm-artig) → keine Violation.
 *  16. Detektor ueberzieht nicht: window.plausible OHNE data-cta (StickyContact,
 *      CalEmbed, VideoEmbed) bleibt sauber.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  analyze,
  findViolations,
  isAllowlisted,
  hasClickTrackListener,
  hasSubmitTrackListener,
  hasTrackCall,
  hasDataCtaAttr,
  hasFormElement,
  hasFormTrackedMarker,
  FORM_TRACKED_MARKER,
} from '../../scripts/lint/cta-double-fire-check.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');

// ---------------------------------------------------------------------------
// Mock-Fixtures (echte Code-Formen aus dem Cluster)
// ---------------------------------------------------------------------------

// StellenListe-artig: click→track, aber KEIN data-cta.
const CLEAN_LISTENER = `
<a href={applyHref} class="btn-accent">Jetzt bewerben</a>
<script>
  import { track } from '../../utils/analytics/track';
  document.querySelectorAll('.apply-link').forEach((link) => {
    link.addEventListener('click', () => track('Job Application Click', { position }));
  });
</script>`;

// Hero NACH Fix: Attribut ueber ctaAttrs, kein click→track-Script mehr.
// Seit v0.156.0 darf kein literales data-cta mehr im Markup stehen.
const HERO_FIXED = `
<div class="hero-cta">
  <a href={ctaPrimary.href} class="btn-accent" {...ctaAttrs(ctaPrimary.href, \`hero-primary:\${ctaPrimary.label}\`)}>{ctaPrimary.label}</a>
</div>
<!-- Kein komponenten-lokaler CTA-Click-Listener mehr (entfernt v0.66). -->`;

// Hero ALTCODE (der echte Bug): data-cta + eigener click→track-Listener.
const HERO_OLD = `
<div class="hero-cta">
  <a href={ctaPrimary.href} class="btn-accent" data-cta={\`hero-primary:\${ctaPrimary.label}\`}>{ctaPrimary.label}</a>
</div>
<script>
  import { track } from '../../utils/analytics/track';
  document.querySelectorAll('.hero-cta a').forEach((link) => {
    link.addEventListener('click', () => {
      track('Hero CTA Click', { label: link.textContent?.trim() ?? '' });
    });
  });
</script>`;

// Header ALTCODE (der echte Bug): nav:-data-cta auf allen Links + #main-nav a Listener.
const HEADER_OLD = `
<nav id="main-nav">
  <a href={item.href} data-cta={\`nav:\${item.label}\`}>{item.label}</a>
</nav>
<script>
  import { track } from '../../utils/analytics/track';
  document.querySelectorAll('#main-nav a').forEach((link) => {
    link.addEventListener('click', () => track('Nav Click', { label: link.textContent }));
  });
</script>`;

// Header NACH Fix (Stand v0.66.0, mit lokalem Nav-Listener). Seit v0.156.0 gibt
// Header.astro diesen Listener ab — das Fixture bleibt trotzdem gueltig: Es prueft,
// dass ein lokaler Listener NEBEN Tracking-Attributen erlaubt ist, wenn er
// nachweislich andere Elemente trifft und das per Annotation belegt.
const HEADER_FIXED = `
<nav id="main-nav">
  <a href={item.href} class="btn-accent" {...ctaAttrs(item.href, \`nav-highlight:\${item.label}\`)}>{item.label}</a>
  <a href={item.href} {...ctaAttrs(item.href, \`nav:\${item.label}\`)}>{item.label}</a>
</nav>
<script>
  import { track } from '../../utils/analytics/track';
  // cw-tracking-safe: Listener schliesst .btn-accent (nav-highlight) aus; nur der
  // highlight-Link trägt data-cta → kein Klick löst beide Events aus.
  document.querySelectorAll('#main-nav a:not(.btn-accent)').forEach((link) => {
    link.addEventListener('click', () => track('Nav Click', { label: link.textContent }));
  });
</script>`;

// LeistungenSection NACH Fix: annotiert, Selektor a.leistung-link (kein Span).
const LEISTUNGEN_FIXED = `
<a href={item.href} class="leistung-card leistung-card-link" {...ctaAttrs(item.href, \`leistung-card:\${item.title}\`)}>
  <span class="leistung-link" aria-hidden="true">Mehr →</span>
</a>
<script>
  import { track } from '../../utils/analytics/track';
  // cw-tracking-safe: 'a.leistung-link' trifft nur den Read-More-Anchor, nicht den Span.
  document.querySelectorAll('a.leistung-link').forEach((link) => {
    link.addEventListener('click', () => track('Service Click', { service }));
  });
</script>`;

// BaseLayout-artig (allowlistet): globaler [data-cta]-Listener.
const BASELAYOUT = `
<script>
  import { track } from '../utils/analytics/track';
  document.addEventListener('click', (e) => {
    const cta = e.target.closest('[data-cta]');
    if (cta) track('CTA Click', { name: cta.getAttribute('data-cta') || 'unnamed' });
  });
</script>`;

// Komponente ganz ohne Tracking.
const NO_TRACKING = `<section><h2>{title}</h2><p>{text}</p></section>`;

// ---------------------------------------------------------------------------
// Unit-Tests
// ---------------------------------------------------------------------------

test('1. clean: click→track ohne data-cta → keine Violation', () => {
  assert.equal(analyze('src/components/blocks/StellenListe.astro', CLEAN_LISTENER).violation, false);
});

test('2. Tracking-Attribut ohne Listener (Hero nach Fix) → keine Violation', () => {
  const r = analyze('src/components/blocks/Hero.astro', HERO_FIXED);
  // Seit v0.156.0 vergibt ctaAttrs das Attribut — literales data-cta gibt es
  // im Markup nicht mehr, deshalb ist dataCta hier false und literalCta ebenso.
  assert.equal(r.literalCta, false);
  assert.equal(r.clickTrack, false);
  assert.equal(r.violation, false);
});

test('3. NEGATIV-TEST echter Bug: Hero-Altcode → MUSS flaggen', () => {
  const r = analyze('src/components/blocks/Hero.astro', HERO_OLD);
  assert.equal(r.clickTrack, true);
  assert.equal(r.dataCta, true);
  assert.equal(r.violation, true);
});

test('4. NEGATIV-TEST echter Bug: Header-Altcode → MUSS flaggen', () => {
  const r = analyze('src/components/layout/Header.astro', HEADER_OLD);
  assert.equal(r.violation, true);
});

test('5. Header mit lokalem Listener + Annotation → keine Violation', () => {
  const r = analyze('src/components/layout/Header.astro', HEADER_FIXED);
  assert.equal(r.clickTrack, true);
  assert.equal(r.literalCta, false, 'Attribute kommen aus ctaAttrs, nicht literal');
  assert.equal(r.annotated, true);
  assert.equal(r.violation, false);
});

test('6. LeistungenSection nach Fix (annotiert) → keine Violation', () => {
  assert.equal(analyze('src/components/blocks/LeistungenSection.astro', LEISTUNGEN_FIXED).violation, false);
});

test('7. Allowlist BaseLayout → keine Violation trotz Listener', () => {
  const r = analyze('src/layouts/BaseLayout.astro', BASELAYOUT);
  assert.equal(isAllowlisted('src/layouts/BaseLayout.astro'), true);
  assert.equal(r.violation, false);
});

test('8. Allowlist PlausibleEvents → keine Violation', () => {
  assert.equal(isAllowlisted('src/components/analytics/PlausibleEvents.astro'), true);
});

test('9. Komponente ohne Tracking → keine Violation', () => {
  const r = analyze('src/components/blocks/Faq.astro', NO_TRACKING);
  assert.equal(r.clickTrack, false);
  assert.equal(r.violation, false);
});

test('10. findViolations meldet mehrere gleichzeitig', () => {
  const files = [
    { path: 'src/components/blocks/Hero.astro', content: HERO_OLD },
    { path: 'src/components/layout/Header.astro', content: HEADER_OLD },
    { path: 'src/components/blocks/StellenListe.astro', content: CLEAN_LISTENER },
  ];
  const v = findViolations(files);
  assert.equal(v.length, 2);
});

test('detektor-primitive: hasClickTrackListener / hasDataCtaAttr', () => {
  assert.equal(hasClickTrackListener(HERO_OLD), true);
  assert.equal(hasClickTrackListener(NO_TRACKING), false);
  assert.equal(hasDataCtaAttr(HERO_OLD), true);
  assert.equal(hasDataCtaAttr(NO_TRACKING), false);
});

// ---------------------------------------------------------------------------
// Erweiterung 2026-09-21: submit-Listener + Direktaufruf window.plausible()
// ---------------------------------------------------------------------------

// MapEmbed ALTCODE (echter Bug): derselbe Button traegt data-cta UND feuert
// direkt window.plausible — ein Klick ergab "Map Load" + "CTA Click".
const MAPEMBED_OLD = `
<button class="map-load" data-cta="map:load">Karte laden</button>
<script>
  const b = document.querySelector('.map-load');
  b?.addEventListener('click', () => {
    const w = window;
    if (typeof w.plausible === 'function') w.plausible('Map Load');
  });
</script>`;

// ContactForm ALTCODE (echter Bug): eigenes <form> mit submit→track, kein Marker.
const CONTACTFORM_OLD = `
<form id="contact-form" data-web3form data-form-type={formType}>
  <input name="email" />
</form>
<script>
  import { track } from '../../utils/analytics/track';
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    track('Form Submit', { type: formType, status: 'success' });
  });
</script>`;

// ContactForm NACH Fix: Marker statisch im Markup.
const CONTACTFORM_FIXED = CONTACTFORM_OLD.replace('data-web3form', `data-web3form ${FORM_TRACKED_MARKER}`);

// BriefingForm-artig: <form> ohne jedes eigene Tracking — der globale Listener
// ist hier die einzige Quelle und soll es auch bleiben.
const FORM_NO_TRACKING = `
<form id="briefing"><input name="firma" /></form>
<script>
  form.addEventListener('submit', async (e) => { e.preventDefault(); await fetch(url); });
</script>`;

// StickyContact-artig: window.plausible, aber KEIN data-cta → kein Doppelfeuer.
const DIRECT_PLAUSIBLE_NO_CTA = `
<a href={telLink} class="sticky-btn" data-track="sticky-phone">Anrufen</a>
<script>
  document.querySelectorAll('[data-track]').forEach((el) => {
    el.addEventListener('click', () => window.plausible('Sticky Contact Click', { props: { channel: el.dataset.track } }));
  });
</script>`;

test('12. NEGATIV-TEST echter Bug: MapEmbed-Altcode (data-cta + window.plausible) → MUSS flaggen', () => {
  const r = analyze('src/components/blocks/MapEmbed.astro', MAPEMBED_OLD);
  assert.equal(hasTrackCall(MAPEMBED_OLD), true, 'Direktaufruf window.plausible muss erkannt werden');
  assert.equal(r.clickTrack, true);
  assert.equal(r.dataCta, true);
  assert.equal(r.ctaViolation, true);
});

test('13. NEGATIV-TEST echter Bug: Formular mit submit→track ohne Marker → MUSS flaggen', () => {
  const r = analyze('src/components/forms/ContactForm.astro', CONTACTFORM_OLD);
  assert.equal(r.submitTrack, true);
  assert.equal(r.formEl, true);
  assert.equal(r.formMarker, false);
  assert.equal(r.formViolation, true);
  // Gegenprobe zum alten Detektor: ueber 'click' ist hier nichts zu sehen.
  assert.equal(r.clickTrack, false, 'der Bug ist per click-Pruefung unsichtbar — genau die alte Luecke');
});

test('14. Dieselbe Form MIT Marker → keine Violation', () => {
  const r = analyze('src/components/forms/ContactForm.astro', CONTACTFORM_FIXED);
  assert.equal(r.formMarker, true);
  assert.equal(r.formViolation, false);
  assert.equal(r.violation, false);
});

test('15. Formular ohne eigenes Tracking → keine Violation (globaler Listener bleibt zustaendig)', () => {
  const r = analyze('src/components/forms/BriefingForm.astro', FORM_NO_TRACKING);
  assert.equal(r.formEl, true);
  assert.equal(r.submitTrack, false);
  assert.equal(r.formViolation, false);
});

test('16. Detektor ueberzieht nicht: window.plausible ohne data-cta bleibt sauber', () => {
  const r = analyze('src/components/blocks/StickyContact.astro', DIRECT_PLAUSIBLE_NO_CTA);
  assert.equal(hasTrackCall(DIRECT_PLAUSIBLE_NO_CTA), true);
  assert.equal(r.dataCta, false);
  assert.equal(r.violation, false);
});

test('detektor-primitive (neu): submit / form / marker / plausible-direktaufruf', () => {
  assert.equal(hasSubmitTrackListener(CONTACTFORM_OLD), true);
  assert.equal(hasSubmitTrackListener(HERO_OLD), false);
  assert.equal(hasFormElement(CONTACTFORM_OLD), true);
  assert.equal(hasFormElement(HERO_OLD), false);
  assert.equal(hasFormTrackedMarker(CONTACTFORM_FIXED), true);
  assert.equal(hasFormTrackedMarker(CONTACTFORM_OLD), false);
  assert.equal(hasTrackCall(NO_TRACKING), false);
});

// ---------------------------------------------------------------------------
// Integration: echter src-Tree hat NULL Violations (Fix-Verifikation)
// ---------------------------------------------------------------------------

/** Rekursiv alle .astro-Dateien unter dir sammeln. */
function collectAstro(dir) {
  const out = [];
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, ent.name);
    if (ent.isDirectory()) out.push(...collectAstro(p));
    else if (ent.name.endsWith('.astro')) out.push(p);
  }
  return out;
}

test('11. Integration: echter cw-core-Tree hat keine CTA-Doppelfeuer', () => {
  const roots = [join(REPO_ROOT, 'src', 'components'), join(REPO_ROOT, 'src', 'layouts')];
  const files = roots.flatMap(collectAstro).map((p) => ({
    path: p,
    content: readFileSync(p, 'utf8'),
  }));
  assert.ok(files.length > 5, `zu wenig .astro-Dateien gefunden (${files.length}) — Pfad falsch?`);
  const violations = findViolations(files);
  const report = violations.map((v) => `  - ${v.path.replace(REPO_ROOT + '/', '')}`).join('\n');
  assert.equal(
    violations.length,
    0,
    `Erwartet 0 CTA-Doppelfeuer, gefunden ${violations.length}:\n${report}\n` +
      `Fix: Listener/data-cta entkoppeln oder cw-tracking-safe-Annotation ergänzen.`
  );
});
