// @ts-check
/**
 * Antwortfrist-Guard (blitzsicht-ops#950). Reine String-Fälle; das Zusammenspiel mit den
 * gerenderten Bausteinen prüft tests/blocks/antwortfrist.test.js.
 *
 * Lauf: `node --test src/integrations/ai-discovery/antwortfrist-check.test.mjs`
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkAntwortfrist, sichtbarerText } from './antwortfrist-check.js';
import { fristSchluessel, findeAntwortfristen } from '../../utils/antwortfrist.js';

/** @param {string} body */
const seite = (body) => `<!doctype html><html><head><title>T</title></head><body>${body}</body></html>`;
/** @param {string} body @param {unknown} [angabe] */
const typen = (body, angabe) => checkAntwortfrist(seite(body), 'kontakt/index.html', angabe).map((i) => i.type);

test('der Befund aus #950: 24-h-Satz ohne Angabe → frist_ohne_angabe', () => {
  assert.deepEqual(typen('<p>Wir melden uns innerhalb von 24 Stunden bei Ihnen.</p>'), ['frist_ohne_angabe']);
});

test('Satz mit passender Angabe → still', () => {
  assert.deepEqual(typen('<p>Wir melden uns innerhalb von 24 Stunden bei Ihnen.</p>', '24 Stunden'), []);
});

test('„24 h“, „24h“, „24 Std.“ gelten wie „24 Stunden“', () => {
  for (const f of ['24 h', '24h', '24 Std.']) {
    assert.deepEqual(typen(`<p>Wir melden uns innerhalb von ${f} bei Ihnen.</p>`, '24 Stunden'), [], f);
  }
  assert.equal(fristSchluessel('24 Stunden'), fristSchluessel('innerhalb von 24h'));
});

test('abweichende Frist trotz Angabe → frist_weicht_ab', () => {
  assert.deepEqual(typen('<p>Wir melden uns innerhalb von 48 Stunden.</p>', '24 Stunden'), ['frist_weicht_ab']);
});

test('weitere Formen: „innerhalb eines Werktags“, „binnen 24h … zurück“, „erhalten Sie … Antwort“', () => {
  assert.deepEqual(typen('<p>Innerhalb eines Werktags melden wir uns.</p>'), ['frist_ohne_angabe']);
  assert.deepEqual(typen('<p>Binnen 24h rufen wir Sie zurück.</p>'), ['frist_ohne_angabe']);
  assert.deepEqual(typen('<p>Sie erhalten innerhalb von 2 Werktagen eine Antwort.</p>'), ['frist_ohne_angabe']);
  assert.deepEqual(typen('<p>Innerhalb eines Werktags melden wir uns.</p>', '1 Werktag'), []);
});

test('keine Antwortfrist: Lieferzusage, Ratgeber ohne Selbstbezug, Notdienst-Slogan', () => {
  assert.deepEqual(typen('<p>Ihre Website ist innerhalb von 7 Werktagen fertig.</p>'), []);
  assert.deepEqual(typen('<p>Wer innerhalb von 5 Minuten antwortet, gewinnt den Auftrag.</p>'), []);
  assert.deepEqual(typen('<p>24h Notdienst – rufen Sie an.</p>'), []);
  assert.deepEqual(typen('<p>Wir melden uns so bald wie möglich bei Ihnen.</p>'), []);
});

test('JSON-LD und <style> zählen nicht, versteckter Erfolgsblock schon', () => {
  const ld = '<script type="application/ld+json">{"text":"Wir melden uns innerhalb von 24 Stunden."}</script>';
  assert.deepEqual(typen(ld), []);
  const versteckt = '<div class="form-success" hidden><p>Wir melden uns innerhalb von 24 Stunden bei Ihnen.</p></div>';
  assert.deepEqual(typen(versteckt), ['frist_ohne_angabe']);
});

test('Blockgrenzen trennen Sätze: Überschrift mit „wir“ + Absatz mit Lieferfrist meldet nicht', () => {
  assert.deepEqual(typen('<h2>Wir melden uns</h2><p>Lieferung innerhalb von 3 Tagen</p>'), []);
});

test('derselbe Satz zweimal auf einer Seite → eine Meldung', () => {
  const s = '<p>Wir melden uns innerhalb von 24 Stunden.</p>';
  assert.equal(typen(s + s).length, 1);
});

test('Entities werden aufgelöst (&nbsp; zwischen Zahl und Einheit)', () => {
  assert.deepEqual(typen('<p>Wir melden uns innerhalb von 24&nbsp;Stunden.</p>'), ['frist_ohne_angabe']);
  assert.match(sichtbarerText('a&amp;b'), /a&b/);
});

test('Meldung nennt Seite, Satz und den Weg zur Lösung', () => {
  const [i] = checkAntwortfrist(seite('<p>Wir melden uns innerhalb von 24 Stunden bei Ihnen.</p>'), 'danke/index.html', undefined);
  assert.match(i.details, /^danke\/index\.html: „Wir melden uns innerhalb von 24 Stunden bei Ihnen“/);
  assert.match(i.details, /siteData\.antwortfrist/);
  assert.equal(i.frist, 'innerhalb von 24 Stunden');
});

test('findeAntwortfristen: Schlüssel normalisiert Zahlwort und Einheit', () => {
  const [t] = findeAntwortfristen('Wir antworten innerhalb von zwei Werktagen.');
  assert.equal(t.schluessel, '2 werktag');
});
