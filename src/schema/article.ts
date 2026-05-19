/**
 * Article Schema-Generator (Plan-Phase 1.2).
 * Für BehindTheJob-Component, Blog-Posts, FAQ-Antworten >150 Zeichen.
 */

export type ArticleInput = {
  headline: string;
  /** ISO 8601 — z.B. '2026-05-19' */
  datePublished: string;
  /** ISO 8601 — optional, fallback auf datePublished */
  dateModified?: string;
  description?: string;
  url: string;
  /** Author als Organization (Default) oder Person. */
  author: {
    type: "Organization" | "Person";
    name: string;
    url?: string;
  };
  /** Publisher: Organization mit Logo. */
  publisher: {
    name: string;
    logo: string; // absolute URL
  };
  image?: string | string[];
  /** Article-Body als Plain-Text (kein HTML). */
  articleBody?: string;
  /** Mainentity (für FAQ-artige Articles): die Question-Answer-Paare. */
  mainEntity?: Record<string, unknown>;
};

export function articleSchema(input: ArticleInput): Record<string, unknown> {
  const schema: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: input.headline,
    datePublished: input.datePublished,
    dateModified: input.dateModified ?? input.datePublished,
    url: input.url,
    author: {
      "@type": input.author.type,
      name: input.author.name,
      ...(input.author.url && { url: input.author.url }),
    },
    publisher: {
      "@type": "Organization",
      name: input.publisher.name,
      logo: {
        "@type": "ImageObject",
        url: input.publisher.logo,
      },
    },
  };

  if (input.description) schema.description = input.description;
  if (input.image) schema.image = Array.isArray(input.image) ? input.image : [input.image];
  if (input.articleBody) schema.articleBody = input.articleBody;
  if (input.mainEntity) schema.mainEntity = input.mainEntity;

  return schema;
}
