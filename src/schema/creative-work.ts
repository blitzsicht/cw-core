/**
 * CreativeWork + Review Schema-Generator für CaseStudyBlock (Plan-Phase 1.1).
 *
 * Eine Case-Study ist konzeptionell eine CreativeWork mit optionalem
 * Review-Block (Kunden-Quote als Review).
 */

export type CaseStudyInput = {
  customer: string;
  /** Optional: Stadt/Region als Place-Reference. */
  location?: string;
  problem: string;
  approach: string;
  outcome: string;
  /** Datum der Durchführung als ISO 8601 — wenn vorhanden, in datePublished. */
  date?: string;
  /** Optional Quote vom Kunden — wird zu Review-Schema. */
  quote?: {
    text: string;
    author?: string;
    ratingValue?: number; // 1-5
  };
  /** Bilder der Case Study. */
  images?: string[];
  /** Provider (Organization, die die Arbeit ausgeführt hat). */
  provider: {
    name: string;
    url?: string;
  };
  url: string;
};

export function caseStudySchema(input: CaseStudyInput): Record<string, unknown> {
  const schema: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "CreativeWork",
    name: `Case Study: ${input.customer}${input.location ? ` (${input.location})` : ""}`,
    description: input.problem,
    url: input.url,
    creator: {
      "@type": "Organization",
      name: input.provider.name,
      ...(input.provider.url && { url: input.provider.url }),
    },
    about: {
      "@type": "Thing",
      name: input.customer,
      ...(input.location && { description: `${input.customer} in ${input.location}` }),
    },
    text: `Problem: ${input.problem}\n\nApproach: ${input.approach}\n\nOutcome: ${input.outcome}`,
  };

  if (input.date) schema.datePublished = input.date;
  if (input.images && input.images.length > 0) schema.image = input.images;
  if (input.location) {
    schema.locationCreated = {
      "@type": "Place",
      name: input.location,
    };
  }

  if (input.quote) {
    schema.review = {
      "@type": "Review",
      reviewBody: input.quote.text,
      ...(input.quote.author && {
        author: { "@type": "Person", name: input.quote.author },
      }),
      ...(input.quote.ratingValue !== undefined && {
        reviewRating: {
          "@type": "Rating",
          ratingValue: input.quote.ratingValue,
          bestRating: 5,
          worstRating: 1,
        },
      }),
      itemReviewed: {
        "@type": "Organization",
        name: input.provider.name,
      },
    };
  }

  return schema;
}
