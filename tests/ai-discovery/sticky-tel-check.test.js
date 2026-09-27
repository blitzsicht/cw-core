// @ts-check
/**
 * Tests für den Sticky-Anruf-Guard (src/integrations/ai-discovery/sticky-tel-check.js).
 *
 * Lauf: `node --test tests/ai-discovery/sticky-tel-check.test.js`
 *
 * ANLASS (Lead-Rakete-Audit 26.09.2026): Handwerks- und Dienstleistungsseiten bekommen
 * den Großteil ihres Traffics auf dem Handy. Wer dort anrufen will, muss die Nummer
 * erst suchen, wenn nichts Fixiertes sie anbietet. Befunde:
 *   - gottl-richter-gomeier + schiller-gartenbau: StickyMobileCTA zeigt auf /kontakt
 *   - baeckereizink: kein Sticky, `tel:` nur in Filialkarten und Footer
 *   - allstargirls: StickyContact mit hideOnMobile — auf dem Handy unsichtbar
 * Sauber: hausammincio (StickyMobileCTA href="tel:+39…"), mika (FloatingCallButton).
 *
 * Markup-Ausschnitte stammen aus den gebauten dist/index.html dieser Repos (Stand
 * 21.–25.09.2026), auf das Nötige gekürzt; Scope-Hashes und CSS wie im Build.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { checkStickyTel, telImFixiertenElement } from '../../src/integrations/ai-discovery/sticky-tel-check.js';

/** CSS genau so, wie Astro es minifiziert in die Seite inlined (Auszug gottl-richter-gomeier). */
const CSS = `<style>header[data-astro-cid-eiidso3b]{position:sticky;top:0;z-index:50;background:var(--color-header-bg, var(--color-primary));color:#fff}
.sticky-mobile-cta[data-astro-cid-aboxose6]{display:flex;align-items:center;justify-content:center;position:fixed;left:0;right:0;bottom:0}
@media(min-width:768px){.sticky-mobile-cta[data-astro-cid-aboxose6]{display:none}}
.sticky-mobile-cta--split[data-astro-cid-aboxose6]{display:flex;align-items:stretch;position:fixed;left:0;right:0;bottom:0;z-index:50}
.sticky-contact[data-astro-cid-xqpn7kbo]{position:fixed;right:.75rem;bottom:.75rem;z-index:50;display:flex}
.sticky-contact--hide-mobile[data-astro-cid-xqpn7kbo]{display:none}
@media(min-width:768px){.sticky-contact--hide-mobile[data-astro-cid-xqpn7kbo]{display:flex}}
.floating-call[data-astro-cid-sytsb3u4]{position:fixed;bottom:1.25rem;right:1.25rem;z-index:999}</style>`;

const HEADER = `<header data-astro-cid-eiidso3b><div class="container"><a href="/" class="logo">Logo</a>
<nav id="main-nav"><a href="/leistungen">Leistungen</a><a href="/kontakt">Kontakt</a></nav></div></header>`;
const FOOTER_TEL = `<footer data-section="footer"><a href="tel:+499413993000" class="contact-link">0941 3993000</a></footer>`;

/** @param {string} body */
const seite = (body) => `<!DOCTYPE html><html lang="de"><head>${CSS}</head><body>${HEADER}<main>${body}</main>${FOOTER_TEL}</body></html>`;

/** gottl-richter-gomeier / schiller-gartenbau: Sticky-Leiste führt zum Formular, nicht zum Telefon. */
const GRG = seite(`<section class="hero"><h1>Gutachten</h1></section>
<a class="sticky-mobile-cta" href="/kontakt" target="_self" data-astro-cid-aboxose6>Kontakt aufnehmen →</a>`);

/** baeckereizink: kein Sticky, tel: in den Filialkarten. */
const ZNK = seite(`<p class="phone" data-astro-cid-gliaaj7v> <a href="tel:+4994513068" data-cta="filialen-karte:tel:pfakofen-zentrale" class="astro-gliaaj7v">09451 3068</a></p>`);

/** hausammincio: geteilte Sticky-Leiste, links Anrufen. */
const HAM = seite(`<div class="sticky-mobile-cta sticky-mobile-cta--split" data-astro-cid-aboxose6><a class="sticky-mobile-cta__btn sticky-mobile-cta__btn--primary sticky-mobile-cta__btn--primary-primary" href="tel:+393459973997" target="_self" data-astro-cid-aboxose6>Anrufen →</a><a class="sticky-mobile-cta__btn sticky-mobile-cta__btn--secondary sticky-mobile-cta__btn--whatsapp" href="https://wa.me/393459973997" target="_self" data-astro-cid-aboxose6>WhatsApp →</a></div>`);

/** mika: FloatingCallButton. */
const MIKA = seite(`<a class="floating-call variant-notfall is-stacked" href="tel:+4916091172381" data-cta="floating-call" aria-label="Anrufen: 0160 91172381" data-astro-cid-sytsb3u4><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M22 16.92v3"/></svg><span class="label">Schnellhilfe</span></a>`);

/** allstargirls: StickyContact mit hideOnMobile — fixiert, aber auf dem Handy display:none. */
const ASG = seite(`<div class="sticky-contact sticky-contact--hide-mobile" role="complementary" aria-label="Schnellkontakt" data-astro-cid-xqpn7kbo><a href="https://wa.me/4915127184818?text=Hallo" class="sticky-btn sticky-btn--wa" data-astro-cid-xqpn7kbo>WA</a><a href="tel:+4915127184818" class="sticky-btn sticky-btn--phone" aria-label="Anrufen" data-astro-cid-xqpn7kbo>Tel</a></div>`);

const OHNE_TEL = `<!DOCTYPE html><html><head>${CSS}</head><body>${HEADER}<main><p>Kontakt per Formular.</p></main><footer><a href="mailto:a@b.de">a@b.de</a></footer></body></html>`;

const MELDUNG = 'Keine fixierte Anruf-Möglichkeit auf Mobilgeräten (StickyMobileCTA href=tel:… oder FloatingCallButton)';

test('GRG/SCH: StickyMobileCTA href="/kontakt" → Warnung mit der Standardmeldung', () => {
  const issues = checkStickyTel([{ page: 'index.html', html: GRG }]);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].type, 'no_sticky_tel');
  assert.ok(issues[0].details.startsWith(MELDUNG), issues[0].details);
});

test('ZNK: kein Sticky, tel: nur im Inhalt und Footer → Warnung', () => {
  assert.equal(checkStickyTel([{ page: 'index.html', html: ZNK }]).length, 1);
});

test('HAM: StickyMobileCTA href="tel:+39…" → keine Warnung', () => {
  assert.deepEqual(checkStickyTel([{ page: 'index.html', html: HAM }]), []);
});

test('MIKA: FloatingCallButton → keine Warnung', () => {
  assert.deepEqual(checkStickyTel([{ page: 'index.html', html: MIKA }]), []);
});

test('Site ganz ohne tel: → keine Warnung', () => {
  assert.deepEqual(checkStickyTel([{ page: 'index.html', html: OHNE_TEL }, { page: 'leistungen/index.html', html: OHNE_TEL }]), []);
});

test('tel: nur im Impressum → keine Warnung (Pflichtangabe, keine Anruf-Einladung)', () => {
  const impressum = OHNE_TEL.replace('<p>Kontakt per Formular.</p>', '<p>Telefon: <a href="tel:+49941123456">0941 123456</a></p>');
  assert.deepEqual(
    checkStickyTel([{ page: 'index.html', html: OHNE_TEL }, { page: 'impressum/index.html', html: impressum }]),
    [],
  );
});

test('stickyTel: false → keine Warnung, auch bei klarem Befund', () => {
  assert.deepEqual(checkStickyTel([{ page: 'index.html', html: GRG }], { stickyTel: false }), []);
});

test('ASG: StickyContact hideOnMobile → Warnung (fixiert, aber auf dem Handy ausgeblendet)', () => {
  assert.equal(checkStickyTel([{ page: 'index.html', html: ASG }]).length, 1);
  // Gegenprobe: dasselbe Markup ohne hideOnMobile gilt als erfüllt.
  const sichtbar = ASG.replace('sticky-contact sticky-contact--hide-mobile', 'sticky-contact');
  assert.deepEqual(checkStickyTel([{ page: 'index.html', html: sichtbar }]), []);
});

test('sticky Header mit tel: zählt als erfüllt (CSS-Regel header{position:sticky})', () => {
  const html = GRG.replace('<a href="/kontakt">Kontakt</a>', '<a href="tel:+499413993000" class="btn-accent">Anrufen</a>');
  assert.deepEqual(checkStickyTel([{ page: 'index.html', html }]), []);
});

test('Inline-Style position:fixed mit tel: zählt als erfüllt', () => {
  const html = seite('<div style="position: fixed; bottom: 0"><a href="tel:+49941123456">Anrufen</a></div>');
  assert.deepEqual(checkStickyTel([{ page: 'index.html', html }]), []);
});

test('Eigene Klasse mit <style>-Regel position:fixed zählt als erfüllt', () => {
  const html = seite('<style>.anruf-leiste{position:fixed;bottom:0}</style><div class="anruf-leiste"><a href="tel:+49941123456">Anrufen</a></div>');
  assert.deepEqual(checkStickyTel([{ page: 'index.html', html }]), []);
});

test('position:fixed nur ab Desktop-Breite (@media min-width) zählt nicht', () => {
  const html = seite('<style>@media (min-width:1024px){.desk-bar{position:fixed}}</style><div class="desk-bar"><a href="tel:+49941123456">Anrufen</a></div>');
  assert.equal(checkStickyTel([{ page: 'index.html', html }]).length, 1);
});

test('Hover-Zustand (.x:hover{position:fixed}) zählt nicht', () => {
  const html = seite('<style>.tip:hover{position:fixed}</style><div class="tip"><a href="tel:+49941123456">Anrufen</a></div>');
  assert.equal(checkStickyTel([{ page: 'index.html', html }]).length, 1);
});

test('eine Meldung pro Site, nicht pro Seite', () => {
  const issues = checkStickyTel([
    { page: 'index.html', html: ZNK },
    { page: 'filialen/index.html', html: ZNK },
    { page: 'kontakt/index.html', html: GRG },
  ]);
  assert.equal(issues.length, 1);
});

test('BLZ-Muster: Sticky-tel nur auf Unterseite, Startseite ohne → Warnung (Startseite maßgeblich)', () => {
  assert.equal(
    checkStickyTel([
      { page: 'index.html', html: GRG },
      { page: 'website-audit/index.html', html: MIKA },
    ]).length,
    1,
  );
});

test('gowohnen-Muster: Startseite ohne jede Nummer, Nummern-Seite mit fixiertem tel: → keine Warnung', () => {
  // Fehlalarm aus dem Probelauf 27.09.2026: gowohnen zeigt die Nummer nur im Exposé
  // (w/<token>/), dort in einem StickyContact. Die Startseite hat gar keine Nummer.
  assert.deepEqual(
    checkStickyTel([
      { page: 'index.html', html: OHNE_TEL },
      { page: 'w/D0TxhfrbVDJuBKH9zi2YHQ/index.html', html: MIKA },
    ]),
    [],
  );
  // Gegenprobe: dieselbe Lage, aber die Nummern-Seite ohne fixierten tel: → Warnung.
  assert.equal(
    checkStickyTel([
      { page: 'index.html', html: OHNE_TEL },
      { page: 'w/D0TxhfrbVDJuBKH9zi2YHQ/index.html', html: ZNK },
    ]).length,
    1,
  );
});

test('Impressum/Datenschutz/Danke/404 werden ignoriert, auch ohne Startseite', () => {
  assert.deepEqual(
    checkStickyTel([
      { page: 'impressum/index.html', html: ZNK },
      { page: 'datenschutz/index.html', html: ZNK },
      { page: 'danke/index.html', html: ZNK },
      { page: '404.html', html: ZNK },
    ]),
    [],
  );
});

test('telImFixiertenElement: Kernfunktion einzeln', () => {
  assert.equal(telImFixiertenElement(HAM), true);
  assert.equal(telImFixiertenElement(MIKA), true);
  assert.equal(telImFixiertenElement(GRG), false);
  assert.equal(telImFixiertenElement(ZNK), false);
  assert.equal(telImFixiertenElement(ASG), false);
});

test('tel: in <script> oder Kommentar zählt nicht', () => {
  const html = seite('<script>const x = \'<div class="floating-call"><a href="tel:+49941">x</a></div>\';</script><!-- <a class="floating-call" href="tel:+49941">x</a> -->');
  assert.equal(telImFixiertenElement(html), false);
});

test('Klassen-Rückfall ohne <style>: jede bekannte Sticky-Klasse zählt allein (externes Stylesheet)', () => {
  // Gegenprobe zur Style-Regel-Erkennung: Hier gibt es KEIN CSS im HTML, nur die
  // Klasse. Fehlt eine Klasse in der Liste, muss genau ihr Fall rot werden.
  for (const klasse of ['sticky-mobile-cta', 'floating-call', 'sticky-contact']) {
    const html = `<html><body><div class="${klasse}"><a href="tel:+499411234567">Anrufen</a></div></body></html>`;
    assert.equal(telImFixiertenElement(html), true, `Klasse ${klasse} ohne CSS`);
  }
  const ohneKlasse = '<html><body><div class="kontakt"><a href="tel:+499411234567">Anrufen</a></div></body></html>';
  assert.equal(telImFixiertenElement(ohneKlasse), false, 'Gegenprobe: unbekannte Klasse ist nicht fixiert');
});
