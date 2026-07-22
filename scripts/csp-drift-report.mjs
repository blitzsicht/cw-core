#!/usr/bin/env node
/**
 * Zeigt pro Customer-Repo, wie weit die handgeschriebene vercel.json-CSP vom
 * Generator-Output (`buildCsp`) entfernt ist — die Messgrundlage für den
 * Generator-Zwang.
 *
 *   node scripts/csp-drift-report.mjs <verzeichnis-mit-customer-repos>
 *
 * Warum ein Report vor dem Gate: ein Check, der am Tag der Einführung bei allen
 * Repos rot ist, wird abgeschaltet statt befolgt (Lesson v0.31). Erst angleichen,
 * dann hart schalten. Dieser Report sagt, wie viel Angleichung nötig ist.
 *
 * Der Report ändert nichts und hat keinen Fehler-Exit — er ist ein Messwerkzeug,
 * kein Gate.
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parseCsp, extractCspValuesFromVercelJson, tokenHost } from '../src/integrations/ai-discovery/csp-check.js';
import { buildCsp } from '../src/integrations/ai-discovery/csp-build.js';
import { resolveOrigin } from './lib/resolve-origin.mjs';

const root = process.argv[2] || process.cwd();

/** Leitet die buildCsp-Flags aus einer bestehenden CSP ab (Ist → vermutete Flags). */
function inferFlags(map) {
  const all = [...map.values()].flat();
  const has = (h) => all.some((s) => tokenHost(s) === tokenHost(h));
  const inlineIn = (d) => (map.get(d) ?? []).includes("'unsafe-inline'");
  return {
    plausible: has('plausible.io'),
    turnstile: has('challenges.cloudflare.com'),
    cal: has('app.cal.eu'),
    tally: has('tally.so'),
    youtube: has('www.youtube-nocookie.com'),
    osm: has('tile.openstreetmap.org'),
    vercelToolbar: has('vercel.live'),
    inlineStyles: inlineIn('style-src-elem') || inlineIn('style-src'),
    inlineScripts: inlineIn('script-src-elem') || inlineIn('script-src'),
  };
}

const rows = [];
for (const entry of readdirSync(root).sort()) {
  if (!entry.startsWith('customer-')) continue;
  const dir = join(root, entry);
  const vj = join(dir, 'vercel.json');
  if (!existsSync(vj)) continue;
  const csp = extractCspValuesFromVercelJson(readFileSync(vj, 'utf-8'))[0];
  if (!csp) continue;
  const origin = resolveOrigin(dir);
  if (!origin) {
    rows.push({ repo: entry, status: 'KEIN-ORIGIN' });
    continue;
  }

  const ist = parseCsp(csp);
  const flags = inferFlags(ist);
  const soll = parseCsp(buildCsp(origin, flags));

  const fehlend = [...soll.keys()].filter((d) => !ist.has(d));
  const zusatz = [...ist.keys()].filter((d) => !soll.has(d));
  const wertDiff = [...soll.keys()].filter((d) => {
    if (!ist.has(d)) return false;
    const a = new Set(ist.get(d) ?? []);
    const b = new Set(soll.get(d) ?? []);
    return [...b].some((x) => !a.has(x)) || [...a].some((x) => !b.has(x));
  });

  rows.push({
    repo: entry,
    status: fehlend.length + zusatz.length + wertDiff.length === 0 ? 'IDENTISCH' : 'DRIFT',
    flags: Object.entries(flags).filter(([, v]) => v).map(([k]) => k).join(','),
    fehlend,
    zusatz,
    wertDiff,
  });
}

for (const r of rows) {
  if (r.status === 'IDENTISCH') {
    console.log(`✓ ${r.repo.padEnd(34)} identisch mit buildCsp(${r.flags})`);
    continue;
  }
  if (r.status !== 'DRIFT') {
    console.log(`? ${r.repo.padEnd(34)} ${r.status}`);
    continue;
  }
  console.log(`△ ${r.repo.padEnd(34)} flags: ${r.flags}`);
  if (r.fehlend.length) console.log(`     fehlt im Repo : ${r.fehlend.join(', ')}`);
  if (r.zusatz.length) console.log(`     nur im Repo   : ${r.zusatz.join(', ')}`);
  if (r.wertDiff.length) console.log(`     Werte weichen : ${r.wertDiff.join(', ')}`);
}

const n = (s) => rows.filter((r) => r.status === s).length;
console.log(
  `\nZÄHLWERTE: ${rows.length} Repos mit CSP | identisch ${n('IDENTISCH')} | Drift ${n('DRIFT')} | ohne Origin ${n('KEIN-ORIGIN')}`,
);
console.log('Generator-Zwang ist erst sinnvoll, wenn Drift = 0. Angleichen: node scripts/gen-vercel-csp.mjs (pro Repo).');
