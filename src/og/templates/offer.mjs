// Template `offer` — richer CLUSTER-DEFAULT für Homepages (Ad-Stil).
// Betrachter-zentriert: Angebot (Headline) + 3 Benefit-Bullets + Grund-zu-klicken
// (CTA-Zeile mit Domain) + optionaler kleiner Trust-Chip. Antwortet auf
// "Was kriege ich? Warum klicke ich?" — nicht "Was können wir?".
import { h } from '../h.mjs';
import { BRAND, logoImg } from '../brand.mjs';

/**
 * @param {object} o
 * @param {string|string[]} o.headline  Angebot, z. B. ["Ihre Firmen-Website.","In 7 Werktagen live."]
 * @param {string[]} o.bullets          bis 3 Benefits, z. B. ["Ohne Cookie-Banner","Code gehört Ihnen","Fester Ansprechpartner"]
 * @param {string} [o.eyebrow]          z. B. "WEBDESIGN AUS REGENSBURG"
 * @param {string} [o.ctaText]          Grund zu klicken, z. B. "Kostenloser Website-Check"
 * @param {string} [o.domain]           z. B. "blitzsicht.com"
 * @param {string} [o.proofChip]        kleiner Trust-Chip, z. B. "100/100 Google PageSpeed"
 * @param {Buffer} [o.logo]             Logo (weiße Variante)
 * @param {string} [o.logoMime="image/svg+xml"]
 * @param {object} [o.brand=BRAND]
 * @returns {object} Satori-Element
 */
export function offer(o = {}) {
  const brand = o.brand ?? BRAND;
  const lines = Array.isArray(o.headline) ? o.headline : String(o.headline ?? '').split('\n');
  if (!lines[0]) throw new Error('[cw-core/og:offer] `headline` ist erforderlich');
  const bullets = (o.bullets ?? []).slice(0, 3);

  return h('div', {
    style: {
      width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
      padding: '60px 68px', backgroundImage: `linear-gradient(135deg, ${brand.primary} 0%, ${brand.primaryLight} 100%)`,
      fontFamily: 'Inter',
    },
  },
    // Kopf: Logo + Eyebrow
    h('div', { style: { display: 'flex', alignItems: 'center', gap: '18px' } },
      o.logo && logoImg(o.logo, o.logoMime ?? 'image/svg+xml', 46),
      o.eyebrow && h('div', { style: { display: 'flex', fontSize: 20, fontWeight: 600, letterSpacing: 3, color: brand.accent } }, o.eyebrow),
    ),
    // Mitte: Headline + Benefit-Bullets
    h('div', { style: { display: 'flex', flexDirection: 'column' } },
      h('div', {
        style: { display: 'flex', flexDirection: 'column', fontFamily: 'Jakarta', fontWeight: 800, fontSize: 60, color: 'white', lineHeight: 1.06 },
      }, ...lines.map((l) => h('div', { style: { display: 'flex' } }, l))),
      bullets.length > 0 && h('div', { style: { display: 'flex', flexDirection: 'column', marginTop: 30, gap: '14px' } },
        ...bullets.map((b) => h('div', { style: { display: 'flex', alignItems: 'center', gap: '16px' } },
          h('div', { style: { display: 'flex', fontSize: 30, fontWeight: 700, color: brand.accent } }, '✓'),
          h('div', { style: { display: 'flex', fontSize: 27, color: 'rgba(255,255,255,0.92)' } }, b),
        )),
      ),
    ),
    // Fuß: CTA-Zeile (Grund zu klicken) + Domain · rechts kleiner Trust-Chip
    h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' } },
      h('div', { style: { display: 'flex', alignItems: 'center', gap: '14px' } },
        o.ctaText && h('div', { style: { display: 'flex', fontSize: 27, fontWeight: 600, color: brand.accent } }, o.ctaText),
        o.ctaText && h('div', { style: { display: 'flex', fontSize: 27, fontWeight: 700, color: brand.accent } }, '→'),
        o.domain && h('div', { style: { display: 'flex', fontFamily: 'Mono', fontSize: 26, color: 'white' } }, o.domain),
      ),
      o.proofChip && h('div', {
        style: {
          display: 'flex', alignItems: 'center', gap: '10px', backgroundColor: 'rgba(255,255,255,0.08)',
          border: '1px solid rgba(255,255,255,0.16)', borderRadius: 999, padding: '10px 20px',
          fontSize: 20, color: 'rgba(255,255,255,0.82)',
        },
      }, h('div', { style: { display: 'flex', color: '#0cce6b', fontWeight: 700 } }, '●'), o.proofChip),
    ),
  );
}
