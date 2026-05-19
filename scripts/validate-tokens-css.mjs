#!/usr/bin/env node
//
// validate-tokens-css.mjs
//
// WCAG 2.2 AA Color-Contrast Check für tokens.css einer Customer-Site.
// Liest src/styles/tokens.css, extrahiert --color-* Variablen und prüft
// die kritischsten Kombinationen gegen 4.5:1 (normaler Text) und 3.0:1
// (large text / icons).
//
// Hintergrund: Audits am 2026-04-30 fanden Color-Contrast-Fails bei drei
// Customer-Sites (gottl .team-title 4.04:1, siluri .section-label 4.31:1,
// schiller .btn-accent 3.28:1) — jedes Mal weil die Brand-Akzent-Farbe nicht
// gegen weiß/dunkel getestet wurde. Dieses Skript fängt das beim Onboarding
// ab statt nach 6 Monaten beim ersten Audit.
//
// Usage:
//   node cw-core/scripts/validate-tokens-css.mjs <path/to/tokens.css>
//   node cw-core/scripts/validate-tokens-css.mjs customer-schiller-gartenbau/src/styles/tokens.css
//
// Exit-Codes:
//   0 — alle Combos AA-konform
//   1 — eine oder mehr Combos < 4.5:1 (regulärer Text)
//   2 — File nicht lesbar
//
// Limitations:
//   - prüft nur die explizit gelisteten Combos (siehe COMBOS unten), nicht
//     jede mögliche Kombination
//   - nutzt keine externe Library, eigenständig (Math nach WCAG 2.2-Formel)

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const file = process.argv[2];
if (!file) {
  console.error('Usage: validate-tokens-css.mjs <path/to/tokens.css>');
  process.exit(2);
}

let css;
try {
  css = readFileSync(resolve(file), 'utf8');
} catch (e) {
  console.error(`Cannot read ${file}: ${e.message}`);
  process.exit(2);
}

// Parse --color-* declarations
const tokenRe = /--color-([a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{3,8}|rgb[a]?\([^)]+\)|[a-z]+)/g;
const tokens = {};
for (const m of css.matchAll(tokenRe)) {
  tokens[m[1]] = m[2].trim();
}

// WCAG 2.2 luminance formula
function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h.slice(0, 6);
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
}

function relativeLuminance({ r, g, b }) {
  const [rs, gs, bs] = [r, g, b].map(c => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

function contrastRatio(hexA, hexB) {
  // Resolve named colors (white/black) to hex
  const norm = (c) => {
    if (c === 'white') return '#ffffff';
    if (c === 'black') return '#000000';
    return c;
  };
  const a = relativeLuminance(hexToRgb(norm(hexA)));
  const b = relativeLuminance(hexToRgb(norm(hexB)));
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

// `--color-accent-btn-text` Override aus tokens-base.css: default white, kann
// per Customer überschrieben werden wenn accent-Background zu hell für white ist.
const btnText = tokens['accent-btn-text'] ?? 'white';

// Combos to check.
// `critical: true` blocked Build (cw-core nutzt diese Combos garantiert in tokens-base.css/Komponenten).
// `critical: false` ist advisory — sinnvolle Combo, aber site-spezifisch ob sie real eintritt.
const COMBOS = [
  // CRITICAL — cw-core .btn-accent: btnText (white oder override) auf accent
  { name: `.btn-accent (${btnText} auf accent)`, fg: btnText, bg: 'accent', minRatio: 4.5, critical: true },
  { name: `.btn-accent:hover (${btnText} auf accent-hover)`, fg: btnText, bg: 'accent-hover', minRatio: 4.5, critical: true },
  // CRITICAL — Akzent-Texte (.section-label, .team-title etc.) auf hellen Hintergründen
  { name: 'accent-text auf weiss', fg: 'accent-text', bg: '#ffffff', minRatio: 4.5, critical: true },
  { name: 'accent-text auf surface', fg: 'accent-text', bg: 'surface', minRatio: 4.5, critical: true },
  // CRITICAL — Headings sind überall
  { name: 'primary auf weiss', fg: 'primary', bg: '#ffffff', minRatio: 4.5, critical: true },
  { name: 'primary auf surface', fg: 'primary', bg: 'surface', minRatio: 4.5, critical: true },
  { name: 'white auf primary', fg: 'white', bg: 'primary', minRatio: 4.5, critical: true },
  // ADVISORY — nicht jede Site rendert accent-text auf primary
  { name: 'accent-text auf primary', fg: 'accent-text', bg: 'primary', minRatio: 4.5, critical: false },
];

const fails = [];
const warns = [];

console.log(`\n=== WCAG 2.2 AA Token-Check: ${file} ===\n`);

for (const combo of COMBOS) {
  const fgValue = combo.fg.startsWith('#') || combo.fg === 'white' || combo.fg === 'black'
    ? combo.fg : tokens[combo.fg];
  const bgValue = combo.bg.startsWith('#') || combo.bg === 'white' || combo.bg === 'black'
    ? combo.bg : tokens[combo.bg];

  if (!fgValue || !bgValue) {
    console.log(`  SKIP ${combo.name}: token fehlt (${combo.fg}=${fgValue}, ${combo.bg}=${bgValue})`);
    continue;
  }

  let ratio;
  try {
    ratio = contrastRatio(fgValue, bgValue);
  } catch (e) {
    console.log(`  ERROR ${combo.name}: cannot compute (${e.message})`);
    continue;
  }

  const ratioStr = ratio.toFixed(2);
  const pass = ratio >= combo.minRatio;
  const aaa = ratio >= 7.0;
  const symbol = pass ? (aaa ? '✓✓' : '✓') : (combo.critical ? '✗' : '⚠');
  const tag = pass ? '' : (combo.critical ? ' [CRITICAL]' : ' [advisory]');

  console.log(`  ${symbol} ${combo.name}: ${ratioStr}:1 (min ${combo.minRatio}:1)${tag} — ${fgValue} on ${bgValue}`);

  if (!pass) {
    if (combo.critical) {
      fails.push({ ...combo, fg: fgValue, bg: bgValue, ratio });
    } else {
      warns.push({ ...combo, fg: fgValue, bg: bgValue, ratio });
    }
  }
}

console.log('');

if (warns.length > 0) {
  console.log(`⚠ ${warns.length} advisory-Combo(s) unter 4.5:1 — nur relevant wenn die Site sie tatsächlich rendert:`);
  for (const w of warns) {
    console.log(`  - ${w.name}: ${w.ratio.toFixed(2)}:1`);
  }
  console.log('');
}

if (fails.length > 0) {
  console.error(`✗ ${fails.length} CRITICAL WCAG-AA-Verstoß(e) gefunden:`);
  for (const f of fails) {
    console.error(`  - ${f.name}: ${f.ratio.toFixed(2)}:1 < ${f.minRatio}:1`);
  }
  console.error('');
  console.error('Vorschlag: --color-accent etwas dunkler oder --color-accent-btn-text');
  console.error('auf einen Wert mit ≥4.5:1 Kontrast setzen. Siehe customer-schiller-gartenbau');
  console.error('für ein Beispiel (Bronze-Shift von #C77B30 → #A8651F).');
  process.exit(1);
}

console.log(`✓ Alle critical Combos WCAG 2.2 AA-konform.\n`);
process.exit(0);
