// @ts-check
/**
 * @cw/core – split-text-units
 *
 * Zerlegt bereits gerendertes HTML in animierbare Einheiten: jedes Wort (oder
 * Zeichen) im Text bekommt ein `<span data-motion-text-unit>` mit gestaffeltem
 * `transition-delay`. Inline-Markup (`<br>`, `<strong>`) bleibt unangetastet.
 *
 * ## Warum das hier passiert statt im Browser
 *
 * `TextReveal.astro` hat diese Zerlegung bis 11.08.2026 zur Laufzeit gemacht:
 * ein Inline-Script lief beim Parsen, lief den TreeWalker ab und tauschte die
 * Textknoten gegen Spans. Dafür brauchte jede Instanz eine eigene ID, um sich
 * selbst wiederzufinden — und die kam aus `Math.random()`. Zwei Builds
 * derselben Quelle erzeugten damit unterschiedliches HTML (blitzsicht-ops#650).
 *
 * Serverseitig zerlegt gibt es weder eine ID noch ein Script noch eine
 * DOM-Mutation nach dem ersten Paint: das endgültige Layout steht ab dem ersten
 * Byte. Das ist auch der Grund, warum die Zerlegung nicht bloss in ein
 * gebündeltes Modul verschoben wurde — ein Umbau der Zeilenumbrüche NACH dem
 * Paint ist genau die CLS-Quelle, die diese Komponente mobil schon einmal
 * hatte (0,29 am 08.07.2026).
 *
 * ## Escaping
 *
 * Die Eingabe ist bereits gerendertes, escaptes HTML (`Astro.slots.render()`).
 * Diese Funktion escapt deshalb NICHTS und darf es auch nicht — sie fügt nur
 * `<span>`-Klammern um Textstücke ein, die schon in ihrer Endform vorliegen.
 * Entities werden dabei als eine Einheit behandelt: `&amp;` zeichenweise zu
 * zerlegen ergäbe fünf Spans und auf der Seite den sichtbaren Text „&amp;".
 * (Die frühere Browser-Fassung hatte genau diesen Fehler; `split="char"` war
 * mit Entities nie benutzbar.)
 *
 * @example
 *   splitTextUnits('Hallo Welt', { split: 'word', start: 0, delay: 0.04 })
 *   // '<span data-motion-text-unit style="transition-delay:0s">Hallo</span>
 *   //  <span data-motion-text-unit style="transition-delay:0.04s">Welt</span>'
 *
 * @typedef {'word' | 'char'} TextSplitMode
 * @typedef {{ split: TextSplitMode, start: number, delay: number }} SplitTextUnitsOptions
 */

/**
 * Elemente, deren Inhalt kein Text im Sinne der Anzeige ist. Ihr Inhalt wird
 * unverändert durchgereicht — ein `<span>` in einem `<script>` wäre Code, kein
 * Wort. In einem TextReveal-Slot gehört nichts davon hin; die Liste ist die
 * Sicherung, nicht die Erwartung.
 */
const OPAQUE_ELEMENTS = ['script', 'style', 'textarea', 'title'];

/**
 * Eine HTML-Entity am Stück: benannt (`&amp;`), dezimal (`&#8217;`) oder
 * hexadezimal (`&#x2019;`). Nur im Zeichen-Modus gebraucht.
 */
const ENTITY_RE = /^&(?:#\d+|#[xX][0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/;

/**
 * Formatiert eine Verzögerung als CSS-Zeit ohne Gleitkomma-Rauschen.
 *
 * `0 + 3 * 0.04` ist in IEEE-754 `0.12000000000000001`. Als Attributwert wäre
 * das zwar deterministisch, aber es stünde 20 Zeichen Rauschen in jedem
 * dritten Span. Vier Nachkommastellen sind für Sekunden mehr als genug.
 *
 * @param {number} seconds
 * @returns {string}
 */
export function formatDelay(seconds) {
  if (!Number.isFinite(seconds)) return '0s';
  return `${Number(seconds.toFixed(4))}s`;
}

/**
 * Zerlegt ein Textstück (kein Markup) in Einheiten.
 *
 * Whitespace bleibt roher Text und bekommt keinen Span — sonst wären die
 * Wortabstände `inline-block` und der Zeilenumbruch bräche an falscher Stelle.
 * Gleiche Regel wie in der früheren Browser-Fassung (`!u.trim()` → Textknoten).
 *
 * @param {string} text
 * @param {TextSplitMode} mode
 * @returns {string[]}
 */
export function splitSegment(text, mode) {
  if (mode === 'word') return text.split(/(\s+)/).filter((u) => u !== '');

  /** @type {string[]} */
  const units = [];
  let i = 0;
  while (i < text.length) {
    const entity = ENTITY_RE.exec(text.slice(i));
    if (entity) {
      units.push(entity[0]);
      i += entity[0].length;
      continue;
    }
    // Array.from-Semantik: ganze Code-Points, damit Emoji und zusammengesetzte
    // Zeichen nicht in Surrogat-Hälften zerfallen.
    const codePoint = String.fromCodePoint(/** @type {number} */ (text.codePointAt(i)));
    units.push(codePoint);
    i += codePoint.length;
  }
  return units;
}

/**
 * Findet das Ende eines Tags ab `start` (Index von `<`).
 *
 * Beachtet Anführungszeichen in Attributwerten: `<a title="a > b">` endet nicht
 * am ersten `>`. Kommentare werden als Block behandelt.
 *
 * @param {string} html
 * @param {number} start
 * @returns {number} Index NACH dem schliessenden `>`, oder `html.length` wenn
 *   das Tag unabgeschlossen ist (kaputtes Markup wird durchgereicht, nicht
 *   repariert).
 */
export function findTagEnd(html, start) {
  if (html.startsWith('<!--', start)) {
    const end = html.indexOf('-->', start + 4);
    return end === -1 ? html.length : end + 3;
  }
  /** @type {string | null} */
  let quote = null;
  for (let i = start + 1; i < html.length; i++) {
    const ch = html[i];
    if (quote) {
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === '>') return i + 1;
  }
  return html.length;
}

/**
 * Liest den Tag-Namen eines ÖFFNENDEN Tags in Kleinschreibung.
 * Schluss-Tags (`</strong>`) liefern bewusst `''` — nach `<` steht dort `/`.
 *
 * @param {string} html
 * @param {number} start
 * @returns {string}
 */
function tagNameOf(html, start) {
  const match = /^<\s*([a-zA-Z][a-zA-Z0-9-]*)/.exec(html.slice(start, start + 32));
  return match ? match[1].toLowerCase() : '';
}

/**
 * Wickelt jedes Wort (bzw. Zeichen) des Textes in ein `<span>` mit
 * gestaffeltem `transition-delay`. Markup bleibt unverändert.
 *
 * @param {string} html Bereits gerendertes, escaptes HTML.
 * @param {SplitTextUnitsOptions} opts
 * @returns {string}
 */
export function splitTextUnits(html, opts) {
  const { split, start, delay } = opts;
  if (!html) return '';

  let out = '';
  let index = 0; // laufende Nummer der Einheit — über den ganzen Slot, nicht pro Textstück

  /**
   * Hängt ein Textstück zerlegt an `out` an.
   * @param {string} segment
   */
  const appendUnits = (segment) => {
    for (const unit of splitSegment(segment, split)) {
      if (!unit.trim()) {
        out += unit;
        continue;
      }
      out += `<span data-motion-text-unit style="transition-delay:${formatDelay(
        start + index * delay,
      )}">${unit}</span>`;
      index += 1;
    }
  };

  let i = 0;
  while (i < html.length) {
    const next = html.indexOf('<', i);

    if (next === -1) {
      appendUnits(html.slice(i));
      break;
    }

    if (next > i) appendUnits(html.slice(i, next));

    const tagEnd = findTagEnd(html, next);
    const name = tagNameOf(html, next);

    if (name && OPAQUE_ELEMENTS.includes(name)) {
      // Inhalt und Schluss-Tag am Stück durchreichen.
      const closing = new RegExp(`</\\s*${name}\\s*>`, 'i').exec(html.slice(tagEnd));
      const blockEnd = closing ? tagEnd + closing.index + closing[0].length : html.length;
      out += html.slice(next, blockEnd);
      i = blockEnd;
      continue;
    }

    out += html.slice(next, tagEnd);
    i = tagEnd;
  }

  return out;
}
