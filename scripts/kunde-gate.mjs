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
const changelogPfad = arg('changelog', join(ROOT, 'CHANGELOG.md'));

if (!von || !bis) {
  console.error('Usage: node scripts/kunde-gate.mjs --von <pin> --bis <pin> [--changelog <pfad>]');
  process.exit(2);
}

let md = '';
try {
  md = readFileSync(changelogPfad, 'utf8');
} catch (e) {
  console.error(`unbekannt\tCHANGELOG nicht lesbar (${e.code ?? e.message}): ${changelogPfad}`);
  process.exit(2);
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
