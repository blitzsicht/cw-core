import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seitenAusSitemap, zeilenZustand, exitCode } from './kennzeichnung-urteil.mjs';

const SITEMAP = '<urlset><url><loc>https://www.haarwerker-online.de/</loc></url>' +
  '<url><loc>https://www.haarwerker-online.de/haarwerk-salon/</loc></url></urlset>';

test('seitenAusSitemap ohne basis: <loc> unverändert', () => {
  assert.deepEqual(seitenAusSitemap(SITEMAP), [
    'https://www.haarwerker-online.de/',
    'https://www.haarwerker-online.de/haarwerk-salon/',
  ]);
});

test('seitenAusSitemap mit basis: Vorschau statt Kundendomain (Review cw-site #53)', () => {
  assert.deepEqual(seitenAusSitemap(SITEMAP, { basis: 'https://customer-haarwerk-neutraubling.vercel.app' }), [
    'https://customer-haarwerk-neutraubling.vercel.app/',
    'https://customer-haarwerk-neutraubling.vercel.app/haarwerk-salon/',
  ]);
});

test('seitenAusSitemap: leere/fehlende Sitemap → []', () => {
  assert.deepEqual(seitenAusSitemap(''), []);
  assert.deepEqual(seitenAusSitemap('<html>404</html>'), []);
});

test('leere Sitemap bei vorhandener Deklaration ist NICHT grün (cw-core #132)', () => {
  // genau der haarwerk-Lauf vom 11.09.: Seiten 0/0, FEHLEND 0
  assert.equal(zeilenZustand({ regeln: 15, seiten: 0, geprueft: 0, nichtGeprueft: 0, fehlend: 0 }), 'nicht-geprueft');
});

test('alle Seiten gemessen, nichts fehlt → ok (Gegenprobe)', () => {
  assert.equal(zeilenZustand({ regeln: 15, seiten: 6, geprueft: 6, nichtGeprueft: 0, fehlend: 0 }), 'ok');
});

test('eine Seite nicht messbar → nicht geprüft', () => {
  assert.equal(zeilenZustand({ regeln: 3, seiten: 6, geprueft: 5, nichtGeprueft: 1, fehlend: 0 }), 'nicht-geprueft');
});

test('fehlendes Label schlägt „nicht geprüft“', () => {
  assert.equal(zeilenZustand({ regeln: 3, seiten: 6, geprueft: 5, nichtGeprueft: 1, fehlend: 2 }), 'fehlend');
});

test('keine Deklaration ist ein eigener Zustand', () => {
  assert.equal(zeilenZustand({ regeln: 0, seiten: 0, geprueft: 0, nichtGeprueft: 0, fehlend: 0 }), 'ohne-deklaration');
});

test('exitCode: fehlend 1 vor nicht-geprueft 2 vor ok 0', () => {
  assert.equal(exitCode(['ok', 'nicht-geprueft', 'fehlend']), 1);
  assert.equal(exitCode(['ok', 'nicht-geprueft', 'ohne-deklaration']), 2);
  assert.equal(exitCode(['ok', 'ohne-deklaration']), 0);
  assert.equal(exitCode([]), 0);
});
