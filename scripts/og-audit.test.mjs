#!/usr/bin/env node
/**
 * Tests für og-audit.mjs (Vorschaubild-Prüfung im gebauten dist/).
 *
 * Läuft via: node --test scripts/og-audit.test.mjs
 *
 * Die vier Pflichtproben aus dem Plan vom 07.10.2026 stehen als E2E-Läufe ganz
 * oben: SVG rot, 1280×640 rot, JPEG 1200×630 grün, WEBP 1200×630 grün. Dazu
 * „0 Seiten = rot": ein Check, der über ein leeres Verzeichnis grün meldet, hätte
 * auch einen kaputten Build durchgewunken.
 *
 * Die Bilder erzeugt sharp (devDependency) im Test. Fixture-Dateien im Repo wären
 * hier schlechter: ein 1200×630-JPEG ist ein paar KB Binärdatei, deren Maße man
 * dem Repo nicht ansieht — eine Probe, deren Soll niemand nachlesen kann.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import sharp from 'sharp';

import {
  extractOgMeta,
  htmlPfadZuUrl,
  bildRefAufloesen,
  bildPruefen,
  auditDist,
} from './og-audit.mjs';

const SCRIPT = resolve(import.meta.dirname, 'og-audit.mjs');

// ─── Bausteine ──────────────────────────────────────────────────────────────

const flaeche = (w, h) => sharp({ create: { width: w, height: h, channels: 3, background: '#24527a' } });
const jpeg = (w, h) => flaeche(w, h).jpeg().toBuffer();
const png = (w, h) => flaeche(w, h).png().toBuffer();
const webp = (w, h) => flaeche(w, h).webp().toBuffer();
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64"/></svg>');

/** Rauschen als PNG — lässt sich nicht komprimieren, landet sicher über 300 KB. */
async function zuGross() {
  const w = 1200;
  const h = 630;
  const raw = Buffer.alloc(w * h * 3);
  for (let i = 0; i < raw.length; i++) raw[i] = (i * 2654435761) >>> 24;
  return sharp(raw, { raw: { width: w, height: h, channels: 3 } }).png({ compressionLevel: 0 }).toBuffer();
}

/**
 * Eine Seite so, wie BaseLayout sie ausgibt: canonical, og:image mit Maßangabe,
 * twitter:image mit derselben URL.
 */
function seite({ og, twitter = og, width = '1200', height = '630', canonical = 'https://kunde.de/' }) {
  return `<!doctype html><html><head>
<link rel="canonical" href="${canonical}">
${og === null ? '' : `<meta property="og:image" content="${og}">`}
${width === null ? '' : `<meta property="og:image:width" content="${width}">`}
${height === null ? '' : `<meta property="og:image:height" content="${height}">`}
${twitter === null ? '' : `<meta name="twitter:image" content="${twitter}">`}
</head><body><h1>x</h1></body></html>`;
}

/**
 * Legt ein dist/ an und ruft das Skript auf.
 * @param {Record<string, string|Buffer>} dateien dist-relative Pfade → Inhalt
 * @param {string[]} [args] zusätzliche CLI-Argumente
 * @param {string} [skript] Pfad des Skripts (für den Symlink-Test)
 * @returns {{ code: number, out: string }}
 */
function lauf(dateien, args = [], skript = SCRIPT) {
  const cwd = mkdtempSync(join(tmpdir(), 'cwcore-og-'));
  for (const [rel, inhalt] of Object.entries(dateien)) {
    const voll = join(cwd, 'dist', rel);
    mkdirSync(dirname(voll), { recursive: true });
    writeFileSync(voll, inhalt);
  }
  mkdirSync(join(cwd, 'dist'), { recursive: true });
  let code = 0;
  let out = '';
  try {
    out = execFileSync(process.execPath, [skript, 'dist', ...args], { cwd, encoding: 'utf-8', timeout: 15000 });
  } catch (err) {
    code = err.status ?? 1;
    out = (err.stdout ?? '') + (err.stderr ?? '');
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
  return { code, out };
}

// ─── Die vier Pflichtproben + 0 Seiten ─────────────────────────────────────

test('Probe 1: SVG als og:image → rot (der gowohnen-Fall)', () => {
  const { code, out } = lauf({
    'index.html': seite({ og: 'https://kunde.de/logo.svg' }),
    'logo.svg': SVG,
  });
  assert.equal(code, 1, out);
  assert.match(out, /kein Rasterbild/);
  assert.match(out, /SVG/);
  assert.match(out, /\/logo\.svg/);
});

test('Probe 2: PNG 1280×640 bei angegebenen 1200×630 → rot (der falzmarke-Fall)', async () => {
  const { code, out } = lauf({
    'index.html': seite({ og: 'https://kunde.de/og/default.png' }),
    'og/default.png': await png(1280, 640),
  });
  assert.equal(code, 1, out);
  assert.match(out, /1280×640/);
  assert.match(out, /1200×630/);
});

test('Probe 3: JPEG 1200×630 → grün, Seitenzahl > 0', async () => {
  const { code, out } = lauf({
    'index.html': seite({ og: 'https://kunde.de/og/default.jpg' }),
    'og/default.jpg': await jpeg(1200, 630),
  });
  assert.equal(code, 0, out);
  assert.match(out, /1 Seite\(n\) geprüft/);
});

test('Probe 4: WEBP 1200×630 → grün', async () => {
  const { code, out } = lauf({
    'index.html': seite({ og: 'https://kunde.de/og/default.webp' }),
    'og/default.webp': await webp(1200, 630),
  });
  assert.equal(code, 0, out);
  assert.match(out, /1 Seite\(n\) geprüft/);
});

test('0 Seiten: leeres dist → rot, nicht still grün', () => {
  const { code, out } = lauf({});
  assert.notEqual(code, 0, out);
  assert.match(out, /0 Seite/);
});

test('0 Seiten: HTML ohne og:image → rot (geprüft wurde nichts)', () => {
  const { code, out } = lauf({ 'index.html': seite({ og: null, twitter: null }) });
  assert.notEqual(code, 0, out);
  assert.match(out, /0 Seite/);
});

// ─── Weitere Fehlerklassen ──────────────────────────────────────────────────

test('Bild fehlt im dist → rot', () => {
  const { code, out } = lauf({ 'index.html': seite({ og: '/og/weg.jpg' }) });
  assert.equal(code, 1, out);
  assert.match(out, /fehlt/);
  assert.match(out, /\/og\/weg\.jpg/);
});

test('Bild über 300 KB → rot', async () => {
  const gross = await zuGross();
  assert.ok(gross.length > 300 * 1024, `Probe ist nur ${gross.length} Byte — taugt nicht`);
  const { code, out } = lauf({ 'index.html': seite({ og: '/og/gross.png' }), 'og/gross.png': gross });
  assert.equal(code, 1, out);
  assert.match(out, /KB/);
});

test('twitter:image zeigt auf ein SVG, og:image ist sauber → rot', async () => {
  const { code, out } = lauf({
    'index.html': seite({ og: '/og/default.jpg', twitter: '/logo.svg' }),
    'og/default.jpg': await jpeg(1200, 630),
    'logo.svg': SVG,
  });
  assert.equal(code, 1, out);
  assert.match(out, /twitter:image/);
});

test('Maßangabe der Seite zählt: 1280×640 mit passender Angabe → grün', async () => {
  const { code, out } = lauf({
    'index.html': seite({ og: '/og/breit.jpg', width: '1280', height: '640' }),
    'og/breit.jpg': await jpeg(1280, 640),
  });
  assert.equal(code, 0, out);
});

test('ohne Maßangabe der Seite gilt 1200×630', async () => {
  const { code, out } = lauf({
    'index.html': seite({ og: '/og/breit.jpg', width: null, height: null }),
    'og/breit.jpg': await jpeg(1280, 640),
  });
  assert.equal(code, 1, out);
  assert.match(out, /1280×640/);
});

test('eine rote Seite unter mehreren grünen färbt den Lauf rot', async () => {
  const { code, out } = lauf({
    'index.html': seite({ og: '/og/default.jpg' }),
    'w/abc/index.html': seite({ og: '/w/abc/vorschau.jpg', canonical: 'https://kunde.de/w/abc/' }),
    'impressum/index.html': seite({ og: '/logo.svg', canonical: 'https://kunde.de/impressum/' }),
    'og/default.jpg': await jpeg(1200, 630),
    'w/abc/vorschau.jpg': await jpeg(1200, 630),
    'logo.svg': SVG,
  });
  assert.equal(code, 1, out);
  assert.match(out, /3 Seite\(n\) geprüft/);
  assert.match(out, /\/impressum\//);
});

// ─── Auflösung der URL ──────────────────────────────────────────────────────

test('absolute URL der eigenen Site wird geprüft, nicht übersprungen (Gegenprobe zur Abbildung)', () => {
  // Ohne diese Probe könnte die Host-Abbildung jede absolute URL als „fremd"
  // einstufen — dann wäre der gowohnen-Fall (absolute https://…/logo.svg) grün.
  const { code, out } = lauf({
    'index.html': seite({ og: 'https://www.kunde.de/logo.svg', canonical: 'https://kunde.de/' }),
    'logo.svg': SVG,
  });
  assert.equal(code, 1, out);
  assert.match(out, /kein Rasterbild/);
});

test('fremder Host → Warnung, nicht rot', async () => {
  const { code, out } = lauf({
    'index.html': seite({ og: '/og/default.jpg' }),
    'partner/index.html': seite({ og: 'https://cdn.fremd.example/bild.svg', canonical: 'https://kunde.de/partner/' }),
    'og/default.jpg': await jpeg(1200, 630),
  });
  assert.equal(code, 0, out);
  assert.match(out, /fremd/i);
  assert.match(out, /cdn\.fremd\.example/);
});

test('--site ergänzt den eigenen Host, wenn keine Seite ein canonical trägt', async () => {
  const html = seite({ og: 'https://kunde.de/og/default.jpg', canonical: '' }).replace(/<link rel="canonical"[^>]*>/, '');
  const dateien = { 'index.html': html, 'og/default.jpg': await jpeg(1200, 630) };
  assert.notEqual(lauf(dateien).code, 0, 'ohne --site ist der Host fremd → 0 geprüft → rot');
  const mit = lauf(dateien, ['--site', 'https://kunde.de']);
  assert.equal(mit.code, 0, mit.out);
});

test('dist/client (Vercel-Adapter) wird als Web-Root erkannt', async () => {
  const { code, out } = lauf({
    'client/index.html': seite({ og: '/og/default.jpg' }),
    'client/og/default.jpg': await jpeg(1200, 630),
  });
  assert.equal(code, 0, out);
  assert.match(out, /1 Seite\(n\) geprüft/);
});

test('Aufruf über Symlink führt main() aus (pnpm verlinkt @cw/core)', () => {
  const linkDir = mkdtempSync(join(tmpdir(), 'cwcore-og-link-'));
  const linked = join(linkDir, 'og-audit.mjs');
  symlinkSync(SCRIPT, linked);
  try {
    const { code, out } = lauf({ 'index.html': seite({ og: '/logo.svg' }), 'logo.svg': SVG }, [], linked);
    assert.equal(code, 1, `main() muss über den Symlink laufen und rot werden, out:\n${out}`);
    assert.match(out, /Vorschaubild-Prüfung/);
  } finally {
    rmSync(linkDir, { recursive: true, force: true });
  }
});

test('ohne dist-Argument → Exit 2', () => {
  let code = 0;
  try {
    execFileSync(process.execPath, [SCRIPT], { encoding: 'utf-8', timeout: 10000, stdio: 'pipe' });
  } catch (err) {
    code = err.status;
  }
  assert.equal(code, 2);
});

test('nicht vorhandenes dist → Exit 2', () => {
  let code = 0;
  try {
    execFileSync(process.execPath, [SCRIPT, '/gibt/es/nicht'], { encoding: 'utf-8', timeout: 10000, stdio: 'pipe' });
  } catch (err) {
    code = err.status;
  }
  assert.equal(code, 2);
});

// ─── Reine Helfer ───────────────────────────────────────────────────────────

test('extractOgMeta: Attributreihenfolge egal, name= und property=, Entities', () => {
  const m = extractOgMeta(`
    <meta content="https://kunde.de/og.jpg?v=1&amp;x=2" property="og:image">
    <meta property="og:image" content="https://kunde.de/zweites.jpg">
    <meta property="og:image:width" content="1200"><meta content="630" property="og:image:height">
    <meta property="twitter:image" content="/tw.jpg">
    <link href="https://kunde.de/seite/" rel="canonical">
    <meta property="og:url" content="https://kunde.de/seite/">`);
  assert.equal(m.ogImage, 'https://kunde.de/og.jpg?v=1&x=2', 'erstes og:image gewinnt, &amp; dekodiert');
  assert.equal(m.ogWidth, '1200');
  assert.equal(m.ogHeight, '630');
  assert.equal(m.twitterImage, '/tw.jpg', 'property="twitter:image" zählt wie name=');
  assert.equal(m.canonical, 'https://kunde.de/seite/');
  assert.equal(m.ogUrl, 'https://kunde.de/seite/');
});

test('htmlPfadZuUrl: index.html, Unterordner, Dateiformat', () => {
  assert.equal(htmlPfadZuUrl('index.html'), '/');
  assert.equal(htmlPfadZuUrl('w/abc/index.html'), '/w/abc/');
  assert.equal(htmlPfadZuUrl('impressum.html'), '/impressum');
});

test('bildRefAufloesen: absolut eigen, www-Variante, relativ, protokollrelativ, fremd', () => {
  const eigene = new Set(['kunde.de']);
  assert.deepEqual(bildRefAufloesen('https://kunde.de/og/a.jpg?v=3', '/', eigene), { art: 'lokal', pfad: '/og/a.jpg' });
  assert.deepEqual(bildRefAufloesen('https://www.kunde.de/og/a.jpg', '/', eigene), { art: 'lokal', pfad: '/og/a.jpg' });
  assert.deepEqual(bildRefAufloesen('/og/a.jpg', '/x/', eigene), { art: 'lokal', pfad: '/og/a.jpg' });
  assert.deepEqual(bildRefAufloesen('vorschau.jpg', '/w/abc/', eigene), { art: 'lokal', pfad: '/w/abc/vorschau.jpg' });
  assert.deepEqual(bildRefAufloesen('//kunde.de/og/a.jpg', '/', eigene), { art: 'lokal', pfad: '/og/a.jpg' });
  assert.deepEqual(bildRefAufloesen('https://cdn.example/a.jpg', '/', eigene), { art: 'fremd', host: 'cdn.example' });
  assert.deepEqual(bildRefAufloesen('/og/b%C3%BCro.jpg', '/', eigene), { art: 'lokal', pfad: '/og/büro.jpg' });
});

test('bildPruefen: liefert je Verstoß einen Befund, sauberes Bild keinen', async () => {
  assert.deepEqual(bildPruefen(await jpeg(1200, 630), { width: 1200, height: 630 }), []);
  assert.equal(bildPruefen(SVG, { width: 1200, height: 630 }).length, 1);
  assert.equal(bildPruefen(await png(1280, 640), { width: 1200, height: 630 }).length, 1);
  // Maße nur prüfen, wenn ein Soll übergeben ist (twitter:image mit eigener Datei).
  assert.deepEqual(bildPruefen(await png(1280, 640), null), []);
});

test('auditDist: zählt geprüfte Seiten und HTML-Dateien getrennt', async () => {
  const dist = mkdtempSync(join(tmpdir(), 'cwcore-og-api-'));
  try {
    mkdirSync(join(dist, 'og'));
    writeFileSync(join(dist, 'index.html'), seite({ og: '/og/default.jpg' }));
    writeFileSync(join(dist, 'google123.html'), 'google-site-verification: google123.html');
    writeFileSync(join(dist, 'og', 'default.jpg'), await jpeg(1200, 630));
    const r = auditDist(dist);
    assert.equal(r.htmlDateien, 2);
    assert.equal(r.geprueft, 1);
    assert.deepEqual(r.probleme, []);
  } finally {
    rmSync(dist, { recursive: true, force: true });
  }
});
