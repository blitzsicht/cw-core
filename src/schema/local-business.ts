/**
 * LocalBusiness Schema-Generator — Subtype-aware (Plan-Phase 1.2).
 *
 * Hintergrund: Generic @type 'LocalBusiness' ist 2026 unter-spezifiziert.
 * Google + AI Overviews bevorzugen spezifische Subtypes (Plumber, Bakery,
 * RoofingContractor, HVACBusiness, ...). Schema.org-Hierarchie:
 *   LocalBusiness → HomeAndConstructionBusiness → Plumber
 *
 * Verwendung:
 *   import { localBusinessSchema } from '@cw/core/schema/local-business';
 *   const ld = localBusinessSchema({ businessType: 'bakery', name: 'Zink', ... });
 */

export type BusinessType =
  | "bakery"
  | "bed-and-breakfast"
  | "electrician"
  | "garden-store"
  | "general-contractor"
  | "hair-salon"
  | "hotel"
  | "hvac"
  | "lodging"
  | "plumber"
  | "professional-service"
  | "real-estate-agent"
  | "restaurant"
  | "roofing-contractor"
  | "store"
  | "wine-store"
  | "winery";

// Mapping: BusinessType (Customer-Config) → Schema.org-Subtype
const TYPE_MAP: Record<BusinessType, string> = {
  bakery: "Bakery",
  "bed-and-breakfast": "BedAndBreakfast",
  electrician: "Electrician",
  "garden-store": "GardenStore",
  "general-contractor": "GeneralContractor",
  "hair-salon": "HairSalon",
  hotel: "Hotel",
  hvac: "HVACBusiness",
  lodging: "LodgingBusiness",
  plumber: "Plumber",
  "professional-service": "ProfessionalService",
  "real-estate-agent": "RealEstateAgent",
  restaurant: "Restaurant",
  "roofing-contractor": "RoofingContractor",
  store: "Store",
  "wine-store": "WineStore",
  winery: "WineryOrVinyard",
};

export type Address = {
  streetAddress: string;
  postalCode: string;
  addressLocality: string;
  addressCountry?: string; // ISO 3166-1 alpha-2, default 'DE'
};

export type Geo = {
  latitude: number;
  longitude: number;
};

export type OpeningHoursSpec = {
  /** z.B. ['Monday', 'Tuesday', ...] oder als String 'Mo-Fr' */
  dayOfWeek: string | string[];
  opens: string;  // HH:MM
  closes: string; // HH:MM
};

export type LocalBusinessInput = {
  /** Customer-Service-Profil → Subtype-Mapping. Fallback 'LocalBusiness'. */
  businessType?: BusinessType;
  name: string;
  url: string;
  description?: string;
  /**
   * Bei Service-Area-Business OHNE Storefront: address WEGLASSEN, stattdessen
   * areaServed mit Geo-Coordinates verwenden (Google Spam-Policy 2024).
   */
  address?: Address;
  /** Pflicht für Service-Area-Businesses ohne Storefront. */
  areaServed?: Array<{ name: string; geo?: Geo }>;
  telephone?: string;
  email?: string;
  geo?: Geo;
  openingHours?: OpeningHoursSpec[];
  /** Mindestens 2 externe Profile (GMB, Facebook, Branchenbuch) für AI-EEAT. */
  sameAs?: string[];
  /** Optional: Founder/Owner Person-Reference. */
  founder?: {
    name: string;
    url?: string;
    image?: string;
  };
  /** Logo-URL (absolut). */
  logo?: string;
  /** Bilder der Geschäftsstelle (mind. 1 für lokale Sichtbarkeit). */
  image?: string[];
  /** Preis-Range, z.B. '€€' oder '€80-€500'. */
  priceRange?: string;
};

export type LocalBusinessSchema = Record<string, unknown>;

/**
 * Generiert ein LocalBusiness JSON-LD-Objekt mit korrektem Subtype.
 *
 * @example
 * localBusinessSchema({
 *   businessType: 'bakery',
 *   name: 'Zink Bäckerei',
 *   url: 'https://zinkbaeckerei.de',
 *   address: { streetAddress: '...', postalCode: '93055', addressLocality: 'Pfakofen' },
 *   telephone: '+49...',
 * })
 * // → { "@type": "Bakery", ... }
 */
export function localBusinessSchema(input: LocalBusinessInput): LocalBusinessSchema {
  const type = input.businessType ? TYPE_MAP[input.businessType] : "LocalBusiness";

  const schema: LocalBusinessSchema = {
    "@context": "https://schema.org",
    "@type": type,
    name: input.name,
    url: input.url,
  };

  if (input.description) schema.description = input.description;

  if (input.address) {
    schema.address = {
      "@type": "PostalAddress",
      streetAddress: input.address.streetAddress,
      postalCode: input.address.postalCode,
      addressLocality: input.address.addressLocality,
      addressCountry: input.address.addressCountry ?? "DE",
    };
  }

  if (input.telephone) schema.telephone = input.telephone;
  if (input.email) schema.email = input.email;

  if (input.geo) {
    schema.geo = {
      "@type": "GeoCoordinates",
      latitude: input.geo.latitude,
      longitude: input.geo.longitude,
    };
  }

  if (input.areaServed && input.areaServed.length > 0) {
    schema.areaServed = input.areaServed.map((area) => {
      const place: Record<string, unknown> = {
        "@type": "Place",
        name: area.name,
      };
      if (area.geo) {
        place.geo = {
          "@type": "GeoCoordinates",
          latitude: area.geo.latitude,
          longitude: area.geo.longitude,
        };
      }
      return place;
    });
  }

  if (input.openingHours && input.openingHours.length > 0) {
    schema.openingHoursSpecification = input.openingHours.map((oh) => ({
      "@type": "OpeningHoursSpecification",
      dayOfWeek: oh.dayOfWeek,
      opens: oh.opens,
      closes: oh.closes,
    }));
  }

  if (input.sameAs && input.sameAs.length > 0) schema.sameAs = input.sameAs;

  if (input.founder) {
    schema.founder = {
      "@type": "Person",
      name: input.founder.name,
      ...(input.founder.url && { url: input.founder.url }),
      ...(input.founder.image && { image: input.founder.image }),
    };
  }

  if (input.logo) schema.logo = input.logo;
  if (input.image && input.image.length > 0) schema.image = input.image;
  if (input.priceRange) schema.priceRange = input.priceRange;

  return schema;
}

/**
 * Validierung: Service-Area-Businesses ohne Storefront dürfen keine
 * address-Markup haben (Google-Spam-Policy). Wenn beides gesetzt: warnen.
 * Pure helper, kein side-effect.
 */
export function validateLocalBusiness(input: LocalBusinessInput): {
  valid: boolean;
  warnings: string[];
} {
  const warnings: string[] = [];

  if (!input.address && !input.areaServed) {
    warnings.push("Weder address noch areaServed gesetzt — mindestens eines pflicht für LocalBusiness.");
  }

  if (input.businessType === undefined) {
    warnings.push("businessType nicht gesetzt — Schema fällt auf generic @type 'LocalBusiness' zurück. Spezifischer Subtype empfohlen.");
  }

  if (input.sameAs && input.sameAs.length < 2) {
    warnings.push("sameAs sollte ≥2 externe Profile enthalten (GMB + Branchenbuch + Facebook) für AI-EEAT-Signal.");
  }

  return {
    valid: warnings.length === 0,
    warnings,
  };
}
