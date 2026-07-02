/**
 * @cw/core – linkify-phones
 *
 * Wandelt deutsche Telefonnummern in Prosa-Text in klickbare `tel:`-Links um.
 *
 * WICHTIG: Das Ergebnis wird via `set:html` gerendert → Astros Auto-Escaping
 * entfällt. Deshalb escapt diese Util den kompletten Text ZUERST selbst
 * (die einzige Escaping-Instanz), bevor sie die Links einsetzt.
 *
 * Konservativ by design: matcht nur klare DE-Rufnummern-Muster
 * (`0160 91172381`, `+49 160 91172381`), damit Jahreszahlen (2019/2025),
 * PLZ (92444), HRB-Nummern (21336), Normen (DIN VDE 0100), Mengen
 * ("3 bis 6 Wochen", "0 % MwSt.", "10.200 €") NICHT fälschlich verlinkt werden.
 *
 * @example
 *   <div set:html={linkifyPhones(item.a)} />
 */

const HTML_ESCAPE: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

function escapeHtml(input: string): string {
  return input.replace(/[&<>"']/g, (char) => HTML_ESCAPE[char]);
}

/**
 * Muster: `+49 ` oder führende `0`, dann 2–4-stellige Vorwahl, EIN Leerzeichen,
 * dann 5–10-stellige Rufnummer. Nicht mitten in einer längeren Ziffernfolge
 * (Lookbehind/-ahead auf Ziffern).
 */
const PHONE_RE = /(?<!\d)(?:\+49[ ]|0)\d{2,4}[ ]\d{5,10}(?!\d)/g;

/** Normalisiert eine sichtbare Nummer auf einen `tel:`-tauglichen href (+49…). */
function toTelHref(visible: string): string {
  const digits = visible.replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) return digits;
  return '+49' + digits.replace(/^0/, '');
}

/**
 * @param text  Roher Prosa-Text (unescaped).
 * @returns     HTML-String (escaped) mit `tel:`-Links auf erkannte Rufnummern.
 */
export function linkifyPhones(text: string): string {
  if (!text) return '';
  const escaped = escapeHtml(text);
  return escaped.replace(PHONE_RE, (match) => {
    const href = toTelHref(match);
    // Plausibilitäts-Gate: echte DE-Rufnummern haben +49 + 9–12 Nutzziffern.
    const digitCount = href.replace(/\D/g, '').length;
    if (digitCount < 11 || digitCount > 14) return match;
    return `<a href="tel:${href}">${match}</a>`;
  });
}
