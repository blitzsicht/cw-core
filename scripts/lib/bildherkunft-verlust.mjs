// @ts-check
/**
 * Was ein Lauf von `bildherkunft-übernehmen.mjs` an bestehenden Deklarationen wegwirft.
 *
 * Anlass, gemessen am 05.11.2026 an `customer-blitzsicht` (origin/main 3b24aff):
 * `src/data/bild-herkunft.ts` trägt **108** Regeln (103 `pathPrefix`, 5 `stem`), die Quelle
 * des Generators kennt **38** davon. Ein Lauf mit `--schreiben` hätte **72** Regeln ersatzlos
 * überschrieben — darunter die sechs Art.-50-Einstufungen der Hero-Bilder vom 04.11. — und
 * zwei Regeln für Bilder neu angelegt, deren Dateien am Tag davor gelöscht wurden. Ohne
 * Fehlermeldung: der Generator schreibt mit `writeFileSync` und hat die Zieldatei nie gelesen.
 *
 * Dass es nie passiert ist, hing an einer Zufälligkeit — der nötige `--export` liegt auf
 * keiner Platte, und kein Workflow ruft das Skript auf. Beides kann sich an einem Nachmittag
 * ändern, und der Schaden wäre eine Rechtsaussage, die niemand vermisst.
 *
 * **Die Datei hat zwei Schreiber, und das bleibt so.** Der Generator legt den Grundstock,
 * `bild-einbauen.mjs` ergänzt beim Einbau jedes weiteren Bildes (`einfuegen`). Genau dieser
 * zweite Weg hat die 72 Regeln erzeugt. Diese Funktionen schließen die Lücke zwischen beiden,
 * statt einen von ihnen abzuschaffen.
 *
 * Rein (keine I/O) → per `node:test` prüfbar.
 */

import {
  resolveBildHerkunft,
  istKennzeichnungspflichtig as pflichtigZurLaufzeit,
} from '../../src/utils/bildherkunft.js';
import { BILD_EXT } from '../bildherkunft-arbeitsliste.mjs';

/** Eine Regelzeile, wie `regelZeile()` sie baut: `  { pathPrefix: '…', herkunft: '…' },` */
const REGELZEILE = /^\s*\{\s*(pathPrefix|stem):\s*'((?:[^'\\]|\\.)*)'/;

/** Beginnt wie eine Regelzeile, ganz gleich welches Feld zuerst steht. */
const SIEHT_AUS_WIE_REGEL = /^\s*\{.*\},\s*$/;

/**
 * Schlüssel auf eigener Zeile: eine mehrzeilige Regel (siluri.de pflegt 295 davon von Hand,
 * gemessen 09.11.2026). Der Zeilenleser sähe sie nicht und hielte sie für Kommentar — beim
 * Mischen stünde die neue Regel dann zusätzlich in der Datei, und die alte gewänne zur
 * Laufzeit weiter (gleicher Präfix, die erste bleibt). Deshalb: laut abbrechen.
 */
const SCHLUESSEL_OHNE_KLAMMER = /^\s*(pathPrefix|stem)\s*:/;

/**
 * Schlüssel und Wert einer einzelnen Regelzeile.
 *
 * Der Wert kommt durch die Umkehrung von `alsLiteral()` (bildherkunft-arbeitsliste.mjs):
 * ein Pfad mit Apostroph im Namen stünde sonst abgeschnitten da und wäre eine andere
 * Adresse als die, die in der Datei steht.
 *
 * @param {string} zeile
 * @returns {{art: 'pathPrefix'|'stem', wert: string} | null}
 */
export function schluesselAusZeile(zeile) {
  const m = String(zeile ?? '').match(REGELZEILE);
  if (!m) return null;
  const wert = m[2]
    .replace(/\\n/g, '\n')
    .replace(/\\'/g, "'")
    .replace(/\\\\/g, '\\');
  if (!wert.trim()) return null;
  return { art: /** @type {'pathPrefix'|'stem'} */ (m[1]), wert };
}

/**
 * Alle Schlüssel einer Deklarationsdatei oder Zeilenliste.
 *
 * Wirft, wenn eine Zeile wie eine Regel aussieht, aber keinen Schlüssel hergibt. Das ist
 * Absicht: ein stiller Übersprung würde die Regel als „nicht vorhanden" zählen, der Guard
 * hielte ihren Verlust für unproblematisch und wäre damit genau dort blind, wo er schützen
 * soll. Lauter Abbruch bei unbekannter Zeilenform ist der billigere Fehler.
 *
 * @param {string | string[]} quelle  Dateiinhalt oder Zeilen
 * @returns {Array<{art: 'pathPrefix'|'stem', wert: string}>}
 */
export function schluesselListe(quelle) {
  const zeilen = Array.isArray(quelle) ? quelle : String(quelle ?? '').split('\n');
  const treffer = [];
  for (const z of zeilen) {
    const s = schluesselAusZeile(z);
    if (s) { treffer.push(s); continue; }
    if (SCHLUESSEL_OHNE_KLAMMER.test(z)) {
      throw new Error(
        `Mehrzeilige Regel: ${z.trim().slice(0, 120)}\n` +
        'Dieser Leser kennt nur einzeilige Regeln. Von Hand pflegen oder die Datei vorher auf ' +
        'einzeilige Regeln umstellen — sonst stünde eine Regel doppelt und die alte gewönne.',
      );
    }
    if (SIEHT_AUS_WIE_REGEL.test(z)) {
      throw new Error(
        `Regelzeile ohne erkennbaren Schlüssel: ${z.trim().slice(0, 120)}\n` +
        'Erwartet wird `pathPrefix` oder `stem` als erstes Feld. Von Hand prüfen — ' +
        'ein Übersprung hier würde einen echten Verlust als harmlos ausgeben.',
      );
    }
  }
  return treffer;
}

/**
 * Der Stamm eines Pfades: letztes Segment bis zum ERSTEN Punkt.
 *
 * Dieselbe Regel wie `resolveBildHerkunft` (src/utils/bildherkunft.js) und `ablage`
 * (bild-einbauen.mjs). Eine eigene Variante hier hieße, dass der Guard ein anderes Bild
 * meint als die Auflösung zur Laufzeit.
 *
 * @param {string} pfad
 * @returns {string}
 */
export function stammVonPfad(pfad) {
  return (String(pfad ?? '').replace(/\\/g, '/').split('/').pop() ?? '').split('.')[0];
}

/** Adresse in Klartext, so wie sie in einer Meldung lesbar ist. */
const adresse = (s) => (s.art === 'stem' ? `stem:${s.wert}` : s.wert);

/**
 * Deckt die neue Regelmenge eine bestehende Regel noch ab?
 *
 * `stem: 'johannes-portrait'` und `pathPrefix: 'src/assets/images/johannes-portrait.webp'`
 * bezeichnen dasselbe Bild — in blitzsicht sind das genau die fünf `stem`-Regeln. Ohne diese
 * Äquivalenz meldete der Guard fünf Verluste, die keine sind, und wer ihn mit fünf
 * Fehlalarmen kennenlernt, schaltet ihn beim sechsten Lauf ab.
 *
 * Die Richtung ist asymmetrisch: ein `stem` deckt jeden Pfad mit diesem Stamm ab, ein Pfad
 * dagegen nur sich selbst und seinen eigenen Stamm. Das folgt der Auflösung, in der ein
 * Pfad-Treffer (Rang 1) einen Stem-Treffer (Rang 0) schlägt.
 */
function istGedeckt(alt, neuPfade, neuStems) {
  if (alt.art === 'stem') {
    return neuStems.has(alt.wert) || [...neuPfade].some((p) => stammVonPfad(p) === alt.wert);
  }
  return neuPfade.has(alt.wert) || neuStems.has(stammVonPfad(alt.wert));
}

/**
 * Was ein Überschreiben der bestehenden Datei durch die neuen Zeilen bewirkt.
 *
 * @param {string} bestehenderInhalt  bisheriger Inhalt von `src/data/bild-herkunft.ts`
 *   (leer oder `''`, wenn es die Datei noch nicht gibt — dann ist nichts zu verlieren)
 * @param {string | string[]} neueZeilen  die Zeilen, die der Generator schreiben würde
 * @returns {{verloren: string[], neuAngelegt: string[], unveraendert: string[]}}
 *   `verloren`: Adressen, die nach dem Schreiben niemand mehr deklariert ·
 *   `neuAngelegt`: Adressen, die es vorher nicht gab (bei gelöschten Bildern ein Hinweis,
 *   dass die Quelle veraltet ist) · `unveraendert`: in beiden Mengen vorhanden
 */
export function verlustVergleich(bestehenderInhalt, neueZeilen) {
  const alt = schluesselListe(bestehenderInhalt ?? '');
  const neu = schluesselListe(neueZeilen);

  const neuPfade = new Set(neu.filter((s) => s.art === 'pathPrefix').map((s) => s.wert));
  const neuStems = new Set(neu.filter((s) => s.art === 'stem').map((s) => s.wert));
  const altPfade = new Set(alt.filter((s) => s.art === 'pathPrefix').map((s) => s.wert));
  const altStems = new Set(alt.filter((s) => s.art === 'stem').map((s) => s.wert));

  const verloren = [];
  const unveraendert = [];
  for (const a of alt) {
    (istGedeckt(a, neuPfade, neuStems) ? unveraendert : verloren).push(adresse(a));
  }

  const neuAngelegt = neu
    .filter((n) => !istGedeckt(n, altPfade, altStems))
    .map(adresse);

  return { verloren, neuAngelegt, unveraendert };
}

// ── Mischen statt Überschreiben (customer-blitzsicht#269, Nachlese #264) ─────────────────
//
// Der Verlust-Guard oben hat den Totalverlust verhindert, aber den Generator damit praktisch
// stillgelegt: bild-einbauen.mjs ergänzt die Datei bei jedem Bild, die Arbeitsliste (Stand im
// localStorage eines Browsers) erfährt davon nie. Gemessen am 09.11.2026 trug blitzsicht 125
// Regeln, die Arbeitsliste kannte 38, und jeder Schreiblauf hätte mit Exit 2 geendet. Jetzt
// ist der Bestand die Grundlage: Regeln, die der Lauf nicht kennt, bleiben stehen, und für
// ein Bild, das er kennt, gilt seine Einordnung — an derselben Stelle der Datei, damit der
// Diff klein bleibt. Abgebrochen wird nur noch, wenn dabei eine Kennzeichnung wegfiele.

const ERZEUGTER_KOPF = /^\/\/ (ERZEUGTE DATEI|Angelegt von cw-core\/scripts\/bildherkunft-übernehmen\.mjs)/;
/**
 * Der Kopf, den bildherkunft-übernehmen.mjs heute schreibt: alle Zeilen VOR `// Site: …`.
 * Das Skript baut seinen Kopf aus dieser Konstante, damit Schreiber und Prüfung dieselbe
 * Quelle haben. Wer den Text ändert, legt die bisherige Fassung nach FRUEHERE_KOEPFE —
 * sonst bricht `--kopf` an jeder Datei ab, die noch den alten Text trägt. Test K9 hält beide
 * Listen per Hash fest und sagt beim Ändern, was zu tun ist.
 */
export const KOPF_ZEILEN = Object.freeze(`// Angelegt von cw-core/scripts/bildherkunft-übernehmen.mjs aus der Bild-Arbeitsliste,
// seitdem ergänzt von cw-core/scripts/bild-einbauen.mjs bei jedem weiteren Bild.
// Beide Wege sind vorgesehen, Änderungen von Hand ebenso. Der Generator mischt: Regeln,
// die die Arbeitsliste nicht kennt, bleiben stehen, für ein Bild, das sie kennt, gilt ihre
// Einordnung. Fiele dabei eine Kennzeichnung weg, bricht er ab.
//
// Bild-Herkunft nach Art. 50 Abs. 4 UAbs. 1 AI Act (VO (EU) 2024/1689).
// Die Norm verlangt vom Betreiber eine Offenlegung nur für KI-Inhalte, die ein Deepfake
// sind — und die Legaldefinition (Art. 3 Nr. 60) verlangt zwei Merkmale zusammen: der
// Inhalt ähnelt wirklichen Personen, Gegenständen, Orten, Einrichtungen oder Ereignissen
// UND würde fälschlicherweise als echt erscheinen. Deshalb stehen Herkunft und
// Deepfake-Einordnung getrennt, und die Begründung ist der Nachweis.
//
// Rechtstext: cw-recht → texte/eu/ai-act/ai-act.md, Abschnitt "## Artikel 50".
// Bewertung:  cw-legal → 04-betroffenheit/D1-art50-ki-kennzeichnung.md.
// Keine amtliche Fassung, keine Rechtsberatung.
//`.split('\n'));

/**
 * Frühere Fassungen desselben Kopfs, wörtlich aus git (`git show <sha>:scripts/bildherkunft-uebernehmen.mjs`).
 * Nur was hier oder in KOPF_ZEILEN steht, darf `kopfErsetzen` überschreiben.
 */
export const FRUEHERE_KOEPFE = Object.freeze([
  // b749dd7a (v0.128.0): „ERZEUGTE DATEI"
  Object.freeze(`// ERZEUGTE DATEI — nicht von Hand bearbeiten.
// Erzeugt von cw-core/scripts/bildherkunft-übernehmen.mjs aus der Bild-Arbeitsliste.
// Änderungen gehen beim nächsten Lauf verloren; einordnen in der Arbeitsliste.
//
// Bild-Herkunft nach Art. 50 Abs. 4 UAbs. 1 AI Act (VO (EU) 2024/1689).
// Die Norm verlangt vom Betreiber eine Offenlegung nur für KI-Inhalte, die ein Deepfake
// sind — und die Legaldefinition (Art. 3 Nr. 60) verlangt zwei Merkmale zusammen: der
// Inhalt ähnelt wirklichen Personen, Gegenständen, Orten, Einrichtungen oder Ereignissen
// UND würde fälschlicherweise als echt erscheinen. Deshalb stehen Herkunft und
// Deepfake-Einordnung getrennt, und die Begründung ist der Nachweis.
//
// Rechtstext: cw-recht → texte/eu/ai-act/ai-act.md, Abschnitt "## Artikel 50".
// Bewertung:  cw-legal → 04-betroffenheit/D1-art50-ki-kennzeichnung.md.
// Keine amtliche Fassung, keine Rechtsberatung.
//`.split('\n')),
  // 51c4431f (#210): „Angelegt von …", Abbruch mit `--verlust-ok`
  Object.freeze(`// Angelegt von cw-core/scripts/bildherkunft-übernehmen.mjs aus der Bild-Arbeitsliste,
// seitdem ergänzt von cw-core/scripts/bild-einbauen.mjs bei jedem weiteren Bild.
// Beide Wege sind vorgesehen, und Änderungen von Hand sind erlaubt: der Generator
// überschreibt eine ergänzte Datei nicht mehr, sondern bricht ab und nennt, welche
// Deklarationen fehlen würden (nur \`--verlust-ok\` überstimmt das). Neue Einordnungen
// gehören trotzdem auch in die Arbeitsliste, sonst kennt sie der nächste Lauf nicht.
//
// Bild-Herkunft nach Art. 50 Abs. 4 UAbs. 1 AI Act (VO (EU) 2024/1689).
// Die Norm verlangt vom Betreiber eine Offenlegung nur für KI-Inhalte, die ein Deepfake
// sind — und die Legaldefinition (Art. 3 Nr. 60) verlangt zwei Merkmale zusammen: der
// Inhalt ähnelt wirklichen Personen, Gegenständen, Orten, Einrichtungen oder Ereignissen
// UND würde fälschlicherweise als echt erscheinen. Deshalb stehen Herkunft und
// Deepfake-Einordnung getrennt, und die Begründung ist der Nachweis.
//
// Rechtstext: cw-recht → texte/eu/ai-act/ai-act.md, Abschnitt "## Artikel 50".
// Bewertung:  cw-legal → 04-betroffenheit/D1-art50-ki-kennzeichnung.md.
// Keine amtliche Fassung, keine Rechtsberatung.
//`.split('\n')),
]);

const OEFFNUNG = /^export const bildHerkunft\b.*=\s*\[\s*$/;
/** Leere Liste auf einer Zeile (customer-notar-huber, gemessen 09.11.2026). */
const LEER = /^(export const bildHerkunft\b.*=\s*\[)\s*\];\s*$/;

/**
 * Stammt der Kopf vom Generator? Nur dann darf `--kopf` ihn anfassen — und nur dann muss
 * er die Datei überhaupt lesen können. Eine Datei mit eigenem Kopf (bild-einbauen.mjs, von
 * Hand) bleibt unberührt, auch wenn ihr Rumpf eine Form hat, die dieser Leser nicht kennt.
 * @param {string} inhalt
 */
export const hatErzeugtenKopf = (inhalt) => ERZEUGTER_KOPF.test(String(inhalt ?? '').split('\n')[0]);

/**
 * Kennzeichnungspflichtig nach Art. 50 Abs. 4: KI-Herkunft UND als Deepfake eingeordnet.
 * @param {string} zeile
 */
export function istKennzeichnungspflichtig(zeile) {
  const h = /herkunft:\s*'([^']*)'/.exec(String(zeile ?? ''))?.[1];
  const d = /deepfake:\s*'([^']*)'/.exec(String(zeile ?? ''))?.[1];
  return (h === 'ki-erzeugt' || h === 'ki-veraendert') && d === 'ja';
}

/**
 * Teilt eine Deklarationsdatei in Vorspann (bis einschließlich `export const bildHerkunft
 * … = [`), Rumpf (Regeln, Kommentare, Leerzeilen) und Schluss (ab dem letzten `];`).
 * Wirft, wenn Öffnung oder Schluss fehlen: dann ist über den Bestand nichts gesagt, und
 * „nichts gesagt" ist nicht „nichts da".
 *
 * @param {string} inhalt
 * @returns {{ vorspann: string[], rumpf: string[], schluss: string[] }}
 */
export function teileDatei(inhalt) {
  const zeilen = String(inhalt ?? '').split('\n');
  // `= [];` wird zu `= [` + `];` aufgefaltet: ein leerer Rumpf, in den sich mischen lässt.
  const leer = zeilen.findIndex((z) => LEER.test(z));
  if (leer > -1) zeilen.splice(leer, 1, zeilen[leer].replace(LEER, '$1'), '];');
  const auf = zeilen.findIndex((z) => OEFFNUNG.test(z));
  let zu = -1;
  for (let i = zeilen.length - 1; i > auf; i--) if (/^\];\s*$/.test(zeilen[i])) { zu = i; break; }
  if (auf === -1 || zu === -1) {
    throw new Error('Deklarationsdatei ohne `export const bildHerkunft … = [` oder ohne `];` — von Hand prüfen.');
  }
  return { vorspann: zeilen.slice(0, auf + 1), rumpf: zeilen.slice(auf + 1, zu), schluss: zeilen.slice(zu) };
}

/**
 * Ersetzt eine neue Regel die alte vollständig? Nur dann darf die alte Zeile weichen.
 *
 * - gleiche Adresse (Art und Wert);
 * - alter Pfad, neuer Stem desselben Bildes: der Pfad schlüge den Stem zur Laufzeit
 *   (Rang 1 vor Rang 0), bliebe er stehen, hätte die neue Einordnung keine Wirkung.
 *
 * Umgekehrt (alter Stem, neuer Pfad) bleibt der Stem: er deckt weitere Dateien desselben
 * Namens, und der neue Pfad gewinnt für seine Datei ohnehin. Ebenso ein alter Präfix,
 * unter dem ein neuer, längerer Pfad liegt.
 */
function ersetzt(alt, neu) {
  if (alt.art === neu.art && alt.wert === neu.wert) return true;
  return alt.art === 'pathPrefix' && neu.art === 'stem' && stammVonPfad(alt.wert) === neu.wert;
}

/**
 * Überstimmt die neue Regel die alte für mindestens eine Datei? Das ist die Menge, an der
 * eine wegfallende Kennzeichnung geprüft wird — weiter als `ersetzt`, weil auch ein neuer
 * Pfad unter einem alten Stem oder Präfix die Aussage für seine Datei ändert.
 */
function ueberstimmt(alt, neu) {
  if (ersetzt(alt, neu)) return true;
  if (neu.art !== 'pathPrefix') return false;
  if (alt.art === 'stem') return stammVonPfad(neu.wert) === alt.wert;
  return neu.wert.length > alt.wert.length && neu.wert.startsWith(alt.wert);
}

/**
 * Mischt die Regelzeilen eines Generatorlaufs in den Rumpf einer bestehenden Datei.
 *
 * @param {string[]} rumpf       bestehende Rumpfzeilen (aus `teileDatei`), `[]` beim Erstlauf
 * @param {string[]} neueZeilen  Regelzeilen aus der Arbeitsliste
 * @returns {{ zeilen: string[], behalten: string[], ersetzt: string[], geaendert: string[],
 *             neu: string[], kennzeichnungWeg: string[] }}
 *   `behalten`: Bestand, den der Lauf nicht berührt · `ersetzt`: Bestand, dessen Zeile der
 *   Lauf stellt (gleich oder geändert) · `geaendert`: davon die mit anderem Wortlaut ·
 *   `neu`: Zeilen, die am Ende angehängt werden · `kennzeichnungWeg`: Bestand mit
 *   Kennzeichnung, die für mindestens eine Datei entfiele — der einzige Abbruchgrund
 */
export function mischeRegeln(rumpf, neueZeilen) {
  const neu = neueZeilen.map((z) => ({ z, s: schluesselAusZeile(z) }));
  for (const n of neu) {
    if (!n.s) throw new Error(`Generatorzeile ohne Schlüssel: ${String(n.z).trim().slice(0, 120)}`);
  }
  // Schlüssel des Bestands vorab, damit eine unbekannte Zeilenform wirft, bevor irgendetwas
  // gemischt ist (dieselbe Begründung wie bei `schluesselListe`).
  schluesselListe(rumpf);

  /** @type {Set<number>} */
  const verbraucht = new Set();
  const e = { zeilen: [], behalten: [], ersetzt: [], geaendert: [], neu: [], kennzeichnungWeg: [] };

  for (const zeile of rumpf) {
    const alt = schluesselAusZeile(zeile);
    if (alt && istKennzeichnungspflichtig(zeile)
      && neu.some((n) => ueberstimmt(alt, n.s) && !istKennzeichnungspflichtig(n.z))) {
      e.kennzeichnungWeg.push(adresse(alt));
    }
    if (!alt) { e.zeilen.push(zeile); continue; }
    const i = neu.findIndex((n) => ersetzt(alt, n.s));
    if (i === -1) { e.zeilen.push(zeile); e.behalten.push(adresse(alt)); continue; }
    e.ersetzt.push(adresse(alt));
    if (neu[i].z.trim() !== zeile.trim()) e.geaendert.push(adresse(alt));
    // Zwei alte Pfade desselben Stamms, ein neuer Stem: die neue Zeile steht einmal, an der
    // Stelle des ersten.
    if (!verbraucht.has(i)) { e.zeilen.push(neu[i].z); verbraucht.add(i); }
  }
  neu.forEach((n, i) => {
    if (verbraucht.has(i)) return;
    e.zeilen.push(n.z);
    e.neu.push(adresse(n.s));
  });
  return e;
}

/**
 * Ersetzt den Kopf, den der Generator geschrieben hat (erste Zeile bis einschließlich
 * `// Site: …`), durch `neuerKopf`. Was danach steht, bleibt — auch handgeschriebene
 * „Ergänzt …"-Vermerke. Ein Kopf von bild-einbauen.mjs oder von Hand bleibt unberührt:
 * er behauptet keine Regelzahl.
 *
 * Steht zwischen Zeile 1 und `// Site:` etwas, das in keiner bekannten Fassung steht, wirft
 * die Funktion, statt es mitzulöschen. Gemessen am Kopf-Sweep 10.11.2026 (cw-core#280):
 * customer-falzmarke hatte dort zwei Absätze von Hand (SVG-Ausnahme #102, EU-Symbole), der
 * Lauf löschte sie still, −17 statt −4 Zeilen.
 *
 * @param {string[]} vorspann  aus `teileDatei`
 * @param {string} neuerKopf   endet mit der Zeile `// Site: …`
 * @returns {{ vorspann: string[], ersetzt: boolean }}
 */
export function kopfErsetzen(vorspann, neuerKopf) {
  if (!ERZEUGTER_KOPF.test(vorspann[0] ?? '')) return { vorspann, ersetzt: false };
  const site = vorspann.findIndex((z) => /^\/\/ Site: /.test(z));
  if (site === -1) throw new Error('Erzeugter Kopf ohne Zeile `// Site: …` — von Hand prüfen.');
  const fremd = fremdeKopfZeile(vorspann.slice(0, site));
  if (fremd) {
    throw new Error(`Kopf weicht ab Zeile ${fremd.nr} von jeder erzeugten Fassung ab („${fremd.text || '(leere Zeile)'}“) — `
      + 'ein Lauf löschte sie. Eigene Absätze hinter `// Site: …` verschieben, umformulierte Generatorzeilen '
      + 'zurücksetzen, dann neu laufen.');
  }
  return { vorspann: [...neuerKopf.replace(/\n+$/, '').split('\n'), ...vorspann.slice(site + 1)], ersetzt: true };
}

/**
 * Erste Zeile des alten Kopfs, die keine bekannte Fassung erklärt, oder `null`.
 *
 * Erklärt heißt: die Zeilen kommen der Reihe nach in einer Fassung vor (Teilfolge). Fehlende
 * Zeilen sind harmlos, das Ersetzen stellt sie wieder her. Eingeschobene oder von Hand
 * umformulierte Zeilen nicht: sie stehen in keiner Fassung und gingen verloren.
 * Gemeldet wird die Zeile, bis zu der die beste Fassung gekommen ist.
 * @param {string[]} kopf  Zeilen vor `// Site: …`
 */
export function fremdeKopfZeile(kopf) {
  const ist = kopf.map((z) => z.trimEnd());
  let beste = 0;
  for (const fassung of [KOPF_ZEILEN, ...FRUEHERE_KOEPFE]) {
    let j = 0;
    let i = 0;
    for (; i < ist.length; i++) {
      while (j < fassung.length && fassung[j] !== ist[i]) j++;
      if (j === fassung.length) break;
      j++;
    }
    if (i === ist.length) return null;
    beste = Math.max(beste, i);
  }
  return { nr: beste + 1, text: ist[beste].slice(0, 80) };
}

/**
 * Die Pfade, unter denen die Laufzeit nach der Herkunft einer Bilddatei fragt.
 *
 * - `public/x/y.webp` → `x/y.webp` (dist-relativ, so stehen die Präfixe in der Datei);
 * - `src/…/y.webp` → der Repo-Pfad selbst und `_astro/y.webp`: Die Assetpipeline legt das Bild
 *   als `_astro/y.<hash>.webp` ab, zur Laufzeit trifft es nur über den Stem.
 *
 * @param {Iterable<string>} dateien  Repo-relative Pfade (Schrägstriche)
 * @returns {string[]}
 */
export function laufzeitPfade(dateien) {
  const out = new Set();
  for (const roh of dateien) {
    const d = String(roh ?? '').replace(/\\/g, '/').replace(/^\/+/, '');
    if (!BILD_EXT.test(d)) continue;
    if (d.startsWith('public/')) out.add(d.slice('public/'.length));
    else if (d.startsWith('src/')) { out.add(d); out.add(`_astro/${d.split('/').pop()}`); }
  }
  return [...out];
}

/**
 * Für welche Bilder entfiele die Kennzeichnung, wenn die alten Regeln durch die gemischten
 * ersetzt werden? Die Antwort kommt von der Laufzeit selbst (`resolveBildHerkunft`), nicht
 * aus einem Nachbau ihrer Rangfolge.
 *
 * Anlass (cw-core#280, Punkt 1): `ueberstimmt` erkannte einen neuen Präfix über einem
 * gekennzeichneten Stem nur, wenn der Präfix genau auf diesen Stamm endete. Zur Laufzeit schlägt
 * aber jeder Pfad-Treffer jeden Stem-Treffer: `pathPrefix: 'images/'` mit `herkunft: 'mensch'`
 * hob die Kennzeichnung von `stem: 'hero-ki'` für `images/hero-ki.webp` still auf. Heute
 * latent: 0 von 236 `pathPrefix`-Regeln in 21 Kundendateien sind Verzeichnisse (09.11.2026).
 *
 * @param {object[]} altRegeln  der Bestand, ausgewertet
 * @param {object[]} neuRegeln  das Ergebnis des Mischens, ausgewertet
 * @param {Iterable<string>} pfade  Laufzeitpfade der Bilder (`laufzeitPfade`)
 * @returns {string[]}  die Pfade, die vorher kennzeichnungspflichtig waren und es danach nicht sind
 */
export function kennzeichnungWegZurLaufzeit(altRegeln, neuRegeln, pfade) {
  const pflichtig = (regeln, p) => pflichtigZurLaufzeit(resolveBildHerkunft({ bildHerkunft: regeln }, p));
  return [...new Set(pfade)].filter((p) => pflichtig(altRegeln, p) && !pflichtig(neuRegeln, p)).sort();
}

/**
 * Zahl der Regelzeilen in einem Rumpf.
 * @param {string[]} rumpf
 */
export const regelZahl = (rumpf) => schluesselListe(rumpf).length;
