// @ts-check
/**
 * Elemente, die ein Block-Skript zur Laufzeit erzeugt, brauchen :global()-Styles.
 *
 * Lauf: `node --test tests/blocks/laufzeit-styles.test.js`
 *
 * ANLASS (15.10.2026, v0.173.1): Vorbestellung/Kuechenliste v0.173.0 sahen im Browser
 * ungestylt aus. Astro hängt an Template-Elemente ein `data-astro-cid-…` und schreibt die
 * Selektoren darauf um. Was `document.createElement` erzeugt, trägt das Attribut nicht —
 * scoped Styles treffen es nie. Die Render-Tests sahen nichts (sie prüfen Server-HTML), die
 * Unit-Tests auch nicht. Gefunden erst im Screenshot.
 *
 * Prüfung: Jede Klasse, die das Skript per `className = '…'` oder `el('tag', '…')` setzt, muss
 * im <style> innerhalb eines `:global(…)` vorkommen.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../..');

/** Klassen, die das Skript zur Laufzeit setzt, ohne :global()-Regel im <style>. @param {string} quelle */
export function fehlendeGlobals(quelle) {
  const skript = (quelle.match(/<script>([\s\S]*?)<\/script>/) ?? [])[1] ?? '';
  const stil = (quelle.match(/<style>([\s\S]*?)<\/style>/) ?? [])[1] ?? '';
  const klassen = new Set();
  for (const m of skript.matchAll(/className\s*=\s*['"`]([a-z0-9- ]+)/gi)) m[1].split(/\s+/).forEach((k) => klassen.add(k));
  for (const m of skript.matchAll(/\bel\(\s*['"]\w+['"]\s*,\s*[`'"]([a-z0-9- ]+)/gi)) m[1].split(/\s+/).forEach((k) => klassen.add(k));
  // `kl-karte${b.fertig ? ' kl-fertig' : ''}` — nur in Zeilen, die Klassen setzen, nicht in Texten.
  for (const zeile of skript.split('\n').filter((z) => /className|\bel\(/.test(z))) {
    for (const m of zeile.matchAll(/\$\{[^}]*\?\s*'\s*([a-z0-9-]+)'/gi)) klassen.add(m[1]);
  }
  klassen.delete('');
  const global = [...stil.matchAll(/:global\(([^)]*)\)/g)].map((m) => m[1]).join(' ');
  return [...klassen].filter((k) => !new RegExp(`\\.${k}(?![\\w-])`).test(global)).sort();
}

for (const datei of ['src/components/blocks/Vorbestellung.astro', 'src/components/blocks/Kuechenliste.astro']) {
  test(`${datei}: jede Laufzeit-Klasse hat eine :global()-Regel`, () => {
    assert.deepEqual(fehlendeGlobals(readFileSync(resolve(ROOT, datei), 'utf8')), []);
  });
}

test('Gegenprobe: scoped Regel für eine Laufzeit-Klasse wird gemeldet', () => {
  const kaputt = `<div class="x"></div>
<script>const li = document.createElement('li'); li.className = 'neu-zeile'; el('span', 'neu-preis');</script>
<style>.neu-zeile { color: red; } .x :global(.neu-preis) { color: blue; }</style>`;
  assert.deepEqual(fehlendeGlobals(kaputt), ['neu-zeile']);
});
