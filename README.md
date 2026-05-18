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
  scripts/
    generate-og.mjs        # OG-Image-Generator (Text-OG, Hero-Crop, Batch)
  docs/
    og-image.md            # OG-Image Fallback-Chain Dokumentation
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

Alle Blocks lesen direkt aus `siteData` — keine Props erforderlich.

| Komponente | Datenquelle |
|-----------|------------|
| `Hero` | `siteData.hero` — Split-Layout (mit Bild) oder Gradient |
| `USPSection` | `siteData.usps` |
| `LeistungenSection` | `siteData.leistungen` |
| `ProcessSteps` | `siteData.processSteps` |
| `PaketeSection` | `siteData.packages` |
| `Testimonials` | `siteData.testimonials` |
| `FAQ` | `siteData.faqs` |
| `CTABlock` | `siteData.cta` |
| `KarriereHero` | `siteData.karriere` |
| `ArbeitgeberVorteile` | `siteData.karriere.vorteile` |
| `StellenListe` | `siteData.karriere.stellen` |
| `BewerbungsForm` | `siteData.karriere` |

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
- Open Graph + Twitter Card (mit `og:image:width/height`)
- `LocalBusiness + ProfessionalService` JSON-LD (Adresse, Kontakt, sameAs)
- `WebSite` JSON-LD
- Plausible-Analytics-Script (nur wenn `siteData.analytics.plausibleScript` gesetzt)

### PriceSpecSchema — Maschinenlesbare Preise

`PriceSpecSchema.astro` generiert ein `schema.org/PriceSpecification`-JSON-LD-Block für Pricing-Pages. Ziel: AI-Citations bei Preis-Queries ("Was kostet X?") in ChatGPT, Perplexity, Google AI Overviews.

```astro
---
import PriceSpecSchema from '@cw/core/components/seo/PriceSpecSchema.astro';

const preise = [
  // Fester Preis (nur minPrice)
  {
    name: 'Kurzgutachten',
    description: 'Beweiswert-Gutachten für einfache Schäden',
    minPrice: 350,
    unit: 'pro Gutachten',
  },
  // Preisrange (minPrice + maxPrice)
  {
    name: 'Vollgutachten',
    description: 'Umfassendes Kfz-Schadengutachten nach GRG',
    minPrice: 500,
    maxPrice: 1200,
    unit: 'pro Gutachten',
  },
  // Blitzsicht Website-Pakete
  {
    name: 'Website Starter',
    minPrice: 1490,
    currency: 'EUR',
    unit: 'einmalig',
  },
  {
    name: 'Website Business',
    minPrice: 2490,
    maxPrice: 3490,
    currency: 'EUR',
    unit: 'einmalig',
  },
];
---
<!-- Im <head> oder direkt im Layout -->
<PriceSpecSchema items={preise} />
```

**Props:**

| Prop | Typ | Pflicht | Default | Beschreibung |
|------|-----|---------|---------|--------------|
| `items` | `PriceItem[]` | ja | — | Liste der Preispositionen |

**PriceItem-Interface:**

| Feld | Typ | Pflicht | Beschreibung |
|------|-----|---------|--------------|
| `name` | `string` | ja | Leistungsname |
| `description` | `string` | nein | Kurzbeschreibung |
| `minPrice` | `number` | ja | Mindest- oder Festpreis |
| `maxPrice` | `number` | nein | Höchstpreis (→ Preisrange) |
| `currency` | `string` | nein | ISO-Währungscode, Default `"EUR"` |
| `unit` | `string` | nein | Einheit, z.B. `"pro Gutachten"` (wird in description eingefügt) |

**Generiertes Schema:** `ItemList` mit je einem `Offer` + `PriceSpecification` pro Item. Bei nur `minPrice` → fester Preis. Bei `minPrice` + `maxPrice` → Range (`minPrice`/`maxPrice` im Schema).

## OG Image Fallback-Chain

`BaseLayout` implementiert eine 5-stufige Fallback-Chain für `og:image`:

| Level | Quelle |
|-------|--------|
| 1 | `ogImage` Prop (explizit an LandingPage/ContentPage) |
| 2 | `siteData.hero.image` (automatisch via LandingPage) |
| 3 | `contentImage` Prop (erstes Bild im Seiteninhalt) |
| 4 | `/og/default.png` (generiert mit Logo+CTA-Overlay) |
| 5 | `siteData.images.ogImage` (konfiguriertes Standard-OG) |

**Level 4 generieren** (einmalig beim Kunden-Onboarding):

```bash
pnpm add -D sharp   # im Kunden-Projekt
node node_modules/@cw/core/scripts/generate-og.mjs \
  --name "Firmenname" \
  --cta "Jetzt anfragen" \
  --logo public/logo.png \
  --out public/og/default.png
```

Vollständige Doku: [`docs/og-image.md`](./docs/og-image.md)

## Styling-Konventionen

- Tailwind v4 via `@tailwindcss/vite` Plugin (kein `tailwind.config.js`)
- Brand-Farben als CSS Custom Properties in der Kunden-`tokens.css` (z. B. `--color-primary`, `--color-accent`)
- `tokens-base.css` stellt Utility-Klassen bereit, setzt aber kein `@import "tailwindcss"` — das macht die Kunden-`tokens.css`
- Keine Google Fonts (DSGVO) — ausschließlich System-UI Stack

## AI-Discovery Integration

`@cw/core/integrations/ai-discovery` generiert zur Build-Zeit automatisch `/llms.txt` und
`/llms-full.txt` nach dem [llmstxt.org](https://llmstxt.org) Standard, damit KI-Agenten
(ChatGPT, Claude, Perplexity u. a.) die Website korrekt verstehen und zitieren können.

```ts
// astro.config.ts
import aiDiscovery from '@cw/core/integrations/ai-discovery';

export default defineConfig({
  integrations: [
    aiDiscovery({
      siteData: () => import('./src/data/site-data').then(m => m.siteData),
      faqs: (s) => s.faqs,
      services: (s) => s.leistungen,
    }),
  ],
});
```

Pflichtfelder in `siteData`: `name`, `description`, `url`, `contact`, `legal`.

Generierte Dateien nach `pnpm build`:
- `dist/llms.txt` — Kurzfassung (Name, Beschreibung, Leistungen, Kontakt)
- `dist/llms-full.txt` — Vollständige Fassung mit Leistungsdetails und FAQs

Vollständige Dokumentation: [`docs/ai-discovery.md`](./docs/ai-discovery.md)

## Versions-Tagging

```bash
git tag v1.0.6
git push origin v1.0.6
```

Kundensites referenzieren das Paket via GitHub-Tag:
```json
"@cw/core": "github:siluri/cw-core#v1.0.6"
```
