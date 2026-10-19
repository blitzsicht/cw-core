// @ts-check
/**
 * @cw/core – Plausible-Meldung nach dem Absenden eines Formulars
 *
 * Der contact-handler antwortet bei einem Honeypot-Treffer bewusst mit `200 {ok:true}`
 * (stiller Drop: der Bot soll nicht merken, dass er erkannt ist). Das Formular las
 * diese Antwort als Erfolg und meldete `Form Submit status=success` — jeder Bot, der
 * JavaScript ausführt, zählte so als Kontaktanfrage. Vorfall blitzsicht.com 06.–18.10.2026:
 * 4 von 4 „Anfragen" waren Honeypot-Treffer (blitzsicht-ops#968).
 *
 * Der Browser kennt die Honeypot-Felder schon vor dem Absenden. Er sendet weiter wie
 * bisher und zeigt weiter „Danke" — gemeldet wird dann aber `Form Bot` statt
 * `Form Submit`. Ein eigener Name statt nur eines anderen Status, weil das Plausible-
 * Ziel „Form Submit" (primäre Lead-Conversion) jeden Status mitzählt.
 * Gleiche Bedingung wie im Server (`contact-handler.js`: `body.botcheck || body.url_honey`).
 */

/**
 * Ist eines der beiden Honeypot-Felder belegt? `botcheck` ist eine Checkbox (angehakt →
 * `"on"`), `url_honey` ein Textfeld. Im Agent-Modus fehlt `botcheck` und `url_honey` ist
 * schreibgeschützt, bleibt also leer.
 * @param {{ get(name: string): unknown }} formData
 * @returns {boolean}
 */
export function honeypotGefuellt(formData) {
  return !!formData.get('botcheck') || !!formData.get('url_honey');
}

/**
 * Ereignis und Status für Plausible. Ein Bot meldet immer `Form Bot`, auch wenn der
 * Server ihn mit einem Fehler (z. B. 429) abweist — sonst landete er im Conversion-Ziel.
 * @param {boolean} antwortOk  Server/Web3Forms meldete `ok` bzw. `success`
 * @param {boolean} honeypot   Ergebnis von `honeypotGefuellt`
 * @returns {{ event: 'Form Submit' | 'Form Bot', status: 'success' | 'error' }}
 */
export function submitMeldung(antwortOk, honeypot) {
  return {
    event: honeypot ? 'Form Bot' : 'Form Submit',
    status: antwortOk ? 'success' : 'error',
  };
}
