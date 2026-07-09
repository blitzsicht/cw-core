// Template `proof` — NUR BLITZSICHT / Agentur (kein Cluster-Default).
// Live-PageSpeed-Beweis: Claim links, weiße Karte mit 4 Lighthouse-Ringen rechts.
// Ehrlichkeits-Regeln wie LiveProofBoard: echte Werte, Messdatum + Quelle im Bild.
//
// Layout-Fix ggü. Sample: Ring-Spalten mit flex:1 + kleinere Labels → kein Overlap.
import { h } from '../h.mjs';
import { BRAND, dataUri } from '../brand.mjs';

const CATS = [
  ['performance', 'Performance'],
  ['accessibility', 'Barrierefreiheit'],
  ['best_practices', 'Best Practices'],
  ['seo_score', 'SEO'],
];

const tone = (s) => (s >= 90 ? '#0cce6b' : s >= 50 ? '#ffa400' : '#ff4e42');
const toneDark = (s) => (s >= 90 ? '#018642' : s >= 50 ? '#a05a00' : '#c7221b');

/** Ein Lighthouse-Ring als eigenständiges SVG (data-URI-<img>). */
function ringImg(score, size = 132) {
  const r = 54, cx = size / 2, cy = size / 2;
  const circ = 2 * Math.PI * r;
  const dash = (Math.min(score, 100) / 100) * circ;
  const c = tone(score);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <circle cx="${cx}" cy="${cy}" r="${r * 0.9}" fill="${c}" fill-opacity="0.08"/>
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="rgba(29,30,59,0.10)" stroke-width="10"/>
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${c}" stroke-width="10" stroke-linecap="round"
      stroke-dasharray="${dash} ${circ}" transform="rotate(-90 ${cx} ${cy})"/>
    <text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="central"
      font-family="Helvetica,Arial,sans-serif" font-weight="800" font-size="42" fill="${toneDark(score)}">${score}</text>
  </svg>`;
  return dataUri(svg);
}

/**
 * @param {object} o
 * @param {object} o.site       PSI-Eintrag: { domain, performance, accessibility, best_practices, seo_score, fetched_at }
 * @param {string} [o.eyebrow="GOOGLE MISST UNS TÄGLICH"]
 * @param {string[]} [o.claimLines=["Webdesign, das","beweist statt","behauptet."]]
 * @param {string} [o.subline="Die Live-Werte stehen ungefiltert auf der Startseite."]
 * @param {object} [o.brand=BRAND]
 * @returns {object} Satori-Element
 */
export function proof(o = {}) {
  const brand = o.brand ?? BRAND;
  const site = o.site;
  if (!site) throw new Error('[cw-core/og:proof] `site` (PSI-Daten) ist erforderlich');
  const scores = CATS.map(([k]) => site[k]);
  if (scores.some((v) => typeof v !== 'number')) {
    throw new Error('[cw-core/og:proof] unvollständige Scores (performance/accessibility/best_practices/seo_score)');
  }
  const claimLines = o.claimLines ?? ['Webdesign, das', 'beweist statt', 'behauptet.'];
  const datum = site.fetched_at
    ? new Date(site.fetched_at).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : null;

  return h('div', {
    style: {
      width: '100%', height: '100%', display: 'flex', padding: '64px',
      backgroundImage: `linear-gradient(135deg, ${brand.primary} 0%, #24264a 100%)`, fontFamily: 'Inter',
    },
  },
    // links: Claim
    h('div', { style: { display: 'flex', flexDirection: 'column', width: 460, justifyContent: 'center' } },
      h('div', { style: { display: 'flex', fontSize: 19, fontWeight: 600, letterSpacing: 3, color: brand.accent } },
        o.eyebrow ?? 'GOOGLE MISST UNS TÄGLICH'),
      h('div', {
        style: { display: 'flex', flexDirection: 'column', marginTop: 22, fontFamily: 'Jakarta', fontWeight: 800, fontSize: 52, color: 'white', lineHeight: 1.08 },
      }, ...claimLines.map((l) => h('div', { style: { display: 'flex' } }, l))),
      h('div', { style: { display: 'flex', marginTop: 26, fontSize: 22, color: 'rgba(255,255,255,0.68)' } },
        o.subline ?? 'Die Live-Werte stehen ungefiltert auf der Startseite.'),
      h('div', { style: { display: 'flex', marginTop: 30, fontSize: 30, fontWeight: 800, color: brand.accent } }, site.domain),
    ),
    // rechts: weiße Beweis-Karte
    h('div', {
      style: { display: 'flex', flexDirection: 'column', flex: 1, marginLeft: 40, backgroundColor: 'white', borderRadius: 26, padding: '38px 34px', justifyContent: 'center' },
    },
      h('div', { style: { display: 'flex', fontFamily: 'Mono', fontSize: 25, color: brand.primary, marginBottom: 26 } }, site.domain),
      h('div', { style: { display: 'flex', justifyContent: 'space-between' } },
        ...CATS.map(([k, label]) => h('div', {
          style: { display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, overflow: 'hidden' },
        },
          h('img', { src: ringImg(site[k]), width: 118, height: 118 }),
          h('div', { style: { display: 'flex', marginTop: 14, fontSize: 16, fontWeight: 700, color: brand.primary } }, label),
        )),
      ),
      datum && h('div', { style: { display: 'flex', marginTop: 28, fontSize: 17, color: 'rgba(29,30,59,0.5)' } },
        `Live gemessen am ${datum} · Google PageSpeed (mobil)`),
    ),
  );
}
