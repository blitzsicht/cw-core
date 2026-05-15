# OG Image Fallback-Chain

`@cw/core` implementiert eine 5-stufige Fallback-Chain für Open Graph Images (`og:image`).
So wird auf jeder Seite immer ein visuell ansprechendes Bild ausgeliefert — ohne manuelle Pflege pro Seite.

## Fallback-Chain (Priorität hoch → niedrig)

| Level | Quelle | Wann aktiv |
|-------|--------|------------|
| 1 | `ogImage` Prop (explizit) | Seite hat ein spezifisches OG-Image |
| 2 | `hero.image` (automatisch via LandingPage) | Seite hat ein Hero-Bild |
| 3 | `contentImage` Prop | Erstes Bild im Seiteninhalt |
| 4 | `/og/default.png` (generiert) | Standard-OG mit Logo+CTA-Overlay |
| 5 | `siteData.images.ogImage` | Kunden-spezifisches Fallback |

Level 4 und 5 enthalten **Logo + CTA-Text als Overlay** (generiert via `generate-og.mjs`).

## Setup: Standard-OG Image generieren

Das generierte OG-Image (Level 4) wird einmalig beim Kunden-Onboarding erstellt:

```bash
# Im Kunden-Projekt:
pnpm generate:og \
  --name "Elektro Müller" \
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

### LandingPage (automatisch)

`LandingPage` ermittelt `hero.image` automatisch als Level-2-Fallback.
Kein zusätzlicher Aufwand nötig:

```astro
---
import LandingPage from '@cw/core/layouts/LandingPage.astro';
---
<LandingPage title="Startseite">
  <!-- hero.image aus siteData wird automatisch als headerImage verwendet -->
  <slot />
</LandingPage>
```

### Explizites OG-Image (Level 1)

```astro
---
import LandingPage from '@cw/core/layouts/LandingPage.astro';
---
<LandingPage title="Leistungen" ogImage="/og/leistungen.png">
  <slot />
</LandingPage>
```

### Ersten Content-Bild als Fallback (Level 3)

```astro
---
import LandingPage from '@cw/core/layouts/LandingPage.astro';
---
<LandingPage
  title="Über uns"
  contentImage="/images/team/team.webp"
>
  <slot />
</LandingPage>
```

### Level 4 überspringen (direkt zu siteData.images.ogImage)

```astro
<LandingPage title="Kontakt" :generatedOgImage={null}>
  <!-- Springt direkt zu Level 5 (siteData.images.ogImage) -->
</LandingPage>
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

Schneidet ein vorhandenes Hero-Bild auf 1200×630 zu und fügt optional Logo+CTA als Overlay hinzu.

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

## Konfiguration in siteData

```ts
// src/data/site-data.ts
images: {
  ogImage: '/og/og-image.png', // Fallback-Level 5 — immer vorhanden
}
```

`/og/default.png` (Level 4) ist eine feste Konvention und wird automatisch verwendet,
wenn keine höhere Fallback-Ebene greift.

## Validierung

OG-Image in `<head>` prüfen:

```bash
# Mit open-graph-scraper (lokal):
npx open-graph-scraper --url https://example.com

# Oder: Meta-Inspector im Browser (DevTools → Elements → <head>)
# Suche nach: og:image
```

Erwartete Ausgabe in `<head>`:
```html
<meta property="og:image" content="https://example.com/og/default.png" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
```

## Technische Details

- **Format:** PNG (1200×630px) — optimal für alle Social-Media-Plattformen
- **Overlay-Technik:** Sharp compositing — keine externe Rendering-API
- **Build-Zeit:** Einmalig beim Kunden-Onboarding, nicht bei jedem Build
- **Dependencies:** `sharp` (optionale devDependency im Kunden-Projekt)
- **Kein SSR/Edge-Rendering** — statische Assets in `public/og/`
