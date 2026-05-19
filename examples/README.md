# cw-core Component-Showcase

Lokales Mini-Astro-Project für visuelle Demos der cw-core-Components. Plan-Phase 1.6.

> **Hintergrund:** User-Plan-Antwort war "Storybook 8 aufsetzen". Aber Storybook + Astro 5 ist Mai 2026 noch nicht stabil — `@storybook/addon-astro` existiert nicht in npm registry, nur Community-Package `storybook-astro@0.2.1` mit 3 Versionen. Pragmatische Entscheidung: Examples-Pattern statt Storybook. Erfüllt den gleichen Zweck (interaktive Component-Demos für interne Doku + Customer-Calls) ohne experimentelles Ökosystem.

## Starten

```bash
# Im cw-core-Root:
pnpm --filter @cw/core-examples dev

# Oder aus dem examples-Folder:
cd examples
pnpm install  # einmalig
pnpm dev
```

Port 4322 (Customer-Sites laufen auf 4321 — keine Kollision).

## Pages

| URL | Component |
|---|---|
| `/` | Übersicht |
| `/answer-block` | AnswerBlock (Lead-with-Answer) |
| `/recently-updated` | RecentlyUpdated (Freshness-Badge) |
| `/cta-primary` | CTAPrimary (Agent-Friendly CTA) |
| `/case-study` | CaseStudyBlock |
| `/behind-the-job` | BehindTheJob |
| `/price-transparency` | PriceTransparency |
| `/local-proof-map` | LocalProofMap |
| `/faq-honest` | FAQHonest |

## Konvention

- Pro Component: mind. 1 typisches + 1 Edge-Case-Beispiel
- Code-Snippet sichtbar (Copy-Paste-fertig)
- Brand-Tokens (`--color-primary`, `--color-accent` etc.) im Layout
- Keine Astro-Integrations außer Standard (vermeidet Doppel-Pflege)

## Build (für statisches Hosting)

```bash
cd examples && pnpm build
# Output: examples/dist/ — kann auf Vercel/Netlify deployed werden
```

Default nicht öffentlich gehosted. Für interne Doku reicht `pnpm dev`.
