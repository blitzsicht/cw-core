// @ts-check
/**
 * @cw/core/integrations/ai-discovery/table-focusable
 *
 * Build-time-Transform: gibt jeder Inhaltstabelle `tabindex="0"`.
 *
 * WARUM DAS NÖTIG IST. Seit v0.133.0 macht `tokens-base.css` Tabellen zu ihrem
 * eigenen Scroll-Container — sonst schneiden sie auf dem Handy ihre rechten
 * Spalten ab. Ein scrollbarer Bereich ohne Tastaturzugang ist aber selbst ein
 * WCAG-Verstoß: axe meldet ihn als `scrollable-region-focusable`. Der Fix allein
 * hätte den Mobil-Bug also gegen eine Barriere getauscht.
 *
 * Gemessen an sieben Seiten von blitzsicht.com bei 390 px:
 *   vorher                         2× scrollable-region-focusable
 *   nur die CSS-Regel             13×
 *   CSS-Regel + dieses tabindex    0×
 * Also besser als der Ausgangszustand, nicht nur besser als der Zwischenstand.
 *
 * WARUM ATTRIBUT UND KEIN WRAPPER. Ein `<div>` um die Tabelle würde die
 * Baumstruktur ändern und jeden Kundenselektor der Form `.legal-content > table`
 * still brechen. Ein Attribut am vorhandenen Tag ändert nichts an der Struktur.
 * `role` bleibt unangetastet: eine Tabelle muss eine Tabelle bleiben, sonst
 * verlieren Screenreader Zeilen- und Spaltenbezüge.
 *
 * @typedef {{ html: string, ergaenzt: number }} FocusableErgebnis
 */

/** Wrapper, die den Scroll (und den Tastaturfokus) schon selbst tragen. */
const WRAPPER_MIT_FOKUS = ['tabelle-scroll', 'vergleich-wrapper', 'rt-wrap'];

/**
 * Sitzt die Tabelle direkt in einem Wrapper, der den Fokus schon hat? Dann
 * bekäme sie sonst einen zweiten, überflüssigen Tab-Halt.
 * @param {string} davor Text unmittelbar vor dem `<table`-Tag
 * @returns {boolean}
 */
function inFokusWrapper(davor) {
  const letzterTag = davor.trimEnd().match(/<([a-z]+)\b([^>]*)>$/i);
  if (!letzterTag) return false;
  const attrs = letzterTag[2];
  return WRAPPER_MIT_FOKUS.some((k) => new RegExp(`class\\s*=\\s*["'][^"']*\\b${k}\\b`, 'i').test(attrs));
}

/**
 * Bereiche, deren Inhalt kein Markup ist — dort darf nichts ersetzt werden.
 * JSON-LD in einem <script> kann die Zeichenfolge "<table" als Text enthalten.
 * @param {string} html
 * @returns {{ start: number, ende: number }[]}
 */
function textBereiche(html) {
  const bereiche = [];
  for (const m of html.matchAll(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi)) {
    bereiche.push({ start: m.index ?? 0, ende: (m.index ?? 0) + m[0].length });
  }
  return bereiche;
}

/**
 * Ein `.tabelle-scroll`-Wrapper OHNE `tabindex` ist genau der Fehler, den diese
 * Datei sonst verhindert — nur eine Ebene höher. Gemessen im CI am 27.08.2026:
 * `.tdddg-table-wrap`, `.preistabelle-wrapper` und `.upgrade-comparison-wrap`
 * scrollten, hatten die Klasse, aber keinen Fokus; axe meldete alle drei. Die
 * Tabelle darin bleibt bewusst `display: table` und ist selbst nicht scrollbar —
 * ihr `tabindex` würde also nichts nützen. Der Fokus gehört an den Wrapper.
 * @param {string} html
 * @returns {{ html: string, ergaenzt: number }}
 */
export function ergaenzeWrapperTabindex(html) {
  const gesperrt = textBereiche(html);
  let ergaenzt = 0;
  let out = '';
  let zuletzt = 0;
  for (const m of html.matchAll(/<([a-z]+)\b([^>]*\bclass\s*=\s*["'][^"']*\btabelle-scroll\b[^"']*["'][^>]*)>/gi)) {
    const start = m.index ?? 0;
    if (gesperrt.some((b) => start >= b.start && start < b.ende)) continue;
    if (/\btabindex\s*=/i.test(m[2])) continue;
    out += html.slice(zuletzt, start) + `<${m[1]} tabindex="0"${m[2]}>`;
    zuletzt = start + m[0].length;
    ergaenzt++;
  }
  out += html.slice(zuletzt);
  return { html: out, ergaenzt };
}

/**
 * @param {string} html
 * @returns {FocusableErgebnis}
 */
export function ergaenzeTabellenTabindex(html) {
  const gesperrt = textBereiche(html);
  let ergaenzt = 0;
  let out = '';
  let zuletzt = 0;
  for (const m of html.matchAll(/<table\b([^>]*)>/gi)) {
    const start = m.index ?? 0;
    if (gesperrt.some((b) => start >= b.start && start < b.ende)) continue;
    const attrs = m[1];
    if (/\brole\s*=\s*["']?presentation\b/i.test(attrs)) continue;
    if (/\btabindex\s*=/i.test(attrs)) continue;
    if (inFokusWrapper(html.slice(Math.max(0, start - 400), start))) continue;
    out += html.slice(zuletzt, start) + `<table tabindex="0"${attrs}>`;
    zuletzt = start + m[0].length;
    ergaenzt++;
  }
  out += html.slice(zuletzt);
  return { html: out, ergaenzt };
}
