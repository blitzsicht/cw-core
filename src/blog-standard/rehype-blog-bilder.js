// rehype-Plugin für Bilder im Fließtext der Blogbeiträge (Blog-Standard, blog-check.js).
//
// Ein Markdown-Bild aus public/ kommt bei Astro als nacktes <img> ohne Maße und ohne
// loading-Attribut heraus: Layout-Sprünge (CLS) beim Nachladen, alle Bilder eager. Der
// Titel des Markdown-Bilds („Symbolbild, KI-generiert“ bzw. „Foto: …“) wird zur sichtbaren
// Bildunterschrift — so ist ein KI-Bild im Text als solches erkennbar.
//
// Aus  <p><img src="/images/…" alt="…" title="…"></p>
// wird <figure class="blog-bild"><img … width height loading="lazy" decoding="async">
//        <figcaption>…</figcaption></figure>
//
// Rohes <figure><img></figure> im Markdown bleibt unangetastet: wer HTML schreibt, setzt
// Maße und Unterschrift selbst. Herkunft: customer-blitzsicht/src/plugins (26.09.2026).
import { join } from 'node:path';

const istLeer = (n) => n.type === 'text' && !n.value.trim();

function* absaetze(knoten, eltern = null) {
  if (knoten.type === 'element' && knoten.tagName === 'p' && eltern) yield { knoten, eltern };
  for (const kind of knoten.children ?? []) yield* absaetze(kind, knoten);
}

/** @param {{ publicDir?: string, praefix?: string }} [opt] */
export default function rehypeBlogBilder({ publicDir = 'public', praefix = '/images/' } = {}) {
  const masse = new Map();
  let sharp;
  return async (baum) => {
    const treffer = [];
    for (const { knoten, eltern } of absaetze(baum)) {
      const inhalt = knoten.children.filter((k) => !istLeer(k));
      const img = inhalt[0];
      if (inhalt.length !== 1 || img.type !== 'element' || img.tagName !== 'img') continue;
      const src = String(img.properties?.src ?? '');
      if (!src.startsWith(praefix)) continue;
      treffer.push({ knoten, eltern, img, src });
    }
    if (!treffer.length) return;
    sharp ??= (await import('sharp')).default;
    for (const { knoten, eltern, img, src } of treffer) {
      if (!masse.has(src)) {
        // Fehlt die Datei, bricht sharp hier ab — gewollt: ein toter Bildpfad soll den
        // Build stoppen, nicht als kaputtes Bild live gehen.
        const meta = await sharp(join(publicDir, decodeURIComponent(src))).metadata();
        masse.set(src, { width: meta.width, height: meta.height });
      }
      const { width, height } = masse.get(src);
      const titel = img.properties.title;
      delete img.properties.title;
      Object.assign(img.properties, { width, height, loading: 'lazy', decoding: 'async' });
      const figur = {
        type: 'element', tagName: 'figure', properties: { className: ['blog-bild'] },
        children: [img, ...(titel ? [{ type: 'element', tagName: 'figcaption', properties: {}, children: [{ type: 'text', value: String(titel) }] }] : [])],
      };
      eltern.children[eltern.children.indexOf(knoten)] = figur;
    }
  };
}
