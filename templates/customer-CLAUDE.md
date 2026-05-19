# [CUSTOMER_NAME] — Claude Code Regeln

Dieses Template in `cw-core/templates/customer-CLAUDE.md` wird in jedes neue Customer-Repo kopiert.
`[CUSTOMER_NAME]`, `[DOMAIN]`, `[PRIMARY_COLOR]`, `[ACCENT_COLOR]` durch echte Werte ersetzen.

---

## Brand

- **Name:** [CUSTOMER_NAME]
- **Domain:** [DOMAIN]
- **Primary:** `[PRIMARY_COLOR]`
- **Accent:** `[ACCENT_COLOR]`

---

## Mobile-First (Pflicht)

Jede neue Component und jede `<style>`-Sektion startet mit Mobile-Defaults.
Größere Viewports sind Enhancements, keine Overrides.

### Richtig (Mobile-First)
```css
.card { padding: 1rem; font-size: 0.9rem; }
@media (min-width: 768px) {
  .card { padding: 2rem; font-size: 1rem; }
}
```

### Falsch (Desktop-First) — wird von Stylelint geblockt
```css
/* stylelint-disable-next-line plugin/no-max-width-media */
.card { padding: 2rem; }
@media (max-width: 768px) { .card { padding: 1rem; } }
```

### Reference-Components nutzen statt eigene Media Queries
- Tabellen → `<ResponsiveTable>` aus `@cw/core/components/primitives/`
- Grids → `<ResponsiveGrid min="280px">` (auto-fit, braucht keine Media Queries)
- Stack-Layouts → `<Stack from="md">` (vertikal mobile, horizontal ab md)

### Verifikation vor Commit
`pnpm lint:css` läuft via pre-commit-Hook. Ein neues `@media (max-width: ...)` ohne
`/* stylelint-disable-next-line plugin/no-max-width-media -- Begründung */` blockt den Commit.

---

## Imports in cw-core-Komponenten

Immer relative Pfade — kein `@/`-Alias (bricht Customer-Builds):
```astro
// Richtig
import Hero from '../../components/blocks/Hero.astro';
// Falsch
import Hero from '@/components/blocks/Hero.astro';
```

---

## Bilder

- NIEMALS raw JPG/PNG committen
- IMMER `pnpm optimize:images` (aus cw-core scripts) → WebP konvertieren
- srcset/sizes für Hero-Bilder setzen (mobile 375px, tablet 768px, desktop 1280px)
- **Astro `<Image>` statt raw `<img>`** für content-Bilder. Bilder unter `src/assets/images/`
  ablegen + importieren, dann `<Image src={x} alt="..." />` rendern. Astro setzt
  width/height automatisch und generiert Format-Varianten beim Build.
  ```astro
  ---
  import { Image } from 'astro:assets';
  import garten from '@/assets/images/galerie/garten.webp';
  ---
  <Image src={garten} alt="Beschreibung" loading="lazy" />
  ```
  Raw `<img src="/images/...">` (aus public/) führt zu `images.dimensions.set` Audit-Fail.

---

## llms.txt für AI-Crawler (Pflicht ab 2026)

Jeder Customer-Repo MUSS `public/llms.txt` ODER einen Astro-Endpoint
`src/pages/llms.txt.ts` haben. Endpoint-Pattern (Recommended) generiert die
Datei zur Build-Time aus `src/data/site-data.ts` — bleibt automatisch synchron
mit dem Site-Manifest.

Template: `cw-core/src/templates/llms-endpoint.ts.template` → kopieren nach
`src/pages/llms.txt.ts`. Custom-Inhalt durch `public/llms.txt` (überschreibt
den Endpoint).

---

## WCAG 2.2 AA Color-Contrast (Pflicht)

`tokens.css` muss WCAG 2.2 AA bestehen — geprüft via:

```bash
node /path/to/cw-core/scripts/validate-tokens-css.mjs src/styles/tokens.css
```

Critical Combos: `.btn-accent` (white auf accent), Headings (primary auf weiss/surface),
accent-text auf weiss/surface. Falls accent zu hell für white-Text: Override
setzen via `--color-accent-btn-text: var(--color-primary-dark)`. Beispiel:
gottl-richter-gomeier hat `#C8963E` Gold + Override `#111C33` Navy = 6.7:1.

---

## Commits

Format: `type(scope): kurze Nachricht` — z. B. `feat(hero): add srcset`, `fix(a11y): contrast token`

Nach `pnpm build` ohne Fehler sofort committen oder User fragen.
