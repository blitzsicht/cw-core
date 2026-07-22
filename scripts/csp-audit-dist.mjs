#!/usr/bin/env node
/**
 * Output-Verifikation der CSP: prüft die vercel.json-CSP gegen das **gebaute**
 * `dist/`, nicht gegen einen Katalog bekannter Fehlermuster.
 *
 * Läuft im Customer-Repo-Root, NACH `astro build`:
 *   node node_modules/@cw/core/scripts/csp-audit-dist.mjs
 *
 * exit 1 bei jeder Ressource, die die CSP blocken würde (❌) oder die nur über
 * ein nacktes 'self' erlaubt ist (⚠ — bekanntes Bruchmuster, docs/CSP-rationale.md).
 *
 * Warum das nötig ist: `validate-csp.mjs` prüft den CSP-*Text*. Es meldete bei
 * gympanzens komplett ungestylter Seite (22.07.2026) exit 0, weil die CSP
 * strukturell einwandfrei war — sie passte nur nicht zum Output.
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { extractCspValuesFromVercelJson } from '../src/integrations/ai-discovery/csp-check.js';
import { auditHtml, formatFinding } from '../src/integrations/ai-discovery/csp-audit.js';
import { resolveOrigin } from './lib/resolve-origin.mjs';

const root = process.argv[2] || process.cwd();
const distDir = process.argv[3] || join(root, 'dist');

const vj = join(root, 'vercel.json');
if (!existsSync(vj)) {
  console.log('csp-audit-dist: keine vercel.json — skip.');
  process.exit(0);
}
if (!existsSync(distDir)) {
  console.error(`❌ csp-audit-dist: ${relative(root, distDir) || 'dist'} fehlt — erst \`astro build\` laufen lassen.`);
  console.error('   (Ein übersprungener Check ist kein grüner Check.)');
  process.exit(1);
}

const cspValues = extractCspValuesFromVercelJson(readFileSync(vj, 'utf-8'));
if (cspValues.length === 0) {
  console.log('csp-audit-dist: keine CSP in vercel.json — skip.');
  process.exit(0);
}

/** @param {string} dir @returns {string[]} */
function htmlFiles(dir) {
  /** @type {string[]} */
  const out = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const st = statSync(p);
    if (st.isDirectory()) out.push(...htmlFiles(p));
    else if (entry.endsWith('.html')) out.push(p);
  }
  return out;
}

const origin = resolveOrigin(root);
const files = htmlFiles(distDir);
if (files.length === 0) {
  console.error(`❌ csp-audit-dist: keine HTML-Dateien in ${relative(root, distDir)} — Build unvollständig?`);
  process.exit(1);
}

const hashFn = (content, algo) => createHash(algo).update(content, 'utf8').digest('base64');

let blocked = 0;
let risky = 0;
/** @type {Map<string, string[]>} */
const report = new Map();

for (const file of files) {
  const rel = relative(root, file);
  const html = readFileSync(file, 'utf-8');
  /** @type {string[]} */
  const lines = [];
  for (const csp of cspValues) {
    for (const f of auditHtml(html, csp, { siteOrigin: origin, file: rel, hashFn })) {
      if (f.result.allowed) risky++;
      else blocked++;
      lines.push(formatFinding(f));
    }
  }
  if (lines.length) report.set(rel, lines);
}

if (report.size === 0) {
  console.log(
    `✓ csp-audit-dist: ${files.length} Seite(n) gegen die CSP geprüft — keine blockierte Ressource (origin=${origin ?? '?'}).`,
  );
  process.exit(0);
}

for (const [file, lines] of report) {
  console.error(`\n── ${file}`);
  for (const l of lines) console.error(l);
}

console.error(
  `\ncsp-audit-dist: ${blocked} blockierte (❌), ${risky} riskante (⚠) Ressource(n) in ${report.size}/${files.length} Seite(n).`,
);

// Nur echte Blockaden brechen. Nacktes 'self' (⚠) deckt validate-csp.mjs via
// self_without_origin bereits hart ab — hier doppelt zu gaten würde denselben
// Fehler zweimal melden und das Signal verwässern.
if (blocked > 0) {
  console.error('Die CSP in vercel.json passt nicht zu dem, was der Build ausliefert.');
  console.error('→ Fix: node node_modules/@cw/core/scripts/gen-vercel-csp.mjs  (regeneriert die CSP) + commit.');
  process.exit(1);
}
console.error('Keine harte Blockade — aber ⚠-Funde bitte beheben (validate-csp.mjs gated sie separat).');
process.exit(0);
