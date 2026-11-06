#!/usr/bin/env node
// @ts-check
/**
 * lint-changelog.mjs — prüft die Kopfzeilen von CHANGELOG.md auf die Normform.
 *
 * Dieselbe Logik, die `scripts/lib/changelog-kopfform.test.mjs` in CI fährt; dieser Einstieg
 * existiert für `cw-release` (Schritt 4, VOR dem Umbenennen) und für den Menschen am Terminal.
 * Kein zweites Regelwerk — ein Modul, zwei Aufrufwege.
 *
 * Usage:
 *   node scripts/lint-changelog.mjs [<pfad>]        # Standard: <repo>/CHANGELOG.md
 *   node scripts/lint-changelog.mjs --unreleased    # zusätzlich: GENAU EIN [Unreleased]-Block
 *
 * Exit-Codes:
 *   0  in Form
 *   1  Befunde (je Zeile einer, mit Zeilennummer)
 *   2  Aufruffehler (Datei nicht lesbar)
 *
 * `--unreleased` ist der Schalter für cw-release: beim Release MUSS genau ein
 * `## [Unreleased]`-Block da sein, der umbenannt wird. Ohne den Schalter ist null Blöcke in
 * Ordnung (direkt nach einem Release ist das der Normalzustand).
 */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { istDirektAufruf } from './lib/direkt-aufruf.mjs';
import { pruefeChangelogKopfform, formatiereBefunde } from './lib/changelog-kopfform.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function main() {
  const args = process.argv.slice(2);
  const unreleasedPflicht = args.includes('--unreleased');
  const pfad = args.find((a) => !a.startsWith('--')) ?? join(ROOT, 'CHANGELOG.md');

  let md;
  try {
    md = readFileSync(pfad, 'utf-8');
  } catch (e) {
    console.error(`lint-changelog: ${pfad} nicht lesbar (${e.code ?? e.message})`);
    process.exit(2);
  }

  const befunde = pruefeChangelogKopfform(md);
  if (befunde.length > 0) console.error(formatiereBefunde(befunde, pfad));

  let fehlt = false;
  if (unreleasedPflicht) {
    const n = md.split('\n').filter((z) => z === '## [Unreleased]').length;
    if (n !== 1) {
      fehlt = true;
      console.error(
        `lint-changelog: ${n} Zeile(n) \`## [Unreleased]\` — beim Release muss es GENAU EINE sein.\n`
        + '  Vor dem Umbenennen prüfen, nicht danach: eine Prüfung auf „0 danach" ist bei 0 davor\n'
        + '  trivial erfüllt und kann nicht rot werden (cw-core#222).',
      );
    }
  }

  if (befunde.length > 0 || fehlt) process.exit(1);
  console.log(`lint-changelog: ✓ ${md.split('\n').filter((z) => z.startsWith('## ')).length} Kopfzeile(n) in Normform.`);
}

if (istDirektAufruf(import.meta.url)) main();
