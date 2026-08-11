// @ts-check
/**
 * @cw/core/utils/image-format — was eine Bilddatei WIRKLICH ist, nicht was ihr Name behauptet.
 *
 * Single Source of Truth für „welche Endung erwartet welches Format", genutzt von BEIDEN
 * Pfaden, damit sie nie divergieren (CLAUDE.md #1-Rule, analog copyright.js/geotag-core.js):
 *   - Guard:    lintSourceAssetFormat() in ai-discovery/index.ts (meldet die Abweichung)
 *   - Pipeline: scripts/optimize-images.mjs (fasst eine abweichende Datei nicht an,
 *               statt sie still zu reparieren und den Befund zuzudecken)
 *
 * Auslöser (blitzsicht-ops#651): zwei Kunden, ein Fehlertyp — gottls `rics.png` war
 * 212 Byte HTML (Incapsula-Bot-Schutz statt Bild), stellers `hero.webp` ein 1257-KB-PNG.
 * Beide kamen über fehlgeschlagene Downloads beim Onboarding ins Repo, beide wurden
 * einzeln und zufällig gefunden.
 *
 * Rein (keine I/O) → per node:test ohne Dateisystem prüfbar. Plain `.js`, damit das
 * CLI-Skript `optimize-images.mjs` es ohne `.ts`-Import laden kann.
 */

/**
 * Endung → erwartetes Format. Bewusst nur Endungen mit eindeutiger Signatur;
 * alles andere wird nicht geprüft (lieber keine Aussage als eine falsche).
 * @type {Readonly<Record<string, string>>}
 */
export const EXT_FORMAT = Object.freeze({
  '.png': 'png',
  '.jpg': 'jpeg',
  '.jpeg': 'jpeg',
  '.webp': 'webp',
  '.gif': 'gif',
  '.svg': 'svg',
  '.avif': 'avif',
  '.ico': 'ico',
  '.bmp': 'bmp',
  '.tif': 'tiff',
  '.tiff': 'tiff',
});

/**
 * Wie viele Bytes `sniffImageFormat` sinnvoll braucht. Für Magic Bytes würden 16
 * reichen; der Text-Zweig muss einen Kommentar-Header überspringen können, und die
 * sind lang: zinks Logo beginnt mit einem dreizeiligen `<!-- … -->` über die
 * Illustrator-Herkunft. 8 KB deckt das mit Reserve.
 */
export const SNIFF_BYTES = 8192;

/** ISOBMFF-Brands, die als AVIF durchgehen (Encoder setzen nicht alle `avif` als Major-Brand). */
const AVIF_BRANDS = new Set(['avif', 'avis', 'mif1', 'miaf', 'msf1']);

/** Tags, die eine Textdatei als HTML statt als SVG ausweisen. */
const HTML_TAGS = new Set(['html', 'head', 'body', 'script', 'meta', 'div', 'a', 'p', 'title', 'link']);

/**
 * Führende Nicht-Inhalts-Teile eines XML/HTML-Texts abstreifen: BOM, Whitespace,
 * Processing Instructions (`<?xml … ?>`), Kommentare (`<!-- … -->`) und DOCTYPE.
 *
 * Ohne diesen Schritt meldet der Guard Falsch-Positive: gemessen am 11.08.2026 über
 * die Fleet waren 4 der 7 Rohtreffer gültige SVGs, die mit einem Kommentar beginnen
 * (zinks Logos, beide Varianten, in zwei Repos). Ein Guard, der die Hälfte seiner
 * Treffer erfindet, wird abgeschaltet statt gefixt.
 *
 * @param {string} text
 * @returns {{ rest: string, sawHtmlDoctype: boolean }}
 */
function stripLeadingNoise(text) {
  let rest = text.replace(/^﻿/, '');
  // Begrenzt, damit eine bösartige/kaputte Datei die Schleife nicht offen hält.
  for (let i = 0; i < 64; i++) {
    const before = rest;
    rest = rest.replace(/^\s+/, '');

    if (rest.startsWith('<?')) {
      const end = rest.indexOf('?>');
      if (end < 0) break; // abgeschnitten (wir sehen nur SNIFF_BYTES) → nicht raten
      rest = rest.slice(end + 2);
      continue;
    }
    if (rest.startsWith('<!--')) {
      const end = rest.indexOf('-->');
      if (end < 0) break;
      rest = rest.slice(end + 3);
      continue;
    }
    const doctype = /^<!DOCTYPE\s+([a-zA-Z]+)/i.exec(rest);
    if (doctype) {
      if (doctype[1].toLowerCase() === 'html') return { rest, sawHtmlDoctype: true };
      const end = rest.indexOf('>');
      if (end < 0) break;
      rest = rest.slice(end + 1);
      continue;
    }
    if (rest === before) break;
  }
  return { rest, sawHtmlDoctype: false };
}

/**
 * Erkennt das tatsächliche Format aus dem Dateianfang.
 *
 * Rückgabe ist absichtlich auch dann aussagekräftig, wenn es KEIN Bild ist — gottls
 * Fall war HTML mit `.png`-Endung, nicht bloß eine Format-Verwechslung. Ein Guard, der
 * nur „PNG statt WebP" kennt, hätte ihn nicht gemeldet.
 *
 * @param {Buffer|Uint8Array} bytes  Dateianfang, mindestens `SNIFF_BYTES` (oder die ganze Datei)
 * @returns {string} `png`|`jpeg`|`webp`|`gif`|`ico`|`bmp`|`tiff`|`avif`|`svg`|`html`
 *                   |`empty`|`xml:<tag>`|`isobmff:<brand>`|`unknown:<hex>`
 */
export function sniffImageFormat(bytes) {
  const b = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes ?? []);
  if (b.length === 0) return 'empty';

  const hex = b.subarray(0, 16).toString('hex').toLowerCase();

  if (hex.startsWith('89504e470d0a1a0a')) return 'png';
  if (hex.startsWith('ffd8ff')) return 'jpeg';
  if (hex.startsWith('52494646') && b.subarray(8, 12).toString('latin1') === 'WEBP') return 'webp';
  if (hex.startsWith('474946383761') || hex.startsWith('474946383961')) return 'gif';
  // ICO = 00 00 01 00. Cursor (00 00 02 00) ist bewusst NICHT `ico` — eine .ico, die
  // in Wahrheit ein Cursor ist, gehört gemeldet.
  if (hex.startsWith('00000100')) return 'ico';
  if (hex.startsWith('424d')) return 'bmp';
  if (hex.startsWith('49492a00') || hex.startsWith('4d4d002a')) return 'tiff';
  if (b.length >= 12 && b.subarray(4, 8).toString('latin1') === 'ftyp') {
    const brand = b.subarray(8, 12).toString('latin1');
    return AVIF_BRANDS.has(brand) ? 'avif' : `isobmff:${brand}`;
  }

  // Ab hier: kein bekannter Binär-Header. Als Text lesen — SVG ist der einzige
  // Textkandidat unter den Bildformaten, HTML der häufigste Hochstapler.
  const { rest, sawHtmlDoctype } = stripLeadingNoise(b.toString('utf8'));
  if (sawHtmlDoctype) return 'html';

  const tag = /^<([a-zA-Z][a-zA-Z0-9-]*)/.exec(rest);
  if (tag) {
    const name = tag[1].toLowerCase();
    if (name === 'svg') return 'svg';
    if (HTML_TAGS.has(name)) return 'html';
    return `xml:${name}`;
  }

  return `unknown:${hex.slice(0, 16)}`;
}

/**
 * Erwartetes Format zu einer Endung, oder `null` wenn die Endung nicht geprüft wird.
 * @param {string} ext  mit führendem Punkt, Groß/Klein egal
 * @returns {string|null}
 */
export function expectedFormatForExt(ext) {
  return EXT_FORMAT[String(ext ?? '').toLowerCase()] ?? null;
}

/**
 * Menschliche Beschreibung eines Sniff-Ergebnisses für die Guard-Meldung.
 * @param {string} format  Rückgabe von sniffImageFormat
 * @returns {string}
 */
export function describeFormat(format) {
  if (format === 'html') return 'HTML (kein Bild)';
  if (format === 'empty') return 'leer (0 Bytes)';
  if (format.startsWith('xml:')) return `XML <${format.slice(4)}> (kein Bild)`;
  if (format.startsWith('isobmff:')) return `ISOBMFF-Brand "${format.slice(8)}" (kein AVIF)`;
  if (format.startsWith('unknown:')) return `unbekannt (beginnt mit ${format.slice(8)})`;
  return format.toUpperCase();
}
