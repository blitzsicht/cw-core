// @ts-check
/**
 * @cw/core/integrations/ai-discovery/ai-label-check
 *
 * Trägt jede ausgelieferte Seite die Kennzeichnung für die kennzeichnungspflichtigen
 * Bilder, die auf ihr stehen? Art. 50 Abs. 4 UAbs. 1 AI Act verlangt die Offenlegung
 * dort, wo der Betrachter das Bild sieht — nicht im Repo und nicht in der Deklaration.
 *
 * ANLASS (03.09.2026). `customer-donau-profi` lieferte sechs Städtebilder aus, die als
 * `deepfake: 'ja'` deklariert waren, ohne jedes Label im DOM. Aufgefallen ist es durch
 * eine Handmessung, neun Tage nachdem eine andere Sitzung die Reparatur bereits
 * geschrieben — und nie gepusht — hatte. Kein Build hat in diesen neun Tagen etwas
 * gemeldet, weil es nichts gab, was hätte melden können.
 *
 * Dieselbe Handmessung ging zweimal daneben, und beide Fehler stehen hier als Test:
 *
 *   1. `grep -c 'ai-label'` zählte den **CSS-Block** mit, den Astro auf jede Seite
 *      bündelt. Die Startseite meldete einen Treffer, obwohl dort kein Label steht.
 *      Deshalb ist das Merkmal hier das Markup (`class="ai-label…"`), nie der
 *      Selektor.
 *   2. Ein zeilenweiser Regex auf `bild-herkunft.ts` fand bei siluri.de null Regeln —
 *      die Datei schreibt ihre Objekte mehrzeilig. Nicht geparst sah aus wie keine
 *      Pflicht. Deshalb meldet `leseHerkunftRegeln` einen Parserfehler, statt eine
 *      leere Liste zurückzugeben.
 *
 * Rechtstext: cw-recht → texte/eu/ai-act/ai-act.md, Abschnitt "## Artikel 50".
 * Bewertung:  cw-legal → 04-betroffenheit/D1-art50-ki-kennzeichnung.md.
 * Keine amtliche Fassung, keine Rechtsberatung.
 *
 * @typedef {{ herkunft: string, deepfake?: string|null, begruendung?: string, pathPrefix?: string, stem?: string }} Regel
 * @typedef {{ seite: string, bild: string }} Fundstelle
 * @typedef {{ pflichtig: string[], ungeklaert: string[], labels: number, fehlend: number }} SeitenBefund
 */

import { parseAttrs, extractCssUrls } from './html-resources.js';
import { resolveBildHerkunft, istKennzeichnungspflichtig } from '../../utils/bildherkunft.js';

/**
 * Bilder, die auf der Seite tatsächlich gerendert werden.
 *
 * Bewusst **nicht** `extractResources()`: das ist für die CSP gebaut und muss deshalb
 * auch `<style>`-Blöcke, `<link rel=icon>` und Preloads erfassen. Für diese Frage wäre
 * das falsch — Astro bündelt das CSS **jeder importierten** Komponente in die Seite,
 * auch wenn sie dort nie rendert. Ein `background-image` aus einem solchen Block wäre
 * eine Fundstelle ohne Betrachter, und die Pflicht knüpft am Betrachter an.
 *
 * Erfasst wird darum nur, was am Element hängt: `src`/`srcset` von `<img>` und
 * `<source>`, das `poster` eines `<video>`, und `url()` aus einem `style`-Attribut.
 * `<meta property="og:image">` bleibt außen vor — das generierte Vorschaubild trägt
 * sein Badge in den Pixeln (`src/og/ai-label.mjs`), ein DOM-Label gibt es dort nicht.
 *
 * @param {string} html
 * @returns {string[]} URLs in Reihenfolge des Vorkommens, Duplikate entfernt
 */
export function bilderAusHtml(html) {
  /** @type {string[]} */
  const out = [];
  const nimm = (/** @type {string|undefined} */ u) => {
    if (!u) return;
    const t = u.trim();
    if (!t || /^(#|data:|mailto:|tel:|javascript:|about:)/i.test(t)) return;
    if (!out.includes(t)) out.push(t);
  };

  const tagRe = /<([a-z][a-z0-9-]*)\b([^>]*)>/gi;
  /** @type {RegExpExecArray|null} */
  let t;
  while ((t = tagRe.exec(html))) {
    const tag = (t[1] ?? '').toLowerCase();
    const attrs = parseAttrs(t[2] ?? '');

    if (tag === 'img' || tag === 'source') {
      nimm(attrs.src);
      for (const u of (attrs.srcset || '').split(',')) nimm(u.trim().split(/\s+/)[0]);
    } else if (tag === 'video') {
      nimm(attrs.poster);
    }

    // Inline-Style hängt am Element und wird deshalb wirklich gezeigt — anders als ein
    // gebündelter <style>-Block.
    if (attrs.style) for (const r of extractCssUrls(attrs.style, '')) nimm(r.url);
  }
  return out;
}

/**
 * Wie viele Kennzeichnungen stehen im **Markup** dieser Seite?
 *
 * Das Merkmal ist `class="ai-label…"` — ein `class`-Attribut gibt es nur im Markup. Der
 * Selektor `.ai-label` im gebündelten CSS trifft damit nicht, und genau daran ist die
 * Handmessung vom 03.09.2026 gescheitert.
 *
 * Gezählt wird **immer der innere Baustein** (`class="ai-label …"`). Er ist die
 * Zähleinheit: `AiLabel` rendert ihn allein, `AiLabelAmBild` rendert ihn in einer
 * Positionierungshülle (`ai-label-am-bild`). Einmal je Kennzeichnung, in beiden Fällen.
 *
 * Die erste Fassung zählte die Hülle und fiel nur ersatzweise auf den inneren Baustein
 * zurück. Auf einer Seite, die beide Bauformen mischt, sah sie damit nur die Hüllen —
 * und meldete Lücken, die es nicht gibt. Die meisten Kunden benutzen `AiLabel` direkt;
 * nur donau-profi den neueren Baustein. Der Fehler wäre also fast überall aufgetreten.
 *
 * Der Selektor `.ai-label` im gebündelten CSS trifft nicht: ein `class`-Attribut gibt es
 * nur im Markup. Genau daran ist die Handmessung vom 03.09.2026 gescheitert.
 *
 * @param {string} html
 * @returns {number}
 */
export function zaehleLabels(html) {
  return (html.match(/class="ai-label[\s"]/g) || []).length;
}

/**
 * Eine Seite gegen die Deklaration halten.
 *
 * **Bekannte Grenze:** verglichen werden Zählwerte je Seite, nicht Label ↔ Bild. Drei
 * pflichtige Bilder und drei Labels gelten als erfüllt, auch wenn theoretisch das
 * falsche beschriftet wäre. Das findet jede heutige Lücke; die Zuordnung wäre eine
 * DOM-Analyse und ist bewusst nicht Teil dieser Fassung. Es steht hier, damit es
 * niemand für mehr hält, als es ist.
 *
 * @param {string} html
 * @param {Regel[]} regeln aus `leseHerkunftRegeln`
 * @param {{ eigenerHost?: string }} [opt] `eigenerHost` trennt eigene absolute URLs von
 *   fremden. Ohne die Angabe gilt jede absolute URL als eigene und wird geprüft — das
 *   ist die konservative Richtung: lieber eine Zeile zu viel als eine Pflicht übersehen.
 * @returns {SeitenBefund}
 */
export function pruefeSeiteAufKennzeichnung(html, regeln, opt = {}) {
  const data = { bildHerkunft: regeln };
  /** @type {string[]} */
  const pflichtig = [];
  /** @type {string[]} */
  const ungeklaert = [];

  /** @type {Set<string>} */
  const gesehen = new Set();

  for (const u of bilderAusHtml(html)) {
    if (istWerkzeugbild(u, opt.eigenerHost)) continue;
    // Ein `srcset` liefert dasselbe Motiv in mehreren Breiten und Formaten
    // (`/_astro/hero.CC6UVEsO_1ICG0w.avif`, `…_ZXkuIg.webp`, …). Das ist EINE Bildfläche
    // und braucht EIN Label — ungezählt gemeldet ergäbe ein Hero mit sechs Varianten
    // sechs „fehlende" Kennzeichnungen. Beim ersten Flottenlauf am 03.09.2026 kam so
    // für steller und mika je 6 statt 1 heraus.
    const schluessel = motivSchluessel(pfadOhneHost(u));
    if (gesehen.has(schluessel)) continue;
    gesehen.add(schluessel);

    const e = resolveBildHerkunft(data, pfadOhneHost(u));
    if (istKennzeichnungspflichtig(e)) pflichtig.push(u);
    // `problem === null` heisst laut bildherkunft.js: es ist nichts zu tun. Alles
    // andere ist ein eigener Befund und darf nicht als „nicht pflichtig" durchgehen.
    // Eine Regel mit `deepfake: 'ja'` OHNE Begründung faellt hier herein — sie ist
    // ungueltig und damit unsichtbar fuer die Pflichtpruefung. Wer das nicht meldet,
    // baut einen Waechter, der bei kaputter Deklaration schweigt.
    else if (e.problem) ungeklaert.push(u);
  }

  const labels = zaehleLabels(html);
  return { pflichtig, ungeklaert, labels, fehlend: Math.max(0, pflichtig.length - labels) };
}

/**
 * Schlüssel, unter dem zwei URLs dasselbe Motiv meinen: Verzeichnis plus Dateiname bis
 * zum ersten Punkt. Damit fallen die Varianten der Astro-Assetpipeline zusammen, die
 * sich nur im Content-Hash und im Format unterscheiden.
 *
 * Verzeichnis bewusst mit drin: `resolveBildHerkunft` löst über den blossen Stem auf,
 * was für die Zuordnung einer Regel richtig ist — zum Zählen wäre es zu grob, weil
 * `/a/hero.webp` und `/b/hero.webp` zwei Motive sind.
 *
 * @param {string} pfad
 * @returns {string}
 */
function motivSchluessel(pfad) {
  const teile = pfad.split('/');
  const datei = (teile.pop() ?? '').split('.')[0];
  return `${teile.join('/')}/${datei}`;
}

/**
 * Bilder, die nicht Gegenstand der Deklaration sein können.
 *
 * Zwei Sorten, beide beim ersten Sweep als „ungeklärt" aufgeschlagen und beide
 * Rauschen: das EU-Badge selbst (es IST die Kennzeichnung, kein Motiv) und Bilder
 * fremder Hosts. Letztere kann eine pfadbasierte Deklaration gar nicht erfassen — bei
 * donau-profi sind es die Status-Badges von `status.blitzsicht.com`.
 *
 * **Das ist keine Aussage darüber, dass Fremdbilder unbedenklich wären.** Ein von
 * anderswo eingebundenes KI-Bild löst dieselbe Pflicht aus; es ist nur mit diesem
 * Werkzeug nicht entscheidbar, und eine Zeile, die bei jedem Lauf erscheint, ohne je
 * eine Handlung auszulösen, macht die echten Fälle unsichtbar.
 *
 * @param {string} u
 * @param {string} [eigenerHost]
 * @returns {boolean}
 */
function istWerkzeugbild(u, eigenerHost) {
  if (/\/ai-(generated|modified)-(black|white)/.test(u)) return true;
  // SVG: Logos, Icons, Diagramme. Art. 3 Nr. 60 verlangt, dass der Inhalt wirklichen
  // Personen oder Orten ÄHNELT und als echt erschiene — eine Vektorgrafik tut das nicht.
  // `heroFoto()` in og-pages.js zieht dieselbe Grenze. Ohne sie besteht der
  // ungeklaert-Wert fast nur aus Logos: bei blitzsicht 83 Zeilen, davon 82 Vektorlogos.
  if (/\.svg(\?|#|$)/i.test(u)) return true;
  const m = /^[a-z][a-z0-9+.-]*:\/\/([^/]+)/i.exec(u);
  if (!m) return false;
  // Ohne bekannte eigene Domain nicht raten: die absolute URL wird geprüft.
  if (!eigenerHost) return false;
  return m[1].toLowerCase().replace(/^www\./, '') !== eigenerHost.toLowerCase().replace(/^www\./, '');
}

/**
 * Host und Query von einer URL abziehen — `resolveBildHerkunft` erwartet einen
 * dist-relativen Pfad. Absolute Fremd-URLs (anderer Host) sind keine eigenen Bilder und
 * fallen über die fehlende Deklaration ohnehin heraus.
 * @param {string} u
 * @returns {string}
 */
function pfadOhneHost(u) {
  return u.replace(/^[a-z][a-z0-9+.-]*:\/\/[^/]+/i, '').split(/[?#]/)[0];
}

/**
 * Regeln aus dem Quelltext einer `bild-herkunft.ts` lesen.
 *
 * Zwei Schreibweisen sind in der Flotte im Umlauf: einzeilige Objekte (erzeugt von
 * `scripts/bildherkunft-uebernehmen.mjs`) und mehrzeilige (siluri.de, von Hand
 * gepflegt). Ein zeilenweiser Regex sieht nur die erste Sorte — deshalb wird hier über
 * Klammerbalance zerlegt.
 *
 * @param {string} quelltext
 * @returns {{ regeln: Regel[], problem: string|null }}
 */
export function leseHerkunftRegeln(quelltext) {
  // Gesucht ist die DEKLARATION, nicht jede Erwähnung des Namens: `customer-preshot`
  // nennt `bildHerkunft` in einem Kopfkommentar und definiert den Regeltyp lokal in
  // derselben Datei. Ein Suchbegriff ohne `const` traf den Kommentar, lief von dort auf
  // das nächste `=` im Interface und zerlegte anschließend eine Typdefinition — Ergebnis:
  // null Regeln bei einer Datei mit vier deklarierten Bildern.
  //
  // Und das `[` NACH dem Gleichheitszeichen: wer beim Bezeichner zu suchen anfängt,
  // greift die Klammer im Typ (`BildHerkunftRegel[]`) und zerlegt ins Leere.
  const gleich = quelltext.search(/\b(?:const|let|var)\s+bildHerkunft\b[^=]*=/);
  const start = gleich === -1 ? -1 : quelltext.indexOf('[', quelltext.indexOf('=', gleich));
  /** @type {Regel[]} */
  const regeln = [];

  if (start > 0) {
    let tiefe = 0;
    let von = -1;
    for (let i = start; i < quelltext.length; i++) {
      const c = quelltext[i];
      if (c === '{') {
        if (tiefe === 0) von = i;
        tiefe++;
      } else if (c === '}') {
        tiefe--;
        if (tiefe === 0 && von > -1) {
          const regel = leseObjekt(quelltext.slice(von, i + 1));
          if (regel) regeln.push(regel);
          von = -1;
        }
      } else if (c === ']' && tiefe === 0) {
        break;
      }
    }
  }

  // Eine Datei, die `deepfake` schreibt, aber aus der nichts fällt, ist ein
  // Parserfehler — kein leeres Ergebnis. Ohne diese Zeile hätte die Messung vom
  // 03.09.2026 für siluri.de weiterhin „0 pflichtige Bilder" gemeldet statt 66.
  const problem =
    regeln.length === 0 && /\bdeepfake\s*:/.test(quelltext)
      ? 'Quelltext enthält deepfake-Angaben, aber es konnte keine Regel gelesen werden — Format geändert?'
      : null;

  return { regeln, problem };
}

/**
 * Felder eines einzelnen Regel-Objekts.
 *
 * **`begruendung` gehört dazu, auch wenn sie wie Beiwerk aussieht.** Eine Regel mit
 * `deepfake: 'ja'` ohne Begründung erklärt `resolveBildHerkunft` für ungültig — das Bild
 * fiele dann auf `ungeklaert` und begründete keine Pflicht mehr. Ein Parser, der sie
 * wegwirft, macht also aus jeder pflichtigen Fundstelle eine ungeklärte. Genau das ist
 * beim ersten Sweep am 03.09.2026 passiert: donau-profi meldete „0 pflichtige Bilder"
 * auf Seiten, die sechs davon tragen.
 *
 * @param {string} text
 * @returns {Regel|null}
 */
function leseObjekt(text) {
  const feld = (/** @type {string} */ name) => {
    const m = new RegExp(`\\b${name}\\s*:\\s*'((?:[^'\\\\]|\\\\.)*)'`).exec(text);
    return m ? m[1].replace(/\\'/g, "'").replace(/\\\\/g, '\\') : undefined;
  };
  const herkunft = feld('herkunft');
  if (!herkunft) return null;
  const pathPrefix = feld('pathPrefix');
  const stem = feld('stem');
  if (!pathPrefix && !stem) return null;
  const begruendung = feld('begruendung');
  return {
    herkunft,
    deepfake: feld('deepfake') ?? null,
    ...(begruendung ? { begruendung } : {}),
    ...(pathPrefix ? { pathPrefix } : {}),
    ...(stem ? { stem } : {}),
  };
}

/**
 * Alle Seiten eines Builds prüfen.
 * @param {{ seite: string, html: string }[]} seiten
 * @param {Regel[]} regeln
 * @param {{ eigenerHost?: string }} [opt]
 * @returns {Fundstelle[]} je fehlender Kennzeichnung ein Eintrag
 */
export function checkAiLabels(seiten, regeln, opt = {}) {
  /** @type {Fundstelle[]} */
  const out = [];
  for (const { seite, html } of seiten) {
    const b = pruefeSeiteAufKennzeichnung(html, regeln, opt);
    // Welche Bilder fehlen, ist bei einem Zählvergleich nicht entscheidbar — gemeldet
    // werden deshalb die letzten n der pflichtigen, damit die Meldung Namen trägt
    // statt nur eine Zahl.
    for (const bild of b.pflichtig.slice(b.pflichtig.length - b.fehlend)) out.push({ seite, bild });
  }
  return out;
}
