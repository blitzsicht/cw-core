# Optional Features — cw-core

Features die nicht standardmäßig aktiv sind und nur auf expliziten
Customer-Wunsch eingeschaltet werden.

## llms.txt / llms-full.txt — `integrations/ai-discovery`

**Status:** opt-in, kein Default.

**Was es macht:** Generiert `/llms.txt` und `/llms-full.txt` aus `site-data.ts`
nach dem [llmstxt.org-Spec](https://llmstxt.org/).

**Aktivierung:**

```typescript
// astro.config.ts
import aiDiscovery from '@cw/core/integrations/ai-discovery';

export default defineConfig({
  integrations: [
    aiDiscovery({
      siteData: () => import('./src/data/site-data').then((m) => m.siteData),
      faqs: (s) => s.faqs,
      services: (s) => s.leistungen,
    }),
  ],
});
```

### Warum nicht Default?

[Cyrus Shepard AI Citation Ranking-Studie (Mai 2026, 54 Studien)](https://cyrusshepard.com/ai-citation-ranking) hat llms.txt mit Score **2.0** gerankt — **kein nachgewiesener Citation-Effekt**. Google-Guide vom 15.05.2026 sagt explizit: "llms.txt is not required".

Wir bieten die Generation an für Customers die:
1. Eine vertraglich zugesicherte llms.txt brauchen (z.B. Procurement-Anforderung)
2. Auf das Feature aus früheren SEO-Beratungen wertlegen
3. Selbst Experimente fahren wollen

Wir empfehlen es **nicht aktiv**. Cost-Benefit ist unklar — Wartungsaufwand minimal, aber gleichzeitig:
- Bietet Marketing-Floskel ohne Substanz
- Macht Schwächen sichtbar (alle Pages auf einer Datei)
- Risiko, dass künftige Search-Engines llms.txt als Spam-Signal werten

### Cleanup bestehender llms.txt

Plan-Phase 0 (Audit) erkennt Bestand via `aiCargoCultCheck`. **Kein Auto-Cleanup** — User entscheidet pro Customer.

## Hreflang Multi-Language

**Status:** opt-in via `ai-discovery`-Integration mit `languages`-Param.

```typescript
aiDiscovery({
  siteData: () => ...,
  languages: ['de', 'en'], // generiert /llms-de.txt, /llms-en.txt
}),
```

Aktuell nur 1 Customer (blitzsicht) mit Multi-Language. Default off.

## Plausible Analytics Custom Events

`components/analytics/Plausible.astro` lädt Plausible-Tracker. Custom Events
können via `data-cta="..."` Attribute getriggert werden — Default-Pattern für
CTA-Buttons.

**Anti-Pattern:** Custom-Events für jede Page-Interaction. Plausible ist
DSGVO-konform genau weil es **wenige** Events tracked.

## Verwandte Dokumentation

- [google-ai-guide-compliance.md](./google-ai-guide-compliance.md) — was wir machen / nicht machen
- [bing-indexnow.md](./bing-indexnow.md) — default-aktive Integration (im Gegensatz zu llms.txt)
- [non-commodity-content-guide.md](./non-commodity-content-guide.md) — was AI-Citations wirklich treibt
