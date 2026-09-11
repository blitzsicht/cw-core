// @ts-check
/**
 * Bot-Prüfung (Turnstile) und Absenden stehen im ContactForm in EINER Zeile.
 *
 * Lauf: `node --test tests/blocks/contactform-turnstile-zeile.test.js`
 *
 * ANLASS (11.09.2026, customer-haarwerk-neutraubling): Das Turnstile-Widget stand
 * links, der Absenden-Knopf eine Etage tiefer rechts — rund 100px Höhe für nichts,
 * und der Knopf wirkt vom Formular abgerissen. Der Operator nannte es „unser
 * Klassiker": customer-platzfrei hatte dasselbe schon per Grid-Override in
 * `WaitlistSection.astro` repariert und dort notiert, dass es nach oben gehört.
 *
 * Ursache: `.cf-turnstile` und `.form-submit` waren zwei Geschwister eines
 * `flex-direction: column`-Formulars. Keine CSS-Regel auf einem der beiden allein
 * kann sie nebeneinanderstellen — dafür braucht es einen gemeinsamen Elternteil.
 * Genau das prüft dieser Test: beide liegen in `.form-actions`, und dieser
 * Container ordnet sie als Zeile an.
 *
 * Geprüft wird die Struktur (Tag-Verschachtelung), nicht das Vorkommen der
 * Klassennamen — `cf-turnstile` steht auch im Lazy-Load-Skript der Komponente,
 * ein `includes()` wäre immer grün.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const QUELLE = resolve(import.meta.dirname, '../../src/components/forms/ContactForm.astro');
const src = readFileSync(QUELLE, 'utf-8');

/**
 * Liefert den Quelltext des Elements, das mit `<div class="<klasse>"` beginnt,
 * bis zu seinem schließenden `</div>` (zählt verschachtelte divs mit).
 * @param {string} text
 * @param {string} klasse
 */
function elementMitKlasse(text, klasse) {
  const start = text.search(new RegExp(`<div\\b[^>]*class="(?:[^"]*\\s)?${klasse}(?:\\s[^"]*)?"`));
  if (start === -1) return null;
  const tags = /<div\b|<\/div>/g;
  tags.lastIndex = start;
  let tiefe = 0;
  for (let m = tags.exec(text); m; m = tags.exec(text)) {
    tiefe += m[0] === '</div>' ? -1 : 1;
    if (tiefe === 0) return text.slice(start, m.index + m[0].length);
  }
  return null;
}

/** Nur das Template (vor <script>/<style>), damit Kommentare im Skript nicht zählen. */
const template = src.slice(0, src.search(/<script\b|<style\b/));

test('Turnstile-Widget und Absenden-Knopf haben einen gemeinsamen Container .form-actions', () => {
  const aktionen = elementMitKlasse(template, 'form-actions');
  assert.ok(aktionen, 'kein <div class="form-actions"> im Template');
  assert.match(aktionen, /<div\b[^>]*class="cf-turnstile"/, 'das Turnstile-Widget liegt nicht in .form-actions');
  assert.match(aktionen, /<button\b[^>]*type="submit"/, 'der Absenden-Knopf liegt nicht in .form-actions');
});

test('.form-actions ordnet als Zeile an, Absenden bleibt rechts', () => {
  const regel = /\.form-actions\s*\{([^}]*)\}/.exec(src);
  assert.ok(regel, 'keine CSS-Regel für .form-actions');
  assert.match(regel[1], /display:\s*flex/, '.form-actions ist kein Flex-Container');
  assert.doesNotMatch(regel[1], /flex-direction:\s*column/, '.form-actions stapelt untereinander');
  assert.match(regel[1], /justify-content:\s*flex-end/, 'Absenden steht nicht rechts (UX-Konvention „Vorwärts nach rechts")');
});

test('es gibt genau ein Turnstile-Widget im Template', () => {
  const widgets = template.match(/<div\b[^>]*class="cf-turnstile"/g) ?? [];
  assert.equal(widgets.length, 1);
});
