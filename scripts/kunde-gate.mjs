#!/usr/bin/env node
/**
 * kunde-gate.mjs — betrifft ein Pin-Bump von A nach B den Kunden überhaupt?
 *
 * Wird von `customer-websites/scripts/upgrade-cw-core-mass.sh` vor jedem Bump gefragt.
 * Begründung, Zahlen und die Abgrenzung „entscheidet über den Bump, nicht über das Messen"
 * stehen an `scripts/lib/changelog-kunde.mjs`.
 *
 * Usage:
 *   node scripts/kunde-gate.mjs --von <pin> --bis <pin> [--changelog <pfad>] [--quiet]
 *
 * Exit-Codes — bewusst so gewählt, dass ein KAPUTTER Aufruf nie wie „überspringen" aussieht:
 *   0   kundenwirksam → bumpen
 *   10  nur-tooling   → überspringen
 *   11  unbekannt     → Spanne nicht bestimmbar, fail open (bumpen) und melden
 *   2   Aufruffehler  → ebenfalls fail open behandeln, NICHT als 10 lesen
 *
 * Erste Ausgabezeile ist maschinenlesbar:  <status>\t<grund>
 */

import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { kundenwirkung } from './lib/changelog-kunde.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function arg(name, fallback = '') {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const von = arg('von');
const bis = arg('bis');
const quiet = process.argv.includes('--quiet');
const changelogPfad = arg('changelog', '');

if (!von || !bis) {
  console.error('Usage: node scripts/kunde-gate.mjs --von <pin> --bis <pin> [--changelog <pfad>]');
  process.exit(2);
}

/**
 * Der CHANGELOG-Stand, der zum ZIEL-Pin gehört — aus dem Ref, nicht aus dem Arbeitsbaum.
 *
 * 🔴 Anlass (04.09.2026, blitzsicht-ops#777). Bis hierher stand `join(ROOT, 'CHANGELOG.md')`,
 * also die Datei im Arbeitsbaum. Der Release-Train *fetcht* den cw-core-Klon und findet
 * deshalb den neuen Tag — aber `fetch` fasst den Arbeitsbaum nicht an. Beim Rollout von
 * v0.149.2 kannte der Klon die Version als Tag und nicht als CHANGELOG-Abschnitt; die
 * Canary-Checkliste meldete daraufhin „keine [kunde]-Einträge im Delta", obwohl v0.149.0
 * eine trägt. Der Eintrag wäre aus dem Monatsbericht gefallen.
 *
 * Aus dem Ref zu lesen ist auch inhaltlich richtiger: maßgeblich ist der CHANGELOG des
 * Releases, auf das gebumpt wird — nicht der eines beliebigen lokalen Standes.
 *
 * **Kein stiller Rückfall auf den Arbeitsbaum.** Genau ein solcher Rückfall hätte den
 * Fehler wieder unsichtbar gemacht: er liefert immer *irgendeinen* Text, und ob es der
 * richtige ist, sieht man der Ausgabe nicht an.
 *
 * @param {string} ref  Ziel-Pin, z. B. `release/cw-core/v0.149.2`
 * @returns {string}
 */
function changelogAusRef(ref) {
  return execFileSync('git', ['-C', ROOT, 'show', `${ref}:CHANGELOG.md`], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 32 * 1024 * 1024,
  });
}

let md = '';
if (changelogPfad) {
  // Ausdrücklich gesetzt (Tests, Sonderfälle) — gewinnt immer.
  try {
    md = readFileSync(changelogPfad, 'utf8');
  } catch (e) {
    console.error(`unbekannt\tCHANGELOG nicht lesbar (${e.code ?? e.message}): ${changelogPfad}`);
    process.exit(2);
  }
} else {
  try {
    md = changelogAusRef(bis);
  } catch (e) {
    const grund = String(e.stderr ?? e.message).trim().split('\n')[0];
    console.error(`unbekannt\tCHANGELOG aus ${bis} nicht lesbar: ${grund}`);
    process.exit(2);
  }
}

const r = kundenwirkung(md, von, bis);
console.log(`${r.status}\t${r.grund}`);

if (!quiet) {
  if (r.versionen.length) {
    console.log(`  geprüft: ${r.geprueft} Version(en) — ${r.versionen.join(', ')}`);
  }
  for (const z of r.zeilen) {
    console.log(`  [${z.sichtbar ? 'kunde:sichtbar' : 'kunde'}] ${z.version}: ${z.text.slice(0, 110)}`);
  }
}

process.exit(r.status === 'kundenwirksam' ? 0 : r.status === 'nur-tooling' ? 10 : 11);
