# Issue #23
Status: PR_OPENED
Venture: blitzsicht
OPS-Repo: siluri/blitzsicht-ops
Code-Repo: cw-core
Code-Repo-Path: /Volumes/SiluriWork/NAS-Spiegel/MEDIEN/CODE/CLAUDE/cw-core
Remote-Repo: siluri/cw-core
Branch: feature/issue-23
PR: https://github.com/siluri/cw-core/pull/10
Last-Action: PR erstellt
Next-Step: warte auf Grader
Open-Questions: 
Tool-Calls-Used: 18/30

## Learnings
- `siteData` in cw-core ist als `as const` deklariert, was bedeutet dass das TypeScript-Typ keine optionalen Felder zulässt die nicht im jeweiligen Customer-siteData vorkommen. Der Cast `(siteData as { slug?: string }).slug` ist nötig damit bestehende Customer-Sites ohne slug-Feld (Altbestände) keinen TypeScript-Compile-Fehler werfen — sicherer Fallback auf "customer".
- Das Template `templates/site-data.template.ts` ist der richtige Ort um neue Felder zu dokumentieren — Customer-Sites pflegen ihre eigene `src/data/site-data.ts` unabhängig davon. Neue Felder im Template werden nicht automatisch in Bestandskunden-Sites eingepflegt; das muss separat gemacht werden.
- `blitzsicht.com?ref=footer` war die alte Variante ohne UTM — Plausible kann `ref` nicht auswerten, UTM-Parameter sind Pflicht für korrekte Source-Attribution in Plausible Analytics.
- Der Footer in cw-core hat keinen eigenen Build-Schritt (source-only library) — `pnpm build` muss in einer Customer-Site ausgeführt werden um die Astro-Komponenten zu testen. Empfohlene Stichprobe: customer-blitzsicht (hat slug "blitzsicht" in persons, aber noch kein top-level slug — muss nach PR separat eingepflegt werden).
