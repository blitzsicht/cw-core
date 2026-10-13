// @ts-check
/**
 * Die eine gewollte Text-Änderung aus v0.172.0 (blitzsicht-ops#950): ContactForm
 * (formType 'contact') und DankePage nennen ohne `antwortfrist` keine 24-h-Frist mehr.
 *
 * Wie `_fehlerblock-v0167.js`: die alten Schnappschüsse bleiben die Gegenprobe. Neu zu
 * erzeugen hieße, sie zu entwerten. Stattdessen wird genau dieser Satz im alten
 * Schnappschuss ersetzt — alles andere muss weiter Zeichen für Zeichen gleich sein. Steht
 * der alte Satz nicht genau einmal darin, wirft die Funktion.
 */
export const ALT_SATZ = 'Wir melden uns innerhalb von 24 Stunden bei Ihnen.';
export const NEU_SATZ = 'Ihre Anfrage ist angekommen. Wir melden uns so bald wie möglich bei Ihnen.';

/** @param {string} html */
export function mitAntwortfristV0172(html) {
  const n = html.split(ALT_SATZ).length - 1;
  if (n !== 1) throw new Error(`24-h-Satz ${n}× statt 1× im Schnappschuss`);
  return html.replace(ALT_SATZ, NEU_SATZ);
}
