import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ALTLASTEN, MINDESTENS_TAGS, LETZTER_TAG_OHNE_BLOCK,
  pruefeTagGleichheit, versionsBlock, versionsBloecke, blockHash, formatiereTagBefunde, zaehlzeile,
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

test('#273 T1: ein Präreleasetag ohne eigenen Block ist kein vergessenes Release', () => {
  const m = md('## v0.195.0 (2026-11-10)\n\n- neu\n');
  const r = pruefeTagGleichheit(m, tags({}), {}, ['v0.195.0-rc.1', 'v0.14.1-alpha']);
  assert.deepEqual(r.befunde, [], formatiereTagBefunde(r));
  // GEGENPROBE: dieselbe Version ohne Suffix und ohne Block bleibt rot (v0.195.0 > v0.62.0).
  const rot = pruefeTagGleichheit(m, tags({}), {}, ['v0.196.0']);
  assert.equal(rot.befunde.length, 1);
  assert.match(rot.befunde[0].grund, /hat in seinem CHANGELOG keinen Block/);
  // Ein rc MIT eigenem Block wird weiter verglichen.
  const rcTag = '## v0.195.0-rc.1 (2026-11-09)\n\n- rc\n';
  const r2 = pruefeTagGleichheit(md(rcTag.replace('- rc', '- rc, nachträglich geändert')), tags({ 'v0.195.0-rc.1': rcTag }), {});
  assert.equal(r2.befunde.length, 1);
  assert.equal(r2.befunde[0].version, 'v0.195.0-rc.1');
});

test('#273 T9: Versionsvergleich aus changelog-kunde — numerisch, Präreleases vor ihrer Version', async () => {
  const { compareVersions } = await import('./changelog-kunde.mjs');
  assert.ok(compareVersions('v0.100.0', 'v0.62.0') > 0, 'lexikalisch wäre "v0.100" < "v0.62"');
  assert.ok(compareVersions('v0.9.10', 'v0.9.9') > 0);
  assert.ok(compareVersions('v0.62.0-rc.1', 'v0.62.0') < 0);
  // Darum ändert der Wechsel nichts an LETZTER_TAG_OHNE_BLOCK: Präreleases überspringt T1 vorher.
  const r = pruefeTagGleichheit(md(), tags({}), {}, ['v0.62.0', 'v0.61.9']);
  assert.deepEqual(r.befunde, []);
});

test('#273 T10: versionsBloecke liefert dasselbe wie der Einzelaufruf, je Version der erste Block', () => {
  const m = md(
    '## [Unreleased]\n\n- offen\n',
    '## v0.194.0 (2026-11-08)\n\n- A\n',
    '## v0.194.0\n\n- ohne Leerzeichen danach: kein Treffer\n',
    '## v0.193.0 (2026-11-06)\n\n- B\n',
    '## v0.194.0 (2026-11-09)\n\n- Dublette, die erste gewinnt\n',
  );
  const alle = versionsBloecke(m);
  // `## [Unreleased]` hat kein Leerzeichen nach dem Namen und trifft wie bisher keinen Block.
  assert.deepEqual([...alle.keys()], ['v0.194.0', 'v0.193.0']);
  assert.match(alle.get('v0.194.0').text, /- A/);
  assert.doesNotMatch(alle.get('v0.194.0').text, /Dublette|ohne Leerzeichen/);
  assert.deepEqual(versionsBlock(m, 'v0.193.0'), alle.get('v0.193.0'));
  // Referenz: der Einzelaufruf bis v0.195.0, wörtlich (findIndex je Version).
  const alt = (text, version) => {
    const z = text.split('\n');
    const a = z.findIndex((t) => t.startsWith(`## ${version} `));
    if (a < 0) return null;
    let e = z.findIndex((t, i) => i > a && t.startsWith('## '));
    if (e < 0) e = z.length;
    return { start: a + 1, text: z.slice(a, e).join('\n') };
  };
  for (const v of ['v0.194.0', 'v0.193.0', '[Unreleased]', 'v0.1.0']) assert.deepEqual(alle.get(v) ?? null, alt(m, v), v);
});

test('versionsBlock trifft die Version genau, nicht ihr Präfix (v0.9.8 ≠ v0.9.8-alpha, v0.19.0 ≠ v0.194.0)', () => {
  const m = md('## v0.9.8-alpha (2026-01-01)\n\n- alpha\n', '## v0.194.0 (2026-11-08)\n\n- neu\n');
  assert.equal(versionsBlock(m, 'v0.9.8'), null);
  assert.equal(versionsBlock(m, 'v0.19.0'), null);
  assert.match(versionsBlock(m, 'v0.194.0').text, /- neu/);
});

test('Lief-nie-Schutz: die Schwelle liegt unter dem gemessenen Stand und über null', () => {
  assert.ok(MINDESTENS_TAGS >= 170 && MINDESTENS_TAGS <= 176, 'gemessen 176 Tags mit eigenem Block (09.11.2026)');
  // T2 (#273): Obergrenze, keine Gleichheit. Wer eine Altlast wiederherstellt, streicht sie (die Ratsche
  // verlangt das); die Liste darf schrumpfen, nie wachsen.
  assert.ok(Object.keys(ALTLASTEN).length <= 14, 'ALTLASTEN darf nicht wachsen (14 am 09.11.2026)');
  // #286: Nur die Zahl hielt „einen streichen, einen falschen dazu“ nicht auf. Jeder Name muss aus
  // dem Stand vom 09.11.2026 stammen; schrumpfen darf die Liste weiter.
  const STAND_0911 = ['v0.190.0', 'v0.163.0', 'v0.126.0', 'v0.120.0', 'v0.108.0', 'v0.107.0', 'v0.101.0',
    'v0.99.1', 'v0.99.0', 'v0.97.3', 'v0.97.1', 'v0.97.0', 'v0.95.0', 'v0.94.0'];
  for (const v of Object.keys(ALTLASTEN)) assert.ok(STAND_0911.includes(v), `${v} stand am 09.11.2026 nicht in ALTLASTEN`);
  for (const [v, h] of Object.entries(ALTLASTEN)) assert.match(h, /^[0-9a-f]{12}$/, `${v} braucht einen Hash`);
});

// ── cw-core#286 (Nachlese Review #284): Präreleases, Suffixe, unlesbare Versionen ─────────────

test('#286: rc-Block nach der Umbenennung zum Release ist kein fehlender Block', () => {
  // cw-release benennt `## v0.195.0-rc.1` beim Final-Release in `## v0.195.0` um. Vorher meldete
  // der Lint dann „Block fehlt, sein Tag hat ihn“, und pnpm test blieb rot.
  const rcTag = '## v0.195.0-rc.1 (2026-11-09)\n\n- rc\n';
  const umbenannt = md('## v0.195.0 (2026-11-10)\n\n- rc\n- danach dazu\n');
  const r = pruefeTagGleichheit(umbenannt, tags({ 'v0.195.0-rc.1': rcTag }), {});
  assert.deepEqual(r.befunde, [], formatiereTagBefunde(r));
  // GEGENPROBE: weder rc- noch Release-Block da → weiter rot.
  const weg = pruefeTagGleichheit(md(B193), tags({ 'v0.195.0-rc.1': rcTag }), {});
  assert.equal(weg.befunde.length, 1);
  assert.match(weg.befunde[0].grund, /Block `## v0\.195\.0-rc\.1 …` fehlt/);
  // GEGENPROBE: ein umbenannter Release-Block entbindet nur Präreleases, nicht das Release selbst.
  const rel = pruefeTagGleichheit(md(B193), tags({ 'v0.195.0': '## v0.195.0 (x)\n' }), {});
  assert.equal(rel.befunde.length, 1);
});

test('Review r35: nur ein rc-Block geht im Release auf — ein fehlender alpha-/beta-Block bleibt rot', () => {
  // cw-release benennt nur `-rc.N` um. Ein alpha-Tag mit eigenem Block, dessen Block heute fehlt,
  // ist verloren, auch wenn das Release dieselbe Nummer trägt.
  for (const v of ['v0.197.0-alpha', 'v0.197.0-beta.1']) {
    const r = pruefeTagGleichheit(md('## v0.197.0 (x)\n\n- r\n'), tags({ [v]: `## ${v} (x)\n\n- a\n` }), {});
    assert.equal(r.befunde.length, 1, `${v}: ${formatiereTagBefunde(r)}`);
    assert.match(r.befunde[0].grund, /fehlt, sein Tag hat ihn/);
  }
});

test('#286: nur alpha/beta/rc gelten als Prärelease ohne Block, `-hotfix` nicht', () => {
  // `v0.197.0-alpha*` liegen über LETZTER_TAG_OHNE_BLOCK: ohne Prärelease-Logik wären sie rot
  // (Review r35, Befund 7 — `v0.14.1-alpha` allein war nicht trennscharf).
  const r = pruefeTagGleichheit(md(), tags({}), {}, ['v0.197.0-hotfix', 'v0.197.0-rc.2', 'v0.197.0-beta', 'v0.14.1-alpha', 'v0.197.0-alpha', 'v0.197.0-alpha.3']);
  assert.deepEqual(r.befunde.map((b) => b.version), ['v0.197.0-hotfix'], formatiereTagBefunde(r));
  assert.match(r.befunde[0].grund, /hat in seinem CHANGELOG keinen Block/);
});

test('#286: eine unlesbare Version ist ein Befund, kein stilles „erlaubt ohne Block“ (fail-closed)', () => {
  // compareVersions gibt dafür NaN, und `NaN > 0` ist falsch.
  const r = pruefeTagGleichheit(md(), tags({}), {}, ['vkaputt', 'v0.62.0']);
  assert.deepEqual(r.befunde.map((b) => b.version), ['vkaputt'], formatiereTagBefunde(r));
  assert.match(r.befunde[0].grund, /Version nicht lesbar/);
});
