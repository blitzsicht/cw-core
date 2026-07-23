#!/usr/bin/env node
/**
 * Regeneriert/repariert die CSP in der Customer-vercel.json via fixCsp:
 * Pragma-Origin neben jedes 'self', object-src 'none' + base-uri 'self',
 * *-elem-Konsistenz — ohne customer-spezifische Dienst-Hosts zu verlieren.
 * Ersetzt NUR den Content-Security-Policy-Header-Wert; redirects + andere Header
 * bleiben unberührt. Läuft im Repo-Root: `node node_modules/@cw/core/scripts/gen-vercel-csp.mjs`.
 *
 * Output wird committet (Vercel liest vercel.json vor dem Build → nicht im prebuild).
 *
 * `--service <name>[,<name>]` ergänzt zusätzlich einen bekannten Dienst-Host
 * (`SERVICE_DIRECTIVE` unten). `fixCsp` allein repariert nur die Struktur und kann
 * fehlende Dienste NICHT nachrüsten — ohne diese Option lief der ai-discovery-Guard
 * bei schiller-gartenbau in eine Sackgasse: Build rot wegen blockierter Maps-iframe,
 * aber der empfohlene Generator-Lauf änderte nichts (Vorfall 23.07.2026).
 *
 *   node node_modules/@cw/core/scripts/gen-vercel-csp.mjs --service googleMaps
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fixCsp, HOSTS } from '../src/integrations/ai-discovery/csp-build.js';

// Welche Direktive der jeweilige Dienst-Host braucht. Deckungsgleich mit buildCsp.
const SERVICE_DIRECTIVE = {
  googleMaps: 'frame-src',
  youtube: 'frame-src',
  tally: 'frame-src',
  cal: 'frame-src',
  turnstile: 'frame-src',
  vercelToolbar: 'frame-src',
  osm: 'img-src',
};

/** Fügt einen Dienst-Host in die passende Direktive ein (idempotent).
 * @param {string} csp @param {string[]} services @returns {string} */
function addServices(csp, services) {
  let out = csp;
  for (const svc of services) {
    const host = HOSTS[svc];
    const directive = SERVICE_DIRECTIVE[svc];
    if (!host || !directive) {
      console.error(`gen-vercel-csp: unbekannter Dienst '${svc}' — bekannt: ${Object.keys(SERVICE_DIRECTIVE).join(', ')}`);
      process.exit(1);
    }
    const re = new RegExp(`(^|;\\s*)${directive}([^;]*)`);
    const m = out.match(re);
    if (!m) {
      out = `${out}; ${directive} 'self' ${host}`;
      continue;
    }
    if (m[2].split(/\s+/).includes(host)) continue; // schon drin
    out = out.replace(re, `$1${directive}$2 ${host}`);
  }
  return out;
}
import {
  checkCspCompleteness,
  extractCspValuesFromVercelJson,
} from '../src/integrations/ai-discovery/csp-check.js';

const args = process.argv.slice(2);
const svcIdx = args.findIndex((a) => a === '--service' || a.startsWith('--service='));
/** @type {string[]} */
let services = [];
if (svcIdx !== -1) {
  const a = args[svcIdx];
  const val = a.includes('=') ? a.split('=')[1] : args[svcIdx + 1];
  if (!val) {
    console.error('gen-vercel-csp: --service ohne Wert.');
    process.exit(1);
  }
  services = val.split(',').map((s) => s.trim()).filter(Boolean);
  args.splice(svcIdx, a.includes('=') ? 1 : 2);
}

const root = args[0] || process.cwd();
const vj = join(root, 'vercel.json');
if (!existsSync(vj)) {
  console.log('gen-vercel-csp: keine vercel.json — skip.');
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
if (!origin) {
  console.error('gen-vercel-csp: Site-Origin nicht ermittelbar (astro.config site / site-data url) — Abbruch.');
  process.exit(1);
}

const raw = readFileSync(vj, 'utf-8');
const cspValues = extractCspValuesFromVercelJson(raw);
if (cspValues.length === 0) {
  console.log('gen-vercel-csp: keine CSP in vercel.json — skip.');
  process.exit(0);
}

let out = raw;
let changed = false;
for (const csp of cspValues) {
  const withServices = services.length ? addServices(csp, services) : csp;
  const fixed = fixCsp(withServices, origin);
  if (fixed !== csp) {
    out = out.split(csp).join(fixed); // alle Vorkommen (z. B. zusätzlicher Report-Only-Header)
    changed = true;
  }
}

// Safety: JSON valide + Ergebnis besteht den Validator
try {
  JSON.parse(out);
} catch {
  console.error('gen-vercel-csp: Patch ergäbe ungültiges JSON — Abbruch, nichts geschrieben.');
  process.exit(1);
}
const remaining = extractCspValuesFromVercelJson(out).flatMap((c) => checkCspCompleteness(c, { siteOrigin: origin }));
if (remaining.length) {
  console.error('gen-vercel-csp: nach Fix bleiben Issues — Abbruch:');
  for (const i of remaining) console.error(`   [${i.type}] ${i.details}`);
  process.exit(1);
}

if (changed) {
  writeFileSync(vj, out);
  console.log(`✏️  gen-vercel-csp: vercel.json-CSP regeneriert (origin=${origin}).`);
} else {
  console.log(`✓ gen-vercel-csp: CSP bereits konform (origin=${origin}) — keine Änderung.`);
}
