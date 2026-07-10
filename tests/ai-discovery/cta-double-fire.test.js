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
  hasDataCtaAttr,
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

// Hero NACH Fix: data-cta im Template, aber kein click→track-Script mehr.
const HERO_FIXED = `
<div class="hero-cta">
  <a href={ctaPrimary.href} class="btn-accent" data-cta={\`hero-primary:\${ctaPrimary.label}\`}>{ctaPrimary.label}</a>
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

// Header NACH Fix: data-cta nur auf nav-highlight, Listener :not(.btn-accent), annotiert.
const HEADER_FIXED = `
<nav id="main-nav">
  <a href={item.href} class="btn-accent" data-cta={\`nav-highlight:\${item.label}\`}>{item.label}</a>
  <a href={item.href}>{item.label}</a>
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
<a href={item.href} class="leistung-card leistung-card-link" data-cta={\`leistung-card:\${item.title}\`}>
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

test('2. data-cta ohne Listener (Hero nach Fix) → keine Violation', () => {
  const r = analyze('src/components/blocks/Hero.astro', HERO_FIXED);
  assert.equal(r.dataCta, true);
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

test('5. Header nach Fix (annotiert) → keine Violation', () => {
  const r = analyze('src/components/layout/Header.astro', HEADER_FIXED);
  assert.equal(r.clickTrack, true);
  assert.equal(r.dataCta, true);
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
