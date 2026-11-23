// Fixture für tests/email-signature/signatur-kunden-layout.test.js (Bytegleichheit Layout b).
// GmbH & Co. KG (Sonderzeichen & im Firmenblock), Buchungs- und Bewertungsknopf,
// deutsche Registerschreibweise. Werte erfunden.
export const siteData = {
  name: 'Fixture Bau',
  tagline: 'Wir bauen das.',
  url: 'https://fixture-bau.example',

  persons: [
    {
      slug: 'carla-fixture',
      name: 'Carla Fixture',
      position: 'Bauleitung',
      email: 'carla@fixture-bau.example',
      phone: '+49 941 222222',
      layout: 'b',
    },
  ],

  legal: {
    form: 'GmbH & Co. KG',
    owner: 'Fixture Bau GmbH & Co. KG',
    street: 'Baustraße 12',
    zip: '93055',
    city: 'Regensburg',
    email: 'info@fixture-bau.example',
    phone: '+49 941 222220',
    ustIdNr: 'DE111222333',
    register: 'hra',
    registerNummer: '7788',
    registergericht: 'Amtsgericht Regensburg',
    representatives: ['Fixture Bau Verwaltungs GmbH'],
  },

  booking: {
    url: 'https://cal.example/fixture-bau',
    label: 'Baustellentermin',
  },

  gmb: {
    review_url: 'https://g.page/r/fixture-bau/review',
  },
};
