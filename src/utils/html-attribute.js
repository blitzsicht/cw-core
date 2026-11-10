// @ts-check
/**
 * @cw/core/utils/html-attribute: Attributwerte aus fertigem HTML so lesen, wie der
 * Browser sie liest. Drei Teile: ein quote-korrekter Attributleser, EIN Entity-Decoder
 * für Attributwerte und ein srcset-Zerleger nach WHATWG.
 *
 * Anlass: cw-core#260, Nachlese zu PR #263. verify-touchpoints las Attribute mit
 * `["']([^"']+)["']`. Das endet am ersten Anführungszeichen jeder Art, und Astro lässt
 * ein `'` in doppelt gequoteten Werten roh stehen: aus `src="/it's.webp"` wurde `/it`
 * (T2). Der Decoder lief in mehreren Durchgängen: erst numerisch, dann benannt. Ein
 * `&#38;amp;` wurde so zweimal aufgelöst (T1). Es gab drei eigene Decoder in cw-core
 * mit drei verschiedenen Teilmengen (T7). Dieser Helfer ersetzt die zwei in den
 * Prüfskripten. Der Titel-Decoder in ai-discovery dekodiert absichtlich doppelt
 * (doppelt escapte Titel) und bleibt deshalb vorerst eigen.
 *
 * Reines JS ohne Node-APIs. Es läuft in den CI-Skripten genauso wie im Worker.
 */

/**
 * Windows-1252 für 0x80–0x9F. Ein HTML-Parser liest `&#128;` als `€`, nicht als
 * Steuerzeichen U+0080 (WHATWG HTML, „numeric character reference end state").
 * Die fünf Lücken (0x81, 0x8D, 0x8F, 0x90, 0x9D) bleiben, wie sie sind.
 * @type {Readonly<Record<number, number>>}
 */
const WINDOWS_1252 = Object.freeze({
  0x80: 0x20ac, 0x82: 0x201a, 0x83: 0x0192, 0x84: 0x201e, 0x85: 0x2026, 0x86: 0x2020,
  0x87: 0x2021, 0x88: 0x02c6, 0x89: 0x2030, 0x8a: 0x0160, 0x8b: 0x2039, 0x8c: 0x0152,
  0x8e: 0x017d, 0x91: 0x2018, 0x92: 0x2019, 0x93: 0x201c, 0x94: 0x201d, 0x95: 0x2022,
  0x96: 0x2013, 0x97: 0x2014, 0x98: 0x02dc, 0x99: 0x2122, 0x9a: 0x0161, 0x9b: 0x203a,
  0x9c: 0x0153, 0x9e: 0x017e, 0x9f: 0x0178,
});

/**
 * Benannte Entities, die in Attributwerten real vorkommen. Ein unbekannter Name bleibt
 * buchstäblich stehen. Das ist sicherer als zu raten, denn eine erfundene Ersetzung
 * ergäbe eine Adresse, die der Browser nie lädt.
 * @type {Readonly<Record<string, string>>}
 */
const BENANNT = Object.freeze({
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0',
  // Entity-Namen sind case-sensitiv; diese vier gibt es auch groß, `&Amp;` dagegen nicht.
  AMP: '&', LT: '<', GT: '>', QUOT: '"',
});

/**
 * Namen, die der Browser auch OHNE Semikolon auflöst (die „legacy"-Einträge der
 * WHATWG-Tabelle, soweit sie hier vorkommen). `apos` gehört nicht dazu.
 */
const OHNE_SEMIKOLON = new Set(['amp', 'lt', 'gt', 'quot', 'nbsp', 'AMP', 'LT', 'GT', 'QUOT']);

/**
 * Ein Zeichen aus einer numerischen Entity nach WHATWG: 0, Surrogate und alles über
 * 0x10FFFF werden U+FFFD, 0x80–0x9F gehen über Windows-1252. Ohne die Obergrenze
 * hielte `String.fromCodePoint` den Lauf mit einem RangeError an (T5).
 * @param {number} nr
 * @returns {string}
 */
export function entityZeichen(nr) {
  if (!Number.isSafeInteger(nr) || nr === 0 || nr > 0x10ffff) return '\uFFFD';
  if (nr >= 0xd800 && nr <= 0xdfff) return '\uFFFD';
  return String.fromCodePoint(WINDOWS_1252[nr] ?? nr);
}

/**
 * HTML-Entities in einem ATTRIBUTWERT auflösen, in EINEM Durchgang. Ein Ergebnis wird
 * nie erneut gelesen: `&#38;amp;` ergibt `&amp;`, nicht `&` (T1).
 *
 * - Numerisch (`&#38;`, `&#x26;`) auch ohne Semikolon, wie im Browser (T4).
 * - Benannt mit Semikolon; ohne nur die Legacy-Namen, und nur, wenn danach kein
 *   Buchstabe, keine Ziffer und kein `=` folgt. So verlangt es WHATWG für Attribute,
 *   damit `?a=1&ampel=2` eine Query bleibt.
 *
 * NUR für Attributwerte. Der Inhalt von `<style>` und `<script>` ist ein roher
 * Textknoten, den kein Parser dekodiert.
 *
 * @template {string | null | undefined} T
 * @param {T} wert
 * @returns {T}
 */
export function dekodiereEntities(wert) {
  if (wert === undefined || wert === null) return wert;
  return /** @type {T} */ (
    String(wert).replace(
      /&(?:#[xX]([0-9a-fA-F]+)|#([0-9]+)|([A-Za-z][A-Za-z0-9]*))(;?)/g,
      (treffer, hex, dez, name, semikolon, pos, ganz) => {
        if (hex !== undefined) return entityZeichen(parseInt(hex, 16));
        if (dez !== undefined) return entityZeichen(Number(dez));
        if (!Object.hasOwn(BENANNT, name)) return treffer;
        if (semikolon) return BENANNT[name];
        const danach = ganz.charAt(pos + treffer.length);
        if (OHNE_SEMIKOLON.has(name) && !/[A-Za-z0-9=]/.test(danach)) return BENANNT[name];
        return treffer;
      },
    )
  );
}

/**
 * Die Attribute eines Tags. Die Schlüssel sind klein geschrieben, die Werte dekodiert.
 * Je Name gilt das ERSTE Vorkommen, wie im HTML-Parser. Attribute ohne Wert stehen mit
 * `''` drin.
 *
 * Quote-korrekt: ein `'` in einem doppelt gequoteten Wert gehört zum Wert (T2).
 *
 * @param {string} tag z. B. `<img src="/a.webp" alt='x'>` (mit oder ohne Tagname)
 * @returns {Record<string, string>}
 */
export function attribute(tag) {
  /** @type {Record<string, string>} */
  const out = {};
  const innen = String(tag ?? '').replace(/^\s*<\/?[A-Za-z][^\s/>]*/, '').replace(/\/?>\s*$/, '');
  const re = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
  for (const m of innen.matchAll(re)) {
    const name = m[1].toLowerCase();
    if (Object.hasOwn(out, name)) continue;
    out[name] = dekodiereEntities(m[2] ?? m[3] ?? m[4] ?? '');
  }
  return out;
}

/**
 * Die URLs eines (schon dekodierten) srcset-Werts nach WHATWG „parse a srcset attribute".
 * Eine URL ist die ganze Folge von Nicht-Leerzeichen. Ein Komma darin gehört zur URL,
 * Kommas am Ende trennen. Deskriptoren laufen bis zum nächsten Komma außerhalb von
 * Klammern. Das naive `split(',')` machte aus `/a,b.webp 1x` die Adresse `/a` (T6).
 *
 * Ein Kandidat mit ungültigem Deskriptor fällt weg, wie im Browser („if error is still
 * no, append"). Das ist der Weg, auf dem eine data:-URL mit Leerzeichen zerfällt:
 * `data:…%3Csvg xmlns='…'%3E 1x` wird zu URL `data:…%3Csvg` mit Deskriptor `xmlns='…'%3E`
 * und verworfen, der nächste Kandidat nach dem Komma gilt weiter. Bis zur Nachlese der
 * Reviews #283/#284 stand dafür ein Sonderfall in html-resources.js: ein srcset, das mit
 * `data:` begann, war EINE Adresse. Damit fielen alle späteren Kandidaten aus der
 * CSP-Prüfung (`data:… 1w, /bilder/hero-800.webp 800w`).
 *
 * @param {string | null | undefined} wert
 * @returns {string[]}
 */
export function srcsetUrls(wert) {
  const s = String(wert ?? '');
  /** @type {string[]} */
  const urls = [];
  const leer = (/** @type {string} */ c) => c === ' ' || c === '\t' || c === '\n' || c === '\f' || c === '\r';
  let i = 0;
  while (i < s.length) {
    while (i < s.length && (leer(s[i]) || s[i] === ',')) i++;
    if (i >= s.length) break;
    const start = i;
    while (i < s.length && !leer(s[i])) i++;
    const roh = s.slice(start, i);
    if (roh.endsWith(',')) {
      const url = roh.replace(/,+$/, '');
      if (url) urls.push(url);
      continue; // keine Deskriptoren
    }
    // Deskriptoren bis zum nächsten Komma außerhalb von Klammern, je Token an Leerzeichen
    // außerhalb von Klammern getrennt.
    /** @type {string[]} */
    const deskriptoren = [];
    let token = '';
    let tiefe = 0;
    while (i < s.length) {
      const c = s[i++];
      if (c === ',' && tiefe === 0) break;
      if (leer(c) && tiefe === 0) {
        if (token) deskriptoren.push(token);
        token = '';
        continue;
      }
      if (c === '(') tiefe++;
      else if (c === ')') tiefe = Math.max(0, tiefe - 1);
      token += c;
    }
    if (token) deskriptoren.push(token);
    if (deskriptorenGueltig(deskriptoren)) urls.push(roh);
  }
  return urls;
}

/**
 * WHATWG „parse a srcset attribute", Schritt Deskriptoren: höchstens je ein `<Ganzzahl>w`,
 * `<Zahl>x`, `<Ganzzahl>h`; `w` und `x` nicht zusammen, `h` nur mit `w`. Alles andere ist
 * ein Fehler, und der Browser verwirft den Kandidaten.
 * @param {string[]} deskriptoren
 * @returns {boolean}
 */
function deskriptorenGueltig(deskriptoren) {
  let w = 0;
  let x = 0;
  let h = 0;
  for (const d of deskriptoren) {
    const zahl = d.slice(0, -1);
    const art = d.slice(-1);
    if (art === 'w' && /^\d+$/.test(zahl) && Number(zahl) > 0) w++;
    else if (art === 'h' && /^\d+$/.test(zahl) && Number(zahl) > 0) h++;
    else if (art === 'x' && /^-?(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(zahl) && Number(zahl) >= 0) x++;
    else return false;
  }
  return w <= 1 && x <= 1 && h <= 1 && !(w && x) && !(h && !w);
}
