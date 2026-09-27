// @ts-check
/**
 * cta-double-fire-check: `data-referral-share` darf keinen echten Kontakt-Klick schlucken.
 *
 * Lauf: `node --test tests/blocks/referral-share-konflikt.test.js`
 *
 * auto-events.ts behandelt `[data-referral-share]` exklusiv: `closest()` findet den
 * Marker, feuert `Referral Share` und kehrt zurück. Trägt ein Element (oder sein
 * Vorfahr bzw. Nachfahre) den Marker UND ist zugleich ein echter Kontaktweg (`tel:`,
 * `mailto:` mit Adresse, `wa.me/<nummer>`, `api.whatsapp.com/send?phone=`) oder trägt
 * `data-cta`/`data-nav-click`, verschwindet der Kontakt-Klick still aus der Messung.
 * Der Guard meldet genau diese Kombination — im Quelltext und im gerenderten Markup.
 */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { hasReferralShareConflict, analyze, formatViolation } from '../../scripts/lint/cta-double-fire-check.mjs';
import { renderer, schliessen, normalize } from './_render-astro.js';

after(schliessen);

test('Marker an einem Vorfahren eines tel:-Links → Befund', () => {
  assert.equal(hasReferralShareConflict('<div data-referral-share="link"><a href="tel:+4994112345">Anrufen</a></div>'), true);
});

test('Marker und mailto MIT Adresse am selben Element → Befund', () => {
  assert.equal(hasReferralShareConflict('<a data-referral-share="mail" href="mailto:info@kunde.de?subject=x">M</a>'), true);
});

test('Marker an einem Kind eines wa.me/<nummer>-Links → Befund (Klick aufs Kind würde geschluckt)', () => {
  assert.equal(hasReferralShareConflict('<a href="https://wa.me/4994112345"><span data-referral-share="whatsapp">W</span></a>'), true);
});

test('api.whatsapp.com/send?phone= unter dem Marker → Befund', () => {
  assert.equal(hasReferralShareConflict('<section data-referral-share="x"><p><a href="https://api.whatsapp.com/send?phone=4994112345">W</a></p></section>'), true);
});

test('Marker zusammen mit data-cta bzw. data-nav-click → Befund', () => {
  assert.equal(hasReferralShareConflict('<a href="/kontakt" data-cta="x" data-referral-share="link">K</a>'), true);
  assert.equal(hasReferralShareConflict('<div data-referral-share="link"><a href="/leistungen" data-nav-click="nav:x">L</a></div>'), true);
});

test('Quelltext: ctaAttrs-Spread unter dem Marker zählt wie data-cta → Befund', () => {
  assert.equal(hasReferralShareConflict('<div data-referral-share="link"><a href={x} {...ctaAttrs(x, `a:${y}`)}>A</a></div>'), true);
});

test('Teilen-Form (mailto:? ohne Adresse, wa.me/?text=) → kein Befund', () => {
  assert.equal(hasReferralShareConflict(
    '<div><a href="https://wa.me/?text=Hallo" data-referral-share="whatsapp">W</a>' +
    '<a href="mailto:?subject=a&#38;body=b" data-referral-share="mail">M</a>' +
    '<button type="button" data-referral-share="link">L</button></div>'), false);
});

test('Kontakt-Link NEBEN (nicht unter) dem Marker → kein Befund', () => {
  assert.equal(hasReferralShareConflict(
    '<div><button data-referral-share="link">L</button></div><a href="tel:+4994112345" data-cta="phone">T</a>'), false);
});

test('Gegenprobe: Kontakt-Link ohne Marker irgendwo → kein Befund', () => {
  assert.equal(hasReferralShareConflict('<a href="tel:+4994112345">T</a><a href="https://wa.me/4994112345">W</a>'), false);
});

test('Script-, Style-Inhalt und Frontmatter werden nicht als Markup gelesen', () => {
  const quelle = `---\nconst a = document.querySelector<HTMLElement>('x');\n---\n<div data-referral-share="link"></div>\n<script>const b = document.querySelectorAll<HTMLAnchorElement>('a[href^="tel:"]');</script>`;
  assert.equal(hasReferralShareConflict(quelle), false);
});

test('analyze + formatViolation: Befund wird Violation mit eigener Meldung', () => {
  const v = analyze('src/components/blocks/X.astro', '<div data-referral-share="link"><a href="tel:+4994112345">T</a></div>');
  assert.equal(v.shareConflict, true);
  assert.equal(v.violation, true);
  assert.match(formatViolation(v), /data-referral-share/);
});

test('EmpfehlungSection wie gerendert → kein Befund', async () => {
  const r = await renderer();
  const html = normalize(await r.render('src/components/blocks/EmpfehlungSection.astro', {
    siteName: 'Bäckerei Müller & Söhne', shareUrl: 'https://example.org/?a=1&b=2', praemie: '50 €',
  }));
  assert.match(html, /data-referral-share="whatsapp"/, 'Vorbedingung: Marker ist im Markup');
  assert.equal(hasReferralShareConflict(html), false);
});

test('EmpfehlungSection-Quelltext → keine Violation', async () => {
  const { readFileSync } = await import('node:fs');
  const { resolve } = await import('node:path');
  const p = 'src/components/blocks/EmpfehlungSection.astro';
  const v = analyze(p, readFileSync(resolve(import.meta.dirname, '../..', p), 'utf-8'));
  assert.equal(v.shareConflict, false);
  assert.equal(v.violation, false);
});
