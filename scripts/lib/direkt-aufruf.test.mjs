// @ts-check
/**
 * istDirektAufruf + Fleet-Guard gegen den Symlink-Direktaufruf-Fehler.
 *
 * Lauf: `node --test scripts/lib/direkt-aufruf.test.mjs`
 *
 * ANLASS (Alte-Linde-Bau, 20.10.2026): `node node_modules/@cw/core/scripts/bild-einbauen.mjs …`
 * endete mit Exit 0 und leerem Log, kein Bild wurde abgelegt. Der Direktaufruf-Check
 * verglich `import.meta.url` (realpath unter .pnpm) mit `resolve(process.argv[1])`
 * (Symlink-Pfad). Gleiches Muster in fünf weiteren Skripten; verify-touchpoints hatte
 * denselben Fehler früher schon einzeln behoben.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import { istDirektAufruf } from './direkt-aufruf.mjs';

const ROOT = resolve(import.meta.dirname, '../..');

/** Wegwerf-Verzeichnis mit node_modules/@cw/core → Checkout (wie pnpm). */
function symlinkRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'direkt-aufruf-'));
  mkdirSync(join(dir, 'node_modules/@cw'), { recursive: true });
  symlinkSync(ROOT, join(dir, 'node_modules/@cw/core'));
  return dir;
}

test('istDirektAufruf: echter Pfad und Symlink-Pfad zählen als Direktaufruf', () => {
  const echt = join(ROOT, 'scripts/bild-einbauen.mjs');
  const url = pathToFileURL(echt).href;
  assert.equal(istDirektAufruf(url, echt), true);
  const dir = symlinkRepo();
  assert.equal(istDirektAufruf(url, join(dir, 'node_modules/@cw/core/scripts/bild-einbauen.mjs')), true);
});

test('istDirektAufruf: anderes Skript, fehlender oder nicht existierender Einstieg → false', () => {
  const url = pathToFileURL(join(ROOT, 'scripts/bild-einbauen.mjs')).href;
  assert.equal(istDirektAufruf(url, join(ROOT, 'scripts/gen-vercel-csp.mjs')), false);
  assert.equal(istDirektAufruf(url, undefined), false);
  assert.equal(istDirektAufruf(url, '/gibt/es/nicht.mjs'), false);
});

test('Gegenprobe: das alte Muster endet über den Symlink still mit Exit 0', () => {
  // Beweist, dass der Testaufbau die Falle überhaupt nachstellt — sonst wäre der
  // nächste Test grün, auch wenn der Fix fehlte.
  const dir = symlinkRepo();
  const alt = join(dir, 'alt.mjs');
  writeFileSync(
    alt,
    "import { fileURLToPath } from 'node:url'; import { resolve } from 'node:path';\n" +
      "if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) { console.log('lief'); process.exit(3); }\n",
  );
  mkdirSync(join(dir, 'echt'));
  const echt = join(dir, 'echt/alt.mjs');
  writeFileSync(echt, readFileSync(alt));
  const link = join(dir, 'link.mjs');
  symlinkSync(echt, link);
  const r = spawnSync(process.execPath, [link], { encoding: 'utf-8' });
  assert.equal(r.status, 0);
  assert.equal(r.stdout, '');
});

test('bild-einbauen über den pnpm-Symlink läuft wirklich (Usage + Exit 1 statt stillem Exit 0)', () => {
  const dir = symlinkRepo();
  const r = spawnSync(process.execPath, ['node_modules/@cw/core/scripts/bild-einbauen.mjs'], { cwd: dir, encoding: 'utf-8' });
  assert.equal(r.status, 1, `Exit ${r.status}, stderr: ${r.stderr}`);
  assert.match(r.stderr, /Aufruf: bild-einbauen\.mjs/);
});

/** Erkennt den unsicheren Vergleich: argv[1] gegen import.meta.url ohne realpath. */
export const UNSICHER = /(process\.argv\[1\][^;]*===[^;]*import\.meta\.url|import\.meta\.url[^;]*===[^;]*process\.argv\[1\])/;
/** @param {string} text */
const unsichereStellen = (text) => {
  const zeilen = text.split('\n');
  const treffer = [];
  for (let i = 0; i < zeilen.length; i++) {
    const fenster = `${zeilen[i]} ${zeilen[i + 1] ?? ''}`;
    if (/^\s*(\*|\/\/)/.test(zeilen[i])) continue;
    if (UNSICHER.test(fenster) && !/realpathSync/.test(fenster)) treffer.push(i + 1);
  }
  return treffer;
};

test('Guard-Selbsttest: die Prüfregel erkennt alle drei alten Schreibweisen', () => {
  assert.deepEqual(unsichereStellen("if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {"), [1]);
  assert.deepEqual(unsichereStellen("if (process.argv[1] === fileURLToPath(import.meta.url)) {"), [1]);
  assert.ok(unsichereStellen("const d =\n  process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);").length >= 1);
  assert.deepEqual(unsichereStellen("return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(entry);"), []);
  assert.deepEqual(unsichereStellen("if (istDirektAufruf(import.meta.url)) await main();"), []);
});

test('Fleet-Guard: kein Skript unter scripts/ vergleicht argv[1] ohne realpath', () => {
  /** @type {string[]} */
  const dateien = [];
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.name === 'node_modules') continue;
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(mjs|js|cjs|ts)$/.test(e.name) && !e.name.endsWith('.test.mjs')) dateien.push(p);
    }
  };
  walk(join(ROOT, 'scripts'));
  // Lief-nie-Schutz: der Scan muss die Dateien sehen, in denen der Fehler stand.
  assert.ok(dateien.length > 30, `nur ${dateien.length} Dateien gescannt — Scan-Pfad falsch?`);
  for (const f of ['bild-einbauen.mjs', 'onboard/plausible-add-site.mjs']) {
    assert.ok(dateien.includes(join(ROOT, 'scripts', f)), `${f} nicht im Scan`);
  }
  const befunde = dateien.flatMap((f) => unsichereStellen(readFileSync(f, 'utf-8')).map((z) => `${relative(ROOT, f)}:${z}`));
  assert.deepEqual(befunde, [], `Direktaufruf ohne realpath — nutze scripts/lib/direkt-aufruf.mjs:\n${befunde.join('\n')}`);
});
