// @ts-check
/**
 * Reine Entscheidungslogik für scripts/kennzeichnung-live.mjs — getrennt, damit sie
 * ohne Netz und ohne Registry testbar ist (scripts/lib/kennzeichnung-urteil.test.mjs).
 *
 * Zwei Fehlbefunde, die hier enden (03.10.2026):
 *   - cw-core #132: leere Sitemap → 0 Seiten → weder „geprüft“ noch „nicht geprüft“ →
 *     die Zeile sah grün aus, obwohl nichts gemessen wurde (haarwerk, 11.09.).
 *   - Review cw-site #53: gemessen wurde immer production_url — bei Kunden in der
 *     Vorschau ist das die Altseite des Kunden, nicht unsere Seite.
 */

/**
 * Seiten-URLs aus einer Sitemap. Mit `basis` wird jede <loc> auf deren Origin
 * umgeschrieben: die Vorschau liefert eine Sitemap mit der späteren Kundendomain
 * (astro `site:`), gemessen werden soll aber die Vorschau selbst.
 * @param {string} xml
 * @param {{ basis?: string|null, max?: number }} [opt]
 * @returns {string[]}
 */
export function seitenAusSitemap(xml, opt = {}) {
  const max = opt.max ?? Infinity;
  const locs = [...(xml || '').matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim());
  const ziel = opt.basis ? new URL(opt.basis) : null;
  return locs
    .map((l) => {
      if (!ziel) return l;
      const u = new URL(l);
      return `${ziel.origin}${u.pathname}${u.search}`;
    })
    .slice(0, max);
}

/**
 * Zustand einer Site-Zeile.
 *   'fehlend'       mindestens eine pflichtige Fundstelle ohne Label
 *   'nicht-geprueft' Deklaration vorhanden, aber keine Seite gemessen, oder einzelne
 *                   Seiten nicht messbar (Checkpoint/Login/Fehler)
 *   'ok'            alles gemessen, nichts fehlt
 *   'ohne-deklaration' keine bild-herkunft.ts — eigener Zustand, kein Urteil über Labels
 * @param {{ regeln: number, seiten: number, geprueft: number, nichtGeprueft: number, fehlend: number }} z
 * @returns {'fehlend'|'nicht-geprueft'|'ok'|'ohne-deklaration'}
 */
export function zeilenZustand(z) {
  if (z.regeln === 0) return 'ohne-deklaration';
  if (z.fehlend > 0) return 'fehlend';
  if (z.seiten === 0 || z.geprueft === 0 || z.nichtGeprueft > 0) return 'nicht-geprueft';
  return 'ok';
}

/**
 * Exit-Code über alle Zeilen: 1 = irgendwo fehlt ein Label · 2 = nichts fehlt, aber
 * etwas blieb ungeprüft · 0 = alles gemessen und sauber.
 * @param {string[]} zustaende
 * @returns {0|1|2}
 */
export function exitCode(zustaende) {
  if (zustaende.includes('fehlend')) return 1;
  if (zustaende.includes('nicht-geprueft')) return 2;
  return 0;
}
