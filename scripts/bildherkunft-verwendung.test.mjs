import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { imBuild } from './bildherkunft-verwendung.mjs';

/**
 * `imBuild` entscheidet für `stem`-Regeln, ob ein Bild aus `src/assets/` tatsächlich
 * ausgeliefert wird. Anlass (25.08.2026): die Textsuche meldete `customer-donau-profi`
 * `stem: 'hero'` als verwendet, obwohl `src/assets/images/hero/hero.png` von keiner Seite
 * importiert wird — das Wort „hero" kommt im Code an Dutzenden Stellen vor.
 *
 * Alle drei Rückgaben werden geprüft, nicht nur die, die im Bestand gerade vorkommt:
 * `unbekannt` ließ sich an keinem echten Repo auslösen, weil alle ein `dist/` haben.
 * Ein Zustand, den man nie sieht, ist ein Zustand, den man nie geprüft hat.
 */

function tempRepo() {
  return mkdtempSync(join(tmpdir(), 'cw-imbuild-'));
}

test('ohne dist/ wird nicht geraten, sondern "unbekannt" gemeldet', (t) => {
  const repo = tempRepo();
  t.after(() => rmSync(repo, { recursive: true, force: true }));
  assert.equal(imBuild(repo, 'hero'), 'unbekannt');
});

test('leeres dist/ heisst "nein" — das Bild wird nicht ausgeliefert', (t) => {
  const repo = tempRepo();
  t.after(() => rmSync(repo, { recursive: true, force: true }));
  mkdirSync(join(repo, 'dist'));
  assert.equal(imBuild(repo, 'hero'), 'nein');
});

test('gehashter Dateiname im dist/ heisst "ja"', (t) => {
  const repo = tempRepo();
  t.after(() => rmSync(repo, { recursive: true, force: true }));
  mkdirSync(join(repo, 'dist/_astro'), { recursive: true });
  // Astro hängt einen Content-Hash an; der Stem ist der Teil vor dem ersten Punkt.
  writeFileSync(join(repo, 'dist/_astro/hero.Bng-bGX1.webp'), '');
  assert.equal(imBuild(repo, 'hero'), 'ja');
});

test('ein anderer Stem im selben dist/ zaehlt nicht — der Check ist trennscharf', (t) => {
  const repo = tempRepo();
  t.after(() => rmSync(repo, { recursive: true, force: true }));
  mkdirSync(join(repo, 'dist/_astro'), { recursive: true });
  writeFileSync(join(repo, 'dist/_astro/team.XyZ987.webp'), '');
  assert.equal(imBuild(repo, 'team'), 'ja');
  assert.equal(imBuild(repo, 'hero'), 'nein');
});

test('Nicht-Bildformate zaehlen nicht — ein hero.json ist kein ausgeliefertes Bild', (t) => {
  const repo = tempRepo();
  t.after(() => rmSync(repo, { recursive: true, force: true }));
  mkdirSync(join(repo, 'dist'), { recursive: true });
  writeFileSync(join(repo, 'dist/hero.json'), '{}');
  assert.equal(imBuild(repo, 'hero'), 'nein');
});

test('Teiltreffer zaehlen nicht — "hero-poster" ist nicht "hero"', (t) => {
  const repo = tempRepo();
  t.after(() => rmSync(repo, { recursive: true, force: true }));
  mkdirSync(join(repo, 'dist'), { recursive: true });
  writeFileSync(join(repo, 'dist/hero-poster.AbC.webp'), '');
  assert.equal(imBuild(repo, 'hero'), 'nein');
  assert.equal(imBuild(repo, 'hero-poster'), 'ja');
});
