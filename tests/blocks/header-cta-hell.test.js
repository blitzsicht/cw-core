// @ts-check
/**
 * Header.astro und CTABlock.astro — heller Grund über Token (v0.177.0).
 *
 * Lauf: `node --test tests/blocks/header-cta-hell.test.js`
 *
 * ANLASS (levia-therapiezentrum, Sprachnachricht 19.10.2026): „die erste Seite in diesem ganz
 * dunklen Grün gefällt mir gar nicht. Ich stelle mir da etwas Cremefarbenes vor.“ Der Header
 * kannte nur --color-header-bg; Schrift, Links, Hamburger und Linien waren fest weiß. Ein heller
 * Header-Grund hätte weiße Schrift auf Creme ergeben. Der CTA-Block hatte den Verlauf in der
 * Primärfarbe fest im Code.
 *
 * Geprüft wird der Quelltext der <style>-Blöcke: Jede bisher feste Farbe muss hinter einem Token
 * stehen, und der Fallback muss der alte Wert sein, damit sich ohne Token nichts ändert.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../..');

/** @param {string} datei */
function styles(datei) {
  // Der <noscript>-Stil bleibt außen vor: Er wird als Markup ausgeliefert (Byte-Vergleich in
  // opt-in-bilder.test.js) und setzt ohne JS nur die Trennlinien des aufgeklappten Menüs.
  const s = readFileSync(resolve(ROOT, datei), 'utf8').replace(/<noscript>[\s\S]*?<\/noscript>/g, '');
  return [...s.matchAll(/<style>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n')
    .replace(/\/\*[\s\S]*?\*\//g, '');
}

const HEADER = styles('src/components/layout/Header.astro');
const CTA = styles('src/components/blocks/CTABlock.astro');

/** @param {string} css @param {string} token */
function fallbacks(css, token) {
  const re = new RegExp(`var\\(${token},\\s*([^;]+?)\\)\\s*;`, 'g');
  return [...css.matchAll(re)].map((m) => m[1].trim());
}

test('Header: keine feste weiße Schrift- oder Linienfarbe mehr außerhalb eines Tokens', () => {
  const ohneVar = HEADER.replace(/var\([^;]*\)/g, 'VAR');
  assert.doesNotMatch(ohneVar, /(?:^|[\s;{])(?:color|background)\s*:\s*(?:white|#fff(?:fff)?)\s*;/im);
  assert.doesNotMatch(ohneVar, /rgba\(255,\s*255,\s*255/);
});

test('Header: --color-header-text fällt auf white zurück (Schrift, Logo, Hover, Hamburger)', () => {
  const f = fallbacks(HEADER, '--color-header-text');
  assert.ok(f.length >= 4, `nur ${f.length} Stellen`);
  assert.deepEqual([...new Set(f)], ['white']);
});

test('Header: Nav-Link, Linien und Schatten fallen auf die alten Werte zurück', () => {
  assert.deepEqual([...new Set(fallbacks(HEADER, '--color-header-link'))], ['rgba(255,255,255,0.85)']);
  assert.deepEqual([...new Set(fallbacks(HEADER, '--color-header-line'))], ['rgba(255,255,255,0.1)']);
  assert.deepEqual(fallbacks(HEADER, '--color-header-line-strong'), ['rgba(255,255,255,0.35)']);
  assert.deepEqual(fallbacks(HEADER, '--header-shadow'), ['0 1px 8px rgba(0,0,0,0.3)']);
});

test('CTABlock: --cta-bg fällt auf den bisherigen Verlauf in der Primärfarbe zurück', () => {
  const f = fallbacks(CTA, '--cta-bg');
  assert.equal(f.length, 1);
  assert.match(f[0], /^linear-gradient\(135deg, var\(--color-primary\) 0%,/);
});

test('CTABlock: Abschnitt, Überschrift und Untertext folgen --cta-text, Fallback weiß', () => {
  const f = fallbacks(CTA, '--cta-text');
  assert.equal(f.length, 3);
  for (const w of f) assert.match(w, /^(white|#ffffff)$/);
  const ohneVar = CTA.replace(/var\([^;]*\)/g, 'VAR');
  assert.doesNotMatch(ohneVar, /\.cta-(?:section|inner h2|inner p)[^}]*color:\s*(?:white|#fff)/);
});

test('Gegenprobe: der alte Header (feste weiße Schrift) wird erkannt', () => {
  const alt = 'header { background: var(--color-header-bg, var(--color-primary)); color: white; }';
  const ohneVar = alt.replace(/var\([^;]*\)/g, 'VAR');
  assert.match(ohneVar, /(?:^|[\s;{])color\s*:\s*white\s*;/im);
});
