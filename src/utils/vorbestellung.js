// @ts-check
/**
 * vorbestellung.js — Rechenregeln der Vorbestellung zum Abholen, an EINER Stelle.
 *
 * Genutzt von den Blöcken `Vorbestellung.astro` (Gast stellt die Bestellung zusammen) und
 * `Kuechenliste.astro` (Tagesliste der Küche). Ein späterer Server-Handler soll dieselben
 * Funktionen nehmen, damit Website, WhatsApp-Text und Küchenliste nie auseinanderlaufen.
 *
 * ANLASS (15.10.2026): customer-brotzeithaeusl, Imbiss Mo–Fr 8–15 Uhr, bisher nur telefonische
 * Vorbestellung. Modell: Bestellung als fertige WhatsApp-Nachricht an den Laden plus Tagesliste
 * für den Überblick (Entscheidung Betreiber). Bezahlt wird bei Abholung, Geld fließt hier nicht.
 *
 * Zeiten sind Wandzeit im Browser des Gastes (der Gast steht in Regenstauf, nicht in UTC).
 * Datumsangaben als 'YYYY-MM-DD' aus lokalen Datumsteilen, nie über toISOString().
 */

/**
 * Preis in Cent aus deutscher Schreibweise: '9,90', '14,90 €', '0,80 €', '12'.
 * Wirft bei allem anderen (leer, „Preis folgt“, „ab 3,20 €“): eine Bestellung mit
 * geratenem Preis ist schlimmer als ein Fehler beim Bauen.
 * @param {string} betrag
 * @returns {number}
 */
export function preisCent(betrag) {
  const s = String(betrag ?? '').replace(/ /g, ' ').trim();
  const m = s.match(/^(\d{1,4})(?:,(\d{2}))?\s*€?$/);
  if (!m) throw new Error(`Preis nicht lesbar: „${betrag}“`);
  return Number(m[1]) * 100 + Number(m[2] ?? 0);
}

/**
 * Cent als Euro-Text: 1630 → '16,30 €'.
 * @param {number} cent
 * @returns {string}
 */
export function euro(cent) {
  const c = Math.round(cent);
  return `${Math.floor(c / 100)},${String(c % 100).padStart(2, '0')} €`;
}

/**
 * Summe aller Positionen in Cent (Menge × Preis).
 * @param {readonly { menge: number; preisCent: number }[]} positionen
 * @returns {number}
 */
export function summeCent(positionen) {
  return positionen.reduce((s, p) => s + Math.max(0, p.menge) * p.preisCent, 0);
}

/** @param {Date} d */
const isoDatum = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
/** @param {string} hhmm */
const minuten = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};
/** @param {number} min */
const hhmm = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
const WOCHENTAG = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];

/**
 * Die nächsten offenen Tage mit ihren Abholzeiten.
 *
 * Heute beginnt bei „jetzt + Vorlauf“, aufgerundet auf das Raster; an späteren Tagen bei der
 * Öffnung. Letzte Abholzeit = Schluss minus ein Raster (bei 15 Uhr: 14:45). Tage ohne
 * Abholzeit (Wochentag zu, in `geschlossen`, heute schon vorbei) werden übersprungen.
 *
 * @param {{
 *   jetzt: Date,
 *   tage: readonly number[],
 *   von: string,
 *   bis: string,
 *   vorlaufMinuten?: number,
 *   rasterMinuten?: number,
 *   geschlossen?: readonly string[],
 *   anzahl?: number,
 *   maxSuche?: number,
 * }} o  `tage`: Wochentage wie Date.getDay() (0 = Sonntag).
 * @returns {{ datum: string, label: string, zeiten: string[] }[]}
 */
export function abholtage({
  jetzt,
  tage,
  von,
  bis,
  vorlaufMinuten = 20,
  rasterMinuten = 15,
  geschlossen = [],
  anzahl = 2,
  maxSuche = 14,
}) {
  /** @type {{ datum: string, label: string, zeiten: string[] }[]} */
  const ergebnis = [];
  const heute = new Date(jetzt.getFullYear(), jetzt.getMonth(), jetzt.getDate());
  const ende = minuten(bis) - rasterMinuten;
  for (let i = 0; i < maxSuche && ergebnis.length < anzahl; i++) {
    const tag = new Date(heute.getFullYear(), heute.getMonth(), heute.getDate() + i);
    const datum = isoDatum(tag);
    if (!tage.includes(tag.getDay()) || geschlossen.includes(datum)) continue;
    let start = minuten(von);
    if (i === 0) {
      const frueh = jetzt.getHours() * 60 + jetzt.getMinutes() + vorlaufMinuten;
      start = Math.max(start, Math.ceil(frueh / rasterMinuten) * rasterMinuten);
    }
    /** @type {string[]} */
    const zeiten = [];
    for (let m = start; m <= ende; m += rasterMinuten) zeiten.push(hhmm(m));
    if (!zeiten.length) continue;
    const label =
      i === 0 ? 'Heute' : i === 1 ? 'Morgen' : `${WOCHENTAG[tag.getDay()]} ${datum.slice(8, 10)}.${datum.slice(5, 7)}.`;
    ergebnis.push({ datum, label, zeiten });
  }
  return ergebnis;
}

/**
 * Der Text der Bestellung, wie er per WhatsApp beim Laden ankommt.
 * Wirft ohne bestellte Position oder ohne Namen: eine leere Bestellung soll nicht entstehen.
 *
 * @param {{
 *   nummer: number,
 *   tagLabel: string,
 *   datum: string,
 *   zeit: string,
 *   positionen: readonly { name: string, menge: number, preisCent: number }[],
 *   name: string,
 *   hinweis?: string,
 * }} b
 * @returns {string}
 */
export function bestellText({ nummer, tagLabel, datum, zeit, positionen, name, hinweis = '' }) {
  const bestellt = positionen.filter((p) => p.menge > 0);
  if (!bestellt.length) throw new Error('Bestellung ohne Position');
  const wer = String(name ?? '').trim();
  if (!wer) throw new Error('Bestellung ohne Name');
  // „Heute“/„Morgen“ bekommen das Datum dazu, „Mo 19.10.“ trägt es schon.
  const tagZeile = !/\d/.test(tagLabel)
    ? `${tagLabel} (${datum.slice(8, 10)}.${datum.slice(5, 7)}.), ${zeit} Uhr`
    : `${tagLabel}, ${zeit} Uhr`;
  const zeilen = [
    `Bestellung #${nummer} zum Abholen`,
    tagZeile,
    '',
    ...bestellt.map((p) => `${p.menge}× ${p.name} (${p.menge > 1 ? 'je ' : ''}${euro(p.preisCent)})`),
    '',
    `Summe: ${euro(summeCent(bestellt))}`,
    `Name: ${wer}`,
  ];
  const notiz = String(hinweis ?? '').trim();
  if (notiz) zeilen.push(`Hinweis: ${notiz}`);
  zeilen.push('Bezahlt wird bei Abholung.');
  return zeilen.join('\n');
}

/**
 * Küchenliste: nach Abholtag, dann Abholzeit, dann Nummer. Gibt eine neue Liste zurück.
 * @template {{ nummer: number, datum: string, zeit: string }} T
 * @param {readonly T[]} liste
 * @returns {T[]}
 */
export function sortiereBestellungen(liste) {
  return [...liste].sort(
    (a, b) => a.datum.localeCompare(b.datum) || a.zeit.localeCompare(b.zeit) || a.nummer - b.nummer,
  );
}

/**
 * Laufende Bestellnummer je Tag (#1, #2 …), beginnt an jedem neuen Tag bei 1.
 * @param {{ datum: string, zaehler: number } | undefined} stand
 * @param {string} datum  'YYYY-MM-DD' des Bestelltags
 * @returns {{ nummer: number, stand: { datum: string, zaehler: number } }}
 */
export function naechsteNummer(stand, datum) {
  const zaehler = stand && stand.datum === datum ? stand.zaehler + 1 : 1;
  return { nummer: zaehler, stand: { datum, zaehler } };
}
