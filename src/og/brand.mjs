// Brand-Defaults (Blitzsicht) + gemeinsame Bausteine für die OG-Templates.
// Farben sind pro Customer überschreibbar (Templates nehmen `brand`-Param).
import { h } from './h.mjs';

export const BRAND = {
  primary: '#1D1E3B', // Nachtblau
  accent: '#EF7612', // Orange
  primaryLight: '#2a2c55',
  star: '#ffc531',
};

/** Optionales Logo als data-URI (SVG/PNG-Buffer). */
export function dataUri(buffer, mime = 'image/svg+xml') {
  return `data:${mime};base64,${Buffer.from(buffer).toString('base64')}`;
}

/** Hex (#RGB/#RRGGBB) → rgba()-String mit gegebenem Alpha (für weiche Farb-Verläufe). */
export function hexToRgba(hex, alpha = 1) {
  let h = String(hex).replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const r = parseInt(h.slice(0, 2), 16) || 0;
  const g = parseInt(h.slice(2, 4), 16) || 0;
  const b = parseInt(h.slice(4, 6), 16) || 0;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Logo-<img> mit korrektem Seitenverhältnis (nicht gequetscht).
 * Liest bei SVG das viewBox-Verhältnis, fixiert die HÖHE und berechnet die Breite.
 * @param {Buffer} buffer  Logo (SVG bevorzugt; PNG → quadratisch angenommen)
 * @param {string} mime
 * @param {number} height  Ziel-Höhe in px
 * @returns {object} Satori-<img>-Element
 */
export function logoImg(buffer, mime = 'image/svg+xml', height = 48) {
  let ratio = 1; // Breite/Höhe
  if (mime.includes('svg')) {
    const svg = buffer.toString('utf-8');
    const vb = svg.match(/viewBox\s*=\s*["']\s*[\d.]+\s+[\d.]+\s+([\d.]+)\s+([\d.]+)/i);
    if (vb) {
      const w = parseFloat(vb[1]), hh = parseFloat(vb[2]);
      if (w > 0 && hh > 0) ratio = w / hh;
    }
  } else if (buffer.length > 24 && buffer[0] === 0x89 && buffer[1] === 0x50) {
    // PNG: IHDR width@16 / height@20 (big-endian)
    const w = buffer.readUInt32BE(16), hh = buffer.readUInt32BE(20);
    if (w > 0 && hh > 0) ratio = w / hh;
  }
  return h('img', {
    src: dataUri(buffer, mime),
    width: Math.round(height * ratio),
    height,
    style: { objectFit: 'contain' },
  });
}

/** Wie logoImg, aber passt das Logo in eine Box (maxW×maxH) ein — für das Logo-Panel. */
export function logoImgFit(buffer, mime = 'image/svg+xml', maxW = 300, maxH = 180) {
  let ratio = 1;
  if (mime.includes('svg')) {
    const vb = buffer.toString('utf-8').match(/viewBox\s*=\s*["']\s*[\d.]+\s+[\d.]+\s+([\d.]+)\s+([\d.]+)/i);
    if (vb) { const w = parseFloat(vb[1]), hh = parseFloat(vb[2]); if (w > 0 && hh > 0) ratio = w / hh; }
  } else if (buffer.length > 24 && buffer[0] === 0x89 && buffer[1] === 0x50) {
    const w = buffer.readUInt32BE(16), hh = buffer.readUInt32BE(20); if (w > 0 && hh > 0) ratio = w / hh;
  }
  let hgt = maxH, wid = hgt * ratio;
  if (wid > maxW) { wid = maxW; hgt = wid / ratio; }
  return h('img', { src: dataUri(buffer, mime), width: Math.round(wid), height: Math.round(hgt), style: { objectFit: 'contain' } });
}

/**
 * Trust-Signal statt Pseudo-Button: ★-Google-Bewertung und/oder Ortsband.
 * @param {object} o
 * @param {string} [o.rating]   z. B. "4,9"
 * @param {string} [o.ratingLabel="Google-Bewertungen"]
 * @param {string} [o.ort]      z. B. "Regensburg" (wird als eigenständige Pille gezeigt, wenn kein rating)
 * @param {object} [o.brand=BRAND]
 * @returns {object|null} Satori-Element oder null
 */
export function trustBadge({ rating, ratingLabel = 'Google-Bewertungen', ort, brand = BRAND } = {}) {
  if (!rating && !ort) return null;
  const pill = {
    display: 'flex',
    alignItems: 'center',
    gap: '14px',
    backgroundColor: 'rgba(255,255,255,0.10)',
    border: '1px solid rgba(255,255,255,0.18)',
    borderRadius: 999,
    padding: '14px 26px',
  };
  if (rating) {
    return h('div', { style: pill },
      h('div', { style: { display: 'flex', fontSize: 30, color: brand.star, letterSpacing: 2 } }, '★★★★★'),
      h('div', { style: { display: 'flex', fontSize: 26, fontWeight: 700, color: 'white' } }, rating),
      h('div', { style: { display: 'flex', fontSize: 22, color: 'rgba(255,255,255,0.62)' } }, ratingLabel),
    );
  }
  return h('div', { style: pill },
    h('div', { style: { display: 'flex', fontSize: 24, color: brand.accent } }, '●'),
    h('div', { style: { display: 'flex', fontSize: 24, fontWeight: 600, color: 'white' } }, ort),
  );
}
