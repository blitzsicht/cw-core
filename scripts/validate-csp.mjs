#!/usr/bin/env node
/**
 * CI-Backstop für CSP-Korrektheit. Läuft im Customer-Repo-Root (`process.cwd()`),
 * z. B. als build-check.yml-Step: `node node_modules/@cw/core/scripts/validate-csp.mjs`.
 *
 * Liest vercel.json + Site-Origin und prüft via checkCspCompleteness. **exit 1**
 * bei JEDEM Verstoß (self-ohne-Origin, fehlende -elem/media-src/object-src/base-uri,
 * 'unsafe-eval', Wildcard, Smart-Quotes, Plausible-Inkonsistenz) → CI rot VOR
 * Vercel-Deploy. Hart + repo-übergreifend.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  checkCspCompleteness,
  extractCspValuesFromVercelJson,
} from '../src/integrations/ai-discovery/csp-check.ts';

const root = process.argv[2] || process.cwd();
const vj = join(root, 'vercel.json');
if (!existsSync(vj)) {
  console.log('validate-csp: keine vercel.json — skip.');
  process.exit(0);
}

function resolveOrigin(dir) {
  for (const f of ['astro.config.ts', 'astro.config.mjs', 'astro.config.js']) {
    const p = join(dir, f);
    if (existsSync(p)) {
      const m = readFileSync(p, 'utf-8').match(/site:\s*['"]https?:\/\/([^'"/]+)/);
      if (m) return `https://${m[1]}`;
    }
  }
  const sd = join(dir, 'src/data/site-data.ts');
  if (existsSync(sd)) {
    const m = readFileSync(sd, 'utf-8').match(/url:\s*['"]https?:\/\/([^'"/]+)/);
    if (m) return `https://${m[1]}`;
  }
  return null;
}

const origin = resolveOrigin(root);
const cspValues = extractCspValuesFromVercelJson(readFileSync(vj, 'utf-8'));
if (cspValues.length === 0) {
  console.log('validate-csp: keine CSP in vercel.json — skip.');
  process.exit(0);
}

let failed = false;
for (const csp of cspValues) {
  const issues = checkCspCompleteness(csp, { siteOrigin: origin });
  for (const i of issues) {
    failed = true;
    console.error(`❌ [${i.type}] ${i.details}`);
  }
}

if (failed) {
  console.error(`\nCSP-Verstoß in vercel.json (origin=${origin ?? 'unbekannt'}).`);
  console.error('→ Fix: node node_modules/@cw/core/scripts/gen-vercel-csp.mjs  (regeneriert die CSP) + commit.');
  process.exit(1);
}
console.log(`✓ validate-csp: vercel.json-CSP konform (origin=${origin ?? '?'}, ${cspValues.length} Header geprüft).`);
