# Google AI Optimization Guide — Compliance bei cw-core

> **Zweck:** Dieses Dokument erklärt, welche Empfehlungen aus dem
> Google AI Optimization Guide vom 15.05.2026 + parallelen Studien
> in cw-core umgesetzt sind, welche bewusst NICHT umgesetzt sind und warum.

## Quellen

| Quelle | Datum | Was sie sagt (Kurzfassung) |
|---|---|---|
| [Google AI Optimization Guide](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide) | 15.05.2026 | AI Overviews + AI Mode nutzen RAG + Query Fan-out auf Search Index. SEO bleibt fundamental. llms.txt, Chunking, AI-Rewrites, Special Schema sind laut Google nicht nötig. |
| [SISTRIX AI Overview CTR Impact](https://www.sistrix.com/blog/ai-overview-ctr-impact) | Feb 2026 | Pos 1 in DE verliert 59% CTR durch AI Overviews. 265M Klicks/Monat verloren. AI Overviews auf 20% DE-Keywords. |
| [Cyrus Shepard AI Citation Ranking Factors](https://cyrusshepard.com/ai-citation-ranking) | 07.05.2026 | 54 Studien analysiert. Top-Faktoren: URL accessibility (9.5), search rank (9.4), fan-out rank (9.3), preview control (9.2), query-answer match (9.2). llms.txt: 2.0 (no credible evidence). |
| [Ahrefs AI Overview Citations Study](https://ahrefs.com/blog/ai-overview-citations) | Apr 2026 | 38% AI Overview Citations aus Google Top 10. Win SEO = Win AI Citations. |
| Google March 2026 Core Update | März 2026 | Templated Location Pages mit nur Stadt-Swap depriorisiert. Home Services als betroffene Branche explizit genannt. |

## Was cw-core MACHT

### ✓ Non-Commodity-Content-Components (Plan-Phase 1.1)

8 neue Components für strukturierte First-Hand-Inhalte:

- `AnswerBlock` — Lead-with-Answer für Service-Pages
- `RecentlyUpdated` — sichtbares dateModified-Signal
- `CTAPrimary` — Agent-Friendly Markup mit data-cta-type
- `CaseStudyBlock` — echte Aufträge mit Customer/Location/Year
- `BehindTheJob` — Learnings + Mistakes (First-Hand-Content)
- `PriceTransparency` — verhindert "auf Anfrage"-Antipattern
- `LocalProofMap` — lokale Referenzen statt Map-Embed
- `FAQHonest` — Thin-Content-Prevention via minAnswerChars

**Rationale:** Cyrus Shepard belegt query-answer match (9.2) und preview control (9.2) als Top-Faktoren. Lead-with-Answer im AnswerBlock adressiert beides.

### ✓ Schema-Helpers — Subtype-aware (Plan-Phase 1.2)

`localBusinessSchema()` mapped Customer-Service-Profile auf Schema.org-Subtypes (Plumber, Electrician, HVACBusiness, Bakery, ...). Generic `LocalBusiness` gibt Build-Warning.

**Rationale:** Google-Guide sagt explizit: "Use the most specific schema.org type that applies to your business". AI Overviews kategorisieren über Subtypes.

### ✓ Bing IndexNow — Default-Aktiv (Plan-Phase 1.4)

`integrations/bing-indexnow` ist **default-aktiviert** für alle Customer-Sites (Opt-out via Config).

**Rationale:** ChatGPT nutzt Bing-Index für Real-Time-Retrieval. IndexNow reduziert Indexierungs-Lag von Wochen auf Stunden. Im Gegensatz zu llms.txt hat IndexNow nachgewiesenen Nutzen.

### ✓ Build-Time-Checks (Plan-Phase 1.3, in Vorbereitung)

- 1× `<h1>` pro Page (Build-Fail bei Verstoß)
- AnswerBlock-Pflicht für Service-Pages (Build-Warning bei Fehlen)
- Vague-CTA-Labels-Warning in `CTAPrimary`

### ✓ Schema-Validation im Build

JSON-LD-Output wird gegen schema.org-Spec validiert. CI-Fail bei invalid Schema.

## Was cw-core NICHT MACHT (mit Begründung)

### ✗ Keine standardmäßige llms.txt-Generation

`integrations/ai-discovery` (existing) bleibt opt-in. Customer-Sites die llms.txt bereits haben, behalten es — kein Auto-Cleanup.

**Rationale:** Cyrus Shepard Ranking-Score 2.0 — kein nachgewiesener Citation-Effekt. Google-Guide sagt explizit: "llms.txt is not required". Wir bieten die Generation auf Customer-Wunsch an, aber empfehlen es nicht aktiv.

### ✗ Keine Custom-AI-Schema-Properties

`aiOptimized`, `@type: AIContent`, `aiKeywords`-Meta-Tags etc. sind nicht im Komponenten-Output.

**Rationale:** Google-Guide listet diese explizit als "not needed". cw-audit's `aiCargoCultCheck` flaggt sie als Findings.

### ✗ Keine künstliche FAQ-Generation

`FAQHonest.astro` enforced `minAnswerChars` (default 150). Antworten unter Schwelle werden nicht ins FAQPage-Schema aufgenommen.

**Rationale:** Thin-Content-FAQs werden von Google als Spam-Signal gewertet. Besser ehrlich kürzere FAQ ohne Schema als gefüllte FAQ mit dünnen Antworten.

### ✗ Keine Stadt-Page-Multiplikation ohne Unique-Content

cw-core liefert **keine** Astro-Dynamic-Route-Templates für programmatic-SEO. Customer-Sites die `[stadt].astro` einsetzen wollen, müssen pro Stadt-Page substantiellen Unique-Content liefern (CaseStudyBlock + LocalProofMap-Entries für die Stadt + AnswerBlock mit Stadt-Bezug).

**Rationale:** Google March 2026 Core Update hat templated Location Pages depriorisiert. cw-audit's `programmaticContentCheck` warnt vor scaled-content-abuse-Risk.

### ✗ Keine "AI-optimierten" Marketing-Floskeln

Component-Defaults und Doku verwenden sachliche Sprache. "AI-friendly", "GEO-optimized", "AEO-ready" tauchen nirgends als Hero-Claim auf.

**Rationale:** Diese Begriffe sind Marketing-Etiketten ohne technische Substanz (Google-Guide: "AEO/GEO are just SEO marketing terms"). Schema-Markup ist Defense (Klarheit für Crawler), nicht Offense.

## Verwandte Dokumentation

- [non-commodity-content-guide.md](./non-commodity-content-guide.md) — Component-Usage
- [bing-indexnow.md](./bing-indexnow.md) — IndexNow-Setup
- [optional-features.md](./optional-features.md) — opt-in Features

## Audit-Tooling

`cw-audit` enthält 82+ Checker, davon 11 spezifisch für AI-Citation-Readiness:
- `contentFreshnessCheck` · `aiCargoCultCheck` · `bingIndexNowCheck`
- `agentReadinessCheck` · `answerFrontLoadingCheck`
- `localBusinessSubtypeCheck` · `programmaticContentCheck`
- `searchConsoleCheck` · `reviewSpecificityCheck` · `commodityContentCheck`

Portfolio-Mode: `pnpm cw portfolio --filter slug1,slug2 --dry-run`

Report-Output: PDF mit dedizierter "AI-Citation-Readiness"-Section + SISTRIX-Kontext.
