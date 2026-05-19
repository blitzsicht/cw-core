#!/usr/bin/env node
/**
 * @cw/core – optimize-images.mjs
 *
 * Converts all images in public/images/ to optimized WebP.
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
 *   --delete-originals   Remove original files after conversion
 *   --dir=path           Image directory (default: public/images)
 *
 * Requires: sharp (already a devDependency in customer repos)
 */

import { createRequire } from 'node:module';
import { readdir, stat, rename, unlink } from 'node:fs/promises';
import { join, extname, basename } from 'node:path';

// Resolve sharp from the consumer's node_modules (CWD), not from this script's location.
const require = createRequire(join(process.cwd(), 'node_modules', '.placeholder'));
const sharp = require('sharp');

const args = process.argv.slice(2);
const getArg = (name, fallback) => {
  const found = args.find(a => a.startsWith(`--${name}=`));
  return found ? found.split('=')[1] : fallback;
};
const hasFlag = (name) => args.includes(`--${name}`);

const MAX_WIDTH = parseInt(getArg('max-width', '1200'), 10);
const QUALITY = parseInt(getArg('quality', '80'), 10);
const DELETE_ORIGINALS = hasFlag('delete-originals');
const IMAGE_DIR = getArg('dir', 'public/images');

const SUPPORTED_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.JPG', '.JPEG', '.PNG']);

async function findImages(dir) {
  const files = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await findImages(fullPath));
    } else if (SUPPORTED_EXT.has(extname(entry.name))) {
      files.push(fullPath);
    }
  }
  return files;
}

async function optimizeImage(filePath) {
  const ext = extname(filePath).toLowerCase();
  const info = await stat(filePath);
  const sizeBefore = info.size;

  // Already WebP? Still resize if needed, but skip conversion
  const isWebP = ext === '.webp';
  const outPath = isWebP ? filePath : filePath.replace(/\.[^.]+$/, '.webp');

  try {
    const image = sharp(filePath);
    const meta = await image.metadata();

    // Skip tiny images (icons, etc.)
    if (sizeBefore < 5000) {
      return { file: filePath, skipped: true, reason: 'too small' };
    }

    let pipeline = image;

    // Resize if wider than MAX_WIDTH
    if (meta.width && meta.width > MAX_WIDTH) {
      pipeline = pipeline.resize(MAX_WIDTH, null, { withoutEnlargement: true });
    }

    // Convert to WebP
    const buffer = await pipeline
      .webp({ quality: QUALITY, effort: 4 })
      .toBuffer();

    const sizeAfter = buffer.length;

    // Only save if we actually reduced size (or it's not already webp)
    if (sizeAfter < sizeBefore || !isWebP) {
      // Write optimized file
      await sharp(buffer).toFile(outPath);

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
        resized: meta.width > MAX_WIDTH ? `${meta.width}→${MAX_WIDTH}` : null,
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
  console.log(`   Dir: ${IMAGE_DIR} | Max: ${MAX_WIDTH}px | Quality: ${QUALITY}\n`);

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

main().catch(console.error);
