// @ts-check
/**
 * Formularkontrast, gemessen im gerenderten Browser — die Messlogik zum Abschnitt
 * „Formularkontrast“ in a11y-audit.spec.ts.
 *
 * ANLASS (05.11.2026, customer-blitzsicht `/website-audit`, blitzsicht-ops#1055 A2). Der Operator
 * fand das Lead-Formular im Hero mit weißem Eingabetext auf weißem Feld. Ursache: der Hero setzt
 * `color: white`, Tailwinds Preflight setzt `input { color: inherit }` und
 * `::placeholder { color: color-mix(in oklab, currentcolor 50%, transparent) }`; das Feld selbst
 * hatte `background: #fff`, aber keine eigene `color`. Gemessen am Baseline-Build 2ff4980:
 * 1,00:1 auf Text und Placeholder beider Felder.
 *
 * Kein bisheriger Guard sieht das: axe prüft `color-contrast` an Text, den es sieht — ein leeres
 * Feld hat keinen Textknoten, und den Placeholder (Pseudo-Element) hat axe nicht im Baum
 * (Memory `axe-prueft-pseudoelemente-nicht`). Deshalb wird hier gemessen, was ein Besucher beim
 * Tippen sieht: die `color` des Felds und die Farbe seines `::placeholder`, jeweils gegen den
 * effektiven Hintergrund (Elternkette bis zur ersten nicht-transparenten Fläche).
 *
 * `formularKontrastBefunde` läuft per `page.evaluate` im Browser und darf deshalb nichts von
 * außen referenzieren; die reinen Rechenfunktionen darunter sind absichtlich ein zweites Mal
 * außerhalb exportiert, damit der Test die Browser-Messung gegen eine unabhängige Rechnung hält.
 */

/**
 * @typedef {{ r: number, g: number, b: number, a: number }} Farbe
 * @typedef {{
 *   feld: string,
 *   text: string, textKontrast: number,
 *   placeholder: string | null, placeholderKontrast: number | null,
 *   hintergrund: string,
 * }} FormularBefund
 */

/** Relative Leuchtdichte nach WCAG 2.x (sRGB 0–255). @param {Farbe} c */
export function leuchtdichte(c) {
  const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
}

/** Kontrastverhältnis zweier opaker Farben, 1–21. @param {Farbe} a @param {Farbe} b */
export function kontrastVerhaeltnis(a, b) {
  const [hell, dunkel] = [leuchtdichte(a), leuchtdichte(b)].sort((x, y) => y - x);
  return (hell + 0.05) / (dunkel + 0.05);
}

/** Halbtransparente Vordergrundfarbe auf den Hintergrund legen. @param {Farbe} fg @param {Farbe} bg */
export function ueberblenden(fg, bg) {
  if (fg.a >= 1) return { ...fg, a: 1 };
  const m = (x, y) => Math.round(x * fg.a + y * (1 - fg.a));
  return { r: m(fg.r, bg.r), g: m(fg.g, bg.g), b: m(fg.b, bg.b), a: 1 };
}

/**
 * Befunde unter der Schwelle (WCAG AA für normalen Text: 4,5:1). Placeholder zählt mit — er ist
 * der einzige Text, den ein leeres Feld zeigt.
 * @param {FormularBefund[]} befunde @param {number} [schwelle]
 */
export function unterSchwelle(befunde, schwelle = 4.5) {
  return befunde.filter((b) => b.textKontrast < schwelle
    || (b.placeholderKontrast !== null && b.placeholderKontrast < schwelle));
}

/**
 * Läuft IM BROWSER (`page.evaluate(formularKontrastBefunde)`). Keine Referenzen nach außen.
 * Misst jedes sichtbare Eingabefeld (input ohne Schalter-/Knopf-Typen, textarea, select).
 * @returns {FormularBefund[]}
 */
export function formularKontrastBefunde() {
  // Canvas normalisiert jeden CSS-Farbstring nach sRGB 8 Bit + Alpha — auch `oklab(…)`, das
  // Chromium für color-mix-Placeholder liefert und das kein rgb-Parser versteht.
  const cv = document.createElement('canvas'); cv.width = cv.height = 1;
  const cx = /** @type {CanvasRenderingContext2D} */ (cv.getContext('2d', { willReadFrequently: true }));
  /** @param {string | null} s @returns {{r:number,g:number,b:number,a:number} | null} */
  const farbe = (s) => {
    if (!s) return null;
    cx.clearRect(0, 0, 1, 1); cx.fillStyle = s; cx.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = cx.getImageData(0, 0, 1, 1).data;
    return { r, g, b, a: a / 255 };
  };
  const leucht = (c) => {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  };
  const verhaeltnis = (a, b) => {
    const [h, d] = [leucht(a), leucht(b)].sort((x, y) => y - x);
    return (h + 0.05) / (d + 0.05);
  };
  const blend = (fg, bg) => {
    if (fg.a >= 1) return fg;
    const m = (x, y) => Math.round(x * fg.a + y * (1 - fg.a));
    return { r: m(fg.r, bg.r), g: m(fg.g, bg.g), b: m(fg.b, bg.b), a: 1 };
  };
  /** Effektiver Hintergrund: Elternkette bis zur ersten Fläche mit Alpha > 0, sonst Weiß. */
  const hintergrund = (el) => {
    let e = el; let acc = null;
    while (e) {
      const c = farbe(getComputedStyle(e).backgroundColor);
      if (c && c.a > 0) {
        if (c.a >= 1) return acc ? blend(acc, c) : c;
        acc = acc ? blend(acc, c) : c;
      }
      e = e.parentElement;
    }
    const weiss = { r: 255, g: 255, b: 255, a: 1 };
    return acc ? blend(acc, weiss) : weiss;
  };
  const SELEKTOR = 'input:not([type=hidden]):not([type=submit]):not([type=button]):not([type=reset])'
    + ':not([type=checkbox]):not([type=radio]):not([type=image]):not([type=file])'
    + ':not([type=range]):not([type=color]), textarea, select';
  const out = [];
  let i = 0;
  for (const el of document.querySelectorAll(SELEKTOR)) {
    i += 1;
    if (el.getClientRects().length === 0) continue; // display:none — sieht niemand
    const bg = hintergrund(el);
    const cs = getComputedStyle(el);
    const fg = farbe(cs.color);
    const phRoh = el.tagName === 'SELECT' ? null : getComputedStyle(el, '::placeholder').color;
    const hatPlaceholder = el.tagName !== 'SELECT' && !!el.getAttribute('placeholder');
    const ph = hatPlaceholder ? farbe(phRoh) : null;
    const name = el.id ? `#${el.id}` : el.getAttribute('name') ? `[name=${el.getAttribute('name')}]` : `${el.tagName.toLowerCase()}:nth(${i})`;
    out.push({
      feld: name,
      text: cs.color,
      textKontrast: fg ? Math.round(verhaeltnis(blend(fg, bg), bg) * 100) / 100 : 0,
      placeholder: hatPlaceholder ? phRoh : null,
      placeholderKontrast: ph ? Math.round(verhaeltnis(blend(ph, bg), bg) * 100) / 100 : null,
      hintergrund: `rgb(${bg.r}, ${bg.g}, ${bg.b})`,
    });
  }
  return out;
}

/** Fixture: der echte Fehlerfall — Hero mit color:white, Feld mit background:#fff ohne eigene color. */
export const WEISS_AUF_WEISS = `<!doctype html><html><head><style>
  input, textarea, select { color: inherit; font: inherit; }
  input::placeholder, textarea::placeholder { color: color-mix(in oklab, currentcolor 50%, transparent); }
  .hero { background: #1D1E3B; color: white; padding: 2rem; }
  .box { background: #F8F9FC; padding: 1rem; }
  .box input { background: #fff; border: 1px solid #d1d5db; }
</style></head><body>
  <section class="hero"><div class="box">
    <label for="url">Website</label>
    <input id="url" type="text" placeholder="ihre-website.de">
    <label for="mail">E-Mail</label>
    <input id="mail" type="email" placeholder="name@firma.de">
    <input type="hidden" name="h" value="1">
    <input type="submit" value="Los">
  </div></section>
</body></html>`;

/** Fixture: dieselbe Seite mit dem Fix — eigene color auf Box und Feld, Placeholder opak. */
export const LESBAR = WEISS_AUF_WEISS.replace(
  '.box input { background: #fff; border: 1px solid #d1d5db; }',
  '.box { color: #1D1E3B; } .box input { background: #fff; border: 1px solid #d1d5db; color: #1D1E3B; }'
  + ' .box input::placeholder { color: #4B5563; opacity: 1; }',
);
