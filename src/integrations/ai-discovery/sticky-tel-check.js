// @ts-check
/**
 * @cw/core/integrations/ai-discovery/sticky-tel-check
 *
 * Sticky-Anruf-Guard: Hat eine Site eine Telefonnummer, muss auf dem Handy ein fixiertes
 * Element sie anbieten — StickyMobileCTA mit `href="tel:…"`, FloatingCallButton,
 * StickyContact oder ein sticky Header mit `tel:`-Link. Soft-Warn, einmal pro Site.
 *
 * ANLASS (Lead-Rakete-Audit 26.09.2026): Bei lokalen Handwerks- und Dienstleistungsseiten
 * kommt der größte Teil des Traffics vom Handy, und der schnellste Weg zum Auftrag ist der
 * Anruf. Befunde:
 *   - gottl-richter-gomeier, schiller-gartenbau: StickyMobileCTA zeigt auf /kontakt,
 *   - baeckereizink: kein Sticky, `tel:` nur in Filialkarten und Footer,
 *   - allstargirls: StickyContact mit hideOnMobile — auf dem Handy ausgeblendet.
 *
 * REGEL
 *   1. Die Site „hat eine Nummer“, wenn irgendeine relevante Seite einen `tel:`-Link trägt.
 *      Nicht relevant: Impressum, Datenschutz, AGB, Widerruf, Danke, 404 — dort steht die
 *      Nummer als Pflichtangabe, nicht als Einladung zum Anruf.
 *   2. Maßgeblich ist die Startseite (`index.html` im Wurzelverzeichnis), sofern sie selbst
 *      eine Nummer trägt. Trägt sie keine (gowohnen: Nummer nur im Exposé) oder fehlt sie,
 *      genügt eine Seite mit Nummer, die sie fixiert anbietet.
 *   3. Ein `tel:`-Link zählt als fixiert, wenn er selbst oder ein Vorfahr fixiert ist und
 *      keiner auf dem Handy ausgeblendet ist.
 *        fixiert     = Inline-Style `position: fixed|sticky`, bekannte Klasse
 *                      (sticky-mobile-cta, floating-call, sticky-contact) oder eine
 *                      `<style>`-Regel mit `position: fixed|sticky`, die auf dem Handy gilt.
 *        ausgeblendet = `<style>`-Regel mit `display: none`, die auf dem Handy gilt
 *                      (so blendet StickyContact `hideOnMobile` aus).
 *      „Gilt auf dem Handy“: Regel außerhalb jedes @media oder in einem @media ohne
 *      `min-width`/`print`/`hover:hover`/`pointer:fine`.
 *
 * GRENZEN — bewusst einfach, soft-warn:
 *   - CSS-Selektoren: gewertet wird nur das letzte Glied (`.a .b{…}` → `.b`), und nur
 *     Tag, Klassen und ID darin. Pseudo-Klassen (`:hover`, `:focus`) und Pseudo-Elemente
 *     verwerfen die Regel; Astros `[data-astro-cid-…]` und `:where(.astro-…)` werden
 *     ignoriert. Kontextregeln wie `.menu-open .nav{position:fixed}` zählen dadurch
 *     fälschlich als fixiert — der Guard meldet dann eher zu wenig als zu viel.
 *   - Externe Stylesheets (`<link rel="stylesheet">`) liest er nicht. cw-core-Sites inlinen
 *     ihr CSS (`inlineStylesheets: 'always'`), andere fallen über die bekannten Klassen.
 *   - Ein `tel:`-Link im zugeklappten Mobilmenü eines sticky Headers zählt als erfüllt,
 *     solange das Menü nicht per `display:none`-Regel versteckt ist.
 *   - Per JavaScript nachgeladene oder erst nach Scrollen fixierte Elemente sieht er nicht.
 *
 * @typedef {'no_sticky_tel'} StickyTelIssueType
 * @typedef {{ type: StickyTelIssueType, details: string }} StickyTelIssue
 */

export const STICKY_TEL_MELDUNG =
  'Keine fixierte Anruf-Möglichkeit auf Mobilgeräten (StickyMobileCTA href=tel:… oder FloatingCallButton)';

/** Klassen der cw-core-Komponenten, die immer fixiert sind. */
const FIXIERTE_KLASSEN = new Set(['sticky-mobile-cta', 'floating-call', 'sticky-contact']);

/** Seiten mit Pflicht-Nummer statt Anruf-Einladung. Pfad relativ zu dist/. */
const IGNORIERT_RE =
  /^(?:.*\/)?(?:impressum|datenschutz(?:erklaerung)?|privacy|agb|widerruf(?:sbelehrung)?|danke|thank-?you|404|500)(?:\/index)?\.html$/i;

const VOID = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr',
]);

/** @param {string} pfad */
const istIgnoriert = (pfad) => IGNORIERT_RE.test(pfad.replace(/\\/g, '/').replace(/^\//, ''));
/** @param {string} pfad */
const istStartseite = (pfad) => /^\/?index\.html$/i.test(pfad.replace(/\\/g, '/'));

/** @param {string} html */
export function hatTelLink(html) {
  return /<a\b[^>]*\bhref\s*=\s*["']?\s*tel:/i.test(ohneSkripte(html));
}

/**
 * script/template/noscript/Kommentare entfernen; `<style>` bleibt (wird separat gelesen).
 * @param {string} html
 */
function ohneSkripte(html) {
  return html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|template|noscript)\b[\s\S]*?<\/\1\s*>/gi, '');
}

/**
 * Gilt ein @media-Kopf auf einem Handy-Viewport? Konservativ: alles mit min-width,
 * print oder Desktop-Zeigergeräten gilt als „nein“.
 * @param {string} kopf
 */
function mediaGiltMobil(kopf) {
  return !/min-width|print|hover\s*:\s*hover|pointer\s*:\s*fine/i.test(kopf);
}

/**
 * Regeln aus CSS-Text, mit Flag, ob sie auf dem Handy gelten. Winziger Block-Parser:
 * reicht für minifiziertes Astro-CSS und handgeschriebene Regeln.
 * @param {string} css
 * @returns {{ selektoren: string, deklarationen: string, mobil: boolean }[]}
 */
function cssRegeln(css) {
  /** @type {{ selektoren: string, deklarationen: string, mobil: boolean }[]} */
  const out = [];
  const text = css.replace(/\/\*[\s\S]*?\*\//g, '');
  /** @type {{ kopf: string, mobil: boolean }[]} */
  const stapel = [];
  let puffer = '';
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '{') {
      const kopf = puffer.trim();
      puffer = '';
      const elternMobil = stapel.length === 0 || stapel[stapel.length - 1].mobil;
      if (kopf.startsWith('@')) {
        const mobil = elternMobil && (!/^@media/i.test(kopf) || mediaGiltMobil(kopf));
        // @keyframes/@font-face enthalten keine Selektor-Regeln, die uns interessieren.
        stapel.push({ kopf, mobil: /^@(?:media|supports|layer|container)/i.test(kopf) ? mobil : false });
        continue;
      }
      // Normale Regel: Deklarationen bis zur schließenden Klammer (ohne Verschachtelung).
      const ende = text.indexOf('}', i + 1);
      if (ende === -1) break;
      out.push({ selektoren: kopf, deklarationen: text.slice(i + 1, ende), mobil: elternMobil });
      i = ende;
    } else if (c === '}') {
      stapel.pop();
      puffer = '';
    } else if (c === ';' && puffer.trim().startsWith('@')) {
      puffer = ''; // @import …; @charset …;
    } else {
      puffer += c;
    }
  }
  return out;
}

/**
 * Letztes Glied eines Selektors als { tag, klassen, id } — oder null, wenn es nicht
 * statisch auswertbar ist (Pseudo-Klassen, Pseudo-Elemente).
 * @param {string} selektor
 */
function letztesGlied(selektor) {
  const bereinigt = selektor
    .replace(/:where\(\s*\.astro-[\w-]+\s*\)/g, '')
    .replace(/\[data-astro-cid-[\w-]+\]/g, '')
    .trim();
  const glieder = bereinigt.split(/\s*[>+~]\s*|\s+/).filter(Boolean);
  const glied = glieder[glieder.length - 1];
  if (!glied || glied.includes(':') || glied.includes('[')) return null;
  const tag = /^[a-z][\w-]*/i.exec(glied)?.[0]?.toLowerCase() ?? null;
  const klassen = [...glied.matchAll(/\.([\w-]+)/g)].map((m) => m[1]);
  const id = /#([\w-]+)/.exec(glied)?.[1] ?? null;
  if (!tag && klassen.length === 0 && !id) return null; // z. B. `*`
  return { tag, klassen, id };
}

/**
 * @typedef {{ tag: string | null, klassen: string[], id: string | null }} Glied
 * @typedef {{ fixiert: Glied[], versteckt: Glied[] }} CssIndex
 */

/** @param {string} html @returns {CssIndex} */
function cssIndex(html) {
  /** @type {CssIndex} */
  const idx = { fixiert: [], versteckt: [] };
  for (const m of html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi)) {
    for (const regel of cssRegeln(m[1])) {
      if (!regel.mobil) continue;
      const fix = /(?:^|;)\s*position\s*:\s*(?:fixed|sticky)\b/i.test(regel.deklarationen);
      const weg = /(?:^|;)\s*display\s*:\s*none\b/i.test(regel.deklarationen);
      if (!fix && !weg) continue;
      for (const sel of regel.selektoren.split(',')) {
        const g = letztesGlied(sel);
        if (!g) continue;
        if (fix) idx.fixiert.push(g);
        if (weg) idx.versteckt.push(g);
      }
    }
  }
  return idx;
}

/**
 * @param {Glied} g
 * @param {{ tag: string, klassen: Set<string>, id: string | null }} el
 */
const passt = (g, el) =>
  (!g.tag || g.tag === el.tag) && (!g.id || g.id === el.id) && g.klassen.every((k) => el.klassen.has(k));

/** @param {string} attrs @param {string} name */
function attr(attrs, name) {
  const re = new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i');
  const m = re.exec(attrs);
  return m ? (m[1] ?? m[2] ?? m[3] ?? '') : null;
}

/**
 * Trägt die Seite einen `tel:`-Link in einem Element, das auf dem Handy fixiert und
 * sichtbar ist?
 * @param {string} html
 * @returns {boolean}
 */
export function telImFixiertenElement(html) {
  if (!html) return false;
  const css = cssIndex(html);
  const body = ohneSkripte(html).replace(/<style\b[\s\S]*?<\/style\s*>/gi, '');
  /** @type {{ tag: string, fixiert: boolean, versteckt: boolean }[]} */
  const stapel = [];
  const tagRe = /<(\/?)([a-zA-Z][\w:-]*)((?:\s+[^\s=>/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*(\/?)>/g;
  let m;
  while ((m = tagRe.exec(body))) {
    const [, schliessend, rohTag, attrs, selbst] = m;
    const tag = rohTag.toLowerCase();
    if (schliessend) {
      // tolerant: bis zum passenden offenen Element abbauen; ohne Treffer ignorieren
      for (let i = stapel.length - 1; i >= 0; i--) {
        if (stapel[i].tag === tag) {
          stapel.length = i;
          break;
        }
      }
      continue;
    }
    const klassen = new Set((attr(attrs, 'class') ?? '').split(/\s+/).filter(Boolean));
    const el = { tag, klassen, id: attr(attrs, 'id') };
    const style = attr(attrs, 'style') ?? '';
    const eltern = stapel[stapel.length - 1];
    const selbstFix =
      /position\s*:\s*(?:fixed|sticky)\b/i.test(style) ||
      [...klassen].some((k) => FIXIERTE_KLASSEN.has(k)) ||
      css.fixiert.some((g) => passt(g, el));
    const selbstWeg = /display\s*:\s*none\b/i.test(style) || css.versteckt.some((g) => passt(g, el));
    const zustand = {
      tag,
      fixiert: (eltern?.fixiert ?? false) || selbstFix,
      versteckt: (eltern?.versteckt ?? false) || selbstWeg,
    };
    if (tag === 'a' && /^\s*tel:/i.test(attr(attrs, 'href') ?? '') && zustand.fixiert && !zustand.versteckt) {
      return true;
    }
    if (!VOID.has(tag) && !selbst) stapel.push(zustand);
  }
  return false;
}

/**
 * Prüft eine gebaute Site. Liefert höchstens EINE Meldung.
 *
 * @param {{ page: string, html: string }[]} seiten Pfade relativ zu dist/, z. B. 'index.html'.
 * @param {{ stickyTel?: boolean }} [optionen] `stickyTel: false` = Site will bewusst keinen Sticky-Anruf.
 * @returns {StickyTelIssue[]}
 */
export function checkStickyTel(seiten, optionen = {}) {
  if (optionen.stickyTel === false) return [];
  const relevant = seiten.filter((s) => !istIgnoriert(s.page));
  const mitTel = relevant.filter((s) => hatTelLink(s.html));
  if (mitTel.length === 0) return [];

  // Startseite mit Nummer → sie entscheidet (BLZ: Sticky nur auf /website-audit reicht nicht).
  // Startseite ohne Nummer (oder keine Startseite) → eine Seite MIT Nummer muss sie fixiert
  // anbieten (gowohnen: Nummer nur im Exposé, dort im StickyContact).
  const start = relevant.find((s) => istStartseite(s.page));
  const startMitTel = start && hatTelLink(start.html) ? start : null;
  const erfuellt = startMitTel
    ? telImFixiertenElement(startMitTel.html)
    : mitTel.some((s) => telImFixiertenElement(s.html));
  if (erfuellt) return [];

  const beispiele = mitTel.slice(0, 3).map((s) => s.page).join(', ');
  return [
    {
      type: 'no_sticky_tel',
      details:
        `${STICKY_TEL_MELDUNG}. ${startMitTel ? 'Startseite' : 'Keine Seite mit Nummer'} ohne fixierten tel:-Link, ` +
        `obwohl ${mitTel.length} Seite(n) eine Nummer tragen (z. B. ${beispiele}). ` +
        'Bewusst ohne? In der Integration `stickyTel: false` setzen.',
    },
  ];
}
