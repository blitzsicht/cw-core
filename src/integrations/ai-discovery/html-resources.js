// @ts-check
/**
 * @cw/core/integrations/ai-discovery/html-resources
 *
 * Extrahiert aus fertigem HTML jede Ressource, die einer CSP-Direktive
 * unterliegt — die Eingabe für `csp-match.js`.
 *
 * Reines JS ohne Node-APIs und ohne DOM-Parser-Dependency (läuft im
 * Cloudflare-Worker genauso wie unter node_modules im Customer-CI).
 *
 * @typedef {import('./csp-match.js').Resource} Resource
 */

import { attribute, srcsetUrls } from '../../utils/html-attribute.js';

/*
 * Bausteine des Tag-Lesers, nach dem WHATWG-Tokenizer. Ein Quote zählt nur direkt nach `=`
 * als Beginn eines Werts; `class=a'b` ist ein unquotierter Wert, `a'b` ein Attributname.
 * Ein offener Wert läuft bis zum Dateiende, wie im Browser. HTML-Whitespace ist nur
 * Tab, LF, FF, CR und Leerzeichen (JS-`\s` kennt auch NBSP).
 */
const WS = '[\\t\\n\\f\\r ]';
const WERT = `(?:"[^"]*(?:"|$)|'[^']*(?:'|$)|[^\\t\\n\\f\\r >"'][^\\t\\n\\f\\r >]*|(?=>|$))`;
const ATTR = `[^\\t\\n\\f\\r />][^\\t\\n\\f\\r />=]*(?:${WS}*=${WS}*${WERT})?`;
/**
 * Alle Attribute eines Tags bis vor `>` oder Dateiende. Der erste gierige Weg durch dieses
 * Muster ist genau die Lesart des Browsers; atomar eingebunden (`(?=(…))\N`), damit die
 * Regex bei einem Fehlschlag nicht in eine andere Lesart zurückspringt (ein Quote als
 * Namenszeichen, ein `>` im Wert als Tag-Ende) und nicht exponentiell sucht.
 * @param {number} n Nummer der Fanggruppe, die der Aufrufer dafür vergibt
 */
const attrsAtomar = (n) => `(?=((?:${ATTR}|${WS}+|\\/)*))\\${n}`;

/**
 * Elemente, deren Körper der Parser als Text liest (RAWTEXT/RCDATA): darin beginnt `<!--` keinen
 * Kommentar und `<img>` lädt nichts. `style`/`script` werden zusätzlich als Inline-Ressource
 * ausgewertet. `noscript` ist Rohtext nur bei laufendem JavaScript: sein Körper endet sicher an
 * `</noscript>`, wird aber für die Sicht ohne JavaScript weiter gelesen (siehe `rohBereiche`).
 */
const ROH_ELEMENTE = 'style|script|textarea|title|xmp|iframe|noembed|noframes|noscript';

/**
 * Bereiche, in denen der HTML-Parser keine Tags sieht, in Dokumentreihenfolge: Kommentare und
 * die Körper der Rohtext-Elemente. EIN Muster mit Alternativen, damit gilt, was der Browser
 * liest: `<script>` in einem Kommentar ist kein Script, `<!--` in einem Script kein Kommentar.
 *
 * - Kommentar-Enden wie im WHATWG-Tokenizer: `<!-->` und `<!--->` schließen sofort, sonst
 *   `-->` oder `--!>`. Ein offener Kommentar läuft bis zum Dateiende (wie im Browser).
 * - Bogus Comments: `<?…>`, `<!…>` und `</` vor einem Nicht-Buchstaben laufen bis zum nächsten `>`.
 * - Rohtext-Element: Name, dann Whitespace, `/` oder `>` (nicht `\b`: `<style-guide>` ist ein
 *   eigenes Element), Körper bis zum passenden End-Tag.
 * - Die letzte Alternative liest jeden anderen Tag samt Attributen und wird verworfen. Damit
 *   beginnt ein Bereich nur an einer echten Tag-Position, nie in einem Wert wie
 *   `pattern="<!--"` oder `data-tpl="<script>"`. Ein Tag ohne `>` läuft bis zum Dateiende.
 *
 * Anlass: Review von #285 (`<!-->`, `--!>`, `<!--` im Attributwert blendeten den Rest der Seite
 * aus) und Review von #287, gegen v0.195.0 gemessen und in Chromium nachgeprüft: `class=a'b`
 * ließ ein Inline-Script verschwinden, `<!--` in `<textarea>`/`<title>`/`<noscript>` alles
 * danach, `<style-guide>` das folgende Bild. Jedes Mal blieb ein fehlendes Bild oder ein
 * Inline-Script still grün.
 */
const ROH_BEREICH = new RegExp(
  [
    `<!--(?:-?>|[\\s\\S]*?(?:--!?>|$))`,
    `<(?:[?!]|\\/(?![a-z>]))[^>]*(?:>|$)`,
    `<(${ROH_ELEMENTE})(?=[\\t\\n\\f\\r />])${attrsAtomar(2)}>([\\s\\S]*?)<\\/\\1(?=[\\t\\n\\f\\r />])${attrsAtomar(4)}(?:>|$)`,
    `<\\/?[a-z][^\\t\\n\\f\\r />]*${attrsAtomar(5)}(?:>|$)`,
  ].join('|'),
  'gi',
);

/**
 * @typedef {{ art: 'kommentar' } | { art: 'roh' | 'style' | 'script', attrs: string, body: string, bodyStart: number }} RohBereich
 * @param {string} html
 * @param {number} [versatz] Offset von `html` im Gesamtdokument (für `noscript`-Körper)
 * @returns {Generator<RohBereich & { index: number, ende: number }>}
 */
function* rohBereiche(html, versatz = 0) {
  const re = new RegExp(ROH_BEREICH.source, 'gi');
  let m;
  while ((m = re.exec(html))) {
    const index = versatz + m.index;
    const ende = index + m[0].length;
    if (m[1] === undefined) {
      // Kommentar oder Bogus Comment; ein gewöhnlicher Tag wird nur gelesen, damit nichts in
      // seinen Werten einen Bereich beginnt.
      if (/^<[!?]|^<\/(?![a-z])/i.test(m[0])) yield { art: 'kommentar', index, ende };
      continue;
    }
    const name = m[1].toLowerCase();
    const attrs = m[2] ?? '';
    const body = m[3] ?? '';
    // Start-Tag = `<` + Name + Attribute + `>`; der Körper folgt direkt.
    const bodyStart = index + 1 + m[1].length + attrs.length + 1;
    if (name === 'noscript') {
      // Ohne JavaScript ist der Körper gewöhnliches HTML: seine Tags zählen weiter, ein
      // Kommentar darin endet aber spätestens an `</noscript>`.
      yield* rohBereiche(body, bodyStart);
      continue;
    }
    const art = name === 'style' || name === 'script' ? name : 'roh';
    yield { art, attrs, body, bodyStart, index, ende };
  }
}

/**
 * Das HTML mit Leerzeichen über Kommentaren, Bogus Comments und den Körpern der
 * Rohtext-Elemente (`ROH_ELEMENTE` ohne `noscript`). Zeilenumbrüche bleiben stehen, damit
 * Länge, Offsets und Zeilennummern gleich bleiben; die Tags `<script …>` und `</script>`
 * selbst bleiben sichtbar.
 *
 * Anlass (Nachlese der Reviews #283/#284): Der Tag-Scan lief über das rohe HTML. Seit
 * verify-touchpoints dieselben Refs liest wie die CSP-Prüfung, wurde
 * `el.innerHTML='<div style="background:url(/img/'+n+'.webp)">'` im Script zur Asset-Referenz
 * `/img/'+n+'.webp`, ebenso ein auskommentierter Tag. Beides lädt der Browser nie.
 *
 * @param {string} html
 * @returns {string}
 */
export function maskiere(html) {
  const s = String(html ?? '');
  return maskiereBereiche(s, rohBereiche(s));
}

/**
 * @param {string} s
 * @param {Iterable<RohBereich & { index: number, ende: number }>} bereiche aus `rohBereiche(s)`
 * @returns {string}
 */
function maskiereBereiche(s, bereiche) {
  const leer = (/** @type {string} */ t) => t.replace(/[^\n]/g, ' ');
  let out = '';
  let pos = 0;
  for (const b of bereiche) {
    if (b.art === 'kommentar') {
      out += s.slice(pos, b.index) + leer(s.slice(b.index, b.ende));
    } else {
      const bodyEnde = b.bodyStart + b.body.length;
      out += s.slice(pos, b.bodyStart) + leer(b.body) + s.slice(bodyEnde, b.ende);
    }
    pos = b.ende;
  }
  return out + s.slice(pos);
}

/**
 * `type`-Werte eines `<script>`, die **nicht** ausgeführt werden und damit
 * nicht der CSP unterliegen. `application/ld+json` steht auf jeder unserer
 * Kundenseiten — als Script zu werten wäre ein False Positive überall.
 */
const NON_EXECUTABLE_SCRIPT_TYPES = new Set([
  'application/ld+json',
  'application/json',
  'text/template',
  'text/html',
]);

/**
 * Parst die Attribute eines Tags in ein lowercase-keyed Objekt — so, wie der Browser
 * sie liest: Werte entitätsdekodiert, je Name gilt das ERSTE Vorkommen, quote-korrekt.
 *
 * Bis cw-core#260 (Punkt 2) stand hier ein eigener Leser ohne Decoder, bei dem das
 * LETZTE Vorkommen gewann. verify-touchpoints las dieselben Tags mit
 * `attribute()` aus `utils/html-attribute.js`; zwei Leser mit zwei Ergebnissen für
 * dasselbe HTML. Jetzt gibt es einen: `src="/a&#38;b.webp"` ist auch für die CSP `/a&b.webp`.
 *
 * @param {string} raw Attributteil eines Tags (ohne `<tag`), z. B. ` src="/a.webp" alt='x'`
 * @returns {Record<string, string>}
 */
export function parseAttrs(raw) {
  return attribute(` ${raw ?? ''}`);
}

/** @param {string} html @param {number} index @returns {number} */
function lineAt(html, index) {
  let line = 1;
  for (let i = 0; i < index && i < html.length; i++) if (html[i] === '\n') line++;
  return line;
}

/** URLs ohne CSP-Relevanz (Fragment, Mail, Telefon, JS-Pseudo-Protokoll). @param {string} u @returns {boolean} */
function isIrrelevant(u) {
  const t = u.trim();
  if (!t) return true;
  return /^(#|mailto:|tel:|sms:|javascript:|about:)/i.test(t);
}

/**
 * Zieht `url(...)`-Referenzen aus einem CSS-Text. Innerhalb von `@font-face`
 * zählen sie als Font, sonst als Bild.
 * @param {string} css
 * @param {string} where
 * @returns {Resource[]}
 */
export function extractCssUrls(css, where) {
  /** @type {Resource[]} */
  const out = [];
  // Grobe, aber ausreichende Segmentierung: @font-face-Blöcke isolieren.
  /** @type {Array<{ from: number, to: number }>} */
  const fontFaceRanges = [];
  const ff = /@font-face\s*\{/gi;
  let m;
  while ((m = ff.exec(css))) {
    const start = m.index;
    const close = css.indexOf('}', ff.lastIndex);
    fontFaceRanges.push({ from: start, to: close === -1 ? css.length : close });
  }
  const inFontFace = (i) => fontFaceRanges.some((r) => i >= r.from && i <= r.to);

  const re = /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)\s]*))\s*\)/gi;
  let u;
  while ((u = re.exec(css))) {
    const url = (u[1] ?? u[2] ?? u[3] ?? '').trim();
    if (isIrrelevant(url)) continue;
    out.push({
      type: 'url',
      directive: inFontFace(u.index) ? 'font-src' : 'img-src',
      url,
      where,
    });
  }
  return out;
}

/**
 * Sammelt alle CSP-relevanten Ressourcen eines HTML-Dokuments.
 *
 * @param {string} html
 * @param {string} [file] Dateiname für die Fundstelle (z. B. 'dist/index.html')
 * @returns {Resource[]}
 */
export function extractResources(html, file = 'html') {
  // Wie `maskiere`: keine Eingabe ist kein Fehler, sondern keine Ressource.
  const s = String(html ?? '');
  /** @type {Resource[]} */
  const out = [];
  /** @param {number} i */
  const at = (i) => `${file}:${lineAt(s, i)}`;

  // Die Bereiche einmal sammeln: für die Inline-Ressourcen hier und für die Maske unten.
  const bereiche = [...rohBereiche(s)];

  // 1. <style> / <script> mit Inhalt (nicht in Kommentaren, nicht in anderen Rohtext-Körpern).
  for (const b of bereiche) {
    if (b.art === 'kommentar' || b.art === 'roh') continue;
    const tag = b.art;
    const attrs = parseAttrs(b.attrs);
    const body = b.body;
    const where = at(b.index);

    if (tag === 'style') {
      out.push({ type: 'inline', directive: 'style-src-elem', nonce: attrs.nonce || null, content: body, where });
      out.push(...extractCssUrls(body, where));
      continue;
    }

    // <script src="…"> wird unten über den generischen Tag-Scan erfasst.
    if (attrs.src) continue;
    const type = (attrs.type || '').trim().toLowerCase();
    if (NON_EXECUTABLE_SCRIPT_TYPES.has(type)) continue;
    if (!body.trim()) continue;
    out.push({ type: 'inline', directive: 'script-src-elem', nonce: attrs.nonce || null, content: body, where });
  }

  // 2. Generischer Tag-Scan für URL-Referenzen und Inline-Attribute, über die Maske:
  // Tags, die nur als Text in Kommentaren oder Script-/Style-Körpern stehen, zählen nicht.
  // Dieselbe Attribut-Lesart wie oben: `>` in einem gequoteten Wert beendet den Tag nicht.
  // Ein Tag ohne `>` (offener Wert bis zum Dateiende) lädt im Browser nichts, ebenso alles
  // danach, also endet der Scan dort.
  const sichtbar = maskiereBereiche(s, bereiche);
  const tagRe = new RegExp(`<(\\/?)([a-z][^\\t\\n\\f\\r />]*)${attrsAtomar(3)}(>|$)`, 'gi');
  /** @type {string[]} */
  const mediaStack = [];
  let t;
  while ((t = tagRe.exec(sichtbar))) {
    if (t[4] !== '>') break;
    const closing = t[1] === '/';
    const tag = t[2].toLowerCase();
    if (closing) {
      // Nur Medien-Kontext tracken — nötig, um <source> in <picture> von
      // <source> in <video>/<audio> zu unterscheiden.
      if ((tag === 'video' || tag === 'audio') && mediaStack[mediaStack.length - 1] === tag) mediaStack.pop();
      continue;
    }
    const attrs = parseAttrs(t[3] ?? '');
    const where = at(t.index);
    /** @param {string} directive @param {string|undefined} url */
    const push = (directive, url) => {
      if (!url || isIrrelevant(url)) return;
      out.push({ type: 'url', directive, url, where });
    };

    if (tag === 'video' || tag === 'audio') mediaStack.push(tag);

    switch (tag) {
      case 'script':
        push('script-src-elem', attrs.src);
        break;
      case 'link': {
        const rel = (attrs.rel || '').toLowerCase();
        const as = (attrs.as || '').toLowerCase();
        if (!attrs.href) break;
        if (rel.includes('stylesheet')) push('style-src-elem', attrs.href);
        else if (rel.includes('modulepreload')) push('script-src-elem', attrs.href);
        else if (rel.includes('manifest')) push('manifest-src', attrs.href);
        else if (rel.includes('preload') || rel.includes('prefetch')) {
          const map = { style: 'style-src-elem', script: 'script-src-elem', font: 'font-src', image: 'img-src', audio: 'media-src', video: 'media-src', fetch: 'connect-src' };
          const d = map[as];
          if (d) push(d, attrs.href);
        } else if (rel.includes('icon')) push('img-src', attrs.href);
        break;
      }
      case 'img':
        push('img-src', attrs.src);
        for (const u of srcsetUrls(attrs.srcset || '')) push('img-src', u);
        break;
      case 'source': {
        // <source> in <picture> liefert srcset (Bild), in <video>/<audio> src (Medium).
        const inMedia = mediaStack.length > 0;
        for (const u of srcsetUrls(attrs.srcset || '')) push('img-src', u);
        if (attrs.src) push(inMedia ? 'media-src' : 'img-src', attrs.src);
        break;
      }
      case 'video':
        push('media-src', attrs.src);
        push('img-src', attrs.poster);
        break;
      case 'audio':
      case 'track':
        push('media-src', attrs.src);
        break;
      case 'iframe':
        push('frame-src', attrs.src);
        break;
      case 'embed':
      case 'object':
        push('object-src', attrs.src || attrs.data);
        break;
      case 'form':
        push('form-action', attrs.action);
        break;
      default:
        break;
    }

    // data-embed-src="…" → frame-src: Click-to-load-Embeds (MapEmbed) legen das iframe
    // erst nach dem Klick per Skript an. Im ausgelieferten HTML steht nur das Ziel im
    // data-Attribut — ohne diese Zeile sah der Output-Check das iframe nie, und eine CSP
    // ohne www.openstreetmap.org baute grün, während „Karte laden“ live geblockt wurde
    // (brotzeithaeusl, levia, arnold-lang, 20.10.2026).
    if (attrs['data-embed-src']) push('frame-src', attrs['data-embed-src']);

    // style="…" → style-src-attr
    if (attrs.style) {
      out.push({ type: 'attr', directive: 'style-src-attr', where });
      out.push(...extractCssUrls(attrs.style, where));
    }
    // on*="…" → script-src-attr
    if (Object.keys(attrs).some((k) => /^on[a-z]+$/.test(k))) {
      out.push({ type: 'attr', directive: 'script-src-attr', where });
    }
  }

  return out;
}
