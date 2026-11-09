import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ALTLASTEN, MINDESTENS_TAGS, LETZTER_TAG_OHNE_BLOCK,
  pruefeTagGleichheit, versionsBlock, blockHash, vergleicheVersion, formatiereTagBefunde, zaehlzeile,
} from './changelog-tag-gleich.mjs';
import { tagBloeckeLesen } from './changelog-tag-quelle.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

// ── Der eigentliche Check: der Changelog DIESES Repos gegen alle seine Tags (cw-core#267).
//    Braucht die Tags im Checkout. tests.yml holt sie mit fetch-depth: 0; fehlen sie, wird der
//    Test ROT und nicht still übersprungen — ein Vergleich gegen null Tags ist immer gleich.

test('jeder Versionsblock in CHANGELOG.md gleicht seinem Tag (Altlasten eingefroren)', () => {
  const md = readFileSync(join(ROOT, 'CHANGELOG.md'), 'utf-8');
  const { bloecke, tags, ohneBlock } = tagBloeckeLesen(ROOT);
  assert.ok(
    bloecke.size >= MINDESTENS_TAGS,
    `Nur ${bloecke.size} Tags mit eigenem Block verglichen (${tags} Tags gefunden), erwartet ≥ ${MINDESTENS_TAGS}. `
      + 'Tags fehlen — Checkout mit fetch-depth: 0? Lokal: git fetch --tags origin',
  );
  const ergebnis = pruefeTagGleichheit(md, bloecke, ALTLASTEN, ohneBlock);
  // Die Zählzeile gehört ins Log: ein grüner Haken allein sagt nicht, ob verglichen wurde.
  console.log(`# changelog-tag-gleich: ${zaehlzeile(ergebnis)}`);
  assert.deepEqual(ergebnis.befunde, [], `Versionsblöcke weichen von ihrem Tag ab:\n${formatiereTagBefunde(ergebnis)}`);
  assert.equal(ergebnis.altlasten, Object.keys(ALTLASTEN).length, 'jede Altlast muss gezählt worden sein');
});

// ── Logik mit Mocks.

const md = (...bloecke) => ['# Changelog', '', ...bloecke].join('\n');
const B194 = '## v0.194.0 (2026-11-08)\n\n- Eintrag A.\n\n---\n';
const B193 = '## v0.193.0 (2026-11-06)\n\n- Eintrag B.\n';
const tags = (obj) => new Map(Object.entries(obj));

test('gleich: keine Befunde, Zählung stimmt — auch wenn im Tag andere Blöcke drumherum standen', () => {
  // Im Tag v0.194.0 stand darüber [Unreleased] und darunter noch v0.193.0 mit anderem Text:
  // verglichen wird nur der eigene Block, bis vor die nächste `## `-Zeile.
  const tagStand = md('## [Unreleased]\n\n- damals offen\n', B194, '## v0.193.0 (2026-11-06)\n\n- alter Wortlaut\n');
  const r = pruefeTagGleichheit(md(B194, B193), tags({ 'v0.194.0': versionsBlock(tagStand, 'v0.194.0').text }), {});
  assert.deepEqual(r.befunde, [], formatiereTagBefunde(r));
  assert.equal(r.geprueft, 1);
});

test('GEGENPROBE der echte Fall #262/#245/#263: Eintrag unter schon getaggter Version wird rot', () => {
  const tagStand = md(B194, B193);
  const nachDemTag = md(B194.replace('- Eintrag A.\n', '- Eintrag A.\n- Nachgeschoben nach dem Tag.\n'), B193);
  const r = pruefeTagGleichheit(nachDemTag, tags({ 'v0.194.0': versionsBlock(tagStand, 'v0.194.0').text }), {});
  assert.equal(r.befunde.length, 1);
  assert.equal(r.befunde[0].version, 'v0.194.0');
  assert.equal(r.befunde[0].zeile, 3);
  assert.match(r.befunde[0].grund, /weicht vom Tag release\/cw-core\/v0\.194\.0 ab — neue Einträge gehören unter `## \[Unreleased\]`/);
  assert.match(r.befunde[0].grund, /Erste Abweichung in Zeile 6: jetzt "- Nachgeschoben nach dem Tag\.", im Tag ""/);
});

test('GEGENPROBE der echte Fall #264: nur die Leerzeile vor `---` fehlt — auch das ist eine Abweichung', () => {
  const tagStand = md(B194, B193);
  const ohneLeerzeile = md(B194.replace('A.\n\n---', 'A.\n---'), B193);
  const r = pruefeTagGleichheit(ohneLeerzeile, tags({ 'v0.194.0': versionsBlock(tagStand, 'v0.194.0').text }), {});
  assert.equal(r.befunde.length, 1);
  assert.match(r.befunde[0].grund, /jetzt "---", im Tag ""/);
});

test('GEGENPROBE Block fehlt ganz', () => {
  const r = pruefeTagGleichheit(md(B193), tags({ 'v0.194.0': B194 }), {});
  assert.equal(r.befunde.length, 1);
  assert.match(r.befunde[0].grund, /Block `## v0\.194\.0 …` fehlt, sein Tag hat ihn/);
});

test('Altlast: eingefrorener Hash passt → gezählt, kein Befund', () => {
  const jetzt = md(B194, B193);
  const h = blockHash(versionsBlock(jetzt, 'v0.193.0').text);
  const r = pruefeTagGleichheit(jetzt, tags({ 'v0.193.0': 'ganz anderer Tag-Stand' }), { 'v0.193.0': h });
  assert.deepEqual(r.befunde, []);
  assert.equal(r.altlasten, 1);
});

test('GEGENPROBE Altlast noch einmal geändert → rot, mit beiden Hashes', () => {
  const vorher = md(B194, B193);
  const h = blockHash(versionsBlock(vorher, 'v0.193.0').text);
  const nachher = md(B194, B193.replace('Eintrag B.', 'Eintrag B, still ergänzt.'));
  const r = pruefeTagGleichheit(nachher, tags({ 'v0.193.0': 'Tag-Stand' }), { 'v0.193.0': h });
  assert.equal(r.befunde.length, 1);
  assert.match(r.befunde[0].grund, new RegExp(`^Altlast geändert: Hash [0-9a-f]{12} statt eingefroren ${h}\\.`));
  assert.equal(r.altlasten, 0);
});

test('GEGENPROBE Ratsche: Altlast wieder gleich ihrem Tag → rot, „aus ALTLASTEN streichen“', () => {
  const jetzt = md(B194, B193);
  const r = pruefeTagGleichheit(jetzt, tags({ 'v0.193.0': versionsBlock(jetzt, 'v0.193.0').text }), { 'v0.193.0': 'egal' });
  assert.equal(r.befunde.length, 1);
  assert.match(r.befunde[0].grund, /wieder gleich ihrem Tag — aus ALTLASTEN streichen/);
});

test('GEGENPROBE Altlast ohne verglichenen Tag (Liste veraltet oder Tags fehlen) → rot', () => {
  const r = pruefeTagGleichheit(md(B193), tags({}), { 'v0.150.0': 'abc' });
  assert.equal(r.befunde.length, 1);
  assert.match(r.befunde[0].grund, /steht in ALTLASTEN, aber kein Tag mit diesem Block wurde verglichen/);
});

test('GEGENPROBE Tag nach v0.62.0 ohne eigenen Block → rot; davor erlaubt', () => {
  const r = pruefeTagGleichheit(md(B193), tags({}), {}, ['v0.14.1-alpha', 'v0.62.0', 'v0.195.0']);
  assert.equal(r.befunde.length, 1);
  assert.equal(r.befunde[0].version, 'v0.195.0');
  assert.match(r.befunde[0].grund, /hat in seinem CHANGELOG keinen Block `## v0\.195\.0 …` — das Release hat seinen Eintrag vergessen/);
  assert.equal(LETZTER_TAG_OHNE_BLOCK, 'v0.62.0');
});

test('vergleicheVersion: numerisch, nicht lexikalisch; Suffix zählt als die Version', () => {
  assert.ok(vergleicheVersion('v0.100.0', 'v0.62.0') > 0, 'lexikalisch wäre "v0.100" < "v0.62"');
  assert.ok(vergleicheVersion('v0.9.10', 'v0.9.9') > 0);
  assert.equal(vergleicheVersion('v0.62.0-rc.1', 'v0.62.0'), 0);
  assert.ok(vergleicheVersion('v1.0.0', 'v0.194.2') > 0);
});

test('versionsBlock trifft die Version genau, nicht ihr Präfix (v0.9.8 ≠ v0.9.8-alpha, v0.19.0 ≠ v0.194.0)', () => {
  const m = md('## v0.9.8-alpha (2026-01-01)\n\n- alpha\n', '## v0.194.0 (2026-11-08)\n\n- neu\n');
  assert.equal(versionsBlock(m, 'v0.9.8'), null);
  assert.equal(versionsBlock(m, 'v0.19.0'), null);
  assert.match(versionsBlock(m, 'v0.194.0').text, /- neu/);
});

test('Lief-nie-Schutz: die Schwelle liegt unter dem gemessenen Stand und über null', () => {
  assert.ok(MINDESTENS_TAGS >= 170 && MINDESTENS_TAGS <= 176, 'gemessen 176 Tags mit eigenem Block (09.11.2026)');
  assert.equal(Object.keys(ALTLASTEN).length, 14);
  for (const [v, h] of Object.entries(ALTLASTEN)) assert.match(h, /^[0-9a-f]{12}$/, `${v} braucht einen Hash`);
});
