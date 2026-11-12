// @ts-check
/**
 * Integrationstest für `bildherkunft-uebernehmen.mjs`: das echte Skript gegen ein
 * Temp-Repo, Registry per `CW_REGISTRY` untergeschoben.
 *
 * Lauf: `node --test scripts/bildherkunft-uebernehmen.test.mjs`
 *
 * Die reinen Funktionen prüft lib/bildherkunft-mischen.test.mjs. Hier geht es um das, was
 * nur im Lauf sichtbar wird: Probelauf schreibt nichts, Exit-Codes, Kopf und Vermerke in
 * der fertigen Datei, `--kopf` ändert eine aktuelle Datei nicht ein zweites Mal.
 *
 *   I1  Export mischt: Vermerk bleibt, Kopf nennt die neue Regelzahl, Probelauf ändert nichts
 *   I2  fiele eine Kennzeichnung weg: Exit 2, Datei unverändert; mit Ausweg geschrieben
 *   I3  der alte Ausweg `--verlust-ok` wird abgelehnt (Exit 1), nicht still umgedeutet
 *   I4  `--kopf`: schreibt die Zahl, zweiter Lauf ändert nichts, fremder Kopf bleibt
 *   I5  `--kopf` an einer Datei mit eigenem Kopf und mehrzeiligen Regeln: kein Abbruch
 *   I8  Handabsatz im erzeugten Kopf: `--kopf` bricht ab (Exit 3); Export schreibt die Regeln,
 *       behält den Kopf, aktualisiert nur `// Site:` (Exit 4)
 *   I10 Leerzeile im erzeugten Kopf: `--kopf` und Export laufen durch (Exit 0)
 *   I9  Verzeichnis-Präfix über gekennzeichnetem Stem mit echter Bilddatei: Exit 2, nicht geschrieben (cw-core#280)
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { regelZeile } from './bildherkunft-arbeitsliste.mjs';
import { NEUE_DATEI } from './bild-einbauen.mjs';

const SKRIPT = join(dirname(fileURLToPath(import.meta.url)), 'bildherkunft-uebernehmen.mjs');
const B = 'Symbolbild ohne bestimmten Sachverhalt';
const r = (p, h = 'ki-erzeugt', d = 'nein') => regelZeile('pathPrefix', p, { h, d, b: B });

const ERZEUGT = (zeilen) => [
  '// ERZEUGTE DATEI — nicht von Hand bearbeiten.',
  '// Site: probe · 1 Bilder · Stand 24.8.2026',
  '//',
  '// Ergänzt 04.11.2026 (#187): Hero-Bilder.',
  '',
  "import type { BildHerkunftRegel } from '@cw/core/utils/bildherkunft';",
  '',
  'export const bildHerkunft: BildHerkunftRegel[] = [',
  ...zeilen,
  '];',
  '',
].join('\n');

function aufbau(inhalt, exportListe) {
  const tmp = mkdtempSync(join(tmpdir(), 'bhu-'));
  const repo = join(tmp, 'repo');
  mkdirSync(join(repo, 'src/data'), { recursive: true });
  const ziel = join(repo, 'src/data/bild-herkunft.ts');
  writeFileSync(ziel, inhalt);
  const registry = join(tmp, 'registry.json');
  writeFileSync(registry, JSON.stringify({ customers: [{ slug: 'probe', repo_path: repo }] }));
  const exp = join(tmp, 'export.json');
  writeFileSync(exp, JSON.stringify({
    format: 'bildherkunft-export-v1', stand: '2026-11-09T10:00:00Z',
    sites: { probe: exportListe.map(([wert, herkunft, deepfake]) => ({ datei: wert, key: 'pathPrefix', wert, herkunft, deepfake, begruendung: B })) },
  }));
  const lauf = (...args) => spawnSync(process.execPath, [SKRIPT, ...args, '--nur', 'probe', '--repo', repo],
    { encoding: 'utf8', env: { ...process.env, CW_REGISTRY: registry } });
  return { ziel, exp, lauf };
}

test('I1. Export mischt: Vermerk bleibt, Kopf mit neuer Zahl, Probelauf ändert nichts', () => {
  const vorher = ERZEUGT([r('a.webp'), r('b.webp')]);
  const { ziel, exp, lauf } = aufbau(vorher, [['b.webp', 'mensch', null], ['c.webp', 'ki-erzeugt', 'nein']]);

  const probe = lauf('--export', exp);
  assert.equal(probe.status, 0, probe.stderr);
  assert.equal(readFileSync(ziel, 'utf8'), vorher, 'Probelauf darf nichts schreiben');

  const s = lauf('--export', exp, '--schreiben');
  assert.equal(s.status, 0, s.stderr + s.stdout);
  const nachher = readFileSync(ziel, 'utf8');
  assert.match(nachher, /^\/\/ Angelegt von cw-core/);
  assert.match(nachher, /\/\/ Site: probe · 3 Regeln · Stand 9\.11\.2026/);
  assert.match(nachher, /\/\/ Ergänzt 04\.11\.2026 \(#187\)/);
  assert.ok(nachher.includes(r('a.webp')), 'Regel, die der Export nicht kennt, bleibt');
  assert.ok(nachher.includes(regelZeile('pathPrefix', 'b.webp', { h: 'mensch', d: undefined, b: B })));
  assert.ok(!nachher.includes(r('b.webp')), 'alte Einordnung von b ist ersetzt');
  assert.ok(nachher.indexOf("'a.webp'") < nachher.indexOf("'b.webp'") && nachher.indexOf("'b.webp'") < nachher.indexOf("'c.webp'"));
});

test('I2. Kennzeichnung fiele weg: Exit 2 und nichts geschrieben; mit Ausweg geschrieben', () => {
  const vorher = ERZEUGT([r('a.webp', 'ki-erzeugt', 'ja')]);
  const { ziel, exp, lauf } = aufbau(vorher, [['a.webp', 'ki-erzeugt', 'nein']]);
  const s = lauf('--export', exp, '--schreiben');
  assert.equal(s.status, 2, s.stdout);
  assert.match(s.stdout, /Kennzeichnung fiele weg: a\.webp/);
  assert.equal(readFileSync(ziel, 'utf8'), vorher);

  const ok = lauf('--export', exp, '--schreiben', '--kennzeichnung-weg-ok');
  assert.equal(ok.status, 0, ok.stderr);
  assert.ok(readFileSync(ziel, 'utf8').includes(r('a.webp', 'ki-erzeugt', 'nein')));
});

test('I3. der alte Ausweg --verlust-ok wird abgelehnt', () => {
  const { exp, lauf } = aufbau(ERZEUGT([r('a.webp')]), [['a.webp', 'mensch', null]]);
  const s = lauf('--export', exp, '--verlust-ok');
  assert.equal(s.status, 1);
  assert.match(s.stderr, /--kennzeichnung-weg-ok/);
});

test('I4. --kopf: schreibt die Zahl, zweiter Lauf ändert nichts, fremder Kopf bleibt', () => {
  const vorher = ERZEUGT([r('a.webp'), r('b.webp')]);
  const { ziel, lauf } = aufbau(vorher, []);
  assert.equal(lauf('--kopf').status, 0);
  assert.equal(readFileSync(ziel, 'utf8'), vorher, 'Probelauf darf nichts schreiben');

  assert.equal(lauf('--kopf', '--schreiben').status, 0);
  const einmal = readFileSync(ziel, 'utf8');
  assert.match(einmal, /\/\/ Site: probe · 2 Regeln · Stand /);
  assert.match(einmal, /\/\/ Ergänzt 04\.11\.2026/);
  assert.equal(einmal.split('\n').slice(-5).join('\n'), vorher.split('\n').slice(-5).join('\n'), 'Rumpf unverändert');

  // Ein anderer Tag, dieselbe Zahl: das Datum allein darf keinen Schreiblauf auslösen,
  // sonst änderte jeder Kopf-Lauf jede Datei der Flotte, jeden Tag.
  const gestern = einmal.replace(/(\/\/ Site: probe · 2 Regeln · Stand )\S+/, '$11.1.2026');
  assert.notEqual(gestern, einmal);
  writeFileSync(ziel, gestern);
  const zwei = lauf('--kopf', '--schreiben');
  assert.match(zwei.stdout, /aktuell/);
  assert.equal(readFileSync(ziel, 'utf8'), gestern);

  // Gegenprobe: Kopf von bild-einbauen.mjs behauptet keine Zahl und bleibt.
  const fremd = NEUE_DATEI('probe').replace(/\n$/, '') + '\n' + r('a.webp') + '\n];\n';
  const f = aufbau(fremd, []);
  const s = f.lauf('--kopf', '--schreiben');
  assert.equal(s.status, 0);
  assert.match(s.stdout, /eigener Kopf/);
  assert.equal(readFileSync(f.ziel, 'utf8'), fremd);
});

test('I5. --kopf: eigener Kopf mit mehrzeiligen Regeln bricht nicht ab', () => {
  const siluri = [
    '// Bild-Herkunft nach Art. 50 Abs. 4 UAbs. 1 AI Act, von Hand gepflegt.',
    'export const bildHerkunft: BildHerkunftRegel[] = [',
    '  {', "    pathPrefix: 'images/team/a.webp',", "    herkunft: 'mensch',", '  },', '];', '',
  ].join('\n');
  const { ziel, lauf } = aufbau(siluri, []);
  const s = lauf('--kopf', '--schreiben');
  assert.equal(s.status, 0, s.stdout);
  assert.match(s.stdout, /eigener Kopf/);
  assert.equal(readFileSync(ziel, 'utf8'), siluri);
});

// ─── Nachlese #277 (Review 09.11.2026) ──────────────────────────────────────────────────

test('I6. Befund am gemischten Ergebnis: Exit 3, nichts geschrieben, nichts verdrahtet', () => {
  // Altfehler im Bestand: derselbe Stem zweimal (pruefeBildHerkunftRegeln meldet ihn).
  const stem = (h) => regelZeile('stem', 'hero', { h, d: 'nein', b: B });
  const vorher = ERZEUGT([stem('ki-erzeugt'), stem('ki-erzeugt')]);
  const { ziel, exp, lauf } = aufbau(vorher, [['c.webp', 'ki-erzeugt', 'nein']]);
  const sd = join(dirname(ziel), 'site-data.ts');
  const sdVorher = 'export const siteData = {\n  name: "x",\n};\n';
  writeFileSync(sd, sdVorher);
  const s = lauf('--export', exp, '--schreiben', '--verdrahten');
  assert.equal(s.status, 3, s.stdout + s.stderr);
  assert.match(s.stderr, /Befunde — NICHT geschrieben/);
  assert.equal(readFileSync(ziel, 'utf8'), vorher);
  assert.equal(readFileSync(sd, 'utf8'), sdVorher);
});

test('I7. Kennzeichnung fiele weg + --verdrahten: site-data.ts bleibt unberührt', () => {
  const vorher = ERZEUGT([r('a.webp', 'ki-erzeugt', 'ja')]);
  const { ziel, exp, lauf } = aufbau(vorher, [['a.webp', 'ki-erzeugt', 'nein']]);
  const sd = join(dirname(ziel), 'site-data.ts');
  const sdVorher = 'export const siteData = {\n  name: "x",\n};\n';
  writeFileSync(sd, sdVorher);
  const s = lauf('--export', exp, '--schreiben', '--verdrahten');
  assert.equal(s.status, 2, s.stdout);
  assert.equal(readFileSync(sd, 'utf8'), sdVorher, 'nicht geschriebene Site darf nicht verdrahtet werden');
  // Gegenprobe: mit Ausweg geschrieben UND verdrahtet.
  const ok = lauf('--export', exp, '--schreiben', '--verdrahten', '--kennzeichnung-weg-ok');
  assert.equal(ok.status, 0, ok.stderr);
  assert.match(readFileSync(sd, 'utf8'), /from '\.\/bild-herkunft'/);
});

// ─── cw-core#280: Handabsatz im erzeugten Kopf ─────────────────────────────────────────

test('I8. Handabsatz im erzeugten Kopf: --kopf bricht ab, Export schreibt die Regeln (Exit 4)', () => {
  const vorher = ERZEUGT([r('a.webp')]).replace('\n// Site:', '\n// AUSNAHME probe: von Hand, steht im Kopf.\n// Site:');
  const { ziel, exp, lauf } = aufbau(vorher, [['a.webp', 'ki-erzeugt', 'nein'], ['c.webp', 'ki-erzeugt', 'ja']]);
  const kopf = lauf('--kopf', '--schreiben');
  assert.equal(kopf.status, 3, kopf.stdout + kopf.stderr);
  assert.match(kopf.stdout + kopf.stderr, /Kopf weicht ab Zeile 2 .*AUSNAHME probe/);
  assert.doesNotMatch(kopf.stdout + kopf.stderr, /nicht lesbar/);
  assert.equal(readFileSync(ziel, 'utf8'), vorher);
  // Review von #281: Der Export hielt bisher die ganze Site an, auch die neue Kennzeichnung
  // (`c.webp`, deepfake ja) wartete, bis jemand den Kopf von Hand reparierte. Jetzt schreibt
  // er die Regeln, lässt den fremden Kopf stehen und zieht nur `// Site:` nach.
  const probe = lauf('--export', exp);
  assert.equal(probe.status, 4, probe.stdout + probe.stderr);
  assert.equal(readFileSync(ziel, 'utf8'), vorher, 'Probelauf schreibt nichts');
  const s = lauf('--export', exp, '--schreiben');
  assert.equal(s.status, 4, s.stdout + s.stderr);
  assert.match(s.stdout, /Kopf nicht ersetzt.*Zeile 2/);
  // Review von #293, Befund 1: Der Text sagt, was passiert ist (Regeln geschrieben), nicht die
  // Abbruchmeldung von `--kopf` („ein Lauf löschte sie … dann neu laufen“).
  assert.match(s.stdout, /Regeln geschrieben, Kopf behalten, nur `\/\/ Site:` nachgezogen/);
  assert.doesNotMatch(s.stdout, /löschte/);
  const nachher = readFileSync(ziel, 'utf8');
  assert.match(nachher, /c\.webp.*deepfake: 'ja'/, 'neue Kennzeichnung geschrieben');
  assert.match(nachher, /^\/\/ ERZEUGTE DATEI/, 'alter Kopf bleibt');
  assert.match(nachher, /AUSNAHME probe: von Hand, steht im Kopf\./);
  assert.match(nachher, /^\/\/ Site: probe · 2 Regeln · Stand /m);
  assert.doesNotMatch(nachher, /1 Bilder/);
  // Gegenprobe: derselbe Absatz hinter `// Site:` läuft durch.
  const dahinter = ERZEUGT([r('a.webp')]).replace('\n//\n// Ergänzt', '\n// AUSNAHME probe: von Hand.\n//\n// Ergänzt');
  const g = aufbau(dahinter, []);
  const k = g.lauf('--kopf', '--schreiben');
  assert.equal(k.status, 0, k.stdout);
  assert.match(readFileSync(g.ziel, 'utf8'), /AUSNAHME probe: von Hand\./);
});

test('I10. Leerzeile im erzeugten Kopf: --kopf und Export laufen durch (Review von #281)', () => {
  const vorher = ERZEUGT([r('a.webp')]).replace('\n// Site:', '\n\n//\n// Site:');
  for (const args of [['--kopf', '--schreiben'], ['--export', null, '--schreiben']]) {
    const f = aufbau(vorher, [['a.webp', 'ki-erzeugt', 'nein']]);
    const s = f.lauf(...args.map((a) => a ?? f.exp));
    assert.equal(s.status, 0, `${args[0]}: ${s.stdout}${s.stderr}`);
    const nachher = readFileSync(f.ziel, 'utf8');
    assert.match(nachher, /^\/\/ Angelegt von cw-core/, `${args[0]}: Kopf ersetzt`);
    assert.doesNotMatch(nachher, /ERZEUGTE DATEI/, args[0]);
  }
});

test('I9. Verzeichnis-Präfix über gekennzeichnetem Stem: Exit 2, nicht geschrieben (cw-core#280)', () => {
  const stemKi = regelZeile('stem', 'hero-ki', { h: 'ki-erzeugt', d: 'ja', b: B });
  const vorher = ERZEUGT([stemKi]);
  const { ziel, exp, lauf } = aufbau(vorher, [['images/', 'mensch', null]]);
  const repo = join(ziel, '..', '..', '..');

  // GEGENPROBE zuerst: ohne Bilddatei unter dem Präfix verliert kein Bild etwas, der Lauf schreibt.
  const ohne = lauf('--export', exp);
  assert.equal(ohne.status, 0, ohne.stderr + ohne.stdout);

  mkdirSync(join(repo, 'public/images'), { recursive: true });
  writeFileSync(join(repo, 'public/images/hero-ki.webp'), '');
  const probe = lauf('--export', exp);
  assert.equal(probe.status, 2, probe.stderr + probe.stdout);
  assert.match(probe.stdout, /Kennzeichnung fiele weg für Bild: images\/hero-ki\.webp/);

  const s = lauf('--export', exp, '--schreiben');
  assert.equal(s.status, 2, s.stderr + s.stdout);
  assert.match(s.stderr, /0 Regeln, 1 Bilder verlören die Kennzeichnung — NICHT geschrieben/);
  assert.equal(readFileSync(ziel, 'utf8'), vorher, 'Datei unverändert');

  // Der bestehende Ausweg gilt auch hier.
  const ok = lauf('--export', exp, '--schreiben', '--kennzeichnung-weg-ok');
  assert.equal(ok.status, 0, ok.stderr + ok.stdout);
  assert.ok(readFileSync(ziel, 'utf8').includes("pathPrefix: 'images/'"));
});

// ─── cw-core#280: Meldungen des Export-Laufs (Review von #288, Befunde 4 und 6) ──────────
test('I11. Bild unter src/ verliert die Kennzeichnung: einmal gemeldet, Regeln und Bilder getrennt gezählt', () => {
  const stemKi = regelZeile('stem', 'hero-ki', { h: 'ki-erzeugt', d: 'ja', b: B });
  const { ziel, exp, lauf } = aufbau(ERZEUGT([stemKi]), []);
  const repo = join(ziel, '..', '..', '..');
  // Export ordnet denselben Stem als `mensch` ein: ein Verlust, als Regel UND als Bild sichtbar.
  const e = JSON.parse(readFileSync(exp, 'utf8'));
  e.sites.probe = [{ datei: 'src/assets/hero-ki.webp', key: 'stem', wert: 'hero-ki', herkunft: 'mensch', deepfake: null, begruendung: null }];
  writeFileSync(exp, JSON.stringify(e));
  mkdirSync(join(repo, 'src/assets'), { recursive: true });
  writeFileSync(join(repo, 'src/assets/hero-ki.webp'), '');
  const probe = lauf('--export', exp);
  assert.equal(probe.status, 2, probe.stderr + probe.stdout);
  const zeilen = probe.stdout.split('\n').filter((z) => z.includes('Kennzeichnung fiele weg für Bild:'));
  assert.deepEqual(zeilen.map((z) => z.trim()), ['Kennzeichnung fiele weg für Bild: src/assets/hero-ki.webp']);
  assert.match(probe.stdout, /entfernen würde: 1 Regeln, 1 Bilder/);
  assert.match(probe.stdout, /probe .* 1\/1 ✗/);
  const s = lauf('--export', exp, '--schreiben');
  assert.match(s.stderr, /1 Regeln, 1 Bilder verlören die Kennzeichnung — NICHT geschrieben/);
});

test('I12. Lesefehler im Bildordner und unauswertbare Regel ergeben zwei verschiedene Meldungen', () => {
  // (a) Regel mit einer Konstante aus dem Vorspann (Bauform haarwerk): Auswertung scheitert.
  const konst = "  { stem: 'x', herkunft: 'ki-erzeugt', deepfake: 'ja', begruendung: KI_BEGRUENDUNG_STANDARD },";
  const a = aufbau(ERZEUGT([konst]), [['a.webp', 'ki-erzeugt', 'nein']]);
  const ra = a.lauf('--export', a.exp);
  assert.equal(ra.status, 3, ra.stderr + ra.stdout);
  assert.match(ra.stdout, /gemischte Regeln nicht auswertbar — .*KI_BEGRUENDUNG_STANDARD/);

  // (b) Gültige Regeln, aber ein Bildordner ohne Leserecht.
  const b = aufbau(ERZEUGT([r('a.webp')]), [['a.webp', 'ki-erzeugt', 'nein']]);
  const gesperrt = join(b.ziel, '..', '..', '..', 'public', 'gesperrt');
  mkdirSync(gesperrt, { recursive: true });
  chmodSync(gesperrt, 0o000);
  try {
    const rb = b.lauf('--export', b.exp);
    assert.equal(rb.status, 3, rb.stderr + rb.stdout);
    assert.match(rb.stdout, /Bilddateien der Site nicht lesbar — .*EACCES/);
    assert.doesNotMatch(rb.stdout, /gemischte Regeln nicht auswertbar/);
  } finally {
    chmodSync(gesperrt, 0o755);
  }
});
