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
