/**
 * @cw/core/integrations/sitemap-images
 *
 * Geteilte `serialize`-Factory für `@astrojs/sitemap`, die `<image:image>`-Einträge
 * an die Sitemap-Items hängt (Google Image-Sitemap-Format).
 *
 * ⚠️ DORMANT — bewusst NIRGENDWO verdrahtet. Für unsere statischen HTML-Sites ist
 * der ROI niedrig: Google findet die in-page-`<img>` ohnehin per Crawl, und ein
 * sinnvoller Eintrag bräuchte gepflegte Per-Page-Bilddaten (Galleries sind clusterweit
 * leer). Liegt bereit für den Fall, dass wir CDN-/JS-gerenderte Bilder oder große
 * Bild-Kataloge bekommen, wo eine Image-Sitemap echten Wert hätte.
 *
 * Nutzung im customer `astro.config`:
 *   import { imageSitemapSerialize, ogImageFor } from '@cw/core/integrations/sitemap-images';
 *   sitemap({
 *     serialize: imageSitemapSerialize({
 *       imagesFor: (url) => url === 'https://firma.de/' ? ogImageFor('https://firma.de', '/og/home.png', 'Firma')() : [],
 *       next: (item) => ({ ...item, changefreq: 'weekly' }),  // optionaler Weiter-Serializer
 *     }),
 *   });
 *
 * Hinweis: `@astrojs/sitemap` deklariert das `img`-Feld in seinem TS-Typ nicht immer,
 * reicht es aber ans darunterliegende `sitemap`-Paket durch → landet als
 * `<image:image><image:loc>…</image:loc></image:image>` im XML.
 */

/** Ein Bild-Eintrag für die Sitemap (nur `url` ist Pflicht). */
export type SitemapImage = {
  /** Absolute Bild-URL. */
  url: string;
  /** Bildunterschrift (`<image:caption>`). */
  caption?: string;
  /** Titel (`<image:title>`). */
  title?: string;
  /** Ort/Location (`<image:geo_location>`), z.B. 'Regensburg, Bayern'. */
  geoLocation?: string;
  /** Lizenz-URL (`<image:license>`). */
  license?: string;
};

export type ImageSitemapOptions = {
  /** Liefert die Bilder einer Seite anhand ihrer absoluten Seiten-URL (leer/undefined → keine Bilder). */
  imagesFor: (url: string) => SitemapImage[] | undefined;
  /** Optionaler Weiter-Serializer (priority/changefreq etc.), wird VOR dem Image-Anhang angewandt. */
  next?: (item: Record<string, unknown>) => Record<string, unknown>;
};

/** Nur gesetzte optionale Felder übernehmen (keine leeren XML-Tags erzeugen). */
function toImgEntry(i: SitemapImage): Record<string, unknown> {
  const e: Record<string, unknown> = { url: i.url };
  if (i.caption) e.caption = i.caption;
  if (i.title) e.title = i.title;
  if (i.geoLocation) e.geoLocation = i.geoLocation;
  if (i.license) e.license = i.license;
  return e;
}

/**
 * Baut die `serialize`-Callback-Funktion für `@astrojs/sitemap`.
 * Setzt `item.img` (Array), wenn `imagesFor(item.url)` Bilder liefert; sonst
 * bleibt das Item (nach optionalem `next`) unverändert.
 */
export function imageSitemapSerialize(options: ImageSitemapOptions) {
  return (item: Record<string, unknown>): Record<string, unknown> => {
    const base = options.next ? options.next(item) : item;
    const imgs = options.imagesFor(String(item.url)) ?? [];
    if (imgs.length === 0) return base;
    return { ...base, img: imgs.map(toImgEntry) };
  };
}

/**
 * Convenience: liefert einen `imagesFor`-kompatiblen Getter, der site-weit ein
 * einzelnes OG-/Standard-Bild (relativ oder absolut gegen `siteUrl` aufgelöst)
 * an jede Seite hängt.
 */
export function ogImageFor(siteUrl: string, ogImagePath: string, caption?: string) {
  const abs = new URL(ogImagePath, siteUrl).toString();
  const entry: SitemapImage = caption ? { url: abs, caption } : { url: abs };
  return (): SitemapImage[] => [entry];
}
