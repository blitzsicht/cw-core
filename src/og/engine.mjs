// OG-Studio-v3-Render-Engine: Satori (Layout + Brand-Fonts → SVG mit Text als
// Vektorpfaden) → sharp (Rasterung). Weil Satori den Text bereits vektorisiert,
// ist die SVG font-unabhängig und sharp reicht als Rasterizer — kein resvg nötig.
//
// SCHÄRFE: 2×-Supersampling über sharp-`density` (SVG bei 144 dpi = 2400×1260 px
// rastern, dann auf 1200×630 downsamplen) → sauberes Antialiasing.
//
// GRÖSSE: Zielgröße < 300 KB (SISTRIX-Optimierungsgrenze). PNG (palette) als
// Default; wenn > 300 KB (v. a. Foto-`hero`) automatisch JPG q82.
import { loadFonts } from './fonts.mjs';

async function deps() {
  let satori, sharp;
  try {
    satori = (await import('satori')).default;
  } catch {
    throw new Error("[cw-core/og] 'satori' fehlt — im Consumer installieren: pnpm add -D satori");
  }
  try {
    sharp = (await import('sharp')).default;
  } catch {
    throw new Error("[cw-core/og] 'sharp' fehlt — im Consumer installieren: pnpm add -D sharp");
  }
  return { satori, sharp };
}

/**
 * Rendert ein Satori-Element zu einem OG-Image-Buffer.
 * @param {object} element  Satori-Element (via h()/Templates).
 * @param {object} [opts]
 * @param {number} [opts.width=1200]
 * @param {number} [opts.height=630]
 * @param {number} [opts.supersample=2]  Faktor für die Rasterung (Schärfe).
 * @param {number} [opts.maxBytes=307200] Zielgröße; darüber → JPG-Fallback.
 * @returns {Promise<{buffer:Buffer,ext:'png'|'jpg',width:number,height:number,bytes:number}>}
 */
export async function renderOg(element, opts = {}) {
  const { width = 1200, height = 630, supersample = 2, maxBytes = 300 * 1024 } = opts;
  const { satori, sharp } = await deps();

  const svg = await satori(element, { width, height, fonts: loadFonts() });

  // density = 72 (SVG-Default) × supersample → höher aufgelöst rastern, dann
  // auf Zielgröße downsamplen (Supersampling-Antialiasing).
  const base = sharp(Buffer.from(svg), { density: 72 * supersample }).resize(width, height, { fit: 'fill' });

  let buffer = await base.clone().png({ compressionLevel: 9, palette: true }).toBuffer();
  let ext = 'png';
  if (buffer.length > maxBytes) {
    buffer = await base.clone().jpeg({ quality: 82, mozjpeg: true }).toBuffer();
    ext = 'jpg';
  }
  return { buffer, ext, width, height, bytes: buffer.length };
}
