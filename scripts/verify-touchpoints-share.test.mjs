// @ts-check
/**
 * verify-touchpoints: Teilen-Links (EmpfehlungSection) sind kein Kontaktweg.
 *
 * Lauf: `node --test scripts/verify-touchpoints-share.test.mjs`
 *
 * `mailto:?subject=…` hat bewusst keine Adresse (der Besucher wählt den Empfänger),
 * `https://wa.me/?text=…` bewusst keine Nummer. Ohne Ausnahme meldete der Audit beide
 * hart („leere mailto:", „WhatsApp-Link ohne erkennbare Nummer") und jedes Kundenrepo
 * mit Empfehlungsseite fiele im CI durch.
 *
 * Die Ausnahme ist eng: nur mit Marker `data-referral-share` UND nur in der
 * Teilen-Form (keine Adresse bzw. keine Nummer). Ein versehentlich leerer mailto
 * ohne Marker bleibt ein Befund — das zeigen die Gegenproben.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { auditHtml } from './verify-touchpoints.mjs';

const SSOT = { phones: new Set(['4994112345']), emails: new Set(['info@kunde.de']) };

test('Teilen-Links mit Marker: kein Befund', () => {
  const html = `
    <a href="https://wa.me/?text=Hallo%20https%3A%2F%2Fkunde.de" data-referral-share="whatsapp" target="_blank">W</a>
    <a data-referral-share="mail" href="mailto:?subject=Empfehlung&amp;body=Hallo">M</a>`;
  assert.deepEqual(auditHtml(html, SSOT), []);
});

test('Gegenprobe: leerer mailto OHNE Marker bleibt ein Befund', () => {
  const befunde = auditHtml('<a href="mailto:?subject=x">M</a>', SSOT);
  assert.equal(befunde.length, 1);
  assert.match(befunde[0].problem, /leere mailto/);
});

test('Gegenprobe: wa.me ohne Nummer OHNE Marker bleibt ein Befund', () => {
  const befunde = auditHtml('<a href="https://wa.me/?text=x">W</a>', SSOT);
  assert.equal(befunde.length, 1);
  assert.match(befunde[0].problem, /ohne erkennbare Nummer/);
});

test('Gegenprobe: Marker an einem mailto MIT fremder Adresse schützt nicht', () => {
  const befunde = auditHtml('<a data-referral-share="mail" href="mailto:fremd@example.org?subject=x">M</a>', SSOT);
  assert.equal(befunde.length, 1);
  assert.match(befunde[0].problem, /SSOT/);
});

test('Gegenprobe: Marker an einem wa.me MIT fremder Nummer schützt nicht', () => {
  const befunde = auditHtml('<a data-referral-share="whatsapp" href="https://wa.me/4917600000000">W</a>', SSOT);
  assert.equal(befunde.length, 1);
  assert.match(befunde[0].problem, /WhatsApp-Nummer nicht im SSOT/);
});

test('Gegenprobe: Marker am Nachbar-Element schützt den Link daneben nicht', () => {
  const html = '<span data-referral-share="mail"></span><a href="mailto:?subject=x">M</a>';
  assert.equal(auditHtml(html, SSOT).length, 1);
});
