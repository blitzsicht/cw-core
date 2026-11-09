// @ts-check
/**
 * git-Teil zu changelog-tag-gleich.mjs: liest für jeden Tag `release/cw-core/vX.Y.Z` den eigenen
 * Block aus `<tag>:CHANGELOG.md`. Ein git-Prozess für die Tag-Liste, einer (`cat-file --batch`)
 * für alle Dateien — 176 einzelne `git show` kosteten gemessen mehrere Sekunden.
 *
 * Tags, deren CHANGELOG keinen Block für die eigene Version hat (oder gar keinen CHANGELOG),
 * zählen als `ohneBlock` und werden nicht verglichen.
 *
 * Usage (Mensch, zum Nachstellen der Altlasten-Hashes):
 *   node scripts/lib/changelog-tag-quelle.mjs --altlasten
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { istDirektAufruf } from './direkt-aufruf.mjs';
import { versionsBlock, blockHash, pruefeTagGleichheit } from './changelog-tag-gleich.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PRAEFIX = 'release/cw-core/';

/**
 * @param {string} [cwd]
 * @returns {{ bloecke: Map<string, string>, tags: number, ohneBlock: string[] }}
 */
export function tagBloeckeLesen(cwd = ROOT) {
  const tags = execFileSync('git', ['for-each-ref', '--format=%(refname:short)', `refs/tags/${PRAEFIX}`], {
    cwd, encoding: 'utf-8',
  }).split('\n').filter((t) => /^release\/cw-core\/v\d+\.\d+\.\d+/.test(t));

  /** @type {Map<string, string>} */
  const bloecke = new Map();
  if (tags.length === 0) return { bloecke, tags: 0, ohneBlock: [] };

  const roh = execFileSync('git', ['cat-file', '--batch'], {
    cwd, input: tags.map((t) => `${t}:CHANGELOG.md`).join('\n') + '\n', maxBuffer: 1024 * 1024 * 1024,
  });

  let pos = 0;
  /** @type {string[]} */
  const ohneBlock = [];
  for (const tag of tags) {
    const zeilenEnde = roh.indexOf(0x0a, pos);
    const kopf = roh.subarray(pos, zeilenEnde).toString('utf-8');
    pos = zeilenEnde + 1;
    const m = /^\S+ blob (\d+)$/.exec(kopf);
    const version = tag.slice(PRAEFIX.length);
    if (!m) { ohneBlock.push(version); continue; } // „<name> missing“: Tag ohne CHANGELOG.md
    const groesse = Number(m[1]);
    const md = roh.subarray(pos, pos + groesse).toString('utf-8');
    pos += groesse + 1;
    const block = versionsBlock(md, version);
    if (block) bloecke.set(version, block.text);
    else ohneBlock.push(version);
  }
  return { bloecke, tags: tags.length, ohneBlock };
}

function main() {
  if (!process.argv.includes('--altlasten')) {
    console.error('Usage: node scripts/lib/changelog-tag-quelle.mjs --altlasten');
    process.exit(2);
  }
  const md = readFileSync(join(ROOT, 'CHANGELOG.md'), 'utf-8');
  const { bloecke, tags, ohneBlock } = tagBloeckeLesen();
  const { befunde } = pruefeTagGleichheit(md, bloecke, {});
  console.log(`// ${tags} Tags, ${bloecke.size} mit eigenem Block, ${ohneBlock.length} ohne; ${befunde.length} weichen ab:`);
  for (const b of befunde) {
    const block = versionsBlock(md, b.version);
    console.log(`  '${b.version}': '${block ? blockHash(block.text) : '(Block fehlt)'}',`);
  }
}

if (istDirektAufruf(import.meta.url)) main();
