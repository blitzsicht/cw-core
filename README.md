# @cw/core

Gemeinsame Astro-Komponenten, Layouts und Styles für Blitzsicht-Kundenseiten.

## Konzept

`cw-core` ist eine rein datengetriebene Komponentenbibliothek. Jede Kundensite bringt nur drei Dinge mit:

1. `src/data/site-data.ts` — alle Inhalte (Single Source of Truth)
2. `src/styles/tokens.css` — Markenfarben als CSS Custom Properties
3. `src/pages/*.astro` — Seitenassemblierung (meistens nur Block-Stacking)

Alles andere (Header, Footer, SEO, Schema.org, Blocks, ContactForm, Layouts) kommt unverändert aus diesem Paket.

## Voraussetzungen

```
astro >= 5.0.0
tailwindcss >= 4.0.0
```

## Installation (in Kundensites)

```jsonc
// package.json
{
  "dependencies": {
    "@cw/core": "github:siluri/cw-core#v1.0.5"
  }
}
```

```
pnpm install
```

## Struktur

```
cw-core/
  components/
    blocks/          # Seitenabschnitte (Hero, USPs, Leistungen, Pakete …)
    forms/           # ContactForm (Kontakt / Audit / Bewerbung)
    layout/          # Header, Footer
    seo/             # SchemaOrg JSON-LD
  layouts/
    BaseLayout.astro       # HTML-Shell: SEO, OG, Schema, Plausible, Favicons
    LandingPage.astro      # BaseLayout + Header + <main> + Footer
    ContentPage.astro      # BaseLayout + Header + Prose-Container + Footer
  styles/
    tokens-base.css        # Shared Utility-Klassen (.btn-accent, .container …)
  templates/
    site-data.template.ts  # Annotiertes Template für neue Kunden
    tokens.template.css    # CSS-Token-Template mit WCAG-Hinweisen
    vercel.template.json   # Security-Header-Basis für Vercel
```

## Layouts

| Layout | Verwendung |
|--------|-----------|
| `LandingPage` | Alle Marketing-Seiten (Homepage, Pakete, Kontakt …) |
| `ContentPage` | Impressum, Datenschutz (styled prose container) |

```astro
---
import { LandingPage } from '@cw/core/layouts/LandingPage.astro';
---
<LandingPage title="Startseite">
  <slot />
</LandingPage>
```

## Block-Komponenten

Alle Blocks sind **prop-driven** — die Seite liest `siteData` und reicht die passenden Felder als Props durch. So bleibt `@cw/core` frei von Import-Abhängigkeiten auf Kunden-Datenmodule.

| Komponente | Typische Props (aus `siteData`) |
|-----------|---------------------------------|
| `Hero` | `headline`, `subtext`, `ctaPrimary`, `usps={siteData.usps}` |
| `USPSection` | `items={siteData.usps}` |
| `LeistungenSection` | `items={siteData.leistungen}` |
| `ProcessSteps` | `steps={siteData.processSteps}` |
| `PaketeSection` | `items={siteData.packages}` |
| `Testimonials` | `items={siteData.testimonials}` |
| `FAQ` | `items={siteData.faqs}` |
| `CTABlock` | `headline`, `cta={siteData.cta}` |
| `KarriereHero` | `karriere={siteData.karriere}` |
| `ArbeitgeberVorteile` | `benefits={siteData.karriere.vorteile}` |
| `StellenListe` | `stellen={siteData.karriere.stellen}` |
| `BewerbungsForm` | `karriere={siteData.karriere}` |

## Rechtliche Blöcke (DSGVO)

### InformationspflichtBlock — Datenschutz-Kontakt

`InformationspflichtBlock` rendert die Informationspflichten nach Art. 13 DSGVO.

**Wichtig: Kein automatisches `datenschutz@<domain>` mehr (ab v0.10.1)**

Die Komponente generiert keine fiktive `datenschutz@`-Adresse mehr aus dem `email`-Prop.
Stattdessen gilt folgende Priorität für den Datenschutz-Kontakt:

1. **`datenschutzEmail`-Prop gesetzt** → wird direkt verwendet (für Kunden mit echter `datenschutz@`-Mailbox)
2. **`email`-Prop gesetzt** → wird direkt für Datenschutzanfragen verwendet (empfohlen für Kleinbetriebe)
3. **Beide leer** → kein Mail-Block, stattdessen Hinweis "Kontaktdaten siehe Impressum"

```astro
<!-- Empfohlen: email direkt für Datenschutzanfragen -->
<InformationspflichtBlock
  legal={siteData.legal}
  email={siteData.contact.email}
  companyName={siteData.name}
  branche="handwerk"
/>

<!-- Optional: explizite Datenschutz-Mailbox (nur wenn diese real existiert!) -->
<InformationspflichtBlock
  legal={siteData.legal}
  email={siteData.contact.email}
  datenschutzEmail="datenschutz@example.com"
  branche="druck"
/>
```

## Motion-System (ab v0.5.0-alpha)

Opt-in Motion-Primitives für „Flashy Landing-Page"-Look. Alle Komponenten
respektieren `prefers-reduced-motion: reduce` und schalten sich dort komplett ab.
Desktop-only Features (Custom Cursor, Lenis Smooth-Scroll) sind auf Touch-Geräten
automatisch deaktiviert.

### Optionale Peer-Dependencies

```
gsap  >= 3.12   (optional — nur nötig wenn SmoothScroll mit ScrollTrigger-Sync genutzt wird)
lenis >= 1.1    (optional — nur nötig für SmoothScroll)
```

Installiert in der Kundensite mit `pnpm add gsap lenis`.

### Komponenten

| Komponente | Zweck |
|-----------|-------|
| `motion/ScrollReveal` | Fadet/slidet Slot-Inhalt beim Scrollen ein (up/down/left/right/zoom/fade). |
| `motion/StaggerGroup` | Reveal für Kindelemente mit konfigurierbarem Stagger. |
| `motion/ParallaxImage` | Y-Parallax auf Bilder beim Scrollen (rAF-basiert, kein GSAP nötig). |
| `motion/TextReveal` | Splittet Text in Wörter/Zeichen und blendet sie gestaffelt ein. |
| `motion/CountUp` | Zahlen-Counter der beim Scroll in den Viewport eased. |
| `motion/AnimatedBlob` | Organischer Mesh-Gradient-Hintergrund (CSS+SVG, kein WebGL). |
| `motion/SmoothScroll` | Lenis-Init (Desktop-only, touch-/reduced-motion-sicher). |
| `motion/ScrollProgress` | Fixe Accent-Progress-Bar am oberen Viewport-Rand. |
| `motion/CustomCursor` | Ersetzt den System-Cursor durch einen Follow-Circle (Desktop). |
| `motion/MagneticButton` | CTA wird magnetisch zum Cursor gezogen (on-demand rAF, `(hover: hover)`-Check, harter Offset-Cap). |
| `motion/TiltCard` | Karte bekommt subtiles 3D-Tilt auf Hover (rAF-Lerp während Hover, CSS-Transition nur beim Verlassen). |

### Hero mit Motion

```astro
<Hero
  headline={siteData.hero.headline}
  ...
  motion={{ blob: true, textReveal: true, stagger: true, parallax: true }}
/>
{/* oder abkürzend: motion={true} aktiviert alle vier Effekte */}
```

### Global Motion-Layer via LandingPage

```astro
<LandingPage
  {...landingBaseProps}
  motion={{ smoothScroll: true, progress: true, cursor: true }}
>
  <Hero ... motion={true} />
  <ScrollReveal direction="up"><LeistungenSection ... /></ScrollReveal>
  <ScrollReveal direction="up"><USPSection ... /></ScrollReveal>
  ...
</LandingPage>
```

### Sektion-Reveals

```astro
---
import ScrollReveal from '@cw/core/components/motion/ScrollReveal.astro';
import StaggerGroup from '@cw/core/components/motion/StaggerGroup.astro';
---
<ScrollReveal direction="up" delay={0.1}>
  <h2>Headline</h2>
</ScrollReveal>

<StaggerGroup direction="up" gap={0.1}>
  <Card />
  <Card />
  <Card />
</StaggerGroup>
```

### Magnetic CTA + TiltCard (v0.6.0-alpha)

Hover-Primitives für mehr wahrgenommene Interaktivität ohne Bundle-Bloat.
Beide respektieren `prefers-reduced-motion` und laufen nur auf Hybrid- oder
Desktop-Pointer-Geräten (`(hover: hover) and (pointer: fine)`).

**MagneticButton** — zieht den Slot-Inhalt (meist ein CTA-Link) Richtung
Cursor. Nur auf Primary-CTA einsetzen; mehrere magnetische Buttons auf einer
Seite wirken wie Demo. Defaults sind konservativ: `strength 0.2`, harter
Offset-Cap bei 18 px.

```astro
---
import MagneticButton from '@cw/core/components/motion/MagneticButton.astro';
---
<MagneticButton>
  <a href="/kontakt" class="btn-accent">Beratung anfragen</a>
</MagneticButton>
```

Am Hero direkt per Flag aktivieren (wrappt automatisch nur den Primary-CTA):

```astro
<Hero ... motion={{ blob: true, textReveal: true, magnetic: true }} />
```

**TiltCard** — 3D-Tilt auf Hover. Defaults absichtlich subtil
(`maxTilt: 6`, `scale: 1.01`). **Bevorzugt auf Pakete/Offer-Cards** —
dort wo Entscheidungen fallen. Auf textlastigen Cards (Testimonials)
entweder weglassen oder per Prop runterdimmen.

```astro
---
import TiltCard from '@cw/core/components/motion/TiltCard.astro';
---
<TiltCard>
  <div class="paket-card">…</div>
</TiltCard>

<!-- oder über Block-Prop: -->
<PaketeSection items={siteData.packages} tilt={true} />
<Testimonials items={siteData.testimonials} tilt={false} /> <!-- Default, bewusst aus -->
```

### BentoGrid (v0.6.0-alpha, Layout-Primitive)

Asymmetrisches Grid für Feature-Kacheln. Kein Runtime-JS — reine
CSS-Grid mit optionalem Column-/Row-Spanning. Ersetzt keine semantische
Block-Komponente, sondern verdichtet Informations-Kacheln.

**Layout-Dramaturgie (wichtig!):** BentoGrid wirkt nur bei harter
Hierarchie. Eine dominante Kachel (`span: { cols: 2, rows: 2 }`), zwei
semi-dominante mit voller Copy, Rest als Support. Ohne Hierarchie wird
es zur Dribbble-Fassade — Content erst, Spans danach.

```astro
---
import BentoGrid from '@cw/core/components/blocks/BentoGrid.astro';
---
<BentoGrid
  heading="Warum Blitzsicht"
  columns={4}
  items={[
    // 1 dominante Kachel
    {
      title: 'Fertig in 7 Werktagen',
      eyebrow: 'Garantie',
      description: 'Vom Briefing zum Go-Live. Source-Code gehört Ihnen.',
      icon: '⚡',
      accent: true,
      span: { cols: 2, rows: 2 },
    },
    // 2 semi-dominante (volle Copy)
    {
      title: 'Ohne Cookie-Banner',
      icon: '🍪',
      description: 'Plausible Analytics: DSGVO-konform ohne Einwilligung.',
    },
    {
      title: 'Kein Vendor-Lock-in',
      icon: '🔓',
      description: 'Astro + GitHub. Jederzeit zu anderem Dienstleister portierbar.',
    },
    // Support-Kacheln (kurz)
    { title: 'Feste Pakete',           icon: '📦' },
    { title: 'Echte Ansprechpartner',  icon: '👤' },
    { title: 'DSGVO-konforme Forms',   icon: '✉️' },
  ]}
/>
```

Link-Kacheln rendern automatisch als `<a>` (A11y-konform, mit
`:focus-visible`-Outline); Daten-Kacheln als `<article>`. Accent-Farbe
nutzt `--color-accent` + optionales `--color-accent-foreground` für
Kontrast-Override. Auf Mobile kollabiert das Grid auf eine Spalte; alle
Spans werden automatisch neutralisiert.

### Brand-weit deaktivieren

Einfach `motion={...}` / `motion={true}` weglassen — alle Heros / LandingPages
rendern dann wie bisher (statisch). Kein Code-Change in `@cw/core` nötig.

## Usage

### Komponenten und Layouts importieren

```astro
---
import BaseLayout   from '@cw/core/layouts/BaseLayout.astro';
import LandingPage  from '@cw/core/layouts/LandingPage.astro';
import Hero         from '@cw/core/components/blocks/Hero.astro';
import USPSection   from '@cw/core/components/blocks/USPSection.astro';
import Footer       from '@cw/core/components/layout/Footer.astro';
import { siteData } from '@/data/site-data';
---
<LandingPage title={siteData.seo.title}>
  <Hero
    headline={siteData.hero.headline}
    subtext={siteData.hero.subtext}
    ctaPrimary={siteData.hero.ctaPrimary}
    usps={siteData.usps}
    siteName={siteData.name}
  />
  <USPSection items={siteData.usps} />
</LandingPage>
```

### Typen importieren (IDE-Autocomplete)

Alle öffentlichen Props-Typen werden vom Paket-Root re-exportiert:

```ts
import type {
  HeroCTA, HeroUSP,
  USPItem, LeistungItem, PaketeItem,
  FAQItem, Testimonial, ProcessStep,
  BenefitItem, StelleItem, StelleTyp,
  FooterLink, NavItem,
  SchemaProps,
  SubmitOptions, SubmitResult,
  SiteData,
} from '@cw/core';

const cta: HeroCTA = { label: 'Beratung anfragen', href: '/kontakt' };
```

### Form-Submission-Helper importieren

```ts
import { submitForm } from '@cw/core/utils/forms/submit';
import type { SubmitResult } from '@cw/core';

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const result: SubmitResult = await submitForm(form, { actionUrl: '/api/contact' });
  if (result.ok) showSuccess(); else showError(result.error);
});
```

## ContactForm

Drei Varianten über `formType`:

```astro
<!-- Kontaktformular -->
<ContactForm formType="contact" />

<!-- Audit-Formular (URL + E-Mail) mit JSON-POST an eigenes Backend -->
<ContactForm formType="audit" actionUrl="/api/audit-hook" />

<!-- Bewerbungsformular -->
<ContactForm formType="bewerbung" />
```

Submission-Varianten:
- **Web3Forms** (Default): kein Backend nötig, Schlüssel in `siteData.contact.web3formsKey`
- **Custom actionUrl**: sendet JSON via Fetch, ideal für eigene Vercel Functions

Features: Loading-Spinner, Honeypot-Spamschutz, Inline-Erfolg/Fehler-Zustand, No-JS-Fallback (mailto).

## Neue Kundensite aufsetzen

1. Neues Repo von der Blitzsicht-Template klonen
2. `templates/site-data.template.ts` → `src/data/site-data.ts` kopieren und alle `// TODO`-Felder ausfüllen
3. `templates/tokens.template.css` → `src/styles/tokens.css` kopieren und Markenfarben eintragen
4. `pnpm install` → `pnpm dev`

## SEO & Schema.org

`BaseLayout` generiert automatisch:
- `<title>`, Meta-Description, Canonical
- Open Graph + Twitter Card
- `LocalBusiness + ProfessionalService` JSON-LD (Adresse, Kontakt, sameAs)
- `WebSite` JSON-LD
- Plausible-Analytics-Script (nur wenn `siteData.analytics.plausibleScript` gesetzt)

## Styling-Konventionen

- Tailwind v4 via `@tailwindcss/vite` Plugin (kein `tailwind.config.js`)
- Brand-Farben als CSS Custom Properties in der Kunden-`tokens.css` (z. B. `--color-primary`, `--color-accent`)
- `tokens-base.css` stellt Utility-Klassen bereit, setzt aber kein `@import "tailwindcss"` — das macht die Kunden-`tokens.css`
- Keine Google Fonts (DSGVO) — ausschließlich System-UI Stack

## Versions-Tagging

```bash
git tag v1.0.6
git push origin v1.0.6
```

Kundensites referenzieren das Paket via GitHub-Tag:
```json
"@cw/core": "github:siluri/cw-core#v1.0.6"
```

## Plausible-Analytics (v0.9.8)

Cookieless Plausible-Analytics-Integration als wiederverwendbare Components
unter `src/components/analytics/`. Eingerichtet mit § 25 TDDDG-konformer
Architektur: keine Cookies, keine Schreib-Operationen in Browser-Speicher,
kein persistenter Identifier (Hash-Salt-Verfahren serverseitig bei Plausible).

### Komponenten

| Datei | Zweck |
|---|---|
| `components/analytics/Plausible.astro` | Lädt das Plausible-Script + Queue-Shim. Ein-Komponente-Drop-In im `<head>`. |
| `components/analytics/PlausibleEvents.astro` | Verdrahtet automatisch Custom-Events: Phone, WhatsApp, Email, CTA, Form, Scroll-Depth. |
| `components/analytics/plausible-events.ts` | TypeScript-Helper `trackPlausible(event, props)` plus `PlausibleEvents`-Konstanten für Custom-Events. |

### Standard-Setup in einer Customer-Site

```astro
---
import BaseLayout from '@cw/core/layouts/BaseLayout.astro';
import Plausible from '@cw/core/components/analytics/Plausible.astro';
import PlausibleEvents from '@cw/core/components/analytics/PlausibleEvents.astro';
---
<BaseLayout {...layoutProps}>
  <Plausible
    script="https://plausible.io/js/pa-WUMcQbxNSCakRDQwOktmA.js"
    endpoint="/api/event"
  />
  <PlausibleEvents />
  <slot />
</BaseLayout>
```

Alternativ kann die Plausible-Integration weiterhin über die bestehenden
BaseLayout-Props (`plausibleScript`, `plausibleHost`, `plausibleEndpoint`)
inline verdrahtet werden — beide Wege sind kompatibel.

### Self-Hosted-Migration-Hook

Ab Customer 15 ist ein Wechsel von plausible.io zu einer self-hosted
Instanz (z.B. Hetzner) vorgesehen. Die Migration erfolgt über zwei
Env-Variablen, ohne dass jede Customer-Site einzeln umgestellt werden muss:

```bash
# .env.production an der Customer-Site
PLAUSIBLE_SCRIPT_URL=https://stats.blitzsicht.com/js/script.js
PLAUSIBLE_DOMAIN=customer-domain.de
```

Im Astro-Template:

```astro
<Plausible
  script={import.meta.env.PLAUSIBLE_SCRIPT_URL ?? 'https://plausible.io/js/pa-XYZ.js'}
  domain={import.meta.env.PLAUSIBLE_DOMAIN}
/>
```

`domain` wird als `data-domain`-Attribut auf das Script gesetzt — Plausible
benutzt diesen Wert zur Site-Zuordnung serverseitig. Kein per-Customer-Code
nötig.

### Custom-Events emittieren

Aus inline `<script>`-Blöcken (kein Module-Import, simpler):

```html
<script>
  window.plausible?.('Newsletter Signup', { props: { plan: 'free' } });
</script>
```

Aus TypeScript-Modulen (mit Type-Safety):

```ts
import { trackPlausible, PlausibleEvents } from '@cw/core/components/analytics/plausible-events';

trackPlausible(PlausibleEvents.PhoneClick, { location: 'header' });
trackPlausible('Newsletter Signup', { plan: 'free' }); // beliebige String-Events
```


---

## Status-Badge im Footer (seit v0.15.0)

Optionales Trust-Asset: rendert subtilen Status-Badge unter dem Credit-Line,
verlinkt auf [status.blitzsicht.com](https://status.blitzsicht.com/).

In `page-config.ts`:
```ts
export const footerConfig = {
  siteName: siteData.name,
  // ... andere props ...
  statusBadge: { slug: 'hausamlago' },  // Slug aus cw-uptime CUSTOMERS-Array
};
```

Optional-Felder für eigenen Status-Stack (z.B. self-hosted):
```ts
statusBadge: {
  slug: 'foo',
  statusUrl: 'https://status.foo.de/',
  badgeUrlBase: 'https://status.foo.de/badge/',
  alt: 'Systemstatus',
}
```

Backward-compatible: wenn `statusBadge` nicht gesetzt, rendert Footer wie bisher.
