# OG Image Fallback-Chain

`@cw/core` implementiert eine 5-stufige Fallback-Chain für Open Graph Images (`og:image`).
So wird auf jeder Seite immer ein visuell ansprechendes Bild ausgeliefert — ohne manuelle Pflege pro Seite.

> **Verfuegbarkeit:** Verfuegbar auf `release/cw-core` (portiert von PR #12 via Issue #27) und `main`.

## Fallback-Chain (Prioritaet hoch → niedrig)

| Level | Quelle | Wann aktiv |
|-------|--------|------------|
| 1 | `ogImage` Prop (explizit) | Seite hat ein spezifisches OG-Image |
| 2 | `heroImage` Prop (LandingPage) | Seite hat ein Hero-Bild (z.B. `siteData.hero.image`) |
| 3 | `contentImage` Prop | Erstes Bild im Seiteninhalt |
| 4 | `/og/default.png` (generiert) | Standard-OG mit Logo+CTA-Overlay |
| 5 | `defaultOgImage` Prop | Kunden-spezifisches Fallback |

Level 4 und 5 enthalten **Logo + CTA-Text als Overlay** (generiert via `generate-og.mjs`).

## Setup: Standard-OG Image generieren

Das generierte OG-Image (Level 4) wird einmalig beim Kunden-Onboarding erstellt:

```bash
# Im Kunden-Projekt:
pnpm generate:og \
  --name "Elektro Mueller" \
  --tagline "Ihr Elektriker in Regensburg." \
  --cta "Jetzt kostenlos anfragen" \
  --domain "elektro-mueller.de" \
  --primary "#1D1E3B" \
  --accent "#EF7612" \
  --logo public/logo.png \
  --out public/og/default.png
```

**Voraussetzung:** `sharp` muss im Kunden-Projekt installiert sein:
```bash
pnpm add -D sharp
```

## Verwendung in Seiten

### LandingPage — Hero-Bild automatisch als Fallback (Level 2)

```astro
---
import LandingPage from '@cw/core/layouts/LandingPage.astro';
import { siteData } from '@/data/site-data';
---
<LandingPage
  title="Startseite"
  siteName={siteData.name}
  siteUrl={siteData.url}
  defaultTitle={siteData.seo.defaultTitle}
  defaultDescription={siteData.seo.defaultDescription}
  defaultOgImage={siteData.images.ogImage}
  heroImage={siteData.hero.image}
  footer={{ siteName: siteData.name }}
>
  <!-- heroImage wird automatisch als Level-2-Fallback verwendet -->
</LandingPage>
```

### Explizites OG-Image (Level 1)

```astro
<LandingPage
  title="Leistungen"
  ogImage="/og/leistungen.png"
  ...
>
```

### Ersten Content-Bild als Fallback (Level 3)

```astro
<LandingPage
  title="Ueber uns"
  contentImage="/images/team/team.webp"
  ...
>
```

### Level 4 ueberspringen (direkt zu defaultOgImage)

```astro
<LandingPage
  title="Kontakt"
  generatedOgImage={null}
  ...
>
<!-- Springt direkt zu Level 5 (defaultOgImage) -->
```

## Modi des Generators

### Modus 1: Text-basiertes OG (Standard)

Erstellt ein professionelles OG-Image mit Farbhintergrund, Firmenname, Tagline und CTA-Button.
Optionales Logo wird zentriert oben platziert.

```bash
node scripts/generate-og.mjs \
  --name "Steller Sanierungen" \
  --tagline "Ein Ansprechpartner. Komplette Sanierung." \
  --cta "Kostenlose Erstbesichtigung anfragen" \
  --domain "steller-sanierungen.de" \
  --primary "#1D1E3B" \
  --accent "#DE1668" \
  --logo public/logo.png \
  --out public/og/default.png
```

### Modus 2: Hero-Bild → OG-Crop

Schneidet ein vorhandenes Hero-Bild auf 1200x630 zu und fuegt optional Logo+CTA als Overlay hinzu.

```bash
node scripts/generate-og.mjs \
  --from-hero public/images/hero/team.webp \
  --logo public/logo.png \
  --cta "Jetzt anfragen" \
  --accent "#EF7612" \
  --out public/og/team.png
```

### Modus 3: Batch — alle Hero-Bilder

```bash
node scripts/generate-og.mjs \
  --from-dir public/images/hero \
  --og-dir public/og \
  --logo public/logo.png \
  --cta "Jetzt anfragen"
```

## Konfiguration in site-data.ts

```ts
// src/data/site-data.ts
images: {
  ogImage: '/og/og-image.png', // Fallback-Level 5 — immer vorhanden
}
```

`/og/default.png` (Level 4) ist eine feste Konvention und wird automatisch verwendet,
wenn keine hoehere Fallback-Ebene greift.

## Validierung

OG-Image in `<head>` pruefen:

Erwartete Ausgabe in `<head>`:
```html
<meta property="og:image" content="https://example.com/og/default.png" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
```

## Technische Details

- **Format:** PNG (1200x630px) — optimal fuer alle Social-Media-Plattformen
- **Overlay-Technik:** Sharp compositing — keine externe Rendering-API
- **Build-Zeit:** Einmalig beim Kunden-Onboarding, nicht bei jedem Build
- **Dependencies:** `sharp` (optionale devDependency im Kunden-Projekt)
- **Kein SSR/Edge-Rendering** — statische Assets in `public/og/`
