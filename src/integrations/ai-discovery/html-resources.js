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

/** Tags, deren Inhalt separat als Inline-Ressource gewertet wird. */
const RAW_TEXT = /<(style|script)\b([^>]*)>([\s\S]*?)<\/\1\s*>/gi;

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
 * Parst die Attribute eines Tags in ein lowercase-keyed Objekt.
 * @param {string} raw
 * @returns {Record<string, string>}
 */
export function parseAttrs(raw) {
  /** @type {Record<string, string>} */
  const attrs = {};
  const re = /([a-z_:@][a-z0-9_.:-]*)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/gi;
  let m;
  while ((m = re.exec(raw))) {
    attrs[m[1].toLowerCase()] = m[2] ?? m[3] ?? m[4] ?? '';
  }
  return attrs;
}

/** @param {string} html @param {number} index @returns {number} */
function lineAt(html, index) {
  let line = 1;
  for (let i = 0; i < index && i < html.length; i++) if (html[i] === '\n') line++;
  return line;
}

/** Zerlegt ein srcset-Attribut in seine URLs. @param {string} v @returns {string[]} */
function srcsetUrls(v) {
  return v
    .split(',')
    .map((p) => p.trim().split(/\s+/)[0])
    .filter(Boolean);
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
  /** @type {Resource[]} */
  const out = [];
  /** @param {number} i */
  const at = (i) => `${file}:${lineAt(html, i)}`;

  // 1. <style> / <script> mit Inhalt.
  let m;
  RAW_TEXT.lastIndex = 0;
  while ((m = RAW_TEXT.exec(html))) {
    const tag = m[1].toLowerCase();
    const attrs = parseAttrs(m[2] ?? '');
    const body = m[3] ?? '';
    const where = at(m.index);

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

  // 2. Generischer Tag-Scan für URL-Referenzen und Inline-Attribute.
  const tagRe = /<(\/?)([a-z][a-z0-9-]*)\b([^>]*)>/gi;
  /** @type {string[]} */
  const mediaStack = [];
  let t;
  while ((t = tagRe.exec(html))) {
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
