// @ts-check
/**
 * Tests für den Bewertungs-Aussagen-Guard (src/integrations/ai-discovery/review-claims-check.js).
 *
 * Lauf: `node --test tests/ai-discovery/review-claims-check.test.js`
 *
 * Auslöser (26.09.2026): donau-profi zeigte „★ 4,8 · 24 Google-Bewertungen“ und
 * „Echte Google-Rezensionen unserer Kundinnen und Kunden.“ — ohne Prüfhinweis nach
 * § 5b Abs. 3 UWG und mit einer Echtheits-Aussage, die UWG Anhang Nr. 23b nur erlaubt,
 * wenn wirklich geprüft wird. Dazu gab Testimonials.astro auf JEDER Kundenseite
 * selbst erteiltes AggregateRating-Markup aus.
 *
 * Abdeckung:
 *   1. donau-profi ALT (Befund) → (a) und (b) melden
 *   2. donau-profi KORRIGIERT → keine Meldung
 *   3. „verifizierte Bewertungen“ MIT Prüfbeschreibung im selben Abschnitt → keine (a)
 *   4. Prüfbeschreibung in einem ANDEREN Abschnitt → (a) meldet
 *   5. Sternezahl + Google-Bewertung, Prüfhinweis vorhanden → keine (b)
 *   6. JSON-LD LocalBusiness mit aggregateRating → (c)
 *   7. Microdata Product-aggregateRating auf LocalBusiness-Seite (alter Testimonials-Default) → (c)
 *   8. Product-Seite mit Product-JSON-LD und aggregateRating → keine (c)
 *   9. Preise („4,50 €“) und Wörter wie „Echtzeit“ → keine Meldung
 *  10. Wörter in <script>/<style> zählen nicht
 *  11. AggregateRating mit itemReviewed Organization (@graph) → (c)
 *  12.–16. Befunde aus dem Probelauf über 526 echte gebaute Seiten: ein übersehener
 *      fehlender Prüfhinweis (donau-profi) und vier Fehlalarme (blitzsicht-Ratgeber).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { checkReviewClaims } from '../../src/integrations/ai-discovery/review-claims-check.js';

const LB_JSONLD = `<script type="application/ld+json">{"@context":"https://schema.org","@type":["LocalBusiness","HomeAndConstructionBusiness"],"name":"Donau-Profi","url":"https://donau-profi.de"}</script>`;

/** Ausschnitt der donau-profi-Startseite, Stand vor der Korrektur (strukturgleich gekürzt). */
const DONAU_ALT = `<html><head>${LB_JSONLD}</head><body>
<section class="hero"><p class="hero-rating">★ 4,8 · 24 Google-Bewertungen</p></section>
<section class="testimonials-marquee"><div class="container"><div class="section-header">
<h2 class="section-heading">Das sagen unsere Kunden</h2>
<p class="section-subheading">Echte Google-Rezensionen unserer Kundinnen und Kunden.</p>
</div></div><div class="testimonial-card"><blockquote>Top Reinigung!</blockquote></div></section>
</body></html>`;

/** Dieselbe Seite nach der Korrektur. */
const DONAU_NEU = `<html><head>${LB_JSONLD}</head><body>
<section class="hero"><p class="hero-rating">★ 4,8 · 24 Google-Bewertungen</p></section>
<section class="testimonials-marquee"><div class="container"><div class="section-header">
<h2 class="section-heading">Das sagen unsere Kunden</h2>
<p class="section-subheading">Aus unserem Google-Unternehmensprofil. Wir prüfen nicht, ob die Verfasser unsere Leistungen tatsächlich in Anspruch genommen haben.</p>
</div></div><div class="testimonial-card"><blockquote>Top Reinigung!</blockquote></div></section>
</body></html>`;

/** @param {ReturnType<typeof checkReviewClaims>} issues */
const typen = (issues) => issues.map((i) => i.type).sort();

test('1. donau-profi ALT: Echtheits-Aussage UND fehlender Prüfhinweis werden gemeldet', () => {
  const issues = checkReviewClaims(DONAU_ALT, 'index.html');
  const t = typen(issues);
  assert.ok(t.includes('unverified_genuine_claim'), `(a) fehlt: ${t}`);
  assert.ok(t.includes('missing_review_disclaimer'), `(b) fehlt: ${t}`);
  const a = issues.find((i) => i.type === 'unverified_genuine_claim');
  assert.match(a?.details ?? '', /Echte Google-Rezensionen/);
  assert.match(a?.details ?? '', /index\.html/);
});

test('2. donau-profi KORRIGIERT: keine Meldung', () => {
  assert.deepEqual(checkReviewClaims(DONAU_NEU, 'index.html'), []);
});

test('3. „verifizierte Bewertungen“ mit Prüfbeschreibung im selben Abschnitt: keine (a)', () => {
  const html = `<section><h2>Verifizierte Bewertungen</h2>
    <p>Wir prüfen jede Bewertung anhand der Rechnungsnummer, bevor sie erscheint.</p></section>`;
  assert.deepEqual(typen(checkReviewClaims(html)), []);
});

test('4. Prüfbeschreibung nur in einem anderen Abschnitt: (a) meldet', () => {
  const html = `<section><h2>Geprüfte Kundenbewertungen</h2><p>Super Service.</p></section>
    <section><p>Wir prüfen jede Bewertung anhand der Rechnungsnummer.</p></section>`;
  assert.deepEqual(typen(checkReviewClaims(html)), ['unverified_genuine_claim']);
});

test('4b. „Wir prüfen nicht …“ ist keine Prüfbeschreibung, die „echte“ rechtfertigt', () => {
  const html = `<section><p>Echte Bewertungen unserer Kunden.</p>
    <p>Wir prüfen nicht, ob die Verfasser unsere Leistungen tatsächlich in Anspruch genommen haben.</p></section>`;
  assert.deepEqual(typen(checkReviewClaims(html)), ['unverified_genuine_claim']);
});

test('5. Sternezahl + Google-Bewertung mit Prüfhinweis (GoogleBewertungen-Block): keine (b)', () => {
  const html = `<section class="google-bewertungen"><h2>Bewertungen auf Google</h2>
    <p>4,8 von 5 Sternen · 24 Google-Bewertungen · Stand: 09/2026</p>
    <p class="gb-hinweis">Die Bewertungen stammen von Google-Nutzern. Wir prüfen nicht, ob die Verfasser unsere Leistungen tatsächlich in Anspruch genommen haben.</p></section>`;
  assert.deepEqual(checkReviewClaims(html), []);
});

test('5b. Aggregat in Leerzeichen-Schreibweise ohne Hinweis: (b)', () => {
  const html = `<div>4,9 ★ aus 37 Google Rezensionen</div>`;
  assert.deepEqual(typen(checkReviewClaims(html)), ['missing_review_disclaimer']);
});

test('5c. „Bewertungen auf Google“ mit Sternezahl ohne Hinweis: (b)', () => {
  const html = `<p>Durchschnitt 4,7 aus allen Bewertungen auf Google</p>`;
  assert.deepEqual(typen(checkReviewClaims(html)), ['missing_review_disclaimer']);
});

test('6. JSON-LD LocalBusiness mit aggregateRating: (c)', () => {
  const html = `<script type="application/ld+json">{"@context":"https://schema.org","@type":"Plumber","name":"X",
    "aggregateRating":{"@type":"AggregateRating","ratingValue":"4.8","reviewCount":"24"}}</script>`;
  const issues = checkReviewClaims(html, 'index.html');
  assert.deepEqual(typen(issues), ['self_serving_aggregate_rating']);
  assert.match(issues[0].details, /Plumber/);
});

test('7. Microdata Product-aggregateRating auf LocalBusiness-Seite (Testimonials v0.159.1): (c)', () => {
  const html = `<html><head>${LB_JSONLD}</head><body>
    <section class="testimonials-marquee" itemscope itemtype="https://schema.org/Product">
    <meta itemprop="name" content="Donau-Profi Website-Service">
    <div itemprop="aggregateRating" itemscope itemtype="https://schema.org/AggregateRating">
    <meta itemprop="ratingValue" content="4.8"></div></section></body></html>`;
  assert.deepEqual(typen(checkReviewClaims(html)), ['self_serving_aggregate_rating']);
});

test('8. Produktseite mit Product-JSON-LD und aggregateRating: keine (c)', () => {
  const html = `<script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization","name":"Shop"}</script>
    <script type="application/ld+json">{"@context":"https://schema.org","@type":"Product","name":"Mähroboter X",
    "aggregateRating":{"@type":"AggregateRating","ratingValue":"4.5","reviewCount":"12"}}</script>`;
  assert.deepEqual(checkReviewClaims(html), []);
});

test('9. Preise und „Echtzeit“ lösen nichts aus', () => {
  const html = `<section><p>Echtzeit-Bewertung Ihres Daches ab 4,50 € — Google-Bewertungen folgen.</p></section>`;
  assert.deepEqual(checkReviewClaims(html), []);
});

test('10. Treffer in <script> und <style> zählen nicht', () => {
  const html = `<script>const s = "Echte Bewertungen 4,8 Google-Bewertungen";</script>
    <style>.echte-bewertung::after{content:"4,8"}</style><p>Hallo</p>`;
  assert.deepEqual(checkReviewClaims(html), []);
});

test('11. AggregateRating im @graph mit itemReviewed Organization: (c)', () => {
  const html = `<script type="application/ld+json">{"@context":"https://schema.org","@graph":[
    {"@type":"WebSite","name":"X"},
    {"@type":"AggregateRating","ratingValue":"5","reviewCount":"3","itemReviewed":{"@type":"Organization","name":"X"}}]}</script>`;
  assert.deepEqual(typen(checkReviewClaims(html)), ['self_serving_aggregate_rating']);
});

// ---------------------------------------------------------------------------
// Befunde aus dem Probelauf über 526 gebaute Seiten (25 Kundenrepos, 26.09.2026)
// ---------------------------------------------------------------------------

test('12. donau-profi echt: „wir prüfen gerne, ob wir Ihr Objekt betreuen“ ist KEIN Prüfhinweis', () => {
  // Erste Guard-Fassung übersah den fehlenden Hinweis auf der echten Startseite, weil
  // dieser Satz aus dem Einzugsgebiet-Abschnitt als Prüfhinweis durchging.
  const html = `<section><p>★ 4,8 · 24 Google-Bewertungen · seit 2009 in Regensburg</p></section>
    <section><p>Wir reinigen im gesamten Landkreis sowie in vielen Teilen Bayerns.
    Sprechen Sie uns einfach an — wir prüfen gerne, ob wir auch Ihr Objekt betreuen können.</p></section>`;
  assert.deepEqual(typen(checkReviewClaims(html)), ['missing_review_disclaimer']);
});

test('13. blitzsicht-Ratgeber: verneinte oder fremdbezogene Echtheit meldet nicht', () => {
  const html = `<section>
    <p>Wenn Besucher kein echtes Gesicht und keine echten Bewertungen sehen, suchen sie weiter.</p>
    <p>Wir helfen Ihnen, echte Fotos und Bewertungen professionell einzubinden.</p>
    <p>AggregateRating ohne echte Reviews erkennt Google.</p></section>`;
  assert.deepEqual(checkReviewClaims(html), []);
});

test('14. blitzsicht-Blog: Überschrift und Absatz laufen nicht ineinander', () => {
  const html = `<article><h3>Tag 2: erst Mobil, dann auf Desktop geprüft</h3>
    <p>Am Ende von Tag 2 machen wir einen internen Screenshot-Review.</p></article>`;
  assert.deepEqual(checkReviewClaims(html), []);
});

test('15. blitzsicht-Blog: eine zitierte Beispielbewertung ist kein Aggregat', () => {
  const html = `<p>Was wirklich zieht, ist ein Gesicht oder eine ehrliche Google-Bewertung („★ 4,9”).</p>`;
  assert.deepEqual(checkReviewClaims(html), []);
});

test('16. Gegenrichtung: „Unsere Bewertungen sind alle echt.“ meldet', () => {
  assert.deepEqual(typen(checkReviewClaims('<p>Unsere Bewertungen sind alle echt.</p>')), ['unverified_genuine_claim']);
});

test('leeres HTML: keine Meldung', () => {
  assert.deepEqual(checkReviewClaims(''), []);
});

// ---------------------------------------------------------------------------
// Verdrahtung in der Integration (Quelltext-Probe: der Walk über dist/ läuft nur
// im echten Astro-Build und ist hier nicht ausführbar)
// ---------------------------------------------------------------------------

test('index.ts: Guard verdrahtet, Default an, strict nur bei ausdrücklichem true', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../../src/integrations/ai-discovery/index.ts', import.meta.url), 'utf8');
  assert.match(src, /import \{ checkReviewClaims \} from '\.\/review-claims-check\.js';/);
  assert.match(src, /checkReviewClaims\?: boolean;/);
  assert.match(src, /strictReviewClaims\?: boolean;/);
  assert.match(src, /options\.checkReviewClaims !== false/);
  assert.match(src, /options\.strictReviewClaims === true/);
});
