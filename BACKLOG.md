# Backlog — cw-core

Zurückgestellte Items, die nicht in den aktiven Release-Cycle gehören.
Status-Quelle ist immer das verlinkte GitHub-Issue (falls vorhanden) oder
die referenzierte Datei. Diese Datei ist nur Index + Begründung — keine
Implementierungs-Notizen.

Verwandte Tracker:

- Aktive Arbeit → GitHub-Issues (`siluri/cw-core`)
- Gemerged/Released → `CHANGELOG-CW-CORE.md`
- Bekannte Fehlgeschichte → `FAILURE-LEDGER.md`

---

## Low-Prio Cleanup

### tel:-Hrefs im E-Mail-Signatur-Generator nicht kanonisch

- **Status:** kein Issue — bewusst nicht priorisiert (Operator-Entscheidung 2026-07-30)
- **Symptom:** `templates/email-signature/` erzeugt `href="tel:+49 9401 53959-28"`
  mit Leerzeichen und Bindestrich. v0.88.0 hat die Normalisierung nur für die
  Website-Templates eingeführt, der Signatur-Generator zog nicht mit. Fällt im
  Touchpoint-Audit im `--dist`-Modus als Warnung auf, live nicht (die Signatur-
  HTMLs sind keine gecrawlten Seiten).
- **Betroffen:** alle generierten Signaturen aller Customer, nicht nur digital-direkt
- **Risiko:** minimal — betrifft nur die Signatur-Datei, nicht die Website. Wer die
  Nummer in seiner Signatur anpassen will, macht das ohnehin selbst im Mail-Client.
- **Trigger:** wenn ohnehin am Signatur-Generator gearbeitet wird. Kein eigener Anlass.
- **Aufwand:** `phoneToTelHref` in `templates/email-signature/generate.sh` einziehen
  + `pnpm sig:regenerate` über alle Customer + Signatur-Artefakte committen

### dev/preview MEMORY.md commits aufräumen

- **Status:** Issue-Referenz TBD (#12 — Repo beim ersten Touch klären)
- **Symptom:** ~7 lose MEMORY.md-Commits in dev/preview-Branches, vermutlich
  in `customer-websites` (`chore/claude-md-rule-1` o.ä.) oder cw-core selbst
- **Risiko:** keins akut — kosmetischer Tech-Debt
- **Trigger:** vor nächstem Rebase auf `release/cw-core`
- **Aufwand:** ~15 min Cherry-Pick + Squash, ggf. einen Sammel-Commit
  `chore(memory): consolidate MEMORY.md sync commits` daraus machen

---

## Eigene Initiative — Spec-Kit Evaluation

Spec-Driven-Development-Setup in `siluri/orchestration` evaluieren, parallel
zum bestehenden Captain-Workflow. Vier Stufen (A → D) als getrennte Issues:

- **A** — Install specify CLI + init in orchestration:
  [`siluri/orchestration#18`](https://github.com/siluri/orchestration/issues/18)
- **B** — `constitution.md` für Captain-Workflow schreiben:
  [`siluri/orchestration#19`](https://github.com/siluri/orchestration/issues/19)
- **C** — Pilot-Spec `spec-kit-onboarding` (alle 7 Phasen durchspielen):
  [`siluri/orchestration#20`](https://github.com/siluri/orchestration/issues/20)
- **D** — HANDBOOK Decision-Tree speckit vs. captain:
  [`siluri/orchestration#21`](https://github.com/siluri/orchestration/issues/21)

- **Trigger:** wenn Captain-Suite stabil ist und die nächste Workflow-Iteration
  ansteht. Davor kein Wert — würde nur paralleles Setup ohne Vergleichsbasis.
- **Out-of-Scope für cw-core:** rein orchestration-Repo-Initiative. Hier nur
  als Verweis, damit die Initiative nicht im Session-Wrap verlorengeht.

---

## Eigene Session — Customer-Migration aus Audit-Report

Audit-Report `cw-audit/cw-audit-verbesserungen.md` impliziert zwei
Migrations-Schichten, die nicht in den cw-core-v0.x-Release-Sprint passen.

### Schicht 1: Audit-Engine-Hartungen (cw-audit-Repo, nicht cw-core)

Phase D aus `cw-audit/cw-audit-verbesserungen.md`:

1. Sales-PDF auf `ScoreModel` umstellen — `computeScoreModel(results)` statt
   `computeScore(results)`
2. `SCORE_POTENTIAL` ersetzen durch simulierten Zielscore via
   `applyVirtualFixes(results, topPriorityFixes)`
3. `applicable: boolean` ersetzen durch
   `applicability: "applicable" | "not_applicable" | "unknown"`

→ **Repo:** `siluri/cw-audit`, **nicht** `cw-core`. Hier nur Verweis, damit
der Bezug zur Linter-Codifizierung in cw-core nicht verlorengeht.

### Schicht 2: cw-core Linter-Rollout (11 Customer-Repos)

Folgende Audit-getriebenen Features sind in cw-core v0.24–v0.27 codifiziert,
aber noch nicht auf alle 11 Customer-Sites ausgerollt:

| Feature | Version | PR |
|---------|---------|-----|
| Domain-Guard (`config.site` vs `site-data.url`) | v0.24.0 | #41 |
| Schema-Linter (doppelte JSON-LD `@id` detection) | v0.25.0 | #42 |
| SchemaOrg `slogan` + `numberOfEmployees` Props | v0.26.0/0.26.1 | #43, #44 |
| Meta-Length-Linter (Title/Description) | v0.27.0 | #45 |

- **Rollout-Pfad pro Customer:** `pnpm upgrade @cw/core@latest` →
  ggf. `site-data.ts` um `slogan` / `numberOfEmployees` ergänzen →
  `pnpm build` Smoke-Test → Domain-Guard + Schema-Linter + Meta-Length-Linter
  Output prüfen → Commit + Push
- **Aufwand:** ~15–30 min pro Customer × 11 + ggf. Fix-Runden bei Linter-Hits
- **Trigger:** sobald cw-core v0.27 als "stable" markiert ist und kein
  Breaking-Change-Backlog ansteht. Bis dahin lohnt sich der Rollout nicht,
  da v0.28+ ggf. weitere Linter mitbringt → Rollout-Bündelung spart Aufwand.
