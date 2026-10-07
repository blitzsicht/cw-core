/**
 * checks/seiten-dist.mjs — Rückfall der Audits ohne Sitemap (Anlass gowohnen 07.10.2026).
 * Lauf: node --test tests/checks-seiten-dist.test.js
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { seitenAusDist } from '../checks/seiten-dist.mjs';

function baue(dateien) {
  const d = mkdtempSync(join(tmpdir(), 'seiten-dist-'));
  for (const f of dateien) {
    mkdirSync(join(d, f, '..'), { recursive: true });
    writeFileSync(join(d, f), '<html></html>');
  }
  return d;
}

test('jede index.html wird eine Route, auch tief verschachtelte', () => {
  const d = baue(['index.html', 'impressum/index.html', 'w/abc123/index.html', 'w/abc123/impressum/index.html']);
  assert.deepEqual(seitenAusDist(d), ['/', '/impressum/', '/w/abc123/', '/w/abc123/impressum/']);
  rmSync(d, { recursive: true });
});

test('_astro, Punkt-Verzeichnisse, 404 und andere Dateien zählen nicht', () => {
  const d = baue(['index.html', '_astro/index.html', '.vercel/index.html', '404/index.html', '404.html', 'robots.txt', 'email/install.css']);
  assert.deepEqual(seitenAusDist(d), ['/']);
  rmSync(d, { recursive: true });
});

test('fehlendes oder leeres Verzeichnis ergibt eine leere Liste, kein Wurf', () => {
  assert.deepEqual(seitenAusDist(join(tmpdir(), 'gibt-es-nicht-' + Date.now())), []);
  const d = baue([]);
  assert.deepEqual(seitenAusDist(d), []);
  rmSync(d, { recursive: true });
});

test('Gegenprobe: der alte Kern hätte die Exposé-Route nicht enthalten', () => {
  const KERN = ['/', '/kontakt/'];
  const d = baue(['index.html', 'w/abc123/index.html']);
  const routen = seitenAusDist(d);
  assert.ok(routen.includes('/w/abc123/'));
  assert.ok(!KERN.includes('/w/abc123/'));
  rmSync(d, { recursive: true });
});
