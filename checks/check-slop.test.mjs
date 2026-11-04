// @ts-check
// Abnahme für check-slop.mjs — startet das Skript als Kindprozess gegen die Fixtures unter
// fixtures/slop/. Jede Probe kann rot werden: die Slop-Seite muss Exit 1 liefern, die saubere
// Seite Exit 0, ein toter Port Exit 2, ein Tippfehler in der Allowlist Exit 64. Die Sabotage-
// Gegenprobe schaltet per Allowlist jede gefundene Regel ab und erwartet Exit 0 — sonst hängt
// der Befund nicht an der Allowlist, sondern an etwas anderem.
//
//   pnpm test:slop        (≈ 1 min, braucht npx-Zugriff auf impeccable@4.8.0 — beim ersten Lauf Netz)

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HIER = path.dirname(fileURLToPath(import.meta.url));
const SKRIPT = path.join(HIER, 'check-slop.mjs');
const FIX = path.join(HIER, 'fixtures', 'slop');
const TMP = mkdtempSync(path.join(tmpdir(), 'check-slop-test-'));

/** @param {string[]} args */
function lauf(args) {
  const r = spawnSync(process.execPath, [SKRIPT, ...args], { encoding: 'utf8', timeout: 600_000 });
  const zeilen = (r.stdout ?? '').trim().split('\n');
  const schluss = zeilen.find((z) => z.startsWith('slop ')) ?? '';
  /** @param {string} k */
  const wert = (k) => { const m = schluss.match(new RegExp(`(?:^|\\s)${k}=(\\S*)`)); return m ? m[1] : undefined; };
  return { rc: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '', schluss, summe: wert('summe'), allowlist: wert('allowlist'), befund: wert('befund') };
}

function freierPort() {
  return new Promise((res, rej) => {
    const s = createServer();
    s.on('error', rej);
    s.listen(0, '127.0.0.1', () => { const a = s.address(); const p = typeof a === 'object' && a ? a.port : 0; s.close(() => res(p)); });
  });
}

let summeMit = -1, allowMit = -1, summeOhne = -1;

test('Slop-Fixture: Exit 1, Befunde > 0, Allowlist greift', () => {
  const r = lauf(['--dist', path.join(FIX, 'slop'), '--breiten', '1280', '--out', path.join(TMP, 'slop')]);
  assert.equal(r.rc, 1, r.stdout + r.stderr);
  summeMit = Number(r.summe); allowMit = Number(r.allowlist);
  assert.ok(summeMit > 0, `summe=${r.summe}`);
  assert.ok(allowMit > 0, `allowlist=${r.allowlist} — die Fixture trifft keine Allowlist-Regel mehr (side-tab, ai-color-palette)`);
  assert.equal(r.befund, 'ja');
  for (const regel of ['low-contrast', 'undersized-ui-text', 'gradient-text', 'line-length', 'pulsing-dot']) {
    assert.match(r.schluss, new RegExp(`regeln=\\S*${regel}`), `Regel ${regel} fehlt in: ${r.schluss}`);
  }
  // Der Proxy-Tag /js/script.js läuft unter `serve` auf 404; Chromium führt das nicht aus, also kein
  // script-error. Käme hier einer, läge eine Datei mit HTML-Inhalt in der Fixture (blitzsicht 04.11.2026).
  assert.doesNotMatch(r.schluss, /script-error/, `script-error in der Slop-Fixture: ${r.schluss}`);
});

test('Skriptfehler-Fixture: Syntaxfehler im Seitenskript → Exit 1, script-error', () => {
  const r = lauf(['--dist', path.join(FIX, 'skriptfehler'), '--breiten', '1280', '--out', path.join(TMP, 'skriptfehler')]);
  assert.equal(r.rc, 1, r.stdout + r.stderr);
  assert.match(r.schluss, /regeln=\S*script-error/, r.schluss);
});

test('Slop-Fixture ohne Allowlist: mehr Befunde, Differenz = Allowlist-Treffer', () => {
  const r = lauf(['--dist', path.join(FIX, 'slop'), '--breiten', '1280', '--ohne-allowlist', '--out', path.join(TMP, 'slop-ohne')]);
  assert.equal(r.rc, 1, r.stdout + r.stderr);
  summeOhne = Number(r.summe);
  assert.equal(r.allowlist, '0');
  assert.ok(summeOhne > summeMit, `ohne=${summeOhne} mit=${summeMit} — Gleichstand heißt: die Allowlist unterdrückt nichts`);
  assert.equal(summeOhne, summeMit + allowMit);
});

test('Saubere Fixture: Exit 0, 0 Befunde', () => {
  const r = lauf(['--dist', path.join(FIX, 'sauber'), '--breiten', '1280', '--out', path.join(TMP, 'sauber')]);
  assert.equal(r.rc, 0, r.stdout + r.stderr);
  assert.equal(r.summe, '0');
  assert.equal(r.befund, 'nein');
});

test('Toter Port: Exit 2, ungeprueft', async () => {
  const port = await freierPort();
  const r = lauf(['--url', `http://127.0.0.1:${port}/`, '--breiten', '1280', '--out', path.join(TMP, 'tot')]);
  assert.equal(r.rc, 2, r.stdout + r.stderr);
  assert.match(r.stdout, /ungeprueft/);
  assert.equal(r.summe, '?');
});

test('Allowlist mit Tippfehler: Exit 64, nichts wird still abgeschaltet', () => {
  const datei = path.join(TMP, 'allowlist-tippfehler.json');
  writeFileSync(datei, JSON.stringify({ regeln: { 'low-contrast': 'Probe mit echter Regel', 'low-contrst': 'Tippfehler, darf nicht durchgehen' } }));
  const r = lauf(['--dist', path.join(FIX, 'slop'), '--breiten', '1280', '--allowlist', datei, '--out', path.join(TMP, 'tippfehler')]);
  assert.equal(r.rc, 64, r.stdout + r.stderr);
  assert.match(r.stderr, /low-contrst/);
});

test('Sabotage-Gegenprobe: Allowlist mit jeder gefundenen Regel → Exit 0', () => {
  // Regeln aus dem Lauf ohne Allowlist einsammeln; die Allowlist deckt dann alles ab.
  const messung = JSON.parse(readFileSync(path.join(TMP, 'slop-ohne', 'messung.json'), 'utf8'));
  const regeln = {};
  for (const e of messung.ergebnisse) for (const b of e.befunde) regeln[b.antipattern] = 'Sabotage-Gegenprobe im Test: jede Regel der Fixture';
  assert.ok(Object.keys(regeln).length >= 8, `nur ${Object.keys(regeln).length} Regeln gefunden`);
  const datei = path.join(TMP, 'allowlist-alles.json');
  writeFileSync(datei, JSON.stringify({ regeln }));
  const r = lauf(['--dist', path.join(FIX, 'slop'), '--breiten', '1280', '--allowlist', datei, '--out', path.join(TMP, 'alles')]);
  assert.equal(r.rc, 0, r.stdout + r.stderr);
  assert.equal(r.summe, '0');
  assert.equal(Number(r.allowlist), summeOhne, 'alle Primärbefunde müssen als Allowlist-Treffer gezählt sein');
});

test('Aufruf ohne --url/--dist: Exit 64', () => {
  const r = lauf(['--breiten', '1280']);
  assert.equal(r.rc, 64);
});
