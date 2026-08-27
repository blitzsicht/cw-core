import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leseSeite, kappe } from './og-pages.js';

// Die Extraktion ist der Teil, an dem die Automatik still scheitern kann: findet sie
// Titel oder Foto nicht, rendert sie das Falsche, ohne dass jemand etwas merkt.
// Deshalb liegt der Testschwerpunkt hier — inklusive der Fälle aus echtem Build-HTML.

test('Titel wird am Site-Namen gekappt', () => {
  const h = '<title>Softwareentwicklung &amp; Odoo-ERP aus Regensburg | Blitzsicht</title>';
  assert.equal(leseSeite(h).titel, 'Softwareentwicklung & Odoo-ERP aus Regensburg');
});

test('Gedankenstrich trennt genauso wie der Pipe', () => {
  assert.equal(leseSeite('<title>Referenzen – Websites für Handwerk</title>').titel, 'Referenzen');
});

test('Ein Bindestrich IM Wort trennt nicht', () => {
  // Regressionsschutz: /^\s+[|–]\s+/ verlangt Leerzeichen — "Odoo-ERP" bleibt heil.
  assert.equal(leseSeite('<title>Odoo-ERP und Software-Entwicklung</title>').titel,
    'Odoo-ERP und Software-Entwicklung');
});

test('Hero-Foto wird aus dem Inline-Style gelesen, samt Overlay davor', () => {
  const h = `<section class="page-hero" style="background: linear-gradient(rgba(29,30,59,0.85), rgba(29,30,59,0.85)), url('/images/hero/software.webp') center/cover no-repeat;" data-astro-cid-52m2oiq2>`;
  assert.equal(leseSeite(h).foto, '/images/hero/software.webp');
});

test('HTML-kodierte Anführungszeichen im Style werden aufgelöst', () => {
  // Astro schreibt url(&#39;…&#39;) — ohne Entity-Auflösung fände der Regex nichts.
  const h = `<section class="page-hero" style="background: url(&#39;/images/hero/forschung.webp&#39;) center/cover;">`;
  assert.equal(leseSeite(h).foto, '/images/hero/forschung.webp');
});

test('Seite ohne Hero-Foto liefert null — dann greift das cta-Template', () => {
  const h = '<title>Impressum</title><section class="page-hero">';
  const r = leseSeite(h);
  assert.equal(r.foto, null);
  assert.equal(r.titel, 'Impressum');
});

test('bisheriges og:image wird erkannt (Grundlage des Geteilt-Zählers)', () => {
  const h = '<meta property="og:image" content="https://blitzsicht.com/og/default.png">';
  assert.equal(leseSeite(h).ogImage, 'https://blitzsicht.com/og/default.png');
});

test('leeres HTML kippt nicht, sondern liefert leere Werte', () => {
  const r = leseSeite('');
  assert.equal(r.titel, '');
  assert.equal(r.foto, null);
  assert.equal(r.ogImage, '');
});

test('Umlaut-Entities in Titel und Beschreibung werden aufgelöst', () => {
  const h = '<title>F&amp;E bei Blitzsicht</title>'
    + '<meta name="description" content="Zwei Vorhaben wurden bescheinigt &amp; geprüft">';
  const r = leseSeite(h);
  assert.equal(r.titel, 'F&E bei Blitzsicht');
  assert.equal(r.desc, 'Zwei Vorhaben wurden bescheinigt & geprüft');
});

test('GEGENPROBE: ein externes Hero-Foto wird nicht als lokaler Pfad gelesen', () => {
  // http(s)-Quellen kann der Renderer nicht vom Dateisystem laden; die Integration
  // faellt dann bewusst auf cta zurueck statt mit ENOENT zu scheitern.
  const h = `<section class="page-hero" style="background: url('https://cdn.example/x.jpg') center/cover;">`;
  assert.equal(leseSeite(h).foto, 'https://cdn.example/x.jpg');
  assert.ok(/^https?:/i.test(leseSeite(h).foto));
});

test('Subline endet an der Wortgrenze, nicht mitten im Wort', () => {
  const lang = 'Zwei Entwicklungsvorhaben von Blitzsicht sind von der Bescheinigungsstelle Forschungszulage als Forschung bescheinigt worden';
  const k = kappe(lang, 96);
  assert.ok(k.length <= 97, `zu lang: ${k.length}`);
  assert.ok(k.endsWith('…'), 'kein Auslassungszeichen');
  assert.ok(!/\s…$/.test(k), 'Leerzeichen vor dem Auslassungszeichen');
  // Der belegte Fehlerfall: vorher endete es auf "Forschungszulage als"
  assert.ok(!k.endsWith('als…'), 'endet weiterhin auf einem angefangenen Satz');
});

test('kurzer Text bleibt unangetastet — kein Auslassungszeichen', () => {
  assert.equal(kappe('Kurz und knapp', 96), 'Kurz und knapp');
});

test('ein einzelnes ueberlanges Wort wird hart geschnitten', () => {
  const wort = 'A'.repeat(200);
  const k = kappe(wort, 20);
  assert.equal(k.length, 21);
  assert.ok(k.endsWith('…'));
});
