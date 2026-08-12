/**
 * Tests für `src/utils/text/split-text-units.js`.
 *
 * Die Funktion ersetzt eine Zerlegung, die bis 11.08.2026 im Browser lief
 * (blitzsicht-ops#650). Sie fasst gerendertes HTML an, ohne es zu escapen —
 * deshalb liegt der Schwerpunkt der Fälle auf dem, was sie NICHT anfassen darf:
 * Markup, Attributwerte, Entities.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  splitTextUnits,
  splitSegment,
  findTagEnd,
  formatDelay,
} from '../../src/utils/text/split-text-units.js';

const WORD = { split: /** @type {const} */ ('word'), start: 0, delay: 0.04 };

test('zerlegt Wörter und staffelt die Verzögerung', () => {
  const out = splitTextUnits('Hallo Welt', WORD);
  assert.equal(
    out,
    '<span data-motion-text-unit style="transition-delay:0s">Hallo</span>' +
      ' ' +
      '<span data-motion-text-unit style="transition-delay:0.04s">Welt</span>',
  );
});

test('leerer Slot bleibt leer', () => {
  assert.equal(splitTextUnits('', WORD), '');
});

test('Whitespace bleibt roher Text und bekommt keinen Span', () => {
  // Sonst wären die Wortabstände inline-block und der Umbruch bräche falsch.
  const out = splitTextUnits('a  b', WORD);
  assert.match(out, />a<\/span>  <span/);
  assert.equal(count(out, '<span'), 2);
});

test('führender und abschliessender Whitespace bleibt erhalten', () => {
  const out = splitTextUnits('\n  Wort\n', WORD);
  assert.ok(out.startsWith('\n  '), `Anfang verloren: ${JSON.stringify(out.slice(0, 8))}`);
  assert.ok(out.endsWith('\n'), `Ende verloren: ${JSON.stringify(out.slice(-8))}`);
  assert.equal(count(out, '<span'), 1);
});

test('<br> bleibt unangetastet, der Zähler läuft darüber hinweg', () => {
  const out = splitTextUnits('eins<br>zwei', WORD);
  assert.ok(out.includes('<br>'), 'br verschluckt');
  assert.match(out, /transition-delay:0s">eins<\/span><br>/);
  assert.match(out, /transition-delay:0.04s">zwei<\/span>/);
});

test('verschachteltes Inline-Markup bleibt stehen, sein Text wird zerlegt', () => {
  const out = splitTextUnits('a <strong>b c</strong> d', WORD);
  assert.ok(out.includes('<strong>'), 'strong verschluckt');
  assert.ok(out.includes('</strong>'), 'strong nicht geschlossen');
  assert.equal(count(out, 'data-motion-text-unit'), 4);
  // Zähler läuft über Elementgrenzen hinweg weiter, nicht pro Textknoten neu.
  assert.match(out, /transition-delay:0.12s">d<\/span>/);
});

test('> in einem Attributwert beendet das Tag nicht', () => {
  const out = splitTextUnits('<a title="a > b">x</a>', WORD);
  assert.ok(out.includes('<a title="a > b">'), `Tag zerschnitten: ${out}`);
  assert.equal(count(out, '<span'), 1);
});

test('Entity im Wortmodus bleibt geschlossen', () => {
  const out = splitTextUnits('Ma&amp;Co', WORD);
  assert.ok(out.includes('>Ma&amp;Co</span>'), out);
  assert.equal(count(out, '<span'), 1);
});

test('Entity im Zeichenmodus zerfällt nicht in fünf Spans', () => {
  // Genau der Fehler der alten Browser-Fassung: `&amp;` wurde zeichenweise
  // zerlegt und stand danach sichtbar als "&amp;" auf der Seite.
  const out = splitTextUnits('a&amp;b', { split: 'char', start: 0, delay: 0.04 });
  assert.equal(count(out, '<span'), 3, out);
  assert.ok(out.includes('>&amp;</span>'), out);
});

test('Umlaute und Emoji bleiben im Zeichenmodus ganz', () => {
  const out = splitTextUnits('äß🙂', { split: 'char', start: 0, delay: 0 });
  assert.equal(count(out, '<span'), 3, out);
  assert.ok(out.includes('>🙂</span>'), out);
});

test('start verschiebt alle Verzögerungen', () => {
  const out = splitTextUnits('a b', { split: 'word', start: 0.5, delay: 0.1 });
  assert.match(out, /transition-delay:0.5s">a</);
  assert.match(out, /transition-delay:0.6s">b</);
});

test('script-Inhalt wird durchgereicht, nicht zerlegt', () => {
  const out = splitTextUnits('<script>var a = 1;<\/script>Wort', WORD);
  assert.ok(out.includes('<script>var a = 1;<\/script>'), out);
  assert.equal(count(out, '<span'), 1);
});

test('HTML-Kommentar bleibt am Stück', () => {
  const out = splitTextUnits('a<!-- b > c -->d', WORD);
  assert.ok(out.includes('<!-- b > c -->'), out);
  assert.equal(count(out, '<span'), 2);
});

test('unabgeschlossenes Tag wird durchgereicht statt repariert', () => {
  const out = splitTextUnits('a <b', WORD);
  assert.ok(out.endsWith('<b'), out);
});

test('Ausgabe ist deterministisch — zwei Läufe, gleiche Bytes', () => {
  // Der eigentliche Anlass des Issues. Ein Zufallswert irgendwo hier drin
  // wäre am Einzelfall nicht zu sehen.
  const input = 'Sichtbar werden, <strong>wo Menschen</strong> suchen.';
  assert.equal(splitTextUnits(input, WORD), splitTextUnits(input, WORD));
});

test('formatDelay rundet Gleitkomma-Rauschen weg', () => {
  assert.equal(formatDelay(0 + 3 * 0.04), '0.12s'); // roh: 0.12000000000000001
  assert.equal(formatDelay(0), '0s');
  assert.equal(formatDelay(Number.NaN), '0s');
});

test('splitSegment liefert im Wortmodus Wörter und Trenner', () => {
  assert.deepEqual(splitSegment('a b', 'word'), ['a', ' ', 'b']);
  assert.deepEqual(splitSegment('', 'word'), []);
});

test('findTagEnd zeigt hinter das schliessende >', () => {
  assert.equal(findTagEnd('<br>x', 0), 4);
  assert.equal(findTagEnd('<a b="c>d">x', 0), 11);
  assert.equal(findTagEnd('<a unterminated', 0), 15);
});

/**
 * @param {string} haystack
 * @param {string} needle
 * @returns {number}
 */
function count(haystack, needle) {
  return haystack.split(needle).length - 1;
}
