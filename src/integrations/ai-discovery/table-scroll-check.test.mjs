import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkTableScroll, hatTabellenSchutz, zaehleInhaltsTabellen } from './table-scroll-check.js';

// Beide CSS-Schnipsel sind wörtlich aus einem echten Astro-Build entnommen
// (customer-blitzsicht, inlineStylesheets: 'always'), nicht nachgebaut — sonst
// prüfte der Test eine Minifizierung, die es so nie gibt.
const REGEL =
  ':where(table:not([role=presentation])){-webkit-overflow-scrolling:touch;max-width:100%;display:block;overflow-x:auto}';
const UTILITY = '.tabelle-scroll{-webkit-overflow-scrolling:touch;overflow-x:auto}';
const TABELLE = '<table class="sla-table"><thead><tr><th>Priorität</th></tr></thead></table>';

test('Seite ohne Tabelle wird nicht gemeldet', () => {
  assert.deepEqual(checkTableScroll([{ page: '/kontakt/', html: '<p>ohne Tabelle</p>' }]), []);
});

test('GEGENPROBE: Seite wie vor dem Fix — Tabelle, kein Schutz — wird gemeldet', () => {
  // Das ist der Zustand, den /agb/sla am 27.08.2026 auslieferte: eine Tabelle,
  // und im ganzen inlined CSS keine Regel, die sie schmalen Viewports gewachsen
  // macht. Wird dieser Fall grün, prüft der Guard nichts.
  const issues = checkTableScroll([
    { page: '/agb/sla/', html: `<style>.sla-table{width:100%;border-collapse:collapse}</style>${TABELLE}` },
  ]);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].type, 'table_without_scroll_rule');
  assert.equal(issues[0].page, '/agb/sla/');
  assert.match(issues[0].detail, /^1 Tabelle/);
});

test('globale Regel aus tokens-base.css genügt', () => {
  assert.deepEqual(checkTableScroll([{ page: '/agb/sla/', html: `<style>${REGEL}</style>${TABELLE}` }]), []);
});

test('Utility .tabelle-scroll allein genügt ebenfalls', () => {
  assert.deepEqual(checkTableScroll([{ page: '/datenschutz/', html: `<style>${UTILITY}</style>${TABELLE}` }]), []);
});

test('Regel ohne overflow-x zählt nicht als Schutz', () => {
  const html = `<style>:where(table:not([role=presentation])){max-width:100%}</style>${TABELLE}`;
  assert.equal(checkTableScroll([{ page: '/x/', html }]).length, 1);
});

test('role="presentation" ist eine Layout-Tabelle und löst nichts aus', () => {
  const html = '<table role="presentation"><tr><td>Mail-Layout</td></tr></table>';
  assert.equal(zaehleInhaltsTabellen(html), 0);
  assert.deepEqual(checkTableScroll([{ page: '/mail/', html }]), []);
});

test('gemischt: Layout-Tabelle plus Inhaltstabelle zählt nur die Inhaltstabelle', () => {
  const html = `<table role='presentation'><tr><td>x</td></tr></table>${TABELLE}`;
  assert.equal(zaehleInhaltsTabellen(html), 1);
});

test('Anzahl steht in der Meldung', () => {
  const issues = checkTableScroll([{ page: '/agb/onboarding/', html: TABELLE.repeat(9) }]);
  assert.match(issues[0].detail, /^9 Tabelle\(n\)/);
});

test('hatTabellenSchutz ist unempfindlich gegen Anführungszeichen im Attributselektor', () => {
  assert.equal(hatTabellenSchutz(':where(table:not([role="presentation"])){display:block;overflow-x:auto}'), true);
  assert.equal(hatTabellenSchutz(":where(table:not([role='presentation'])){display:block;overflow-x:auto}"), true);
});

test('mehrere Seiten: nur die ungeschützte wird gemeldet', () => {
  const issues = checkTableScroll([
    { page: '/a/', html: `<style>${REGEL}</style>${TABELLE}` },
    { page: '/b/', html: TABELLE },
    { page: '/c/', html: '<p>nichts</p>' },
  ]);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].page, '/b/');
});
