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
    email-signature/       # E-Mail-Signaturen Standard-Service
      PERSON.html.template # HTML-Template (Outlook-kompatibel, Tabellen-Layout)
      PERSON.txt.template  # Plain-Text-Fallback
      generate.sh          # PNG-Pipeline + Platzhalter-Ersetzung
      README.md            # Vollständige Dokumentation + Compliance-Check
      examples/
        digital-direkt/    # Referenzbeispiel: Melanie Steller (2026-05-12)
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
- Open Graph + Twitter Card
- `LocalBusiness + ProfessionalService` JSON-LD (Adresse, Kontakt, sameAs)
- `WebSite` JSON-LD
- Plausible-Analytics-Script (nur wenn `siteData.analytics.plausibleScript` gesetzt)

## Styling-Konventionen

- Tailwind v4 via `@tailwindcss/vite` Plugin (kein `tailwind.config.js`)
- Brand-Farben als CSS Custom Properties in der Kunden-`tokens.css` (z. B. `--color-primary`, `--color-accent`)
- `tokens-base.css` stellt Utility-Klassen bereit, setzt aber kein `@import "tailwindcss"` — das macht die Kunden-`tokens.css`
- Keine Google Fonts (DSGVO) — ausschließlich System-UI Stack

## E-Mail-Signaturen

Standard-Service für alle Customer-Sites. Generiert HTML + Plain-Text + Logo-PNG
aus `siteData.legal` — §35a HGB konform für GmbH/AG/Einzelunternehmen.

```bash
# Neue Signatur für eine Customer-Site generieren
cd customer-<name>

export NAME="Max Mustermann"
export POSITION="Vertrieb"
export EMAIL="max@firma.de"
export PHONE="+49 123 456789"
export WEBSITE_URL="firma.de"
export COLOR_PRIMARY="#312783"   # aus tokens.css
export COLOR_ACCENT="#3d7a12"    # aus tokens.css
export COMPANY_NAME="Firma GmbH"
export LEGAL_FORM="GmbH"
export GF_NAME="Max Mustermann"  # aus siteData.legal.owner
export STREET="Musterstr. 1"    # aus siteData.legal.street
export ZIP_CITY="12345 Stadt"   # aus siteData.legal
export HRB="HRB 12345"         # aus siteData.legal.handelsregister
export REGISTERGERICHT="Amtsgericht Stadt"  # aus siteData.legal.registergericht
export UST_ID="DE 123456789"   # aus siteData.legal.ustIdNr
export LOGO_SVG="public/logo.svg"
export LOGO_URL="https://firma.de/email/logo.png"
export OUT_DIR="email-signatures/max-mustermann"

bash ../cw-core/templates/email-signature/generate.sh
```

Output: `email-signatures/max-mustermann/{.html,.txt,assets/logo.png,README.md}`

Referenzbeispiel: `templates/email-signature/examples/digital-direkt/` (Melanie Steller)

## Versions-Tagging

```bash
git tag v1.0.6
git push origin v1.0.6
```

Kundensites referenzieren das Paket via GitHub-Tag:
```json
"@cw/core": "github:siluri/cw-core#v1.0.6"
```
