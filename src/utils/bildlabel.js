/**
 * Bindeglied zwischen der Bild-Deklaration und dem sichtbaren Label.
 *
 * Warum das hier steht und nicht in jeder Komponente:
 *
 * Bis 28.08.2026 wurde die KI-Kennzeichnung in den Kundenrepos von Hand eingebaut —
 * je Seitenvorlage Import, Auflösung, Farbmessung, Markup und CSS. Das ging so lange
 * gut, wie das Bild in einer Datei stand, die dem Kunden gehört. Es geht nicht mehr,
 * sobald cw-core das Bild selbst rendert: `Hero` und `LeistungenSection` erzeugen ihr
 * `<Image>` im eigenen Markup, und von außen ist dort nichts zu platzieren.
 *
 * Gemessen an einem Kunden: `installation.webp` steht bei mika-elektrotechnik auf zwei
 * Seiten — der Leistungsseite (dort war es kennzeichenbar) und als Kachel auf der
 * Startseite (dort nicht). Dasselbe KI-Bild war einmal offengelegt und einmal nicht.
 *
 * Die Einheit der Pflicht ist nicht das Bild, sondern die Fundstelle. Deshalb löst die
 * Komponente auf, die rendert — und diese Funktion ist die eine Stelle, an der das
 * passiert.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { resolveBildHerkunft } from './bildherkunft.js';
import { labelFarbeFuerBild } from './labelfarbe.js';

/**
 * @typedef {Object} BildLabel
 * @property {{herkunft: string, deepfake: string}} ergebnis  für AiLabel
 * @property {'hell'|'dunkel'} theme  passend zum gemessenen Untergrund
 */

/**
 * Dateisystem-Pfad zu einem Bild aus `public/`.
 *
 * Die Hälfte der bildrendernden Komponenten bekommt kein Astro-`ImageMetadata`, sondern
 * einen nackten URL-String (`/images/team/anna.webp`) — `TeamGrid`, `ReferenzenGrid`,
 * `CaseStudyBlock`, `AuthorBox`, `VideoEmbed`. Ohne Dateipfad kann die Farbmessung nicht
 * messen und fiele still auf Schwarz zurück: kontrastsicher, aber auf einem dunklen Motiv
 * die falsche Fassung.
 *
 * `process.cwd()` und nicht `import.meta.url`: In den Kundenrepos wird cw-core als
 * `node_modules/@cw/core` eingebunden, und ein relativer Weg von dieser Datei aus landete
 * im Bibliothekspaket statt im Kundenrepo. Astro läuft im Projektwurzelverzeichnis, dort
 * liegt `public/`. Dieselbe Annahme wie in `integrations/ai-discovery/index.ts`, wo der
 * Build seine `vercel.json` sucht.
 *
 * @param {unknown} src  URL-Pfad, wie er im `src`-Attribut steht
 * @returns {string|null}  Pfad auf eine existierende Datei, sonst `null`
 */
export function publicFsPath(src) {
  if (typeof src !== 'string' || !src.startsWith('/')) return null;
  // Ein Query- oder Hash-Anhang (`?v=2`) gehört zur URL, nicht zum Dateinamen.
  const rein = src.split(/[?#]/)[0];
  if (!rein || rein === '/') return null;
  const pfad = join(process.cwd(), 'public', rein);
  return existsSync(pfad) ? pfad : null;
}

/**
 * Ermittelt, ob ein Bild ein Label braucht — und in welcher Farbe.
 *
 * @param {{bildHerkunft?: unknown[]}|null|undefined} daten
 *   Objekt mit `bildHerkunft`, üblicherweise `siteData`. Fehlt es, gibt es keine
 *   Deklaration und damit auch keine Entscheidung: Rückgabe `null`.
 * @param {string|{src?: string, fsPath?: string}|null|undefined} bild
 *   Astro-`ImageMetadata` (`fsPath` nutzt die Farbmessung, `src` die Auflösung) — oder
 *   ein public-URL-String, dessen Datei über {@link publicFsPath} gesucht wird.
 * @param {{ueberlagerung?: number}} [optionen]
 *   `ueberlagerung`: Deckkraft dessen, was zwischen Bild und Label liegt (0–1).
 *   Ohne diesen Wert wird das nackte Bild gemessen — also nicht das, worauf das
 *   Badge tatsächlich sitzt.
 * @returns {Promise<BildLabel|null>}  `null`, wenn kein Label zu setzen ist.
 */
export async function bildLabel(daten, bild, optionen = {}) {
  // Ein String ist kein halbes ImageMetadata, sondern der Normalfall bei public-Bildern.
  // Die Umformung steht hier und nicht in fünf Komponenten.
  const quelle =
    typeof bild === 'string' ? { src: bild, fsPath: publicFsPath(bild) ?? undefined } : bild;

  if (!quelle || typeof quelle.src !== 'string') return null;
  if (!daten || !Array.isArray(daten.bildHerkunft) || daten.bildHerkunft.length === 0) {
    return null;
  }

  const ergebnis = resolveBildHerkunft(daten, quelle.src);

  // AiLabel entscheidet selbst, ob es etwas rendert (Pflicht ja/nein/ungeklärt). Hier
  // wird nur die Farbe gespart, wo ohnehin nichts erscheint — die Messung liest die
  // Datei, und das ist der teuerste Schritt.
  if (!ergebnis || ergebnis.deepfake !== 'ja') return { ergebnis, theme: 'hell' };

  // Ohne fsPath keine Messung: dann die kontrastsichere Vorgabe. `labelFarbeFuerBild`
  // liefert bei einem unlesbaren Bild von sich aus 'schwarz' und wirft nicht — ein
  // fehlendes Label waere der schlechtere Ausgang als ein suboptimal gefaerbtes.
  const farbe =
    typeof quelle.fsPath === 'string' && quelle.fsPath !== ''
      ? await labelFarbeFuerBild(quelle.fsPath, optionen)
      : 'schwarz';

  return { ergebnis, theme: farbe === 'weiss' ? 'dunkel' : 'hell' };
}
