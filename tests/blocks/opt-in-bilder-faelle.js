// @ts-check
/**
 * Prop-Sätze für die Opt-in-Erweiterungen „Bilder statt Symbole, Hero-Hintergrund,
 * Logo-Badges, Lightbox, Nav-Trenner“ (v0.171.0, Anlass haarwerk 08.10.2026).
 *
 * Geteilt zwischen dem Test (`opt-in-bilder.test.js`) und dem einmaligen Erzeugen des
 * Golden-Fixtures `fixtures/opt-in-bilder-v0.170.0.json`, das VOR der Änderung aus
 * v0.170.0 gerendert wurde. Alle Fälle hier setzen KEINE der neuen Props — sie belegen,
 * dass die Flotte ohne Opt-in Byte für Byte dasselbe Markup bekommt.
 */

/** @type {Record<string, { datei: string, props: Record<string, unknown> }>} */
export const FAELLE = {
  heroOhneBild: {
    datei: 'src/components/blocks/Hero.astro',
    props: { headline: 'Schnitt mit Zeit.', subtext: 'Seit 2014 in Neutraubling.', siteName: 'Testsalon', badge: 'Meisterbetrieb' },
  },
  heroSplitImageSrc: {
    datei: 'src/components/blocks/Hero.astro',
    props: {
      headline: 'Schnitt mit Zeit.',
      siteName: 'Testsalon',
      badge: 'Meisterbetrieb',
      imageSrc: '/images/hero.webp',
      imageWidth: 1200,
      imageHeight: 800,
      imageAlt: 'Salon',
      ctaSecondary: { label: 'Öffnungszeiten', href: '#zeiten' },
      usps: [{ icon: '✂︎', title: 'Mit Termin' }, { icon: '◷', title: 'Mo–Sa' }],
    },
  },
  heroUspsStagger: {
    datei: 'src/components/blocks/Hero.astro',
    props: {
      headline: 'Ohne Termin.',
      siteName: 'Testsalon',
      badge: 'Im Markt',
      usps: [{ icon: '⌖', title: 'Im Markt' }],
      motion: { stagger: true },
    },
  },
  processSteps: {
    datei: 'src/components/blocks/ProcessSteps.astro',
    props: {
      heading: 'So einfach geht es',
      subheadingTemplate: 'In {count} Schritten.',
      columns: 4,
      items: [
        { nr: 1, icon: '⌖', title: 'Hinkommen', desc: 'Im Markt.' },
        { nr: 2, icon: '◷', title: 'Warten', desc: 'Kurz.' },
        { nr: 3, icon: '✂︎', title: 'Schneiden', desc: 'Sauber.' },
        { nr: 4, icon: '→', title: 'Weiter', desc: 'Fertig.' },
      ],
    },
  },
  uspIcons: {
    datei: 'src/components/blocks/USPSection.astro',
    props: { items: [{ icon: '◷', title: 'Zeiten', description: 'Mo–Sa' }, { title: 'Ohne Icon', description: 'Nur Text' }] },
  },
  uspSvgMitHeading: {
    datei: 'src/components/blocks/USPSection.astro',
    props: {
      heading: 'Öffnungszeiten',
      subheading: 'Zwei Standorte',
      iconStyle: 'container',
      iconContainerColor: '#B9191C',
      items: [{ iconSvg: '/icons/uhr.svg', title: 'Salon', description: 'Di–Fr' }],
    },
  },
  trustCards: {
    datei: 'src/components/blocks/TrustBadges.astro',
    props: {
      heading: 'Zertifikate',
      bannerSrc: '/images/banner.webp',
      bannerAlt: 'Banner',
      badges: [{ label: 'Meisterbetrieb', description: 'HWK' }, { label: 'Ohne Text' }],
    },
  },
  trustBar: {
    datei: 'src/components/blocks/TrustBadges.astro',
    props: { variant: 'bar', background: 'surface', badges: [{ label: 'SILVER-Salon', description: 'wird in bar nicht gezeigt' }] },
  },
  leistungenGemischt: {
    datei: 'src/components/blocks/LeistungenSection.astro',
    props: {
      heading: 'Leistungen',
      subheading: 'Für alle',
      columns: 3,
      items: [
        { icon: '✂︎', title: 'Schnitt', description: 'Mit Zeit. Tel. 09401 1637', href: '/schnitt' },
        { iconSvg: '/icons/farbe.svg', title: 'Farbe', description: 'Ruf an: 09401 1637' },
        { title: 'Notdienst', description: 'Sofort', href: '/notdienst', ctaPhone: '09401 1637' },
        { icon: '◎', title: 'Ohne alles' },
      ],
    },
  },
  leistungenImageStilOhneBild: {
    datei: 'src/components/blocks/LeistungenSection.astro',
    props: { cardStyle: 'image', items: [{ icon: '✦', title: 'Galerie ohne Bild' }] },
  },
  header: {
    datei: 'src/components/layout/Header.astro',
    props: {
      siteName: 'Testsalon',
      hideBrandName: true,
      logoWidth: 150,
      logoHeight: 34,
      navItems: [
        { label: 'Salon', href: '/salon' },
        { label: 'Haarwerkstatt', href: '/werkstatt' },
        { label: 'Extern', href: 'https://example.test', target: '_blank', rel: 'noopener noreferrer' },
        { label: 'Kontakt', href: '/kontakt', highlight: true },
      ],
    },
  },
};
