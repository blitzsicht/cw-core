# Favicon-Pipeline

**Issue:** siluri/blitzsicht-ops#491 — 3/6 stichprobenartig geprüfte Sites hatten kein
`favicon.ico`. Plausible bezieht Site-Icons im Dashboard (stats.blitzsicht.com) über
den externen DuckDuckGo-Dienst (`icons.duckduckgo.com/ip3/<domain>.ico`), der
`/favicon.ico` erwartet — nicht `favicon.svg`. Fehlt die Datei, gibt's nur den
generischen Platzhalter. Ob eine Site eins hatte, war bisher Zufall aus dem
jeweiligen manuellen Onboarding.

## Mechanismus

`@cw/core/integrations/favicon-ico` ist eine Astro-Integration, die bei jedem
`astro build` aus `public/favicon.svg` ein `favicon.ico` generiert und ins
Build-Output schreibt (`astro:build:done`-Hook — analog zu
`@cw/core/integrations/ai-discovery`, das `llms.txt`/`llms-full.txt` genauso
build-time generiert).

- **Immer aktuell:** wird bei jedem Build neu generiert (keine Staleness-Heuristik
  nötig, kein manueller "vergiss nicht das Icon zu aktualisieren"-Schritt).
- **Multi-Resolution:** 16×16, 32×32, 48×48 (PNG-in-ICO, von jedem Browser und
  Windows Vista+ unterstützt — kein BMP/DIB-Reencoding nötig).
- **Fail-open:** fehlt `favicon.svg` oder ist `sharp` nicht auflösbar, wird eine
  Warnung geloggt und der Build läuft normal weiter (kein Build-Abbruch).

## Einbindung in einer Customer-Site

```ts
// astro.config.ts
import { defineConfig } from 'astro/config';
import faviconIco from '@cw/core/integrations/favicon-ico';

export default defineConfig({
  integrations: [
    faviconIco(),
    // ... weitere Integrations
  ],
});
```

Voraussetzung: `sharp` als devDependency im Customer-Repo (bereits Konvention für
die Bild-Pipeline, siehe `scripts/optimize-images.mjs`).

Optionen (alle optional):

```ts
faviconIco({
  sizes: [16, 32, 48],       // Default
  source: 'favicon.svg',     // relativ zu public/
  output: 'favicon.ico',     // Dateiname im Build-Output
});
```

## BaseLayout-Fallback-Link

`BaseLayout.astro` verlinkt zusätzlich zum SVG-Favicon explizit `/favicon.ico`:

```html
<link rel="icon" href="/favicon.ico" sizes="any" />
```

Das deckt User-Agents ab, die nur `.ico` abfragen (z. B. der DuckDuckGo-Icon-Dienst
hinter Plausible), unabhängig vom Browser-eigenen SVG/PNG-Icon-Handling.

## Fleet-weiter Health-Check

`scripts/sweep-favicon.mjs` curlt `/favicon.ico` über eine Liste von Domains und
meldet, welche kein HTTP 200 liefern:

```bash
node scripts/sweep-favicon.mjs https://a.de https://b.com
node scripts/sweep-favicon.mjs --file domains.txt   # eine Domain pro Zeile
```

Exit-Code 0 = alle 200, 1 = mindestens eine Domain fehlend/fehlerhaft.

## Rollout-Status

Diese PR liefert den Mechanismus in `cw-core` (Integration + BaseLayout-Fallback +
Sweep-Script + Tests). Das tatsächliche `favicon.ico`-Ausrollen auf jede
`customer-*`-Site erfordert, dass die jeweilige Site `faviconIco()` in ihr eigenes
`astro.config.ts` einbindet und neu deployt — das ist außerhalb des Scopes dieses
`cw-core`-only-PRs (kein Zugriff auf andere Repos aus diesem Worker). Siehe
PR-Notes für den aktuellen Sweep-Stand und die pro-Site-Rollout-Empfehlung.

## Neu-Onboarding

Bei neuen Customer-Sites: `faviconIco()` gehört ab sofort zur Standard-Astro-Config
(siehe `docs/onboarding-checklist.md`, Abschnitt 4) — kein manueller Favicon-Schritt
mehr nötig, solange `public/favicon.svg` vorhanden ist.
