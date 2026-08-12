// @ts-check
/**
 * @cw/core – utils/legal/aufsichtsbehoerde
 *
 * Die Datenschutz-Aufsichtsbehörde, auf die die Datenschutzerklärung hinweist
 * (Beschwerderecht nach Art. 77 DSGVO) — an EINER Stelle.
 *
 * ## Warum das eine eigene Datei ist (blitzsicht-ops#653)
 *
 * Die Angabe stand doppelt als Literal in den Prop-Defaults von
 * `DatenschutzBlock.astro` und `InformationspflichtBlock.astro` — und war bereits
 * auseinandergelaufen: eine Fassung trug Telefon und `mailto:`, die andere nicht.
 *
 * Teurer war die zweite Folge. `scripts/verify-touchpoints.mjs` prüft jede
 * `mailto:`-Href im gebauten HTML gegen das E-Mail-Set des Kunden aus
 * `site-data.ts`. Die Behördenadresse steht dort naturgemäss nicht — sie gehört
 * niemandem im Haus. Der Guard meldete also eine Adresse als Fremdkörper, die
 * **cw-core selbst** in die Seite schreibt. Gemessen am 12.08.2026: drei von
 * vier frisch ausgerollten Repos fielen mit exakt dieser Zeile
 * (zink-baeckerei, schiller-gartenbau, mika-elektrotechnik), und in den
 * committeten Quellen aller 23 Kunden-Repos kommt die Adresse **kein einziges
 * Mal** vor. Sie kann also gar nicht vom Kunden stammen.
 *
 * Seitdem lesen beide Komponenten und der Guard aus dieser Datei. Ändert jemand
 * die Behörde, folgt der Guard automatisch — es gibt nichts mehr nachzuziehen.
 *
 * ## Geltungsbereich der Allowlist
 *
 * Bewusst **nur die Adressen, die cw-core selbst ausliefert** — keine
 * abgeschriebene Liste aller 17 deutschen Aufsichtsbehörden. Eine Adresse, die
 * hier aus dem Gedächtnis landet und falsch ist, wäre schlimmer als keine: sie
 * stünde als „geprüft" in einem Guard, ohne je geprüft worden zu sein.
 *
 * Kunden ausserhalb Bayerns setzen ihre eigene Behörde über das Prop
 * `beschwerdeStelle` — und tragen deren Adresse in `allowExternalMailto` ihrer
 * `touchpoint-audit.config.json` ein. Dieser Weg existiert und ist dokumentiert
 * (`scripts/verify-touchpoints.mjs`, Kopfkommentar).
 *
 * @typedef {{ name: string, address: string, phone?: string, emailUrl?: string, url: string }} Beschwerdestelle
 */

/**
 * Voreinstellung: die für Bayern zuständige Aufsichtsbehörde.
 * Quelle der Angaben: https://www.lda.bayern.de (Impressum/Kontakt).
 *
 * @type {Readonly<Beschwerdestelle>}
 */
export const DEFAULT_BESCHWERDESTELLE = Object.freeze({
  name: 'Bayerisches Landesamt für Datenschutzaufsicht (BayLDA)',
  address: 'Promenade 27, 91522 Ansbach',
  phone: '+49 981 180093-0',
  emailUrl: 'mailto:poststelle@lda.bayern.de',
  url: 'https://www.lda.bayern.de',
});

/**
 * Die blossen E-Mail-Adressen aus den cw-core-Voreinstellungen, klein
 * geschrieben — für den Touchpoint-Audit.
 *
 * Abgeleitet statt abgeschrieben: wer oben die Behörde austauscht, ändert die
 * Allowlist mit. Ein zweites Literal wäre genau die Drift, die dieses Modul
 * abschaffen soll.
 *
 * @type {readonly string[]}
 */
export const AUFSICHTS_MAILTO_ALLOWLIST = Object.freeze(
  [DEFAULT_BESCHWERDESTELLE.emailUrl]
    .filter(/** @returns {v is string} */ (v) => typeof v === 'string' && v.startsWith('mailto:'))
    .map((v) => v.slice('mailto:'.length).split('?')[0].toLowerCase()),
);
