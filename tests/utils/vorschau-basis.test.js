import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { vorschauBasis, fremderOgHost, seitenMitFremdemOgHost } from '../../src/utils/vorschau-basis.js';

// Werte aus dem echten Fall (cw-core#175, LeVia 19.10.2026).
const LEVIA_VORSCHAU = { VERCEL: '1', VERCEL_ENV: 'production', VERCEL_PROJECT_PRODUCTION_URL: 'customer-levia-therapiezentrum.vercel.app' };
const og = (url) => `<head><meta property="og:image" content="${url}" /></head>`;

// --- vorschauBasis: wann ist ein Build eine Vorschau? ------------------------

test('vorschauBasis: LeVia-Vorschau liefert den vercel.app-Host, nicht die Kundendomain', () => {
  assert.equal(vorschauBasis(LEVIA_VORSCHAU), 'https://customer-levia-therapiezentrum.vercel.app');
});

test('vorschauBasis: lokaler Build ohne Vercel-Variablen bleibt bei der Kundendomain', () => {
  assert.equal(vorschauBasis({}), null);
  assert.equal(vorschauBasis({ VERCEL_PROJECT_PRODUCTION_URL: 'customer-x.vercel.app' }), null);
});

test('vorschauBasis: Live-Kunde mit eigener Domain am Projekt wird nicht umgestellt', () => {
  assert.equal(vorschauBasis({ VERCEL: '1', VERCEL_ENV: 'production', VERCEL_PROJECT_PRODUCTION_URL: 'blitzsicht.com' }), null);
  assert.equal(vorschauBasis({ VERCEL: '1', VERCEL_PROJECT_PRODUCTION_URL: 'www.baeckereizink.de' }), null);
});

test('vorschauBasis: Branch-Deploy einer Vorschau zeigt auf den Produktions-Host der Vorschau', () => {
  assert.equal(
    vorschauBasis({ ...LEVIA_VORSCHAU, VERCEL_ENV: 'preview' }),
    'https://customer-levia-therapiezentrum.vercel.app',
  );
});

test('vorschauBasis: leere oder fehlende Variable ist keine Vorschau', () => {
  assert.equal(vorschauBasis({ VERCEL: '1', VERCEL_PROJECT_PRODUCTION_URL: '' }), null);
  assert.equal(vorschauBasis({ VERCEL: '1' }), null);
});

test('vorschauBasis: Schema und Schrägstrich in der Variable werden nicht verdoppelt', () => {
  assert.equal(
    vorschauBasis({ VERCEL: '1', VERCEL_PROJECT_PRODUCTION_URL: 'https://customer-x.vercel.app/' }),
    'https://customer-x.vercel.app',
  );
});

test('vorschauBasis: eine Domain, die nur "vercel.app" enthält, ist keine Vorschau', () => {
  assert.equal(vorschauBasis({ VERCEL: '1', VERCEL_PROJECT_PRODUCTION_URL: 'vercel.app.example.de' }), null);
});

// --- fremderOgHost: die Prüfung für die Build-Warnung ------------------------

test('fremderOgHost: der echte Fehler vom 19.10. wird erkannt', () => {
  const basis = vorschauBasis(LEVIA_VORSCHAU);
  assert.equal(fremderOgHost(og('https://levia-therapiezentrum.de/og/seite-home.jpg'), basis), 'levia-therapiezentrum.de');
});

test('fremderOgHost: og:image auf dem Vorschau-Host ist in Ordnung', () => {
  const basis = vorschauBasis(LEVIA_VORSCHAU);
  assert.equal(fremderOgHost(og('https://customer-levia-therapiezentrum.vercel.app/og/seite-home.jpg'), basis), null);
});

test('fremderOgHost: Seite ohne og:image oder mit relativem Wert ist kein Treffer', () => {
  const basis = 'https://customer-x.vercel.app';
  assert.equal(fremderOgHost('<head></head>', basis), null);
  assert.equal(fremderOgHost(og('/og/seite-home.jpg'), basis), null);
});

test('seitenMitFremdemOgHost: findet die betroffene Unterseite im dist', async () => {
  const dist = await mkdtemp(join(tmpdir(), 'vorschau-basis-'));
  await mkdir(join(dist, 'leistungen'), { recursive: true });
  await writeFile(join(dist, 'index.html'), og('https://customer-x.vercel.app/og/seite-home.jpg'));
  await writeFile(join(dist, 'leistungen', 'index.html'), og('https://x.de/og/seite-leistungen.jpg'));
  const treffer = await seitenMitFremdemOgHost(dist, 'https://customer-x.vercel.app');
  assert.deepEqual(treffer, [{ seite: '/leistungen/index.html', host: 'x.de' }]);
});
