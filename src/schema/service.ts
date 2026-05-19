/**
 * Service Schema-Generator (Plan-Phase 1.2).
 * Pro Service-Page (z.B. /leistungen/photovoltaik) ein dediziertes
 * Service-Schema mit areaServed + offers + provider.
 */

export type ServiceInput = {
  /** Service-Name (z.B. 'Photovoltaik-Installation'). */
  name: string;
  /** Beschreibung (max 200 Zeichen für Google Snippets). */
  description: string;
  url: string;
  /** Provider (LocalBusiness, in der Regel mit @id als Backlink). */
  provider: {
    name: string;
    /** Schema.org @id-Pattern: 'https://domain.de/#localbusiness' */
    id?: string;
    url?: string;
  };
  /** Service-Type (z.B. 'PhotovoltaicInstallation' oder 'PlumbingService'). */
  serviceType?: string;
  /** Areas, die der Service abdeckt (für Service-Area-Businesses). */
  areaServed?: Array<{ name: string }>;
  /** Optional: Offers mit Preis-Range. */
  offers?: Array<{
    priceRange: string;
    priceCurrency?: string; // ISO 4217, default 'EUR'
    description?: string;
  }>;
};

export function serviceSchema(input: ServiceInput): Record<string, unknown> {
  const schema: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Service",
    name: input.name,
    description: input.description,
    url: input.url,
    provider: {
      "@type": "LocalBusiness",
      name: input.provider.name,
      ...(input.provider.id && { "@id": input.provider.id }),
      ...(input.provider.url && { url: input.provider.url }),
    },
  };

  if (input.serviceType) schema.serviceType = input.serviceType;

  if (input.areaServed && input.areaServed.length > 0) {
    schema.areaServed = input.areaServed.map((area) => ({
      "@type": "Place",
      name: area.name,
    }));
  }

  if (input.offers && input.offers.length > 0) {
    schema.offers = input.offers.map((o) => ({
      "@type": "Offer",
      priceCurrency: o.priceCurrency ?? "EUR",
      priceSpecification: {
        "@type": "PriceSpecification",
        price: o.priceRange,
        priceCurrency: o.priceCurrency ?? "EUR",
      },
      ...(o.description && { description: o.description }),
    }));
  }

  return schema;
}
