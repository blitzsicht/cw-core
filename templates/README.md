# cw-core CI Templates

Wiederverwendbare CI-Workflows und Configs für Customer-Repos.

## Dateien

### `.github/workflows/build-check.yml`

Pro-Repo Build-Sanity-Check, der bei jedem Push/PR auf `main` läuft. Genau das was Vercel beim Deploy macht — nur früher sichtbar und unabhängig vom Vercel-Dashboard.

**Was es fängt:**
- `ERR_PNPM_OUTDATED_LOCKFILE` — package.json wurde geändert, Lockfile nicht mitcommittet
- Git-Ref unerreichbar (z.B. @cw/core auf nicht-existenten Tag gepinnt)
- Astro/TypeScript/Vite Build-Errors
- Image-Optimize-Fehler im `prebuild`-Hook

**Was es NICHT fängt:**
- Visual Regression (dafür existiert cw-visual-tests)
- Runtime-Fehler auf Vercel (dafür Deploy-Logs)
- Content-Fehler, tote Links (dafür cw-audit)

## Rollout

In allen 9 Customer-Repos identisch deployed via:

```bash
customer-websites/scripts/rollout-build-check.sh
```

## Update-Flow

Wenn diese Datei sich ändert (z.B. neue pnpm-Version, neuer Node-Major):

1. Diesen Template-File hier anpassen
2. `rollout-build-check.sh` erneut laufen lassen — überschreibt alle 9 Customer-Workflows
3. Kunden erhalten den Update beim nächsten Push automatisch

## Rationale: Warum Template statt Action

Eine reusable GitHub Action wäre DRYer, aber:

- Jeder Customer-Repo hat nur einen CI-Job → kaum Gewinn durch Abstraktion
- Actions mit Git-Dep auf privates Repo erfordern PAT-Setup pro Customer
- Inlined YAML ist debug-freundlicher: alles sichtbar im Run-Log, keine Action-Versionsmatrix

Wenn die Workflows irgendwann komplex werden (>50 Zeilen, mehrere Jobs), umbauen auf composite action.
