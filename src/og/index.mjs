// @cw/core/og — OG-Studio v3: scharfe, brand-treue, CTA-fähige OG-Images.
// Satori (Layout + Brand-Fonts) → sharp (Supersampling-Rasterung, <300 KB).
//
// Nutzung (Node-Prebuild-Script im Consumer):
//   import { renderOg, cta } from '@cw/core/og';
//   const { buffer, ext } = await renderOg(cta({ claim: 'Ihr Elektriker in Regensburg.', rating: '4,9', domain: 'elektro-mueller.de' }));
//   writeFileSync(`public/og/default.${ext}`, buffer);
export { renderOg } from './engine.mjs';
export { loadFonts } from './fonts.mjs';
export { h } from './h.mjs';
export { BRAND, trustBadge, dataUri } from './brand.mjs';
export { cta } from './templates/cta.mjs';
export { offer } from './templates/offer.mjs';
export { proof } from './templates/proof.mjs';
export { hero } from './templates/hero.mjs';
