// Fixture für tests/email-signature/signatur-kunden-layout.test.js (Bytegleichheit Layout a).
// GmbH mit Porträt und vollständigen Registerangaben. Werte erfunden.
export const siteData = {
  name: 'Fixture Heizung',
  tagline: 'Warm durch den Winter.',
  url: 'https://fixture-heizung.example',

  persons: [
    {
      slug: 'anna-fixture',
      name: 'Anna Fixture',
      position: 'Geschäftsführerin',
      email: 'anna@fixture-heizung.example',
      phone: '+49 9401 111111',
      layout: 'a',
      photo: 'https://fixture-heizung.example/email/anna.png',
    },
    {
      slug: 'bernd-fixture',
      name: 'Bernd Fixture',
      position: 'Kundendienst',
      email: 'bernd@fixture-heizung.example',
      phone: '+49 9401 111112',
      layout: 'a',
      salutation: 'Servus Bernd',
    },
  ],

  legal: {
    form: 'GmbH',
    owner: 'Fixture Heizung GmbH',
    street: 'Am Ofen 3',
    zip: '93073',
    city: 'Neutraubling',
    email: 'info@fixture-heizung.example',
    phone: '+49 9401 111110',
    ustIdNr: 'DE987654321',
    registerCourt: 'Amtsgericht Regensburg',
    registerNumber: 'HRB 54321',
    representatives: ['Anna Fixture'],
    register: 'hrb' as const,
  },
};
