#!/usr/bin/env node
// @ts-check
/**
 * screenshot-gescrollt.mjs — Ganzseiten-Screenshot NACH dem Durchscrollen, dazu zwei Messungen:
 * Leerflächen im Bild und DOM-Höhe mit und ohne Reduced-Motion.
 *
 * ANLASS (04.11.2026, blitzsicht.com, 390 px). Der Ganzseiten-Screenshot aus dem Gate (Skill
 * cw-site-gate, Schritt B: `npx playwright screenshot --full-page`) war auf 21.985 von 26.892 px
 * einfarbig (82 %). Nicht, weil die Seite leer war: `loading="lazy"`-Bilder bleiben ohne Scrollen
 * ungeladen, und `data-motion-reveal`-Blöcke bleiben bei `opacity: 0`, weil ohne Scrollen kein
 * IntersectionObserver feuert — Chromium rendert den Ausschnitt jenseits des Viewports, ohne ihn je
 * zu scrollen. Der Operator las aus dem Bild „viele leere Seiten“; die Länge stimmte, die Leere
 * nicht. Dieselbe Seite nach dem Durchscrollen: keine einfarbige Strecke ≥ 300 px.
 *
 * Zweiter Befund vom selben Tag: die DOM-Höhe hängt von Reduced-Motion ab (16.157 gegen
 * 20.689 px), weil KundenMarquee.astro unter `reduce` die Dubletten der Schleife nicht ausblendet
 * und 28 Logos untereinander stapelt (customer-blitzsicht #185). Das misst sonst niemand.
 *
 * WAS DAS SKRIPT TUT, je Seite und Breite:
 *   1. Kontext ohne Reduced-Motion: laden, `load` + fonts.ready, in 600-px-Schritten bis unten
 *      scrollen (120 ms Pause, scrollHeight je Schritt neu gelesen), auf Lazy-Bilder warten, zurück
 *      nach oben, 800 ms Ruhe. scrollHeight lesen, Ganzseiten-Screenshot aufnehmen.
 *   2. Kontext mit Reduced-Motion über `newContext({ reducedMotion: 'reduce' })` — NICHT über
 *      `use.reducedMotion` der Test-Config, das kommt nie beim Browser an (cw-core #202). Gleicher
 *      Ablauf, nur scrollHeight.
 *   3. Leerflächen im PNG: je Pixelzeile die Spanne max − min über R, G, B aller Pixel; Spanne ≤ 6
 *      heißt einfarbig; zusammenhängende einfarbige Zeilen sind eine Strecke; gezählt werden Strecken
 *      ≥ 300 px (`--schwelle`). Ein Wert > 0 heißt zuerst „nicht fertig geladen“, nicht „leeres Design“.
 *      Eine legitime 320-px-Lücke zählt mit (fixtures/leerflaechen/abstand-320/), deshalb ist die
 *      Zeile im Gate meldend, bis der Flottenscan die Schwelle liefert.
 *   4. Höhen: |reduce − normal| / normal > 5 % ist ein Befund.
 *
 * EXIT-KONVENTION des Gates (customer-websites/scripts/cw-site-gate.sh): 0 gemessen, kein Befund ·
 * 1 Befund · 2 nicht geprüft (Seite nicht ladbar, Abhängigkeit fehlt). Vorrang 1 > 2 > 0. Leerflächen
 * sind ohne `--leer-hart` kein Befund.
 *
 * `--ohne-scrollen` ist die Gegenprobe: derselbe Lauf im alten Zustand. Liefert er auf
 * fixtures/leerflaechen/lazy-reveal/ dieselbe Zahl wie der gescrollte Lauf, ist die Reparatur
 * gescheitert (screenshot-gescrollt.test.mjs).
 *
 * Standalone-Node, kein Test-Runner: der Playwright-Runner hängt lokal unter Node 26, die Library
 * läuft (checks/README.md). Die letzten beiden stdout-Zeilen liest das Gate mit sed/grep:
 *   leerflaechen start@390=0 start@1400=0 summe=0
 *   hoehen start@390=16157/20689 diff=28.1% start@1400=11053/11060 diff=0.1% max=28.1% befund=ja
 *
 * Aufruf:
 *   node screenshot-gescrollt.mjs (--url <basis> | --dist <webroot>) [--seiten /,/leistungen/]
 *        [--breiten 390,1400] [--out <dir>] [--ohne-scrollen] [--leer-hart] [--schwelle 300] [--json]
 */

import { parseArgs } from 'node:util';
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { createServer, connect } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HIER = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const SPANNE = 6;              // Farbspanne je Zeile, bis zu der sie als einfarbig gilt
const HOEHEN_SCHWELLE = 0.05;  // Reduce gegen normal, darüber Befund (plan.md Schritt 1 und 8)
const SCHRITT = 600, PAUSE = 120, RUHE = 800, BILDER_WARTEN = 5000;

const USAGE = `Aufruf: node screenshot-gescrollt.mjs (--url <basis> | --dist <webroot>) [--seiten /,/leistungen/]
       [--breiten 390,1400] [--out <dir>] [--ohne-scrollen] [--leer-hart] [--schwelle 300] [--json]
Exit: 0 kein Befund · 1 Befund (Höhen > 5 %, mit --leer-hart auch Strecken) · 2 nicht geprüft · 64 Aufruf`;

let args;
try {
  ({ values: args } = parseArgs({
    options: {
      url: { type: 'string' },
      dist: { type: 'string' },
      seiten: { type: 'string', default: '/' },
      breiten: { type: 'string', default: '390,1400' },
      out: { type: 'string', default: path.join(tmpdir(), 'screenshot-gescrollt') },
      'ohne-scrollen': { type: 'boolean', default: false },
      'leer-hart': { type: 'boolean', default: false },
      schwelle: { type: 'string', default: '300' },
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
const schwelle = Number(args.schwelle);
if (!seiten.length || !breiten.length || !(schwelle > 0)) { console.error('--seiten, --breiten oder --schwelle leer oder ungültig.\n' + USAGE); process.exit(64); }
const OUT = path.resolve(String(args.out));
mkdirSync(OUT, { recursive: true });

// Abhängigkeiten fehlen = nicht geprüft, nicht rot: das Gate zeigt dann `?` mit Grund.
let chromium, PNG;
try {
  ({ chromium } = require('@playwright/test'));
  ({ PNG } = require('pngjs'));
} catch (e) {
  ungeprueft(`Abhängigkeit fehlt (${(e instanceof Error ? e.message : String(e)).split('\n')[0]}) — \`pnpm install\` in checks/`);
}

/** @param {string} grund */
function ungeprueft(grund) {
  console.log(`ungeprueft: ${grund}`);
  console.log('leerflaechen summe=?');
  console.log('hoehen max=? befund=?');
  process.exit(2);
}

// ── Wegwerf-Server für --dist ────────────────────────────────────────────────────────────
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

// ── Messung im Browser ──────────────────────────────────────────────────────────────────
/** @param {import('@playwright/test').Page} page */
async function durchscrollen(page) {
  await page.evaluate(async ([schritt, pause, ruhe, bilderWarten]) => {
    const warte = (/** @type {number} */ ms) => new Promise((r) => setTimeout(r, ms));
    // scrollHeight je Schritt neu lesen: Lazy-Inhalte lassen die Seite beim Scrollen wachsen.
    for (let y = 0; y < document.documentElement.scrollHeight; y += schritt) {
      window.scrollTo(0, y);
      await warte(pause);
    }
    window.scrollTo(0, document.documentElement.scrollHeight);
    await warte(pause);
    // Auf angestoßene Lazy-Bilder warten, gedeckelt: eine Live-Seite mit einem hängenden Bild darf
    // die Messung nicht ewig blockieren.
    const offen = [...document.images].filter((i) => !i.complete).map((i) => new Promise((r) => { i.addEventListener('load', r, { once: true }); i.addEventListener('error', r, { once: true }); }));
    await Promise.race([Promise.all(offen), warte(bilderWarten)]);
    window.scrollTo(0, 0);
    await warte(ruhe);
  }, [SCHRITT, PAUSE, RUHE, BILDER_WARTEN]);
}

/**
 * Einfarbige Strecken im PNG. Spanne je Zeile = max − min über R, G, B aller Pixel; die Schleife
 * bricht ab, sobald die Spanne über SPANNE liegt (fast jede Zeile mit Inhalt, nach wenigen Pixeln).
 * @param {{ width: number, height: number, data: Buffer }} png @param {number} mindestens
 */
export function leerflaechen(png, mindestens) {
  const { width, height, data } = png;
  const einfarbig = new Uint8Array(height);
  for (let y = 0; y < height; y++) {
    let min = 255, max = 0;
    const basis = y * width * 4;
    for (let x = 0; x < width; x++) {
      const i = basis + x * 4;
      for (let k = 0; k < 3; k++) {
        const v = data[i + k];
        if (v < min) min = v;
        if (v > max) max = v;
      }
      if (max - min > SPANNE) break;
    }
    einfarbig[y] = max - min <= SPANNE ? 1 : 0;
  }
  const strecken = [];
  let start = -1, einfarbigPx = 0;
  for (let y = 0; y <= height; y++) {
    const e = y < height && einfarbig[y] === 1;
    if (e) { einfarbigPx++; if (start < 0) start = y; }
    else if (start >= 0) { if (y - start >= mindestens) strecken.push({ ab: start, px: y - start }); start = -1; }
  }
  return { strecken, einfarbigPx, hoehe: height, anteil: height ? einfarbigPx / height : 0 };
}

/** @param {string} seite */
function slugVon(seite) {
  const s = seite.replace(/^\/+|\/+$/g, '').replace(/[^\w-]+/g, '-');
  return s || 'start';
}

/**
 * @param {import('@playwright/test').Browser} browser @param {string} basis @param {string} seite @param {number} breite
 */
async function messe(browser, basis, seite, breite) {
  const url = new URL(seite, basis).href;
  const slug = slugVon(seite);
  const viewport = { width: breite, height: breite <= 500 ? 844 : 900 };
  const datum = new Date().toISOString().slice(0, 10);
  const datei = path.join(OUT, `${datum}-${slug}-${breite}.png`);

  /** @param {'no-preference' | 'reduce'} reducedMotion @param {boolean} mitBild */
  const lauf = async (reducedMotion, mitBild) => {
    const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, locale: 'de-DE', timezoneId: 'Europe/Berlin', colorScheme: 'light', reducedMotion });
    try {
      const page = await ctx.newPage();
      const antwort = await page.goto(url, { waitUntil: 'load', timeout: 60_000 });
      if (!antwort || antwort.status() >= 400) return { fehler: `HTTP ${antwort ? antwort.status() : '–'} für ${url}` };
      await page.evaluate(() => document.fonts.ready);
      if (!args['ohne-scrollen']) await durchscrollen(page);
      else await page.waitForTimeout(RUHE);
      const hoehe = await page.evaluate(() => document.documentElement.scrollHeight);
      const png = mitBild ? await page.screenshot({ fullPage: true }) : null;
      return { hoehe, png };
    } catch (e) {
      return { fehler: (e instanceof Error ? e.message : String(e)).split('\n')[0] };
    } finally {
      await ctx.close();
    }
  };

  const normal = await lauf('no-preference', true);
  if (normal.fehler) return { seite, slug, breite, fehler: normal.fehler };
  const reduce = await lauf('reduce', false);
  if (reduce.fehler) return { seite, slug, breite, fehler: reduce.fehler };
  writeFileSync(datei, /** @type {Buffer} */ (normal.png));
  const leer = leerflaechen(PNG.sync.read(/** @type {Buffer} */ (normal.png)), schwelle);
  const diff = normal.hoehe ? Math.abs(reduce.hoehe - normal.hoehe) / normal.hoehe : 0;
  return { seite, slug, breite, datei, hoeheNormal: normal.hoehe, hoeheReduce: reduce.hoehe, diff, hoehenBefund: diff > HOEHEN_SCHWELLE, leer };
}

// ── Hauptlauf ───────────────────────────────────────────────────────────────────────────
let server = null;
let browser = null;
const ergebnisse = [];
try {
  let basis = String(args.url ?? '');
  if (args.dist) { server = await starteServe(path.resolve(String(args.dist))); basis = server.basis; }
  if (!/^https?:\/\//.test(basis)) throw new Error(`--url muss mit http(s):// beginnen: ${basis}`);
  try { browser = await chromium.launch(); }
  catch (e) { ungeprueft(`Chromium startet nicht (${(e instanceof Error ? e.message : String(e)).split('\n')[0]}) — \`pnpm exec playwright install chromium\` in checks/`); }
  for (const seite of seiten) for (const breite of breiten) ergebnisse.push(await messe(browser, basis, seite, breite));
} catch (e) {
  if (browser) await browser.close().catch(() => {});
  if (server) server.stop();
  ungeprueft(e instanceof Error ? e.message : String(e));
} finally {
  if (browser) await browser.close().catch(() => {});
  if (server) server.stop();
}

// ── Ausgabe ─────────────────────────────────────────────────────────────────────────────
const pct = (/** @type {number} */ x) => `${(x * 100).toFixed(1)}%`;
const gemessen = ergebnisse.filter((r) => !r.fehler);
const fehler = ergebnisse.filter((r) => r.fehler);
const modus = args['ohne-scrollen'] ? 'ohne Scrollen (Gegenprobe)' : 'nach Durchscrollen';
console.log(`screenshot-gescrollt · ${modus} · Strecken ab ${schwelle} px · Ausgabe ${OUT}`);
for (const r of ergebnisse) {
  if (r.fehler) { console.log(`${r.slug}@${r.breite}: ungeprueft — ${r.fehler}`); continue; }
  const strecken = r.leer.strecken.map((s) => `ab ${s.ab} px (${s.px} px)`).join(', ');
  console.log(`${r.slug}@${r.breite}: ${r.hoeheNormal} px, mit Reduce ${r.hoeheReduce} px (${pct(r.diff)}${r.hoehenBefund ? ', BEFUND' : ''}) · einfarbig ${pct(r.leer.anteil)} · Strecken ≥ ${schwelle} px: ${r.leer.strecken.length}${strecken ? ` [${strecken}]` : ''} · ${path.basename(r.datei)}`);
}
const messung = { datum: new Date().toISOString(), basis: args.url ?? args.dist, modus, schwelle, ergebnisse };
writeFileSync(path.join(OUT, 'messung.json'), JSON.stringify(messung, null, 1));
if (args.json) console.log(JSON.stringify(messung));

const summe = gemessen.reduce((a, r) => a + r.leer.strecken.length, 0);
const maxDiff = gemessen.reduce((a, r) => Math.max(a, r.diff), 0);
const hoehenBefund = gemessen.some((r) => r.hoehenBefund);
console.log(`leerflaechen ${ergebnisse.map((r) => `${r.slug}@${r.breite}=${r.fehler ? '?' : r.leer.strecken.length}`).join(' ')} summe=${gemessen.length ? summe : '?'}`);
console.log(`hoehen ${ergebnisse.map((r) => `${r.slug}@${r.breite}=${r.fehler ? '?' : `${r.hoeheNormal}/${r.hoeheReduce} diff=${pct(r.diff)}`}`).join(' ')} max=${gemessen.length ? pct(maxDiff) : '?'} befund=${gemessen.length ? (hoehenBefund ? 'ja' : 'nein') : '?'}`);

const befund = hoehenBefund || (args['leer-hart'] && summe > 0);
process.exit(befund ? 1 : fehler.length ? 2 : 0);
