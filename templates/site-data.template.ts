// site-data.ts – Single Source of Truth für Kunden-Websites
// Alle Felder mit TODO ausfüllen bevor der erste Build gestartet wird.
// Nach Ausfüllen: pnpm build → cw-audit → Score muss >90 sein.

export const siteData = {
  // ─── Basis ────────────────────────────────────────────────────────────────
  name: 'TODO: Firmenname',            // z.B. "Elektro Müller"
  slug: '',                            // Issue #23 — URL-sicherer Kurzname für UTM-Tracking, z.B. "elektro-mueller"
  tagline: 'TODO: Kurzslogan',         // z.B. "Ihr Elektriker in Regensburg"
  description: 'TODO: 1-2 Sätze',     // Für Meta-Description + Footer
  url: 'https://TODO.de',             // Live-URL ohne Slash am Ende

  // ─── Logo & Bilder ────────────────────────────────────────────────────────
  // Dateien liegen in public/images/ – Pfad beginnt mit /
  images: {
    ogImage: '/og/og-image.png',       // 1200×630px, für Social Media Previews
    aboutTeam: undefined as string | undefined,  // z.B. '/images/team/team.webp'
    gallery: [] as string[],           // z.B. ['/images/gallery/projekt-1.webp']
  },

  // ─── Firmendaten (Impressum) ───────────────────────────────────────────────
  legal: {
    owner: 'TODO: Vor- und Nachname', // Impressum-Pflichtfeld
    form: 'Einzelunternehmen',         // oder GmbH, UG, GbR, etc.
    street: 'TODO: Musterstraße 1',
    zip: 'TODO: 12345',
    city: 'TODO: Musterstadt',
    country: 'DE',
    phone: 'TODO: +49 123 456789',    // Mit tel:-Link im Footer + Kontakt
    ustIdNr: undefined as string | undefined,
  },

  // ─── Kontakt ───────────────────────────────────────────────────────────────
  contact: {
    email: 'TODO: info@firma.de',
    phone: 'TODO: +49 123 456789',    // Gleich wie legal.phone
    web3formsKey: 'TODO',             // web3forms.com → kostenlos registrieren, Access Key kopieren
    calendlyUrl: '',                  // Optional: Calendly-Booking-URL
    // Optionale Adress-Überschreibung — wenn leer, wird legal.street/zip/city im Footer verwendet.
    // Nur nötig wenn die öffentliche Adresse von der Impressum-Adresse abweicht.
    address: undefined as { street: string; zip: string; city: string } | undefined,
  },

  // ─── Analytics ─────────────────────────────────────────────────────────────
  analytics: {
    // Plausible: neues Site in app.plausible.io anlegen, dann Script-URL hier eintragen
    plausibleScript: 'TODO: https://plausible.io/js/pa-XXXXXX.js',
  },

  // ─── SEO ───────────────────────────────────────────────────────────────────
  seo: {
    titleTemplate: '%s | TODO: Firmenname',
    defaultTitle: 'TODO: Firmenname – Kurzslogan',
    defaultDescription: 'TODO: 1-2 Sätze für Google-Snippet',
    ogImage: '/og/og-image.png',
  },

  // ─── Navigation ────────────────────────────────────────────────────────────
  nav: {
    main: [
      // { label: 'Leistungen', href: '/leistungen' },
      // { label: 'Über uns', href: '/ueber-uns' },
      { label: 'Pakete & Preise', href: '/pakete' },
      { label: 'Kontakt', href: '/kontakt', highlight: true },
    ],
    footer: {
      leistungen: [
        { label: 'Pakete & Preise', href: '/pakete' },
        { label: 'Kontakt', href: '/kontakt' },
      ],
      rechtliches: [
        { label: 'Impressum', href: '/impressum' },
        { label: 'Datenschutz', href: '/datenschutz' },
      ],
    },
  },

  // ─── Hero ──────────────────────────────────────────────────────────────────
  hero: {
    badge: 'TODO: Kurzer Aufhänger',  // z.B. "30 Jahre Erfahrung"
    headline: 'TODO: Headline<br/>mit Zeilenumbruch',
    subtext: 'TODO: 1-2 Sätze unter der Headline',
    // Bild optional: Split-Layout wenn gesetzt, Gradient-Only wenn nicht gesetzt
    image: undefined as string | undefined,  // z.B. '/images/hero/hero.webp' (min. 1200px breit)
    imageAlt: undefined as string | undefined,
    ctaPrimary: { label: 'Kontakt aufnehmen', href: '/kontakt' },
    ctaSecondary: undefined as { label: string; href: string } | undefined,
  },

  // ─── Leistungen / Produkte ───────────────────────────────────────────────
  // Zeigt eine Leistungs-Section auf der Startseite (wichtig für SEO + Conversion).
  // href optional: verlinkt auf eigene Leistungs-Detailseite (z.B. '/leistungen/elektro')
  leistungen: [
    { icon: '🔧', title: 'TODO: Leistung 1', description: 'TODO: 1-2 Sätze was das konkret bedeutet.', href: undefined as string | undefined },
    { icon: '⚡', title: 'TODO: Leistung 2', description: 'TODO: 1-2 Sätze was das konkret bedeutet.', href: undefined as string | undefined },
    { icon: '🏠', title: 'TODO: Leistung 3', description: 'TODO: 1-2 Sätze was das konkret bedeutet.', href: undefined as string | undefined },
    { icon: '📞', title: 'TODO: Leistung 4', description: 'TODO: 1-2 Sätze was das konkret bedeutet.', href: undefined as string | undefined },
  ],

  // ─── USPs (4 Stück empfohlen) ─────────────────────────────────────────────
  usps: [
    { icon: '⚡', title: 'TODO: USP 1', description: 'TODO: 1 Satz Erklärung' },
    { icon: '🛡️', title: 'TODO: USP 2', description: 'TODO: 1 Satz Erklärung' },
    { icon: '📞', title: 'TODO: USP 3', description: 'TODO: 1 Satz Erklärung' },
    { icon: '✅', title: 'TODO: USP 4', description: 'TODO: 1 Satz Erklärung' },
  ],

  // ─── Prozess-Schritte ─────────────────────────────────────────────────────
  processSteps: [
    { nr: '01', icon: '💬', title: 'TODO: Schritt 1', desc: 'TODO: Beschreibung' },
    { nr: '02', icon: '📋', title: 'TODO: Schritt 2', desc: 'TODO: Beschreibung' },
    { nr: '03', icon: '⚡', title: 'TODO: Schritt 3', desc: 'TODO: Beschreibung' },
    { nr: '04', icon: '🚀', title: 'TODO: Schritt 4', desc: 'TODO: Beschreibung' },
  ],

  // ─── Pakete / Preise ──────────────────────────────────────────────────────
  packages: [
    {
      name: 'Starter',
      subtitle: 'Für den Einstieg',
      priceSetup: 2490,
      priceMonthly: 79,
      pages: 'bis zu 5 Seiten',
      features: [
        'TODO: Feature 1',
        'TODO: Feature 2',
        'TODO: Feature 3',
      ],
      highlighted: false,
    },
    {
      name: 'Business',
      subtitle: 'Am beliebtesten',
      priceSetup: 4990,
      priceMonthly: 149,
      pages: 'bis zu 10 Seiten',
      features: [
        'TODO: Feature 1',
        'TODO: Feature 2',
        'TODO: Feature 3',
        'TODO: Feature 4',
      ],
      highlighted: true,
    },
    {
      name: 'Enterprise',
      subtitle: 'Für komplexe Anforderungen',
      priceSetup: 9990,
      priceMonthly: 299,
      pages: 'unbegrenzt',
      features: [
        'TODO: Feature 1',
        'TODO: Feature 2',
        'TODO: Feature 3',
        'TODO: Feature 4',
        'TODO: Feature 5',
      ],
      highlighted: false,
    },
  ],

  // ─── Testimonials (3 Stück, Platzhalter OK für Launch) ────────────────────
  testimonials: [
    {
      name: 'TODO: Vorname N.',
      role: 'TODO: Branche, Ort',
      text: 'TODO: Kurzes, echtes Zitat vom Kunden.',
      stars: 5,
    },
    {
      name: 'TODO: Vorname N.',
      role: 'TODO: Branche, Ort',
      text: 'TODO: Kurzes, echtes Zitat vom Kunden.',
      stars: 5,
    },
    {
      name: 'TODO: Vorname N.',
      role: 'TODO: Branche, Ort',
      text: 'TODO: Kurzes, echtes Zitat vom Kunden.',
      stars: 5,
    },
  ],

  // ─── FAQs (6-10 Stück) ────────────────────────────────────────────────────
  faqs: [
    { q: 'TODO: Frage 1?', a: 'TODO: Antwort 1.' },
    { q: 'TODO: Frage 2?', a: 'TODO: Antwort 2.' },
    { q: 'TODO: Frage 3?', a: 'TODO: Antwort 3.' },
    { q: 'TODO: Frage 4?', a: 'TODO: Antwort 4.' },
    { q: 'TODO: Frage 5?', a: 'TODO: Antwort 5.' },
    { q: 'TODO: Frage 6?', a: 'TODO: Antwort 6.' },
  ],

  // ─── Karriere (Default: aktiviert) ────────────────────────────────────────
  // enabled: false → Seite /karriere wird nicht gebaut, kein Nav-Link
  karriere: {
    enabled: true,
    headline: 'TODO: Karriere-Headline',
    subtext: 'TODO: Wir suchen Verstärkung für unser Team.',
    benefits: [
      { icon: '💼', title: 'TODO: Vorteil 1', description: 'TODO: Kurze Erklärung' },
      { icon: '📈', title: 'TODO: Vorteil 2', description: 'TODO: Kurze Erklärung' },
      { icon: '🤝', title: 'TODO: Vorteil 3', description: 'TODO: Kurze Erklärung' },
      { icon: '🏠', title: 'TODO: Vorteil 4', description: 'TODO: Kurze Erklärung' },
    ],
    // Leer lassen = Initiativbewerbung-Modus (kein Google for Jobs)
    stellen: [
      // { titel: 'Elektriker/in (m/w/d)', typ: 'Vollzeit', beschreibung: 'TODO...' },
    ],
    kontaktEmail: 'TODO: jobs@firma.de',  // Bewerbungen: nutzt contact.web3formsKey mit Betreff "Bewerbung bei..."
  },
} as const;

export type SiteData = typeof siteData;
