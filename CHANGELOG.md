# Changelog — @cw/core

All notable changes to this project will be documented in this file.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) — entries in reverse chronological order.

---

## [0.14.0] — 2026-07-06

### Added

- **`@cw/core/integrations/favicon-ico`** — Astro-Integration, die `favicon.ico` bei jedem Build automatisch aus `public/favicon.svg` generiert (siluri/blitzsicht-ops#491).
  - Root Cause: `BaseLayout.astro` verlinkte nur `favicon.svg` + `favicon-192.png`, keine Pipeline erzeugte `favicon.ico`. Plausibles Sites-Dashboard bezieht Site-Icons über den externen DuckDuckGo-Dienst (`icons.duckduckgo.com/ip3/<domain>.ico`), der `/favicon.ico` erwartet — 3/6 stichprobenartig geprüfte Sites zeigten deshalb nur den generischen Platzhalter.
  - `astro:build:done`-Hook (analog zu `integrations/ai-discovery`) — immer frisch, keine Staleness-Heuristik nötig.
  - Multi-Resolution (16/32/48px, konfigurierbar über `sizes`-Option), PNG-in-ICO-Container (kein BMP/DIB-Reencoding).
  - Resolviert `sharp` aus dem Consumer-Repo (Konvention wie `scripts/optimize-images.mjs`); fail-open (Warnung statt Build-Abbruch) wenn `favicon.svg` fehlt oder `sharp` nicht auflösbar ist.
  - Neu: `src/integrations/favicon-ico/ico.ts` (dependency-freier ICO-Container-Writer) + `src/integrations/favicon-ico/index.ts`.
- **`BaseLayout.astro`**: zusätzlicher Fallback-Link `<link rel="icon" href="/favicon.ico" sizes="any" />` neben dem bestehenden SVG-Icon.
- **`scripts/sweep-favicon.mjs`**: Curl-Sweep über eine Domain-Liste, meldet welche Sites kein HTTP 200 auf `/favicon.ico` liefern.
- **`docs/favicon-pipeline.md`**: Mechanismus, Einbindung, Rollout-Status dokumentiert.
- **`docs/onboarding-checklist.md`**: Abschnitt 4 + Bausteine-Tabelle um `faviconIco()`-Integration ergänzt — kein manueller Favicon-Schritt mehr im Onboarding.
- **Tests**: `scripts/favicon-ico.test.mjs` (6 Tests) — ICO-Container-Format (Header, Multi-Size-Offsets, 256px-Edge-Case) + echter End-to-End-Test (`sharp` rendert eine Test-SVG, Ergebnis wird als valides Multi-Size-ICO verifiziert, inkl. PNG-Magic-Byte-Check pro Embedded-Image).

### Notes

- Rollout auf die einzelnen `customer-*`-Sites (Einbindung von `faviconIco()` in deren `astro.config.ts` + Redeploy) ist nicht Teil dieses `cw-core`-only-PRs — siehe PR-Notes für den Live-Sweep-Stand.

---

## [0.13.0] — 2026-06-18

### Added

- **`DesignPreviewBanner.astro`** (`src/components/layout/`): Einheitliche, generische Designvorschau-Komponente für alle Customer-Sites (siluri/blitzsicht-ops#372).
  - Prop `customerName` (string) — wird im Bannertext angezeigt.
  - Prop `dismissVersion` (string, default `"v1"`) — localStorage-Key-Suffix; erhöhen um Banner nach Redesign neu zu zeigen.
  - Sticky top (z-index 9999), dismissible via localStorage.
  - `html.has-preview-banner body { padding-top }` via `is:global` — verhindert Überlappung mit Header.
  - Neutral anthrazit (`#1f2937`) — bewusst KEIN `--color-primary`/`--color-accent`, damit der Banner als System-Hinweis erkennbar bleibt.
  - BEM-konforme `cw-preview-banner`-Klassen — kein Naming-Konflikt mit Customer-Styles.
  - Import: `@cw/core/components/layout/DesignPreviewBanner.astro`

- **Gradient-Blau-Fix (Cluster)**: Hardcoded Blau-Fallbacks in 5 Komponenten durch CI-neutrale `color-mix()`-Formel ersetzt (siluri/blitzsicht-ops#372).
  - `Hero.astro`: `var(--color-primary-dark, #0f3460)` → `var(--color-hero-gradient-end, color-mix(in srgb, var(--color-primary), #000 35%))`
  - `CTABlock.astro`: analog
  - `KarriereHero.astro`: analog
  - `PageHero.astro`: analog
  - `CalEmbed.astro` (Hover-State): analog

- **`--color-hero-gradient-end` Dokumentation** in `tokens-base.css` + `templates/tokens.template.css`:
  - Ausführlicher Kommentar-Block erklärt warum die Variable im `:root`-Block (NICHT `@theme`) gesetzt werden muss — Tailwind-v4-tree-shaking.
  - Template enthält auskommentierte Beispiel-Zeile mit `#TODO`-Platzhalter.

### Fix

- Blau-Gradient auf nicht-blauen Customer-Sites (z.B. ITK orange, Pferdesport silber) fiel auf hartkodiertes `#0f3460` zurück wenn `--color-primary-dark` nicht gesetzt war. Root-Cause: Tailwind v4 tree-shaked `@theme`-Variablen die nur in `node_modules`-Dateien (cw-core) via `var()` referenziert werden. Fix: alle Gradient-Endpunkte nutzen jetzt `--color-hero-gradient-end` mit `color-mix()`-Fallback.

### Notes

- `StickyMobileCTA` und `CTAPrimary` nutzen kein Blau — nicht betroffen.
- Kein Breaking Change: bestehende Customer-Sites ohne `--color-hero-gradient-end` sehen denselben Gradient wie vorher (35 % Schwarz in primary = visuell näherungsweise gleich).

---

## [0.12.0] — 2026-06-18

### Added

- `scripts/verify-form-health.mjs`: **`contactForm: false` als SSOT-Opt-out** (siluri/blitzsicht-ops#371). Das Skript liest jetzt `src/data/site-data.ts` (CWD-relativ) und überspringt den Form-Health-Check automatisch wenn `contactForm: false` gesetzt ist — kein manuelles `gh variable set SKIP_FORM_HEALTH true` mehr nötig.
  - Regex-Parse (kein TypeScript-Compiler), fail-open wenn Datei fehlt.
  - Erkennt `contactForm: false` und `contactForm : false` (Leerzeichen-tolerant).
  - Erkennt NICHT `contactForm: true` (Check bleibt aktiv) oder fehlendes Feld (Check bleibt aktiv).
  - `SKIP_FORM_HEALTH=true` bleibt als Legacy CI-Override erhalten (hausamlago, mika).
- `templates/site-data.template.ts`: Kommentar-Block für `contactForm: false` — erklärt den Mechanismus und warum er fehlendes `web3formsKey` als SSOT ablöst.
- `scripts/verify-form-health.test.mjs`: 6 neue Tests (Gruppe B) für `contactForm`-Opt-out — insgesamt 13 Tests:
  - contactForm: false → skip (exit 0)
  - contactForm: true → kein Skip (exit 2 wegen SITE_URL)
  - contactForm fehlt → kein Skip (exit 2)
  - Leerzeichen-Variante erkannt
  - site-data.ts fehlt → fail-open (exit 2)
  - SKIP_FORM_HEALTH=true + contactForm:false → SKIP_FORM_HEALTH gewinnt

### Migration

Customer ohne Kontaktformular (phone-only, whatsapp-only, cal.eu-only):

```ts
// src/data/site-data.ts — statt gh-Variable
export const siteData = {
  // ...
  contactForm: false,  // verify-form-health überspringt automatisch
};
```

Bestehende `SKIP_FORM_HEALTH=true`-Variables können danach via `gh variable delete SKIP_FORM_HEALTH` entfernt werden (optional — beide Mechanismen sind kompatibel).

### Compatibility

- Additive Änderung. Customer MIT Kontaktformular: keine Auswirkung (Feld fehlt → Check aktiv).
- `SKIP_FORM_HEALTH=true` weiterhin voll unterstützt (Backwards-Kompatibilität).

---

## [0.11.0] — 2026-06-18

### Added

- `scripts/verify-form-health.mjs`: **Sauberes Opt-out für form-lose Customer** via `SKIP_FORM_HEALTH=true` (Umgebungsvariable / CI Repository-Variable). Betrifft: hausamlago, mika, Ehrensache-One-Pager und jeden Customer ohne `/api/contact`-Route.
  - Feuert vor dem SITE_URL-Check → kein Exit 2 bei fehlendem SITE_URL wenn Opt-out aktiv.
  - Nur exakt lowercase `"true"` triggert Opt-out (`"TRUE"`, `"1"` etc. gelten nicht).
  - Exit 0 mit klarer Log-Meldung (Grund + Hinweis zum Rückgängig-Machen).
- `templates/.github/workflows/build-check.yml`: `smoke-test` Job erhält Condition `vars.SKIP_FORM_HEALTH != 'true'` — form-lose Customer können den Job per `gh variable set SKIP_FORM_HEALTH true` überspringen, ohne den Workflow selbst zu patchen.
- `scripts/verify-form-health.test.mjs`: 7 Logik-Tests via `node:test` (kein externes Framework) — deckt Opt-out-Pfade, Konfig-Fehler und den Negativ-Fall (Customer MIT Formular) ab.
- `package.json`: `"test"` Script → `node scripts/verify-form-health.test.mjs`.

### Hinweis für Customer-Betreiber

Form-lose Sites (phone/whatsapp/cal-only, kein cw-core-Kontaktformular):
```bash
# Opt-out aktivieren (CI färbt nicht mehr rot)
gh variable set SKIP_FORM_HEALTH true

# Rückgängig machen sobald ein Formular ergänzt wird
gh variable set SKIP_FORM_HEALTH false
```

Betroffene Live-Customer: hausamlago, mika — bitte beim nächsten cw-core-Bump via separatem Rollout setzen.

### Compatibility

- Additive Änderung. Customer MIT Kontaktformular: keine Auswirkung (Opt-out inaktiv by default).
- Cluster-Guard-Ansatz nach CLAUDE.md #1-Rule: Einzel-Workaround (gh-variable ohne Skript-Support) wird durch explizites Opt-out im Skript selbst ersetzt.

---

## [0.10.1] — 2026-05-19 (main — release/cw-core merge)

### Changed

- `release/cw-core` erfolgreich in `main` gemerged (--allow-unrelated-histories).
  Alte root-level Struktur (`components/`, `layouts/`, `styles/`) durch `src/`-Struktur ersetzt.
- Alle 4 add/add-Konflikte (.gitignore, README.md, package.json, docs/og-image.md) zugunsten `release/cw-core` aufgelöst (autoritativere, neuere Version).

### Migration

Customer-Sites müssen Import-Pfade anpassen: `@cw/core/components/` → `@cw/core/components/` über `src/index.ts`-Re-Exports oder direkte `src/`-Pfade.
Detaillierte Breaking-Changes: siehe [0.9.10]-Eintrag.

---

## [0.10.0] — 2026-05-19 (release/cw-core — SEO Components)

### Added

- `FAQSchema.astro` — standalone props-driven FAQPage JSON-LD (cherry-pick #16 von main)
- `ServiceAreaSchema.astro` — GeoShape-Schema für Geo-Landing-Pages (cherry-pick #14)
- `PriceSpecSchema.astro` — JSON-LD PriceSpecification für Pricing-Pages (cherry-pick #17)
- `docs/seo-title-pattern.md` — SEO-Title-Tag-Pattern-Dokumentation (cherry-pick #15)

### Hinweis zur Versionsnummer

Diese Version läuft auf dem `release/cw-core` Branch (Customer-Pins). Der `main`-Branch
ist bei v1.0.8 (Major-Bump nach ContactForm-Refactor). `release/cw-core` wurde bewusst
auf v0.10.0 gehoben (nächster Minor nach 0.9.16) um den Main-Branch-API-Bruch zu umgehen.
Customer-Upgrade: `"@cw/core": "github:siluri/cw-core#release/cw-core/v0.10.0"`

### Compatibility

- Additive Änderung, keine Breaking Changes. Nur neue SEO-Components hinzugefügt.

---

## [0.9.16] — 2026-05-13 (release/cw-core → main)

### Fixed (kritisch)

- `InformationspflichtBlock.astro` § 1 + § 12: **„Verantwortlicher" wird jetzt korrekt als juristische Person dargestellt.** Vorher rendete der Block `legal.owner` (Geschäftsführer-Name) als Entität — bei einer GmbH ist aber die GmbH selbst Verantwortlicher i.S.d. Art. 4 Nr. 7 DSGVO, der GF ist nur Vertreter. Multi-Agent-Audit-Befund K5 (haftungsrelevant für den GF persönlich).

### Added

- Neue optionale Prop `companyName?: string`. Wenn gesetzt: rendert die juristische Person als Verantwortlichen + Geschäftsführer als Vertreter darunter. Wenn nicht gesetzt: Fallback auf `legal.owner + legal.form` (Backwards-Compat — passt für Einzelunternehmer).
- Customer-Site-Integration: `<InformationspflichtBlock legal={siteData.legal} email={...} companyName={siteData.name} branche="..." />`

### Compatibility

- Additive Änderung, keine Breaking Changes. Bestehende Aufrufe ohne `companyName`-Prop rendern wie vor 0.9.15.

---

## [0.9.15] — 2026-05-13 (release/cw-core → main)

### Highlights

- `InformationspflichtBlock.astro` ist jetzt embeddable in größere Pages (z. B. `/datenschutz`). Mit `hideLeadIntro={true}` werden Intro/Cross-Links/Stand-Datum ausgeblendet, mit `id="..."` wird der Wrapper-Anchor gesetzt. Heading-Hierarchie wird im Embed-Mode automatisch auf `h3` abgesenkt (statt h2-Kollision mit der hosting Page).

### Added

- `InformationspflichtBlock` neue optionale Props:
  - `id?: string` (Default `'art-13-geschaeftskontakte'`) — HTML-Anchor für Link-Targets
  - `hideLeadIntro?: boolean` (Default `false`) — Lead-Paragraph, Cross-Links, Stand-Datum ausblenden
  - `showSectionHeading?: boolean` (Default `false`) — optionale h2-Section-Headline „Informationspflichten nach Art. 13 DSGVO (Geschäftskontakte)"
- CSS: Heading-Selektoren matchen jetzt `:is(h2, h3)` — funktioniert in beiden Modi.

### Compatibility

- Vollständig additiv. Bestehende `<InformationspflichtBlock>`-Aufrufe rendern unverändert (h2-Headings, mit Lead-Intro).

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
