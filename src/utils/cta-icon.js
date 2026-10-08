/**
 * cta-icon.js — welches Symbol ein CTA-Knopf trägt, entschieden am Ziel des Links.
 *
 * Anlass (07.10.2026, Scaffold levia-therapiezentrum): Hero.astro zeichnete vor den
 * Primär-CTA immer einen Briefumschlag, auch bei `tel:`-Links. „Anrufen: 09405 …" mit
 * Brief-Symbol ist ein falsches Signal. Betroffen in der Flotte (grep über alle
 * customer-*-Repos, 07.10.2026): haarwerk-neutraubling (index, haarwerk-salon, kontakt)
 * und levia-therapiezentrum. Alle anderen Hero-Aufrufe verlinken Seiten oder Anker —
 * für sie bleibt der Umschlag, damit sich dort nichts sichtbar ändert.
 *
 * Eine Quelle für das Telefon-Symbol: FloatingCallButton nutzt denselben Pfad.
 */

/** Feather „phone", 24×24, Strich — dieselbe Form wie im FloatingCallButton. */
export const TELEFON_PFAD =
  'M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.37 1.9.72 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.35 1.85.59 2.81.72A2 2 0 0 1 22 16.92z';

/** Briefumschlag, wie bisher im Hero. */
export const BRIEF_PFAD = 'M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z';
export const BRIEF_LINIE = '22,6 12,13 2,6';

/** Feather „arrow-right“: Stiel und Spitze. */
export const PFEIL_LINIEN = ['5,12 19,12', '12,5 19,12 12,19'];

/** Feather „map-pin“: Tropfen und Punkt (der Kreis als Pfad, damit er ins Schema passt). */
export const PIN_PFADE = [
  'M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z',
  'M12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
];

/**
 * Symbol eines CTA-Knopfs.
 *
 * `wahl` (opt-in seit v0.171.0) legt es ausdruecklich fest. Ohne Angabe oder mit `'auto'`
 * gilt das Verhalten von v0.169.0: `tel:` → Telefon, sonst Briefumschlag. Anlass:
 * haarwerk 08.10.2026, „Route planen“ (OpenStreetMap-Link) trug einen Brief.
 *
 * @param {string | undefined | null} href
 * @param {'auto' | 'phone' | 'mail' | 'arrow' | 'pin' | 'none'} [wahl]
 * @returns {{ art: 'telefon' | 'brief' | 'pfeil' | 'pin' | 'keins', pfade: string[], linien: string[] }}
 */
export function ctaIcon(href, wahl = 'auto') {
  if (wahl === 'phone') return { art: 'telefon', pfade: [TELEFON_PFAD], linien: [] };
  if (wahl === 'mail') return { art: 'brief', pfade: [BRIEF_PFAD], linien: [BRIEF_LINIE] };
  if (wahl === 'arrow') return { art: 'pfeil', pfade: [], linien: [...PFEIL_LINIEN] };
  if (wahl === 'pin') return { art: 'pin', pfade: [...PIN_PFADE], linien: [] };
  if (wahl === 'none') return { art: 'keins', pfade: [], linien: [] };
  if (typeof href === 'string' && /^\s*tel:/i.test(href)) {
    return { art: 'telefon', pfade: [TELEFON_PFAD], linien: [] };
  }
  return { art: 'brief', pfade: [BRIEF_PFAD], linien: [BRIEF_LINIE] };
}
