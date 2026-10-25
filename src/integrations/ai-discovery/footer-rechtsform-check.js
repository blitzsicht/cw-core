// @ts-check
/**
 * @cw/core/integrations/ai-discovery/footer-rechtsform-check
 *
 * Fußzeilen-Guard: steht die Rechtsform als eigenes Segment neben dem Namen?
 *
 * ANLASS (spedition-steller, 23.10.2026). Footer.astro setzt die Zeile als
 *   `© {jahr} {owner}{legalForm ? ' · ' + legalForm : ''}{city ? ' · ' + city : ''}`
 * zusammen (Z. 302). Das Kundenrepo übergab `owner: siteData.legal.owner` — und das ist
 * der Geschäftsführer, nicht die Gesellschaft. Ausgeliefert wurde
 *   „© 2026 Ralf Steller · GmbH · Langquaid“
 * also eine Zeile, die die Rechtsform einer natürlichen Person zuschreibt. Gefunden hat
 * das kein Audit, sondern ein Blick auf den Screenshot der Fahrerseite.
 *
 * REGEL. § 19 HGB verlangt den Rechtsformzusatz **in** der Firma („Ralf Steller
 * Spedition GmbH“), nicht daneben. Steht eine registerpflichtige Rechtsform als
 * eigenständiges Segment der Fußzeile, ist der davor genannte Träger folglich nicht die
 * Firma — entweder eine natürliche Person (falsch) oder eine verkürzte Marke
 * (unvollständige Firmierung). Beides meldet dieser Guard, die Entscheidung trifft der
 * Mensch.
 *
 * BEWUSST NICHT GEMELDET werden Zusätze, die keine Firmenbestandteile im Sinn des HGB
 * sind: „Einzelunternehmen“ (der cw-core-Default), „Freiberufler“, „Privatperson“. Dort
 * ist das eigene Segment die richtige Darstellung — ein Einzelkaufmann ohne Registereintrag
 * führt keinen Zusatz in der Firma. Das erledigt die Positivliste von selbst: was nicht
 * in REGISTER_RECHTSFORMEN steht, wird nicht gemeldet. Eine zusätzliche Ausnahmeliste
 * stand hier kurz und wurde wieder entfernt — sie hätte nie etwas ändern können, weil
 * ihre Einträge ohnehin nicht in der Positivliste stehen. Ein Zweig, der nie greift,
 * sieht im Code aus wie ein Schutz und ist keiner.
 *
 * GRENZEN
 *   - Er liest die gebaute Seite, nicht `siteData`: die Footer-Werte stammen aus
 *     `page-config.ts`, ein Check gegen `siteData.legal` würde ein anderes Objekt messen
 *     als das, was ausgeliefert wird.
 *   - Eine Fußzeile ohne Copyright-Zeile ist kein Befund, sondern unprüfbar — der
 *     Aufrufer zählt sie nicht als geprüft.
 *   - Ob der genannte Träger wirklich die Firma ist, kann er nicht wissen. Er misst nur,
 *     dass die Rechtsform danebensteht.
 *
 * @typedef {'rechtsform_als_eigenes_segment'} FooterRechtsformIssueType
 * @typedef {{ type: FooterRechtsformIssueType, zeile: string, rechtsform: string, traeger: string }} FooterRechtsformIssue
 */

/**
 * Registerpflichtige Rechtsformen, kleingeschrieben und ohne Satzzeichen verglichen.
 * Die längeren Formen stehen vorn, damit „GmbH & Co. KG“ nicht als „KG“ durchgeht.
 */
export const REGISTER_RECHTSFORMEN = [
  'gmbh & co. kg',
  'gmbh & co kg',
  'ag & co. kg',
  'ug (haftungsbeschränkt) & co. kg',
  'ug (haftungsbeschränkt)',
  'ug haftungsbeschränkt',
  'gmbh',
  'ggmbh',
  'ag',
  'se',
  'kg',
  'kgaa',
  'ohg',
  'gbr',
  'partg',
  'partmbb',
  'e.k.',
  'e. k.',
  'e.kfm.',
  'e.kfr.',
  'e.g.',
  'e.v.',
  'e. v.',
];

/** @param {string} s @returns {string} */
function normiere(s) {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Ist das Segment (für sich allein) eine registerpflichtige Rechtsform?
 * @param {string} segment
 * @returns {string|null} die erkannte Rechtsform in Originalschreibweise, sonst null
 */
export function erkenneRechtsform(segment) {
  const n = normiere(segment);
  if (!n) return null;
  return REGISTER_RECHTSFORMEN.includes(n) ? segment.trim() : null;
}

/**
 * Zerlegt eine Copyright-Zeile und meldet eine daneben stehende Rechtsform.
 * Erwartet den Textinhalt, nicht das Markup.
 * @param {string} zeile
 * @returns {FooterRechtsformIssue|null}
 */
export function pruefeCopyrightZeile(zeile) {
  const text = zeile.replace(/\s+/g, ' ').trim();
  if (!text.startsWith('©')) return null;
  // Jahr abschneiden: „© 2026 Rest“ bzw. „© 2024–2026 Rest“
  const ohneJahr = text.replace(/^©\s*\d{4}(\s*[–-]\s*\d{4})?\s*/, '');
  const segmente = ohneJahr.split('·').map((s) => s.trim()).filter(Boolean);
  if (segmente.length < 2) return null;
  for (let i = 1; i < segmente.length; i++) {
    const rechtsform = erkenneRechtsform(segmente[i]);
    if (!rechtsform) continue;
    const traeger = segmente[i - 1];
    // Trägt der Name die Rechtsform schon, ist das Segment eine Dopplung — ebenfalls ein
    // Befund, aber derselbe Typ: die Rechtsform gehört nicht daneben.
    return { type: 'rechtsform_als_eigenes_segment', zeile: text, rechtsform, traeger };
  }
  return null;
}

/**
 * Sucht die Copyright-Zeilen einer Seite und prüft sie.
 * @param {string} html
 * @returns {{ gefunden: number, befunde: FooterRechtsformIssue[] }}
 */
export function pruefeSeite(html) {
  /** @type {FooterRechtsformIssue[]} */
  const befunde = [];
  let gefunden = 0;
  const treffer = html.matchAll(/<p[^>]*>\s*(©[^<]{0,200})<\/p>/g);
  for (const m of treffer) {
    gefunden++;
    const befund = pruefeCopyrightZeile(entitaeten(m[1]));
    if (befund) befunde.push(befund);
  }
  return { gefunden, befunde };
}

/** @param {string} s @returns {string} */
function entitaeten(s) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&middot;/g, '·')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)));
}
