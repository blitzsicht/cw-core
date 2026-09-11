// @ts-check
/**
 * Layout-Befunde, gemessen im gerenderten Browser — die Messlogik zu layout-audit.spec.ts.
 *
 * ANLASS (11.09.2026, customer-haarwerk-neutraubling). Zwei weiße Ränder, beide vom
 * Operator per Screenshot gefunden, keiner von einem Guard:
 *
 *   1. Hero-Bild endet rechts vor dem Seitenrand. `.hero-img-wrap` hatte
 *      `aspect-ratio: 21/9` + `max-height: 32rem` und keine Breite. Schlägt die Höhe
 *      am Deckel an, rechnet der Browser die Breite über das Seitenverhältnis zurück
 *      (712 px × 21/9 = 1661 px bei 1994 px Fenster). Ab rund 1195 px Viewport sichtbar.
 *   2. Kachel mit ungefärbtem Streifen unten. Das Grid zieht zwei Kacheln auf gleiche
 *      Höhe; die Farbe saß nur auf dem Textblock, nicht auf der Kachel.
 *
 * Beide Fehler überstehen jeden bisherigen Check: kein horizontaler Überstand, kein Bild
 * breiter als der Viewport, kein a11y-Verstoß. Sie sind nur zu SEHEN — deshalb wird hier
 * gemessen, was man sieht: bemalte Flächen und das, was daneben übrig bleibt.
 *
 * Die Funktion `layoutBefunde` läuft per `page.evaluate` im Browser und darf deshalb
 * nichts von außen referenzieren.
 */

/**
 * Messung im Browser. Liefert { luecken, kartenreste } — je ein Eintrag pro Befund.
 * @returns {{ luecken: Array<Record<string, unknown>>, kartenreste: Array<Record<string, unknown>> }}
 */
export function layoutBefunde() {
  const vw = document.documentElement.clientWidth;
  const MEDIEN = new Set(['IMG', 'PICTURE', 'VIDEO', 'CANVAS', 'IFRAME', 'svg', 'SVG']);

  /** @param {Element} el */
  const name = (el) => {
    const klassen = [...el.classList].filter((c) => !c.startsWith('astro-')).slice(0, 3);
    return el.tagName.toLowerCase() + (el.id ? `#${el.id}` : '') + (klassen.length ? `.${klassen.join('.')}` : '');
  };
  /** @param {Element} el */
  const sichtbar = (el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0;
  };
  /** Trägt das Element selbst Farbe oder Bild? @param {Element} el */
  const bemalt = (el) => {
    if (MEDIEN.has(el.tagName)) return true;
    const cs = getComputedStyle(el);
    const bg = cs.backgroundColor;
    if (bg && bg !== 'transparent' && !/rgba\([^)]*,\s*0\)$/.test(bg)) return true;
    return !!cs.backgroundImage && cs.backgroundImage !== 'none';
  };

  /** Steht zwischen y1 und y2 (Viewport-Koordinaten) Text oder ein Medium in `wurzel`? */
  const inhaltIn = (/** @type {Element} */ wurzel, /** @type {number} */ y1, /** @type {number} */ y2) => {
    if (y2 - y1 <= 4) return false;
    const trifft = (/** @type {DOMRect} */ r) => r.width > 0 && r.height > 0 && r.bottom > y1 + 2 && r.top < y2 - 2;
    const lauf = document.createTreeWalker(wurzel, NodeFilter.SHOW_TEXT);
    for (let n = lauf.nextNode(); n; n = lauf.nextNode()) {
      if (!n.textContent || !n.textContent.trim()) continue;
      const bereich = document.createRange();
      bereich.selectNodeContents(n);
      for (const r of bereich.getClientRects()) if (trifft(r)) return true;
    }
    for (const m of wurzel.querySelectorAll('img, picture, video, svg, canvas, iframe, input, textarea, select, button')) {
      if (trifft(m.getBoundingClientRect())) return true;
    }
    return false;
  };

  /**
   * Sichtbarer waagerechter Ausschnitt: die Box, beschnitten von jedem Vorfahren mit
   * `overflow-x` ≠ `visible`. Eine breite Tabelle in einem Scroll-Wrapper reicht
   * rechnerisch über den Seitenrand hinaus, zu sehen ist sie nur bis zur Kante des
   * Wrappers. Ohne den Beschnitt galt sie als „rechts bündig, links 24 px Lücke" —
   * Fehlalarm auf blitzsicht.com /website-handwerker/ und /jimdo-vs-wix/ bei 390 px
   * (blitzsicht-ops#798, 11.09.2026).
   * @param {Element} el @param {DOMRect} r
   */
  const sichtbarWaagerecht = (el, r) => {
    let links = r.left;
    let rechts = r.right;
    for (let a = el.parentElement; a && a !== document.documentElement; a = a.parentElement) {
      if (getComputedStyle(a).overflowX === 'visible') continue;
      const c = a.getBoundingClientRect();
      links = Math.max(links, c.left);
      rechts = Math.min(rechts, c.right);
    }
    return { left: links, right: rechts, width: Math.max(0, rechts - links) };
  };

  // ── 1. Einseitige Lücke neben einem Vollbreiten-Element ────────────────────────
  // Ein bemaltes Element, das links (oder rechts) bündig mit einer vollbreiten
  // Sektion abschließt, auf der anderen Seite aber > 8 px früher endet — und in
  // dieser Lücke steht NICHTS (der Treffer an dieser Stelle ist die Sektion selbst
  // oder ein Vorfahr). Zentrierte Container haben symmetrische Ränder und fallen
  // nicht darunter; Split-Layouts haben in der Lücke ihren Text und fallen auch nicht.
  // Gemessen wird der SICHTBARE Ausschnitt (sichtbarWaagerecht), nicht die Box: was ein
  // Scroll-Container abschneidet, ist für den Besucher kein Rand.
  const luecken = [];
  const gesehen = new Set();
  for (const el of document.querySelectorAll('body *')) {
    if (el.tagName === 'SOURCE' || !bemalt(el) || !sichtbar(el)) continue;
    let r = el.getBoundingClientRect();
    if (r.width < vw * 0.5 || r.height < 40) continue;
    let sektion = el.parentElement;
    while (sektion && sektion !== document.body && sektion.getBoundingClientRect().width < vw - 2) sektion = sektion.parentElement;
    if (!sektion || sektion === document.body || sektion === document.documentElement) continue;
    el.scrollIntoView({ block: 'center', inline: 'nearest' });
    r = el.getBoundingClientRect();
    const v = sichtbarWaagerecht(el, r);
    const s = sektion.getBoundingClientRect();
    const links = v.left - s.left;
    const rechts = s.right - v.right;
    const buendig = Math.min(links, rechts) <= 1;
    const luecke = Math.max(links, rechts);
    if (!buendig || luecke <= 8) continue;
    const x = rechts > links ? v.right + rechts / 2 : v.left - links / 2;
    const y = Math.min(Math.max(r.top + r.height / 2, 1), window.innerHeight - 2);
    const treffer = document.elementFromPoint(x, y);
    if (!treffer || !(treffer === sektion || treffer.contains(sektion))) continue;
    const schluessel = `${name(el)}|${name(sektion)}`;
    if (gesehen.has(schluessel)) continue;
    gesehen.add(schluessel);
    luecken.push({
      element: name(el),
      sektion: name(sektion),
      seite: rechts > links ? 'rechts' : 'links',
      px: Math.round(luecke),
      elementBreite: Math.round(v.width),
      sektionBreite: Math.round(s.width),
    });
  }

  // ── 2. Ungefärbter Rest in einer Karte ─────────────────────────────────────────
  // Grid-/Flex-Kind mit Kartenoptik (Schatten, sichtbarer Rahmen oder Radius) und
  // transparentem Hintergrund, das zu mindestens 60 % von bemalten Kindern gefüllt
  // ist, bei dem aber oben oder unten > 4 px ohne Farbe übrig bleiben. Typische
  // Ursache: Das Grid dehnt die Karte auf die Höhe der Nachbarin, die Farbe sitzt nur
  // auf einem inneren Block. Die 60-%-Schwelle lässt bewusst durchsichtige Karten mit
  // Bild oben und Text darunter in Ruhe — dort ist die Fläche absichtlich ungefärbt.
  const kartenreste = [];
  for (const karte of document.querySelectorAll('body *')) {
    const eltern = karte.parentElement;
    if (!eltern || !sichtbar(karte) || bemalt(karte)) continue;
    const ed = getComputedStyle(eltern).display;
    if (!/grid|flex/.test(ed)) continue;
    const cs = getComputedStyle(karte);
    const rahmen = ['Top', 'Right', 'Bottom', 'Left'].some(
      (s) => parseFloat(cs[`border${s}Width`]) > 0 && !/rgba\([^)]*,\s*0\)$|transparent/.test(cs[`border${s}Color`]),
    );
    const kartenoptik = cs.boxShadow !== 'none' || rahmen || parseFloat(cs.borderTopLeftRadius) > 0;
    if (!kartenoptik) continue;
    const k = karte.getBoundingClientRect();
    if (k.height < 80 || k.width < 80) continue;
    let oben = Infinity;
    let unten = -Infinity;
    let flaeche = 0;
    for (const kind of karte.querySelectorAll('*')) {
      if (!bemalt(kind) || !sichtbar(kind)) continue;
      const r = kind.getBoundingClientRect();
      if (r.width < k.width * 0.9) continue; // nur Flächen, die die Karte in der Breite füllen
      oben = Math.min(oben, r.top);
      unten = Math.max(unten, r.bottom);
      flaeche += r.height;
    }
    if (unten === -Infinity) continue;
    const abdeckung = (unten - oben) / k.height;
    // Ein Rest zählt nur, wenn er LEER ist: Steht dort Text oder ein Medium, ist die
    // ungefärbte Fläche gestaltet (Blog-Karte mit Titel unter dem Bild, Überschrift über
    // einem Formular). Nachgeschärft nach der Flotten-Stichprobe vom 11.09.2026: ohne
    // diese Bedingung meldete die Regel blitzsicht.com/blog (7×) und
    // steller-sanierungen.com/kontakt (3×) — beide Fehlalarme, beide mit Text im Streifen.
    const restUnten = inhaltIn(karte, unten, k.bottom) ? 0 : k.bottom - unten;
    const restOben = inhaltIn(karte, k.top, oben) ? 0 : oben - k.top;
    if (abdeckung < 0.6 || Math.max(restUnten, restOben) <= 4) continue;
    kartenreste.push({
      karte: name(karte),
      raster: name(eltern),
      restUnten: Math.round(restUnten),
      restOben: Math.round(restOben),
      kartenHoehe: Math.round(k.height),
    });
  }

  return { luecken, kartenreste };
}

/**
 * Seite in den Zustand bringen, den ein Besucher sieht: Einblendungen im Endzustand,
 * Schriften und Bilder geladen. Gleiche Begründung wie in mobile-audit.spec.ts
 * (Rennen zwischen IntersectionObserver und Messung, belegt an customer-gympanzen).
 * @param {import('@playwright/test').Page} page
 */
export async function bereiteVor(page) {
  await page.addStyleTag({
    content: `
      *, *::before, *::after { animation-duration: 0s !important; transition-duration: 0s !important; }
      [data-reveal] { opacity: 1 !important; transform: none !important; }
    `,
  });
  await page.waitForLoadState('load');
  await page.evaluate(() => document.fonts.ready);
}

/**
 * Mini-Seite mit beiden Fehlerformen — Positivkontrolle: die Prüfung MUSS hier anschlagen,
 * und zwar in JEDEM Projekt (390, 768, 1440 px). Deshalb feste Anteile statt der
 * aspect-ratio/max-height-Mechanik aus dem Anlass: die bricht erst ab einer bestimmten
 * Breite und wäre auf 390 px unauffällig — eine Kontrolle, die dort grün bliebe, bewiese
 * dort nichts.
 *
 * Dazu eine breite Tabelle im Scroll-Wrapper (Muster blitzsicht `.vergleich-wrapper`,
 * blitzsicht-ops#798). Sie ist KEIN Fehler und steht deshalb auch in HEIL: meldet die
 * Prüfung dort eine Lücke, misst sie die Box statt des sichtbaren Ausschnitts. 180 % der
 * Wrapper-Breite, damit das Muster in allen drei Projekten auftritt.
 */
export const KAPUTT = `<!doctype html><html><head><style>
  body { margin: 0; font-family: sans-serif; }
  .hero-wrap { width: 70%; height: 180px; background: #333; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; padding: 16px; }
  .karte { border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,.2); overflow: hidden; display: block; }
  .bild { height: 160px; background: #888; }
  .body { background: #222; color: #fff; padding: 12px; }
  .body h2 { margin: 0; font-size: 16px; line-height: 20px; }
  .body p { margin: 8px 0 0; font-size: 14px; line-height: 20px; }
  .tabellen { background: #f8f9fc; }
  .tabellen .container { padding: 24px; }
  .scroll { overflow-x: auto; }
  .vergleich { width: 180%; background: #fff; border-collapse: collapse; }
  .vergleich td { padding: 16px; font-size: 14px; line-height: 20px; }
</style></head><body>
  <section><div class="hero-wrap"></div></section>
  <section class="grid">
    <a class="karte"><div class="bild"></div><div class="body"><h2>Kurz</h2></div></a>
    <a class="karte"><div class="bild"></div><div class="body"><h2>Lang</h2><p>eins</p><p>zwei</p></div></a>
  </section>
  <section class="tabellen"><div class="container"><div class="scroll"><table class="vergleich">
    <tr><td>Kriterium</td><td>Eins</td><td>Zwei</td><td>Drei</td></tr>
    <tr><td>Ladezeit</td><td>1 s</td><td>3 s</td><td>5 s</td></tr>
  </table></div></div></section>
</body></html>`;

/** Dieselbe Seite repariert — Gegenprobe: hier darf die Prüfung NICHT anschlagen. */
export const HEIL = KAPUTT
  .replace('.hero-wrap { width: 70%;', '.hero-wrap { width: 100%;')
  .replace('overflow: hidden; display: block; }', 'overflow: hidden; display: flex; flex-direction: column; background: #222; }');
