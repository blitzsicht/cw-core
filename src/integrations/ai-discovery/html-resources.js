// @ts-check
/**
 * @cw/core/integrations/ai-discovery/html-resources
 *
 * Extrahiert aus fertigem HTML jede Ressource, die einer CSP-Direktive
 * unterliegt — die Eingabe für `csp-match.js`.
 *
 * Reines JS ohne Node-APIs (läuft im Cloudflare-Worker genauso wie unter node_modules im
 * Customer-CI). Gelesen wird mit `parse5`, dem WHATWG-konformen Parser, den Astro ohnehin
 * mitbringt — selbst reines JS ohne Node-APIs, damit bleibt die Laufzeit-Neutralität.
 *
 * Bis zum Review von #289 stand hier ein eigener Tokenizer aus Regex-Alternativen. Jedes Review
 * seit #283 fand neue Zustände, die er nicht kannte (Kommentar-Enden, Quotes nach `=`,
 * Rohtext-Elemente ohne End-Tag, `<plaintext>`, SVG-Fremdinhalt, NBSP in Attributen), jedes
 * Mal mit einem stillen falschen Grün oder Rot. Der Parser kennt sie alle, so wie der Browser.
 *
 * @typedef {import('./csp-match.js').Resource} Resource
 */

import { parse, parseFragment } from 'parse5';
import { srcsetUrls } from '../../utils/html-attribute.js';

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
 * LETZTE Vorkommen gewann. Bis zum Review von #289 las danach `attribute()` aus
 * `utils/html-attribute.js` mit eigener Grammatik (`\s` samt NBSP als Trenner), während der
 * Tag-Scan schon nach WHATWG schnitt: `<img alt=a\u00a0src=/x.webp>` hatte für den Scan ein
 * `src`, für den Browser nicht. Jetzt liest derselbe Parser beides.
 *
 * @param {string} raw Attributteil eines Tags (ohne `<tag`), z. B. ` src="/a.webp" alt='x'`
 * @returns {Record<string, string>}
 */
export function parseAttrs(raw) {
  const frag = parseFragment(`<x ${raw ?? ''}>`);
  const el = /** @type {any} */ (frag.childNodes.find((n) => n.nodeName === 'x'));
  return attrsVon(el);
}

/**
 * Attribute eines parse5-Elements als Objekt. parse5 verwirft doppelte Namen schon im
 * Tokenizer (das erste gewinnt) und dekodiert Entitäten.
 * @param {any} el
 * @returns {Record<string, string>}
 */
function attrsVon(el) {
  /** @type {Record<string, string>} */
  const out = {};
  for (const a of el?.attrs ?? []) {
    // defineProperty statt Zuweisung: ein Attribut namens `__proto__` ist ein Name, kein Prototyp.
    Object.defineProperty(out, a.name, { value: a.value, enumerable: true, writable: true, configurable: true });
  }
  return out;
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
 * Reihenfolge wie bisher: erst die Inline-Ressourcen (`<style>`, `<script>` mit Inhalt, samt
 * `url()` im Style), dann die URL-Referenzen und Inline-Attribute der Tags, beide in
 * Dokumentreihenfolge.
 *
 * Gelesen wird mit laufendem JavaScript (`scriptingEnabled`): Kommentare, Rohtext-Körper
 * (`script`, `style`, `textarea`, `title`, `iframe`, `xmp`, `noembed`, `noframes`, `plaintext`),
 * End-Tag-Attribute und ein Tag ohne `>` am Dateiende laden nichts. In SVG und MathML sind
 * `<style>`/`<title>` kein Rohtext, und ein `<img>` darin bricht aus dem Fremdinhalt aus und lädt.
 *
 * `<noscript>` ist mit JavaScript Rohtext. Sein Körper wird zusätzlich ohne JavaScript gelesen,
 * denn diese Besucher laden seine Bilder und Styles. Scripts darin laufen in keiner der beiden
 * Sichten und zählen deshalb nicht (Review von #289, Befund 2). `<template>`-Inhalt zählt mit:
 * er lädt, sobald ein Script ihn einsetzt.
 *
 * @param {string} html
 * @param {string} [file] Dateiname für die Fundstelle (z. B. 'dist/index.html')
 * @returns {Resource[]}
 */
export function extractResources(html, file = 'html') {
  // Keine Eingabe ist kein Fehler, sondern keine Ressource.
  const s = String(html ?? '');
  /** @type {Resource[]} */
  const inline = [];
  /** @type {Resource[]} */
  const refs = [];
  const doc = parse(s, { sourceCodeLocationInfo: true, scriptingEnabled: true });
  lauf(doc, { file, zeilenVersatz: 0, inMedia: false, ohneJs: false, inline, refs });
  return [...inline, ...refs];
}

/**
 * @typedef {{ file: string, zeilenVersatz: number, inMedia: boolean, ohneJs: boolean,
 *   inline: Resource[], refs: Resource[] }} LaufKontext
 */

/**
 * Kinder eines Knotens in Dokumentreihenfolge besuchen.
 * @param {any} knoten
 * @param {LaufKontext} ctx
 */
function lauf(knoten, ctx) {
  const kinder = knoten.content?.childNodes ?? knoten.childNodes ?? [];
  for (const k of kinder) {
    if (!k.tagName) continue; // Text, Kommentar, Doctype
    element(k, ctx);
  }
}

/** @param {any} el @returns {string} */
const textVon = (el) =>
  (el.childNodes ?? [])
    .filter((/** @type {any} */ n) => n.nodeName === '#text')
    .map((/** @type {any} */ n) => n.value)
    .join('');

/**
 * @param {any} el parse5-Element
 * @param {LaufKontext} ctx
 */
function element(el, ctx) {
  const tag = String(el.tagName).toLowerCase();
  const attrs = attrsVon(el);
  const zeile = ctx.zeilenVersatz + (el.sourceCodeLocation?.startLine ?? 1);
  const where = `${ctx.file}:${zeile}`;
  const { inline, refs } = ctx;

  if (tag === 'noscript' && !ctx.ohneJs) {
    // Mit JavaScript ist der Körper ein einziger Textknoten; ohne JavaScript gewöhnliches HTML.
    const t = (el.childNodes ?? []).find((/** @type {any} */ n) => n.nodeName === '#text');
    if (t?.value) {
      const frag = parseFragment(t.value, { sourceCodeLocationInfo: true, scriptingEnabled: false });
      const versatz = ctx.zeilenVersatz + (t.sourceCodeLocation?.startLine ?? 1) - 1;
      lauf(frag, { ...ctx, zeilenVersatz: versatz, ohneJs: true });
    }
    return;
  }
  // Ohne JavaScript läuft kein Script und lädt kein `src`.
  if (tag === 'script' && ctx.ohneJs) return;

  if (tag === 'style') {
    const body = textVon(el);
    inline.push({ type: 'inline', directive: 'style-src-elem', nonce: attrs.nonce || null, content: body, where });
    inline.push(...extractCssUrls(body, where));
  } else if (tag === 'script' && !attrs.src) {
    const type = (attrs.type || '').trim().toLowerCase();
    const body = textVon(el);
    if (!NON_EXECUTABLE_SCRIPT_TYPES.has(type) && body.trim()) {
      inline.push({ type: 'inline', directive: 'script-src-elem', nonce: attrs.nonce || null, content: body, where });
    }
  }

  /** @param {string} directive @param {string|undefined} url */
  const push = (directive, url) => {
    if (!url || isIrrelevant(url)) return;
    refs.push({ type: 'url', directive, url, where });
  };

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
        /** @type {Record<string, string>} */
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
    case 'source':
      // <source> in <picture> liefert srcset (Bild), in <video>/<audio> src (Medium).
      for (const u of srcsetUrls(attrs.srcset || '')) push('img-src', u);
      if (attrs.src) push(ctx.inMedia ? 'media-src' : 'img-src', attrs.src);
      break;
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
    refs.push({ type: 'attr', directive: 'style-src-attr', where });
    refs.push(...extractCssUrls(attrs.style, where));
  }
  // on*="…" → script-src-attr
  if (Object.keys(attrs).some((k) => /^on[a-z]+$/.test(k))) {
    refs.push({ type: 'attr', directive: 'script-src-attr', where });
  }

  lauf(el, tag === 'video' || tag === 'audio' ? { ...ctx, inMedia: true } : ctx);
}
