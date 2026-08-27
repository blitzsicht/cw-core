import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ergaenzeTabellenTabindex } from './table-focusable.js';

test('einfache Tabelle bekommt tabindex', () => {
  const { html, ergaenzt } = ergaenzeTabellenTabindex('<table class="sla-table"><tr><td>x</td></tr></table>');
  assert.equal(ergaenzt, 1);
  assert.match(html, /<table tabindex="0" class="sla-table">/);
});

test('GEGENPROBE: ohne Ergänzung bleibt die Tabelle fokuslos', () => {
  // Der Zustand, den axe am 27.08.2026 als scrollable-region-focusable meldete.
  const roh = '<table><tr><td>x</td></tr></table>';
  assert.equal(/tabindex/.test(roh), false);
  assert.equal(ergaenzeTabellenTabindex(roh).ergaenzt, 1);
});

test('role="presentation" bleibt unangetastet — Layout-Tabellen dürfen nicht scrollen', () => {
  const roh = '<table role="presentation"><tr><td>Mail</td></tr></table>';
  const { html, ergaenzt } = ergaenzeTabellenTabindex(roh);
  assert.equal(ergaenzt, 0);
  assert.equal(html, roh);
});

test('vorhandenes tabindex wird nicht überschrieben', () => {
  const roh = '<table tabindex="-1"><tr><td>x</td></tr></table>';
  assert.equal(ergaenzeTabellenTabindex(roh).ergaenzt, 0);
});

test('Tabelle in einem Wrapper mit Fokus bekommt keinen zweiten Tab-Halt', () => {
  for (const klasse of ['tabelle-scroll', 'vergleich-wrapper', 'rt-wrap']) {
    const roh = `<div class="${klasse}" tabindex="0" role="region"><table><tr><td>x</td></tr></table></div>`;
    assert.equal(ergaenzeTabellenTabindex(roh).ergaenzt, 0, klasse);
  }
});

test('Wrapper mit mehreren Klassen wird erkannt', () => {
  const roh = '<div class="tdddg-table-wrap tabelle-scroll" tabindex="0">\n  <table><tr><td>x</td></tr></table>';
  assert.equal(ergaenzeTabellenTabindex(roh).ergaenzt, 0);
});

test('Wrapper OHNE Fokus-Klasse schützt nicht', () => {
  const roh = '<div class="legal-content"><table><tr><td>x</td></tr></table></div>';
  assert.equal(ergaenzeTabellenTabindex(roh).ergaenzt, 1);
});

test('"<table" als Text in JSON-LD wird nicht angefasst', () => {
  const roh = '<script type="application/ld+json">{"text":"<table> im Fließtext"}</script><table><tr><td>x</td></tr></table>';
  const { html, ergaenzt } = ergaenzeTabellenTabindex(roh);
  assert.equal(ergaenzt, 1);
  assert.match(html, /\{"text":"<table> im Fließtext"\}/);
});

test('mehrere Tabellen auf einer Seite', () => {
  const roh = '<table><tr><td>a</td></tr></table><p>x</p><table class="b"><tr><td>b</td></tr></table>';
  const { html, ergaenzt } = ergaenzeTabellenTabindex(roh);
  assert.equal(ergaenzt, 2);
  assert.equal((html.match(/tabindex="0"/g) ?? []).length, 2);
});

test('Attribute und Inhalt bleiben sonst unverändert', () => {
  const roh = '<table data-astro-cid-x id="t"><thead><tr><th>A</th></tr></thead></table>';
  const { html } = ergaenzeTabellenTabindex(roh);
  assert.equal(html, '<table tabindex="0" data-astro-cid-x id="t"><thead><tr><th>A</th></tr></thead></table>');
});

test('idempotent — zweiter Lauf ergänzt nichts mehr', () => {
  const einmal = ergaenzeTabellenTabindex('<table><tr><td>x</td></tr></table>').html;
  assert.equal(ergaenzeTabellenTabindex(einmal).ergaenzt, 0);
});
