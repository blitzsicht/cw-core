# Non-Commodity-Content Guide — cw-core v0.11+

> **Tldr:** Generic Tipps-Listen werden depriorisiert. Konkrete Inhalte mit
> echten Kunden, Orten, Zahlen und Lernerfahrungen sind das primäre Mittel
> für AI-Citations und SEO-Rankings 2026.

## Hintergrund

Der Google AI Optimization Guide vom 15.05.2026 sagt explizit:

> "AI Overviews and AI Mode use RAG + Query Fan-out on the Search Index. Schema
> markup, llms.txt, AI-rewrites or special AI-content are not required.
> Non-commodity content (first-hand, expert-led, concrete) is the primary lever."

Parallele Studien (Cyrus Shepard 54-Studien-Ranking, Mai 2026):
- Top AI-Citation-Faktoren: URL accessibility (9.5), search rank (9.4), fan-out rank (9.3), preview control (9.2), query-answer match (9.2)
- llms.txt scored 2.0 — kein nachgewiesener Citation-Effekt
- 38% der AI Overview Citations stammen aus Google Top 10
- Pages <30 Tage alt bekommen 3.2× mehr AI-Citations
- 44.2% Citations aus ersten 30% Page-Content → **Lead-with-Answer**

## Components und ihre Einsatzgebiete

### `AnswerBlock` — Lead mit der Antwort

**Wann verwenden:** Jede Service-Page, jede Money-Keyword-Landing-Page.

**Pflicht-Eigenschaften:**
- `directAnswer` max 50 Wörter (Build-Warning bei >80)
- Self-contained (keine "wir" ohne Kontext-Antezedent)
- Erstes Content-Element nach `<h1>`

**Beispiele:**

✅ **Gut:**
```astro
<AnswerBlock
  question="Was kostet eine Rohrreinigung in Regensburg?"
  directAnswer="Eine Rohrreinigung kostet bei uns 180-320€ — abhängig von Zugang und Verstopfungsart. Notdienst außerhalb Öffnungszeiten 240-480€."
  priceRange="180€ – 320€"
  timeline="2–4 Stunden vor Ort"
/>
```

❌ **Schlecht (Generic):**
```astro
<AnswerBlock
  question="Was kostet eine Rohrreinigung?"
  directAnswer="Die Kosten hängen von vielen Faktoren ab. Wir bieten faire Preise und transparente Abrechnung."
/>
```

### `CaseStudyBlock` — Echte Aufträge mit echten Namen

**Wann verwenden:** Pro Service-Page mindestens 1 Case-Study mit konkretem Customer/Location/Year.

**Anti-Pattern:** Stock-Phrases wie "Wir lösten ein komplexes Problem für einen Kunden". → Macht den Block wertlos.

**Pflicht:** Kunden-Approval für Veröffentlichung. Falls Customer nicht namentlich genannt werden will: Pseudonym + Anmerkung "Name geändert, Auftrag dokumentiert".

### `BehindTheJob` — Lerneffekte aus echten Aufträgen

**Wann verwenden:** Pro Quartal mindestens 1 BehindTheJob auf den Top-3-Money-Pages.

**Pflicht:**
- `learnings` ≥3 konkrete Items mit Branchen-Detail
- `mistakes` (optional aber empfohlen) — macht den Content authentisch
- `result` — was wird heute anders gemacht

**Anti-Pattern:** Marketing-Sprache. "Wir sind die Besten" gehört nicht hier rein.

### `PriceTransparency` — Konkrete Preis-Ranges

**Wann verwenden:** Jede Service-Page mit Standardleistungen.

**Pflicht:**
- `priceRange` als String mit Einheit (€/h, € fix, € pro qm)
- `factors` 2-4 Stichpunkte was den Preis bestimmt

**Anti-Pattern:**
- "Auf Anfrage" → keine PriceTransparency-Component, dann ehrlich rauslassen.
- "ab 99€" ohne Obergrenze → User trauen das nicht. Lieber Range geben.

### `LocalProofMap` — Region + echte Referenzen

**Wann verwenden:** Service-Area-Businesses (kein Storefront-Termin nötig). Mindestens 8 Referenzen über mind. 3 Städte.

**Pflicht:**
- Echte Stadt-Namen
- Service-Typ pro Auftrag (nicht "Sanierung" sondern "Dachsanierung Reihenhaus, 95 qm")
- Jahr

### `FAQHonest` — Substantielle Antworten

**Wann verwenden:** FAQ-Sections mit ≥3 Items. Verwenden statt `FAQ.astro` wenn Answer-Quality variabel ist.

**Pflicht:**
- `minAnswerChars` (default 150) — Items unter Schwelle nicht ins Schema
- Antworten in voller Satzform, keine Stichpunkte als Schema-Body

## Schema-Helpers

Alle Components emittieren JSON-LD automatisch. Für manuelle Schema-Generation:

```typescript
import {
  localBusinessSchema,
  caseStudySchema,
  articleSchema,
  serviceSchema,
  breadcrumbListSchema,
} from '@cw/core/schema';
```

### Subtype-Mapping bei LocalBusiness

**Pflicht-Decision pro Customer:** Welcher Schema.org-Subtype trifft zu?

| Customer-Branche | Subtype |
|---|---|
| Sanitär/Klempner | `plumber` |
| Elektriker | `electrician` |
| Heizung/Klimatechnik | `hvac` |
| Dachdecker | `roofing-contractor` |
| Bäckerei | `bakery` |
| Weinhandel | `wine-store` |
| Ferienunterkunft | `bed-and-breakfast` oder `lodging` |
| Garten- und Landschaftsbau | `garden-store` (oder `professional-service`) |
| Immobilienmakler | `real-estate-agent` |
| Allgemeiner Bauunternehmer | `general-contractor` |
| Reinigung (keine spezifischer Type) | `professional-service` |

Generic `LocalBusiness` (Fallback) gibt Build-Warning aus.

## Customer-Onboarding-Checklist (Non-Commodity-Setup)

Pro neuer Customer-Site:

- [ ] `siteData.businessType` setzen (mapped auf Schema-Subtype)
- [ ] `AnswerBlock` pro Service-Page implementiert (Lead-with-Answer)
- [ ] `RecentlyUpdated` im Layout (oder pro relevanter Page) für dateModified-Signal
- [ ] Mind. 1 `CaseStudyBlock` pro Service-Page mit echtem Customer-Approval
- [ ] `PriceTransparency` falls Preise transparent gemacht werden
- [ ] `LocalProofMap` für Service-Area-Businesses mit ≥8 Referenzen
- [ ] `FAQHonest` (statt generic FAQ) wenn Antworten gemischter Qualität
- [ ] IndexNow-Integration aktiviert (`apiKey` aus 1Password)
- [ ] sameAs ≥2 externe Profile (GMB + mind. 1 Branchenbuch oder Facebook)
- [ ] CTAs mit `data-cta-type`-Attribut versehen (für Browser-Agents)

## Was bewusst NICHT gemacht wird

- ❌ **Keine künstliche FAQ-Generation** — Antworten müssen aus Customer-Input kommen
- ❌ **Keine Stadt-Page-Multiplikation** ohne Unique-Content (Google March 2026 Core Update)
- ❌ **Keine llms.txt-Generierung als Standard** (kein nachgewiesener Citation-Effekt)
- ❌ **Keine Custom-AI-Schema-Properties** (`aiOptimized`, `AIContent` etc.)
- ❌ **Keine "Wir sind die Besten"-Marketing-Floskeln** als Page-Top-Content

## Verwandte Dokumentation

- [google-ai-guide-compliance.md](./google-ai-guide-compliance.md) — was Blitzsicht macht / nicht macht / warum
- [optional-features.md](./optional-features.md) — opt-in Features wie llms.txt
- [bing-indexnow.md](./bing-indexnow.md) — IndexNow-Setup (Default-Aktiv)
