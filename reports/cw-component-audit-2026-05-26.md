# CW Component Audit — 2026-05-26

Erster Lauf nach Einführung der Hard-Rule "Customer-Repos enthalten keine eigene UI-Logik" (`@cw/core` v0.22.0, Slice `no-custom-components-in-customer-repos`, Slash-Command `/cw-component-audit`).

## Executive Summary

- **Repos gescannt:** 8 active/live (blitzsicht, digital-direkt, gottl-richter-gomeier, hausamlago, hausammincio, schiller-gartenbau, soleno, steller-sanierungen)
- **Findings total:**
  - **28 Custom-Components** (davon 5 reine Re-Export-Wrapper für `PlausibleEvents.astro`)
  - **1 standalone CSS-Datei** (Patch außerhalb Tokens)
  - **3 Inline-Style-Verstöße** (≥3 Properties)
  - **77 `<style>`-Blöcke > 20 LOC** in `src/pages/` (CONTENT-LEAK)
- **Klassifikation:**
  - DUPE: 2 (existiert bereits in cw-core)
  - GENERIC: 7 (sollten nach cw-core promotiert werden)
  - CUSTOMER-SPECIFIC: 13 (akzeptabel mit Dokumentation)
  - CONTENT-LEAK: 77+ Pages mit Inline-Styling
  - RE-EXPORT-WRAPPER: 5 (überflüssig, direkter Import möglich)
- **Cross-Repo-Dupes:** 2 starke Pattern (`.page-hero` CSS in 4+ Repos, `PlausibleEvents.astro` Re-Export in 5)
- **Outlier:** `customer-blitzsicht` allein für 20 von 28 Custom-Components (71%)
- **Geschätzte Migration-Aufwand:** **~40–60h** (verteilt über GENERIC-Promotionen + Page-Style-Migrations)

## Priorisierte Migration-Liste

| # | Komponente / Pattern | Betroffene Repos | Aufwand | Begründung |
|---|---|---|---|---|
| 1 | **`.page-hero` Pattern → cw-core** | 4+ Repos (digital-direkt, gottl-richter-gomeier, soleno, steller-sanierungen) | 4h Promotion + 1h/Repo Migration = ~8h | Massiver CSS-Copy-Paste über 28+ Pages. Existing `Hero.astro` deckt das nicht ab. Neue Variant `PageHero variant="hero-with-image-bg"` oder ähnliches. |
| 2 | **`HeroVideo.astro` → cw-core** | soleno (1, aber generisch genug) | 3h | Video-Background-Hero ist klar generisches Pattern. Sollte unter `cw-core/components/blocks/HeroVideo.astro`. |
| 3 | **`FeaturedLeistungen.astro` → cw-core** | soleno (1, aber generisch) | 2h | Featured-Services-Grid mit Icon+Title+Description+Link ist überall brauchbar. Ähnlich zu existing `LeistungenSection.astro`, evt. mit `variant`-Prop konsolidieren. |
| 4 | **`KundenMarquee.astro` → cw-core** | blitzsicht (1, aber generisch) | 3h | Logo-Marquee mit prefers-reduced-motion. Customer-Logo-Banner ist Standard-Marketing-Block. |
| 5 | **`TestimonialsMarquee.astro` → cw-core** | blitzsicht (1, aber generisch) | 2h | cw-core hat `Testimonials.astro` aber nicht als Marquee-Variant. Konsolidieren via Prop. |
| 6 | **`StatsBar.astro` → cw-core** | blitzsicht (1, aber generisch) | 1h | cw-core hat `StatsGrid.astro` — `StatsBar` ist die horizontale Variant. Konsolidieren via `variant="bar"`. |
| 7 | **`ServiceAreaSchema.astro` Backport-Cleanup** | gottl-richter-gomeier (TODO-marked forward-port) | 30min | Lokale Kopie aus cw-core main. cw-core hat das jetzt unter `seo/ServiceAreaSchema.astro`. Customer-Datei löschen, durch Import ersetzen. |
| 8 | **`TechExcellenceLinked.astro` → cw-core** | blitzsicht (1) | 1.5h | Variant von `TechExcellence.astro` mit Card-Links. Via `linksTo`-Prop konsolidieren. |
| 9 | **`PlausibleEvents.astro` Re-Export-Wrapper entfernen** | 5 Repos | 15min/Repo = 1.25h | Die 5 Wrapper-Dateien sind überflüssig. Pages können direkt `import PlausibleEvents from '@cw/core/components/analytics/PlausibleEvents.astro'`. |
| 10 | **Page-Style-Migration (CONTENT-LEAK)** | Alle 8 Repos, 77 Pages | ~15-30min/Page = **20-40h** | Die Page-`<style>`-Blöcke sind die größte Last. Ansatz: erst extrahieren in cw-core-Variants (z.B. PageHero), dann pro Page Migration. Iterativ über mehrere Wochen. |
| 11 | **`ProcessSteps.astro` (blitzsicht) ist DUPE** | blitzsicht (218 LOC) | 1h | cw-core hat bereits `blocks/ProcessSteps.astro`. Customer-Datei prüfen und ersetzen. Falls Customer-Variant: Props ergänzen. |
| 12 | **`PaketDetailPage.astro` (891 LOC) → cw-core** | blitzsicht (1) | 6h | Riesige Component (891 LOC). Importiert bereits cw-core-Layout + Blocks. Vermutlich generalisierbar als `PaketDetailPage` mit Props für Tier-Daten. |
| 13 | **`hero-mobile-fix.css` (blitzsicht standalone CSS)** | blitzsicht (1, 70 LOC) | 30min | CLS-Fix-Patch. Sollte in cw-core `Hero.astro` selbst aufgenommen werden (`min-height` + `aspect-ratio`-Defaults). |
| 14 | **CUSTOMER-EXCEPTIONS.md anlegen** | blitzsicht (für 13 Custom-Specifics) | 1h | 13 Components sind real customer-spezifisch (ROICalculator, FounderBlock etc.). Pro Component begründen warum nicht generisch. |

**Top 3 ROI-Migrationen (sofort lohnenswert):**
1. `.page-hero` Pattern → cw-core PageHero-Variant (8h, betrifft 28+ Pages)
2. `PlausibleEvents.astro` Re-Export-Wrapper entfernen (1.25h, 5 Repos)
3. `ServiceAreaSchema.astro` Backport-Cleanup (30min)

**Sofort-Last-Reducers:** 1, 2, 3 = ~10h und sofort 5 Repos sauberer.

## Per-Repo-Details

### customer-blitzsicht (Outlier — 20 Custom-Components)

| File | LOC | Klassifikation | Vorschlag |
|------|-----|----------------|-----------|
| `components/PricingSection.astro` | 262 | CUSTOMER-SPECIFIC | Blitzsicht-Preis-Tier-Daten — dokumentieren in CUSTOMER-EXCEPTIONS.md |
| `components/PainPointsSection.astro` | 124 | CUSTOMER-SPECIFIC | Marketing-Copy spezifisch — dokumentieren |
| `components/MdAlternateLink.astro` | 10 | CUSTOMER-SPECIFIC | 10 LOC ok, AI-SEO-spezifisch |
| `components/GarantieBlock.astro` | 273 | CUSTOMER-SPECIFIC | Garantie-Bedingungen specific |
| `components/ProcessSteps.astro` | 218 | **DUPE** | cw-core hat bereits `blocks/ProcessSteps.astro` — Imports prüfen + Diff |
| `components/DFYSection.astro` | 316 | CUSTOMER-SPECIFIC | Done-For-You Service-Pitch |
| `components/KundenMarquee.astro` | 152 | **GENERIC** | → cw-core `blocks/LogoMarquee.astro` |
| `components/HeroSplitView.astro` | 372 | CUSTOMER-SPECIFIC | Vorher/Nachher-Vergleich — Marketing-Spezial |
| `components/ROICalculator.astro` | 193 | CUSTOMER-SPECIFIC | ROI-Calc mit Blitzsicht-Preisen |
| `components/AgenturRoastSection.astro` | 112 | CUSTOMER-SPECIFIC | Agentur-Vergleich (importiert cw-core/VergleichsTabelle ✓) |
| `components/SecurityTrustBlock.astro` | 199 | CUSTOMER-SPECIFIC | Security-Marketing-Pitch |
| `components/PricingAnchorBar.astro` | 95 | CUSTOMER-SPECIFIC | Pricing-Sticky-Bar |
| `components/FounderBlock.astro` | 179 | CUSTOMER-SPECIFIC | Founder-Story |
| `components/OwnershipMechanikBlock.astro` | 206 | CUSTOMER-SPECIFIC | Ownership-USP |
| `components/TestimonialsMarquee.astro` | 173 | **GENERIC** | → cw-core `Testimonials` mit `variant="marquee"` |
| `components/StatsBar.astro` | 67 | **GENERIC** | → cw-core `StatsGrid` mit `variant="bar"` |
| `components/PaketDetailPage.astro` | 891 | **GENERIC** | → cw-core `PaketDetailPage` (importiert bereits LandingPage + PageHero + CTABlock) |
| `components/TechExcellenceLinked.astro` | 210 | **GENERIC** | → cw-core `TechExcellence` mit `linksTo`-Prop |
| `components/AuditQuickBar.astro` | 119 | CUSTOMER-SPECIFIC | Audit-Tool spezifisch |
| `components/sections/OriginalResearchBlock.astro` | 194 | CUSTOMER-SPECIFIC | Blitzsicht-Studie 50 Handwerker-Websites |
| `styles/hero-mobile-fix.css` | 70 | **GENERIC** (Fix für cw-core) | → in cw-core Hero.astro integrieren |

**`<style>` > 20 LOC in pages/:** 25 Files + 5 Branchen-Pages = 30 — größter Single-Page-Treffer: `website-anforderungen.astro` mit **698 LOC `<style>`**.

**Inline-Styles > 3 props:** 1 (`brand-guide/[slug].astro:214` — disabled-Button-Style, akzeptabel)

### customer-digital-direkt

| File | LOC | Klassifikation | Vorschlag |
|------|-----|----------------|-----------|
| `components/PlausibleEvents.astro` | 26 | **RE-EXPORT-WRAPPER** | Direkten Import in pages, Wrapper-Datei löschen |

**`<style>` > 20 LOC in pages/:** 7 Files (max `ueber-uns.astro` 139 LOC)
**Inline-Styles > 3 props:** 1 (`leistungen/index.astro:28` — `max-width + margin + padding` als container — 3 props, Grenzfall)

### customer-gottl-richter-gomeier

| File | LOC | Klassifikation | Vorschlag |
|------|-----|----------------|-----------|
| `components/PlausibleEvents.astro` | 17 | **RE-EXPORT-WRAPPER** | Wrapper löschen |
| `components/seo/ServiceAreaSchema.astro` | 41 | **DUPE** (TODO-marked) | cw-core hat `seo/ServiceAreaSchema.astro` ✓ — Customer-Datei durch Import ersetzen, Tracking-Issue siluri/blitzsicht-ops#152 schließen |

**`<style>` > 20 LOC in pages/:** 14 Files mit dem `.page-hero` Cross-Repo-Pattern (siehe unten)

### customer-hausamlago

Keine Custom-Components. Aber:

| File | LOC `<style>` | Klassifikation | Vorschlag |
|------|---------------|----------------|-----------|
| `pages/index.astro` | 350 | **CONTENT-LEAK** | Größter Single-Page-Style-Block dieses Repos. Migration auf cw-core-Layout + Blocks dringend |
| `pages/kontakt.astro` | 123 | CONTENT-LEAK | Migration |
| `pages/404.astro` | 25 | CONTENT-LEAK (klein) | OK falls customer-spezifisch |
| `pages/impressum.astro` | 35 | CONTENT-LEAK | sollte ImpressumBlock nutzen |

### customer-hausammincio

Keine Custom-Components. 4 Pages mit `<style>` > 20 LOC (140, 85, 70, 40 LOC). Pattern identisch zu hausamlago (Schwester-Site).

### customer-schiller-gartenbau

| File | LOC | Klassifikation | Vorschlag |
|------|-----|----------------|-----------|
| `components/PlausibleEvents.astro` | 20 | **RE-EXPORT-WRAPPER** | Wrapper löschen |

5 Pages mit `<style>` > 20 LOC. 1 Inline-Style-Grenzfall.

### customer-soleno

| File | LOC | Klassifikation | Vorschlag |
|------|-----|----------------|-----------|
| `components/HeroVideo.astro` | 190 | **GENERIC** | → cw-core `blocks/HeroVideo.astro` |
| `components/PlausibleEvents.astro` | 14 | **RE-EXPORT-WRAPPER** | Wrapper löschen |
| `components/FeaturedLeistungen.astro` | 185 | **GENERIC** | → cw-core (evt. mit `LeistungenSection` via Prop konsolidieren) |

9 Pages mit `<style>` > 20 LOC, alle mit dem wiederkehrenden `.page-hero`-Pattern.

### customer-steller-sanierungen

| File | LOC | Klassifikation | Vorschlag |
|------|-----|----------------|-----------|
| `components/PlausibleEvents.astro` | 17 | **RE-EXPORT-WRAPPER** | Wrapper löschen |

5 Pages mit `<style>` > 20 LOC, `.page-hero`-Pattern.

## Cross-Repo Pattern-Matches (Promotion-Kandidaten für cw-core)

### 1. `.page-hero` CSS-Pattern (HÖCHSTE PRIORITÄT)

**Auftreten:** 4+ Repos, **28+ einzelne Pages**:
- digital-direkt: 4 pages
- gottl-richter-gomeier: 14 pages
- soleno: 5+ pages
- steller-sanierungen: 5 pages

**Pattern (vereinfacht):**
```css
.page-hero {
  background: linear-gradient(135deg, rgba(...), rgba(...)) url('/images/hero/<custom>.webp') center/cover no-repeat;
  color: white; padding: 4-6rem 1.5rem;
  text-align: center;
}
.page-hero h1 { font-family: var(--font-heading); font-size: clamp(2rem, 4vw, 3rem); }
```

**cw-core-Lücke:** Existing `PageHero.astro` deckt **Hero ohne Background-Image** ab. Eine Variant mit `backgroundImage`-Prop + Gradient-Overlay fehlt.

**Vorschlag:** Neue Variant `<PageHero variant="image-overlay" backgroundImage="..." gradient="...">` in cw-core. ROI: 28+ Page-`<style>`-Blöcke entfallen.

### 2. `PlausibleEvents.astro` Re-Export-Wrapper

**Auftreten:** 5 Repos, identische 14-26 LOC Re-Export-Datei pro Repo.

**Vorschlag:** Wrapper-Pattern erübrigt sich. Direkter Import in den verwendenden Pages:
```astro
---
import PlausibleEvents from '@cw/core/components/analytics/PlausibleEvents.astro';
---
```
ROI: 5 Files weniger, einheitlicher Pattern, 0 LOC custom Code.

### 3. CONTENT-LEAK in `src/pages/<style>`-Blöcken (langfristig)

**Auftreten:** 77+ Pages über alle 8 Repos.

Das ist kein einzelnes Pattern, sondern systemisches Phänomen. Hauptverdächtige:
- `.page-hero` (siehe oben)
- Custom-Section-Backgrounds mit `linear-gradient`
- Container-Width-Overrides (`max-width: var(--container-max)`)
- Hardcoded Padding/Margin außerhalb Token-System

**Vorschlag:** Iterativ, Page für Page, mit existierenden cw-core-Blocks ersetzen. Erst nach Promotion der Top-3-Patterns sinnvoll.

## Promotion-Kandidaten für cw-core (zusammengefasst)

| Component | Wo | Aufwand | Häufigkeit |
|-----------|----|---------|-----------|
| `PageHero variant="image-overlay"` | NEU/Erweiterung | 4h | 4 Repos / 28 Pages |
| `HeroVideo.astro` | NEU | 3h | 1 Repo (generisch genug) |
| `FeaturedLeistungen.astro` | NEU od. LeistungenSection-Variant | 2h | 1 Repo (generisch) |
| `LogoMarquee.astro` (aus KundenMarquee) | NEU | 3h | 1 Repo (generisch) |
| `Testimonials variant="marquee"` | Erweiterung | 2h | 1 Repo |
| `StatsGrid variant="bar"` | Erweiterung | 1h | 1 Repo |
| `TechExcellence linksTo`-Variant | Erweiterung | 1.5h | 1 Repo |
| `PaketDetailPage` (Tier-detail-Page-Template) | NEU | 6h | 1 Repo (generalisierbar) |
| Hero.astro CLS-Fix integrieren | Fix in cw-core | 30min | 1 Repo |

**Gesamt-Promotionen:** ~23h cw-core-Arbeit, danach 30+ Page-Migrations pro Customer.

## CUSTOMER-EXCEPTIONS — Dokumentation nötig

Folgende blitzsicht-Components sind **echt customer-spezifisch** und dürfen bleiben, müssen aber in einer `CUSTOMER-EXCEPTIONS.md` im jeweiligen Repo dokumentiert werden:

1. `PricingSection.astro` — Blitzsicht-Tier-Preise
2. `PainPointsSection.astro` — Marketing-Copy-spezifisch
3. `GarantieBlock.astro` — Garantie-Conditions
4. `DFYSection.astro` — Done-For-You-Pitch
5. `HeroSplitView.astro` — Vorher/Nachher-Marketing
6. `ROICalculator.astro` — Blitzsicht-Pricing-Logic
7. `AgenturRoastSection.astro` — Agentur-Vergleich
8. `SecurityTrustBlock.astro` — Security-Marketing-Pitch
9. `PricingAnchorBar.astro` — Sticky-Pricing-Anchor
10. `FounderBlock.astro` — Founder-Story
11. `OwnershipMechanikBlock.astro` — Ownership-USP
12. `AuditQuickBar.astro` — Audit-Tool-spezifisch
13. `OriginalResearchBlock.astro` — Blitzsicht-Studie

## Empfehlung: nächste Schritte

1. **Quick-Wins jetzt (~3h):**
   - PlausibleEvents Re-Export-Wrapper in allen 5 Repos durch direkten Import ersetzen
   - ServiceAreaSchema in gottl-richter-gomeier durch cw-core-Import ersetzen
2. **Cw-core PageHero-Variant promoten (4h)** — größter ROI, betrifft 28+ Pages
3. **Per Customer CUSTOMER-EXCEPTIONS.md anlegen** für die 13 customer-specific blitzsicht-Components
4. **Iterativ migrieren:** HeroVideo, FeaturedLeistungen, KundenMarquee, StatsBar, TestimonialsMarquee, TechExcellenceLinked → cw-core
5. **Page-Style-Migration last** — sobald die Promotionen da sind, Page-für-Page mit existing Blocks ersetzen

Audit-Cadence: monatlich oder bei jedem cw-core Minor-Release (v0.23.0+).
