// @ts-check
/**
 * @cw/core/integrations/ai-discovery/anchor-integrity-check
 *
 * Build-time-Guard gegen zwei Formen kaputter Links im ausgelieferten HTML.
 *
 * ANLASS (27.08.2026). Auf blitzsicht.com/agb/sla stand der Schluss-Absatz der
 * Seite INNERHALB eines Telefon-Links, dazu zwei leere Anker. Im Quelltext war
 * nichts davon zu sehen — die Anker-Bilanz der .astro-Datei war ausgeglichen.
 *
 * Minimal reproduziert: steht ein `<a>` als LETZTER Knoten der LETZTEN Zelle
 * einer Tabelle, macht der Astro-Compiler den Anker nach `</table>` wieder auf
 * und schluckt alles Folgende. Vier Umgehungen sind sauber — Text nach dem Link,
 * eine `<span>`-Hülle, der Link in einer anderen Zelle, ein Punkt dahinter. Es
 * hängt also allein an der Position, nicht am Inhalt.
 *
 * Gefunden hat es nicht der Blick in den Quelltext, sondern axe: `link-name`,
 * "Ensure links have discernible text". Ein Guard, der am AUSGELIEFERTEN HTML
 * misst, hätte es Monate früher gemeldet — deshalb dieser hier.
 *
 * @typedef {'anchor_reopened_after_table'|'anchor_without_name'} AnchorIssueType
 * @typedef {{ page: string, type: AnchorIssueType, detail: string }} AnchorIssue
 */

/** Bereiche ohne Markup — dort steht "<a" als Text, nicht als Element. */
function textBereiche(html) {
  const bereiche = [];
  for (const m of html.matchAll(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi)) {
    bereiche.push({ start: m.index ?? 0, ende: (m.index ?? 0) + m[0].length });
  }
  return bereiche;
}

function ohneTextBereiche(html) {
  const gesperrt = textBereiche(html);
  if (gesperrt.length === 0) return html;
  let out = '';
  let zuletzt = 0;
  for (const b of gesperrt) {
    out += html.slice(zuletzt, b.start);
    zuletzt = b.ende;
  }
  return out + html.slice(zuletzt);
}

/**
 * Anker, die direkt hinter einer schliessenden Tabelle wieder aufgehen — die
 * Signatur der Compiler-Wiedereröffnung.
 * @param {string} html
 * @returns {number}
 */
export function zaehleAnkerNachTabelle(html) {
  return [...ohneTextBereiche(html).matchAll(/<\/table\s*>\s*<a\b/gi)].length;
}

/**
 * Anker ohne erkennbaren Namen. Ein Bild, ein SVG, ein `aria-label` oder ein
 * `title` reichen als Name — nur wirklich leere Anker zählen.
 * @param {string} html
 * @returns {number}
 */
export function zaehleNamenloseAnker(html) {
  let n = 0;
  for (const m of ohneTextBereiche(html).matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a\s*>/gi)) {
    const attrs = m[1];
    const inhalt = m[2];
    if (/\baria-label(?:ledby)?\s*=|(?:^|\s)title\s*=/i.test(attrs)) continue;
    if (/<(img|svg|picture)\b/i.test(inhalt)) continue;
    if (inhalt.replace(/<[^>]*>/g, '').replace(/&nbsp;|\s/g, '') !== '') continue;
    n++;
  }
  return n;
}

/**
 * @param {{ page: string, html: string }[]} seiten
 * @returns {AnchorIssue[]}
 */
export function checkAnchorIntegrity(seiten) {
  /** @type {AnchorIssue[]} */
  const issues = [];
  for (const { page, html } of seiten) {
    const nachTabelle = zaehleAnkerNachTabelle(html);
    if (nachTabelle > 0) {
      issues.push({
        page,
        type: 'anchor_reopened_after_table',
        detail:
          `${nachTabelle}× <a> direkt hinter </table>. Steht ein Link als letzter Knoten der ` +
          'letzten Tabellenzelle, macht der Compiler ihn danach wieder auf und schluckt den ' +
          'Rest der Seite. Abhilfe: <span>-Hülle um den Link, oder Text dahinter in derselben Zelle.',
      });
    }
    const namenlos = zaehleNamenloseAnker(html);
    if (namenlos > 0) {
      issues.push({
        page,
        type: 'anchor_without_name',
        detail: `${namenlos}× <a> ohne Text, ohne Bild und ohne aria-label — für Screenreader ein Link ins Nichts.`,
      });
    }
  }
  return issues;
}
