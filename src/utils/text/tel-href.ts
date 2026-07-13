/**
 * @cw/core – tel-href.ts
 *
 * Normalisiert eine Anzeige-Telefonnummer zu einem internationalen `tel:`-href-Wert.
 * Führende `0` wird zur deutschen Vorwahl `+49`; ein bereits vorhandenes `+` bleibt erhalten.
 * Alle Nicht-Ziffern (Leerzeichen, Klammern, Bindestriche) werden entfernt.
 *
 * Zweck: Anzeige-Nummer und `tel:`-Link entkoppeln — die Website darf „0160 91172381"
 * anzeigen, während der Link konsistent `+4916091172381` bleibt (international wählbar,
 * gleiches Verhalten an allen Call-Sites).
 *
 * @example phoneToTelHref('0160 91172381')     // '+4916091172381'
 * @example phoneToTelHref('+49 160 91172381')  // '+4916091172381'
 * @example phoneToTelHref('49 160 91172381')   // '+4916091172381' (49 ohne + = Ländercode)
 * @example phoneToTelHref(undefined)           // ''
 */
export function phoneToTelHref(phone?: string): string {
  if (!phone) return '';
  const d = phone.replace(/[^\d+]/g, '');
  if (d.startsWith('+')) return d;
  if (d.startsWith('49')) return '+' + d; // Ländercode ohne + → nicht erneut +49 voranstellen
  if (d.startsWith('0')) return '+49' + d.slice(1); // nationale 0 → +49
  return '+49' + d;
}
