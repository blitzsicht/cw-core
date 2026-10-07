// @ts-check
/**
 * @cw/core/utils/bild-masse — Format und Pixelmaße eines Bildes aus dem Dateikopf.
 *
 * Ohne sharp: der Helfer läuft in der Astro-Integration quality-checks UND im
 * CI-Skript scripts/og-audit.mjs. Im Site-Checks-Workflow ist von cw-core nur
 * `checks/` installiert, nicht das Paket selbst — ein sharp-Import bräche dort.
 *
 * Anlass (07.10.2026): gowohnen zeigte als og:image `/logo.svg` (206 Byte), kein
 * Messenger zeigte eine Vorschau. Der Vorgänger dieses Helfers (`imageDimensions` in
 * quality-checks) kannte nur PNG und JPEG, gab für SVG und WEBP `null` zurück, und
 * die Prüfung übersprang das Bild — der Fall, der hätte rot werden müssen, war der,
 * den sie nicht sah. Deshalb sagt dieser Helper nicht nur „wie groß", sondern zuerst
 * „was ist es": ein SVG ist kein unbekanntes Bild, sondern ein bekannter Fehler.
 *
 * Die Formaterkennung kommt aus image-format.js (eine Quelle für Magic Bytes, siehe
 * dort); hier steht nur, was sie nicht kann: die Maße.
 */

import { sniffImageFormat } from './image-format.js';

/**
 * Formate, die Messenger und soziale Netze als Vorschaubild anzeigen. SVG fehlt
 * absichtlich: Facebook, WhatsApp, LinkedIn, X und Telegram ignorieren es.
 * AVIF fehlt ebenfalls — Facebook und WhatsApp zeigen es (Stand 10/2026) nicht.
 * @type {ReadonlySet<string>}
 */
export const RASTER_FORMATE = Object.freeze(new Set(['png', 'jpeg', 'webp', 'gif']));

/**
 * @typedef {{ format: string, raster: boolean, width: number|null, height: number|null }} BildMasse
 */

/** PNG: IHDR ist immer der erste Chunk, Breite @16, Höhe @20 (big-endian). */
function pngMasse(b) {
  if (b.length < 24) return null;
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
}

/**
 * JPEG: Segment für Segment bis zum SOF-Marker springen.
 *
 * SOF sind 0xC0–0xCF OHNE 0xC4 (DHT), 0xC8 (JPG-Erweiterung) und 0xCC (DAC) — die
 * tragen dieselbe Bitfolge, aber keine Maße. Der Vorgänger prüfte nur C0–C3 und fand
 * damit z. B. arithmetisch kodierte Bilder (C9–CB) nicht. Marker ohne Länge (RSTn,
 * TEM) werden übersprungen, Füllbytes (FF FF) ebenso.
 */
function jpegMasse(b) {
  let off = 2;
  while (off + 3 < b.length) {
    if (b[off] !== 0xff) return null; // aus dem Tritt — lieber keine Aussage als Unsinn
    const marker = b[off + 1];
    if (marker === 0xff) { off++; continue; }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { off += 2; continue; }
    if (marker === 0xd9 || marker === 0xda) return null; // Bildende/Scan ohne vorheriges SOF
    const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof) {
      if (off + 9 > b.length) return null;
      return { height: b.readUInt16BE(off + 5), width: b.readUInt16BE(off + 7) };
    }
    off += 2 + b.readUInt16BE(off + 2);
  }
  return null;
}

/**
 * WEBP: drei Kopfvarianten, Kennung an Byte 12.
 *   - `VP8 ` (verlustbehaftet): Startcode 9D 01 2A @23, dann 14 Bit Breite/Höhe (LE)
 *   - `VP8L` (verlustfrei): Signatur 0x2F @20, dann je 14 Bit Breite−1 und Höhe−1,
 *     bitweise über Bytegrenzen gepackt
 *   - `VP8X` (erweitert: Alpha, Animation, Metadaten): Leinwand je 24 Bit (LE) −1 @24/@27
 */
function webpMasse(b) {
  if (b.length < 30) return null;
  const chunk = b.subarray(12, 16).toString('latin1');
  if (chunk === 'VP8 ') {
    if (b[23] !== 0x9d || b[24] !== 0x01 || b[25] !== 0x2a) return null;
    return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff };
  }
  if (chunk === 'VP8L') {
    if (b[20] !== 0x2f) return null;
    const b1 = b[21], b2 = b[22], b3 = b[23], b4 = b[24];
    return {
      width: 1 + (((b2 & 0x3f) << 8) | b1),
      height: 1 + (((b4 & 0x0f) << 10) | (b3 << 2) | ((b2 & 0xc0) >> 6)),
    };
  }
  if (chunk === 'VP8X') {
    return { width: 1 + b.readUIntLE(24, 3), height: 1 + b.readUIntLE(27, 3) };
  }
  return null;
}

/** GIF: Logical Screen Descriptor, Breite @6, Höhe @8 (little-endian). */
function gifMasse(b) {
  if (b.length < 10) return null;
  return { width: b.readUInt16LE(6), height: b.readUInt16LE(8) };
}

const LESER = { png: pngMasse, jpeg: jpegMasse, webp: webpMasse, gif: gifMasse };

/**
 * Format und Maße eines Bildes.
 *
 * `raster: true` heißt: ein Format, das Messenger als Vorschau zeigen. Die Maße
 * sind `null`, wenn das Format keine Pixelmaße hat (SVG, HTML) oder der Kopf
 * abgeschnitten bzw. unlesbar ist — dann lieber keine Zahl als eine falsche.
 *
 * @param {Buffer|Uint8Array} bytes  die ganze Datei oder mindestens ihr Anfang
 * @returns {BildMasse}
 */
export function bildMasse(bytes) {
  const b = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes ?? []);
  const format = sniffImageFormat(b);
  const raster = RASTER_FORMATE.has(format);
  const leser = /** @type {Record<string, (b: Buffer) => {width:number,height:number}|null>} */ (LESER)[format];
  const masse = leser ? leser(b) : null;
  return { format, raster, width: masse?.width ?? null, height: masse?.height ?? null };
}
