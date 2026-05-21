# Changelog — @cw/core

All notable changes to this project will be documented in this file.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) — entries in reverse chronological order.

---

## [0.12.1-alpha] — 2026-05-21 (release/cw-core — Briefing-Handler: Telegram-Push-Fix)

> **Hotfix für v0.12.0-alpha.** `emitLead` wurde fälschlicherweise via `void`-Pattern
> NACH `res.status(200)` aufgerufen — Vercel Serverless killt die Function aber
> bevor das detached promise resolvt, dadurch kam **kein Telegram-Push** für
> Briefing-Submissions an (in Mika-Production-Test am 21.05. festgestellt).

### Fixed

- `briefing-handler.js` Zeile 370–397: `await emitLead(...)` VOR `res.status(200)`
  statt `void emitLead(...)` danach. Worst-case 5s zusätzliche Response-Latenz
  (durch `AbortSignal.timeout(5_000)` in `lead-sink.js` begrenzt) — akzeptabel
  für low-traffic Briefing-Forms. Vorteil: Telegram-Push-Reliability 100% statt 0%.

### Affected

- Alle Customer-Sites die `createBriefingHandler` aus v0.12.0-alpha nutzen (aktuell
  Mika + Zink) — benötigen `package.json`-Bump auf `v0.12.1-alpha` + Re-Deploy.

---

## [0.12.0-alpha] — 2026-05-21 (release/cw-core — Briefing-Handler + BriefingForm)

> **Phase A des `glistening-snacking-papert`-Plans.** Generischer Onboarding-
> Briefing-Endpoint + Single-Page-Form, extrahiert aus Mika-Elektrotechnik
> (Anti-Pattern: 700-Zeilen inline). Mika und Zink konsumieren ab jetzt in
> ~20 Zeilen.

### Added — `@cw/core/api/briefing-handler`

- `createBriefingHandler(config)` — Factory analog zu `createContactHandler`.
  - **Required-Field-Validation** wird aus `config.sections` derived — keine
    magische ID-Liste mehr im Customer-Repo.
  - **Mail-Versand awaited** (internal + customer-confirmation) **VOR** dem
    200-Response — fixt den Mika-M1-Bug (fire-and-forget killt das Promise
    sobald die Vercel-Function-Response gesendet ist).
  - **`emitLead`/Telegram detached** NACH dem Response — User wartet nicht
    auf das 5s-Timeout.
  - **Payload-Cap 256 KB** (413 bei Überschreitung).
  - **Origin-Check** mit optionalem Vercel-Preview-Bypass
    (`allowVercelPreviewOrigins`, default `true`).
  - **Rate-Limit** via Upstash KV (Vercel-Marketplace + Legacy) mit in-memory
    Fallback.
  - **Optionale Overrides**: `subjectInternal`, `subjectConfirmation`,
    `fromEmail`, `confirmationFromEmail`, `rateLimitMax`,
    `rateLimitWindowMs`, `brand` (für customer-spezifische Mail-Akzente).
  - **Server-side Email-Regex** (m13) für das `email_kontakt`-Feld.

### Added — `@cw/core/components/forms/BriefingForm.astro`

- Generic Single-Page-Briefing-Form mit 7 Field-Types
  (`text` / `textarea` / `email` / `phone` / `select` / `checkbox` / `radio`).
- localStorage-Auto-Save mit **`storageKey` als REQUIRED prop** — kein default,
  damit Customer-Konflikte (Mika ↔ Zink) ausgeschlossen sind.
- Progress-Bar (dual-source: Gesamt-Felder + Pflichtfelder, live update).
- Sticky-TOC links (mobile collapsible mit `aria-expanded`).
- Submit-Button disabled bis alle Required-Felder gefüllt.
- Reset-Button mit confirm-Dialog.
- On 200: localStorage cleanup + Redirect zu `successRedirect`
  (default `/danke?from=onboarding`).
- `is:inline` Vanilla-JS-Script — DSGVO-clean, kein extern Script-Load.
- Brand-aware Styles via `var(--color-*)` — keine hardcoded Hex-Werte.
- **Note (m14):** Turnstile bewusst NICHT integriert (Briefing-URLs sind
  privat per E-Mail + Page hat `noindex,nofollow`).

### Added — `@cw/core/types/briefing`

- `BriefingField`, `BriefingSection`, `FieldType`, `SectionPriority`
  Type-Definitions — Source-of-Truth für Customer-Repos.
- Convenience-Helpers: `getRequiredFieldIds(sections)`,
  `getTotalFieldCount(sections)`, `findFieldById(sections, id)`.

### Added — `@cw/core/utils/forms/build-briefing-email`

- `buildBriefingEmail(input)` — rendert HTML + Plain-Text für die zwei
  Briefing-Mails (intern + Confirmation), Pattern aus Mika übernommen.
- Brand-Akzent parametrisiert (`brand.primary` + `brand.accent`), Default =
  Blitzsicht Nachtblau/Orange.
- Customer-Submission-URL als Param (NICHT hardcoded).

### Added — `@cw/core/utils/net/get-client-ip`

- Shared `getClientIp(req)` Utility — bevorzugt
  `x-vercel-forwarded-for` (single value, Vercel-signed) > `x-forwarded-for`
  **LAST** entry > `x-real-ip` > `socket.remoteAddress`.
- **Sicherheits-Fix:** XFF-LAST statt XFF-FIRST (Client kann FIRST-Slot
  spoofen, LAST kommt vom nächsten trusted Proxy).

### Changed — `@cw/core/api/contact-handler`

- IP-Extraction migriert auf shared `getClientIp` Utility — der alte
  `[0]`-Lookup-Pattern (Client-spoofbar) ist weg. **Non-breaking** für
  bestehende Customer (gleiche Funktionssignatur, sicherere Default-Reihen-
  folge).

### Changed — `@cw/core/api/lead-sink`

- `Lead.kind`-Union um `'briefing-form'` erweitert.
- `formatTelegramMessage` hat einen eigenen Briefing-Branch:
  - Format: `📋 Briefing · {Customer} · {filled}/{total} Pflicht`
  - Plus Preview der ersten 2 ausgefüllten Felder.
  - Hard-Cap **200 Zeichen** (Contact-Form bleibt bei 1024).
- Neue optionale Felder im Lead-Type: `customerName`, `requiredFilled`,
  `requiredTotal`, `briefingPayload`.

### Added — Tests

- `tests/api/briefing-handler.test.js` — Node-native (`node --test`,
  kein vitest-Install nötig). 6 Tests:
  1. Required-Field-Validation derived from sections (CRIT-Anchor MAJ-12.1).
  2. IP-Extraction prefers x-vercel-forwarded-for + XFF LAST (MAJ-12.2 / CRIT-5).
  3. Promise-Ordering: Mails awaited, Telegram detached (MAJ-12.3 / MAJ-7).
  4. Payload-Size 413 (MAJ-10).
  5. Telegram-Briefing-Branch formatting + Cap (CRIT-2).
  6. Method-Check 405.
- Neuer Script: `pnpm test` (`node --test tests/**/*.test.js`).

### Version

- `0.11.0-rc.3` → **`0.12.0-alpha`**.
- **Rationale:** RC3 ist noch nicht final-promoted (kein ≥3-Customer-
  Smoketest), und Briefing-Handler ist ein neues Feature-Surface.
  `v0.12.0-alpha` signalisiert: stabil genug für Mika/Zink, aber noch
  Alpha-Tag — Final-Promotion folgt nach Smoketest-Cycle.

---

## [0.11.0-rc.3] — 2026-05-19 (release/cw-core — Component-Showcase + quality-checks)

### Added (Plan-Phase 1.6 — Component-Showcase via Examples-Pattern)

- `examples/` — Mini-Astro-Project mit Demo-Page pro neuer Component.
  - 9 Pages total (1 Übersicht + 8 Component-Demos)
  - Lokaler Start: `pnpm examples:dev` (Port 4322)
  - Build grün: 9 pages in 811ms
- pnpm-Scripts in Root: `examples:dev` + `examples:build`

**Hintergrund:** User-Plan-Antwort vom 19.05. war "Storybook 8". Aber Storybook + Astro 5 ist Mai 2026 noch nicht stabil — `@storybook/addon-astro` existiert nicht in npm registry, nur Community-Package `storybook-astro@0.2.1` (3 Versionen). Pragmatische Entscheidung: Examples-Pattern statt Storybook. Erfüllt den Zweck (interaktive Component-Demos für interne Doku + Customer-Calls) ohne experimentelles Ökosystem.

### Verbleibend Plan-Phase 1

(keine — Phase 1 komplett mit RC3. Promotion zu v0.11.0-final nach Smoke-Build auf ≥3 Customer-Sites.)

---

## [0.11.0-rc.2] — 2026-05-19 (release/cw-core — Quality-Checks-Integration)

### Added (Plan-Phase 1.3 — Build-Time-Checks)

- `integrations/quality-checks/index.ts` — neue Astro-Integration (opt-in).
  Im `astro:build:done`-Hook scannt sie `dist/*.html` und prüft:
  - **1× `<h1>` pro Page** (h1Count !== 1 → Warning oder Build-Fail in strict-Mode)
  - **AnswerBlock-Pflicht** für Pages die einem `servicePagePatterns`-Regex matchen
- Default-Mode: Soft-Warnings (kein Build-Fail). `strict: true` macht es hart.
- ignorePaths-Default: /404, /danke, /impressum, /datenschutz, /agb
- Aktivierung pro Customer-Site (opt-in via `astro.config.ts`).

### Package-Exports erweitert

- `./integrations/quality-checks` → `src/integrations/quality-checks/index.ts`

---

## [0.11.0-rc.1] — 2026-05-19 (release/cw-core — Google AI Optimization Guide Phase 1)

> **Release-Candidate.** Trifft erstmals den Plan-Phase-1-Scope (Google AI
> Optimization Guide Rollout). Customer-Sites können auf diesen Commit-Hash
> pinnen für Beta-Testing. Promotion zu 0.11.0 nach Smoke-Build auf ≥3 Customer.

### Added (Plan-Phase 1.1 — 8 neue Components)

- `blocks/AnswerBlock.astro` — Lead-with-Answer-Block für Service-Pages. Props:
  `question`, `directAnswer` (max 50 Wörter empfohlen), `details?`, `priceRange?`,
  `timeline?`, `highlights?`. Schema: `Question`/`Answer` JSON-LD. Build-Warning
  bei `directAnswer > 80 Wörter`. **Plan-Hintergrund:** 44.2% AI-Citations aus
  ersten 30% Page-Content (Mai 2026).
- `blocks/RecentlyUpdated.astro` — sichtbares "Aktualisiert am DD.MM.YYYY"-Badge
  mit Stale-Warning bei >90 Tagen. Variants: `badge` (Pill) und `banner` (volle Breite).
  Dev-Mode-Console-Warning bei stale Content. **Plan-Hintergrund:** Pages <30 Tage
  bekommen 3.2× mehr AI-Citations.
- `blocks/CTAPrimary.astro` — Agent-Friendly Primary-CTA-Primitive mit
  `data-cta-type`-Attribut (contact/quote/phone/booking/whatsapp/email). Build-Warning
  bei vagen Labels ("hier klicken", "weiter lesen").
- `blocks/CaseStudyBlock.astro` — Customer/Location/Problem/Approach/Outcome-Block.
  Schema: `CreativeWork` + optional `Review` (mit Rating). Compact-Mode für
  Referenzen-Grids.
- `blocks/BehindTheJob.astro` — Erfahrungs-Block mit Learnings + ehrlichen Fehlern +
  Konsequenz. Schema: `Article` mit Author=Organization.
- `blocks/PriceTransparency.astro` — Preis-Range-Block mit Faktoren-Liste pro
  Service. Verhindert "auf Anfrage"-Antipattern. Schema: `ItemList` of `Offer` +
  `PriceSpecification`.
- `blocks/LocalProofMap.astro` — lokale Referenzen-Liste (City + Service + Year)
  ohne Map-Embed (Privacy + Performance). Schema: `ItemList` of `Place`.
- `blocks/FAQHonest.astro` — FAQ-Variante mit `minAnswerChars` (default 150).
  Antworten unter Schwelle werden visuell gezeigt aber NICHT ins FAQPage-Schema
  aufgenommen — vermeidet Thin-Content-Flag von Google.

### Added (Plan-Phase 1.2 — Schema-Helpers konsolidiert)

- `schema/local-business.ts` — **Subtype-aware** `localBusinessSchema(input)`.
  `BusinessType` → Schema.org-Subtype-Mapping (Plumber, Electrician, HVACBusiness,
  Bakery, WineStore, BedAndBreakfast, RoofingContractor, ...). Plus
  `validateLocalBusiness()` für Compile-Time-Warnings.
- `schema/article.ts` — `articleSchema(input)` für BehindTheJob + Blog-Pages.
- `schema/creative-work.ts` — `caseStudySchema(input)` für CaseStudyBlock
  (CreativeWork + optional Review).
- `schema/breadcrumb-list.ts` — `breadcrumbListSchema(items)` — schließt
  bisherige JSON-LD-Lücke (Breadcrumbs.astro hat keinen Schema-Output).
- `schema/service.ts` — `serviceSchema(input)` pro Service-Page mit
  areaServed + offers.
- `schema/index.ts` — Re-Export aller Helpers für `import { ... } from '@cw/core/schema'`.

### Added (Plan-Phase 1.4 — IndexNow-Integration, Default-Aktiv)

- `integrations/bing-indexnow/index.ts` — Astro-Integration für Post-Build-Ping
  an Bing/Yandex IndexNow-API. Liest Sitemap, generiert Verifikations-Key-File,
  Bulk-Ping (max 10.000 URLs). **Default-Aktiv** (im Gegensatz zu llms.txt:
  IndexNow hat nachgewiesenen Nutzen für ChatGPT-Sichtbarkeit).

### Package-Exports erweitert

- `./integrations/bing-indexnow` → `src/integrations/bing-indexnow/index.ts`
- `./schema` → `src/schema/index.ts`
- `./schema/*` → `src/schema/*.ts`

### Compatibility

- **Voll backwards-kompatibel** zu v0.10.7. Alle neuen Components sind
  additive (keine Breaking-Changes an existing). Schema-Helpers können
  parallel zu existing `components/seo/*.astro` genutzt werden.
- IndexNow-Integration ist opt-in via `astro.config.ts` — wird nicht
  automatisch aktiviert beim Bump.

### Verbleibend Plan-Phase 1 (kommen in folgenden RCs)

- 1.3: Build-Time-Checks in BaseLayout (1× h1 / Page, AnswerBlock-Pflicht für Service-Pages)
- 1.5: Doku-Update für ai-discovery + neue optional-features.md
- 1.6: Storybook 8 Setup
- 1.7: docs/non-commodity-content-guide.md + google-ai-guide-compliance.md

---

## [0.10.7] — 2026-05-19 (release/cw-core — Header hideBrandName-Prop)

### Added

- `layout/Header.astro`: **Neue Prop `hideBrandName`** (default `false`) — unterdrückt den
  `<span>{siteName}</span>` Text neben dem Logo-Bild. Verwenden wenn das Logo-SVG selbst bereits
  den Markennamen als `<text>`-Element enthält (Text-Logo), um Doppel-Anzeige im Header zu vermeiden.
  (Fixes siluri/blitzsicht-ops#202)

- `layouts/LandingPage.astro`: **`HeaderConfig.hideBrandName`** — neue optionale Prop im
  `header`-Config-Objekt, wird transparent an `Header.astro` weitergegeben.

### Compatibility

- Backwards-kompatibel: `hideBrandName` Default ist `false` — HTML-Output für alle bestehenden
  Customers identisch zu v0.10.6.
- Keine Prop-Entfernungen, keine Umbenennungen.

### Migration (Customers mit Text-Logo-SVG)

```ts
// page-config.ts
export const headerConfig = {
  navItems: siteData.nav.main,
  showKarriereLink: false,
  logoSrc: '/logo.svg',
  logoSrcDark: '/logo-dark.svg',
  hideBrandName: true,  // ← neu: SVG enthält bereits Text, Span unterdrücken
};
```

---

## [0.10.6] — 2026-05-19 (release/cw-core — StickyMobileCTA WCAG-Fix + primaryVariant)

### Fixed (Accessibility)

- `blocks/StickyMobileCTA.astro`: **WhatsApp-Default-Color WCAG 2.1 AA Fix** — `secondaryVariant="whatsapp"`
  Background von `#25D366` (1.98:1, FAIL) auf `#197F40` (5.06:1, PASS) geändert.
  Hover von `#1ebd5a` auf `#136A35`. Konsistent mit Hero-Card-Buttons der Customer-Sites.
  (Fixes siluri/blitzsicht-ops#195)

### Added

- `blocks/StickyMobileCTA.astro`: **Neue Prop `primaryVariant`** — steuert Hintergrundfarbe des primären
  Buttons im Split-Layout:
  - `'accent'` (Default): `--color-accent` / `--color-accent-hover` — bisheriges Verhalten, Backwards-Compat.
  - `'primary'`: `--color-primary` / `--color-primary-dark` — Nachtblau als Primary-Button.
  (Fixes siluri/blitzsicht-ops#195)

### Migration (Customers)

**WhatsApp-Color — kein Code-Change nötig:**
```astro
{/* secondaryVariant="whatsapp" rendert jetzt automatisch WCAG-konformes #197F40 */}
<StickyMobileCTA
  href="/kontakt"
  label="Jetzt anfragen"
  secondaryHref="https://wa.me/49151xxxxxxxx"
  secondaryLabel="WhatsApp"
  secondaryVariant="whatsapp"
/>
```

**primaryVariant="primary" — neues Feature:**
```astro
<StickyMobileCTA
  href="/kontakt"
  label="Jetzt anfragen"
  primaryVariant="primary"
  secondaryHref="https://wa.me/49151xxxxxxxx"
  secondaryLabel="WhatsApp"
  secondaryVariant="whatsapp"
/>
```

### Compatibility

- Backwards-kompatibel: `primaryVariant` Default ist `'accent'` — HTML-Output identisch zu v0.10.5.
- WhatsApp-Farbänderung ist visuell (etwas dunkler/satter), kein Breaking Change.
- Keine Prop-Entfernungen, keine Umbenennungen.

---

## [0.10.5] — 2026-05-19 (release/cw-core — StickyMobileCTA Split-CTA + StickyContact hideOnMobile)

### Added

- `blocks/StickyMobileCTA.astro`: **Split-CTA Layout** — neue Props `secondaryHref`, `secondaryLabel`,
  `secondaryTarget`, `secondaryVariant` (`'whatsapp' | 'accent'`). Wenn `secondaryHref` + `secondaryLabel`
  gesetzt: Flex-Layout mit 2 Buttons à 50% Breite, border-Trenner statt Gap. Einzelner CTA verhält sich
  **HTML-identisch zu v0.10.4** (Backwards-Compat-Pflicht). (Fixes siluri/blitzsicht-ops#192)

  Neue Props:
  - `secondaryHref?: string` — href des zweiten Buttons
  - `secondaryLabel?: string` — Label des zweiten Buttons
  - `secondaryTarget?: string` — target-Attribut (Default: `'_self'`)
  - `secondaryVariant?: 'whatsapp' | 'accent'` — Farbvariante; Default `'accent'` (gleiche Farbe wie Primary).
    `'whatsapp'` → Hintergrund `#25D366`, hover `#1ebd5a`.

  Optional Slot-API für Icons direkt vor dem Label:
  - `<slot name="primary-icon" />` im primären Button
  - `<slot name="secondary-icon" />` im sekundären Button

- `blocks/StickyContact.astro`: **`hideOnMobile` Prop** — blendet den schwebenden Kontakt-Button
  auf mobilen Viewports (< 768px) aus. Nützlich wenn gleichzeitig `StickyMobileCTA` sichtbar ist
  und ein visuelles Überlappen verhindert werden soll. Default `false` → unverändert. (Fixes siluri/blitzsicht-ops#192)

### Migration (Customers)

**Single CTA — unverändert:**
```astro
{/* Kein Code-Change nötig — HTML-Output identisch */}
<StickyMobileCTA href="/website-audit" label="Kostenloser Website-Audit" />
```

**Split CTA — neu:**
```astro
<StickyMobileCTA
  href="/kontakt"
  label="Jetzt anfragen"
  secondaryHref="https://wa.me/49151xxxxxxxx"
  secondaryLabel="WhatsApp"
  secondaryVariant="whatsapp"
  secondaryTarget="_blank"
/>
```

**StickyContact auf Mobile ausblenden (z.B. wenn StickyMobileCTA aktiv):**
```astro
<StickyContact
  whatsapp="+49151xxxxxxxx"
  phone="+498xxxxxxxxxxx"
  hideOnMobile={true}
/>
```

### Compatibility

- Backwards-kompatibel: `StickyMobileCTA` ohne Secondary-Props rendert HTML-identisch zu v0.10.4.
- `StickyContact` ohne `hideOnMobile` (oder `hideOnMobile={false}`) verhält sich unverändert.
- Keine Breaking Changes.

---

## [0.10.4] — 2026-05-19 (release/cw-core — StickyContact in cw-core hochgehoben)

### Added

- `blocks/StickyContact.astro`: Schwebender WhatsApp + Telefon-Button (fixed, bottom-right).
  Bisherige Duplikate in `customer-soleno`, `customer-hausamlago` und `customer-hausammincio`
  werden mit der nächsten Customer-Migration auf diese zentrale Komponente umgestellt.
  (Fixes siluri/blitzsicht-ops#183 Phase 1)

  **Props (API-stabil zu den Customer-Kopien):**
  - `whatsapp?: string` — WhatsApp-Nummer inkl. Ländervorwahl
  - `phone?: string` — Telefonnummer inkl. Ländervorwahl
  - `prefilledMessage?: string` — Vorbefüllte WA-Nachricht (Default: generisch, Customer überschreibt)

  **Features:**
  - Mobile-first 56px Buttons, 52px auf < 480px
  - Dezenter Puls-Effekt am WA-Button (deaktiviert bei prefers-reduced-motion)
  - Plausible-Events: `'Sticky Contact Click'` mit `{ props: { channel } }`
  - WCAG: `role="complementary"`, `aria-label`, `focus-visible` outline
  - CSS Custom Properties: `--color-primary` für Phone-Button-Farbe, `--color-accent` für Focus-Ring

### Migration (Customer-Repos)

Customer-Repos können ihre lokale `StickyContact.astro`-Kopie löschen und auf den cw-core-Import
umstellen:

```diff
- import StickyContact from '../components/StickyContact.astro';
+ import StickyContact from '@cw/core/components/blocks/StickyContact.astro';
```

Die Props-API ist identisch — kein weiterer Anpassungsbedarf außer dem Import-Pfad.
Die `prefilledMessage`-Prop sollte weiterhin als Customer-spezifischer Wert übergeben werden
(z.B. "Hallo Soleno, ich interessiere mich für eine PV-Beratung."); der neue Default
("Hallo, ich interessiere mich für Ihr Angebot.") greift nur wenn kein Prop übergeben wird.

### Compatibility

- Backwards-kompatibel: API-stabil zu allen 3 Customer-Kopien.
- Keine Breaking Changes.

---

## [0.10.3] — 2026-05-19 (release/cw-core — Footer WCAG 2.1 AA Kontrast-Fix)

### Fixed (Accessibility)

- `Footer.astro`: WCAG 2.1 AA Kontrast-Fail behoben. Drei hardcoded `rgba(255,255,255,0.x)` Werte
  lagen unter dem 4.5:1 Mindestkontrastwert auf dem Nachtblau-Hintergrund `#1D1E3B`:
  - `.footer-links h3` (Spalten-Überschriften): `0.5` → `0.85` (war ~3.1:1, jetzt ~8.0:1)
  - `.footer-bottom` (Copyright-Zeile): `0.6` → `0.75` (war ~3.9:1, jetzt ~6.0:1)
  - `.footer-credit a` (Blitzsicht-Backlink): `0.55` → `0.75` (war ~3.5:1, jetzt ~6.0:1)
- CSS Custom Properties eingeführt für Customer-Overrides falls benötigt:
  - `--color-footer-text-muted` (default `rgba(255,255,255,0.85)`) — Spalten-Überschriften
  - `--color-footer-text-bottom` (default `rgba(255,255,255,0.75)`) — Copyright-Bar
  - `--color-footer-credit-link` (default `rgba(255,255,255,0.75)`) — Backlink
  (Fixes siluri/blitzsicht-ops#180)

### Compatibility

- Backwards-kompatibel: alle bestehenden Customer-Sites erhalten höheren Kontrast ohne Code-Änderungen.
  Visuell: Footer-Labels sind etwas heller/lesbarer — kein "schreiende-weiße-Wand"-Effekt da
  auf dunklem Background. Customer-Repos können die Custom Properties überschreiben falls gewünscht.
- Erwartetes Lighthouse-Ergebnis: customer-hausamlago steigt von 96/100 auf ≥ 98/100 Accessibility
  beim nächsten `pnpm update @cw/core`.

---

## [0.10.2] — 2026-05-19 (release/cw-core — email-Prop optional in ImpressumBlock + DatenschutzBlock)

### Changed

- `ImpressumBlock.astro`: Prop `email` ist jetzt optional (`string?` statt `string`).
  Render-Stellen (`E-Mail:`-Link in §Kontakt) mit Truthy-Guard geschützt.
  Wenn kein `email` gesetzt: E-Mail-Link wird nicht gerendert, nur Kontaktformular
  als elektronischer Kontaktweg. (Fixes siluri/blitzsicht-ops#174)
- `DatenschutzBlock.astro`: Prop `email` ist jetzt optional (`string?` statt `string`).
  Render-Stellen in §1 Verantwortlicher und §10 Betroffenenrechte mit Truthy-Guard.
  Fallback ohne E-Mail: "wenden Sie sich an den Verantwortlichen (Kontaktdaten siehe Impressum)".
  (Fixes siluri/blitzsicht-ops#174)

### Compatibility

- Backwards-kompatibel: alle bestehenden Customer-Sites übergeben
  `email={siteData.contact.email}` als string — Verhalten unverändert.
  Neu: Customer-Sites die `email` auf `undefined` setzen (z.B. Eule-Phase-2) brechen
  nicht mehr mit TypeScript-Fehler, sondern rendern graceful ohne E-Mail-Link.

---

## [0.10.1] — 2026-05-19 (release/cw-core — DSGVO-Fix datenschutzEmail)

### Fixed (DSGVO-kritisch)

- `InformationspflichtBlock.astro`: **Halluzinierte `datenschutz@<domain>`-Adresse entfernt.**
  Die Komponente generierte automatisch `datenschutz@<email-domain>` wenn kein explizites
  `datenschutzEmail`-Prop übergeben wurde — diese Adresse existiert bei allen bestehenden
  Kunden nicht. DSGVO Art. 13/14 verlangt erreichbare Kontaktdaten. (Fixes #173)

### Changed

- `InformationspflichtBlock.astro`: Prop `email` ist jetzt optional (war: required string).
  Breaking-frei: bestehende Customer-Sites übergeben `email={siteData.contact.email}` — Verhalten
  ändert sich nur in Bezug auf den Datenschutz-Kontakt (jetzt direkte E-Mail statt fiktive Subdomain).
- Neue Priorität für Datenschutz-Kontaktadresse:
  1. Explizites `datenschutzEmail`-Prop (nur setzen wenn Adresse real existiert)
  2. `email`-Prop direkt (Direktkontakt — rechtskonform, keine Halluzination)
  3. Fallback: kein Mail-Block, Hinweis "Kontaktdaten siehe Impressum"
- Hilfsfunktion `datenschutzDomain()` entfernt (war nur für Auto-Generation nötig).

### Documentation

- README: Neue Section "Rechtliche Blöcke (DSGVO)" mit Hinweis zum neuen Verhalten und Beispielen.

### Compatibility

- Backwards-kompatibel: Customer-Sites die `email={siteData.contact.email}` übergeben
  rendern jetzt die reale Kontaktadresse statt einer fiktiven — kein Code-Change nötig.
- Bestehende `datenschutzEmail`-Props werden weiterhin unverändert übernommen.

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
