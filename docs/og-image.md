# OG Image Fallback-Chain

`@cw/core` implementiert eine 5-stufige Fallback-Chain für Open Graph Images (`og:image`).
So wird auf jeder Seite immer ein visuell ansprechendes Bild ausgeliefert — ohne manuelle Pflege pro Seite.

> **Verfuegbarkeit:** Verfuegbar auf `release/cw-core` (portiert von PR #12 via Issue #27) und `main`.

---

## OG-Studio v3 (`@cw/core/og`) — scharfe, brand-treue, CTA-fähige Templates

Der bevorzugte Weg seit v0.57.0. Statt handgebautem SVG→sharp (System-Fallback-Schrift, flach)
rendert **Satori** (Layout + eingebettete Brand-Fonts → SVG mit Text als Vektorpfaden), das
bereits vorhandene **sharp** rastert mit 2×-Supersampling. Ergebnis: gestochen scharfe Typo,
Ziel-Dateigröße < 300 KB (SISTRIX), automatischer JPG-Fallback bei Foto-Templates.

**Dependencies im Consumer:** `pnpm add -D satori sharp` (beide optionale peerDependencies von cw-core).

**Templates:**

| Template | Für wen | Inhalt |
|----------|---------|--------|
| `offer` | **Cluster-Default (Homepage)** | Ad-Stil: Angebot (Headline) + 3 Benefit-Bullets + Grund-zu-klicken (CTA + Domain) + optionaler Trust-Chip. Betrachter-zentriert — „Was kriege ich? Warum klicke ich?" |
| `cta` | Cluster-Default (einfach) | Nutzen-Claim + Ortsbezug, Trust-Signal (★-Google-Bewertung / Ort), Domain-Wortmarke, Logo |
| `hero` | Cluster-Default (mit Foto) | Foto-Composite (Gesicht = Vertrauen) + Gradient-Overlay + Claim + Trust-Signal |
| `proof` | **nur Blitzsicht / Agentur** | Live-PageSpeed-Ringe aus `psi-live.json` + Claim (Ehrlichkeits-Beweis). Kein Homepage-Share-Bild. |

`offer`-Beispiel:
```bash
pnpm generate:og --template offer \
  --eyebrow "WEBDESIGN AUS REGENSBURG" \
  --headline "Ihre Firmen-Website.|In 7 Werktagen live." \
  --bullets "Ohne Cookie-Banner|Code gehört Ihnen|Fester Ansprechpartner" \
  --cta "Kostenloser Website-Check" --domain "blitzsicht.com" \
  --proofchip "100/100 Google PageSpeed" \
  --logo public/logo-inverted.svg --out public/og/home.png
```

### CLI (Onboarding)

```bash
# Cluster-Default für einen neuen Customer:
pnpm generate:og --template cta \
  --name "Elektro Müller" \
  --claim "Ihr Elektriker in Regensburg." \
  --subline "Schnell erreichbar · Festpreis · Meisterbetrieb" \
  --domain "elektro-mueller.de" \
  --rating "4,9" --ort "Regensburg" \
  --logo public/logo-inverted.svg \
  --out public/og/default.png

# Foto-Composite:
pnpm generate:og --template hero --photo public/images/hero/team.webp \
  --claim "Ihr Malerbetrieb in Regensburg." --domain "maler.de" --rating "4,8" \
  --logo public/logo-inverted.svg --out public/og/default.png
```

### Programmatisch (prebuild-Script, z. B. Live-Scores)

```js
import { renderOg, proof } from '@cw/core/og';
import { readFileSync, writeFileSync } from 'node:fs';

const psi = JSON.parse(readFileSync('src/data/psi-live.json', 'utf-8'));
const site = psi.sites.find((s) => s.slug === 'blitzsicht');
const { buffer } = await renderOg(proof({ site }), { maxBytes: Infinity }); // immer PNG
writeFileSync('public/og/home.png', buffer);
```

`renderOg(element, { width=1200, height=630, supersample=2, maxBytes=307200 })` →
`{ buffer, ext: 'png'|'jpg', width, height, bytes }`. Brand-Farben pro Customer via
`{ brand: { primary, accent } }` an jedes Template.

---

## Legacy (v2) — Sharp-Compositing

Die folgenden Modi (`--from-hero`, `--from-dir`, Text-OG) bleiben für Rückwärtskompatibilität erhalten.

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
