// @ts-check
/**
 * cta-icon.js — Symbol am CTA nach Link-Ziel. Lauf: `node --test tests/utils/cta-icon.test.js`
 * Anlass: Hero zeigte bei „Anrufen: …" (tel:) einen Briefumschlag (LeVia-Scaffold 07.10.2026).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ctaIcon, TELEFON_PFAD, BRIEF_PFAD, BRIEF_LINIE } from '../../src/utils/cta-icon.js';

test('tel: → Telefon, kein Umschlag', () => {
  const i = ctaIcon('tel:+499405957438');
  assert.equal(i.art, 'telefon');
  assert.deepEqual(i.pfade, [TELEFON_PFAD]);
  assert.deepEqual(i.linien, []);
  assert.ok(!i.pfade.includes(BRIEF_PFAD), 'Gegenprobe: tel: darf keinen Umschlag tragen');
});

test('TEL: in Großbuchstaben und mit führendem Leerzeichen → Telefon', () => {
  assert.equal(ctaIcon('TEL:0941123').art, 'telefon');
  assert.equal(ctaIcon(' tel:0941123').art, 'telefon');
});

test('mailto: → Umschlag', () => {
  const i = ctaIcon('mailto:verwaltung@example.de');
  assert.equal(i.art, 'brief');
  assert.deepEqual(i.pfade, [BRIEF_PFAD]);
  assert.deepEqual(i.linien, [BRIEF_LINIE]);
});

test('Seiten, Anker, externe Links → Umschlag wie bisher (keine sichtbare Änderung)', () => {
  for (const href of ['/kontakt', '/kontakt/', '#warteliste', '/website-audit', 'https://www.google.com/maps/dir/?api=1']) {
    assert.equal(ctaIcon(href).art, 'brief', href);
  }
});

test('fehlendes href → Umschlag, kein Absturz', () => {
  assert.equal(ctaIcon(undefined).art, 'brief');
  assert.equal(ctaIcon(null).art, 'brief');
  assert.equal(ctaIcon('').art, 'brief');
});

test('„tel" nur im Pfad ist kein Anruf', () => {
  assert.equal(ctaIcon('/hotel-telefon').art, 'brief');
});
