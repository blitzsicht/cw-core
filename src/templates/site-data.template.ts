// site-data.ts – Single Source of Truth für Kunden-Websites
// Alle Felder mit TODO ausfüllen bevor der erste Build gestartet wird.
// Nach Ausfüllen: pnpm build → cw-audit → Score muss >90 sein.

// Markenname EINMAL hier, dann überall interpolieren. Eine Umbenennung kostet dann
// genau diese Zeile — das ist die Zusage, die der Brand-Name-Linter prüft.
const BRAND = 'TODO: Firmenname';      // z.B. "Elektro Müller"

export const siteData = {
  // ─── Basis ────────────────────────────────────────────────────────────────
  name: BRAND,
  tagline: 'TODO: Kurzslogan',         // z.B. "Ihr Elektriker in Regensburg"
  description: 'TODO: 1-2 Sätze',     // Für Meta-Description + Footer
  url: 'https://TODO.de',             // Live-URL ohne Slash am Ende

  // ─── Logo & Bilder ────────────────────────────────────────────────────────
  // Dateien liegen in public/ – Pfad beginnt mit /
  images: {
    aboutTeam: undefined as string | undefined,  // z.B. '/images/team/team.webp'
    gallery: [] as string[],           // z.B. ['/images/gallery/projekt-1.webp']
  },

  // ─── Firmendaten (Impressum) ───────────────────────────────────────────────
  legal: {
    owner: 'TODO: Vor- und Nachname', // Impressum-Pflichtfeld
    form: 'Einzelunternehmen',         // Freitext-Anzeige (z.B. "GmbH & Co. KG")
    street: 'TODO: Musterstraße 1',
    zip: 'TODO: 12345',
    city: 'TODO: Musterstadt',
    country: 'DE',
    region: undefined as string | undefined,  // Bundesland/Region → Bild-Geo-Tag XMP:State (z.B. 'Bayern')
    phone: 'TODO: +49 123 456789',    // Mit tel:-Link im Footer + Kontakt
    ustIdNr: undefined as string | undefined,
    handelsregister: undefined as string | undefined, // z.B. 'HRB 12345, Amtsgericht Regensburg'

    // ─ B0 — Compliance-Schema für cw-audit Welle 2/3 Checker ─
    // Rechtsform-Enum — bestimmt welche Felder Pflicht sind (HRB, Stammkapital etc.)
    rechtsform: 'einzelunternehmer' as
      | 'einzelunternehmer'
      | 'ek'
      | 'gbr'
      | 'egbr'
      | 'ug'
      | 'gmbh'
      | 'gmbh-co-kg'
      | 'ag',
    // Register-Enum — 'gnr' für eGbR seit MoPeG 01.01.2024
    register: 'none' as 'none' | 'hrb' | 'hra' | 'gnr' | 'vr',
    registerNummer: undefined as string | undefined,
    registergericht: undefined as string | undefined,
    // Explizite USt-ID-Pflicht (Kleinunternehmer § 19 UStG → false)
    hasUstId: false,
    // Erlaubnispflichtige Tätigkeit? (Handwerk, Lebensmittel, Finanzen, Heilberufe…)
    aufsichtspflichtig: false,
    aufsichtsbehoerde: undefined as { name: string; url: string } | undefined,
    // § 5 Nr. 5 DDG — reglementierte Berufe (Kammerzugehörigkeit)
    kammerMitglied: false,
    kammer: undefined as
      | {
          name: string;
          berufsbezeichnung: string;
          verleihungsStaat: string;
          berufsrechtLink: string;
        }
      | undefined,
    // § 36 VSBG — nur bei Unternehmen >10 MA
    vsbgPflichtig: false,
  },

  // ─── Content-Klassifikation (für § 18 MStV-Check) ─────────────────────────
  // Hat die Site journalistisch-redaktionelle Inhalte (Blog/News)?
  // → true erfordert V.i.S.d.P.-Angabe (§ 18 Abs. 2 MStV)
  content: {
    hasEditorial: false,
  },

  // ─── Kontakt ───────────────────────────────────────────────────────────────
  contact: {
    email: 'TODO: info@firma.de',
    phone: 'TODO: +49 123 456789',    // Gleich wie legal.phone
    web3formsKey: 'TODO',             // web3forms.com → kostenlos registrieren, Access Key kopieren
    calUrl: '',                       // Optional: Cal.com-Booking-URL (z.B. 'https://cal.eu/firma/30min')
  },

  // ─── Analytics ─────────────────────────────────────────────────────────────
  analytics: {
    // First-Party-Proxy (Standard): onboard-site verdrahtet /js/script.js + /api/event
    // als Vercel-Rewrite auf stats.blitzsicht.com/js/<pa-ID>.js. Diese beiden Pfade
    // hier eintragen (NICHT die plausible.io-URL):
    plausibleScript: '/js/script.js',
    plausibleEndpoint: '/api/event',
    // trackingMode: 'full' NUR setzen, wenn die Site zusätzlich <PlausibleEvents />
    // mountet (voller Event-Satz inkl. CTA/Paid Visit). Ohne Mount 'inline' lassen
    // (= weglassen); 'full' ohne Mount schaltet die Auto-Listener ab → keine Events.
    // trackingMode: 'full',
  },

  // ─── SEO ───────────────────────────────────────────────────────────────────
  seo: {
    // titleTemplate BEWUSST nicht gesetzt: BaseLayout leitet `%s | ${siteData.name}`
    // selbst ab (BaseLayout.astro:212). Nur setzen, wenn eine ABWEICHENDE Form gewollt
    // ist (Kurzform, anderes Trennzeichen) — und dann die Marke interpolieren, nicht
    // ausschreiben: titleTemplate: `%s · ${BRAND}`. Ein Template, das exakt
    // `%s | <Name>` wiederholt, meldet der Brand-Name-Linter als redundant.
    //
    // Homepage-Title: "<Hauptkeyword> <Ort> – <USP> | <Brand>" → max. 60 Zeichen
    // Lokal-SEO: Geo-Keyword IMMER im Title. Bsp: "Elektriker Regensburg – 24h Notdienst | Müller"
    // BRAND interpolieren statt ausschreiben — sonst kostet jede Umbenennung eine Suche
    // über alle Felder, und der Brand-Name-Linter meldet das Literal.
    defaultTitle: `TODO: Hauptkeyword Ort – USP | ${BRAND}`,
    defaultDescription: 'TODO: 1-2 Sätze mit Geo + Zielgruppe + USP für Google-Snippet (150-160 Zeichen)',
    // OG-Image Fallback-Chain (BaseLayout, 5 Levels): 1. Seiten-ogImage-Prop →
    // 2. heroImage → 3. contentImage → 4. generiertes /og/default.png →
    // 5. DIESES Feld (defaultOgImage via page-config, immer vorhanden, letzter Fallback).
    // Setup: `pnpm generate:og --name "..." --cta "..." --logo public/logo.png --out public/og/default.png`
    ogImage: '/og/og-image.png',       // 1200×630px — letzter OG-Fallback (Level 5)
    // Schema.org LocalBusiness — verbessert Knowledge Panel + AI-Suche
    areaServed: [] as string[],             // z.B. ['Regensburg', 'Barbing', 'Lappersdorf']
    sameAs: [] as string[],                 // Social-Profile-URLs: Google Business, LinkedIn, etc.
    knowsAbout: [] as string[],             // Fachthemen: ['Webdesign', 'DSGVO', ...] — AI-Zitierbarkeit
    // Explizite Bild-Keyword-Tags (IPTC:Keywords/XMP:Subject in den dist-Bildern).
    // Leer lassen → geotag-core synthetisiert aus knowsAbout + areaServed + leistungen.
    imageKeywords: [] as string[],
    openingHours: [] as string[],           // z.B. ['Mo-Fr 08:00-17:00']
    foundingDate: undefined as string | undefined,  // z.B. '2015'
    geo: undefined as { latitude: number; longitude: number } | undefined,
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

  // ─── Status-Badge im Footer (Optional, Default: nicht angezeigt) ───────────
  // Wenn gesetzt: subtiler Status-Badge unter Credit-Line, Link auf status.blitzsicht.com
  // Slug muss dem Customer-Slug in cw-uptime CUSTOMERS-Array entsprechen.
  // Beispiel:
  //   statusBadge: { slug: 'hausamlago' }
  // Override für eigenen Status-Stack (z.B. self-hosted):
  //   statusBadge: { slug: 'foo', statusUrl: 'https://status.foo.de/', badgeUrlBase: 'https://status.foo.de/badge/' }
  // statusBadge: { slug: 'TODO-customer-slug' },
} as const;

export type SiteData = typeof siteData;
