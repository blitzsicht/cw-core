// @ts-check
/**
 * Tests für `withDigitalSourceType` — die maschinenlesbare Herkunft je Bild.
 *
 * Lauf: `node --test tests/ai-discovery/digitalsourcetype.test.js`
 *
 * Warum an dieser Stelle und nicht in `buildCommonTags`: Die erste Planung nannte
 * `buildCommonTags`, das ist die falsche Funktion — sie liefert **uniforme** Tags für alle
 * Bilder einer Site (Copyright, GPS, Keywords). Eine Herkunft ist aber je Bild verschieden.
 * Dort gebaut wäre der KI-Tag auf JEDEM Bild der Site gelandet, auch auf den echten Fotos.
 * Eine falsche KI-Behauptung auf einem echten Foto ist kein kleinerer Fehler als eine
 * fehlende auf einem KI-Bild — und wir würden sie selbst in die Metadaten schreiben.
 *
 * Der richtige Haken existierte schon: `withImageRights(common, data, relPath)` löst genau
 * dieselbe Aufgabe für abweichende Rechteinhaber.
 *
 * Ehrlich zur Rechtslage: Das ist **nicht unsere Pflicht**. Die maschinenlesbare Markierung
 * schuldet nach Art. 50 Abs. 2 der Anbieter (bei Claude: Anthropic). Es ist die Antwort auf
 * die EU-Forderung, dass eine Kennzeichnung das Herunterladen überlebt — und es kostet
 * fast nichts.
 *
 * Abdeckung:
 *   1. ki-erzeugt → trainedAlgorithmicMedia
 *   2. ki-veraendert → compositeWithTrainedAlgorithmicMedia
 *   3. mensch → kein Tag (Negativ-Guard gegen die falsche Behauptung)
 *   4. undeklariert → kein Tag
 *   5. bestehende Tags bleiben unangetastet, das Original wird nicht mutiert
 *   6. die Werte sind die IPTC-Vokabular-URIs, nicht die Kurzformen
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  withDigitalSourceType,
  DIGITAL_SOURCE_TYPE,
} from '../../src/integrations/ai-discovery/geotag-core.js';

const data = {
  bildHerkunft: [
    { pathPrefix: 'images/team/', herkunft: 'ki-erzeugt', deepfake: 'ja', begruendung: 'Team ohne reale Vorlage' },
    { pathPrefix: 'images/retusche/', herkunft: 'ki-veraendert', deepfake: 'nein', begruendung: 'Freigestellte echte Aufnahme' },
    { pathPrefix: 'images/echt/', herkunft: 'mensch' },
    { stem: 'handwerker-hero', herkunft: 'ki-erzeugt', deepfake: 'ja', begruendung: 'Szene ohne reale Vorlage' },
  ],
};

test('1. ki-erzeugt bekommt trainedAlgorithmicMedia', () => {
  const t = withDigitalSourceType({}, data, 'images/team/gruppe.webp');
  assert.equal(t['XMP-iptcExt:DigitalSourceType'], DIGITAL_SOURCE_TYPE.erzeugt);
});

test('1b. auch über den Stem, also für gehashte Astro-Assets', () => {
  const t = withDigitalSourceType({}, data, '_astro/handwerker-hero.Bng-bGX1.webp');
  assert.equal(t['XMP-iptcExt:DigitalSourceType'], DIGITAL_SOURCE_TYPE.erzeugt);
});

test('2. ki-veraendert bekommt compositeWithTrainedAlgorithmicMedia', () => {
  const t = withDigitalSourceType({}, data, 'images/retusche/brot.webp');
  assert.equal(t['XMP-iptcExt:DigitalSourceType'], DIGITAL_SOURCE_TYPE.veraendert);
});

test('3. ein menschliches Foto bekommt KEINEN Tag', () => {
  const t = withDigitalSourceType({ Copyright: '© X' }, data, 'images/echt/halle.webp');
  assert.equal('XMP-iptcExt:DigitalSourceType' in t, false, 'keine KI-Behauptung auf einem echten Foto');
  assert.equal(t.Copyright, '© X');
});

test('4. ein undeklariertes Bild bekommt KEINEN Tag', () => {
  const t = withDigitalSourceType({}, data, 'ganz/woanders.webp');
  assert.equal('XMP-iptcExt:DigitalSourceType' in t, false);
});

test('4b. ohne bildHerkunft ist die Funktion flottenneutral', () => {
  const vorher = { Copyright: '© X', GPSLatitude: 49 };
  const t = withDigitalSourceType(vorher, {}, 'images/team/gruppe.webp');
  assert.deepEqual(t, vorher);
});

test('5. bestehende Tags bleiben, das Original wird nicht mutiert', () => {
  const vorher = { Copyright: '© X', 'IPTC:Keywords': ['a', 'b'] };
  const t = withDigitalSourceType(vorher, data, 'images/team/gruppe.webp');
  assert.equal(t.Copyright, '© X');
  assert.deepEqual(t['IPTC:Keywords'], ['a', 'b']);
  assert.equal('XMP-iptcExt:DigitalSourceType' in vorher, false, 'Eingabe darf nicht verändert werden');
});

test('6. die Werte sind die IPTC-Vokabular-URIs, nicht die Kurzformen', () => {
  // Ein bloßes „trainedAlgorithmicMedia" ist kein gültiger Wert des Feldes: DigitalSourceType
  // verweist auf das IPTC-NewsCodes-Vokabular und erwartet die volle URI. Die Kurzform sieht
  // richtig aus und wäre von keinem Leser auswertbar.
  assert.equal(DIGITAL_SOURCE_TYPE.erzeugt,
    'http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia');
  assert.equal(DIGITAL_SOURCE_TYPE.veraendert,
    'http://cv.iptc.org/newscodes/digitalsourcetype/compositeWithTrainedAlgorithmicMedia');
});
