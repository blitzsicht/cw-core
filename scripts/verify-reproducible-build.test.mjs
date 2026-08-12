/**
 * Tests für `scripts/verify-reproducible-build.mjs`.
 *
 * Der teure Teil (zweimal bauen) ist nicht der interessante. Interessant ist,
 * ob der Vergleich einen Unterschied auch meldet — und ob er den Fall
 * „nichts gebaut" nicht als grün durchgehen lässt.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  hashTree,
  diffTrees,
  firstTextDifference,
  firstDifferingColumn,
  parseArgs,
  assertOwnCacheDir,
} from './verify-reproducible-build.mjs';

/** @param {Record<string, string>} files */
function tree(files) {
  const dir = mkdtempSync(join(tmpdir(), 'cw-repro-'));
  for (const [path, content] of Object.entries(files)) {
    const full = join(dir, path);
    mkdirSync(join(full, '..'), { recursive: true });
    writeFileSync(full, content);
  }
  return dir;
}

test('gleiche Bäume liefern keinen Befund', () => {
  const a = tree({ 'index.html': '<h1>x</h1>', 'sub/page.html': 'y' });
  const b = tree({ 'index.html': '<h1>x</h1>', 'sub/page.html': 'y' });
  const { findings, identical } = diffTrees(hashTree(a), hashTree(b));
  assert.deepEqual(findings, []);
  assert.equal(identical, 2, 'Vorbedingung: es wurden überhaupt Dateien verglichen');
});

test('andere Bytes bei gleichem Pfad sind ein Befund', () => {
  // Der echte Fall: dieselbe Seite, eine andere Zufalls-ID darin.
  const a = tree({ 'motion/index.html': '<div id="stg-uouxmog">' });
  const b = tree({ 'motion/index.html': '<div id="stg-wdouyml">' });
  const { findings, identical } = diffTrees(hashTree(a), hashTree(b));
  assert.equal(identical, 0);
  assert.deepEqual(findings, [{ path: 'motion/index.html', kind: 'andere-bytes' }]);
});

test('fehlende Datei wird je Seite eigen benannt', () => {
  const a = tree({ 'da.html': 'x', 'nur-a.html': 'x' });
  const b = tree({ 'da.html': 'x', 'nur-b.html': 'x' });
  const { findings } = diffTrees(hashTree(a), hashTree(b));
  assert.deepEqual(findings, [
    { path: 'nur-a.html', kind: 'nur-in-a' },
    { path: 'nur-b.html', kind: 'nur-in-b' },
  ]);
});

test('Astro-Cache-Reste des kalten Laufs zählen nicht als Befund', () => {
  // Gemessen 11.08.2026: der erste Build auf einer frischen Maschine legt
  // settings.json/data-store.json im outDir ab, spätere nicht mehr. Als Befund
  // gewertet wäre jeder erste Lauf rot.
  const a = tree({ 'index.html': 'x', 'settings.json': '{}', 'data-store.json': '[]' });
  const b = tree({ 'index.html': 'x' });
  const { findings, coldCacheOnly, identical } = diffTrees(hashTree(a), hashTree(b));
  assert.deepEqual(findings, []);
  assert.equal(identical, 1);
  assert.deepEqual(coldCacheOnly.sort(), ['data-store.json', 'settings.json']);
});

test('ein Cache-Rest in einem Unterverzeichnis ist sehr wohl ein Befund', () => {
  // Die Ausnahme gilt nur an der Wurzel. Sonst wäre sie ein Loch.
  const a = tree({ 'unter/settings.json': '{}' });
  const b = tree({});
  const { findings } = diffTrees(hashTree(a), hashTree(b));
  assert.deepEqual(findings, [{ path: 'unter/settings.json', kind: 'nur-in-a' }]);
});

test('zwei leere Bäume beweisen nichts', () => {
  // identical === 0 und keine Befunde: main() macht daraus NICHT GEPRÜFT.
  const { findings, identical } = diffTrees(hashTree(tree({})), hashTree(tree({})));
  assert.deepEqual(findings, []);
  assert.equal(identical, 0);
});

test('firstTextDifference zeigt Zeile und Spalte', () => {
  const a = tree({ 'x.html': 'gleich\n<div id="stg-aaaaaaa">\n' });
  const b = tree({ 'x.html': 'gleich\n<div id="stg-bbbbbbb">\n' });
  const detail = firstTextDifference(join(a, 'x.html'), join(b, 'x.html'));
  assert.match(detail ?? '', /Zeile 2/);
  assert.match(detail ?? '', /stg-aaaaaaa/);
  assert.match(detail ?? '', /stg-bbbbbbb/);
});

test('firstTextDifference schweigt bei Binärdateien', () => {
  const a = tree({ 'x.png': '\u0000\u0001A' });
  const b = tree({ 'x.png': '\u0000\u0001B' });
  assert.equal(firstTextDifference(join(a, 'x.png'), join(b, 'x.png')), null);
});

test('firstDifferingColumn zählt ab 0 und verträgt Präfixe', () => {
  assert.equal(firstDifferingColumn('abc', 'abd'), 2);
  assert.equal(firstDifferingColumn('ab', 'abcd'), 2);
  assert.equal(firstDifferingColumn('', ''), 0);
});

test('hashTree ignoriert Verzeichnisse und liefert relative Pfade', () => {
  const dir = tree({ 'a/b/c.html': 'x' });
  const map = hashTree(dir);
  assert.deepEqual([...map.keys()], ['a/b/c.html']);
});

test('hashTree wirft nicht bei fehlendem Verzeichnis', () => {
  assert.equal(hashTree('/gibt/es/nicht/xyz').size, 0);
});

test('parseArgs kennt --root, sonst cwd', () => {
  assert.equal(parseArgs(['--root', '/tmp']).root, '/tmp');
  assert.equal(parseArgs([]).root, process.cwd());
});

test('assertOwnCacheDir lässt nur den eigenen Cache-Pfad durch', () => {
  // Die Zeile daneben ist rmSync(recursive, force). Sie darf nie etwas anderes
  // treffen als das, was dieses Script selbst angelegt hat.
  const ok = join('/repo', 'node_modules', '.cache', 'cw-core-repro');
  assert.equal(assertOwnCacheDir(ok), ok);
  for (const boese of ['', '/', '/repo/dist', join('/repo', 'node_modules')]) {
    assert.throws(() => assertOwnCacheDir(boese), /Weigere mich/, `durchgelassen: ${boese}`);
  }
});
