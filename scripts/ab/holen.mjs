#!/usr/bin/env node
// @ts-check
/**
 * holen — Live-Seiten der Flotte als Korpus für `leser-vergleich.mjs` speichern.
 *
 * Je Site mit `lifecycle: live` bis zu `--max` URLs aus der Sitemap (Standard 25), je Host
 * nacheinander mit Pause, vier Hosts parallel. Schneller gelesen sperrt die Vercel-Firewall
 * ein Projekt für ~10 min (Memory „cw-audit löst Vercel-Sperre aus“), und der Lauf sieht dann
 * Fehlerseiten statt Kundenseiten.
 *
 * Herkunft: als Wegwerfskript in /tmp für das A/B von #289/#292 entstanden (262 Seiten aus
 * 16 Sites). Versioniert mit dem Review von #292, damit der nächste Leser-Umbau dasselbe
 * Werkzeug hat statt eines dritten (Regel #1 in customer-websites/CLAUDE.md).
 *
 * Lauf: node scripts/ab/holen.mjs --out /tmp/ab-korpus [--max 25] [--site blitzsicht]
 * Ausgabe: <out>/<slug>/<n>.json mit { url, csp, html }.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { registryPfad } from '../registry-pfad.mjs';

const arg = (/** @type {string} */ n, /** @type {string|null} */ f = null) => {
  const i = process.argv.indexOf(n);
  return i > -1 ? process.argv[i + 1] : f;
};
const OUT = arg('--out');
if (!OUT) {
  console.error('Aufruf: node scripts/ab/holen.mjs --out <verzeichnis> [--max 25] [--site <slug>]');
  process.exit(64);
}
const MAX = Number(arg('--max', '25'));
const NUR = arg('--site');

const reg = JSON.parse(readFileSync(registryPfad(), 'utf8'));
const kunden = (reg.customers ?? []).filter(
  (/** @type {any} */ c) => c.lifecycle === 'live' && c.production_url && (!NUR || c.slug === NUR),
);
const UA = { 'user-agent': 'Mozilla/5.0 (compatible; cw-ab-probe/1.0)' };
const pause = (/** @type {number} */ ms) => new Promise((r) => setTimeout(r, ms));
/** @param {string} u */
async function text(u) {
  const r = await fetch(u, { headers: UA, redirect: 'follow' });
  return { ok: r.ok, status: r.status, csp: r.headers.get('content-security-policy') ?? '', body: await r.text() };
}
/** @param {string} body */
const locsAus = (body) => [...body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim());

/** @param {any} c */
async function site(c) {
  const base = c.production_url.replace(/\/$/, '');
  /** @type {string[]} */
  let locs = [];
  for (const sm of ['/sitemap-index.xml', '/sitemap.xml']) {
    try {
      const r = await text(base + sm);
      if (!r.ok) continue;
      for (const s of locsAus(r.body)) {
        if (s.endsWith('.xml')) {
          locs.push(...locsAus((await text(s)).body));
          await pause(300);
        } else locs.push(s);
      }
      if (locs.length) break;
    } catch {}
  }
  if (!locs.length) locs = [base + '/'];
  locs = [...new Set(locs)].filter((u) => !/\.(xml|pdf|jpe?g|png|webp|avif)$/i.test(u)).slice(0, MAX);
  mkdirSync(`${OUT}/${c.slug}`, { recursive: true });
  let n = 0;
  for (const [i, u] of locs.entries()) {
    try {
      const r = await text(u);
      if (r.ok && r.body.includes('<')) {
        writeFileSync(`${OUT}/${c.slug}/${i}.json`, JSON.stringify({ url: u, csp: r.csp, html: r.body }));
        n++;
      } else console.log(`${c.slug} ${r.status} ${u}`);
    } catch (e) {
      console.log(`${c.slug} Fehler ${u} ${/** @type {Error} */ (e).message}`);
    }
    await pause(400);
  }
  console.log(`${c.slug}: ${n}/${locs.length}`);
  return n;
}

let summe = 0;
const q = [...kunden];
// `summe += await site()` läse `summe` vor dem await — vier Worker überschrieben sich gegenseitig
// (das Wegwerfskript meldete so 76 statt 262 Seiten). Erst warten, dann addieren.
await Promise.all(Array.from({ length: 4 }, async () => {
  while (q.length) {
    const n = await site(q.shift());
    summe += n;
  }
}));
console.log(`GESAMT ${summe} Seiten aus ${kunden.length} Sites`);
if (summe === 0) process.exit(2); // nichts geholt ist kein Korpus
