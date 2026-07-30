// One-off #537: siluri.de Themen-OGs via offer-Template (text-only, Siluri-Branding).
// Ersetzt den bespoke Slogan-Pfad (generate-slogan-og.py). Läuft aus cw-core (satori/sharp da).
// Output: siluri-de/public/images/og/og-<theme>.png
import { readFileSync, writeFileSync } from 'node:fs';
import { renderOg, offer } from '../src/og/index.mjs';

const SD = '/Volumes/SiluriWork/NAS-Spiegel/MEDIEN/CODE/CLAUDE/siluri-de';
const OUT = `${SD}/public/images/og`;
const logo = readFileSync(`${SD}/public/siluri_logo_2026.svg`);
const brand = { primary: '#1a1a1a', primaryLight: '#2a2a2a', accent: '#e63946' };

const JOBS = {
  'identitaet': {
    eyebrow: 'VEREDELUNG AUS REGENSBURG',
    headline: ['Kleidung, die', 'zur Marke wird.'],
    bullets: ['DTF, Stickerei & Siebdruck', 'Langlebig & waschfest', 'Ab 1 Stück'],
    ctaText: 'Jetzt anfragen',
  },
  'team-marke': {
    eyebrow: 'FIRMENBEKLEIDUNG VEREDELT',
    headline: ['Euer Team,', 'eure Marke.'],
    bullets: ['Logo per DTF, Stick & Druck', 'Vom Polo bis zur Jacke', 'Ab 1 Stück'],
    ctaText: 'Kostenlos beraten lassen',
  },
  'team-sichtbar': {
    eyebrow: 'TEXTIL & WERBEARTIKEL',
    headline: ['Sichtbar', 'als Team.'],
    bullets: ['Textil & Werbeartikel veredelt', 'Passend für jede Branche', 'Ab 1 Stück'],
    ctaText: 'Sortiment entdecken',
  },
  'gedruckt': {
    eyebrow: 'DTF · STICKEREI · SIEBDRUCK',
    headline: ['Perfekt gedruckt', 'und gestickt.'],
    bullets: ['Brillante Farben, scharfe Kanten', 'Kleine & große Auflagen', 'Ab 1 Stück'],
    ctaText: 'Preis kalkulieren',
  },
};

for (const [theme, j] of Object.entries(JOBS)) {
  const { buffer, ext } = await renderOg(offer({
    eyebrow: j.eyebrow,
    headline: j.headline,
    bullets: j.bullets,
    ctaText: j.ctaText,
    domain: 'siluri.de',
    logo,
    logoMime: 'image/svg+xml',
    brand,
  }), { maxBytes: Infinity });
  const out = `${OUT}/og-${theme}.${ext}`;
  writeFileSync(out, buffer);
  console.log(`${theme}: ${(buffer.length / 1024) | 0} KB, .${ext} -> ${out}`);
}
console.log('\nFertig.');
