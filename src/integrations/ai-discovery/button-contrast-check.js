// @ts-check
/**
 * @cw/core/integrations/ai-discovery/button-contrast-check
 *
 * Build-time-Guard: reicht der Kontrast der Schrift auf dem Akzent-Knopf?
 *
 * ANLASS (28.08.2026). `.btn-accent` in tokens-base.css setzte
 * `color: var(--color-accent-btn-text, white)`. Wer den Token nicht definiert,
 * bekommt weisse Schrift auf seiner Markenfarbe — und die Markenfarbe ist bei
 * vielen Kunden hell. Gemessen ueber die Live-Flotte fiel der Haupt-CTA bei
 * vier von zwoelf Kunden durch: soleno 1,65:1, digital-direkt 3,57:1,
 * hausamlago 4,28:1, mika 3,65:1 (dort war der Token gesetzt, nur zu hell).
 *
 * Daneben stand im Kern die Zeile
 *   "Subtle shadow ensures WCAG AA contrast even on lighter accent backgrounds"
 * ueber einem `text-shadow`. Das ist keine Zusicherung, sondern ein Irrtum: ein
 * Schatten geht in kein Kontrastverhaeltnis ein, weder bei axe noch nach WCAG.
 *
 * WAS DIESER GUARD TUT. Er kann die Farbe nicht waehlen — welche Schrift auf
 * eine Marke passt, entscheidet der Kunde. Er kann sich aber weigern, einen
 * unlesbaren Knopf auszuliefern, und nennt dabei den gemessenen Wert.
 *
 * @typedef {{ type: 'accent_button_contrast', detail: string, ratio: number }} ButtonIssue
 */

/** @param {string} hex @returns {number} */
function relativeLuminanz(hex) {
  const c = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

/**
 * Kontrastverhaeltnis nach WCAG 2.x. Erwartet zwei 6-stellige Hexwerte.
 * @param {string} a @param {string} b @returns {number}
 */
export function kontrast(a, b) {
  const l1 = relativeLuminanz(a);
  const l2 = relativeLuminanz(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

/**
 * Normalisiert `#abc`, `#aabbcc`, `white`, `black` auf 6-stelliges Hex.
 * Alles andere (Funktionen, benannte Exoten) → null: dann kann nicht gerechnet
 * werden, und Schweigen waere ehrlicher als eine erfundene Zahl.
 * @param {string|undefined|null} wert
 * @returns {string|null}
 */
export function alsHex(wert) {
  if (!wert) return null;
  const w = wert.trim().toLowerCase();
  if (w === 'white') return '#ffffff';
  if (w === 'black') return '#000000';
  const m = w.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/);
  if (!m) return null;
  const h = m[1];
  return h.length === 3 ? '#' + [...h].map((c) => c + c).join('') : '#' + h;
}

/**
 * Liest einen Custom-Property-Wert aus CSS-Quelltext. Nimmt die LETZTE
 * Definition — so gewinnt sie auch in der Kaskade.
 * @param {string} css @param {string} name
 * @returns {string|null}
 */
export function leseToken(css, name) {
  const treffer = [...css.matchAll(new RegExp(`--${name}\\s*:\\s*([^;}]+)`, 'gi'))];
  return treffer.length ? treffer[treffer.length - 1][1].trim() : null;
}

/**
 * @param {string} css Kunden-CSS (tokens.css o. ae.)
 * @param {number} [schwelle]
 * @returns {ButtonIssue[]}
 */
export function checkButtonContrast(css, schwelle = 4.5) {
  return pruefeButtonKontrast(css, schwelle).issues;
}

/**
 * Wie checkButtonContrast, aber mit dem dritten Zustand.
 *
 * `checkButtonContrast` gab in DREI verschiedenen Lagen ein leeres Array zurueck:
 * bestanden, `--color-accent` nicht rechenbar, Schriftfarbe nicht rechenbar. Der
 * Aufrufer machte daraus eine einzige Zeile — "✓ … (oder ist nicht berechenbar)" —
 * und weil die als `info` lief und nicht als `warn`, zaehlte build-warnings.mjs sie
 * als sauber. Der Flotten-Scan buchte "geprueft und bestanden", wo "konnte nicht
 * pruefen" stand.
 *
 * Gemessen am 30.08.2026: gympanzen faellt in genau diese Luecke (eigene Palette,
 * kein `--color-accent`) und meldete ✓, ohne dass je etwas gerechnet wurde.
 *
 * Dasselbe Prinzip steht schon in build-warnings-report.mjs im
 * customer-websites-Repo: "guardFindings ist -1, wenn nicht geprueft — 0 waere
 * eine Luege." Diese Funktion zieht nach.
 *
 * @param {string} css
 * @param {number} [schwelle]
 * @returns {{status: 'ok'|'befund'|'nicht-rechenbar', grund: string|null, issues: ButtonIssue[]}}
 */
export function pruefeButtonKontrast(css, schwelle = 4.5) {
  const akzentRoh = leseToken(css, 'color-accent');
  const akzent = alsHex(akzentRoh);
  if (!akzent) {
    return {
      status: 'nicht-rechenbar',
      grund: akzentRoh
        ? `--color-accent ist "${akzentRoh}" — kein rechenbarer Hexwert (color-mix(), oklch(), var() o. ae.)`
        : '--color-accent ist in dieser Datei nicht gesetzt',
      issues: [],
    };
  }
  // Ohne eigenen Token faellt .btn-accent auf weiss zurueck — genau der Fall,
  // der die vier Kunden erwischt hat.
  const schriftRoh = leseToken(css, 'color-accent-btn-text') ?? 'white';
  const schrift = alsHex(schriftRoh);
  if (!schrift) {
    return {
      status: 'nicht-rechenbar',
      grund: `--color-accent-btn-text ist "${schriftRoh}" — kein rechenbarer Hexwert`,
      issues: [],
    };
  }
  const r = kontrast(schrift, akzent);
  if (r >= schwelle) return { status: 'ok', grund: null, issues: [] };
  const woher = leseToken(css, 'color-accent-btn-text')
    ? `--color-accent-btn-text (${schrift})`
    : `der Fallback weiss (--color-accent-btn-text ist nicht gesetzt)`;
  return {
    status: 'befund',
    grund: null,
    issues: [
    {
      type: 'accent_button_contrast',
      ratio: Math.round(r * 100) / 100,
      detail:
        `Schrift auf .btn-accent erreicht nur ${(Math.round(r * 100) / 100).toFixed(2)}:1 ` +
        `(noetig ${schwelle}:1) — ${woher} auf --color-accent (${akzent}). ` +
        'Die Markenfarbe muss dafuer nicht weichen: setze --color-accent-btn-text auf einen ' +
        'Ton, der auf ihr besteht (haeufig #000000 oder ein sehr dunkles Blau).',
    },
    ],
  };
}
