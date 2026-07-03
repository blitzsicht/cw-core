#!/usr/bin/env node
/**
 * wire-site-analytics.mjs — verdrahtet First-Party-Plausible in einem Customer-Repo.
 *
 * Setzt die zwei Vercel-Rewrites (same-origin Proxy auf stats.blitzsicht.com) in
 * `vercel.json` und verifiziert den `analytics`-Block in `src/data/site-data.ts`.
 * Die pa-ID sitzt AUSSCHLIESSLICH im destination des /js/script.js-Rewrites; der
 * site-data.ts-Block ist für jeden Kunden identisch (/js/script.js + /api/event).
 *
 * Fasst die CSP NICHT an — die wird separat per gen-vercel-csp.mjs domain-korrekt
 * regeneriert (CSP-Test-Protokoll in cw-core/CLAUDE.md). Nur das rewrites-Array
 * wird verändert.
 *
 * Default DRY-RUN. `--apply` schreibt vercel.json.
 *
 *   node wire-site-analytics.mjs --repo ../customer-kunde --pa pa-XXXXXXXXXXXXXXXXXXXXX
 *   node wire-site-analytics.mjs --repo ../customer-kunde --pa pa-XXXXXXXXXXXXXXXXXXXXX --apply
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const STATS_HOST = 'https://stats.blitzsicht.com';
const REWRITE_SCRIPT_SOURCE = '/js/script.js';
const REWRITE_EVENT_SOURCE = '/api/event';
const EXPECTED_SCRIPT = '/js/script.js';
const EXPECTED_ENDPOINT = '/api/event';

function parseArgs(argv) {
  const args = { apply: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--apply') args.apply = true;
    else if (a === '--repo') args.repo = argv[++i];
    else if (a === '--pa') args.pa = argv[++i];
    else if (a === '--help' || a === '-h') args.help = true;
  }
  return args;
}

function die(msg) {
  console.error(`❌ ${msg}`);
  process.exit(1);
}

/** Verifiziert den analytics-Block in site-data.ts (read-only). Gibt Problemliste zurück. */
function checkSiteData(repo) {
  const p = join(repo, 'src/data/site-data.ts');
  if (!existsSync(p)) return [`site-data.ts fehlt (${p}) — Repo scaffolden?`];
  const src = readFileSync(p, 'utf8');
  const script = (src.match(/plausibleScript:\s*['"]([^'"]+)['"]/) || [])[1];
  const endpoint = (src.match(/plausibleEndpoint:\s*['"]([^'"]+)['"]/) || [])[1];
  const problems = [];
  if (script !== EXPECTED_SCRIPT) problems.push(`analytics.plausibleScript = ${script ?? '(fehlt)'} — erwartet '${EXPECTED_SCRIPT}'`);
  if (endpoint !== EXPECTED_ENDPOINT) problems.push(`analytics.plausibleEndpoint = ${endpoint ?? '(fehlt)'} — erwartet '${EXPECTED_ENDPOINT}'`);
  return problems;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log('Usage: wire-site-analytics.mjs --repo <customer-repo> --pa <pa-XXX> [--apply]');
    process.exit(0);
  }
  const repo = args.repo;
  if (!repo) die('--repo <customer-repo-pfad> ist Pflicht.');
  if (!existsSync(repo)) die(`Repo-Pfad existiert nicht: ${repo}`);
  const pa = (args.pa || '').trim();
  if (!/^pa-[A-Za-z0-9]{21}$/.test(pa)) die(`Ungültige pa-ID: "${pa}" (erwartet pa- + 21 alnum).`);

  const scriptDest = `${STATS_HOST}/js/${pa}.js`;
  const eventDest = `${STATS_HOST}${REWRITE_EVENT_SOURCE}`;
  const wanted = [
    { source: REWRITE_SCRIPT_SOURCE, destination: scriptDest },
    { source: REWRITE_EVENT_SOURCE, destination: eventDest },
  ];

  const vj = join(repo, 'vercel.json');
  if (!existsSync(vj)) die(`vercel.json fehlt in ${repo} — Repo erst scaffolden (Template + gen-vercel-csp).`);
  const raw = readFileSync(vj, 'utf8');
  let cfg;
  try {
    cfg = JSON.parse(raw);
  } catch (e) {
    die(`vercel.json ist kein valides JSON: ${e.message}`);
  }

  const rewrites = Array.isArray(cfg.rewrites) ? cfg.rewrites : [];
  const others = rewrites.filter((r) => r.source !== REWRITE_SCRIPT_SOURCE && r.source !== REWRITE_EVENT_SOURCE);
  const current = rewrites.filter((r) => r.source === REWRITE_SCRIPT_SOURCE || r.source === REWRITE_EVENT_SOURCE);

  const alreadyOk =
    current.length === 2 &&
    current.some((r) => r.source === REWRITE_SCRIPT_SOURCE && r.destination === scriptDest) &&
    current.some((r) => r.source === REWRITE_EVENT_SOURCE && r.destination === eventDest);

  // Plausible-Rewrites vorne (Priorität vor evtl. Catch-all-Rewrites).
  cfg.rewrites = [...wanted, ...others];
  const out = JSON.stringify(cfg, null, 2) + '\n';

  // site-data.ts read-only verifizieren
  const sdProblems = checkSiteData(repo);

  console.log(`ℹ️  Analytics-Wiring für ${repo}`);
  console.log(`   Rewrites: ${REWRITE_SCRIPT_SOURCE} → ${scriptDest}`);
  console.log(`             ${REWRITE_EVENT_SOURCE} → ${eventDest}`);

  if (sdProblems.length) {
    console.log('\n⚠️  site-data.ts analytics-Block NICHT konform — bitte manuell setzen:');
    for (const p of sdProblems) console.log(`     - ${p}`);
    console.log("     erwartet:  analytics: { plausibleScript: '/js/script.js', plausibleEndpoint: '/api/event' },");
  } else {
    console.log('✓ site-data.ts analytics-Block korrekt.');
  }

  const existingOther = current.find((r) => r.source === REWRITE_SCRIPT_SOURCE);
  if (existingOther && existingOther.destination !== scriptDest) {
    console.log(`⚠️  Bestehende pa-ID wird ersetzt: ${existingOther.destination} → ${scriptDest}`);
  }

  if (alreadyOk) {
    console.log('✓ vercel.json-Rewrites bereits korrekt — keine Änderung nötig.');
    return;
  }

  if (!args.apply) {
    console.log('\n— DRY-RUN (vercel.json nicht geschrieben). Mit --apply schreiben. —');
    console.log('neuer rewrites-Block:\n' + JSON.stringify(cfg.rewrites, null, 2));
    return;
  }

  writeFileSync(vj, out);
  console.log('✏️  vercel.json-Rewrites geschrieben.');
  console.log('   ↳ Danach im Repo `node node_modules/@cw/core/scripts/gen-vercel-csp.mjs` + committen + Vercel-Deploy.');
}

main();
