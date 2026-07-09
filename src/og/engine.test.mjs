// Logik-Test der OG-Studio-v3-Engine + Templates.
// Läuft mit `node --test` (peerDeps satori + sharp müssen installiert sein).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { renderOg, cta, proof, hero } from './index.mjs';

const require = createRequire(import.meta.url);
const sharp = require('sharp');

const MOCK_SITE = {
  domain: 'blitzsicht.com',
  performance: 100, accessibility: 100, best_practices: 100, seo_score: 100,
  fetched_at: '2026-07-09T00:00:45.878Z',
};

test('cta: rendert 1200×630 PNG unter 300 KB', async () => {
  const { buffer, ext, width, height, bytes } = await renderOg(
    cta({ claim: 'Ihr Elektriker in Regensburg.', eyebrow: 'ELEKTRO MÜLLER · REGENSBURG',
      subline: 'Schnell erreichbar · Festpreis · Meisterbetrieb', domain: 'elektro-mueller.de', rating: '4,9' }),
  );
  assert.equal(width, 1200);
  assert.equal(height, 630);
  assert.equal(ext, 'png');
  assert.ok(bytes < 300 * 1024, `zu groß: ${bytes} bytes`);
  const meta = await sharp(buffer).metadata();
  assert.equal(meta.width, 1200);
  assert.equal(meta.height, 630);
  assert.equal(meta.format, 'png');
});

test('proof: rendert mit Live-Scores', async () => {
  const { buffer, width, height } = await renderOg(proof({ site: MOCK_SITE }));
  const meta = await sharp(buffer).metadata();
  assert.equal(meta.width, 1200);
  assert.equal(meta.height, 630);
  assert.ok(buffer.length > 1000);
});

test('proof: deterministisch bei gleichem Input', async () => {
  const a = await renderOg(proof({ site: MOCK_SITE }));
  const b = await renderOg(proof({ site: MOCK_SITE }));
  assert.ok(a.buffer.equals(b.buffer), 'zwei identische Renders müssen byte-gleich sein');
});

test('proof: unvollständige Scores → Fehler (Negativ-Test)', () => {
  assert.throws(() => proof({ site: { domain: 'x.de', performance: 90 } }), /unvollständige Scores/);
});

test('cta: fehlender claim → Fehler', () => {
  assert.throws(() => cta({}), /claim.*erforderlich/);
});

test('hero: fehlendes Foto → Fehler', () => {
  assert.throws(() => hero({ claim: 'Test' }), /photo.*erforderlich/);
});

test('hero: mit Foto rendert JPG-Fallback bei Fotolast', async () => {
  // 1200×630 rotes JPG als Pseudo-Foto (satori braucht Bytes; Inhalt egal).
  const photo = await sharp({ create: { width: 1200, height: 630, channels: 3, background: { r: 40, g: 60, b: 90 } } })
    .jpeg().toBuffer();
  const { buffer, ext } = await renderOg(hero({ photo, photoMime: 'image/jpeg', claim: 'Ihr Malerbetrieb in Regensburg.', domain: 'maler.de', rating: '4,8' }));
  const meta = await sharp(buffer).metadata();
  assert.equal(meta.width, 1200);
  assert.equal(meta.height, 630);
  assert.ok(['png', 'jpg'].includes(ext));
});
