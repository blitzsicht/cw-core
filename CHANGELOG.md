# Changelog — @cw/core

All notable changes to this project will be documented in this file.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) — entries in reverse chronological order.

---

## [0.9.14] — 2026-05-13 (release/cw-core → main)

### Fixed

- `InformationspflichtBlock.astro`: `Branche`-Union-Type von Multi-Line-Leading-Pipe auf Single-Line umgestellt. esbuild lehnte die Multi-Line-Variante in Astro-Frontmatter mit "Unexpected '|'" ab.

---

## [0.9.13] — 2026-05-13 (release/cw-core → main)

### Highlights

- Neue Block-Komponente `InformationspflichtBlock.astro` für die Art-13-DSGVO-Informationspflicht gegenüber Geschäftskontakten (Neukunden, Interessenten, Vertragspartner). Ergänzt `DatenschutzBlock.astro`, der weiterhin für die allgemeine Website-Datenschutzerklärung zuständig ist.

### Added

- `src/components/blocks/InformationspflichtBlock.astro` — prop-driven Art-13-Page (12 Sections: Verantwortlicher, DSB, Zwecke+Rechtsgrundlagen-Tabelle, Datenkategorien, Empfänger, Drittland-Übermittlung, Speicherdauer, Bereitstellungspflicht, Profiling, Betroffenenrechte, Beschwerde, Kontakt).
- 7 branche-spezifische Empfänger-Default-Sets via `branche`-Prop: `druck`, `solar`, `web`, `handwerk`, `beratung`, `ferienhaus`, `generic`. Customer kann via `empfaenger`-Prop komplett überschreiben.
- Defaults: BayLDA als Aufsichtsbehörde (override-bar), keine DSB-Pflicht angenommen (override-bar via `hatDSB`/`dsb`), Aufbewahrungspflichten HGB/AO.

### Recommended Customer-Integration

Customer-Site: dünne Page `src/pages/informationspflicht.astro`:

```astro
<ContentPage title="Informationspflichten nach Art. 13 DSGVO">
  <InformationspflichtBlock
    legal={siteData.legal}
    email={siteData.contact.email}
    branche="druck"
  />
</ContentPage>
```

Plus Footer-Link in `siteData.nav.footer.rechtliches`:
```ts
{ label: 'Art. 13 DSGVO', href: '/informationspflicht' }
```

### Compatibility

- Additive Änderung, keine Breaking Changes.

---

## [0.9.12] — 2026-05-13 (release/cw-core → main)

### Highlights

- `StellenListe.astro` JobPosting JSON-LD: vollständige PostalAddress + automatisches `validThrough` + optionaler `baseSalary`. Schließt Google-for-Jobs-Warnungen "streetAddress/addressRegion/postalCode/validThrough fehlt" (GSC-Befund customer-digital-direkt 2026-05-13).

### Added

- `StellenListe.astro` neue optionale Props: `street`, `zip`, `region` (PostalAddress).
- `StelleItem` neue optionale Felder: `validThrough` (ISO-Date), `gehaltMin` + `gehaltMax` (EUR pro Jahr, nur emittiert wenn beide gesetzt).
- Auto-Fallback: `validThrough` defaultet auf `datePosted + 90 Tage`, falls pro Stelle nicht gesetzt.

### Changed

- JobPosting `jobLocation.address` enthält jetzt zusätzlich `streetAddress`, `postalCode`, `addressRegion` (nur wenn Props gesetzt).

### Compatibility

- Additive Änderung — alle bestehenden `<StellenListe>`-Aufrufe funktionieren weiter ohne Änderungen.

---

## [0.9.11] — 2026-05-12 (release/cw-core → main)

### Highlights

- CSP-Pragma-Fix für customer-Sites: explicit-domain neben `'self'` in allen Source-Direktiven (siehe Bisection 2026-05-12 auf digital-direkt.com).

---

## [0.9.10] — 2026-05-12 (release/cw-core → main)

### Highlights

- Structur-Reorganisation: `components/` und `layouts/` → `src/` (Breaking, aber customer-sites pinnen auf Tag — sicher)
- Neue Legal-Components: `ImpressumBlock` + `DatenschutzBlock` (§5 DDG / Art. 13 DSGVO, prop-driven)
- AI-Discovery-Integration + hreflang-Support
- Plausible-Analytics-Stack: Component, Events-Helper, `data-cta`-Attribute
- Email-Signaturen-Template-System (Standard-Service für alle Kunden)
- Onboarding-Tooling: Docs, Checklist, Build-Check-Workflow-Template

### Breaking Changes

- Alle Components / Layouts liegen jetzt unter `src/components/` und `src/layouts/` (vorher direkt in `components/` / `layouts/`).  
  Customer-sites müssen ihren Import-Pfad anpassen: `@cw/core/src/components/...` oder via Re-Exports in `src/index.ts`.
- `faqs`-Prop aus `SchemaOrg` entfernt — `FAQPage` JSON-LD wird exklusiv durch `FAQ.astro` emittiert.
- `Hero`: `ImageMetadata` statt `string` (Pipeline-erzwungen).

### Added

- `src/components/blocks/ImpressumBlock.astro` — §5 DDG konforme Impressum-Sektion, vollständig prop-driven
- `src/components/blocks/DatenschutzBlock.astro` — Art. 13 DSGVO konforme Datenschutz-Sektion, prop-driven
- `src/integrations/ai-discovery/index.ts` — AI-Discovery-Astro-Integration (llms.txt, robots.txt, structured data)
- `src/components/analytics/Plausible.astro` — Self-hosted-kompatible Plausible-Einbindung
- `src/components/analytics/PlausibleEvents.astro` — Client-seitige Event-Helper
- `src/components/analytics/plausible-events.ts` — Typed Event-Map
- `data-cta`-Attribute auf Hero / CTABlock / Header für globale Plausible-Events
- `src/api/contact-handler.js` + `.d.ts` — zentraler `createContactHandler` für Vercel/Hono
- `src/api/lead-sink.js` + `.d.ts` — opt-in Telegram Lead-Push via `emitLead`
- `src/components/motion/` — komplettes Motion-System: AnimatedBlob, CountUp, CustomCursor, FullBleed, MagneticButton, ParallaxImage, ScrollProgress, ScrollReveal, SmoothScroll, StaggerGroup, TextReveal, TiltCard
- `src/components/primitives/` — ResponsiveGrid, ResponsiveTable, Stack
- `src/components/blocks/TechExcellence.astro` — Tech-Differentiator-Sektion
- `src/components/blocks/AEOSection.astro` — AEO (Answer Engine Optimization) Block
- `src/components/blocks/VergleichsTabelle.astro` — Vergleichstabelle für AI-SEO
- `src/components/blocks/PageHero.astro` — Gradient-Banner für Unterseiten
- `src/components/blocks/BentoGrid.astro`
- `src/components/blocks/AuthorBox.astro`
- `src/components/blocks/PageTOC.astro` — Inhaltsverzeichnis
- `src/components/blocks/StickyMobileCTA.astro`
- `src/components/seo/SchemaOrg.astro` — E-E-A-T Person-Entity (founder), `@id`-Anker
- `src/components/forms/TurnstilePreClearance.astro` — site-wide Cloudflare Turnstile Pre-Clearance
- `src/utils/forms/` — `handle-submission.{js,ts}`, `submit.ts`, `build-lead-email.{js,d.ts}`
- `scripts/generate-og.mjs` — SVG+sharp OG-Image-Generator
- `scripts/optimize-images.mjs` — WebP-Konvertierung
- `scripts/stylelint-no-max-width.js` — Mobile-First-Lint-Gate
- `scripts/validate-tokens-css.mjs` — Token-Konsistenz-Check
- `scripts/verify-form-health.mjs` — Form-Health-Smoke-Test
- `templates/email-signature/` — HTML+TXT Templates für Standard-Service Kunden-E-Mail-Signaturen, inkl. `generate.sh`
- `templates/.github/workflows/build-check.yml` — CI-Build-Check-Template für Customer-Repos
- `templates/customer-CLAUDE.md` — Mobile-First Conventions für Customer-Sites
- `docs/CSP-rationale.md` — Risk-Acceptance Dokumentation für `unsafe-inline`
- `docs/onboarding-checklist.md` — Onboarding-Checkliste für neue Customer-Sites
- `CLAUDE.md` — Agent-Konventionen
- `tsconfig.json` — Shared TS-Config
- `.stylelintrc.json` — Projekt-weite Stylelint-Config
- `astro.config.ts` — Shared Astro-Config
- `pnpm-lock.yaml` — Lockfile

### Changed

- `src/components/layout/Header.astro` — hamburger breakpoint 1100px, Mobile-Only-Logo, touch-targets ≥44×44px
- `src/components/layout/Footer.astro` — 4-/5-Spalten-Layout, extraLinks/extraLinks2, "Erstellt von Blitzsicht"-Backlink
- `src/components/blocks/Hero.astro` — Bento-Layout, Triangle-Bento, MagneticButton-Wrapper, full-width mobile CTAs, collage mode
- `src/components/blocks/Testimonials.astro` — Marquee-Carousel, aggregateRating JSON-LD
- `src/components/blocks/ProcessSteps.astro` — smart grid (ceil(n/2) cols), cols-5-Support
- `src/layouts/BaseLayout.astro` — founder-Prop, Plausible.init() fix, hreflang, ai-discovery
- `src/layouts/ContentPage.astro` — logoSrcDark
- `README.md` — Vollständige Rewrite mit Installations-/Nutzungs-Doku
- `package.json` — peerDeps aktualisiert, `build`-Script (echo), `prepare` entfernt

### Fixed

- `FAQ.astro` — doppelte FAQPage JSON-LD entfernt
- `SchemaOrg.astro` — faqs werden nicht mehr doppelt emittiert
- WCAG 2.2 AA: focus-indicators, sr-only, color-contrast, scrollable-region
- WCAG 2.5.5: touch targets logo + hamburger ≥44×44px
- `ProcessSteps`: bottom padding mobile, smart column-count (kein 3+1-Orphan)
- `TechExcellence`: fixed 3/3 grid statt auto-fit
- Contact-Handler: `await emitLead` vor `res.json` (Vercel function keep-alive)
- API-Utils: relative imports statt `@/` alias (Node-Kompatibilität)

### Known Issues (pre-existing, separate tracking)

- `BaseLayout.astro`: 5 TypeScript-Errors (`readonly`-Modifier + `faqs`-Prop) — separates Issue

---

## [0.9.9] — 2025 (pre-release)

- data-cta attributes on Hero/CTABlock/Header for global Plausible Events

## [0.9.8] — 2025 (stable, promoted from -alpha)

- Plausible-Component + Events-Helper + Self-Hosted-Hook

## [0.8.x] — 2025 (alpha series)

- Vielzahl von Features und Fixes während der Alpha-Phase — siehe Git-Log

## [0.1.0] — Initial (alpha)

- Monorepo-Skeleton, erste Komponenten-Extraktion
