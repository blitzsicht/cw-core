/**
 * @cw/core/utils/bildherkunft — Herkunft eines Bildes, deklariert statt geraten.
 *
 * Rechtlicher Anlass: Art. 50 Abs. 4 UAbs. 1 AI Act (VO (EU) 2024/1689) verpflichtet
 * den **Betreiber**, offenzulegen, wenn er KI-erzeugte oder -manipulierte Bild-, Ton-
 * oder Videoinhalte veröffentlicht, die ein **Deepfake** sind. Die Norm gilt seit dem
 * 02.08.2026 (Art. 113 nimmt Kapitel IV in keiner seiner Ausnahmen aus).
 * Volltext im Spiegel: `cw-recht: texte/eu/ai-act/ai-act.md`, Abschnitt „## Artikel 50".
 * Bewertung: `cw-legal: 04-betroffenheit/D1-art50-ki-kennzeichnung.md`.
 * **Keine amtliche Fassung, keine Rechtsberatung.**
 *
 * Warum deklariert und nicht erkannt: Einem Bild sieht der Code seine Herkunft nicht an.
 * Gemessen am 24.08.2026 trägt **kein einziges** Bild der Live-Flotte einen
 * KI-Herkunftsmarker (0 von 54 Stichproben, `exiftool -DigitalSourceType -jumbf:all
 * -XMP-c2pa:all`) — `astro:assets` (sharp) strippt EXIF beim Transform, siehe
 * `ai-discovery/geotag.js:8`. Ein Detektor über metadatenfreie Bilder würde raten und
 * dabei grün melden. Die Herkunft kommt deshalb von dem, der die Bilder beauftragt hat.
 *
 * Form nach dem Vorbild von `imageRights` (copyright.js): Pfad-Präfixe gegen den
 * dist-relativen Pfad, längster Treffer gewinnt. Das greift auch für `public/`-Bilder,
 * die außerhalb der Astro-Assetpipeline liegen.
 *
 *   bildHerkunft: [
 *     { pathPrefix: 'images/',      herkunft: 'mensch' },
 *     { pathPrefix: 'images/team/', herkunft: 'ki-erzeugt', deepfake: 'ja',
 *       begruendung: 'Fotorealistisches Team, das so nie existiert hat' },
 *   ]
 *
 * **Zwei getrennte Felder, mit Absicht.** Die Legaldefinition (Art. 3 Nr. 60) verlangt
 * zwei Merkmale **kumulativ**: der Inhalt ähnelt wirklichen Personen, Gegenständen,
 * Orten, Einrichtungen oder Ereignissen — *und* er würde einer Person fälschlicherweise
 * als echt erscheinen. Ein einzelnes Feld „istKI" würde beides vermengen: dann wäre
 * entweder jedes KI-Bild gekennzeichnet (falsch, und es entwertet das Label dort, wo es
 * Pflicht ist) oder die Einordnung verschwände in einem Kopf statt im Repo.
 *
 * **`ungeklaert` ist ein eigener dritter Zustand, nicht grün.** Ohne passende Regel ist
 * das Ergebnis `ungeklaert` — nie ein stiller Fallback auf „menschliches Foto". Sonst
 * meldet der Guard jedes undeklarierte Bild grün und verdeckt die Pflicht dauerhaft.
 *
 * Rein (keine I/O), reines `.js` → per `node:test` prüfbar, aus `page-config.ts` via
 * `@cw/core/utils/bildherkunft` importierbar und vom plain-node-CLI-Twin nutzbar.
 */

import { isTodo } from './copyright.js';

/** Zulässige Herkunftsangaben. `ungeklaert` ist der dritte Zustand, nicht grün. */
export const HERKUNFT_WERTE = ['mensch', 'ki-erzeugt', 'ki-veraendert', 'ungeklaert'];

/** Zulässige Deepfake-Einordnungen nach Art. 3 Nr. 60. */
export const DEEPFAKE_WERTE = ['ja', 'nein', 'ungeklaert'];

/** Herkunftswerte, bei denen überhaupt eine Deepfake-Frage entstehen kann. */
const KI_HERKUNFT = ['ki-erzeugt', 'ki-veraendert'];

/** Pfad auf die kanonische Form bringen: POSIX-Trenner, kein führender Slash. */
function normPfad(p) {
  return String(p ?? '')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '');
}

/**
 * Ergebnis für ein Bild ohne belastbare Deklaration.
 * @param {string|null} problem
 * @param {string|null} quelle
 */
function ungeklaert(problem = null, quelle = null) {
  return { herkunft: 'ungeklaert', deepfake: 'ungeklaert', begruendung: null, quelle, problem };
}

/**
 * Eine einzelne Regel auf Gültigkeit prüfen.
 *
 * Getrennt von der Vollständigkeit: eine **ungültige** Regel greift gar nicht (das Bild
 * bleibt `ungeklaert`), eine **unvollständige** greift, trägt aber einen Befund. Beides
 * verhindert Grün, aber aus verschiedenen Gründen — und der Guard soll sie unterscheiden
 * können.
 *
 * @param {any} r
 * @returns {string|null} Klartext-Befund oder null, wenn die Regel gültig ist
 */
function pruefeRegel(r) {
  if (!r || typeof r !== 'object') return 'Regel ist kein Objekt.';

  const hatPfad = typeof r.pathPrefix === 'string' && !!normPfad(r.pathPrefix);
  const hatStem = typeof r.stem === 'string' && !!r.stem.trim();
  if (!hatPfad && !hatStem) {
    return 'pathPrefix oder stem fehlt — die Regel kann keinem Bild zugeordnet werden.';
  }
  if (!HERKUNFT_WERTE.includes(r.herkunft)) {
    return `herkunft ist "${r.herkunft}" — zulässig sind: ${HERKUNFT_WERTE.join(', ')}.`;
  }

  const hatEinordnung = r.deepfake !== undefined && r.deepfake !== null;
  if (hatEinordnung && !DEEPFAKE_WERTE.includes(r.deepfake)) {
    return `deepfake ist "${r.deepfake}" — zulässig sind: ${DEEPFAKE_WERTE.join(', ')}.`;
  }

  const istKi = KI_HERKUNFT.includes(r.herkunft);
  const entschieden = r.deepfake === 'ja' || r.deepfake === 'nein';

  // Ein menschliches Foto kann kein Deepfake sein — die Legaldefinition setzt KI-Erzeugung
  // oder -Manipulation voraus. Die Angabe ist dort redundant, und Redundanz in einem
  // Nachweisdokument lädt zum Missverstehen ein: sie ließe glauben, hier sei eine Prüfung
  // erfolgt, wo die Antwort schon aus der Herkunft folgt.
  if (entschieden && r.herkunft === 'mensch') {
    return `deepfake="${r.deepfake}" bei herkunft="mensch" ist überflüssig — ein menschliches Foto kann kein Deepfake sein (Art. 3 Nr. 60). Die Angabe bitte weglassen.`;
  }

  // „Herkunft unbekannt, aber sicher kein Deepfake" ist dagegen eine sinnvolle und häufige
  // Aussage: Ein Logo, eine isometrische Illustration, eine Textkarte oder ein freigestellter
  // Produktfreisteller ähnelt nichts Wirklichem. Die Norm greift dort nicht, ganz gleich womit
  // das Bild gezeichnet wurde. Ohne diese Möglichkeit müsste man für rund 110 Flottenbilder
  // eine Herkunft behaupten, die niemand belegen kann — mitten in einem Nachweisdokument.
  if (r.deepfake === 'ja' && r.herkunft === 'ungeklaert') {
    return 'deepfake="ja" bei herkunft="ungeklaert" ist ein Widerspruch — wer weiß, dass es ein Deepfake ist, weiß auch, dass KI im Spiel war (Art. 3 Nr. 60).';
  }

  // Die Begründung ist der Nachweis. Sie fehlt zu lassen hieße, die Einordnung zu
  // behaupten statt sie zu belegen — und die Verneinung ist die begründungsbedürftigere
  // der beiden Aussagen, weil auf ihr der Verzicht auf die Kennzeichnung beruht.
  if (entschieden && (typeof r.begruendung !== 'string' || !r.begruendung.trim() || isTodo(r.begruendung))) {
    return 'begruendung fehlt (oder ist ein Platzhalter) — eine Deepfake-Einordnung ohne Begründung ist kein Nachweis.';
  }

  return null;
}

/**
 * Alle Regeln eines site-data prüfen — unabhängig davon, ob ein Bild sie trifft.
 *
 * Eine kaputte Regel, die zufällig auf kein Bild passt, würde sonst nie auffallen und
 * beim nächsten neuen Bild still danebengreifen. Befundform wie `ImpressumIssue`
 * (`ai-discovery/index.ts`), damit der Guard einheitlich berichtet.
 *
 * @param {any} data  aufgelöstes siteData
 * @returns {Array<{field: string, detail: string}>}
 */
export function pruefeBildHerkunftRegeln(data) {
  const regeln = Array.isArray(data?.bildHerkunft) ? data.bildHerkunft : [];
  const befunde = [];

  // Stems müssen innerhalb einer Site eindeutig sein: sie adressieren ein Bild über seinen
  // bloßen Dateinamen. Zwei Regeln auf denselben Stem heißt, dass die Auflösung von der
  // Reihenfolge im Array abhängt — und damit still kippt, wenn jemand sortiert.
  const stemZaehler = new Map();
  for (const r of regeln) {
    if (r && typeof r.stem === 'string' && r.stem.trim()) {
      const s = r.stem.trim();
      stemZaehler.set(s, (stemZaehler.get(s) ?? 0) + 1);
    }
  }
  const gemeldeteStems = new Set();

  regeln.forEach((r, i) => {
    const problem = pruefeRegel(r);
    if (problem) {
      befunde.push({ field: `bildHerkunft[${i}]`, detail: problem });
      return;
    }

    const stem = typeof r.stem === 'string' ? r.stem.trim() : '';
    if (stem && stemZaehler.get(stem) > 1 && !gemeldeteStems.has(stem)) {
      gemeldeteStems.add(stem);
      befunde.push({
        field: `bildHerkunft[${i}]`,
        detail: `stem "${stem}" ist mehrfach vergeben — ein Stem muss eindeutig sein, sonst hängt die Auflösung von der Reihenfolge ab.`,
      });
      return;
    }
    // Gültig, aber unvollständig. Zwei Fälle, gleicher Grund: die Deepfake-Frage ist offen.
    //   ki-*        → Herkunft geklärt, Einordnung fehlt
    //   ungeklaert  → weder das eine noch das andere gesagt
    // In beiden steht die Rechtsfrage unbeantwortet da, und das ist kein grüner Zustand.
    const brauchtEinordnung = KI_HERKUNFT.includes(r.herkunft) || r.herkunft === 'ungeklaert';
    if (brauchtEinordnung && r.deepfake !== 'ja' && r.deepfake !== 'nein') {
      befunde.push({
        field: `bildHerkunft[${i}]`,
        detail: `herkunft="${r.herkunft}", aber die Deepfake-Einordnung fehlt. Ohne sie ist nicht entschieden, ob Art. 50 Abs. 4 UAbs. 1 die Kennzeichnung verlangt.`,
      });
    }
  });

  return befunde;
}

/**
 * Herkunft für EIN konkretes Bild auflösen.
 *
 * Ohne passende Regel: `ungeklaert`. Das ist der Kern dieses Moduls — es gibt bewusst
 * keinen Site-Default im Code. Wer „alles menschliche Fotos" sagen will, schreibt es als
 * Regel hin und übernimmt damit die Aussage.
 *
 * @param {any} data     aufgelöstes siteData
 * @param {string} relPath  dist-relativer Bildpfad, z. B. 'images/team/gruppe.webp'
 * @returns {{herkunft: string, deepfake: string, begruendung: string|null, quelle: string|null, problem: string|null}}
 */
export function resolveBildHerkunft(data, relPath) {
  const regeln = Array.isArray(data?.bildHerkunft) ? data.bildHerkunft : [];
  const pfad = normPfad(relPath);

  // Der Stem ist der Dateiname bis zum ersten Punkt — dieselbe Regel wie in `descForFile`
  // (geotag-core.js), damit der Content-Hash der Astro-Assetpipeline
  // (`_astro/hero.Bng-bGX1.webp` → `hero`) wegfällt.
  const stem = (pfad.split('/').pop() ?? '').split('.')[0];

  let treffer = null;
  let trefferProblem = null;

  for (const r of regeln) {
    const problem = pruefeRegel(r);
    // Ungültige Regeln matchen trotzdem — sonst greift stillschweigend die nächstkürzere
    // Regel und der Fehler bleibt unsichtbar. Sie gewinnen den Vergleich, führen aber zu
    // `ungeklaert` statt zu einem Ergebnis.
    const praefix = normPfad(r?.pathPrefix);
    if (praefix && pfad.startsWith(praefix)) {
      // Pfad-Treffer schlagen Stem-Treffer: der konkrete Pfad ist spezifischer als der
      // bloße Dateiname. Rang 1 vor Rang 0, innerhalb desselben Rangs der längere Präfix.
      if (treffer && (treffer.rang > 1 || (treffer.rang === 1 && treffer.laenge >= praefix.length))) continue;
      treffer = { rang: 1, laenge: praefix.length, quelle: praefix, regel: r };
      trefferProblem = problem;
      continue;
    }
    const regelStem = typeof r?.stem === 'string' ? r.stem.trim() : '';
    if (regelStem && regelStem === stem) {
      if (treffer) continue; // ein bereits gefundener Pfad-Treffer bleibt
      treffer = { rang: 0, laenge: regelStem.length, quelle: `stem:${regelStem}`, regel: r };
      trefferProblem = problem;
    }
  }

  // Keine Regel getroffen ist selbst ein Befund, kein stiller Normalfall. Bliebe `problem`
  // hier null, hieße „kein Problem" bei jedem undeklarierten Bild fälschlich „alles in
  // Ordnung" — und der Guard müsste die Abwesenheit einer Deklaration aus zwei Feldern
  // zusammenreimen. Invariante stattdessen: `problem === null` heißt, es ist nichts zu tun.
  if (!treffer) {
    return ungeklaert(
      'Keine Deklaration für diesen Pfad — die Herkunft ist unbekannt, damit ist nicht entschieden, ob Art. 50 Abs. 4 UAbs. 1 die Kennzeichnung verlangt.',
      null,
    );
  }
  if (trefferProblem) return ungeklaert(trefferProblem, treffer.quelle);

  const r = treffer.regel;
  const brauchtEinordnung = KI_HERKUNFT.includes(r.herkunft) || r.herkunft === 'ungeklaert';
  const entschieden = r.deepfake === 'ja' || r.deepfake === 'nein';

  return {
    herkunft: r.herkunft,
    deepfake: entschieden ? r.deepfake : 'ungeklaert',
    begruendung: entschieden ? r.begruendung : null,
    quelle: treffer.quelle,
    problem:
      brauchtEinordnung && !entschieden
        ? 'Deepfake-Einordnung fehlt — ohne sie ist nicht entschieden, ob Art. 50 Abs. 4 UAbs. 1 die Kennzeichnung verlangt.'
        : null,
  };
}

/**
 * Löst dieses Bild die Kennzeichnungspflicht aus?
 *
 * Beide Merkmale der Legaldefinition müssen zusammenkommen: KI-Herkunft **und** die
 * Einordnung, dass es fälschlich als echt erscheint. `ungeklaert` ist ausdrücklich
 * **keine** Pflicht — aber auch kein grünes Licht: dafür trägt das Ergebnis `problem`.
 *
 * @param {{herkunft: string, deepfake: string}} ergebnis  aus resolveBildHerkunft
 * @returns {boolean}
 */
export function istKennzeichnungspflichtig(ergebnis) {
  return KI_HERKUNFT.includes(ergebnis?.herkunft) && ergebnis?.deepfake === 'ja';
}
