// page-config.ts — Shared layout props, abgeleitet aus site-data.ts
// Kopiere diese Datei nach src/data/page-config.ts und passe TODOs an.
//
// Zweck: Alle Seiten nutzen `{...landingBaseProps}` / `{...contentProps(title)}`
// statt jede Seite einzeln zu verdrahten. Einzige Quelle: siteData.
//
// AI-SEO: schemaConfig verdrahtet seo.*-Felder vollständig — nicht leerlassen.
import { siteData } from './site-data';
import type { SchemaProps } from '@cw/core/layouts/BaseLayout.astro';

export const footerConfig = {
  siteName: siteData.name,
  tagline: siteData.tagline,
  description: siteData.description,
  email: siteData.contact.email,
  phone: siteData.contact.phone || undefined,
  logoSrcDark: '/logo-inverted.svg',
  owner: siteData.legal.owner,
  legalForm: siteData.legal.form,
  city: siteData.legal.city,
  leistungenLinks: siteData.nav.footer.leistungen,
  rechtlichesLinks: siteData.nav.footer.rechtliches,
  showKarriereLink: siteData.karriere?.enabled !== false,
} as const;

export const headerConfig = {
  navItems: siteData.nav.main,
  showKarriereLink: siteData.karriere?.enabled !== false,
  logoSrcDark: '/logo-inverted.svg',
} as const;

/**
 * Schema.org LocalBusiness — alle seo.*-Felder aus site-data.ts verdrahten.
 * Nicht ausfüllen = Feature fehlt für alle AI-Suchmaschinen (Google AI Overviews,
 * ChatGPT Search, Perplexity). Lohnt sich: +20–40% Zitierbarkeit laut GEO-Studie.
 */
export const schemaConfig: SchemaProps = {
  name: siteData.name,
  description: siteData.description,
  url: siteData.url,
  ogImage: siteData.seo.ogImage,
  street: siteData.legal.street,
  zip: siteData.legal.zip,
  city: siteData.legal.city,
  country: siteData.legal.country,
  email: siteData.contact.email,
  phone: siteData.contact.phone || undefined,
  // --- AI-SEO Felder — aus site-data.ts befüllen ---
  sameAs: siteData.seo.sameAs,
  areaServed: siteData.seo.areaServed.length ? siteData.seo.areaServed : 'DE',
  knowsAbout: siteData.seo.knowsAbout,
  openingHours: siteData.seo.openingHours,
  foundingDate: siteData.seo.foundingDate,
  geo: siteData.seo.geo,
  // Leistungen → hasOfferCatalog (AI-Agenten lesen das für Produkt-Vergleiche)
  // TODO: anpassen falls siteData.packages eine andere Struktur hat
  services: siteData.packages?.map((p: { name: string; subtitle?: string }) => ({
    label: p.name,
    shortDesc: p.subtitle,
    href: '/pakete',
  })),
};

export const landingBaseProps = {
  siteName: siteData.name,
  siteUrl: siteData.url,
  defaultTitle: siteData.seo.defaultTitle,
  defaultDescription: siteData.seo.defaultDescription,
  defaultOgImage: siteData.seo.ogImage,
  titleTemplate: siteData.seo.titleTemplate,
  plausibleScript: siteData.analytics?.plausibleScript,
  plausibleEndpoint: siteData.analytics?.plausibleEndpoint,
  header: headerConfig,
  footer: footerConfig,
  schema: schemaConfig,
  motion: { smoothScroll: true, progress: true } as const,
};

export const contentProps = (title: string) => ({
  ...landingBaseProps,
  title,
});
