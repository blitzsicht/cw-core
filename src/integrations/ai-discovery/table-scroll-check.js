// @ts-check
/**
 * @cw/core/integrations/ai-discovery/table-scroll-check
 *
 * Build-time-Guard: Liefert eine Seite eine Tabelle aus, ohne dass im
 * ausgelieferten CSS eine Regel steht, die Tabellen schmalen Viewports
 * gewachsen macht?
 *
 * ANLASS (27.08.2026): Sieben Seiten auf blitzsicht.com sprengten bei 360 px
 * die Seitenbreite, in jedem Fall wegen einer <table> ohne Scroll-Möglichkeit.
 * blitzsicht setzt zugleich `html,body{overflow-x:hidden}` — die Spalten waren
 * also nicht wegschiebbar, sondern schlicht ABGESCHNITTEN und unerreichbar.
 * Gefunden hat es niemand monatelang; der Mobil-Guard in cw-visual-tests sah
 * damals nur 7 von 46 Seiten.
 *
 * WAS DIESER GUARD BEWEIST — UND WAS NICHT.
 * Er prüft am ausgelieferten HTML, ob der Schutz überhaupt MITGELIEFERT wird.
 * Ob eine konkrete Tabelle im Browser tatsächlich passt, kann er nicht wissen —
 * dafür braucht es Layout, und das misst `mobile-audit.spec.ts` in
 * cw-visual-tests. Der Guard hier schließt die Lücke davor: einen Kunden, der
 * `tokens-base.css` gar nicht einbindet oder die Regel überschrieben hat,
 * bemerkt sonst niemand, bis eine Kundin die abgeschnittene Spalte meldet.
 *
 * Reines JS (+ .d.ts) wie csp-check.js und cache-header-check.js, damit
 * CLI-Scripts es aus node_modules laden können.
 *
 * @typedef {'table_without_scroll_rule'} TableIssueType
 * @typedef {{ page: string, type: TableIssueType, detail: string }} TableIssue
 */

/**
 * Tabellen, die im Dokument echten Inhalt tragen. `role="presentation"` zählt
 * nicht: das sind Layout-Tabellen (Mail-Templates), die niemals zum
 * Scroll-Container werden dürfen.
 * @param {string} html
 * @returns {number}
 */
export function zaehleInhaltsTabellen(html) {
  let n = 0;
  for (const m of html.matchAll(/<table\b([^>]*)>/gi)) {
    if (/\brole\s*=\s*["']?presentation\b/i.test(m[1])) continue;
    n++;
  }
  return n;
}

/**
 * Trägt das ausgelieferte CSS der Seite eine Regel, die Tabellen auf schmalen
 * Viewports handhabbar macht?
 *
 * Erkannt werden zwei Formen, beide gegen den MINIFIZIERTEN Build geprüft
 * (Astro inlined das CSS mit `inlineStylesheets: 'always'`):
 *   1. die flottenweite Regel aus tokens-base.css —
 *      `:where(table:not([role=presentation])){…overflow-x:auto…}`
 *   2. die Utility `.tabelle-scroll{…overflow-x:auto…}` für Wrapper, die eine
 *      Tabelle selbst einfassen.
 * Eine kundeneigene Lösung mit anderem Namen erkennt er nicht — dann meldet er
 * lieber einmal zu viel als still nichts.
 * @param {string} html
 * @returns {boolean}
 */
export function hatTabellenSchutz(html) {
  const globaleRegel = /table:not\(\[role=["']?presentation["']?\]\)\)?[^{}]*\{[^{}]*overflow-x:\s*auto/i;
  const utility = /\.tabelle-scroll\s*\{[^{}]*overflow-x:\s*auto/i;
  return globaleRegel.test(html) || utility.test(html);
}

/**
 * @param {{ page: string, html: string }[]} seiten
 * @returns {TableIssue[]}
 */
export function checkTableScroll(seiten) {
  /** @type {TableIssue[]} */
  const issues = [];
  for (const { page, html } of seiten) {
    const tabellen = zaehleInhaltsTabellen(html);
    if (tabellen === 0) continue;
    if (hatTabellenSchutz(html)) continue;
    issues.push({
      page,
      type: 'table_without_scroll_rule',
      detail:
        `${tabellen} Tabelle(n), aber keine Scroll-Regel im ausgelieferten CSS. ` +
        'Fehlt „@cw/core/styles/tokens-base.css" im Kunden-CSS, oder wurde die Regel überschrieben?',
    });
  }
  return issues;
}
