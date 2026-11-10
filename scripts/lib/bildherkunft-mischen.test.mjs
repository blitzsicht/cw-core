// @ts-check
/**
 * Tests für das Mischen in `bildherkunft-verlust.mjs` (customer-blitzsicht#269, Nachlese #264).
 *
 * Lauf: `node --test scripts/lib/bildherkunft-mischen.test.mjs`
 *
 * Bis hierher hat der Generator die Datei neu geschrieben und der Verlust-Guard ihn dabei
 * gestoppt, sobald der Bestand mehr wusste als die Arbeitsliste. Das war bei blitzsicht
 * immer der Fall (zweiter Schreiber: bild-einbauen.mjs), der Generator also stillgelegt.
 * Jetzt mischt er. Zwei Dinge dürfen dabei nicht passieren:
 *
 * - Eine Regel verschwindet (M1 rechnet es am echten Bestand nach, mit Zählwerten).
 * - Eine Kennzeichnung nach Art. 50 Abs. 4 fällt still weg (M5, M6, mit Gegenprobe).
 *
 * Abdeckung:
 *   M1  der echte Fall: 108 Regeln + 38 aus der Arbeitsliste → 110, nichts verloren
 *   M2  Reihenfolge und Vermerke des Bestands bleiben, die Ersatzzeile steht an alter Stelle
 *   M3  alter Pfad + neuer Stem: ersetzt · alter Stem + neuer Pfad: beide bleiben
 *   M4  zwei alte Pfade desselben Stamms, ein neuer Stem → eine Zeile
 *   M5  Kennzeichnung weg über einen längeren Pfad unter einem alten Präfix
 *   M6  Kennzeichnung weg über einen neuen Pfad unter einem alten Stem, mit Gegenprobe
 *   M7  Idempotenz: zweimal mischen ändert nichts
 *   M8  unbekannte Zeilenform im Bestand wirft
 *   M9  mehrzeilige Regel (Form von siluri.de) wirft, statt als Kommentar durchzugehen
 *   K1  erzeugter Kopf wird ersetzt, „Ergänzt"-Vermerke darunter bleiben
 *   K2  der Kopf von bild-einbauen.mjs bleibt unberührt
 *   K3  teileDatei: Rundlauf verlustfrei, ohne `];` wirft es
 *   K4  teileDatei: `= [];` auf einer Zeile ist ein leerer Rumpf (notar-huber)
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  mischeRegeln, kopfErsetzen, fremdeKopfZeile, KOPF_ZEILEN, FRUEHERE_KOEPFE, teileDatei, regelZahl, istKennzeichnungspflichtig, hatErzeugtenKopf,
  verlustVergleich, stammVonPfad,
} from './bildherkunft-verlust.mjs';
import { regelZeile } from '../bildherkunft-arbeitsliste.mjs';
import { NEUE_DATEI } from '../bild-einbauen.mjs';

const HIER = dirname(fileURLToPath(import.meta.url));
const FIXTURE = readFileSync(join(HIER, '..', 'fixtures', 'bild-herkunft-blitzsicht.txt'), 'utf8')
  .split('\n').filter((z) => z.trim() && !z.trim().startsWith('//'));

/** Dieselben 38 Adressen wie in bildherkunft-verlust.test.mjs (Arbeitsliste, Stand 24.08.2026). */
const QUELLE_38 = [
  'images/agentic/agentic-browsing-og.webp', 'images/agentic/agentic-browsing.webp',
  'images/blog/og-images-og.png', 'images/blog/og-images-og.webp',
  'images/hero/b2b-dienstleister.webp', 'images/hero/dachdecker.webp', 'images/hero/elektriker.webp',
  'images/hero/elementor-agentur-regensburg.webp', 'images/hero/handwerker-maler.webp',
  'images/hero/handwerker-sanitaer.webp', 'images/hero/jimdo-alternative.webp',
  'images/hero/jimdo-vs-wix.webp', 'images/hero/originals/craftsman-laptop.webp',
  'images/hero/pakete.webp', 'images/hero/performance-speed.webp', 'images/hero/referenzen.webp',
  'images/hero/regensburg-abend.webp', 'images/hero/schreiner.webp', 'images/hero/so-funktionierts.webp',
  'images/hero/webdesign-regensburg.webp', 'images/hero/website-anforderungen-datenschutz.webp',
  'images/hero/website-anforderungen-handy.webp', 'images/hero/website-anforderungen-sicherheit.webp',
  'images/hero/website-anforderungen.webp', 'images/hero/website-audit.webp',
  'images/hero/website-handwerker.webp', 'images/hero/website-speed-regensburg.webp',
  'images/hero/wix-alternative.webp', 'images/team/johannes-og.webp', 'images/team/johannes.webp',
  'lead-mail/logo-white.png', 'logo.png', 'logo.webp', 'src/assets/images/craftsman-laptop.webp',
  'src/assets/images/dfy-illustration.webp', 'src/assets/images/handwerker-hero.webp',
  'src/assets/images/johannes-portrait.webp', 'src/assets/images/webdesign-regensburg.webp',
];

const B = 'Symbolbild ohne bestimmten Sachverhalt';
const pfad = (p, h = 'ki-erzeugt', d = 'nein') => regelZeile('pathPrefix', p, { h, d, b: B });
const stem = (s, h = 'ki-erzeugt', d = 'nein') => regelZeile('stem', s, { h, d, b: B });
const ausQuelle = (p, d = 'nein') => (p.startsWith('src/assets/images/') ? stem(stammVonPfad(p), 'ki-erzeugt', d) : pfad(p, 'ki-erzeugt', d));

test('M1. der echte Fall: 108 + 38 → 110 Regeln, keine verloren, eine Kennzeichnung gemeldet', () => {
  assert.equal(regelZahl(FIXTURE), 108, 'Probe muss 108 Regeln tragen');
  const neu = QUELLE_38.map((p) => ausQuelle(p));
  const m = mischeRegeln(FIXTURE, neu);

  assert.equal(m.behalten.length, 72, 'die 72 Regeln, die die Arbeitsliste nicht kennt, bleiben');
  assert.equal(m.ersetzt.length, 36);
  assert.deepEqual(m.neu.sort(), ['images/hero/jimdo-alternative.webp', 'images/hero/pakete.webp']);
  assert.equal(regelZahl(m.zeilen), 110);
  // Gegenprobe mit dem alten Guard: nach dem Mischen meldet er nichts mehr.
  assert.deepEqual(verlustVergleich(FIXTURE.join('\n'), m.zeilen).verloren, []);
  // Die Arbeitsliste ordnet regensburg-abend hier als 'nein' ein, der Bestand als 'ja'.
  assert.deepEqual(m.kennzeichnungWeg, ['images/hero/regensburg-abend.webp']);

  // Gegenprobe: dieselbe Einordnung wie im Bestand → nichts gemeldet.
  const treu = QUELLE_38.map((p) => ausQuelle(p, p.endsWith('regensburg-abend.webp') ? 'ja' : 'nein'));
  assert.deepEqual(mischeRegeln(FIXTURE, treu).kennzeichnungWeg, []);
});

test('M2. Reihenfolge und Vermerke bleiben, die Ersatzzeile steht an alter Stelle', () => {
  const rumpf = ['  // Ergänzt 04.11.2026 (#187)', pfad('a.webp'), pfad('b.webp'), '', pfad('c.webp')];
  const m = mischeRegeln(rumpf, [pfad('b.webp', 'mensch'), pfad('d.webp')]);
  assert.deepEqual(m.zeilen, ['  // Ergänzt 04.11.2026 (#187)', pfad('a.webp'), pfad('b.webp', 'mensch'), '', pfad('c.webp'), pfad('d.webp')]);
  assert.deepEqual(m.geaendert, ['b.webp']);
  assert.deepEqual(m.neu, ['d.webp']);
});

test('M3. alter Pfad + neuer Stem ersetzt; alter Stem + neuer Pfad lässt beide stehen', () => {
  const a = mischeRegeln([pfad('src/assets/images/x.webp')], [stem('x', 'mensch')]);
  assert.deepEqual(a.zeilen, [stem('x', 'mensch')], 'sonst schlüge der alte Pfad den neuen Stem');

  const b = mischeRegeln([stem('x')], [pfad('src/assets/images/x.webp', 'mensch')]);
  assert.deepEqual(b.zeilen, [stem('x'), pfad('src/assets/images/x.webp', 'mensch')], 'der Stem deckt weitere Dateien');
  assert.deepEqual(b.behalten, ['stem:x']);
});

test('M4. zwei alte Pfade desselben Stamms, ein neuer Stem → eine Zeile an der Stelle der ersten', () => {
  const m = mischeRegeln([pfad('p/x.webp'), pfad('q.webp'), pfad('p/x.jpg')], [stem('x', 'mensch')]);
  assert.deepEqual(m.zeilen, [stem('x', 'mensch'), pfad('q.webp')]);
  assert.equal(m.ersetzt.length, 2);
});

test('M5. Kennzeichnung weg über einen längeren Pfad unter altem Präfix', () => {
  const alt = pfad('videos/ki-', 'ki-erzeugt', 'ja');
  const m = mischeRegeln([alt], [pfad('videos/ki-1.mp4', 'ki-erzeugt', 'nein')]);
  assert.deepEqual(m.kennzeichnungWeg, ['videos/ki-']);
  assert.deepEqual(m.zeilen, [alt, pfad('videos/ki-1.mp4', 'ki-erzeugt', 'nein')], 'der Präfix selbst bleibt');
  // Gegenprobe: ein Pfad außerhalb des Präfixes überstimmt nichts.
  assert.deepEqual(mischeRegeln([alt], [pfad('videos/ki.mp4')]).kennzeichnungWeg, []);
});

test('M6. Kennzeichnung weg über neuen Pfad unter altem Stem; Gegenprobe mit Kennzeichnung', () => {
  const alt = stem('hero', 'ki-erzeugt', 'ja');
  assert.ok(istKennzeichnungspflichtig(alt));
  assert.deepEqual(mischeRegeln([alt], [pfad('a/hero.webp', 'mensch')]).kennzeichnungWeg, ['stem:hero']);
  assert.deepEqual(mischeRegeln([alt], [pfad('a/hero.webp', 'ki-veraendert', 'ja')]).kennzeichnungWeg, []);
  assert.deepEqual(mischeRegeln([alt], [pfad('a/held.webp', 'mensch')]).kennzeichnungWeg, []);
});

test('M7. Idempotenz: zweimal mischen ändert nichts', () => {
  const neu = QUELLE_38.map((p) => ausQuelle(p));
  const einmal = mischeRegeln(FIXTURE, neu).zeilen;
  const zweimal = mischeRegeln(einmal, neu);
  assert.deepEqual(zweimal.zeilen, einmal);
  assert.deepEqual(zweimal.geaendert, []);
  assert.deepEqual(zweimal.neu, []);
});

test('M8. eine unbekannte Zeilenform im Bestand wirft', () => {
  assert.throws(() => mischeRegeln(["  { herkunft: 'mensch', pathPrefix: 'a.webp' },"], [pfad('b.webp')]), /ohne erkennbaren Schlüssel/);
});

const ERZEUGT = [
  '// ERZEUGTE DATEI — nicht von Hand bearbeiten.',
  '// Bild-Herkunft nach Art. 50 Abs. 4 UAbs. 1 AI Act (VO (EU) 2024/1689).',
  '// Site: blitzsicht · 38 Bilder · Stand 24.8.2026',
  '//',
  '// Ergänzt 04.11.2026 (#187): sechs Hero-Bilder.',
  '',
  "import type { BildHerkunftRegel } from '@cw/core/utils/bildherkunft';",
  '',
  'export const bildHerkunft: BildHerkunftRegel[] = [',
];

test('K1. erzeugter Kopf wird ersetzt, Vermerke darunter bleiben', () => {
  const k = kopfErsetzen(ERZEUGT, '// Neu\n// Site: blitzsicht · 125 Regeln · Stand 9.11.2026\n');
  assert.equal(k.ersetzt, true);
  assert.deepEqual(k.vorspann, ['// Neu', '// Site: blitzsicht · 125 Regeln · Stand 9.11.2026', ...ERZEUGT.slice(3)]);
  // Gegenprobe: ohne `// Site:` wird nicht geraten.
  assert.throws(() => kopfErsetzen(ERZEUGT.filter((z) => !z.startsWith('// Site:')), '// x'), /Site/);
});

test('K2. der Kopf von bild-einbauen.mjs bleibt unberührt', () => {
  const { vorspann } = teileDatei(NEUE_DATEI('x') + '];\n');
  const k = kopfErsetzen(vorspann, '// Neu\n// Site: x · 0 Regeln');
  assert.equal(k.ersetzt, false);
  assert.equal(k.vorspann, vorspann);
});

test('K3. teileDatei: Rundlauf verlustfrei, ohne Schluss wirft es', () => {
  const inhalt = [...ERZEUGT, pfad('a.webp'), '  // Vermerk', pfad('b.webp'), '];', ''].join('\n');
  const t = teileDatei(inhalt);
  assert.equal([...t.vorspann, ...t.rumpf, ...t.schluss].join('\n'), inhalt);
  assert.equal(regelZahl(t.rumpf), 2);
  assert.throws(() => teileDatei(ERZEUGT.join('\n')), /von Hand/);
});

test('M9. mehrzeilige Regel wirft, statt als Kommentar durchzugehen', () => {
  const mehrzeilig = ['  {', "    pathPrefix: 'images/a.webp',", "    herkunft: 'ki-erzeugt',", "    deepfake: 'ja',", '  },'];
  assert.throws(() => mischeRegeln(mehrzeilig, [pfad('images/a.webp')]), /Mehrzeilige Regel/);
  assert.throws(() => regelZahl(mehrzeilig), /Mehrzeilige Regel/);
  // Gegenprobe: ein Kommentar, der das Wort enthält, ist keine Regel.
  assert.equal(regelZahl(["  // pathPrefix: 'images/a.webp' war früher hier"]), 0);
});

test('K4. `= [];` auf einer Zeile ist ein leerer Rumpf, in den sich mischen lässt', () => {
  const inhalt = "// Bild-Herkunft …\n\nexport const bildHerkunft: BildHerkunftRegel[] = [];\n";
  const t = teileDatei(inhalt);
  assert.deepEqual(t.rumpf, []);
  assert.equal(t.vorspann.at(-1), 'export const bildHerkunft: BildHerkunftRegel[] = [');
  assert.deepEqual(t.schluss, ['];', '']);
  assert.equal(hatErzeugtenKopf(inhalt), false);
  assert.equal(hatErzeugtenKopf(ERZEUGT.join('\n')), true);
});

// --- cw-core#280: Handabsätze im erzeugten Kopf -------------------------------------
// Nachgebaut aus customer-falzmarke e8264fd (main vor #81): Fassung b749dd7a mit zwei
// Absätzen von Hand zwischen Zeile 4 und dem Rechtsblock.
const SITE = '// Site: falzmarke · 27 Bilder · Stand 28.8.2026';
const HAND = [
  '// AUSNAHME falzmarke, 28.08.2026: Diese Datei ist von Hand geschrieben. Die Arbeitsliste',
  '// kennt nur Rasterbilder (BILD_EXT in bildherkunft-arbeitsliste.mjs ohne `svg`).',
  '//',
];
const NEU = '// Neu\n// Site: falzmarke · 28 Regeln · Stand 10.11.2026\n';

test('K5. Handabsatz zwischen Zeile 1 und `// Site:` bricht ab und nennt die Zeile', () => {
  const alt = FRUEHERE_KOEPFE[0];
  const vorspann = [...alt.slice(0, 4), ...HAND, ...alt.slice(4), SITE, ''];
  assert.throws(() => kopfErsetzen(vorspann, NEU), /ab Zeile 5 .*AUSNAHME falzmarke/);
  // Gegenprobe: dieselbe Datei ohne die Handzeilen wird ersetzt.
  assert.equal(kopfErsetzen([...alt, SITE, ''], NEU).ersetzt, true);
});

test('K6. jede bekannte Fassung, vollständig oder gekürzt, wird ersetzt', () => {
  for (const fassung of [KOPF_ZEILEN, ...FRUEHERE_KOEPFE]) {
    assert.equal(fremdeKopfZeile(fassung), null);
    assert.equal(fremdeKopfZeile(fassung.slice(0, 1)), null);
    assert.equal(fremdeKopfZeile(fassung.map((z) => `${z}  `)), null, 'Leerzeichen am Zeilenende zählen nicht');
    assert.equal(kopfErsetzen([...fassung, SITE], NEU).ersetzt, true);
  }
  assert.equal(new Set([KOPF_ZEILEN, ...FRUEHERE_KOEPFE].map((f) => f[0])).size, 2, 'zwei Anfänge, drei Fassungen');
});

test('K7. eine von Hand umformulierte Generatorzeile bricht ebenfalls ab', () => {
  const geaendert = KOPF_ZEILEN.map((z, i) => (i === 2 ? z.replace('ebenso', 'auch') : z));
  assert.deepEqual(fremdeKopfZeile(geaendert), { nr: 3, text: geaendert[2].slice(0, 80) });
  assert.throws(() => kopfErsetzen([...geaendert, SITE], NEU), /ab Zeile 3/);
});

test('K8. Handabsätze hinter `// Site:` (falzmarke nach #81) bleiben stehen', () => {
  const vorspann = [...KOPF_ZEILEN, SITE, '//', ...HAND, ''];
  const k = kopfErsetzen(vorspann, NEU);
  assert.equal(k.ersetzt, true);
  assert.deepEqual(k.vorspann.slice(2), ['//', ...HAND, '']);
});
