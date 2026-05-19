# CLAUDE.md — cw-core

## Zweck
Geteilte Astro-Komponenten, Layouts, Styles und Manifest-Schema für alle Blitzsicht-Customer-Websites. Wird als `@cw/core` von `customer-*` Repos importiert.

## Stack
- Astro 5
- TypeScript
- Tailwind CSS v4 (`@theme` Tokens)
- Zod (Manifest-Schema)

## Konventionen
- **API-Stabilität:** Breaking Changes zuerst über Major-Bump, mindestens 1 Customer-Site testen
- **Tailwind:** Nur Tokens via `@theme` definieren, Customer-Sites überschreiben sie
- **Komponenten:** Headless first — jeder Customer kann via Slots/Props anpassen
- **Manifest-Schema:** Source of Truth, generiert TypeScript-Typen

## Wichtige Pfade
- `src/components/` — wiederverwendbare Astro-Components (Hero, Pakete, Kontaktformular)
- `src/layouts/` — BaseLayout, LandingPage, ContentPage
- `src/styles/` — `@theme` Tokens, Reset
- `templates/` — Starter-Templates für `@cw/cli`
- `scripts/` — Build-/Sync-Helfer

## Häufige Gotchas
- Bei Update: alle 11 Customer-Sites kurz `pnpm build` testen, sonst Drift
- Tailwind v4 ist breaking gegenüber v3 — keine v3-Klassen verwenden
- DSGVO: keine Google Fonts, keine externen Trackers in Default-Layouts
- **CSP: niemals `'self'` allein in `style-src{,-elem}` oder `script-src{,-elem}` — explicit-domain `https://<domain>` daneben setzen** (siehe `docs/CSP-rationale.md`, Bisection 2026-05-12 auf digital-direkt.com)

## CSP-Test-Protokoll (Pflicht bei jedem CSP-Touch)

Bei jeder Änderung an `src/templates/vercel.template.json` Content-Security-Policy:

1. Lokal mit `pnpm build` validieren — kein JSON-Syntax-Error.
2. Auf 1 Customer-Test-Site deployen (z.B. customer-blitzsicht): vercel.json mit gepatchter CSP, `git push`, ~45s warten.
3. **Browser-Smoke-Test in Edge + Safari** (Inkognito, `Cmd+Shift+R`):
   - Page rendert mit Styles (Hero gerundet, Buttons farbig)
   - DevTools-Konsole: 0 CSP-Violations
   - `securitypolicyviolation`-Listener im Browser-Konsolen-Snippet empfängt nichts
4. **Erst danach** cw-core-Release-Tag, dann Rollout an andere Sites.

**Historisch broken Pattern (Bisection 2026-05-12):**
`'self'` allein in `style-src` oder `style-src-elem` blockt same-origin Stylesheets, obwohl Header byte-clean ASCII gesendet wird. Ursache nicht abschließend identifiziert. Pragma: expliziten Origin neben `'self'` einfügen. Siehe `docs/CSP-rationale.md` für Details.

## Verwandt
- `customer-websites` — Cross-Repo Learnings, Spec-Repo
- `cw-onboarding` — nutzt `cw-core` Templates für neue Kunden
- `customer-*` — alle 11 Customer-Sites importieren `@cw/core`
