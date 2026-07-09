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
