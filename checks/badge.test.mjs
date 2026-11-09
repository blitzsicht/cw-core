// @ts-check
// Abnahme der vier Badge-Werkzeuge gegen die Fixtures unter fixtures/badge/.
// Ein Wegwerf-Server, drei Routen: zwei mit vier `.step-badge`, eine ohne.
//
// Jede Probe kann rot werden, und zu jedem Werkzeug steht hier die Gegenprobe
// daneben — die Route OHNE Badges muss jedes der drei Werkzeuge rot machen.
// Ein Lauf über null Badges ist grün und belegt nichts; genau das war der Defekt
// der Vorfassung aus dem Gate-Worktree (HANDBOOK §2.6, „kann nicht rot werden").
//
//   pnpm test:badges        (≈ 1–2 min, braucht Chromium aus checks/node_modules)

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HIER = path.dirname(fileURLToPath(import.meta.url));
const FIX = path.join(HIER, 'fixtures', 'badge');
const SERVE = path.join(HIER, 'node_modules', '.bin', 'serve');
const PLAYWRIGHT = path.join(HIER, 'node_modules', '.bin', 'playwright');
const TMP = mkdtempSync(path.join(tmpdir(), 'badge-test-'));

const MIT = '/,/unterseite/tief/';
const OHNE = '/ohne/';

/** @type {import('node:child_process').ChildProcess | undefined} */
let server;
let BASE = '';

function freierPort() {
  return new Promise((res, rej) => {
    const s = createServer();
    s.on('error', rej);
    s.listen(0, '127.0.0.1', () => {
      const a = s.address();
      const p = typeof a === 'object' && a ? a.port : 0;
      s.close(() => res(p));
    });
  });
}

before(async () => {
  const port = await freierPort();
  BASE = `http://127.0.0.1:${port}`;
  server = spawn(SERVE, [FIX, '-l', String(port)], { stdio: 'ignore' });
  // Warten, bis der Server antwortet — und gleich belegen, dass es UNSER Server
  // ist. Am 09.11.2026 hielt ein fremder Node-Prozess den fest verdrahteten Port
  // 4399 und antwortete mit 404; der Lauf meldete korrekt „kein .step-badge" und
  // mass dabei die falsche Seite („falscher Referent", HANDBOOK §2.6).
  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch(`${BASE}/`);
      const html = await r.text();
      if (r.status === 200 && html.includes('class="step-badge"')) return;
    } catch {
      /* noch nicht da */
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`Fixture-Server auf ${BASE} liefert keine Seite mit .step-badge`);
});

after(() => {
  server?.kill();
});

/**
 * @param {string} skript
 * @param {string[]} args
 * @param {Record<string,string>} [env]
 */
function lauf(skript, args, env = {}) {
  const r = spawnSync(process.execPath, [path.join(HIER, skript), ...args], {
    encoding: 'utf8',
    timeout: 300_000,
    cwd: HIER,
    env: { ...process.env, ...env },
  });
  return { rc: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

/**
 * @param {Record<string,string>} env
 * @param {string[]} [args]
 */
function diff(env, args = []) {
  const r = spawnSync(PLAYWRIGHT, ['test', '--config', 'badge-diff.config.ts', ...args], {
    encoding: 'utf8',
    timeout: 600_000,
    cwd: HIER,
    env: { ...process.env, BADGE_BASE_URL: BASE, BADGE_BREITEN: '390', ...env },
  });
  return { rc: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

/** @param {string} dir */
const pngs = (dir) => {
  /** @type {string[]} */
  const out = [];
  /** @param {string} d */
  const geh = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.isDirectory()) geh(path.join(d, e.name));
      else if (e.name.endsWith('.png')) out.push(e.name);
    }
  };
  geh(dir);
  return out.sort();
};

const SNAP = path.join(TMP, 'snapshots');

test('badge-styles: zwei Routen mit Badges → Exit 0, vier SVG je Messung', () => {
  const r = lauf('badge-styles.mjs', [BASE], { BADGE_SEITEN: MIT, BADGE_BREITEN: '390,1400' });
  assert.equal(r.rc, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /fertig: 4 von 4 Messungen mit Badge/, r.stdout);
  assert.equal((r.stdout.match(/"anzahl":4/g) ?? []).length, 4, r.stdout);
  // Die Stile, um die es im Vergleich geht — nicht nur „irgendwas gefunden".
  assert.match(r.stdout, /"strokeWidth":"1\.75px"/, r.stdout);
  assert.match(r.stdout, /"ariaHidden":"true"/, r.stdout);
});

test('GEGENPROBE badge-styles: Route ohne Badges → Exit 1', () => {
  const r = lauf('badge-styles.mjs', [BASE], { BADGE_SEITEN: OHNE, BADGE_BREITEN: '390' });
  assert.equal(r.rc, 1, r.stdout + r.stderr);
  assert.match(r.stderr, /ABBRUCH: kein \.step-badge svg/, r.stderr);
});

test('badge-shots: 2 Routen × 2 Breiten × 4 Badges = 16 PNG, Slug mit Bindestrichen', () => {
  const out = path.join(TMP, 'shots');
  const r = lauf('badge-shots.mjs', [BASE, out], { BADGE_SEITEN: MIT, BADGE_BREITEN: '390,1400' });
  assert.equal(r.rc, 0, r.stdout + r.stderr);
  const dateien = pngs(out);
  assert.equal(dateien.length, 16, dateien.join(' '));
  assert.match(r.stdout, /fertig: 16 Shots über 2 Seite\(n\) × 2 Breite\(n\)/, r.stdout);
  // Die tiefe Route darf nicht zu „unterseitetief" verschmelzen: die Vorfassung
  // ersetzte jeden Schrägstrich durch nichts, zwei Routen konnten denselben
  // Dateinamen erzeugen und sich im Vergleich gegenseitig überschreiben.
  assert.ok(dateien.includes('unterseite-tief-390-0.png'), dateien.join(' '));
  assert.ok(dateien.includes('start-1400-3.png'), dateien.join(' '));
});

test('GEGENPROBE badge-shots: Route ohne Badges → Exit 1, kein PNG', () => {
  const out = path.join(TMP, 'shots-ohne');
  const r = lauf('badge-shots.mjs', [BASE, out], { BADGE_SEITEN: OHNE, BADGE_BREITEN: '390' });
  assert.equal(r.rc, 1, r.stdout + r.stderr);
  assert.match(r.stderr, /ABBRUCH: 0 Shots/, r.stderr);
  assert.equal(pngs(out).length, 0);
});

test('Rückfall ohne BADGE_SEITEN: Warnung und genau eine Route', () => {
  // Nicht still: wer die Variable vergisst, soll nicht glauben, die ganze Seite
  // sei geprüft worden. Derselbe Anlass wie in seiten.ts.
  const r = lauf('badge-styles.mjs', [BASE], { BADGE_SEITEN: '', BADGE_BREITEN: '390' });
  assert.match(r.stderr, /\[badge\] BADGE_SEITEN nicht gesetzt/, r.stderr);
  assert.equal(r.rc, 0, r.stdout + r.stderr);
  assert.equal((r.stdout.match(/"anzahl":4/g) ?? []).length, 1, r.stdout);
});

test('badge-diff: Baseline aufnehmen → Exit 0, 8 Snapshots', () => {
  const r = diff({ BADGE_SEITEN: MIT, BADGE_SNAPSHOT_DIR: SNAP }, ['--update-snapshots']);
  assert.equal(r.rc, 0, r.stdout + r.stderr);
  assert.equal(pngs(SNAP).length, 8, pngs(SNAP).join(' '));
  assert.match(r.stdout, /\[badge\] @390: 8 Badges auf 2 von 2 Seiten/, r.stdout);
});

test('badge-diff: derselbe Stand gegen die Baseline → Exit 0', () => {
  const r = diff({ BADGE_SEITEN: MIT, BADGE_SNAPSHOT_DIR: SNAP });
  assert.equal(r.rc, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /2 passed|1 passed/, r.stdout);
});

test('SABOTAGE badge-diff: ein Baseline-Bild vertauscht → Exit ≠ 0 mit Pixelzahl', () => {
  // Der Kern des Werkzeugs. Ohne diese Probe belegt „grün" nur, dass der Lauf
  // durchlief — nicht, dass er einen Unterschied sehen würde.
  const alle = pngs(SNAP);
  const a = path.join(SNAP, alle[0]);
  const b = path.join(SNAP, alle[1]);
  const vorher = readFileSync(a);
  writeFileSync(a, readFileSync(b));
  try {
    const r = diff({ BADGE_SEITEN: MIT, BADGE_SNAPSHOT_DIR: SNAP });
    assert.notEqual(r.rc, 0, 'vertauschte Baseline blieb grün — der Vergleich sieht nichts');
    assert.match(r.stdout, /pixels \(ratio [\d.]+ of all image pixels\) are different/, r.stdout);
  } finally {
    writeFileSync(a, vorher);
  }
});

test('GEGENPROBE badge-diff: Route ohne Badges → Exit ≠ 0, „NICHTS verglichen"', () => {
  const r = diff({ BADGE_SEITEN: OHNE, BADGE_SNAPSHOT_DIR: path.join(TMP, 'snap-ohne') });
  assert.notEqual(r.rc, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /dieser Lauf hat NICHTS verglichen/, r.stdout);
});

test('Die Flotten-Guards sammeln badge-diff NICHT ein (testIgnore)', () => {
  // Gemessen am 09.11.2026: ohne testIgnore sammelt `testDir: '.'` den Spec
  // rekursiv mit ein, 18 Tests in 3 Dateien wurden zu 22 in 4 — in den Projekten
  // mobile UND tablet. Jedes Kundenrepo hätte bei `pnpm test` versucht,
  // Badge-Screenshots gegen ein nicht vorhandenes Baseline-Verzeichnis zu prüfen.
  const guards = spawnSync(PLAYWRIGHT, ['test', '--list', '--project=mobile', '--project=tablet'], {
    encoding: 'utf8', timeout: 300_000, cwd: HIER,
  });
  const aus = (guards.stdout ?? '') + (guards.stderr ?? '');
  assert.doesNotMatch(aus, /badge\.spec\.ts/, aus.slice(-800));
  assert.match(aus, /in 3 files/, aus.slice(-400));

  // Gegenstück: unter der eigenen Config IST der Spec da. Sonst wäre die Zeile
  // oben auch erfüllt, wenn es den Spec gar nicht gibt.
  const eigen = spawnSync(PLAYWRIGHT, ['test', '--config', 'badge-diff.config.ts', '--list'], {
    encoding: 'utf8', timeout: 300_000, cwd: HIER, env: { ...process.env, BADGE_SEITEN: MIT },
  });
  const ausE = (eigen.stdout ?? '') + (eigen.stderr ?? '');
  assert.match(ausE, /badge\.spec\.ts/, ausE.slice(-800));
});
