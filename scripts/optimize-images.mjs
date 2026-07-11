#!/usr/bin/env node
/**
 * @cw/core – optimize-images.mjs
 *
 * Converts all images under public/ to optimized WebP. OG-Bilder, Icons,
 * Favicons und /email/ (animierte PNGs) sind per Denylist ausgenommen.
 * Keeps originals as .bak (pass --delete-originals to remove).
 *
 * Usage:
 *   node node_modules/@cw/core/scripts/optimize-images.mjs
 *   # or via package.json script:
 *   pnpm optimize:images
 *
 * Options:
 *   --max-width=N        Max width in px (default: 1200)
 *   --quality=N          WebP quality 1-100 (default: 80)
 *   --target-kb=N        KB-Budget pro Bild: ist das WebP über Budget, wird die
 *                        Breite iterativ gesenkt (bis --min-width) bis es ≤ N KB
 *                        ist. Default 0 = aus. Fängt AI-1024²-Bilder, die unter
 *                        --max-width fallen und drum nie verkleinert werden
 *                        (blitzsicht-ops#541).
 *   --min-width=N        Untergrenze für --target-kb-Resize (default: 640) —
 *                        schützt Heroes vor Über-Verkleinerung.
 *   --delete-originals   Remove original files after conversion
 *   --dir=path           Image directory (default: public)
 *
 * Requires: sharp (already a devDependency in customer repos)
 */

import { createRequire } from 'node:module';
import { readdir, stat, rename, unlink } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import { join, extname, basename } from 'node:path';
import { pathToFileURL } from 'node:url';

// Resolve sharp from the consumer's node_modules (CWD), not from this script's location.
// Lazy (erst beim Lauf, nicht beim Import): der Logik-Test importiert dieses Modul
// in cw-core selbst, wo sharp nicht installiert ist.
const require = createRequire(join(process.cwd(), 'node_modules', '.placeholder'));
let _sharp;
function getSharp() {
  if (!_sharp) _sharp = require('sharp');
  return _sharp;
}

const args = process.argv.slice(2);
const getArg = (name, fallback) => {
  const found = args.find(a => a.startsWith(`--${name}=`));
  return found ? found.split('=')[1] : fallback;
};
const hasFlag = (name) => args.includes(`--${name}`);

const MAX_WIDTH = parseInt(getArg('max-width', '1200'), 10);
const QUALITY = parseInt(getArg('quality', '80'), 10);
const TARGET_BYTES = Math.max(0, parseInt(getArg('target-kb', '0'), 10)) * 1024;
const MIN_WIDTH_FLOOR = parseInt(getArg('min-width', '640'), 10);
const DELETE_ORIGINALS = hasFlag('delete-originals');
const IMAGE_DIR = getArg('dir', 'public');

const SUPPORTED_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.JPG', '.JPEG', '.PNG']);

// Denylist: diese Pfade NIE optimieren — OG-Bilder (feste 1200×630, teils PNG für
// Social-Scraper), Icons/Favicons (klein, oft PNG-Pflicht), /email/ (animierte PNGs,
// die beim WebP-Flatten ihre Animation verlören), /social/ (Facebook-Share-PNGs mit
// spec-fixer Größe). Spiegelt die TAG_DENY_RE-Denylist in geotag-core wider
// (Twin-Divergenz-Guard), damit `--dir=public` (Default) sicher das ganze public/ scannt.
const DENY_PATTERNS = [/\/og\//i, /\/icons?\//i, /\/email\//i, /\/social\//i, /favicon/i];
export function isDenied(filePath) {
  const norm = String(filePath).replace(/\\/g, '/');
  return DENY_PATTERNS.some((re) => re.test(norm));
}

/**
 * Idempotenz-Guard: Entscheidet, ob eine Datei neu geschrieben werden darf.
 *
 * Re-Encode eines bereits optimierten WebP (q80 → q80) spart pro Lauf nur
 * Promille, verschlechtert die Qualität aber generationsweise und dirtied den
 * Working Tree bei jedem Build (Drift-Vorfall blitzsicht 2026-07-08:
 * dachdecker.webp schrumpfte ~100 B pro `pnpm build`, handwerker-sanitaer.webp
 * flippte ±2 B — konvergierte nie). Ein WebP wird nur neu geschrieben, wenn ein
 * Resize ansteht ODER die Ersparnis substanziell ist (>2 % UND >2 KB).
 * Nicht-WebP (jpg/png) wird immer konvertiert.
 */
export function shouldRewriteWebp({ isWebP, needsResize, sizeBefore, sizeAfter }) {
  if (!isWebP) return true;
  if (needsResize) return true;
  const saved = sizeBefore - sizeAfter;
  return saved > 2048 && saved / sizeBefore > 0.02;
}

async function findImages(dir) {
  const files = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (err) {
    // Verzeichnis fehlt (z. B. Customer ohne public/images im Git) → nichts zu optimieren,
    // KEIN Build-Abbruch. Vorfall 2026-06-10: zink crashte auf Vercel (ENOENT public/images),
    // Deploy schlug fehl → alte Version blieb live (mit toter allowedOrigins-Domain).
    if (err.code === 'ENOENT') return files;
    throw err;
  }
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await findImages(fullPath));
    } else if (SUPPORTED_EXT.has(extname(entry.name)) && !isDenied(fullPath)) {
      files.push(fullPath);
    }
  }
  return files;
}

/** Kodiert filePath als WebP-Buffer, optional auf `width` verkleinert (nie vergrößert). */
async function encodeWebp(filePath, width, origWidth) {
  let pipeline = getSharp()(filePath);
  if (origWidth && width < origWidth) {
    pipeline = pipeline.resize(width, null, { withoutEnlargement: true });
  }
  return pipeline.webp({ quality: QUALITY, effort: 4 }).toBuffer();
}

async function optimizeImage(filePath) {
  const ext = extname(filePath).toLowerCase();
  const info = await stat(filePath);
  const sizeBefore = info.size;

  // Already WebP? Still resize if needed, but skip conversion
  const isWebP = ext === '.webp';
  const outPath = isWebP ? filePath : filePath.replace(/\.[^.]+$/, '.webp');

  try {
    const image = getSharp()(filePath);
    const meta = await image.metadata();

    // Skip tiny images (icons, etc.)
    if (sizeBefore < 5000) {
      return { file: filePath, skipped: true, reason: 'too small' };
    }

    // Animierte Bilder (APNG / animiertes GIF/WebP) NICHT anfassen — `.webp()` ohne
    // `animated: true` behielte nur Frame 1 und zerstörte die Animation. /email/-APNGs
    // sind zwar schon per Denylist raus, aber dieser Guard schützt fleet-weit.
    if (meta.pages && meta.pages > 1) {
      return { file: filePath, skipped: true, reason: 'animated' };
    }

    const origWidth = meta.width || MAX_WIDTH;

    // Stufe 1: max-width-Cap (wie bisher).
    let targetWidth = Math.min(origWidth, MAX_WIDTH);
    const needsResize = targetWidth < origWidth;
    let buffer = await encodeWebp(filePath, targetWidth, origWidth);

    // Stufe 2: KB-Budget (opt-in via --target-kb). Breite iterativ um 15 % senken,
    // bis das WebP ≤ Budget ist oder der --min-width-Floor erreicht ist. Immer vom
    // Original neu kodiert → deterministisch + idempotent (keine Generationsdrift).
    let budgetResized = false;
    if (TARGET_BYTES > 0) {
      while (buffer.length > TARGET_BYTES && targetWidth > MIN_WIDTH_FLOOR) {
        targetWidth = Math.max(MIN_WIDTH_FLOOR, Math.round(targetWidth * 0.85));
        buffer = await encodeWebp(filePath, targetWidth, origWidth);
        budgetResized = true;
      }
    }

    const sizeAfter = buffer.length;
    const didResize = needsResize || budgetResized;

    if (shouldRewriteWebp({ isWebP, needsResize: didResize, sizeBefore, sizeAfter })) {
      // Write optimized file
      await getSharp()(buffer).toFile(outPath);

      // Handle original
      if (!isWebP) {
        if (DELETE_ORIGINALS) {
          await unlink(filePath);
        }
        // Don't keep .bak — just delete the original jpg/png
        // The .webp replaces it
      }

      return {
        file: basename(filePath),
        before: sizeBefore,
        after: sizeAfter,
        saved: sizeBefore - sizeAfter,
        pct: Math.round((1 - sizeAfter / sizeBefore) * 100),
        resized: didResize ? `${origWidth}→${targetWidth}` : null,
      };
    }

    return { file: filePath, skipped: true, reason: 'already optimal' };
  } catch (err) {
    return { file: filePath, error: err.message };
  }
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

async function main() {
  console.log(`\n🖼️  cw-core image optimizer`);
  const budgetInfo = TARGET_BYTES > 0 ? ` | Budget: ${TARGET_BYTES / 1024}KB (min ${MIN_WIDTH_FLOOR}px)` : '';
  console.log(`   Dir: ${IMAGE_DIR} | Max: ${MAX_WIDTH}px | Quality: ${QUALITY}${budgetInfo}\n`);

  const files = await findImages(IMAGE_DIR);
  if (files.length === 0) {
    console.log('   No images found.\n');
    return;
  }

  let totalBefore = 0;
  let totalAfter = 0;
  let optimized = 0;

  for (const file of files) {
    const result = await optimizeImage(file);
    if (result.skipped) {
      console.log(`   ⏭  ${basename(result.file)} — ${result.reason}`);
    } else if (result.error) {
      console.log(`   ❌ ${basename(result.file)} — ${result.error}`);
    } else {
      totalBefore += result.before;
      totalAfter += result.after;
      optimized++;
      const resize = result.resized ? ` (${result.resized})` : '';
      console.log(`   ✅ ${result.file} → .webp  ${formatBytes(result.before)} → ${formatBytes(result.after)}  -${result.pct}%${resize}`);
    }
  }

  if (optimized > 0) {
    const totalSaved = totalBefore - totalAfter;
    console.log(`\n   📊 ${optimized} images optimized`);
    console.log(`   💾 ${formatBytes(totalBefore)} → ${formatBytes(totalAfter)} (saved ${formatBytes(totalSaved)}, -${Math.round((1 - totalAfter / totalBefore) * 100)}%)\n`);

    if (!DELETE_ORIGINALS) {
      console.log(`   ℹ️  Original jpg/png files kept. Pass --delete-originals to remove.\n`);
    }
  }
}

// Nur ausführen, wenn direkt als Script gestartet (nicht beim Test-Import).
// realpathSync, weil pnpm-node_modules symlinked sind — argv[1] (Symlink) und
// import.meta.url (Realpath) würden sonst nie matchen und der Prebuild wäre tot.
const isMain = process.argv[1]
  && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href;
if (isMain) main().catch(console.error);
