#!/usr/bin/env node
// @ts-check
/**
 * check-slop.mjs — deterministischer Slop-Detektor für das Gate: impeccable `detect` (gepinnt
 * 4.8.0, per `npx -y`, keine Abhängigkeit im Lockfile) auf der gerenderten Seite, Allowlist aus
 * slop-allowlist.json, Exit-Konvention des Gates.
 *
 * ANLASS (customer-websites/docs/design-skills-2026-11-04/plan.md, Schritt 3). Der Craft-Check stellt
 * zehn Fragen, die ein Mensch beantwortet; was sich messen lässt (Schriftgrößen unter 11 px, Kontrast
 * unter 4,5:1, Zeilen über 80 Zeichen, übersprungene Überschriften, Verlaufstext, Glow-Schatten),
 * soll ein Werkzeug mit Regel-ID und Exit-Code melden. Probe 04.11.2026 (16 Live- und 8 Dev-Seiten,
 * 1280 und 390 px): 3–16 s je Seite, Fixture mit eingebautem Slop Exit 2, leere Seite Exit 0, von 30
 * Flottenbefunden nach Allowlist 1 Fehlalarm (ein SVG-Siegeltext als Fließtext gewertet), darunter
 * neue echte Befunde (hausammincio: schwarze Schrift auf Dunkelgrün im Sticky-Button, 2,4:1;
 * hausamlago: 150 Zeichen je Zeile; platzfrei: h1 → h3).
 *
 * WAS DAS SKRIPT TUT, je Seite und Breite:
 *   1. `npx -y impeccable@4.8.0 detect --json --no-config --viewport <b>x<h> <url>` mit DO_NOT_TRACK=1.
 *      `--no-config`: keine `.impeccable/`-Konfiguration, keine DESIGN.md, keine Inline-Ignores aus dem
 *      Kundenrepo — die Allowlist hier ist die einzige Stelle, an der ein Befund nicht zählt (Ein-System).
 *   2. Advisories (impeccable zählt sie nie) werden gezählt, nicht gewertet.
 *   3. Primärbefunde, deren Regel in slop-allowlist.json steht, werden gezählt als „per Allowlist“.
 *      Jede ID der Allowlist wird gegen den Regelkatalog (`detect --list-rules --quiet`) geprüft:
 *      ein Tippfehler darf keine Regel still abschalten (Exit 64, wie `--ohne` im Gate).
 *   4. Was bleibt, ist ein Befund.
 *
 * EXIT-KONVENTION des Gates (customer-websites/scripts/cw-site-gate.sh): 0 gemessen, kein Befund ·
 * 1 Befund · 2 nicht geprüft · 64 Aufruf. Vorrang 1 > 2 > 0. impeccable selbst meldet 2 = Befund und
 * 1 = Ziel nicht scanbar; hier wird übersetzt, damit das Gate einen Exit-Kanon hat.
 *
 * `--ohne-allowlist` ist die Gegenprobe: derselbe Lauf, nichts unterdrückt. Liefert er auf
 * fixtures/slop/slop/ dieselbe Zahl wie der Lauf mit Allowlist, ist die Allowlist wirkungslos
 * (check-slop.test.mjs).
 *
 * Die letzte stdout-Zeile liest das Gate mit sed/grep:
 *   slop start@1280=3 start@390=5 summe=8 regeln=low-contrast×6,tiny-text×2 allowlist=4 advisories=14 befund=ja
 */

import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer, connect } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const HIER = path.dirname(fileURLToPath(import.meta.url));
const IMPECCABLE = 'impeccable@4.8.0';   // Pin; Regelkatalog 4.8.0: 62 Regeln (31 slop, 31 quality)
const HOEHEN = { 390: 844, 768: 1024, 1280: 800, 1400: 900 };
const DETECT_TIMEOUT = 180_000;

const USAGE = `Aufruf: node check-slop.mjs (--url <basis> | --dist <webroot>) [--seiten /,/leistungen/] [--breiten 1280,390]
       [--allowlist <datei>] [--ohne-allowlist] [--out <dir>] [--json]
Exit: 0 kein Befund · 1 Befund · 2 nicht geprüft · 64 Aufruf (auch unbekannte Regel in der Allowlist)`;

let args;
try {
  ({ values: args } = parseArgs({
    options: {
      url: { type: 'string' },
      dist: { type: 'string' },
      seiten: { type: 'string', default: '/' },
      breiten: { type: 'string', default: '1280,390' },
      allowlist: { type: 'string', default: path.join(HIER, 'slop-allowlist.json') },
      'ohne-allowlist': { type: 'boolean', default: false },
      out: { type: 'string', default: path.join(tmpdir(), 'check-slop') },
      json: { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
    strict: true,
  }));
} catch (e) {
  console.error(e instanceof Error ? e.message : String(e));
  console.error(USAGE);
  process.exit(64);
}
if (args.help) { console.log(USAGE); process.exit(0); }
if (!args.url === !args.dist) { console.error('Genau eines von --url oder --dist angeben.\n' + USAGE); process.exit(64); }
const seiten = String(args.seiten).split(',').map((s) => s.trim()).filter(Boolean);
const breiten = String(args.breiten).split(',').map((s) => Number(s.trim())).filter((n) => Number.isInteger(n) && n > 0);
if (!seiten.length || !breiten.length) { console.error('--seiten oder --breiten leer oder ungültig.\n' + USAGE); process.exit(64); }
const OUT = path.resolve(String(args.out));
mkdirSync(OUT, { recursive: true });
const ENV = { ...process.env, DO_NOT_TRACK: '1' };

/** @param {string} grund */
function ungeprueft(grund) {
  console.log(`ungeprueft: ${grund}`);
  console.log('slop summe=? regeln= allowlist=? advisories=? befund=?');
  process.exit(2);
}

// ── Allowlist lesen und gegen den Regelkatalog prüfen ────────────────────────────────────
/** @type {Record<string, string>} */
let allowlist = {};
const allowlistDatei = path.resolve(String(args.allowlist));
if (!args['ohne-allowlist']) {
  if (!existsSync(allowlistDatei)) { console.error(`Allowlist fehlt: ${allowlistDatei}`); process.exit(64); }
  try {
    const roh = JSON.parse(readFileSync(allowlistDatei, 'utf8'));
    if (!roh || typeof roh.regeln !== 'object' || Array.isArray(roh.regeln)) throw new Error('erwartet { "regeln": { "<id>": "<grund>" } }');
    allowlist = roh.regeln;
  } catch (e) { console.error(`Allowlist unlesbar (${allowlistDatei}): ${e instanceof Error ? e.message : String(e)}`); process.exit(64); }
}
const katalog = spawnSync('npx', ['-y', IMPECCABLE, 'detect', '--list-rules', '--quiet'], { env: ENV, encoding: 'utf8', timeout: DETECT_TIMEOUT });
if (katalog.error || katalog.status !== 0) {
  ungeprueft(`Regelkatalog nicht lesbar (npx -y ${IMPECCABLE} detect --list-rules: ${katalog.error ? katalog.error.message : `Exit ${katalog.status}`}) — Netz oder npm-Cache prüfen`);
}
const regelIds = new Set((katalog.stdout ?? '').split('\n').map((z) => z.trim()).filter(Boolean));
if (regelIds.size === 0) ungeprueft('Regelkatalog leer');
const unbekannt = Object.keys(allowlist).filter((id) => !regelIds.has(id));
if (unbekannt.length) {
  console.error(`Allowlist nennt unbekannte Regeln: ${unbekannt.join(', ')} (Katalog ${IMPECCABLE}: ${regelIds.size} Regeln). Tippfehler? Nichts wird still abgeschaltet.`);
  process.exit(64);
}
for (const [id, grund] of Object.entries(allowlist)) {
  if (typeof grund !== 'string' || grund.trim().length < 10) { console.error(`Allowlist: Regel ${id} ohne Grund`); process.exit(64); }
}

// ── Wegwerf-Server für --dist (wie screenshot-gescrollt.mjs) ─────────────────────────────
function freierPort() {
  return new Promise((res, rej) => {
    const s = createServer();
    s.on('error', rej);
    s.listen(0, '127.0.0.1', () => {
      const a = s.address();
      const port = typeof a === 'object' && a ? a.port : 0;
      s.close(() => res(port));
    });
  });
}
/** @param {number} port @param {number} ms */
async function wartetAufPort(port, ms) {
  const bis = Date.now() + ms;
  while (Date.now() < bis) {
    const offen = await new Promise((res) => {
      const c = connect({ port, host: '127.0.0.1' });
      c.once('connect', () => { c.destroy(); res(true); });
      c.once('error', () => res(false));
    });
    if (offen) return true;
    await new Promise((r) => setTimeout(r, 100));
  }
  return false;
}
/** @param {string} dist */
async function starteServe(dist) {
  const bin = path.join(HIER, 'node_modules', '.bin', 'serve');
  if (!existsSync(bin)) throw new Error(`serve fehlt (${bin}) — \`pnpm install\` in checks/`);
  if (!existsSync(dist)) throw new Error(`Web-Root fehlt: ${dist}`);
  const port = await freierPort();
  const proc = spawn(bin, [dist, '-l', String(port), '-n'], { stdio: 'ignore' });
  if (!(await wartetAufPort(port, 10_000))) { proc.kill('SIGTERM'); throw new Error(`serve antwortet nicht auf Port ${port}`); }
  return { basis: `http://127.0.0.1:${port}/`, stop: () => { proc.kill('SIGTERM'); } };
}

// ── Lauf je Seite und Breite ─────────────────────────────────────────────────────────────
/** @param {string} seite */
function slugVon(seite) {
  const s = seite.replace(/^\/+|\/+$/g, '').replace(/\//g, '-');
  return s || 'start';
}
/**
 * @param {string} basis @param {string} seite @param {number} breite
 * @returns {{ slug: string, breite: number, fehler?: string, befunde: any[], perAllowlist: any[], advisories: number, datei?: string }}
 */
function messe(basis, seite, breite) {
  const slug = slugVon(seite);
  const url = new URL(seite, basis).toString();
  const hoehe = HOEHEN[breite] ?? (breite < 500 ? 844 : 800);
  const r = spawnSync('npx', ['-y', IMPECCABLE, 'detect', '--json', '--no-config', '--viewport', `${breite}x${hoehe}`, url], { env: ENV, encoding: 'utf8', timeout: DETECT_TIMEOUT, maxBuffer: 64 * 1024 * 1024 });
  const leer = { slug, breite, befunde: [], perAllowlist: [], advisories: 0 };
  if (r.error) return { ...leer, fehler: `npx: ${r.error.message}` };
  if (r.status === 1) return { ...leer, fehler: `nicht scanbar: ${(r.stderr ?? '').trim().split('\n').pop() || url}` };
  if (r.status !== 0 && r.status !== 2) return { ...leer, fehler: `impeccable Exit ${r.status}: ${(r.stderr ?? '').trim().split('\n').pop() || ''}` };
  let alle;
  try { alle = JSON.parse(r.stdout); } catch { return { ...leer, fehler: 'keine JSON-Ausgabe von impeccable' }; }
  if (!Array.isArray(alle)) return { ...leer, fehler: 'JSON ist keine Liste' };
  const datei = path.join(OUT, `slop-${slug}-${breite}.json`);
  writeFileSync(datei, JSON.stringify({ url, breite, hoehe, impeccable: IMPECCABLE, exit: r.status, befunde: alle }, null, 1));
  const advisories = alle.filter((x) => x.advisory).length;
  const primaer = alle.filter((x) => !x.advisory);
  const perAllowlist = primaer.filter((x) => Object.hasOwn(allowlist, x.antipattern));
  const befunde = primaer.filter((x) => !Object.hasOwn(allowlist, x.antipattern));
  return { slug, breite, befunde, perAllowlist, advisories, datei };
}
/** @param {any[]} liste */
function zaehle(liste) {
  /** @type {Map<string, number>} */
  const m = new Map();
  for (const x of liste) m.set(x.antipattern, (m.get(x.antipattern) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([id, n]) => (n > 1 ? `${id}×${n}` : id));
}

let server = null;
const ergebnisse = [];
try {
  let basis = String(args.url ?? '');
  if (args.dist) { server = await starteServe(path.resolve(String(args.dist))); basis = server.basis; }
  if (!/^https?:\/\//.test(basis)) throw new Error(`--url muss mit http(s):// beginnen: ${basis}`);
  for (const seite of seiten) for (const breite of breiten) ergebnisse.push(messe(basis, seite, breite));
} catch (e) {
  if (server) server.stop();
  ungeprueft(e instanceof Error ? e.message : String(e));
} finally {
  if (server) server.stop();
}

// ── Ausgabe ─────────────────────────────────────────────────────────────────────────────
const gemessen = ergebnisse.filter((r) => !r.fehler);
const fehler = ergebnisse.filter((r) => r.fehler);
const modus = args['ohne-allowlist'] ? 'ohne Allowlist (Gegenprobe)' : `Allowlist ${Object.keys(allowlist).length} Regeln (${path.basename(allowlistDatei)})`;
console.log(`check-slop · ${IMPECCABLE} · ${modus} · Ausgabe ${OUT}`);
for (const r of ergebnisse) {
  if (r.fehler) { console.log(`${r.slug}@${r.breite}: ungeprueft — ${r.fehler}`); continue; }
  const b = zaehle(r.befunde).join(', '), a = zaehle(r.perAllowlist).join(', ');
  console.log(`${r.slug}@${r.breite}: ${r.befunde.length} Befunde${b ? ` (${b})` : ''} · ${r.perAllowlist.length} per Allowlist${a ? ` (${a})` : ''} · ${r.advisories} Advisories · ${path.basename(r.datei ?? '')}`);
  for (const x of r.befunde) console.log(`  ${x.antipattern} ${x.selector ?? ''} — ${String(x.snippet ?? '').replace(/\s+/g, ' ').slice(0, 140)}`);
}
const messung = { datum: new Date().toISOString(), basis: args.url ?? args.dist, impeccable: IMPECCABLE, modus, allowlist: args['ohne-allowlist'] ? null : allowlistDatei, ergebnisse };
writeFileSync(path.join(OUT, 'messung.json'), JSON.stringify(messung, null, 1));
if (args.json) console.log(JSON.stringify(messung));

const summe = gemessen.reduce((n, r) => n + r.befunde.length, 0);
const summeAllow = gemessen.reduce((n, r) => n + r.perAllowlist.length, 0);
const summeAdv = gemessen.reduce((n, r) => n + r.advisories, 0);
const regeln = zaehle(gemessen.flatMap((r) => r.befunde)).join(',');
console.log(`slop ${ergebnisse.map((r) => `${r.slug}@${r.breite}=${r.fehler ? '?' : r.befunde.length}`).join(' ')} summe=${gemessen.length ? summe : '?'} regeln=${regeln} allowlist=${gemessen.length ? summeAllow : '?'} advisories=${gemessen.length ? summeAdv : '?'} befund=${gemessen.length ? (summe > 0 ? 'ja' : 'nein') : '?'}`);
process.exit(summe > 0 ? 1 : fehler.length ? 2 : 0);
