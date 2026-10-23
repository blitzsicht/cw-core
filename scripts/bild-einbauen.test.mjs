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
 *   8-10. Ablage mit und ohne --assets
 *   11-16. Urheberfelder: erkannt, nicht überdehnt, und der Einbau hält wirklich an
 *
 * Zu 11-16: Der Guard stammt aus einem echten Fall (spedition-steller, 23.10.2026). Ein
 * Betrieb schickte 32 eigene Fuhrpark-Fotos; genau eines war die Aufnahme eines
 * Berufsfotografen, erkennbar nur an `Artist`/IPTC-Copyright in den Metadaten. Weil
 * `astro:assets` diese Felder beim Transform löscht, ist der Einbau die einzige Stelle,
 * an der die Frage überhaupt noch gestellt werden kann. Test 15 ist die Gegenprobe zu
 * 14 — dieselbe Datei ohne das Feld MUSS durchlaufen, sonst wäre der Guard nur eine
 * Blockade, die immer blockiert.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deuteMarker, deuteUrheber, einfuegen, NEUE_DATEI } from './bild-einbauen.mjs';
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

// --- --assets (Review cw-site #52) -------------------------------------------------------
import { ablage } from './bild-einbauen.mjs';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join as pjoin, dirname as pdirname } from 'node:path';
import { fileURLToPath as f2p } from 'node:url';
import { execFileSync } from 'node:child_process';

test('8. ohne --assets bleibt alles wie bisher: public/ + pathPrefix', () => {
  assert.deepEqual(ablage({ ziel: 'images/team/', name: 'anna.webp', assets: false }), {
    relPfad: 'images/team/anna.webp', zielRel: pjoin('public', 'images/team/anna.webp'),
    schluessel: 'pathPrefix', wert: 'images/team/anna.webp',
  });
});

test('9. --assets: src/assets/ + stem, und die Regel trifft das gehashte Build-Bild', () => {
  const a = ablage({ ziel: 'images/', name: 'salon.v2.jpg', assets: true });
  assert.equal(a.zielRel, pjoin('src', 'assets', 'images/salon.v2.jpg'));
  assert.equal(a.schluessel, 'stem');
  assert.equal(a.wert, 'salon');
  const regeln = { bildHerkunft: [{ stem: a.wert, herkunft: 'mensch' }] };
  // so heißt die Datei nach astro:assets
  assert.equal(resolveBildHerkunft(regeln, '/_astro/salon.v2.Bng-bGX1.webp')?.herkunft, 'mensch');
  // Gegenprobe: ein pathPrefix auf den Quellpfad trifft das Build-Bild NICHT — darum stem
  const alt = { bildHerkunft: [{ pathPrefix: 'images/salon.v2.jpg', herkunft: 'mensch' }] };
  assert.notEqual(resolveBildHerkunft(alt, '/_astro/salon.v2.Bng-bGX1.webp')?.herkunft, 'mensch');
});

test('10. Ende zu Ende: --assets legt unter src/assets ab und deklariert per stem', () => {
  const root = mkdtempSync(pjoin(tmpdir(), 'bild-einbauen-'));
  try {
    const repo = pjoin(root, 'customer-probe');
    mkdirSync(pjoin(repo, 'src', 'data'), { recursive: true });
    writeFileSync(pjoin(repo, 'src', 'data', 'site-data.ts'), "import { bildHerkunft } from './bild-herkunft';\n");
    const quelle = pjoin(root, 'empfang.jpg');
    writeFileSync(quelle, 'kein echtes jpg');
    const skript = pjoin(pdirname(f2p(import.meta.url)), 'bild-einbauen.mjs');
    execFileSync(process.execPath, [skript, quelle, '--repo', repo, '--ziel', 'images/', '--assets', '--herkunft', 'mensch'],
      { stdio: 'pipe', input: '' });
    assert.ok(existsSync(pjoin(repo, 'src', 'assets', 'images', 'empfang.jpg')), 'Datei nicht unter src/assets');
    assert.ok(!existsSync(pjoin(repo, 'public', 'images', 'empfang.jpg')), 'Datei trotzdem in public/');
    const dekl = readFileSync(pjoin(repo, 'src', 'data', 'bild-herkunft.ts'), 'utf8');
    assert.match(dekl, /stem: 'empfang'/);
    assert.doesNotMatch(dekl, /pathPrefix: 'images\/empfang/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Urheberfelder (siehe Kopf, Punkte 11-16)
// ---------------------------------------------------------------------------

/** Gültiges 1x1-JPEG — exiftool schreibt nur in echte Bilddateien. */
const JPEG_1X1 = Buffer.from(
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a' +
  'HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAA' +
  'AAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==', 'base64');

const exiftoolDa = (() => {
  try { execFileSync('exiftool', ['-ver'], { stdio: 'pipe' }); return true; } catch { return false; }
})();

test('11. Urheberfelder werden in EXIF, IPTC und XMP erkannt', () => {
  const exif = deuteUrheber({ Artist: 'Stefan Kiefer', Copyright: 'mail@stefankkiefer.com' });
  assert.equal(exif.gesetzt, true);
  assert.equal(exif.felder.length, 2);
  assert.deepEqual(exif.felder[0], { feld: 'Artist', wert: 'Stefan Kiefer' });

  assert.equal(deuteUrheber({ 'By-line': 'Studio Muster' }).gesetzt, true);
  assert.equal(deuteUrheber({ Creator: 'Fotograf X' }).gesetzt, true);
  assert.equal(deuteUrheber({ ImageCreatorName: 'Agentur Y' }).gesetzt, true);
});

test('12. typische Handyaufnahme blockiert NICHT', () => {
  // Der teure Fehler wäre hier: ein Guard, der bei jedem Kundenfoto anschlägt, wird
  // nach dem dritten Mal durchgewinkt und schützt dann gar nichts mehr.
  const handy = deuteUrheber({
    Make: 'Apple', Model: 'iPhone 15', DateTimeOriginal: '2026:10:23 09:51:39',
    Software: '17.5.1', DigitalSourceType: 'digitalCapture',
  });
  assert.equal(handy.gesetzt, false);
  assert.equal(handy.felder.length, 0);
  assert.equal(deuteUrheber({}).gesetzt, false);
  assert.equal(deuteUrheber(null).gesetzt, false);
});

test('13. leere Werte zählen nicht als Urheber', () => {
  assert.equal(deuteUrheber({ Artist: '', Copyright: '   ' }).gesetzt, false);
});

test('14. Ende zu Ende: mit fremdem Urheber wird NICHT eingebaut', { skip: !exiftoolDa && 'exiftool fehlt — NICHT GEPRÜFT, nicht grün' }, () => {
  const root = mkdtempSync(pjoin(tmpdir(), 'bild-urheber-'));
  try {
    const repo = pjoin(root, 'customer-probe');
    mkdirSync(pjoin(repo, 'src', 'data'), { recursive: true });
    writeFileSync(pjoin(repo, 'src', 'data', 'site-data.ts'), "import { bildHerkunft } from './bild-herkunft';\n");
    const quelle = pjoin(root, 'kran.jpg');
    writeFileSync(quelle, JPEG_1X1);
    execFileSync('exiftool', ['-overwrite_original', '-Artist=Stefan Kiefer',
      '-Copyright=mail@stefankkiefer.com', quelle], { stdio: 'pipe' });

    const skript = pjoin(pdirname(f2p(import.meta.url)), 'bild-einbauen.mjs');
    const aus = execFileSync(process.execPath,
      [skript, quelle, '--repo', repo, '--ziel', 'images/', '--assets', '--herkunft', 'mensch'],
      { stdio: 'pipe', input: '', encoding: 'utf8' });

    assert.ok(!existsSync(pjoin(repo, 'src', 'assets', 'images', 'kran.jpg')),
      'Bild mit fremdem Urheber wurde trotzdem abgelegt');
    assert.ok(!existsSync(pjoin(repo, 'src', 'data', 'bild-herkunft.ts')),
      'Es wurde eine Deklaration für ein Bild geschrieben, das gar nicht eingebaut wurde');
    assert.match(aus, /Stefan Kiefer/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('15. Gegenprobe zu 14: dieselbe Datei OHNE Urheberfeld läuft durch', { skip: !exiftoolDa && 'exiftool fehlt — NICHT GEPRÜFT, nicht grün' }, () => {
  const root = mkdtempSync(pjoin(tmpdir(), 'bild-urheber-'));
  try {
    const repo = pjoin(root, 'customer-probe');
    mkdirSync(pjoin(repo, 'src', 'data'), { recursive: true });
    writeFileSync(pjoin(repo, 'src', 'data', 'site-data.ts'), "import { bildHerkunft } from './bild-herkunft';\n");
    const quelle = pjoin(root, 'kran.jpg');
    writeFileSync(quelle, JPEG_1X1);   // identisch zu Test 14, nur ohne exiftool-Schreiblauf

    const skript = pjoin(pdirname(f2p(import.meta.url)), 'bild-einbauen.mjs');
    execFileSync(process.execPath,
      [skript, quelle, '--repo', repo, '--ziel', 'images/', '--assets', '--herkunft', 'mensch'],
      { stdio: 'pipe', input: '' });

    assert.ok(existsSync(pjoin(repo, 'src', 'assets', 'images', 'kran.jpg')),
      'Ohne Urheberfeld blockiert der Guard trotzdem — dann schützt er nichts, er verhindert nur');
    assert.match(readFileSync(pjoin(repo, 'src', 'data', 'bild-herkunft.ts'), 'utf8'), /stem: 'kran'/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('16. --urheber-ok baut trotz fremdem Urheber ein', { skip: !exiftoolDa && 'exiftool fehlt — NICHT GEPRÜFT, nicht grün' }, () => {
  const root = mkdtempSync(pjoin(tmpdir(), 'bild-urheber-'));
  try {
    const repo = pjoin(root, 'customer-probe');
    mkdirSync(pjoin(repo, 'src', 'data'), { recursive: true });
    writeFileSync(pjoin(repo, 'src', 'data', 'site-data.ts'), "import { bildHerkunft } from './bild-herkunft';\n");
    const quelle = pjoin(root, 'kran.jpg');
    writeFileSync(quelle, JPEG_1X1);
    execFileSync('exiftool', ['-overwrite_original', '-Artist=Stefan Kiefer', quelle], { stdio: 'pipe' });

    const skript = pjoin(pdirname(f2p(import.meta.url)), 'bild-einbauen.mjs');
    execFileSync(process.execPath,
      [skript, quelle, '--repo', repo, '--ziel', 'images/', '--assets', '--herkunft', 'mensch', '--urheber-ok'],
      { stdio: 'pipe', input: '' });

    assert.ok(existsSync(pjoin(repo, 'src', 'assets', 'images', 'kran.jpg')),
      '--urheber-ok wirkt nicht — dann gibt es keinen Weg an dem Guard vorbei, auch nicht mit Lizenz');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
