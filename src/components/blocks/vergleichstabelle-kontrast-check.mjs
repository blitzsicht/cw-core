// @ts-check
/**
 * @cw/core/components/blocks/vergleichstabelle-kontrast-check
 *
 * Guard: reicht der Kontrast jeder Textzelle in `VergleichsTabelle.astro`
 * gegen ihre deckende Flaeche?
 *
 * ANLASS (blitzsicht-ops#817, Upstream blitzsicht/cw-core#148). `.vergleich-table`
 * setzte `background: white` hart, ohne Token. Auf platzfrei.club (dunkler
 * Mandant, vor dessen eigener Komponente) fielen drei Zellen unter 4,5:1 —
 * gemessen am 17.09.2026:
 *   Zeilenlabel         #F7F7F2 auf #FFFFFF   1,07
 *   Markenspalte        #04FFF7 auf #FFFFFF   1,26
 *   Wettbewerberspalte  #8E949B auf #FFFFFF   3,06
 *
 * Dieser Guard liest die ECHTE Datei (kein Abbild/keine Kopie der CSS-Regeln)
 * und berechnet pro Zelle den Kontrast fuer einen gegebenen Token-Satz. Er
 * kennt sechs Text/Flaeche-Paare, hergeleitet aus der CSS-Kaskade der Datei
 * (Spezifitaet + !important — nachgerechnet, nicht geraten):
 *
 *   thead-kriterium    .vergleich-table thead th (Spezifitaet 0,1,2) — deckt
 *                      sowohl die Kriterium- als auch die Wettbewerber-Kopfzelle
 *                      ab, da `.col-other` (0,1,0) dagegen verliert.
 *   thead-marke        .col-brand-header, !important — gewinnt gegen
 *                      `.vergleich-table thead th` UND gegen `.col-brand`.
 *   zeilenlabel        kein color-Rule auf `.col-kriterium` -> ambient
 *                      (Body-Text, wie `body { color: var(--color-text) }`
 *                      in tokens-base.css) auf `.vergleich-table`.
 *   markenspalte       .col-brand auf `.vergleich-table` (Zeile ohne Gewinn).
 *   markenspalte-win   .cell-win auf `.vergleich-table` — gewinnt gegen
 *                      `.col-brand` durch spaetere Quelltextposition bei
 *                      gleicher Spezifitaet (beide 0,1,0).
 *   wettbewerberspalte .col-other auf `.vergleich-table` — nur im tbody
 *                      wirksam, im thead verliert es gegen thead-kriterium.
 *
 * Absichtlich KEIN allgemeiner CSS-Parser: die Block-Extraktion sucht nach
 * dem woertlichen `<selector> {`-Praefix und geht von einer flachen,
 * unverschachtelten Regel aus (wie diese Datei sie hat). Fuer eine andere
 * Komponente waere das kein tragfaehiger Ansatz.
 */
import { readFileSync } from 'node:fs';
import { kontrast, alsHex } from '../../integrations/ai-discovery/button-contrast-check.js';

/**
 * Holt den Deklarationsblock eines Selektors aus CSS-Text. Keine Verschachtelung
 * erwartet — nimmt den ERSTEN Treffer des woertlichen `<selector> {`.
 * @param {string} css @param {string} selector @returns {string|null}
 */
export function block(css, selector) {
  const i = css.indexOf(selector + ' {');
  if (i === -1) return null;
  const open = css.indexOf('{', i);
  const close = css.indexOf('}', open);
  if (open === -1 || close === -1) return null;
  return css.slice(open + 1, close);
}

/**
 * Liest eine CSS-Eigenschaft aus einem Deklarationsblock. Nimmt die LETZTE
 * Definition — so gewinnt sie auch innerhalb desselben Blocks.
 * @param {string|null} blockText @param {string} prop @returns {string|null}
 */
export function eigenschaft(blockText, prop) {
  if (!blockText) return null;
  const treffer = [...blockText.matchAll(new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`, 'g'))];
  return treffer.length ? treffer[treffer.length - 1][1].trim() : null;
}

/**
 * Loest `var(--name, fallback)` gegen einen Token-Satz auf. Ein reiner
 * Literal-Wert (kein `var()`) kommt unveraendert (normalisiert) zurueck. Der
 * Fallback stammt IMMER aus dem echten Deklarationstext, nie aus einer
 * zweiten, gepflegten Quelle — so zieht eine spaetere Fallback-Aenderung im
 * Component-Code automatisch nach, ohne dass dieser Guard veraltet.
 * @param {string|null} wert @param {Record<string,string>} tokens
 * @returns {string|null}
 */
export function loese(wert, tokens) {
  if (!wert) return null;
  const m = wert.match(/^var\(\s*--([a-z0-9-]+)\s*(?:,\s*([^)]+))?\)\s*(!important)?$/i);
  if (!m) return alsHex(wert.replace(/!important/i, '').trim());
  const [, name, fallback] = m;
  if (Object.prototype.hasOwnProperty.call(tokens, name)) return alsHex(tokens[name]);
  return fallback ? alsHex(fallback.trim()) : null;
}

/**
 * @typedef {{ id: string, label: string, fg: string|null, bg: string|null, ratio: number|null }} Zellbefund
 */

/**
 * @param {string} css Der komplette `<style>`-Text aus VergleichsTabelle.astro
 * @param {Record<string,string>} tokens z.B. `{ 'color-text': '#F7F7F2', ... }`
 * @param {{ ambientText?: string, schwelle?: number }} [opts]
 * @returns {{ zellen: Zellbefund[], nichtRechenbar: string[], alleBestehen: boolean }}
 */
export function pruefeVergleichstabelle(css, tokens, opts = {}) {
  const schwelle = opts.schwelle ?? 4.5;
  // Deckt sich mit `body { color: var(--color-text, #1a1a1a) }` in
  // tokens-base.css — absichtlich als Parameter mit demselben Fallback-Wert,
  // nicht aus einer zweiten Datei gelesen (der Guard soll nur EINE Quelle der
  // Wahrheit fuer die eigentliche Komponente brauchen).
  const ambientText = opts.ambientText ?? tokens['color-text'] ?? '#1a1a1a';

  const theadBlock = block(css, '.vergleich-table thead th');
  const brandHeaderBlock = block(css, '.col-brand-header');
  const tableBlock = block(css, '.vergleich-table');
  const colBrandBlock = block(css, '.col-brand');
  const cellWinBlock = block(css, '.cell-win');
  const colOtherBlock = block(css, '.col-other');

  const tischFlaeche = loese(eigenschaft(tableBlock, 'background'), tokens);

  const kandidaten = [
    {
      id: 'thead-kriterium',
      label: 'Kopfzeile Kriterium/Wettbewerber (.vergleich-table thead th)',
      fg: loese(eigenschaft(theadBlock, 'color'), tokens),
      bg: loese(eigenschaft(theadBlock, 'background'), tokens),
    },
    {
      id: 'thead-marke',
      label: 'Kopfzeile Markenspalte (.col-brand-header)',
      fg: loese(eigenschaft(brandHeaderBlock, 'color'), tokens),
      bg: loese(eigenschaft(brandHeaderBlock, 'background'), tokens),
    },
    {
      id: 'zeilenlabel',
      label: 'Zeilenlabel (Body, ambient — kein eigenes color-Rule)',
      fg: alsHex(ambientText),
      bg: tischFlaeche,
    },
    {
      id: 'markenspalte',
      label: 'Markenspalte (.col-brand, Zeile ohne Gewinn-Markierung)',
      fg: loese(eigenschaft(colBrandBlock, 'color'), tokens),
      bg: tischFlaeche,
    },
    {
      id: 'markenspalte-win',
      label: 'Markenspalte (.cell-win, Gewinn-Zeile)',
      fg: loese(eigenschaft(cellWinBlock, 'color'), tokens),
      bg: tischFlaeche,
    },
    {
      id: 'wettbewerberspalte',
      label: 'Wettbewerberspalte (.col-other, nur Body wirksam)',
      fg: loese(eigenschaft(colOtherBlock, 'color'), tokens),
      bg: tischFlaeche,
    },
  ];

  /** @type {Zellbefund[]} */
  const zellen = [];
  /** @type {string[]} */
  const nichtRechenbar = [];
  for (const k of kandidaten) {
    if (!k.fg || !k.bg) {
      nichtRechenbar.push(`${k.id}: fg=${k.fg ?? 'null'} bg=${k.bg ?? 'null'}`);
      zellen.push({ id: k.id, label: k.label, fg: k.fg, bg: k.bg, ratio: null });
      continue;
    }
    const ratio = Math.round(kontrast(k.fg, k.bg) * 100) / 100;
    zellen.push({ id: k.id, label: k.label, fg: k.fg, bg: k.bg, ratio });
  }

  const alleBestehen = nichtRechenbar.length === 0 && zellen.every((z) => (z.ratio ?? 0) >= schwelle);
  return { zellen, nichtRechenbar, alleBestehen };
}

/**
 * Liest den `<style>`-Block aus einer `.astro`-Datei.
 * @param {string} pfad @returns {string}
 */
export function leseStyleBlock(pfad) {
  const quelle = readFileSync(pfad, 'utf8');
  const m = quelle.match(/<style[^>]*>([\s\S]*?)<\/style>/);
  if (!m) throw new Error(`Kein <style>-Block in ${pfad} gefunden`);
  return m[1];
}

/**
 * Formatiert einen Befund als Tabellenzeile fuer Konsolen-/PR-Ausgabe.
 * @param {Zellbefund} z @returns {string}
 */
export function formatiereZeile(z) {
  const ratioStr = z.ratio === null ? 'NICHT RECHENBAR' : z.ratio.toFixed(2);
  const status = z.ratio === null ? '?' : z.ratio >= 4.5 ? '✓' : '✗';
  return `${status} ${z.id.padEnd(20)} ${ratioStr.padStart(16)}  (${z.fg ?? '?'} auf ${z.bg ?? '?'})  ${z.label}`;
}
