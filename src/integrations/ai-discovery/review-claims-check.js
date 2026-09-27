// @ts-check
/**
 * @cw/core/integrations/ai-discovery/review-claims-check
 *
 * Bewertungs-Aussagen-Guard: findet im gebauten HTML Formulierungen und Markup rund um
 * Kundenbewertungen, die wettbewerbs- oder Google-rechtlich nicht tragen. Pure
 * String-Logik pro Seiten-HTML — der Directory-Walk passiert im Aufrufer (index.ts),
 * gleicher Split wie embed-consent-check.js.
 *
 * Auslöser (26.09.2026): donau-profi zeigte „★ 4,8 · 24 Google-Bewertungen“ und
 * „Echte Google-Rezensionen unserer Kundinnen und Kunden.“ — ohne Prüfhinweis nach
 * § 5b Abs. 3 UWG und mit einer Echtheits-Aussage, die UWG Anhang Nr. 23b als stets
 * unlauter einstuft, wenn keine angemessenen Prüfschritte dahinterstehen. Dazu gab
 * `Testimonials.astro` bis dahin auf JEDER Kundenseite Product-/AggregateRating-
 * Microdata aus: selbst erteiltes Bewertungs-Markup für den eigenen Betrieb.
 *
 * Drei Befunde:
 *   (a) `unverified_genuine_claim` — „echte/verifizierte/geprüfte/authentische“ direkt
 *       vor „Bewertung/Rezension/Kundenstimme“ (höchstens ein Wort dazwischen) oder
 *       „Bewertungen sind … echt“, ohne dass im selben Abschnitt eine POSITIVE
 *       Prüfbeschreibung steht („Wir prüfen jede Bewertung …“). „Wir prüfen nicht, ob …“
 *       rechtfertigt „echte“ ausdrücklich nicht.
 *   (b) `missing_review_disclaimer` — ein Google-Aggregat („24 Google-Bewertungen“,
 *       „Bewertungen auf Google“) mit einer Sternezahl wie „4,8“ höchstens 80 Zeichen
 *       daneben im selben Textblock, aber nirgends auf der Seite ein Prüfhinweis, der sich
 *       auf Bewertungen bezieht (positiv oder negativ, s. utils/pruefhinweis.js).
 *   (c) `self_serving_aggregate_rating` — AggregateRating (JSON-LD oder Microdata) für
 *       einen LocalBusiness/Organization-Knoten, oder irgendein AggregateRating auf
 *       einer Seite, deren JSON-LD nur einen Betrieb beschreibt und kein eigenes
 *       Produkt (der alte Testimonials-Default: Product-Microdata auf LocalBusiness-Seite).
 *
 * GRENZEN — bewusst einfach, soft-warn:
 *   - „Abschnitt“ = Text zwischen zwei `<section>`/`<article>`/`<header>`/`<footer>`/
 *     `<aside>`/`<main>`-Grenzen. Steht die Prüfbeschreibung in einem Tooltip, einer
 *     Fußnote außerhalb oder auf einer Unterseite, meldet (a) trotzdem.
 *   - (a) erkennt nur die enge Nachbarschaft Adjektiv–Bewertungswort. „Echte Stimmen
 *     unserer Kunden“ (ohne Bewertungswort) fällt durch, ebenso englisch „Reviews“ —
 *     das ist bewusst ausgenommen, weil es auf deutschen Seiten fast immer Code- oder
 *     Screenshot-Reviews meint. Verneinung („keine echten“, „ohne echte“) wird nur
 *     unmittelbar vor dem Adjektiv erkannt.
 *   - (b) meldet nur ein AGGREGAT (Anzahl + „Google-Bewertungen“ oder „Bewertungen auf
 *     Google“). „Google-Bewertung: 4,9 ★“ ohne Anzahl fällt durch — sonst meldete der
 *     Guard jeden Ratgeber-Artikel, der eine Beispielbewertung zitiert (gemessen am
 *     26.09.2026 über 526 gebaute Seiten aus 25 Kundenrepos). Der Prüfhinweis darf
 *     irgendwo auf der Seite stehen, muss sich aber auf Bewertungen beziehen.
 *   - Abschnitts- und Blockgrenzen kommen aus den HTML-Tags; per CSS versteckter Text
 *     zählt wie sichtbarer.
 *   - (c) erkennt LocalBusiness-Untertypen über eine Namensliste plus Endungen
 *     (…Business, …Store, …Organization, …Agency …). Exotische Untertypen fallen
 *     durch. Ob ein Product-Rating „echt“ ist, kann der Guard nicht wissen — eine
 *     Seite mit Product-JSON-LD gilt als Produktseite und wird nicht gemeldet.
 *
 * @typedef {'unverified_genuine_claim'|'missing_review_disclaimer'|'self_serving_aggregate_rating'} ReviewClaimIssueType
 * @typedef {{ type: ReviewClaimIssueType, details: string }} ReviewClaimIssue
 */

import { hatPruefhinweis, hatPruefbeschreibung } from '../../utils/pruefhinweis.js';

const A = '(?<![\\p{L}\\p{N}])';
const E = '(?![\\p{L}\\p{N}])';

/**
 * Echtheits-Adjektiv, flektiert. „Echtzeit“ scheitert an der Wortgrenze. Verneint
 * („keine echten Bewertungen“, „ohne echte …“) zählt nicht — gefunden auf blitzsicht.com,
 * wo ein Ratgeber genau davor warnt.
 */
const ECHT =
  '(?<!(?:ohne|kein|keine|keinen|keiner|nicht|statt)\\s+)' +
  `${A}(?:echt|verifiziert|geprüft|authentisch|überprüft)(?:e|en|er|es|em)?${E}`;
/**
 * Bewertungs-Wort, auch als Kompositum („Kundenbewertungen“, „Google-Rezension“).
 * Bewusst OHNE „Review“: auf deutschen Seiten meint es fast immer Code- oder
 * Screenshot-Reviews (blitzsicht.com: „… auf Desktop geprüft … Screenshot-Review“).
 */
const BEWERTUNG = '(?:bewertung|rezension|kundenstimme|kundenmeinung|erfahrungsbericht)';

/**
 * Adjektiv direkt vor dem Bewertungswort, höchstens EIN Wort dazwischen:
 * „Echte Google-Rezensionen“, „verifizierte Kundenbewertungen“, „echte 5-Sterne-Bewertungen“.
 * Nicht: „echte Fotos und Bewertungen“ — da gehört das Adjektiv zu den Fotos.
 */
const CLAIM_VOR_RE = new RegExp(`${ECHT}[ \\t]+(?:[^\\s.!?]+[ \\t]+)?[^\\s.!?]*${BEWERTUNG}`, 'iu');
/** Gegenrichtung: „Unsere Bewertungen sind (alle / zu 100 %) echt.“ */
const CLAIM_NACH_RE = new RegExp(
  `${BEWERTUNG}\\p{L}*[ \\t]+(?:sind|ist|werden|wurden)[ \\t]+(?:[^\\s.!?]+[ \\t]+){0,3}?${ECHT}`,
  'iu',
);

/**
 * Wiedergegebenes Google-AGGREGAT: eine Anzahl vor „Google-Bewertungen/-Rezensionen“
 * („24 Google-Bewertungen“) oder „Bewertungen auf/bei Google“. Ein einzelnes Erwähnen
 * („eine ehrliche Google-Bewertung („★ 4,9“)“ im Ratgeber auf blitzsicht.com) ist kein
 * Aggregat und löst nichts aus.
 */
const GOOGLE_AGGREGAT_RE =
  /\d[\d.]*[ \t ]+Google[ \t -]*(?:Bewertungen|Rezensionen)|(?:Bewertungen|Rezensionen)[ \t ]+(?:auf|bei|von)[ \t ]+Google/gi;
/** Sternezahl im deutschen Format: 1,0–5,9 — nicht Teil einer längeren Zahl wie 4,50 €. */
const STERNEZAHL_RE = /(?<![\d,.])[1-5],\d(?![\d])/;
/** Wie weit Sternezahl und Aggregat auseinander stehen dürfen (Zeichen, im selben Block). */
const NAEHE = 80;

/**
 * Block-Elemente trennen Text wie ein Satzende. Ohne diese Grenze liefen Überschrift und
 * Absatz ineinander („… auf Desktop geprüft Am Ende von Tag 2 …“).
 */
const BLOCK_TAG_RE =
  /<\/?(?:p|div|h[1-6]|li|ul|ol|dt|dd|td|th|tr|blockquote|figcaption|br|hr|section|article|header|footer|aside|main|nav)\b[^>]*>/gi;

/** Grenzen, an denen ein neuer Abschnitt beginnt. */
const ABSCHNITT_SPLIT_RE = /<(?:section|article|header|footer|aside|main)\b[^>]*>|<\/(?:section|article|header|footer|aside|main)\s*>/gi;

/** LocalBusiness/Organization und die im Fleet genutzten Untertypen. */
const BETRIEB_TYPEN = new Set([
  'localbusiness', 'organization', 'organisation', 'corporation', 'ngo', 'professionalservice',
  'legalservice', 'financialservice', 'accountingservice', 'emergencyservice', 'electrician',
  'plumber', 'locksmith', 'housepainter', 'roofingcontractor', 'generalcontractor',
  'hvacbusiness', 'movingcompany', 'dentist', 'physician', 'attorney', 'notary', 'hotel',
  'motel', 'hostel', 'bedandbreakfast', 'vacationrental', 'florist', 'bakery', 'brewery',
  'winery', 'restaurant', 'cafeorcoffeeshop', 'barorpub', 'exercisegym', 'sportsclub',
  'hairsalon', 'beautysalon', 'dayspa', 'nailsalon', 'realestateagent', 'travelagency',
  'insuranceagency', 'employmentagency', 'autorepair', 'autodealer', 'optician', 'pharmacy',
  'veterinarycare', 'childcare', 'dryCleaningOrLaundry'.toLowerCase(), 'selfstorage',
]);
/** Endungen, die fast immer einen Betrieb bezeichnen. „Service“ allein NICHT — das ist schema.org/Service. */
const BETRIEB_ENDUNG_RE = /(?:business|store|organization|organisation|club|agency|contractor|establishment|salon|clinic|office)$/i;

/** Typen, für die selbst veröffentlichte Bewertungen zulässig sein können (eigene Produkte). */
const PRODUKT_TYPEN = new Set([
  'product', 'service', 'softwareapplication', 'webapplication', 'mobileapplication', 'course',
  'event', 'book', 'recipe', 'movie', 'creativework', 'howto', 'game', 'videogame', 'offer',
]);

/** Typnamen in Originalschreibweise, ohne schema.org-Präfix. @param {unknown} t */
function typNamen(t) {
  if (!t) return [];
  const arr = Array.isArray(t) ? t : [t];
  return arr
    .filter((x) => typeof x === 'string')
    .map((x) => /** @type {string} */ (x).replace(/^https?:\/\/schema\.org\//i, ''));
}

/** Dasselbe, kleingeschrieben — für die Vergleiche. @param {unknown} t */
const typListe = (t) => typNamen(t).map((x) => x.toLowerCase());

/** @param {string[]} typen */
const istBetrieb = (typen) => typen.some((t) => BETRIEB_TYPEN.has(t) || BETRIEB_ENDUNG_RE.test(t));
/** @param {string[]} typen */
const istProdukt = (typen) => typen.some((t) => PRODUKT_TYPEN.has(t));

/**
 * Sichtbarer Text: ohne script/style/noscript, Blockgrenzen als Zeilenumbruch, übrige
 * Tags als Leerzeichen, Entities grob aufgelöst.
 * @param {string} html
 */
function sichtbarerText(html) {
  return html
    .replace(/<(script|style|noscript|template)\b[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(BLOCK_TAG_RE, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/[^\S\n]+/g, ' ')
    .replace(/ *\n\s*/g, '\n')
    .trim();
}

/**
 * Sternezahl, die im selben Textblock höchstens NAEHE Zeichen neben einem Google-Aggregat
 * steht — oder `null`.
 * @param {string} text
 * @returns {string | null}
 */
function googleAggregatMitSternen(text) {
  for (const block of text.split('\n')) {
    GOOGLE_AGGREGAT_RE.lastIndex = 0;
    let m;
    while ((m = GOOGLE_AGGREGAT_RE.exec(block))) {
      const umfeld = block.slice(Math.max(0, m.index - NAEHE), m.index + m[0].length + NAEHE);
      const z = STERNEZAHL_RE.exec(umfeld);
      if (z) return z[0];
    }
  }
  return null;
}

/** Alle JSON-LD-Blöcke als Objekte; kaputtes JSON wird übersprungen (meldet der Schema-Linter). @param {string} html */
function jsonLdBloecke(html) {
  /** @type {unknown[]} */
  const out = [];
  const re = /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script\s*>/gi;
  let m;
  while ((m = re.exec(html))) {
    try {
      out.push(JSON.parse(m[1]));
    } catch {
      /* ungültiges JSON — nicht Sache dieses Guards */
    }
  }
  return out;
}

/**
 * Oberste Knoten (inkl. @graph) — sie bestimmen, WORUM es auf der Seite geht.
 * @param {unknown[]} bloecke
 * @returns {Record<string, unknown>[]}
 */
function obersteKnoten(bloecke) {
  /** @type {Record<string, unknown>[]} */
  const out = [];
  for (const b of bloecke) {
    for (const k of Array.isArray(b) ? b : [b]) {
      if (!k || typeof k !== 'object') continue;
      const obj = /** @type {Record<string, unknown>} */ (k);
      if (Array.isArray(obj['@graph'])) {
        for (const g of obj['@graph']) if (g && typeof g === 'object') out.push(/** @type {Record<string, unknown>} */ (g));
      } else {
        out.push(obj);
      }
    }
  }
  return out;
}

/**
 * Alle Knoten rekursiv, jeweils mit ihren Typen.
 * @param {unknown} node
 * @param {(n: Record<string, unknown>) => void} fn
 */
function besuche(node, fn) {
  if (Array.isArray(node)) {
    for (const x of node) besuche(x, fn);
    return;
  }
  if (!node || typeof node !== 'object') return;
  const obj = /** @type {Record<string, unknown>} */ (node);
  fn(obj);
  for (const v of Object.values(obj)) besuche(v, fn);
}

/**
 * (c) im JSON-LD. Liefert die Typnamen der betroffenen Knoten und ob überhaupt ein
 * AggregateRating vorkommt.
 * @param {unknown[]} bloecke
 */
function jsonLdRatings(bloecke) {
  /** @type {string[]} */
  const betroffen = [];
  let irgendeins = false;
  for (const b of bloecke) {
    besuche(b, (n) => {
      const typen = typListe(n['@type']);
      if (n.aggregateRating) {
        irgendeins = true;
        if (istBetrieb(typen)) betroffen.push(typNamen(n['@type']).join('/'));
      }
      if (typen.includes('aggregaterating')) {
        irgendeins = true;
        const reviewed = n.itemReviewed;
        if (reviewed && typeof reviewed === 'object' && istBetrieb(typListe(/** @type {any} */ (reviewed)['@type']))) {
          betroffen.push(typNamen(/** @type {any} */ (reviewed)['@type']).join('/'));
        }
      }
    });
  }
  return { betroffen, irgendeins };
}

/**
 * (c) in Microdata: `itemprop="aggregateRating"` und der Typ des umgebenden itemscope.
 * Grob: der nächstliegende vorangehende `itemtype` gilt als Eltern-Typ — reicht für die
 * flache Struktur der Blöcke, nicht für beliebig verschachteltes Markup.
 * @param {string} html
 * @returns {{ elternTyp: string }[]}
 */
function microdataRatings(html) {
  /** @type {{ elternTyp: string }[]} */
  const out = [];
  const re = /itemprop\s*=\s*["'][^"']*\baggregateRating\b[^"']*["']/gi;
  let m;
  while ((m = re.exec(html))) {
    const davor = html.slice(0, m.index);
    const typen = [...davor.matchAll(/itemtype\s*=\s*["']https?:\/\/schema\.org\/([A-Za-z]+)["']/gi)];
    out.push({ elternTyp: typen.length ? typen[typen.length - 1][1] : '' });
  }
  return out;
}

/**
 * Prüft eine gebaute Seite auf unzulässige Bewertungs-Aussagen und -Markup.
 *
 * @param {string} html  Fertiges HTML einer gebauten Seite.
 * @param {string} [pagePath] Nur für die Meldung.
 * @returns {ReviewClaimIssue[]}
 */
export function checkReviewClaims(html, pagePath = '') {
  /** @type {ReviewClaimIssue[]} */
  const issues = [];
  if (!html) return issues;
  const where = pagePath || 'Seite';

  // (a) Echtheits-Aussage ohne Prüfbeschreibung im selben Abschnitt
  const abschnitte = html.split(ABSCHNITT_SPLIT_RE);
  for (const roh of abschnitte) {
    const text = sichtbarerText(roh);
    if (!text) continue;
    const treffer = CLAIM_VOR_RE.exec(text) ?? CLAIM_NACH_RE.exec(text);
    if (!treffer) continue;
    if (hatPruefbeschreibung(text)) continue;
    const start = Math.max(0, treffer.index - 20);
    const zitat = text.slice(start, treffer.index + treffer[0].length + 30).replace(/\s+/g, ' ').trim();
    issues.push({
      type: 'unverified_genuine_claim',
      details:
        `${where}: „…${zitat}…“ — Echtheits-Aussage über Bewertungen ohne Beschreibung, wie geprüft wird ` +
        '(UWG Anhang Nr. 23b). Wort streichen, z. B. „Aus unserem Google-Unternehmensprofil.“, ' +
        'oder im selben Abschnitt beschreiben, wie jede Bewertung geprüft wird.',
    });
  }

  // (b) Google-Aggregat mit Sternezahl daneben, aber kein Prüfhinweis auf der Seite
  const seitenText = sichtbarerText(html);
  const zahl = googleAggregatMitSternen(seitenText);
  if (zahl && !hatPruefhinweis(seitenText)) {
    issues.push({
      type: 'missing_review_disclaimer',
      details:
        `${where}: zeigt Google-Bewertungen mit Sternezahl ${zahl}, aber keinen Prüfhinweis nach § 5b Abs. 3 UWG. ` +
        'Den Satz aus utils/pruefhinweis.js (PRUEFHINWEIS_GOOGLE) darunter setzen — ' +
        '<GoogleBewertungen> und <Testimonials reviewSource="google"> tun das automatisch.',
    });
  }

  // (c) Selbst erteiltes AggregateRating
  const bloecke = jsonLdBloecke(html);
  const knoten = obersteKnoten(bloecke);
  const seiteIstBetrieb = knoten.some((k) => istBetrieb(typListe(k['@type'])));
  const seiteHatProdukt = knoten.some((k) => istProdukt(typListe(k['@type'])) && !istBetrieb(typListe(k['@type'])));
  const ld = jsonLdRatings(bloecke);
  const md = microdataRatings(html);

  /** @type {string[]} */
  const gruende = [];
  for (const t of ld.betroffen) gruende.push(`JSON-LD-AggregateRating am ${t}-Knoten`);
  for (const r of md) {
    if (istBetrieb(typListe(r.elternTyp))) {
      gruende.push(`Microdata-AggregateRating am ${r.elternTyp}-Knoten`);
    } else if (seiteIstBetrieb && !seiteHatProdukt) {
      gruende.push(`Microdata-AggregateRating (${r.elternTyp || 'ohne Typ'}) auf einer Seite, deren JSON-LD einen Betrieb beschreibt`);
    }
  }
  if (ld.irgendeins && ld.betroffen.length === 0 && seiteIstBetrieb && !seiteHatProdukt) {
    gruende.push('JSON-LD-AggregateRating auf einer Seite, deren JSON-LD einen Betrieb beschreibt');
  }
  if (gruende.length > 0) {
    issues.push({
      type: 'self_serving_aggregate_rating',
      details:
        `${where}: ${[...new Set(gruende)].join('; ')}. Selbst erteilte Bewertungen für den eigenen Betrieb ` +
        'zeigt Google nicht als Sterne an und kann dafür eine manuelle Maßnahme verhängen. Markup entfernen ' +
        '(<Testimonials> ohne productName bzw. schema={false}).',
    });
  }

  return issues;
}
