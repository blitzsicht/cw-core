# Caching-Rationale — CDN, Cache-Control & Speed-Politik für Customer-Sites

Stand: 2026-07-09 (Speed-Rollout). Guard: `ai-discovery` Cache-Header-Linter
(`cache-header-check.js`), Template: `src/templates/vercel.template.json`.

## TL;DR

| Pfad | Politik | Warum |
|---|---|---|
| `/_astro/*` | **nichts tun** — Vercel-Default ist `max-age=31536000, immutable` | Content-gehasht; Astro-Preset setzt das automatisch (live verifiziert 2026-07-09 auf hausamlago.com) |
| `public/`-Assets (`/images/`, `/og/`, `/icons/`, Logo, Favicon) | `public, max-age=86400` | Dateinamen STABIL über Deploys → **niemals immutable**; 1 Tag Browser-TTL, Edge invalidiert bei Deploy ohnehin |
| `/fonts/*` (self-hosted) | `public, max-age=2592000` | Fonts ändern sich praktisch nie |
| HTML | **nichts tun** — Vercel-Default `max-age=0, must-revalidate` + Edge-HIT | Browser-TTL auf HTML würde das Fenster „stale HTML → gelöschtes gehashtes Asset" öffnen |
| `/js/script.js` (Plausible-Rewrite) | `x-vercel-enable-rewrite-caching: 1` + `CDN-Cache-Control: max-age=21600` | Externes Rewrite-Ziel wird sonst bei jedem Edge-Cold-Request getroffen. **Niemals auf `/api/event`** |

## Kein Cloudflare-Proxy vor Vercel

Vercel IST das CDN (globales Edge-Netzwerk, Brotli + HTTP/3 automatisch).
Cloudflare bleibt **DNS-only** (grey cloud) + Turnstile + MTA-STS-Worker.
Orange-cloud davorschalten ist ausdrücklich nicht empfohlen (Vercel-Doku:
„we do not recommend using a reverse proxy in front of Vercel"):

1. **Cache-Invalidierung bricht** — Cloudflare cached unabhängig und weiß
   nichts von Vercel-Deploys; atomare Deploys + Instant-Purge gehen verloren.
2. **Sicherheits-Signale gehen verloren** — Vercel Firewall/DDoS/Bot-Schutz
   sehen nur noch Cloudflare-IPs.
3. **Latenz + TLS-Komplexität** — zusätzlicher Hop, SSL-Mode-Footguns
   (Redirect-Loops bei falschem Modus).

## Warum kein `stale-while-revalidate` im Header?

Vercels Proxy **konsumiert** `stale-while-revalidate` (wie `s-maxage`) und
reicht es nicht an den Browser weiter — es wäre reine Kosmetik. Für statische
Dateien cached die Edge sowieso automatisch mit Deploy-Invalidierung.
Deshalb steht im Template das ehrliche `public, max-age=86400`.

## Warum kein `immutable` auf public/?

`public/logo.svg` heißt nach einem Logo-Update immer noch `logo.svg`.
Ein Browser mit `immutable` würde den alten Stand **nie wieder** revalidieren.
`immutable` gehört ausschließlich auf content-gehashte Pfade (`/_astro/*`) —
der Linter meldet `immutable_on_mutable_path`, wenn das Anti-Pattern
in eine Customer-vercel.json zurückrutscht.

## Flankierende Speed-Maßnahmen (Customer-seitig, astro.config)

```js
// astro.config.{mjs,ts}
prefetch: { prefetchAll: true, defaultStrategy: 'viewport' },
build: { inlineStylesheets: 'always' },
```

- **Viewport-Prefetch**: 5–15 kleine statische Seiten → quasi gratis; Astro
  respektiert `Save-Data` und langsame Verbindungen automatisch.
- **CSS-Inlining**: eliminiert render-blockende `<link rel="stylesheet">`
  (blitzsicht-Messung: ~720 ms). Gültig solange CSS klein bleibt
  (< ~14 KB compressed) — der Perf-Linter warnt, wenn Seiten wieder
  externe /_astro/-Stylesheets referenzieren.
- **View Transitions** (pure CSS, kein `<ClientRouter>`):

```css
@media (prefers-reduced-motion: no-preference) {
  @view-transition { navigation: auto; }
}
```

## Bewusst NICHT gemacht

- **Vercel Image Optimization** (`/_vercel/image`): Build-time-WebP via
  `scripts/optimize-images.mjs` reicht; Transformationen kosten pro Source-Image.
- **103 Early Hints**: auf Vercel nicht verfügbar; CSS-Inlining + Prefetch
  erfüllen denselben Zweck.
- **Kompression konfigurieren**: Brotli/gzip + HTTP/3 macht Vercel automatisch.
- **Speed Insights clusterweit**: redundant zu Plausible + Lighthouse-Pipeline
  (customer-seo-audit); optional als 4-Wochen-Pilot je Site.
