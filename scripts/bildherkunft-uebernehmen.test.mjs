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
 *   I8  Handabsatz im erzeugten Kopf: `--kopf` und Export brechen ab (Exit 3), Datei unverändert
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
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

test('I8. Handabsatz im erzeugten Kopf: --kopf und Export brechen ab, Datei unverändert', () => {
  const vorher = ERZEUGT([r('a.webp')]).replace('\n// Site:', '\n// AUSNAHME probe: von Hand, steht im Kopf.\n// Site:');
  const { ziel, exp, lauf } = aufbau(vorher, [['a.webp', 'ki-erzeugt', 'nein'], ['c.webp', 'ki-erzeugt', 'nein']]);
  for (const args of [['--kopf', '--schreiben'], ['--export', exp, '--schreiben']]) {
    const s = lauf(...args);
    assert.equal(s.status, 3, `${args[0]}: ${s.stdout}${s.stderr}`);
    assert.match(s.stdout + s.stderr, /Kopf weicht ab Zeile 2 .*AUSNAHME probe/, args[0]);
    assert.doesNotMatch(s.stdout + s.stderr, /nicht lesbar/, args[0]);
    assert.equal(readFileSync(ziel, 'utf8'), vorher, args[0]);
  }
  // Gegenprobe: derselbe Absatz hinter `// Site:` läuft durch.
  const dahinter = ERZEUGT([r('a.webp')]).replace('\n//\n// Ergänzt', '\n// AUSNAHME probe: von Hand.\n//\n// Ergänzt');
  const g = aufbau(dahinter, []);
  const k = g.lauf('--kopf', '--schreiben');
  assert.equal(k.status, 0, k.stdout);
  assert.match(readFileSync(g.ziel, 'utf8'), /AUSNAHME probe: von Hand\./);
});
