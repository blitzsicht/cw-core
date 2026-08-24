// @ts-check
/**
 * Tests für `bild-einbauen` — die reinen Teile.
 *
 * Lauf: `node --test scripts/bild-einbauen.test.mjs`
 *
 * Zwei Stellen können hier still falsch werden, und beide sind teuer:
 *
 * 1. **Die Marker-Deutung.** Sie belegt die Herkunftsfrage vor. Deutet sie zu großzügig,
 *    wird ein echtes Foto als KI-Bild deklariert und trägt am Ende ein Label, das nicht
 *    stimmt — eine Falschbehauptung, die wir selbst ausliefern. Deutet sie zu eng, wird
 *    gefragt, wo die Antwort dastand: lästig, aber harmlos. Die Asymmetrie ist Absicht.
 *
 * 2. **Das Einfügen in die Deklarationsdatei.** Geht es daneben, ist die Datei kaputt und
 *    der Kunden-Build bricht — weit weg von hier und ohne Hinweis auf die Ursache.
 *
 * Abdeckung:
 *   1. DigitalSourceType wird eindeutig gedeutet, in beide Richtungen
 *   2. Bekannte Generator-Namen in Software/CreatorTool
 *   3. C2PA/JUMBF als Hinweis ohne Herkunftsaussage
 *   4. Harmlose Werkzeuge (Photoshop, sharp) deuten NICHT auf KI
 *   5. Leere Metadaten → keine Vorbelegung
 *   6. Einfügen hält die Datei gültig und die bestehenden Regeln unangetastet
 *   7. Einfügen erkennt einen bereits vorhandenen Eintrag
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deuteMarker, einfuegen, NEUE_DATEI } from './bild-einbauen.mjs';
import { pruefeBildHerkunftRegeln, resolveBildHerkunft } from '../src/utils/bildherkunft.js';

test('1. DigitalSourceType wird eindeutig gedeutet', () => {
  const erzeugt = deuteMarker({
    'DigitalSourceType': 'http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia',
  });
  assert.equal(erzeugt.herkunft, 'ki-erzeugt');
  assert.equal(erzeugt.sicher, true);
  assert.match(erzeugt.quelle, /DigitalSourceType/);

  const veraendert = deuteMarker({
    'DigitalSourceType': 'http://cv.iptc.org/newscodes/digitalsourcetype/compositeWithTrainedAlgorithmicMedia',
  });
  assert.equal(veraendert.herkunft, 'ki-veraendert');
  assert.equal(veraendert.sicher, true);

  // Die Gegenrichtung gehört dazu: das Vokabular kennt auch die Aussage „echte Aufnahme".
  const foto = deuteMarker({
    'DigitalSourceType': 'http://cv.iptc.org/newscodes/digitalsourcetype/digitalCapture',
  });
  assert.equal(foto.herkunft, 'mensch');
  assert.equal(foto.sicher, true);
});

test('2. bekannte Generator-Namen in Software/CreatorTool', () => {
  for (const [feld, wert] of [
    ['Software', 'Midjourney'],
    ['CreatorTool', 'DALL·E 3'],
    ['Software', 'Stable Diffusion 3.5'],
    ['CreatorTool', 'Adobe Firefly'],
    ['Software', 'Google Gemini'],
  ]) {
    const r = deuteMarker({ [feld]: wert });
    assert.equal(r.herkunft, 'ki-erzeugt', `${feld}=${wert}`);
    // Ein Werkzeugname ist ein starker Hinweis, aber keine Deklaration des Herstellers —
    // deshalb nicht `sicher`: der Mensch bestätigt.
    assert.equal(r.sicher, false, `${feld}=${wert} darf nicht als sicher gelten`);
  }
});

test('3. C2PA/JUMBF ist ein Hinweis, aber keine Herkunftsaussage', () => {
  const r = deuteMarker({ 'JUMBFTag': 'c2pa', 'Software': '' });
  assert.equal(r.herkunft, null, 'Content Credentials sagen, DASS eine Historie da ist, nicht welche');
  assert.match(r.quelle, /C2PA|Content Credential/i);
});

test('4. harmlose Werkzeuge deuten NICHT auf KI', () => {
  // Der teure Fehler wäre hier: ein echtes Foto, in Photoshop retuschiert, als KI-erzeugt
  // vorzubelegen. Der Operator bestätigt im Zweifel zu schnell, und dann trägt eine echte
  // Aufnahme ein KI-Label.
  for (const wert of ['Adobe Photoshop 26.0', 'sharp', 'APNG Assembler 3.0', 'GIMP 2.10', 'Lightroom']) {
    const r = deuteMarker({ Software: wert });
    assert.equal(r.herkunft, null, `Software=${wert} darf nichts vorbelegen`);
  }
});

test('5. leere Metadaten belegen nichts vor', () => {
  for (const tags of [{}, { Software: '' }, null, undefined]) {
    const r = deuteMarker(tags);
    assert.equal(r.herkunft, null);
    assert.equal(r.sicher, false);
  }
});

test('6. Einfügen hält die Datei gültig und rührt Bestehendes nicht an', () => {
  const vorher = NEUE_DATEI('testsite')
    .replace('];\n', "  { pathPrefix: 'images/alt.webp', herkunft: 'mensch' },\n];\n");

  const neu = einfuegen(vorher,
    "  { pathPrefix: 'images/neu.webp', herkunft: 'ki-erzeugt', deepfake: 'ja', begruendung: 'Szene ohne reale Vorlage' },");

  assert.match(neu, /images\/alt\.webp/, 'die bestehende Regel muss bleiben');
  assert.match(neu, /images\/neu\.webp/);
  assert.equal((neu.match(/^\];$/gm) || []).length, 1, 'genau eine schließende Klammer');

  // Der eigentliche Nachweis: das Ergebnis muss sich wie eine echte Deklaration verhalten.
  const regeln = new Function('return ' + neu.slice(neu.indexOf('= [') + 2, neu.lastIndexOf('];') + 2))();
  const data = { bildHerkunft: regeln };
  assert.deepEqual(pruefeBildHerkunftRegeln(data), []);
  assert.equal(resolveBildHerkunft(data, 'images/neu.webp').deepfake, 'ja');
  assert.equal(resolveBildHerkunft(data, 'images/alt.webp').herkunft, 'mensch');
});

test('7. ein bereits vorhandener Eintrag wird erkannt, nicht verdoppelt', () => {
  const zeile = "  { pathPrefix: 'images/neu.webp', herkunft: 'mensch' },";
  const einmal = einfuegen(NEUE_DATEI('testsite'), zeile);
  assert.throws(() => einfuegen(einmal, zeile), /bereits deklariert|schon/i);
});
