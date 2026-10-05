// @ts-check
/**
 * Die eine gewollte Markup-Änderung aus v0.167.0 (blitzsicht-ops#915/#916): der Fehlerblock
 * von ContactForm bekommt `role="alert"` und einen leeren Absatz für die Servermeldung.
 *
 * Die Gegenproben vergleichen gegen Schnappschüsse älterer Stände (`fixtures/`). Sie neu zu
 * erzeugen hieße, die Gegenprobe zu entwerten. Stattdessen wird genau diese Änderung auf den
 * alten Schnappschuss angewandt — alles andere muss weiter Zeichen für Zeichen gleich sein.
 * Kommt das alte Muster nicht genau einmal vor, wirft die Funktion: dann passt der
 * Schnappschuss nicht mehr zu der Annahme, und das soll laut auffallen.
 */
const ALT = '<div class="form-error" hidden><p>';
const NEU = '<div class="form-error" hidden role="alert"><p class="form-error-detail" hidden></p><p>';

/** @param {string} html */
export function mitFehlerblockV0167(html) {
  const n = html.split(ALT).length - 1;
  if (n !== 1) throw new Error(`Fehlerblock-Muster ${n}× statt 1× im Schnappschuss`);
  return html.replace(ALT, NEU);
}
