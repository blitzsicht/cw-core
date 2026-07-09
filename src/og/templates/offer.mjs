// Template `offer` — richer CLUSTER-DEFAULT für Homepages (Ad-Stil).
// Betrachter-zentriert: Angebot (Headline) + 3 Benefit-Bullets + Grund-zu-klicken
// (CTA-Zeile mit Domain) + optionaler kleiner Trust-Chip. Antwortet auf
// "Was kriege ich? Warum klicke ich?" — nicht "Was können wir?".
//
// Optionales `photo` (Buffer) → Split-Layout: Text links, Foto rechts (Person =
// Vertrauen), mit weichem Verlauf-Übergang. Foto idealerweise vom Aufrufer schon
// auf ~480×630 (cover) zugeschnitten.
import { h } from '../h.mjs';
import { BRAND, dataUri, logoImg, logoImgFit } from '../brand.mjs';

/**
 * @param {object} o
 * @param {string|string[]} o.headline  Angebot, z. B. ["Ihr Gebäude,","professionell gereinigt."]
 * @param {string[]} o.bullets          bis 3 Benefits
 * @param {string} [o.eyebrow]
 * @param {string} [o.ctaText]          Grund zu klicken
 * @param {string} [o.domain]
 * @param {string} [o.proofChip]        kleiner Trust-Chip
 * @param {Buffer} [o.photo]            optionales Foto rechts (Person)
 * @param {string} [o.photoMime="image/jpeg"]
 * @param {number} [o.photoWidth=480]
 * @param {Buffer} [o.logo]
 * @param {string} [o.logoMime="image/svg+xml"]
 * @param {object} [o.brand=BRAND]
 * @returns {object} Satori-Element
 */
export function offer(o = {}) {
  const brand = o.brand ?? BRAND;
  const lines = Array.isArray(o.headline) ? o.headline : String(o.headline ?? '').split('\n');
  if (!lines[0]) throw new Error('[cw-core/og:offer] `headline` ist erforderlich');
  const bullets = (o.bullets ?? []).slice(0, 3);
  const hasPhoto = !!o.photo;
  const photoW = o.photoWidth ?? 600;
  const logoPanel = !hasPhoto && !!o.logoPanel && !!o.logo; // Marken-Fallback: Logo rechts statt Foto
  const panelW = o.panelWidth ?? 440;
  const hasRightPanel = hasPhoto || logoPanel;

  // --- Inhalt (Kopf / Mitte / Fuß) ---
  const content = h('div', {
    style: {
      position: 'relative', display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
      width: hasPhoto ? 1200 - photoW + 200 : logoPanel ? 1200 - panelW + 130 : '100%', height: '100%', padding: '60px 68px',
    },
  },
    // Kopf: Logo (klein, nur ohne Logo-Panel) + Eyebrow
    h('div', { style: { display: 'flex', alignItems: 'center', gap: '18px' } },
      o.logo && !logoPanel && logoImg(o.logo, o.logoMime ?? 'image/svg+xml', 46),
      o.eyebrow && h('div', { style: { display: 'flex', fontSize: 20, fontWeight: 600, letterSpacing: 3, color: brand.accent } }, o.eyebrow),
    ),
    // Mitte: Headline + Benefit-Bullets
    h('div', { style: { display: 'flex', flexDirection: 'column' } },
      h('div', {
        style: { display: 'flex', flexDirection: 'column', fontFamily: 'Jakarta', fontWeight: 800, fontSize: hasRightPanel ? 54 : 60, color: 'white', lineHeight: 1.06 },
      }, ...lines.map((l) => h('div', { style: { display: 'flex' } }, l))),
      bullets.length > 0 && h('div', { style: { display: 'flex', flexDirection: 'column', marginTop: 28, gap: '14px' } },
        ...bullets.map((b) => h('div', { style: { display: 'flex', alignItems: 'center', gap: '16px' } },
          h('div', { style: { display: 'flex', fontSize: 28, fontWeight: 700, color: brand.accent } }, '✓'),
          h('div', { style: { display: 'flex', fontSize: 26, color: 'rgba(255,255,255,0.92)' } }, b),
        )),
      ),
    ),
    // Fuß: CTA-Zeile + Domain · rechts kleiner Trust-Chip
    h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' } },
      h('div', { style: { display: 'flex', alignItems: 'center', gap: '14px' } },
        o.ctaText && h('div', { style: { display: 'flex', fontSize: 26, fontWeight: 600, color: brand.accent } }, o.ctaText),
        o.ctaText && h('div', { style: { display: 'flex', fontSize: 26, fontWeight: 700, color: brand.accent } }, '→'),
        o.domain && h('div', { style: { display: 'flex', fontFamily: 'Mono', fontSize: 25, color: 'white' } }, o.domain),
      ),
      !hasPhoto && o.proofChip && h('div', {
        style: {
          display: 'flex', alignItems: 'center', gap: '10px', backgroundColor: 'rgba(255,255,255,0.08)',
          border: '1px solid rgba(255,255,255,0.16)', borderRadius: 999, padding: '10px 20px', fontSize: 20, color: 'rgba(255,255,255,0.82)',
        },
      }, h('div', { style: { display: 'flex', color: '#0cce6b', fontWeight: 700 } }, '●'), o.proofChip),
    ),
  );

  const bg = `linear-gradient(135deg, ${brand.primary} 0%, ${brand.primaryLight} 100%)`;

  // Logo-Fallback: kein Foto → Marken-Logo groß im rechten Panel (nie leere Fläche).
  if (logoPanel) {
    return h('div', { style: { position: 'relative', width: '100%', height: '100%', display: 'flex', backgroundImage: bg, fontFamily: 'Inter' } },
      h('div', {
        style: {
          position: 'absolute', top: 0, right: 0, width: panelW, height: 630, display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          backgroundColor: 'rgba(255,255,255,0.05)', borderLeft: '1px solid rgba(255,255,255,0.10)',
        },
      }, logoImgFit(o.logo, o.logoMime ?? 'image/svg+xml', panelW - 96, 210)),
      content,
    );
  }

  if (!hasPhoto) {
    return h('div', { style: { width: '100%', height: '100%', display: 'flex', backgroundImage: bg, fontFamily: 'Inter' } }, content);
  }

  // Split-Layout: Foto rechts. Der weiche Links-Übergang steckt als Alpha-Feather
  // IM Foto (featherLeft() aus photo.mjs) — KEIN Farb-Wash übers Gesicht. Das
  // Foto-Alpha blendet über die Hintergrund-Fläche → nahtlos, farbecht, Gesicht
  // bleibt rechts voll erhalten. Foto muss RGBA (PNG) sein.
  return h('div', { style: { position: 'relative', width: '100%', height: '100%', display: 'flex', backgroundImage: bg, fontFamily: 'Inter' } },
    h('img', {
      src: dataUri(o.photo, o.photoMime ?? 'image/png'), width: photoW, height: 630,
      style: { position: 'absolute', top: 0, right: 0, width: photoW, height: 630 },
    }),
    content,
  );
}
