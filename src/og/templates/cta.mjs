// Template `cta` — CLUSTER-DEFAULT für alle Customer.
// Nutzenversprechen + Ortsbezug groß, Trust-Signal (★-Bewertung / Ort) statt
// Pseudo-Button, Domain als dezente Wortmarke, optional Logo.
import { h } from '../h.mjs';
import { BRAND, dataUri, trustBadge } from '../brand.mjs';

/**
 * @param {object} o
 * @param {string} o.claim       Hauptzeile, z. B. "Ihr Elektriker in Regensburg."
 * @param {string} [o.eyebrow]   kleine Zeile oben, z. B. "ELEKTRO MÜLLER · REGENSBURG"
 * @param {string} [o.subline]   z. B. "Schnell erreichbar · Festpreis · Meisterbetrieb"
 * @param {string} [o.domain]    z. B. "elektro-mueller.de"
 * @param {string} [o.rating]    z. B. "4,9"
 * @param {string} [o.ort]       z. B. "Regensburg"
 * @param {Buffer} [o.logo]      Logo-Buffer (SVG/PNG, weiße Variante für dunklen Grund)
 * @param {string} [o.logoMime="image/svg+xml"]
 * @param {object} [o.brand=BRAND]
 * @returns {object} Satori-Element
 */
export function cta(o = {}) {
  const brand = o.brand ?? BRAND;
  if (!o.claim) throw new Error('[cw-core/og:cta] `claim` ist erforderlich');

  return h('div', {
    style: {
      width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
      justifyContent: 'space-between', padding: '68px 72px',
      backgroundImage: `linear-gradient(135deg, ${brand.primary} 0%, ${brand.primaryLight} 100%)`,
      fontFamily: 'Inter',
    },
  },
    // Kopf: Logo + Eyebrow
    h('div', { style: { display: 'flex', alignItems: 'center', gap: '18px' } },
      o.logo && h('img', { src: dataUri(o.logo, o.logoMime ?? 'image/svg+xml'), width: 52, height: 52 }),
      o.eyebrow && h('div', {
        style: { display: 'flex', fontSize: 21, fontWeight: 600, letterSpacing: 3, color: brand.accent },
      }, o.eyebrow),
    ),
    // Mitte: Claim + Subline
    h('div', { style: { display: 'flex', flexDirection: 'column' } },
      h('div', {
        style: { display: 'flex', fontFamily: 'Jakarta', fontWeight: 800, fontSize: 76, color: 'white', lineHeight: 1.05 },
      }, o.claim),
      o.subline && h('div', {
        style: { display: 'flex', marginTop: 22, fontSize: 30, color: 'rgba(255,255,255,0.72)' },
      }, o.subline),
    ),
    // Fuß: Trust-Badge links, Domain-Wortmarke rechts
    h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' } },
      trustBadge({ rating: o.rating, ort: o.ort, brand }) ?? h('div', {}),
      o.domain && h('div', {
        style: { display: 'flex', alignItems: 'center', gap: 10, fontFamily: 'Mono', fontSize: 30, color: brand.accent },
      }, o.domain, h('span', { style: { display: 'flex', fontFamily: 'Inter', fontWeight: 700 } }, '→')),
    ),
  );
}
