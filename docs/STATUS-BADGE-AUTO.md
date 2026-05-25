# Status-Badge Auto-Detection (v0.16.0+)

Seit `@cw/core@0.16.0` muss `statusBadge` im Footer nicht mehr explizit in `page-config.ts` gesetzt werden. Der Slug wird aus `package.json.name` abgeleitet.

## Customer-Site Setup (einmalig)

Konvention: `package.json.name` MUSS dem Pattern `customer-<slug>` folgen (z.B. `customer-hausamlago`).

`astro.config.mjs` (oder `.ts`) erweitern:

```ts
import { defineConfig } from 'astro/config';
import pkg from './package.json' with { type: 'json' };

const customerSlug = pkg.name.replace(/^customer-/, '');

export default defineConfig({
  vite: {
    define: {
      'import.meta.env.CW_CUSTOMER_SLUG': JSON.stringify(customerSlug),
    },
  },
  // ... weitere Settings
});
```

Damit liest cw-core den Slug zur Build-Zeit aus dem Package-Namen und rendert den Footer-Badge automatisch.

## Verhalten

| `statusBadge` Prop in `page-config.ts` | Vite-Define `CW_CUSTOMER_SLUG` | Resultat |
|---|---|---|
| `{ slug: 'x' }` (explizit) | gesetzt oder leer | Badge mit Slug `x` (explicit wins) |
| `undefined` (nicht gesetzt) | gesetzt (z.B. `'hausamlago'`) | Badge mit Slug `hausamlago` (Auto) |
| `undefined` (nicht gesetzt) | leer / nicht gesetzt | KEIN Badge |
| `null` (Opt-Out) | beliebig | KEIN Badge (Opt-Out gewinnt) |

## Migration Bestands-Customer

Optionaler Cleanup: `statusBadge`-Eintrag aus `page-config.ts` entfernen, wenn der Slug dem `package.json.name`-Konventionsmuster folgt. Alte explizite Werte funktionieren weiterhin (kein Breaking Change).

## Edge-Cases

- **Sub-Site / Microsite ohne eigenen Monitoring-Eintrag:** `statusBadge: null` setzen — Opt-Out
- **Multi-Customer-Build (z.B. Whitelabel-Plattform):** Auto-Detection abschalten via Vite-Define mit leerem String, dann explizit pro Build
- **Backward-Compat:** Wenn weder `statusBadge` noch `CW_CUSTOMER_SLUG` gesetzt sind, rendert cw-core nichts — kein Crash

## Verifikation

```bash
cd customer-blitzsicht  # oder beliebige Customer-Site
pnpm build
# Erwartung: footer enthält <img src="https://status.blitzsicht.com/badge/blitzsicht.svg">
grep -r 'status.blitzsicht.com/badge' dist/index.html
```

## Verwandte Dateien

- `src/components/layout/Footer.astro` — Auto-Detection-Logik
- `src/layouts/LandingPage.astro` + `ContentPage.astro` — Forward des Props
- `tests/footer-status-badge-auto.test.ts` — E2E-Test (Build-Output enthält Badge)
