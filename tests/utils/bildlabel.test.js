// @ts-check
/**
 * Tests für das Bindeglied zwischen Deklaration und sichtbarem Label.
 *
 * Lauf: `node --test tests/utils/bildlabel.test.js` — oder über `pnpm test`.
 *
 * Anlass (28.08.2026): `bildlabel.js` entstand, weil neun cw-core-Komponenten ihre Bilder
 * im eigenen Markup rendern. Von außen ist dort nichts zu platzieren — bei
 * mika-elektrotechnik war dasselbe KI-Bild deshalb auf der Leistungsseite gekennzeichnet
 * und als Startseiten-Kachel nicht. Die Einheit der Pflicht ist die Fundstelle.
 *
 * Der Modul lag zunächst ohne einen einzigen Test im Baum. Das ist bei einer Funktion,
 * deren Ausgabe darüber entscheidet, ob eine gesetzliche Offenlegung erscheint, die
 * teuerste Lücke: ihr Fehler sieht wie ein normales Bild aus.
 *
 * Abdeckung:
 *   1. Kein Bild / keine Deklaration → `null` (nichts rendern, nicht raten)
 *   2. Ohne Pflicht wird nicht gemessen (die Messung ist der teuerste Schritt)
 *   3. `publicFsPath` löst public-URL-Strings auf — mit Gegenprobe an einem dunklen
 *      und einem hellen Motiv, sonst belegte der Test nur, dass er grün ist
 *   4. Eine fehlende Datei ist kein Fehlerfall, sondern die schwarze Vorgabe
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { bildLabel, publicFsPath } from '../../src/utils/bildlabel.js';

/** Deklaration, wie sie in einer Kunden-`site-data.ts` stünde. */
const DATEN = {
  bildHerkunft: [
    { pathPrefix: 'images/', herkunft: 'mensch' },
    {
      pathPrefix: 'images/team/',
      herkunft: 'ki-erzeugt',
      deepfake: 'ja',
      begruendung: 'Fotorealistisches Team, das so nie existiert hat',
    },
    {
      pathPrefix: 'images/render/',
      herkunft: 'ki-erzeugt',
      deepfake: 'nein',
      begruendung: 'Erkennbar illustratives Rendering, wirkt nicht als Aufnahme',
    },
  ],
};

/**
 * Legt ein Projektverzeichnis mit `public/` an, erzeugt darin eine einfarbige Datei und
 * ruft `bildLabel` von dort aus auf. `process.cwd()` ist der Bezugspunkt von
 * `publicFsPath` — genau das, was in einem Kundenrepo passiert.
 *
 * @param {string} urlPfad  Pfad wie im src-Attribut, z.B. `/images/team/a.png`
 * @param {{r:number,g:number,b:number}} farbe
 */
async function labelAusProjekt(urlPfad, farbe) {
  const { default: sharp } = await import('sharp');
  const wurzel = mkdtempSync(join(tmpdir(), 'cwcore-bildlabel-'));
  const ziel = join(wurzel, 'public', ...urlPfad.replace(/^\//, '').split('/'));
  mkdirSync(join(ziel, '..'), { recursive: true });
  await sharp({ create: { width: 64, height: 64, channels: 3, background: farbe } })
    .png()
    .toFile(ziel);

  const vorher = process.cwd();
  try {
    process.chdir(wurzel);
    return await bildLabel(DATEN, urlPfad);
  } finally {
    process.chdir(vorher);
    rmSync(wurzel, { recursive: true, force: true });
  }
}

test('ohne Bild gibt es nichts zu entscheiden', async () => {
  assert.equal(await bildLabel(DATEN, null), null);
  assert.equal(await bildLabel(DATEN, undefined), null);
  assert.equal(await bildLabel(DATEN, {}), null);
});

test('ohne Deklaration wird nichts behauptet', async () => {
  // Nicht `mensch` und nicht `ungeklaert`-mit-Label: wer nichts deklariert hat, bekommt
  // kein Markup. Die Entscheidung faellt in der Deklaration, nicht in der Komponente.
  const bild = { src: 'images/team/gruppe.webp' };
  assert.equal(await bildLabel(null, bild), null);
  assert.equal(await bildLabel({}, bild), null);
  assert.equal(await bildLabel({ bildHerkunft: [] }, bild), null);
});

test('ohne Pflicht wird die Farbe nicht gemessen', async () => {
  // Ein menschliches Foto und ein nicht-taeuschendes Rendering: beide liefern ein
  // Ergebnis fuer AiLabel (das dann von selbst nichts rendert), aber keine Messung —
  // erkennbar daran, dass ein nicht existierender fsPath folgenlos bleibt.
  const mensch = await bildLabel(DATEN, { src: 'images/halle/aussen.webp', fsPath: '/gibt/es/nicht.webp' });
  assert.equal(mensch?.ergebnis.herkunft, 'mensch');
  assert.equal(mensch?.theme, 'hell');

  const rendering = await bildLabel(DATEN, { src: 'images/render/produkt.webp', fsPath: '/gibt/es/nicht.webp' });
  assert.equal(rendering?.ergebnis.deepfake, 'nein');
  assert.equal(rendering?.theme, 'hell');
});

test('bei Pflicht ohne lesbare Datei bleibt es bei der schwarzen Vorgabe', async () => {
  // Kein Werfen, kein fehlendes Label: ein suboptimal gefaerbtes Badge ist der bessere
  // Ausgang als eine Offenlegung, die am Build scheitert.
  const ohneDatei = await bildLabel(DATEN, { src: 'images/team/gruppe.webp' });
  assert.equal(ohneDatei?.ergebnis.deepfake, 'ja');
  assert.equal(ohneDatei?.theme, 'hell', 'schwarzes Badge = helles Theme');

  const stringOhneDatei = await bildLabel(DATEN, '/images/team/gruppe.webp');
  assert.equal(stringOhneDatei?.ergebnis.deepfake, 'ja');
  assert.equal(stringOhneDatei?.theme, 'hell');
});

test('publicFsPath nimmt nur public-URL-Pfade', () => {
  assert.equal(publicFsPath(null), null);
  assert.equal(publicFsPath(42), null);
  assert.equal(publicFsPath('images/ohne/slash.webp'), null, 'relativ ist kein public-Pfad');
  assert.equal(publicFsPath('/'), null);
  assert.equal(publicFsPath('/gibt/es/sicher/nicht.webp'), null, 'nicht existent → null');
});

test('ein String-Bild wird ueber public/ aufgeloest und gemessen', async () => {
  // Das ist die Gegenprobe zu allem darueber: waere der publicFsPath-Zweig nicht da,
  // fiele BEIDE Faelle auf 'hell' zurueck und der Unterschied verschwaende. Ein dunkles
  // und ein helles Motiv muessen deshalb VERSCHIEDENE Antworten geben.
  const dunkel = await labelAusProjekt('/images/team/dunkel.png', { r: 8, g: 8, b: 8 });
  const hell = await labelAusProjekt('/images/team/hell.png', { r: 245, g: 245, b: 245 });

  assert.equal(dunkel?.ergebnis.deepfake, 'ja');
  assert.equal(hell?.ergebnis.deepfake, 'ja');
  assert.equal(dunkel?.theme, 'dunkel', 'auf fast schwarzem Motiv gehoert das weisse Badge');
  assert.equal(hell?.theme, 'hell', 'auf fast weissem Motiv das schwarze');
  assert.notEqual(dunkel?.theme, hell?.theme, 'sonst misst der Test die Messung nicht');
});

test('ein Query-Anhang gehoert zur URL, nicht zum Dateinamen', async () => {
  const mitQuery = await labelAusProjekt('/images/team/dunkel.png', { r: 8, g: 8, b: 8 });
  assert.equal(mitQuery?.theme, 'dunkel');
  // Der Pfad mit Anhang zeigt auf dieselbe Datei — ohne das Abschneiden fiele er auf
  // 'nicht gefunden' und damit still auf die schwarze Vorgabe zurueck.
  assert.equal(publicFsPath('/x.webp?v=2'), publicFsPath('/x.webp'));
});
