/**
 * BreadcrumbList Schema-Generator (Plan-Phase 1.2 — bisher fehlend).
 *
 * Breadcrumbs.astro (existing) rendert visuelle Breadcrumbs, aber kein
 * JSON-LD. Dieser Helper schließt die Lücke.
 */

export type BreadcrumbItem = {
  /** Anzeige-Text der Crumb. */
  name: string;
  /** Absolute URL zur Page. Letzte Crumb (current page) hat optional keine URL. */
  url?: string;
};

export function breadcrumbListSchema(items: BreadcrumbItem[]): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, idx) => ({
      "@type": "ListItem",
      position: idx + 1,
      name: item.name,
      ...(item.url && { item: item.url }),
    })),
  };
}
