/**
 * vorschau-basis — welcher Host liefert die Seite gerade wirklich aus?
 *
 * ANLASS (19.10.2026, cw-core#175): Die WhatsApp-Kachel zur LeVia-Vorschau zeigte nur ein
 * Favicon. `og:image` und `og:url` standen absolut auf `siteData.url`, der späteren
 * Kundendomain — und dort lief in der Pre-Sale-Phase noch die alte Seite (404). Gemessen
 * an allen sechs Vorschauen: 6 von 6 kaputt (404, 301 oder Domain gar nicht erreichbar).
 * `og-pages.js` hat den Fehler nicht verursacht, aber übernommen: es baut die URL des
 * erzeugten Bildes aus `og:url`.
 *
 * REGEL
 * Vercel setzt in jedem Build `VERCEL_PROJECT_PRODUCTION_URL`. Hängt am Projekt noch keine
 * eigene Domain, steht dort `customer-<slug>.vercel.app` — genau der Host, unter dem der
 * Kunde die Vorschau öffnet. Dieselbe Unterscheidung trifft schon der Vercel-Abgleich im
 * Domain-Guard (`ai-discovery/index.ts`, „Ground-Truth gegen Vercel“).
 *
 * Es gibt bewusst keinen Schalter pro Kunde. Beim Go-Live wird die Domain am Projekt
 * eingetragen, Vercel liefert sie ab dem nächsten Build selbst, und die Tags zeigen ohne
 * Handgriff wieder auf die Kundendomain. Ein Schalter wäre die Zeile, die beim Go-Live
 * jemand vergisst.
 *
 * Lokal (Gate, `pnpm build`) fehlen die Variablen — dort bleibt alles beim Alten.
 */

import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';

/**
 * Basis-URL der Vorschau oder `null`, wenn der Build keine Vorschau ist.
 *
 * @param {Record<string, string | undefined>} [env]
 * @returns {string | null}
 */
export function vorschauBasis(env = process.env) {
  if (env.VERCEL !== '1') return null;
  const host = (env.VERCEL_PROJECT_PRODUCTION_URL ?? '').trim().replace(/^https?:\/\//, '').replace(/\/+$/, '');
  if (!host || !host.endsWith('.vercel.app')) return null;
  return `https://${host}`;
}

/**
 * Host aus `og:image` einer Seite, sofern er nicht der Vorschau-Host ist — sonst `null`.
 * Eine Seite ohne `og:image` oder mit relativem Wert ist kein Treffer: dafür gibt es
 * eigene Prüfungen, und ein Fehlalarm hier würde die echte Meldung verdünnen.
 *
 * @param {string} html
 * @param {string} basis Rückgabe von `vorschauBasis()`
 * @returns {string | null}
 */
export function fremderOgHost(html, basis) {
  const m = html.match(/<meta\s+property="og:image"\s+content="([^"]*)"/);
  if (!m) return null;
  let host;
  try {
    host = new URL(m[1]).host;
  } catch {
    return null;
  }
  return host === new URL(basis).host ? null : host;
}

/**
 * Alle Seiten im dist, deren `og:image` auf einen fremden Host zeigt.
 *
 * @param {string} dist
 * @param {string} basis
 * @returns {Promise<Array<{ seite: string, host: string }>>}
 */
export async function seitenMitFremdemOgHost(dist, basis) {
  const treffer = [];
  const lauf = async (dir) => {
    for (const e of await readdir(dir)) {
      const p = join(dir, e);
      if ((await stat(p)).isDirectory()) await lauf(p);
      else if (e.endsWith('.html')) {
        const host = fremderOgHost(await readFile(p, 'utf8'), basis);
        if (host) treffer.push({ seite: '/' + relative(dist, p).replace(/\\/g, '/'), host });
      }
    }
  };
  await lauf(dist);
  return treffer;
}
