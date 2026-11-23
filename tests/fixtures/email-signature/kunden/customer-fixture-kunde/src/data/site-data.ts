// Fixture für tests/email-signature/signatur-kunden-layout.test.js.
// Aufbau wie customer-mika-elektrotechnik (englische Registerschreibweise,
// Markenname als Konstante, Porträt je Person), Werte erfunden.
const BRAND = 'Fixture Elektro';

export const siteData = {
  name: BRAND,
  tagline: 'Strom mit Plan.',
  url: 'https://fixture-elektro.example',

  persons: [
    {
      slug: 'erika-fixture',
      name: 'Erika Fixture',
      position: 'Geschäftsführerin & Meisterin',
      email: 'erika@fixture-elektro.example',
      phone: '+49 151 1234567',
      layout: 'kunde',
      photo: 'https://fixture-elektro.example/email/erika.png',
    },
  ],

  legal: {
    form: 'GmbH',
    owner: 'Fixture Elektro GmbH',
    street: 'Musterstraße 7',
    zip: '93047',
    city: 'Regensburg',
    country: 'DE',
    email: 'info@fixture-elektro.example',
    phone: '+49 941 000000',
    ustIdNr: 'DE123456789',
    registerCourt: 'Amtsgericht Regensburg',
    registerNumber: 'HRB 12345',
    representatives: ['Erika Fixture', 'Max Fixture'],
    rechtsform: 'gmbh' as const,
    register: 'hrb' as const,
  },

  contact: {
    email: 'info@fixture-elektro.example',
    phone: '0941 000000',
  },
};
