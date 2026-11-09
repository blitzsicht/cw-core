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
 * @param {string[]} vorspann  aus `teileDatei`
 * @param {string} neuerKopf   endet mit der Zeile `// Site: …`
 * @returns {{ vorspann: string[], ersetzt: boolean }}
 */
export function kopfErsetzen(vorspann, neuerKopf) {
  if (!ERZEUGTER_KOPF.test(vorspann[0] ?? '')) return { vorspann, ersetzt: false };
  const site = vorspann.findIndex((z) => /^\/\/ Site: /.test(z));
  if (site === -1) throw new Error('Erzeugter Kopf ohne Zeile `// Site: …` — von Hand prüfen.');
  return { vorspann: [...neuerKopf.replace(/\n+$/, '').split('\n'), ...vorspann.slice(site + 1)], ersetzt: true };
}

/**
 * Zahl der Regelzeilen in einem Rumpf.
 * @param {string[]} rumpf
 */
export const regelZahl = (rumpf) => schluesselListe(rumpf).length;
