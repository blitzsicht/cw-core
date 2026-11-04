// @ts-check
/**
 * Abnahme für screenshot-gescrollt.mjs an den Fixtures unter fixtures/leerflaechen/.
 * Jede Probe startet das Skript als Kindprozess (eigener serve + Chromium) und liest die beiden
 * Schlusszeilen so, wie das Gate sie liest (customer-websites/scripts/cw-site-gate.sh).
 *
 * Gegenbeweis-Pflicht: die Probe „ohne Scrollen“ MUSS Strecken melden, sonst ist der Zähler
 * blind; „gescrollt“ muss darunter liegen, sonst hat das Scrollen nichts repariert (Gleichstand =
 * gescheitert). Die Sabotage mit --schwelle 100000 zeigt, dass der Zählwert an der Schwelle hängt
 * und nicht am Fixture.
 *
 *   pnpm test:screens        (≈ 2 min, braucht Chromium: pnpm exec playwright install chromium)
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HIER = path.dirname(fileURLToPath(import.meta.url));
const SKRIPT = path.join(HIER, 'screenshot-gescrollt.mjs');
const FIXTURES = path.join(HIER, 'fixtures', 'leerflaechen');

/**
 * @param {string[]} args
 * @returns {{ code: number, stdout: string, leer: Record<string, number | '?'>, summe: number | '?', hoehen: Record<string, { normal: number, reduce: number }>, befund: string, messung: any }}
 */
function lauf(args) {
  const out = mkdtempSync(path.join(tmpdir(), 'sg-test-'));
  const r = spawnSync(process.execPath, [SKRIPT, ...args, '--out', out], { encoding: 'utf8', timeout: 300_000 });
  const stdout = r.stdout ?? '';
  const leerZeile = stdout.split('\n').find((z) => z.startsWith('leerflaechen ')) ?? '';
  const hoehenZeile = stdout.split('\n').find((z) => z.startsWith('hoehen ')) ?? '';
  /** @type {Record<string, number | '?'>} */
  const leer = {};
  for (const m of leerZeile.matchAll(/ (\S+@\d+)=(\d+|\?)/g)) leer[m[1]] = m[2] === '?' ? '?' : Number(m[2]);
  const summeM = leerZeile.match(/summe=(\d+|\?)/);
  /** @type {Record<string, { normal: number, reduce: number }>} */
  const hoehen = {};
  for (const m of hoehenZeile.matchAll(/ (\S+@\d+)=(\d+)\/(\d+)/g)) hoehen[m[1]] = { normal: Number(m[2]), reduce: Number(m[3]) };
  const befund = hoehenZeile.match(/befund=(\S+)/)?.[1] ?? '';
  let messung = null;
  try { messung = JSON.parse(readFileSync(path.join(out, 'messung.json'), 'utf8')); } catch { /* bei Exit 2 ohne Lauf */ }
  return { code: r.status ?? -1, stdout: stdout + (r.stderr ?? ''), leer, summe: summeM ? (summeM[1] === '?' ? '?' : Number(summeM[1])) : '?', hoehen, befund, messung };
}
const FIX = ['--dist', FIXTURES, '--breiten', '390,1400'];

describe('screenshot-gescrollt an den Fixtures', { concurrency: 3 }, () => {
  test('(a) lazy-reveal: ohne Scrollen Strecken, gescrollt keine — Gleichstand wäre gescheitert', () => {
    const ohne = lauf([...FIX, '--seiten', '/lazy-reveal/', '--ohne-scrollen']);
    const mit = lauf([...FIX, '--seiten', '/lazy-reveal/']);
    assert.equal(ohne.code, 0, 'ohne --leer-hart sind Leerflächen informativ:\n' + ohne.stdout);
    assert.ok(Number(ohne.leer['lazy-reveal@390']) > 0, 'ohne Scrollen bei 390 muss melden:\n' + ohne.stdout);
    assert.ok(Number(ohne.leer['lazy-reveal@1400']) > 0, 'ohne Scrollen bei 1400 muss melden:\n' + ohne.stdout);
    assert.equal(mit.leer['lazy-reveal@390'], 0, 'gescrollt 390:\n' + mit.stdout);
    assert.equal(mit.leer['lazy-reveal@1400'], 0, 'gescrollt 1400:\n' + mit.stdout);
    assert.equal(mit.code, 0, mit.stdout);
    assert.ok(Number(ohne.summe) > Number(mit.summe), `Gleichstand ${ohne.summe}/${mit.summe}: das Scrollen hat nichts repariert`);
    // Der Screenshot selbst muss den Unterschied tragen, nicht nur die Zahl
    const anteilOhne = ohne.messung.ergebnisse[0].leer.anteil, anteilMit = mit.messung.ergebnisse[0].leer.anteil;
    assert.ok(anteilOhne > anteilMit, `einfarbiger Anteil ohne ${anteilOhne} ≤ mit ${anteilMit}`);
  });

  test('(a) lazy-reveal ohne Scrollen mit --leer-hart: Exit 1', () => {
    const r = lauf(['--dist', FIXTURES, '--breiten', '390', '--seiten', '/lazy-reveal/', '--ohne-scrollen', '--leer-hart']);
    assert.equal(r.code, 1, r.stdout);
    assert.ok(Number(r.summe) > 0, r.stdout);
  });

  test('(b) eager: 0 Strecken mit und ohne Scrollen, Höhen gleich, Exit 0', () => {
    const mit = lauf([...FIX, '--seiten', '/eager/']);
    const ohne = lauf([...FIX, '--seiten', '/eager/', '--ohne-scrollen', '--leer-hart']);
    for (const r of [mit, ohne]) {
      assert.equal(r.code, 0, r.stdout);
      assert.equal(r.summe, 0, r.stdout);
      assert.equal(r.befund, 'nein', r.stdout);
      for (const k of ['eager@390', 'eager@1400']) assert.equal(r.hoehen[k].normal, r.hoehen[k].reduce, `${k} Höhen ungleich:\n` + r.stdout);
    }
  });

  test('(c) abstand-320: genau eine Strecke je Breite, Exit 0; mit --leer-hart Exit 1', () => {
    const r = lauf([...FIX, '--seiten', '/abstand-320/']);
    assert.equal(r.code, 0, r.stdout);
    assert.equal(r.leer['abstand-320@390'], 1, r.stdout);
    assert.equal(r.leer['abstand-320@1400'], 1, r.stdout);
    const hart = lauf(['--dist', FIXTURES, '--breiten', '390', '--seiten', '/abstand-320/', '--leer-hart']);
    assert.equal(hart.code, 1, 'dokumentierte Lücke zählt mit --leer-hart als Befund:\n' + hart.stdout);
  });

  test('(d) marquee-reduce: Reduce-Höhe über Normal-Höhe, befund=ja, Exit 1', () => {
    const r = lauf([...FIX, '--seiten', '/marquee-reduce/']);
    assert.equal(r.code, 1, r.stdout);
    assert.equal(r.befund, 'ja', r.stdout);
    for (const k of ['marquee-reduce@390', 'marquee-reduce@1400']) {
      assert.ok(r.hoehen[k].reduce > r.hoehen[k].normal * 1.05, `${k}: ${JSON.stringify(r.hoehen[k])}`);
    }
  });

  test('Seite nicht ladbar: Exit 2 und Zeile ungeprueft', () => {
    const r = lauf(['--url', 'http://127.0.0.1:1/', '--breiten', '390']);
    assert.equal(r.code, 2, r.stdout);
    assert.match(r.stdout, /ungeprueft/);
    assert.equal(r.summe, '?', r.stdout);
  });

  test('Sabotage: --schwelle 100000 auf lazy-reveal ohne Scrollen zählt 0', () => {
    const r = lauf(['--dist', FIXTURES, '--breiten', '390', '--seiten', '/lazy-reveal/', '--ohne-scrollen', '--schwelle', '100000']);
    assert.equal(r.code, 0, r.stdout);
    assert.equal(r.summe, 0, 'Zähler hängt nicht an der Schwelle:\n' + r.stdout);
    assert.ok(r.messung.ergebnisse[0].leer.anteil > 0.5, 'einfarbiger Anteil bleibt trotzdem hoch (Rohdaten unverändert)');
  });

  test('Aufruffehler: weder --url noch --dist → Exit 64', () => {
    const r = spawnSync(process.execPath, [SKRIPT, '--breiten', '390'], { encoding: 'utf8' });
    assert.equal(r.status, 64, r.stderr);
  });
});
