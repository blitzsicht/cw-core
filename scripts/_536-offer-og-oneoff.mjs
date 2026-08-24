// One-off #536: offer-OG mit Motiv-Foto (featherLeft-Split) für 4 Kunden.
// Läuft aus cw-core (satori/sharp da). Motive aus customer-websites/docs/og-motive-render/.
// Output: Staging in customer-websites/docs/og-motive-render/final/<slug>-og.png (Review vor Live).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { renderOg, offer, featherLeft } from '../src/og/index.mjs';

const CW = '/Volumes/SiluriWork/NAS-Spiegel/MEDIEN/CODE/CLAUDE/customer-websites';
const MOTIF = `${CW}/docs/og-motive-render`;
const OUT = `${MOTIF}/final`;
mkdirSync(OUT, { recursive: true });

const JOBS = {
  zink: {
    motif: `${MOTIF}/zink.webp`,
    eyebrow: 'FAMILIENBÄCKEREI SEIT 1898',
    headline: ['Handwerk,', 'das man schmeckt.'],
    bullets: ['Tagesfrisch gebacken', 'Konditorei & Café', '11× rund um Regensburg'],
    ctaText: 'Standorte entdecken',
    domain: 'baeckereizink.de',
    brand: { primary: '#E20680', primaryLight: '#F0258F', accent: '#ffd23f' },
  },
  steller: {
    motif: `${MOTIF}/steller.webp`,
    eyebrow: 'SANIERUNG AUS REGENSBURG',
    headline: ['Ein Ansprechpartner.', 'Komplette Sanierung.'],
    bullets: ['Klare Abläufe', 'Bewährtes Netzwerk', 'Alles aus einer Hand'],
    ctaText: 'Kostenlose Erstbesichtigung',
    domain: 'steller-sanierungen.com',
    brand: { primary: '#313d44', primaryLight: '#3f4e57', accent: '#DE1668' },
  },
  dd: {
    motif: `${MOTIF}/dd.webp`,
    eyebrow: 'DRUCK- & KOPIERLÖSUNGEN',
    headline: ['Druck & Kopie,', 'sorglos gelöst.'],
    bullets: ['Bedarfsanalyse', 'Herstellervergleich', 'Lieferung & Service'],
    ctaText: 'Beratung anfragen',
    domain: 'digital-direkt.com',
    brand: { primary: '#312783', primaryLight: '#4a3da6', accent: '#4d9918' },
  },
  hausamlago: {
    motif: `${MOTIF}/hausamlago.webp`,
    eyebrow: 'ANGELURLAUB · LAGO DI LEDRO',
    headline: ['Ferienhaus', 'für Angler.'],
    bullets: ['Waller, Hecht, Zander', 'Direkt am Bergsee', '15 km vom Gardasee'],
    ctaText: 'Beim Eigentümer anfragen',
    domain: 'hausamlago.com',
    brand: { primary: '#3D4F2F', primaryLight: '#4A5E3A', accent: '#c9a84a' },
  },
};

for (const [slug, j] of Object.entries(JOBS)) {
  const photo = await featherLeft(readFileSync(j.motif), { width: 620, height: 630, fill: 1, position: 'top' });
  const { buffer, ext } = await renderOg(offer({
    eyebrow: j.eyebrow,
    headline: j.headline,
    bullets: j.bullets,
    ctaText: j.ctaText,
    domain: j.domain,
    photo,
    photoWidth: 620,
    brand: j.brand,
  }), { maxBytes: Infinity });
  const out = `${OUT}/${slug}-og.png`;
  writeFileSync(out, buffer);
  console.log(`${slug}: ${(buffer.length / 1024) | 0} KB, ${ext} -> ${out}`);
}
console.log('\nFertig. Karten in:', OUT);
