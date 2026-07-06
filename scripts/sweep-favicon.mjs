#!/usr/bin/env node
/**
 * cw-core: favicon.ico Fleet-Sweep
 *
 * Curl-basierter Live-Check über eine Liste von Domains: verifiziert, dass
 * jede Site HTTP 200 auf /favicon.ico liefert (siluri/blitzsicht-ops#491).
 *
 * Usage:
 *   node scripts/sweep-favicon.mjs https://a.de https://b.com
 *   node scripts/sweep-favicon.mjs --file domains.txt   # eine Domain/URL pro Zeile
 *
 * domains.txt-Zeilen ohne Protokoll werden als https:// interpretiert.
 * Leerzeilen und Zeilen, die mit `#` beginnen, werden ignoriert.
 *
 * Exit-Codes:
 *   0 — alle Domains liefern 200 auf /favicon.ico
 *   1 — mindestens eine Domain liefert kein 200
 *   2 — Konfig-Fehler (keine Domains übergeben)
 */

import { readFileSync } from 'node:fs';

function parseArgs(argv) {
  const fileIdx = argv.indexOf('--file');
  if (fileIdx !== -1) {
    const filePath = argv[fileIdx + 1];
    if (!filePath) {
      console.error('FATAL: --file benötigt einen Pfad');
      process.exit(2);
    }
    const lines = readFileSync(filePath, 'utf8').split('\n');
    return lines
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith('#'));
  }
  return argv.filter((a) => a !== '--file');
}

function normalize(domain) {
  return /^https?:\/\//.test(domain) ? domain : `https://${domain}`;
}

async function checkFavicon(baseUrl) {
  const url = `${baseUrl.replace(/\/$/, '')}/favicon.ico`;
  try {
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      headers: { 'User-Agent': 'cw-core-favicon-sweep/1.0' },
    });
    return { url, status: res.status, ok: res.status === 200 };
  } catch (err) {
    return { url, status: 0, ok: false, error: err.message };
  }
}

async function main() {
  const domains = parseArgs(process.argv.slice(2));
  if (domains.length === 0) {
    console.error('FATAL: keine Domains übergeben.');
    console.error('Usage: node scripts/sweep-favicon.mjs https://a.de https://b.com');
    console.error('       node scripts/sweep-favicon.mjs --file domains.txt');
    process.exit(2);
  }

  console.log(`\n🔍 favicon.ico Sweep — ${domains.length} Domain(s)\n`);

  const results = [];
  for (const domain of domains) {
    const result = await checkFavicon(normalize(domain));
    results.push(result);
    const mark = result.ok ? '✓' : '✗';
    const detail = result.error ? ` (${result.error})` : ` (status=${result.status})`;
    console.log(`${mark} ${result.url}${detail}`);
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} liefern HTTP 200 auf /favicon.ico\n`);

  if (failed.length > 0) {
    console.log('❌ Fehlend/kein 200:');
    for (const f of failed) {
      console.log(`   - ${f.url} (status=${f.status}${f.error ? `, ${f.error}` : ''})`);
    }
    process.exitCode = 1;
    return;
  }

  console.log('✅ Alle Domains liefern favicon.ico');
}

main();
