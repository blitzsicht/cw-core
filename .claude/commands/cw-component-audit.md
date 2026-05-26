---
description: Audit aller Customer-Repos auf nicht-wiederverwendbare Komponenten (Custom-HTML/CSS-Bastelei, die in cw-core gehört).
---

# Component Reusability Audit

Ziel: Finde Code in Customer-Repos, der gegen die Regel "Customer-Repos enthalten keine eigene UI-Logik" verstößt. Alles, was UI ist, kommt aus `@cw/core`. Customer-Repos enthalten nur: Content (MD/MDX), Config, customer-spezifische Assets, dünne Page-Wrapper.

## Scope

Customer-Repos (lokal geklont unter dem Blitzsicht-Workspace):
- blitzsicht, steller-sanierungen, schiller, gottl-richter-gomeier
- haus-am-lago, haus-am-mincio
- weinkontor-sinzing, digital-direkt

## Vorgehen

Pro Repo, in dieser Reihenfolge:

### A. Inventar
1. Liste alle `.astro`, `.jsx`, `.tsx`, `.vue`, `.svelte` Files unter `src/` außerhalb von `src/pages/` und `src/content/`.
2. Liste alle `<style>`-Blöcke mit > 20 LOC in beliebigen Files.
3. Liste alle `.css`, `.scss`, `.module.css` Files außerhalb klar abgegrenzter Tokens/Overrides.

### B. Klassifikation
Für jeden Treffer klassifiziere:

- **DUPE**: existiert bereits in `@cw/core` als Komponente → Migration trivial, Import austauschen.
- **GENERIC**: nicht in cw-core, aber generisch genug für andere Customer → muss nach cw-core promoted werden.
- **CUSTOMER-SPECIFIC**: wirklich nur für diesen Customer relevant → akzeptabel, aber dokumentieren warum.
- **CONTENT-LEAK**: HTML/Styling, das eigentlich Content ist (gehört in MDX mit cw-core Komponenten).

### C. Cross-Repo-Dupes
Vergleiche Treffer über alle Customer-Repos. Identische oder fast-identische Custom-Komponenten in ≥ 2 Repos = harter Indikator für fehlende Abstraktion in cw-core.

### D. Inline-Style-Wildcards
Flagge jedes:
- `style="..."` Attribut mit > 3 Properties
- `<style>` Block mit Custom-Selektoren, die Design-Token-Variablen umgehen
- Hardcoded Farben/Spacings ohne CSS-Variable aus cw-core

### E. Output

Markdown-Report nach `reports/cw-component-audit-<YYYY-MM-DD>.md` (relativ zum cw-core Repo-Root). Verzeichnis `reports/` anlegen falls nicht vorhanden. Reports werden committet (Audit-Trail).

```
# CW Component Audit – <Datum>

## Executive Summary
- Repos gescannt: N
- Findings total: N (DUPE: x, GENERIC: y, CUSTOMER-SPECIFIC: z, CONTENT-LEAK: w)
- Cross-Repo-Dupes: N Komponenten in ≥2 Repos
- Geschätzte Migration-Aufwand (Mensch+Claude Code): X h

## Priorisierte Migration-Liste
1. <Komponente> – betrifft <Repos> – Aufwand <h> – Begründung
2. ...

## Per-Repo-Details
### <repo-name>
| File | Type | Lines | Klassifikation | Vorschlag |
|------|------|-------|----------------|-----------|
| ...  | ...  | ...   | DUPE           | Ersetze mit @cw/core/Button |

## Promotion-Kandidaten für cw-core
<Liste von GENERIC Komponenten mit Repo-Häufigkeit>
```

## Constraints

- Read-only. Kein Refactoring in diesem Lauf.
- Nutze `rg` / `ast-grep` für Pattern-Matching, nicht handgestrickte Regex.
- Pro Klassifikation mind. 1 Code-Snippet im Report als Beleg.
- Bei Unklarheit: lieber DUPE flaggen als auslassen.
