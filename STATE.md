# Issue #22
Status: PR_OPENED
Venture: blitzsicht
OPS-Repo: siluri/blitzsicht-ops
Code-Repo: cw-core
Code-Repo-Path: /Volumes/SiluriWork/NAS-Spiegel/MEDIEN/CODE/CLAUDE/cw-core
Remote-Repo: siluri/cw-core
Branch: feature/issue-22
PR: https://github.com/siluri/cw-core/pull/8
Last-Action: PR erstellt gegen release/cw-core
Next-Step: warte auf Grader
Open-Questions: 
Tool-Calls-Used: 22/30

## Learnings

- **generate.sh Python-Heredoc-Pattern:** Das Python-Heredoc in generate.sh ist ein `<<'PYEOF'` (nicht `<<PYEOF`), was bedeutet keine Shell-Variable-Expansion drin. Um den Pfad zu install.css reinzubringen, muss er als CLI-Argument übergeben werden (`sys.argv`), nicht als ENV-Variable. Die Argument-Liste erweitert man am `python3 -` Aufruf in Bash.

- **macOS vs Linux md5:** macOS hat `md5 -q file`, Linux hat `md5sum file`. Das Skript in generate-mail.sh (bash-heredoc) braucht einen Fallback: `md5sum ... || md5 -q ...`. In generate.sh (Python) ist `hashlib.md5()` cross-platform und hat keinen Compat-Issue.

- **Smoke-Test-Scope:** Der Smoke-Test prüft jetzt die deployed Datei (`customer/public/email/install.css`) statt die generierte Install-Page selbst. Das ist robuster: wenn der Copy-Step fehlt, fängt der Test es schon vor der Link-Prüfung ab.

- **pre-existing astro check errors:** 5 TypeScript-Fehler in `src/layouts/BaseLayout.astro` existierten bereits auf `release/cw-core` vor diesem Issue. Nicht durch diesen PR eingeführt (verifiziert via git stash + pnpm check).

- **CSS-Files in templates/ statt src/:** Die neuen .css-Dateien liegen in `templates/email-signature/` — das ist korrekt, weil sie Shell-Pipeline-Assets sind, keine Astro-Source-Files. stylelint prüft nur `src/**/*.{astro,css}`, daher keine False-Positive-Lint-Fehler auf den neuen Dateien.
