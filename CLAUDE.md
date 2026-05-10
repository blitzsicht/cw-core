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

## Verwandt
- `customer-websites` — Cross-Repo Learnings, Spec-Repo
- `cw-onboarding` — nutzt `cw-core` Templates für neue Kunden
- `customer-*` — alle 11 Customer-Sites importieren `@cw/core`
