// @ts-check
/**
 * Prop-Sätze für SchemaOrg.astro — geteilt zwischen dem Test und dem einmaligen
 * Erzeugen des Golden-Fixtures (`fixtures/schemaorg-v0.162.1.json`, VOR #895 gerendert).
 */
export const BASIS = {
  name: 'Testbetrieb GmbH',
  description: 'Ein Betrieb für Tests.',
  url: 'https://example.test',
  ogImage: '/og/start.png',
  logoUrl: 'https://example.test/logo.svg',
  street: 'Hauptstraße 1',
  zip: '93047',
  city: 'Regensburg',
  country: 'DE',
  email: 'info@example.test',
  phone: '+49 941 123456',
};

/** @type {Record<string, Record<string, unknown>>} */
export const FAELLE = {
  // Alles gesetzt, was der Knoten kennt.
  voll: {
    ...BASIS,
    areaServed: ['Regensburg', 'Barbing'],
    priceRange: '€€€',
    sameAs: ['https://www.facebook.com/test'],
    openingHours: ['Mo-Fr 08:00-17:00'],
    geo: { latitude: 49.01, longitude: 12.1 },
    foundingDate: '2010-01-01',
    slogan: 'Gut getestet.',
    numberOfEmployees: 12,
    additionalTypes: ['RealEstateAgent'],
    employees: [{ name: 'Erika Muster', role: 'Leitung', credentials: ['Meisterin'] }],
    services: [{ label: 'Prüfen', shortDesc: 'Wir prüfen.', href: '/pruefen' }],
    service: { label: 'Prüfen', shortDesc: 'Wir prüfen.', href: '/pruefen' },
    knowsAbout: ['Testen'],
    founder: { name: 'Max Muster', jobTitle: 'Gründer' },
  },
  // Produktseiten-Muster: keine Öffnungszeiten, Defaults für priceRange/areaServed.
  ohneZeiten: { ...BASIS, openingHours: [] },
};
