// @ts-check
/**
 * @cw/core – wa-href.js
 *
 * Baut aus einer Telefonnummer einen WhatsApp-Link `https://wa.me/<ziffern>[?text=…]`.
 * Schwester von `tel-href.ts`; als JS + .d.ts, damit `node --test` und Build-Skripte es
 * ohne TypeScript-Lader laden können.
 *
 * wa.me verlangt die Nummer international, nur Ziffern, ohne `+` und ohne führende Nullen.
 * Normalisierung:
 *   - „(0)“ in „+49 (0) 151 …“ fällt weg (die Null wird international nicht gewählt),
 *   - alles außer Ziffern fällt weg (`+`, Leerzeichen, Klammern, `/`, `-`),
 *   - `00` am Anfang ist die internationale Wählvorwahl → weg,
 *   - eine einzelne `0` am Anfang ist die nationale Vorwahl → deutsche Ländervorwahl `49`.
 *
 * ANLASS (Lead-Rakete-Audit 26.09.2026): StickyContact und Footer bauten den Link je für
 * sich mit `replace(/\D/g, '')`. Aus „0151 2345678“ wurde `wa.me/01512345678` — ein Link,
 * den WhatsApp als ungültige Nummer ablehnt. In der Flotte stand zu dem Zeitpunkt keine
 * nationale Nummer (alle mit Ländervorwahl), der Fehler war also latent.
 *
 * @example waHref('+49 151 27184818')                 // 'https://wa.me/4915127184818'
 * @example waHref('0151 2345678')                     // 'https://wa.me/491512345678'
 * @example waHref('+39 345 997 3997', 'Hallo Markus') // 'https://wa.me/393459973997?text=Hallo%20Markus'
 */

/** Weniger Ziffern kann keine erreichbare Mobilnummer haben — dann ist die Eingabe Unsinn. */
const MIN_ZIFFERN = 6;

/**
 * @param {string} nummer Telefonnummer in beliebiger Schreibweise.
 * @param {string} [text] Vorbefüllte Nachricht; leer oder fehlend → kein `?text=`.
 * @returns {string}
 */
export function waHref(nummer, text) {
  const roh = typeof nummer === 'string' ? nummer : '';
  const ziffern = roh.replace(/\(\s*0\s*\)/g, '').replace(/\D/g, '');
  if (ziffern.length < MIN_ZIFFERN) {
    throw new Error(
      `waHref: „${roh}“ ist keine gültige WhatsApp-Nummer — mindestens ${MIN_ZIFFERN} Ziffern nötig, ` +
        `am besten international wie „+49 151 2345678“.`,
    );
  }
  let international = ziffern;
  if (international.startsWith('00')) international = international.slice(2);
  else if (international.startsWith('0')) international = '49' + international.slice(1);
  const basis = `https://wa.me/${international}`;
  return text ? `${basis}?text=${encodeURIComponent(text)}` : basis;
}
