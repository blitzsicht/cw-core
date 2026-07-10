/**
 * ImageObject Schema-Generator.
 *
 * schema.org/ImageObject ist DAS strukturierte Bild-Signal, das Google Images +
 * KI-Suche (AI Overviews, Perplexity) auswerten — deutlich relevanter fürs
 * Bild-Ranking als eingebettete EXIF-Daten (die Google beim Ausliefern strippt).
 *
 * Bewusst OHNE `@context` — dieses Objekt wird als eingebetteter Knoten in einem
 * größeren Schema verwendet (z.B. als `image` einer LocalBusiness), nicht als
 * eigenständiges Top-Level-`<script type="application/ld+json">`.
 *
 * `width`/`height` sind optional und werden NUR gesetzt, wenn die echten Maße
 * bekannt sind — falsche Maße sind schlechter als keine (Rich-Results-Warnung).
 */

export type ImageObjectInput = {
  /** Absolute Bild-URL. Wird als url UND contentUrl gesetzt. */
  url: string;
  /** Optionaler @id-Anker (z.B. `${site}/#primaryimage`) für Entity-Referenzen. */
  id?: string;
  /** Bildunterschrift/Alt-Text — das stärkste beschreibende Signal. */
  caption?: string;
  /** Breite in px — nur setzen wenn tatsächlich bekannt. */
  width?: number;
  /** Höhe in px — nur setzen wenn tatsächlich bekannt. */
  height?: number;
  /** Sichtbarer Credit-Text (Google Images "Credit"). */
  creditText?: string;
  /** Copyright-Hinweis, z.B. "© Firma GmbH". */
  copyrightNotice?: string;
  /** @id-Referenz auf die erstellende Entity (Organization/Person). */
  creatorId?: string;
  /** Lizenz-URL — schaltet zusammen mit acquireLicensePage den "Licensable"-Badge frei. */
  license?: string;
  /** URL zum Lizenz-Erwerb (Google-Empfehlung für Licensable). */
  acquireLicensePage?: string;
};

export function imageObjectSchema(input: ImageObjectInput): Record<string, unknown> {
  const schema: Record<string, unknown> = {
    "@type": "ImageObject",
    url: input.url,
    contentUrl: input.url,
  };
  if (input.id) schema["@id"] = input.id;
  if (input.caption) schema.caption = input.caption;
  if (typeof input.width === "number") schema.width = input.width;
  if (typeof input.height === "number") schema.height = input.height;
  if (input.creditText) schema.creditText = input.creditText;
  if (input.copyrightNotice) schema.copyrightNotice = input.copyrightNotice;
  if (input.creatorId) schema.creator = { "@id": input.creatorId };
  if (input.license) schema.license = input.license;
  if (input.acquireLicensePage) schema.acquireLicensePage = input.acquireLicensePage;
  return schema;
}
