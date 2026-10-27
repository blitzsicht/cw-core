// @ts-check
/**
 * @cw/core/integrations/ai-discovery/schrittnummer-contrast-check
 *
 * Build-time-Guard: ist die grosse Schritt-Ziffer in `ProcessSteps` ueberhaupt
 * zu sehen?
 *
 * ANLASS (27.10.2026). Bis v0.183.0 wurde die Ziffer als Kontur gemalt
 * (`-webkit-text-stroke`, Fuellung transparent). Das sah bei `system-ui` je nach
 * Glyphe kaputt aus — die „2“ trug einen Strich quer durch den Fuss (haarwerk
 * 08.10., levia 27.10.) — und war nebenbei nicht messbar: im Raster steht die
 * Ziffer in einem `::before`, und axe prueft auf Pseudo-Elementen keinen
 * Farbkontrast. v0.184.0 streicht die Kontur; gefuellt ist die einzige Darstellung.
 *
 * Damit haengt alles an einem Token, und genau da sass der zweite Befund: der
 * Test aus v0.182.0 rechnet gegen eine **Handliste** von 21 Flottenfarben vom
 * 25.10. — `--color-accent-text: #ffffff` (weinkontor-sinzing, tokens.css:14)
 * steht nicht darin. Dort entstuende eine weisse Ziffer auf weissem Abschnitt,
 * und kein Test der Flotte haette es gemeldet. Ein Check, der die Flotte nur als
 * Kopie kennt, ist fuer den gebauten Kunden kein Nachweis. Dieser hier liest die
 * Tokens des Repos, das gerade baut.
 *
 * WAS ER NICHT TUT. Er waehlt keine Farbe. Welcher Ton zur Marke passt,
 * entscheidet der Kunde; der Guard nennt den gemessenen Wert und weigert sich,
 * eine unsichtbare Ziffer stillschweigend auszuliefern.
 *
 * @typedef {'raster' | 'weg'} Variante
 * @typedef {{ type: 'schrittnummer_contrast', variante: Variante, detail: string, ratio: number }} SchrittnummerIssue
 */
import { kontrast, alsHex, leseToken } from './button-contrast-check.js';

/**
 * Hintergrund des Abschnitts. `.process-section` setzt in ProcessSteps.astro
 * fest `background: white` — die Ziffer liegt ausserhalb der Karte, also nicht
 * auf `--color-surface`. Aendert sich das in der Komponente, meldet die Probe
 * `Hintergrund stimmt mit der Komponente ueberein` in der Testdatei.
 */
export const ABSCHNITT_HINTERGRUND = '#ffffff';

/** Deckkraft der Ziffer, wie in ProcessSteps.astro gesetzt. */
export const DECKKRAFT = 0.8;

/**
 * Legt `farbe` mit `deckkraft` auf `grund` und gibt die resultierende Farbe als
 * Hex zurueck. Ohne diesen Schritt rechnet man den Kontrast der vollen Farbe —
 * und uebersieht genau den Fehler, der v0.182.0 ausgeloest hat (0.25 Deckkraft
 * ergab 1,47:1, gerechnet wie volle Farbe waeren es 5,6:1 gewesen).
 * @param {string} farbe 6-stelliges Hex
 * @param {number} deckkraft 0..1
 * @param {string} grund 6-stelliges Hex
 * @returns {string}
 */
export function ueberlagert(farbe, deckkraft, grund) {
  const teile = [1, 3, 5].map((i) => {
    const f = parseInt(farbe.slice(i, i + 2), 16);
    const g = parseInt(grund.slice(i, i + 2), 16);
    return Math.round(deckkraft * f + (1 - deckkraft) * g);
  });
  return '#' + teile.map((c) => c.toString(16).padStart(2, '0')).join('');
}

/**
 * @param {string} css Kunden-CSS (tokens.css o. ae.)
 * @param {number} [schwelle] Default 3:1 — die Ziffer ist 48–96 px bei Gewicht
 *   800/900, also Large Text nach WCAG 1.4.3.
 * @returns {{ status: 'ok' | 'befund' | 'nicht-rechenbar', grund: string | null, issues: SchrittnummerIssue[] }}
 */
export function pruefeSchrittnummerKontrast(css, schwelle = 3) {
  /** @type {Array<{ variante: Variante, tokenName: string, roh: string | null, selektor: string }>} */
  const faelle = [];

  // Raster: `.step::before` nimmt --color-accent-text mit Fallback auf --color-accent.
  const akzentText = leseToken(css, 'color-accent-text');
  const akzent = leseToken(css, 'color-accent');
  faelle.push({
    variante: 'raster',
    tokenName: akzentText ? '--color-accent-text' : '--color-accent (Fallback)',
    roh: akzentText ?? akzent,
    selektor: '.step::before',
  });

  // Weg: `.weg-nr` nimmt --color-primary.
  faelle.push({
    variante: 'weg',
    tokenName: '--color-primary',
    roh: leseToken(css, 'color-primary'),
    selektor: '.weg-nr',
  });

  /** @type {SchrittnummerIssue[]} */
  const issues = [];
  /** @type {string[]} */
  const unrechenbar = [];

  for (const fall of faelle) {
    const hex = alsHex(fall.roh);
    if (!hex) {
      unrechenbar.push(
        fall.roh
          ? `${fall.tokenName} ist "${fall.roh}" — kein rechenbarer Hexwert (color-mix(), oklch(), var() o. ae.)`
          : `${fall.tokenName} ist in dieser Datei nicht gesetzt`,
      );
      continue;
    }
    const sichtbar = ueberlagert(hex, DECKKRAFT, ABSCHNITT_HINTERGRUND);
    const r = Math.round(kontrast(sichtbar, ABSCHNITT_HINTERGRUND) * 100) / 100;
    if (r >= schwelle) continue;
    issues.push({
      type: 'schrittnummer_contrast',
      variante: fall.variante,
      ratio: r,
      detail:
        `Die Schritt-Ziffer (${fall.selektor}) erreicht nur ${r.toFixed(2)}:1 ` +
        `(noetig ${schwelle}:1) — ${fall.tokenName} ist ${hex}, mit Deckkraft ${DECKKRAFT} ` +
        `auf ${ABSCHNITT_HINTERGRUND} ergibt das ${sichtbar}. ` +
        (fall.variante === 'raster'
          ? 'Setze --color-accent-text auf einen Ton, der als Text auf Weiss besteht ' +
            '(tokens-base.css: "WCAG AA 4,5:1 auf Weiss") — er faerbt auch Links.'
          : 'Setze --color-primary auf einen Ton, der als Text auf Weiss besteht.'),
    });
  }

  // Drei Zustaende, nicht zwei: "konnte nicht rechnen" ist nicht "bestanden".
  // Nur wenn ueberhaupt nichts rechenbar war, ist das Ergebnis leer UND unklar.
  if (issues.length === 0 && unrechenbar.length === faelle.length) {
    return { status: 'nicht-rechenbar', grund: unrechenbar.join(' · '), issues: [] };
  }
  if (issues.length > 0) return { status: 'befund', grund: null, issues };
  return { status: 'ok', grund: null, issues: [] };
}
