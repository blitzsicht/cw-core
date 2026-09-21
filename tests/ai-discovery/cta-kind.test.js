// @ts-check
/**
 * Tests für die CTA/Navigation-Unterscheidung (src/utils/analytics/cta-kind.ts).
 *
 * Lauf: `node --test tests/ai-discovery/cta-kind.test.js`
 *
 * Auslöser: Das Goal `CTA Click` bestand mehrheitlich aus Navigations-Klicks.
 * Gemessen an den Plausible-Exporten Mai–Juli 2026, bereinigt um die in v0.66.0
 * behobenen `nav:*`: rund 4:1 zugunsten der Navigation (gottl-richter-gomeier
 * 40 zu 9, schiller-gartenbau 36 zu 9).
 *
 * Die Tests bilden echte href-Werte aus dem Cluster ab, keine erfundenen.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ctaKind, ctaAttrs } from '../../src/utils/analytics/cta-kind.js';

// ---------------------------------------------------------------------------
// Conversion
// ---------------------------------------------------------------------------

test('tel:, mailto:, sms: sind immer Conversion', () => {
  assert.equal(ctaKind('tel:+4994015395920'), 'conversion');
  assert.equal(ctaKind('mailto:info@example.com'), 'conversion');
  assert.equal(ctaKind('sms:+4915112345678'), 'conversion');
});

test('Messenger- und Buchungsziele sind Conversion', () => {
  assert.equal(ctaKind('https://wa.me/4915112345678'), 'conversion');
  assert.equal(ctaKind('https://api.whatsapp.com/send?phone=49151'), 'conversion');
  assert.equal(ctaKind('https://cal.com/blitzsicht/erstgespraech'), 'conversion');
  assert.equal(ctaKind('https://cal.eu/siluri/termin'), 'conversion');
});

test('Anfrage-Seiten sind Conversion — mit und ohne Schrägstrich', () => {
  assert.equal(ctaKind('/kontakt'), 'conversion');
  assert.equal(ctaKind('/kontakt/'), 'conversion');
  assert.equal(ctaKind('https://digital-direkt.com/kontakt/'), 'conversion');
  assert.equal(ctaKind('/angebot-anfordern'), 'conversion');
  assert.equal(ctaKind('/termin'), 'conversion');
  assert.equal(ctaKind('/bewerbung'), 'conversion');
});

test('Anker auf ein Formular derselben Seite ist Conversion', () => {
  assert.equal(ctaKind('#anfrage'), 'conversion');
  assert.equal(ctaKind('/leistungen/kopierer-leasen/#anfrage'), 'conversion');
  assert.equal(ctaKind('#kontakt'), 'conversion');
});

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------

test('interne Inhaltsseiten sind Navigation', () => {
  assert.equal(ctaKind('/leistungen'), 'navigation');
  assert.equal(ctaKind('/leistungen/drucker-leasing/'), 'navigation');
  assert.equal(ctaKind('/glossar/finisher/'), 'navigation');
  assert.equal(ctaKind('/ueber-uns'), 'navigation');
  assert.equal(ctaKind('/'), 'navigation');
});

test('externe Links ohne Conversion-Ziel sind Navigation', () => {
  assert.equal(ctaKind('https://example.org/'), 'navigation');
  assert.equal(ctaKind('https://www.northdata.de/Firma'), 'navigation');
});

test('fehlender href ist Navigation — die vorsichtigere Annahme', () => {
  assert.equal(ctaKind(undefined), 'navigation');
  assert.equal(ctaKind(null), 'navigation');
  assert.equal(ctaKind(''), 'navigation');
  assert.equal(ctaKind('   '), 'navigation');
});

// ---------------------------------------------------------------------------
// Die Falle, wegen der die Entscheidung am href hängt
// ---------------------------------------------------------------------------

test('derselbe Slot liefert je nach Ziel verschiedene Arten', () => {
  // hero-secondary bei gottl-richter-gomeier: "Unsere Leistungen"
  assert.equal(ctaKind('/leistungen'), 'navigation');
  // derselbe Slot, anderer Kunde: Telefonnummer
  assert.equal(ctaKind('tel:+4994015395920'), 'conversion');
  // Eine Regel "secondary = immer Navigation" haette den zweiten Fall
  // still falsch gemessen — genau deshalb entscheidet der href.
});

test('Wortgrenzen: "kontaktlinsen" ist keine Kontaktseite', () => {
  assert.equal(ctaKind('/kontaktlinsen'), 'navigation');
  assert.equal(ctaKind('/leistungen/beratungsresistenz'), 'navigation');
});

// ---------------------------------------------------------------------------
// ctaAttrs — Exklusivität
// ---------------------------------------------------------------------------

test('ctaAttrs liefert genau EIN Attribut, nie beide', () => {
  const conv = ctaAttrs('/kontakt', 'cta-block:Angebot anfordern');
  assert.deepEqual(conv, { 'data-cta': 'cta-block:Angebot anfordern' });
  assert.equal('data-nav-click' in conv, false);

  const nav = ctaAttrs('/leistungen', 'hero-secondary:Unsere Leistungen');
  assert.deepEqual(nav, { 'data-nav-click': 'hero-secondary:Unsere Leistungen' });
  assert.equal('data-cta' in nav, false);
});

test('force sticht die Heuristik — fuer Buttons ohne href', () => {
  assert.deepEqual(ctaAttrs('/leistungen', 'x', 'conversion'), { 'data-cta': 'x' });
  assert.deepEqual(ctaAttrs('tel:+49123', 'y', 'navigation'), { 'data-nav-click': 'y' });
  assert.deepEqual(ctaAttrs(undefined, 'z', 'conversion'), { 'data-cta': 'z' });
});
