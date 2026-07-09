#!/usr/bin/env node
/**
 * @cw/core – OG Image Generator (v2)
 *
 * Generates Open Graph images (1200×630) with logo+CTA overlay.
 * Used for fallback chain levels 4 and 5 in the OG image fallback chain.
 *
 * MODES:
 *
 * 1. Text-based OG (SVG → PNG, with optional logo overlay):
 *   node scripts/generate-og.mjs \
 *     --name "Steller Sanierungen" \
 *     --tagline "Ein Ansprechpartner. Komplette Sanierung." \
 *     --cta "Kostenlose Erstbesichtigung anfragen" \
 *     --domain "steller-sanierungen.com" \
 *     --primary "#1D1E3B" --accent "#EF7612" \
 *     --logo public/logo.png \
 *     --out public/og/default.png
 *
 * 2. Single hero image → OG crop (with optional logo+CTA overlay):
 *   node scripts/generate-og.mjs \
 *     --from-hero public/images/hero/team.webp \
 *     --logo public/logo.png \
 *     --cta "Jetzt anfragen" \
 *     --out public/og/team.png
 *
 * 3. Batch: all heroes → OG directory:
 *   node scripts/generate-og.mjs \
 *     --from-dir public/images/hero \
 *     --og-dir public/og \
 *     --logo public/logo.png \
 *     --cta "Jetzt anfragen"
 *
 * OPTIONS:
 *   --quality=N    WebP/PNG quality 1-100 (default: 85)
 *   --logo path    Composite logo top-center (all modes)
 *   --cta text     CTA button text overlay (all modes)
 *   --accent color Accent color for CTA button (default: #EF7612)
 *
 * DEPENDENCY:
 *   sharp must be installed in the consumer project:
 *     pnpm add -D sharp
 *
 * OUTPUT:
 *   PNG files at 1200×630px — optimal for og:image (Facebook, LinkedIn, Twitter/X)
 */
import { createRequire } from 'module';
import { readFileSync, mkdirSync, readdirSync, existsSync } from 'fs';
import { dirname, join, extname, basename } from 'path';

// Resolve sharp from the consumer's node_modules (CWD), not from this script's location.
// cw-core doesn't depend on sharp — the consumer project must install it.
const require = createRequire(join(process.cwd(), 'node_modules', '.placeholder'));
let sharp;
try {
  sharp = require('sharp');
} catch {
  console.error('✗ sharp is not installed. Run: pnpm add -D sharp');
  console.error('  sharp is required for OG image generation.');
  process.exit(1);
}

const OG_WIDTH = 1200;
const OG_HEIGHT = 630;
const SUPPORTED_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp']);

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--') && arg.includes('=')) {
      const [key, ...rest] = arg.split('=');
      args[key.replace(/^--/, '')] = rest.join('=');
    } else if (arg.startsWith('--') && argv[i + 1] && !argv[i + 1].startsWith('--')) {
      args[arg.replace(/^--/, '')] = argv[++i];
    } else if (arg.startsWith('--')) {
      args[arg.replace(/^--/, '')] = true;
    }
  }
  return args;
}

const args = parseArgs(process.argv);
const quality = parseInt(args.quality || '85', 10);
const logoPath = args.logo || null;
const ctaText = args.cta || null;
const accent = args.accent || '#EF7612';

// ─── Mode: OG-Studio v3 — Satori-Templates (scharf, brand-treu, CTA-fähig) ────
// Neuer bevorzugter Weg. Legacy-Modi (--from-hero/--from-dir/Text) bleiben erhalten.
//   node scripts/generate-og.mjs --template cta \
//     --name "Elektro Müller" --claim "Ihr Elektriker in Regensburg." \
//     --subline "Schnell erreichbar · Festpreis · Meisterbetrieb" \
//     --domain "elektro-mueller.de" --rating "4,9" --ort "Regensburg" \
//     --logo public/logo-inverted.svg --out public/og/default.png
if (args.template) {
  await runTemplateMode(args);
  process.exit(0);
}

async function runTemplateMode(a) {
  const { writeFileSync, mkdirSync } = await import('fs');
  let mod;
  try {
    // aus dem Consumer-node_modules auflösen (wie sharp oben)
    mod = await import(require.resolve('@cw/core/og'));
  } catch {
    try {
      mod = await import('@cw/core/og');
    } catch {
      console.error("✗ '@cw/core/og' nicht auflösbar — cw-core muss verlinkt/installiert sein.");
      process.exit(1);
    }
  }
  const { renderOg, cta, offer, proof, hero } = mod;
  const splitList = (v) => (v ? String(v).split('|').map((s) => s.trim()).filter(Boolean) : []);
  const brand = (a.primary || a.accent)
    ? { primary: a.primary || '#1D1E3B', accent: a.accent || '#EF7612', primaryLight: a['primary-light'] || '#2a2c55', star: '#ffc531' }
    : undefined;
  const logo = a.logo && existsSync(a.logo) ? readFileSync(a.logo) : undefined;
  const logoMime = a.logo && a.logo.toLowerCase().endsWith('.png') ? 'image/png' : 'image/svg+xml';

  let element;
  if (a.template === 'cta') {
    element = cta({ eyebrow: a.eyebrow || (a.name ? a.name.toUpperCase() : undefined), claim: a.claim || a.tagline,
      subline: a.subline, domain: a.domain, rating: a.rating, ort: a.ort, logo, logoMime, brand });
  } else if (a.template === 'offer') {
    // Werbe-Stil: --headline "Zeile 1|Zeile 2" --bullets "a|b|c" --cta "..." --domain --proofchip
    element = offer({ eyebrow: a.eyebrow || (a.name ? a.name.toUpperCase() : undefined),
      headline: splitList(a.headline || a.claim || a.tagline), bullets: splitList(a.bullets),
      ctaText: a.cta || a.ctaText, domain: a.domain, proofChip: a.proofchip, logo, logoMime, brand });
  } else if (a.template === 'hero') {
    if (!a.photo || !existsSync(a.photo)) { console.error('✗ --template hero benötigt --photo <bild>'); process.exit(1); }
    const photo = readFileSync(a.photo);
    const photoMime = a.photo.toLowerCase().endsWith('.png') ? 'image/png' : a.photo.toLowerCase().endsWith('.webp') ? 'image/webp' : 'image/jpeg';
    element = hero({ photo, photoMime, claim: a.claim || a.tagline, subline: a.subline, domain: a.domain, rating: a.rating, ort: a.ort, logo, logoMime, brand });
  } else if (a.template === 'proof') {
    if (!a.psi || !existsSync(a.psi)) { console.error('✗ --template proof benötigt --psi <psi-live.json> --slug <slug>'); process.exit(1); }
    const psi = JSON.parse(readFileSync(a.psi, 'utf-8'));
    const site = (psi.sites || []).find((s) => s.slug === a.slug) || psi;
    element = proof({ site, brand });
  } else {
    console.error(`✗ Unbekanntes --template "${a.template}" (erlaubt: offer | cta | hero | proof)`);
    process.exit(1);
  }

  const { buffer, ext, bytes } = await renderOg(element);
  let out = a.out || `public/og/default.${ext}`;
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, buffer);
  console.log(`✓ ${out} (${Math.round(bytes / 1024)} KB, Template ${a.template})`);
}

// ─── Mode: Batch hero → OG ───────────────────────────────────────────────────
if (args['from-dir']) {
  const heroDir = args['from-dir'];
  const ogDir = args['og-dir'] || 'public/og';

  if (!existsSync(heroDir)) {
    console.error(`✗ Hero directory not found: ${heroDir}`);
    process.exit(1);
  }

  mkdirSync(ogDir, { recursive: true });

  const files = readdirSync(heroDir).filter(f => SUPPORTED_EXT.has(extname(f).toLowerCase()));

  if (files.length === 0) {
    console.log(`  No images found in ${heroDir}`);
    process.exit(0);
  }

  console.log(`\n  Generating OG images from ${heroDir} → ${ogDir}\n`);

  let count = 0;
  for (const file of files) {
    const src = join(heroDir, file);
    const outExt = extname(file).toLowerCase() === '.png' ? '.png' : '.webp';
    const dst = join(ogDir, basename(file, extname(file)) + outExt);

    try {
      const info = await cropToOGWithOverlay(src, dst, quality, logoPath, ctaText, accent);
      console.log(`  OK ${file} → ${basename(dst)} (${Math.round(info.size / 1024)} kB)`);
      count++;
    } catch (e) {
      console.error(`  FAIL ${file}: ${e.message}`);
    }
  }

  console.log(`\n  ${count}/${files.length} OG images generated\n`);
  process.exit(0);
}

// ─── Mode: Single hero → OG ──────────────────────────────────────────────────
if (args['from-hero']) {
  const heroPath = args['from-hero'];
  const outPath = args.out || `public/og/${basename(heroPath)}`;

  if (!existsSync(heroPath)) {
    console.error(`✗ Hero image not found: ${heroPath}`);
    process.exit(1);
  }

  mkdirSync(dirname(outPath), { recursive: true });

  const info = await cropToOGWithOverlay(heroPath, outPath, quality, logoPath, ctaText, accent);
  console.log(`✓ OG-Image: ${outPath} (${info.width}x${info.height}, ${Math.round(info.size / 1024)} kB)`);
  process.exit(0);
}

// ─── Mode: Text-based OG (SVG background + logo + CTA) ───────────────────────
const name = args.name || 'Firmenname';
const tagline = args.tagline || '';
const cta = ctaText;
const domain = args.domain || '';
const primary = args.primary || '#1D1E3B';
const outPath = args.out || 'public/og/default.png';

if (!cta) {
  console.error('✗ --cta ist Pflicht für Text-OG (z.B. --cta "Jetzt anfragen")');
  console.error('');
  console.error('Usage:');
  console.error('  Text OG:  generate-og.mjs --name "..." --cta "..." [--logo path] --out public/og/default.png');
  console.error('  From hero: generate-og.mjs --from-hero path.webp [--logo path] [--cta "..."] --out public/og/x.png');
  console.error('  Batch:    generate-og.mjs --from-dir public/images/hero --og-dir public/og [--logo path] [--cta "..."]');
  process.exit(1);
}

mkdirSync(dirname(outPath), { recursive: true });

const svgBuffer = buildTextOgSvg({ name, tagline, cta, domain, primary, accent });

let pipeline = sharp(Buffer.from(svgBuffer)).png({ quality: 85, compressionLevel: 9 });

if (logoPath && existsSync(logoPath)) {
  pipeline = await addLogoOverlay(sharp(Buffer.from(svgBuffer)), logoPath, 40, primary);
  pipeline = pipeline.png({ quality: 85, compressionLevel: 9 });
}

const info = await pipeline.toFile(outPath);
const sizeKB = Math.round(info.size / 1024);
console.log(`✓ OG-Image generiert: ${outPath} (${info.width}x${info.height}, ${sizeKB} kB)`);
if (logoPath && existsSync(logoPath)) {
  console.log(`  Logo: ${logoPath} (composited top-center)`);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function esc(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function wrapText(text, maxChars = 30) {
  const words = text.split(' ');
  const lines = [];
  let current = '';
  for (const word of words) {
    if (current && (current + ' ' + word).length > maxChars) {
      lines.push(current);
      current = word;
    } else {
      current = current ? current + ' ' + word : word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

/** Build an SVG string for a text-based OG image. */
function buildTextOgSvg({ name, tagline, cta, domain, primary, accent }) {
  const nameLines = wrapText(name, 24);
  const logoAreaHeight = 120; // space reserved for logo at top
  const nameY = logoAreaHeight + 80;
  const nameLineHeight = 90;
  const nameSvg = nameLines
    .map(
      (line, i) =>
        `  <text x="600" y="${nameY + i * nameLineHeight}" font-family="system-ui,-apple-system,'Segoe UI',sans-serif" font-size="72" font-weight="bold" text-anchor="middle" fill="#ffffff">${esc(line)}</text>`,
    )
    .join('\n');

  const taglineY = nameY + nameLines.length * nameLineHeight + 10;
  const taglineLines = tagline ? wrapText(tagline, 42) : [];
  const taglineSvg = taglineLines
    .map(
      (line, i) =>
        `  <text x="600" y="${taglineY + i * 45}" font-family="system-ui,-apple-system,'Segoe UI',sans-serif" font-size="32" text-anchor="middle" fill="${accent}">${esc(line)}</text>`,
    )
    .join('\n');

  const ctaCharWidth = cta.length * 11;
  const ctaPadding = 48;
  const ctaWidth = ctaCharWidth + ctaPadding * 2;
  const ctaHeight = 50;
  const ctaX = 600 - ctaWidth / 2;
  const ctaY = taglineY + taglineLines.length * 45 + 30;
  const ctaSvg = `  <rect x="${ctaX}" y="${ctaY}" width="${ctaWidth}" height="${ctaHeight}" rx="25" fill="${accent}"/>
  <text x="600" y="${ctaY + 33}" font-family="system-ui,-apple-system,'Segoe UI',sans-serif" font-size="20" font-weight="600" text-anchor="middle" fill="#ffffff">${esc(cta)}</text>`;

  const domainSvg = domain
    ? `  <text x="600" y="608" font-family="system-ui,-apple-system,'Segoe UI',sans-serif" font-size="22" text-anchor="middle" fill="rgba(255,255,255,0.4)">${esc(domain)}</text>`
    : '';

  return `<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
  <rect width="1200" height="630" fill="${primary}"/>
  <rect width="1200" height="4" fill="${accent}"/>
${nameSvg}
${taglineSvg}
${ctaSvg}
${domainSvg}
</svg>`;
}

/**
 * Add a logo image composited top-center onto a sharp pipeline.
 * Returns a sharp instance (call .png() or .webp() + .toFile() after).
 */
async function addLogoOverlay(sharpPipeline, logoPath, topOffset = 40, background = '#1D1E3B') {
  const logoBuffer = readFileSync(logoPath);
  const resized = await sharp(logoBuffer)
    .resize({ height: 80, fit: 'inside' })
    .toBuffer();
  const logoMeta = await sharp(resized).metadata();
  const logoLeft = Math.round((OG_WIDTH - logoMeta.width) / 2);

  return sharpPipeline.composite([
    { input: resized, top: topOffset, left: logoLeft },
  ]);
}

/**
 * Crop any image to 1200×630 (center crop), optionally adding logo+CTA overlay.
 */
async function cropToOGWithOverlay(src, dst, q = 85, logoPath = null, ctaText = null, accent = '#EF7612') {
  const meta = await sharp(src).metadata();
  const srcW = meta.width;
  const srcH = meta.height;

  const targetRatio = OG_WIDTH / OG_HEIGHT;
  const srcRatio = srcW / srcH;

  let cropW, cropH, cropLeft, cropTop;
  if (srcRatio > targetRatio) {
    cropH = srcH;
    cropW = Math.round(srcH * targetRatio);
    cropLeft = Math.round((srcW - cropW) / 2);
    cropTop = 0;
  } else {
    cropW = srcW;
    cropH = Math.round(srcW / targetRatio);
    cropLeft = 0;
    cropTop = Math.round((srcH - cropH) / 2);
  }

  mkdirSync(dirname(dst), { recursive: true });

  let pipeline = sharp(src)
    .extract({ left: cropLeft, top: cropTop, width: cropW, height: cropH })
    .resize(OG_WIDTH, OG_HEIGHT);

  // Composite overlay elements (logo + CTA)
  const composites = [];

  if (logoPath && existsSync(logoPath)) {
    const logoBuffer = readFileSync(logoPath);
    const resized = await sharp(logoBuffer)
      .resize({ height: 70, fit: 'inside' })
      .toBuffer();
    const logoMeta = await sharp(resized).metadata();
    composites.push({ input: resized, top: 32, left: Math.round((OG_WIDTH - logoMeta.width) / 2) });
  }

  if (ctaText) {
    // Build a small SVG pill for the CTA text and composite it
    const ctaW = ctaText.length * 11 + 96;
    const ctaH = 50;
    const ctaX = Math.round((OG_WIDTH - ctaW) / 2);
    const ctaY = OG_HEIGHT - ctaH - 36;
    const ctaSvg = `<svg width="${OG_WIDTH}" height="${OG_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <rect x="${ctaX}" y="${ctaY}" width="${ctaW}" height="${ctaH}" rx="25" fill="${accent}"/>
  <text x="${OG_WIDTH / 2}" y="${ctaY + 33}" font-family="system-ui,-apple-system,'Segoe UI',sans-serif" font-size="20" font-weight="600" text-anchor="middle" fill="#ffffff">${esc(ctaText)}</text>
</svg>`;
    composites.push({ input: Buffer.from(ctaSvg), top: 0, left: 0 });
  }

  if (composites.length > 0) {
    pipeline = pipeline.composite(composites);
  }

  const isWebp = extname(dst).toLowerCase() === '.webp';
  return pipeline[isWebp ? 'webp' : 'png']({ quality: q }).toFile(dst);
}
