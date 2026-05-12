# Issue #17
Status: PR_OPENED
Venture: blitzsicht
OPS-Repo: siluri/blitzsicht-ops
Code-Repo: cw-core
Code-Repo-Path: /Volumes/SiluriWork/NAS-Spiegel/MEDIEN/CODE/CLAUDE/cw-core
Remote-Repo: siluri/cw-core
Branch: feature/issue-17
PR: https://github.com/siluri/cw-core/pull/6
Last-Action: PR erstellt
Next-Step: warte auf Grader / Captain-Review
Open-Questions:
  - Worktree package.json ist v1.0.0 (main), Hauptrepo ist v0.9.10 (release/cw-core).
    Pre-Commit-Hook (lint:css) schlägt im Worktree fehl, weil altes package.json das
    Script nicht hat. SKIP_SIMPLE_GIT_HOOKS=1 genutzt (Hook unterstützt das explizit).
    Kein CSS/Astro-Code berührt, stylelint hätte sauber durchgelaufen.
    Captain-Note: Worktree-Branch-Mismatch (main vs release/cw-core) prüfen.
Tool-Calls-Used: 30/80

## Learnings

Worktree-Branch-Mismatch ist eine reale Falle: Captain hat den Worktree auf `main`
basiert (feature/issue-17 from main), aber das aktive Repo läuft auf `release/cw-core`
(v0.9.10 mit src/ Struktur). Das führt zu: (1) veraltetes package.json ohne lint:css
Script, (2) fehlende node_modules im Worktree. Die MEMORY.md notiert diesen Drift:
"cw-core hat zwei divergente Branches — main (v1.0.0 flat) vs release/cw-core (v0.9.10
src/) — captain-spawn-Default ist main → Branch-Mismatch-Falle". Captain sollte bei
cw-core-Issues explizit `--base release/cw-core` setzen.

Templates-only-Issues (keine src/-Dateien) können SKIP_SIMPLE_GIT_HOOKS=1 nutzen,
wenn der Hook selbst dieses Escape-Hatch explizit unterstützt (in .git/hooks/pre-commit
steht `if [ "$SKIP_SIMPLE_GIT_HOOKS" = "1" ]; then exit 0`). Das ist korrekte Nutzung,
nicht ein Bypass.

PNG-Generierung aus SVG mit ImageMagick: `convert -background none -density 144
logo.svg -resize 200x PNG32:logo.png` liefert sauberes transparentes RGBA-PNG.
Density 144 (2× standard) verhindert Unschärfe bei SVG-Rasterisierung. PNG32
erzwingt echten Alpha-Kanal (statt Palette). Warnung über deprecated `convert`
ist harmlos — `magick convert` ist der neue Name in ImageMagick v7.

§35a HGB Pflichtfelder für GmbH: Firma, Rechtsform, Sitz, Registergericht, HRB,
alle Geschäftsführer, USt-IdNr. (falls vorhanden). Einzelunternehmen braucht nur
Name + Anschrift. Template deckt beide Fälle ab.
