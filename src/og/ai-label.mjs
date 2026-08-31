/**
 * @cw/core/og/ai-label — die KI-Offenlegung nach Art. 50 Abs. 4 UAbs. 1 AI Act für
 * Satori-gerenderte OG-Vorschaubilder.
 *
 * WARUM EIN EIGENES MODUL UND NICHT `AiLabel.astro`
 * Satori nimmt keine Astro-Komponenten entgegen (nur `{type, props}`-Objekte aus `h.mjs`)
 * und kennt kein `<style>`, keine Media-Queries, kein `:has()` — alles Dinge, auf denen
 * `AiLabel.astro`/`AiLabelAmBild.astro` aufbauen. Wiederverwendet werden nur die reinen
 * Bausteine: die SVG-Rohdateien und `logoImg()` aus `brand.mjs` (liest die viewBox, hält
 * das Seitenverhältnis — dieselbe Funktion, die schon Logos in die Templates setzt).
 *
 * Nur die DECKENDE Fassung (eigener Pillenhintergrund, siehe `AiLabel.astro`-Kopf: 21:1
 * bzw. 16,88:1 unabhängig vom Bild) — eine transparente Fassung bräuchte dieselbe
 * Kontrastgarantie, die Satori-Templates aber nicht herstellen können, weil das
 * OG-Bild kein Live-DOM ist, an dem sich das nachträglich prüfen ließe.
 *
 * Analog `beschriftung="im-alt"` in `AiLabel.astro`: kein eigenes Textelement. Ein Text
 * NEBEN dem Symbol bräuchte Platz, den ein Social-Preview-Thumbnail nicht hat, und die
 * textliche Fassung für Screenreader/Übersetzung gehört ohnehin an `og:image:alt` (HTML,
 * nicht Pixel) — dieselbe Aufteilung, die die siluri.de-Kennzeichnung für ihre statischen
 * OG-Bilder schon fährt. `og:image:alt` selbst ist NICHT Teil dieses Moduls.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { h } from './h.mjs';
import { logoImg } from './brand.mjs';

const ASSET_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'ai-labels');

const DATEIEN = {
  'ki-erzeugt': { schwarz: 'ai-generated-black.svg', weiss: 'ai-generated-white.svg' },
  'ki-veraendert': { schwarz: 'ai-modified-black.svg', weiss: 'ai-modified-white.svg' },
};

/** Lazy + gecacht: die SVGs ändern sich nicht zwischen zwei Aufrufen desselben Builds. */
const cache = new Map();
function ladeSvg(herkunft, farbe) {
  const datei = DATEIEN[herkunft]?.[farbe];
  if (!datei) {
    throw new Error(
      `[cw-core/og:ai-label] herkunft "${herkunft}" oder farbe "${farbe}" unbekannt — erwartet ` +
        `herkunft ki-erzeugt|ki-veraendert, farbe schwarz|weiss.`,
    );
  }
  if (!cache.has(datei)) cache.set(datei, readFileSync(join(ASSET_DIR, datei)));
  return cache.get(datei);
}

/**
 * Positioniertes Satori-Element mit dem EU-Badge — „unten links", dieselbe Ecke wie
 * `AiLabelAmBild.astro` (siehe dort für die über die Flotte gemessene Begründung).
 * `left`/`bottom` sind relativ zum nächsten `position:relative`-Vorfahren im Baum, wie
 * bei normalem CSS.
 *
 * @param {object} o
 * @param {'ki-erzeugt'|'ki-veraendert'|null|undefined} o.herkunft
 *   Ohne Wert wird `null` zurückgegeben — die Komponente entscheidet selbst, ob sie
 *   rendert, wie `AiLabel.astro` es auch tut.
 * @param {'schwarz'|'weiss'} [o.farbe="schwarz"]  aus `labelFarbeFuerBild()`
 * @param {number} [o.hoehe=72]  Pixelhöhe auf der 1200×630-Leinwand — deutlich größer als
 *   die `1.15em`-Web-Größe, weil ein OG-Bild meist als kleines Vorschaubild in einem Feed
 *   erscheint und dort trotzdem „deutlich wahrnehmbar" bleiben muss.
 * @param {number} [o.links=40]
 * @param {number} [o.unten=36]
 * @returns {object|null} Satori-Element, oder `null` wenn `herkunft` fehlt
 */
export function aiLabelElement(o = {}) {
  const { herkunft, farbe = 'schwarz', hoehe = 72, links = 40, unten = 36 } = o;
  if (!herkunft) return null;
  return h(
    'div',
    { style: { position: 'absolute', left: links, bottom: unten, display: 'flex' } },
    logoImg(ladeSvg(herkunft, farbe), 'image/svg+xml', hoehe),
  );
}
