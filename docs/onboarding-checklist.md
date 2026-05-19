# Onboarding-Checkliste — neue Customer-Site

**Wann:** Bei jedem neuen Kunden-Repo, das auf cw-core + Astro + Vercel deployt wird.
**Ziel:** Tag-1-Audit-Score grün (0 fail, ≤2 warn) ohne Polish-Sprint hinterher.

## 1. Repo-Setup

- [ ] Repo unter `siluri/customer-<name>` anlegen, lokales Verzeichnis `customer-<name>` neben `cw-core/`
- [ ] `package.json` mit cw-core-Pin: `"@cw/core": "github:siluri/cw-core#release/cw-core/vX.Y.Z-alpha"` (aktueller Stable-Tag prüfen)
- [ ] `pnpm install` läuft sauber

## 2. Vercel-Konfiguration (kritisch für Audit)

- [ ] **`vercel.json` aus Template:** `cw-core/src/templates/vercel.template.json` als Basis kopieren
- [ ] **CSP site-spezifisch anpassen** — Drittanbieter-URLs in `script-src`, `connect-src`, `frame-src`:
  - Plausible Analytics? → `https://plausible.io` in script/connect
  - Cal.com Booking? → `https://app.cal.eu` in script/connect/frame
  - Cloudflare Turnstile? → `https://challenges.cloudflare.com` in script/connect/frame
- [ ] **Pflicht-Header (NIEMALS weglassen, sonst cw-audit warn):**
  - `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`
  - `X-Frame-Options: SAMEORIGIN` (oder DENY) **zusätzlich** zu CSP frame-ancestors
  - `X-Content-Type-Options: nosniff`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `Permissions-Policy: camera=(), microphone=(), geolocation=()`
- [ ] **www→apex redirect** in `vercel.json` redirects-Sektion (`{ "source": "/:path*", "has": [{ "type": "host", "value": "www.<domain>" }], "destination": "https://<domain>/:path*", "permanent": true }`)

Audit-Drift-Vermeidung: Beim ersten Deploy direkt einen cw-audit-Run gegen die Live-Domain starten (`pnpm check https://<domain>/`).

## 3. CI / GitHub-Actions

- [ ] `rollout-build-check.sh --only <name>` ausführen → ergänzt `.github/workflows/build-check.yml`
- [ ] Falls Visual-Regression gewünscht: cw-visual-tests/baselines initialisieren (separates Setup, siehe `cw-visual-tests/README.md`)
- [ ] GitHub Repo-Secrets prüfen: `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` (sonst Env-Drift-Check fail)

## 4. Astro-Site-Inhalte (cw-core-Komponenten)

- [ ] **`<StickyMobileCTA href="/kontakt" label="..." />`** in `src/pages/index.astro` einbinden — ist NICHT auto-included in BaseLayout.astro
- [ ] **LocalBusiness JSON-LD** über `<LocalBusinessSchema>` (oder manuell) im BaseLayout — Pflicht für lokale Suche
- [ ] **FAQ-Block** mit FAQPage-Schema auf der Hauptseite (Google AI Overview-Sichtbarkeit)
- [ ] **Impressum** unter `/impressum` mit allen DDG §5-Pflichtfeldern: Name+Adresse+E-Mail+Telefon (oder elektronisches Kontaktformular bei rein-digitalem Geschäft) + Vertretungsberechtigter + Steuer-/Reg-Info + UStID
- [ ] **Datenschutz** unter `/datenschutz` mit DSGVO-Referenz, Plausible-Hinweis, Cal.com-Hinweis (falls genutzt)
- [ ] **KEIN OS-Plattform-Link** — Plattform am 20.07.2025 eingestellt (VO (EU) 2024/3228), Verweis = irreführend nach UWG. Stattdessen Hinweistext „Plattform wurde eingestellt".
- [ ] **`tokens.css`** mit site-spezifischen Brand-Farben — WCAG-AA-Kontrast (≥4.5:1) für Akzent-Texte zwingend prüfen, sonst a11y serious

## 5. Mail / DNS

- [ ] **SPF + DMARC** in DNS setzen (Audit-Check `mail.auth.spf-dmarc`)
- [ ] **DKIM-Selector** dokumentieren (Google Workspace, Postmark, Resend etc.)
- [ ] MX-Records, falls eigene Domain Mail-empfangend

## 6. Bilder

- [ ] **Alle Bilder als `.webp`** + Hero/LCP-Bilder mit `loading="eager" fetchpriority="high"`
- [ ] **`width` + `height` Attribute** auf allen `<img>`-Tags (sonst CLS und `images.dimensions.set` warn)
- [ ] Hero-Image als LCP-Element bewusst optimieren (mobile Score >90 anpeilen)

## 7. Tag-1-Audit

```bash
cd /Volumes/SiluriWork/NAS-Spiegel/MEDIEN/CODE/CLAUDE/cw-audit
pnpm check https://<domain>/ --json
# erwartet: 0 fail, ≤2 warn (CSP unsafe-inline akzeptiert via CSP-rationale.md)
```

Wenn Tag-1-Audit nicht grün ist: STOP, fix vor Customer-Hand-Over.

## 8. Memory-Pflicht

- [ ] In `~/.claude/projects/.../memory/` eine `project_<customer>_setup.md` anlegen mit:
  - Live-Domain + Vercel-Project-ID
  - Site-Brand-Farben (Hex-Codes)
  - Drittanbieter (Plausible Site-ID, Cal.com Username, etc.)
  - Spam-Defense-Stack-Status (siehe `project_spam_defense_stack.md`)

## Vorhandene Bausteine (alles in cw-core)

| Bedarf | Komponente |
|---|---|
| Mobile-CTA-Bar | `cw-core/src/components/blocks/StickyMobileCTA.astro` |
| FAQ-Block | `cw-core/src/components/blocks/FAQ.astro` |
| Layout-Basis | `cw-core/src/layouts/LandingPage.astro`, `BaseLayout.astro`, `ContentPage.astro` |
| Form-Handler | `cw-core/src/utils/forms/handle-submission` (CAVE: bei Vercel-Function-Crash inline kopieren, siehe `feedback_cwcore_form_handler_inline.md`) |
| Security-Headers | `cw-core/src/templates/vercel.template.json` |
| CSP-Begründung | `cw-core/docs/CSP-rationale.md` |
| Sweep-Skript | `customer-websites/scripts/rollout-security-headers.sh` (Drift-Sync für vercel.json) |
| Build-Check | `customer-websites/scripts/rollout-build-check.sh` |
