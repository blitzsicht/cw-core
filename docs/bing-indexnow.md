# Bing IndexNow Integration

> Aktiviert in cw-core v0.11+. Reduziert Bing-Indexierungs-Lag von
> Wochen auf Stunden. Pflicht für ChatGPT-Sichtbarkeit.

## Hintergrund

ChatGPT nutzt seit 2024 den **Bing-Index** für Real-Time-Retrieval ("Browse with Bing"). Sites die nicht im Bing-Index sind, sind für ChatGPT effektiv unsichtbar. Bings organische Indexierung ist langsam (Wochen bis Monate für neue Pages). IndexNow ist eine Push-API die Search-Engines aktiv über URL-Updates informiert.

**Cyrus Shepard AI Citation Ranking (54 Studien, Mai 2026):** URL accessibility = 9.5 (höchster Faktor). IndexNow trifft direkt darauf.

## Setup pro Customer

### 1. IndexNow-Key generieren

```bash
# Random 32-char hex
openssl rand -hex 16
# z.B. → a3f8e1b2c4d5e6f7a8b9c0d1e2f3a4b5
```

### 2. Key in 1Password speichern

```bash
op item create --category=API_Credential \
  --title="indexnow-<customer-slug>" \
  --vault=claude \
  apikey="$KEY" \
  notesPlain="Customer: <slug> · Generated: $(date -I)"
```

### 3. Astro-Config aktivieren

```typescript
// astro.config.ts
import { defineConfig } from 'astro/config';
import bingIndexNow from '@cw/core/integrations/bing-indexnow';

export default defineConfig({
  site: 'https://example.com',
  integrations: [
    bingIndexNow({
      siteUrl: 'https://example.com',
      apiKey: process.env.INDEXNOW_KEY,
      enabled: process.env.VERCEL_ENV === 'production', // nur prod
    }),
  ],
});
```

### 4. Build-Test (Verify-Only)

```bash
INDEXNOW_KEY=a3f8e1b2c4d5e6f7a8b9c0d1e2f3a4b5 pnpm build
ls dist/$INDEXNOW_KEY.txt  # sollte existieren mit Key als Inhalt
```

### 5. Live-Deploy

Nach erstem Production-Deploy:

```bash
# Verify dass Key-File live erreichbar ist
curl https://example.com/<KEY>.txt
# → sollte den Key zurückgeben (Verifikation für Bing)

# Bing Webmaster Tools Verifizierung (einmalig pro Domain)
# https://www.bing.com/webmasters → Add Site → IndexNow Key Method
```

## Wie es funktioniert

1. **Verifikations-Key-File:** Beim Build wird `<key>.txt` in `dist/` geschrieben — Inhalt ist der Key. Bing prüft beim ersten Ping ob das File existiert und der Inhalt matched.

2. **Sitemap-Parsing:** Integration liest `dist/sitemap-index.xml` (Astro-Default), folgt Child-Sitemaps und extrahiert alle URLs.

3. **Bulk-Ping:** POST an `https://www.bing.com/indexnow` mit:
   ```json
   {
     "host": "example.com",
     "key": "<KEY>",
     "keyLocation": "https://example.com/<KEY>.txt",
     "urlList": ["https://example.com/page-1", ...]
   }
   ```
   Max 10.000 URLs pro Request. Bei mehr: Chunks.

4. **Multi-Engine:** IndexNow-Ping wird automatisch an alle teilnehmenden Search-Engines weitergeleitet (Bing, Yandex, Naver, Seznam).

## Response-Codes

| Code | Bedeutung | Action |
|---|---|---|
| 200 | OK — URLs accepted | nichts |
| 202 | Accepted (async processing) | nichts |
| 400 | Invalid JSON | Bug in Integration — Report |
| 403 | Key not matching | Verifikations-File prüfen |
| 422 | URLs not within host | siteUrl in astro.config korrigieren |
| 429 | Too many requests | Rate-Limit. IndexNow erlaubt aktuell 10.000 URLs/Tag pro Site. |

## Opt-Out

Wenn ein Customer explizit gegen Bing-Ingestion ist:

```typescript
bingIndexNow({
  siteUrl: '...',
  apiKey: '...',
  enabled: false,  // ← deaktiviert die Integration
}),
```

Oder Integration einfach nicht in `integrations: [...]` aufnehmen.

## Verwandte Dokumentation

- [IndexNow Official Spec](https://www.indexnow.org/documentation)
- [Bing Webmaster Tools API](https://learn.microsoft.com/en-us/bingwebmaster/getting-access)
- [google-ai-guide-compliance.md](./google-ai-guide-compliance.md) — warum default-aktiv
