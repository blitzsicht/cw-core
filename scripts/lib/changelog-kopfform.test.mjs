import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pruefeChangelogKopfform, formatiereBefunde } from './changelog-kopfform.mjs';
import { parseChangelog } from './changelog-kunde.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const gruende = (md) => pruefeChangelogKopfform(md).map((b) => `${b.zeile}`);

// ── Der eigentliche Check: der Changelog DIESES Repos. Läuft bei jedem PR mit und ist der
//    einzige Teil, der einen echten Fehler verhindert statt ihn nur zu beschreiben.

test('CHANGELOG.md dieses Repos ist in Normform', () => {
  const befunde = pruefeChangelogKopfform(readFileSync(join(ROOT, 'CHANGELOG.md'), 'utf-8'));
  assert.deepEqual(befunde, [], `Kopfzeilen außerhalb der Normform:\n${formatiereBefunde(befunde)}`);
});

// ── GEGENPROBEN gegen echte Stände aus der Historie. Der Anlass in cw-core#222 nennt #213;
//    gemessen am 06.11.2026 trägt dessen gepushter Stand (824c19a2) die KORREKTE Form — die
//    Behauptung ließ sich nicht belegen. Die Fehlform gab es aber wirklich: `c9b5b46d`
//    (PR #172) und `8cd66293` trugen `## Unreleased` in Zeile 25.
//    Nachstellen: `git show c9b5b46d:CHANGELOG.md | grep -n '^## Unreleased'`

test('GEGENPROBE `## Unreleased` ohne Klammern wird rot, mit Zeilennummer', () => {
  const md = '# Changelog\n\n## Unreleased\n\n- [kunde] Etwas Neues.\n\n## v0.192.0 (2026-11-06)\n';
  const b = pruefeChangelogKopfform(md);
  assert.equal(b.length, 1);
  assert.equal(b[0].zeile, 3, 'die Zeilennummer muss stimmen, sonst sucht der Mensch');
  assert.match(b[0].grund, /cw-release benennt nur diese Form um/);
});

test('GEGENPROBE weitere Fehlformen: Klammern um die Version, fehlendes Datum, deutsches Datum', () => {
  for (const kopf of ['## [v0.191.0]', '## v0.191.0', '## v0.191.0 (06.11.2026)', '## v0.191 (2026-11-06)', '## Unreleased (2026-11-06)']) {
    const b = pruefeChangelogKopfform(`# C\n\n${kopf}\n`);
    assert.equal(b.length, 1, `${kopf} muss rot werden`);
    assert.equal(b[0].text, kopf);
  }
});

test('GEGENPROBE zwei [Unreleased]-Blöcke', () => {
  const md = '# C\n\n## [Unreleased]\n\n## [Unreleased]\n\n## v0.1.0 (2026-01-01)\n';
  const b = pruefeChangelogKopfform(md);
  assert.equal(b.length, 1);
  assert.equal(b[0].zeile, 5);
  assert.match(b[0].grund, /zweiter \[Unreleased\]-Block \(der erste steht in Zeile 3\)/);
});

test('GEGENPROBE [Unreleased] unter einer Version — der Befund mit Kundenwirkung', () => {
  const md = '# C\n\n## v0.192.0 (2026-11-06)\n\n- [kunde] Echte Zeile.\n\n## [Unreleased]\n\n- [kunde] NOCH NICHT VERÖFFENTLICHT.\n';
  const b = pruefeChangelogKopfform(md);
  assert.equal(b.length, 1);
  assert.equal(b[0].zeile, 7);
  assert.match(b[0].grund, /parseChangelog\(\) schlägt die \[kunde\]-Zeilen dann der veröffentlichten Version darüber zu/);
  // Und das ist nicht theoretisch — gemessen am 06.11.2026:
  const abschnitte = parseChangelog(md);
  assert.equal(abschnitte.length, 1, 'parseChangelog kennt nur Versions-Header');
  assert.deepEqual(abschnitte[0].kundenzeilen.map((k) => k.text), ['Echte Zeile.', 'NOCH NICHT VERÖFFENTLICHT.'],
    'der unveröffentlichte Satz landet im Kundenreport von v0.192.0 — DAS ist der Schaden, nicht die Form');
  // Gegenprobe zur Gegenprobe: oben stehend fällt er korrekt weg.
  const richtig = '# C\n\n## [Unreleased]\n\n- [kunde] NOCH NICHT VERÖFFENTLICHT.\n\n## v0.192.0 (2026-11-06)\n\n- [kunde] Echte Zeile.\n';
  assert.deepEqual(pruefeChangelogKopfform(richtig), []);
  assert.deepEqual(parseChangelog(richtig)[0].kundenzeilen.map((k) => k.text), ['Echte Zeile.']);
});

// ── Was in Form IST und bleiben muss. Ohne diese Proben wäre „meldet richtig" von
//    „meldet alles" nicht zu unterscheiden — und ein Lint, der die eigene Historie rot
//    macht, wird beim ersten roten Lauf abgeschaltet.

test('in Form: Unreleased oben, Version mit Datum, Präreleasesuffix, freier Zusatz', () => {
  const md = [
    '# Changelog', '', '## [Unreleased]', '', '### Fixed', '', '- irgendwas', '',
    '## v0.192.0 (2026-11-06)', '',
    '## v0.14.5-rc.1 (2026-05-24) — (release/cw-core — Email-Sig TIER-Gating)', '',
    '## v0.7.3-alpha (2026-04-21) — CRITICAL', '',
  ].join('\n');
  assert.deepEqual(pruefeChangelogKopfform(md), []);
});

test('`### `-Zeilen sind nicht berührt, auch wenn sie wie Fehlformen aussehen', () => {
  assert.deepEqual(pruefeChangelogKopfform('# C\n\n## [Unreleased]\n\n### Unreleased\n\n### v1.2.3\n'), []);
});

test('die zwei datumslosen Altlasten sind namentlich erlaubt — und nur sie', () => {
  assert.deepEqual(pruefeChangelogKopfform('# C\n\n## v0.9.9 — 2025 (pre-release)\n## v0.1.0 — Initial (alpha)\n'), []);
  // Eine dritte, die nur so AUSSIEHT, wird rot: die Ausnahme ist wortwörtlich, nicht ein Muster.
  const b = pruefeChangelogKopfform('# C\n\n## v0.9.8 — 2025 (pre-release)\n');
  assert.equal(b.length, 1, 'wer eine dritte Ausnahme braucht, muss die Liste anfassen');
});

test('leere Datei und Datei ohne Kopfzeilen: keine Befunde, kein Absturz', () => {
  for (const md of ['', '\n\n', '# Changelog\n\nNur Text.\n', null, undefined]) {
    assert.deepEqual(pruefeChangelogKopfform(md), []);
  }
});

test('formatiereBefunde nennt Datei, Zeile, Grund und den Wortlaut', () => {
  const t = formatiereBefunde(pruefeChangelogKopfform('# C\n\n## Unreleased\n'));
  assert.match(t, /^CHANGELOG\.md:3: /);
  assert.match(t, /\n {2}## Unreleased$/);
});

// ── Setext-Falle (cw-core#267). Der echte Fall: PR #264 nahm beim Verschieben die Leerzeile
//    vor dem `---` am Ende des v0.194.0-Blocks mit — der Migrations-Hinweis wurde zur <h2>.
//    Nachstellen: `git show 0dd634cf:CHANGELOG.md | sed -n '270,273p'`

test('GEGENPROBE Setext: `---` direkt unter Text wird rot, mit Zeilennummer (der echte Fall aus #264)', () => {
  const md = [
    '# C', '', '## v0.194.0 (2026-11-08)', '',
    '**Migrations-Hinweis:** Keiner. (Im ersten Stand stand der berechnete Wert unter genau diesem',
    'Namen im `style`-Attribut, eine Kundenregel kam nie durch — Review #251, B1–B3.)',
    '---', '', '## v0.193.0 (2026-11-06)', '',
  ].join('\n');
  const b = pruefeChangelogKopfform(md);
  assert.equal(b.length, 1);
  assert.equal(b[0].zeile, 7);
  assert.equal(b[0].text, '---');
  assert.match(b[0].grund, /Setext-Überschrift.*<h2>.*Leerzeile davor setzen/);
  // Gegenprobe: mit der Leerzeile ist es eine Trennlinie und in Ordnung.
  assert.deepEqual(pruefeChangelogKopfform(md.replace('B1–B3.)\n---', 'B1–B3.)\n\n---')), []);
});

test('GEGENPROBE Setext: auch `===` und kürzere Linien, mit Einzug bis 3 Leerzeichen', () => {
  for (const linie of ['===', '--', '   ---', '------  ']) {
    const b = pruefeChangelogKopfform(`# C\n\nEin Absatz.\n${linie}\n`);
    assert.equal(b.length, 1, `${JSON.stringify(linie)} unter Text muss rot werden`);
    assert.equal(b[0].zeile, 4);
  }
  assert.match(pruefeChangelogKopfform('# C\n\nText\n===\n')[0].grund, /<h1>/);
});

test('Setext: keine Meldung, wo CommonMark eine Trennlinie macht', () => {
  const inForm = [
    '## v0.1.0 (2026-01-01)\n---',          // nach ATX-Überschrift
    '- Listenpunkt\n---',                    // nach Listenpunkt
    '- Punkt\n  Fortsetzung eingerückt\n---',// eingerückte Fortsetzung eines Punkts
    '1. Punkt\n---',
    '> Zitat\n---',
    '| a | b |\n---',
    '---\n---',                              // zwei Trennlinien
    'Absatz\n\n---',                         // Leerzeile davor
    'Text\n    ---',                         // 4 Leerzeichen: Fortsetzung, keine Linie
    'Text\n- - -',                           // Leerzeichen dazwischen: keine Setext-Linie
    '```\nCode\n---\n```',                   // im Code-Zaun
  ];
  for (const stueck of inForm) {
    assert.deepEqual(pruefeChangelogKopfform(`# C\n\n${stueck}\n`), [], JSON.stringify(stueck));
  }
});

test('Setext- und Kopfform-Befunde kommen nach Zeile sortiert', () => {
  const b = pruefeChangelogKopfform('# C\n\nText\n---\n\n## Unreleased\n');
  assert.deepEqual(b.map((x) => x.zeile), [4, 6]);
});
