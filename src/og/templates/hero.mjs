// Template `hero` — CLUSTER-DEFAULT (Foto-Composite).
// Vollflächiges Hero-/Team-Foto + Gradient-Overlay + Logo + Nutzen-Claim +
// optionales Trust-Signal. Gesicht = Vertrauen (stark für lokale Dienstleister).
//
// Das Foto als Buffer übergeben (idealerweise vom Aufrufer schon auf ~1200×630
// zugeschnitten); objectFit:cover fängt Abweichungen ab.
import { h } from '../h.mjs';
import { BRAND, dataUri, trustBadge } from '../brand.mjs';

/**
 * @param {object} o
 * @param {Buffer} o.photo       Hintergrundfoto (JPG/PNG/WebP-Buffer)
 * @param {string} [o.photoMime="image/jpeg"]
 * @param {string} o.claim       Nutzen-Claim, z. B. "Ihr Elektriker in Regensburg."
 * @param {string} [o.subline]
 * @param {string} [o.domain]
 * @param {string} [o.rating]
 * @param {string} [o.ort]
 * @param {Buffer} [o.logo]      Logo (weiße Variante)
 * @param {string} [o.logoMime="image/svg+xml"]
 * @param {object} [o.brand=BRAND]
 * @returns {object} Satori-Element
 */
export function hero(o = {}) {
  const brand = o.brand ?? BRAND;
  if (!o.photo) throw new Error('[cw-core/og:hero] `photo` (Buffer) ist erforderlich');
  if (!o.claim) throw new Error('[cw-core/og:hero] `claim` ist erforderlich');

  return h('div', { style: { position: 'relative', width: '100%', height: '100%', display: 'flex', fontFamily: 'Inter' } },
    // Foto vollflächig
    h('img', {
      src: dataUri(o.photo, o.photoMime ?? 'image/jpeg'),
      width: 1200, height: 630,
      style: { position: 'absolute', top: 0, left: 0, width: 1200, height: 630, objectFit: 'cover' },
    }),
    // Gradient-Overlay (unten dunkel für Lesbarkeit)
    h('div', {
      style: {
        position: 'absolute', top: 0, left: 0, width: 1200, height: 630, display: 'flex',
        backgroundImage: `linear-gradient(180deg, rgba(29,30,59,0.15) 0%, rgba(29,30,59,0.55) 55%, rgba(29,30,59,0.92) 100%)`,
      },
    }),
    // Inhalt
    h('div', {
      style: { position: 'relative', width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '60px 68px' },
    },
      o.logo && h('img', { src: dataUri(o.logo, o.logoMime ?? 'image/svg+xml'), width: 52, height: 52 }),
      h('div', { style: { display: 'flex', flexDirection: 'column' } },
        h('div', { style: { display: 'flex', fontFamily: 'Jakarta', fontWeight: 800, fontSize: 72, color: 'white', lineHeight: 1.05 } }, o.claim),
        o.subline && h('div', { style: { display: 'flex', marginTop: 18, fontSize: 28, color: 'rgba(255,255,255,0.82)' } }, o.subline),
        h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 34 } },
          trustBadge({ rating: o.rating, ort: o.ort, brand }) ?? h('div', {}),
          o.domain && h('div', {
            style: { display: 'flex', alignItems: 'center', gap: 10, fontFamily: 'Mono', fontSize: 28, color: brand.accent },
          }, o.domain, h('span', { style: { display: 'flex', fontFamily: 'Inter', fontWeight: 700 } }, '→')),
        ),
      ),
    ),
  );
}
