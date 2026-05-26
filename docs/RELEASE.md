# Release Process — cw-core

Single Source of Truth für das Tag- und Release-Schema von `@cw/core`.

## Tag-Schema (kanonisch)

`release/cw-core/vX.Y.Z` — Path-Style. **Kein `-alpha`-Suffix mehr** (alpha-Phase endete 2026-04 mit v0.8.4-alpha; ab v0.9.0 Release ohne Suffix).

Customer-Repos pinnen via:
```json
"@cw/core": "github:siluri/cw-core#release/cw-core/vX.Y.Z"
```

Beispiele für ältere/aktuelle Tags:
- `release/cw-core/v0.9.10` (2026-05-12)
- `release/cw-core/v0.21.2` (2026-05-26, letzter vor diesem Cleanup)
- `release/cw-core/v0.22.0` (2026-05-26, Hard-Rule + /cw-component-audit)

## Branch-Strategy

| Branch | Zweck |
|--------|-------|
| `main` | Development (selten direkt gepusht) |
| `release/cw-core` | Customer-facing — hier landen Tags |
| `feat/*`, `fix/*`, `chore/*` | Feature-Branches → PR gegen `release/cw-core` |
| `phase2-monorepo` | Experimenteller Refactor (nicht produktiv) |

Customer-Repos referenzieren ausschließlich Tags auf `release/cw-core`.

## Versions-Bump-Regel

| Bump | Bereich | Wann |
|---|---|---|
| **Patch** | 0.21.2 → 0.21.3 | Bug-Fix, Tweak, Style-Adjustment, Pure-Doku |
| **Minor** | 0.21.2 → 0.22.0 | Neue Komponente, neuer Prop, neuer Workflow (z.B. Slash-Command), neue Convention |
| **Major** | 0.x → 1.0 | Breaking API-Change, removed Props, renamed Exports |

## Tooling/Doku-Releases (kein Code-Change)

Auch ohne API-Änderung wird gebumpt — als Audit-Trail im CHANGELOG.

- **Workflow-Convention** (neuer Slash-Command, neue Hard-Rule, neuer Audit-Prozess) → **Minor**
- **Pure Doku-Update** (README-Refresh, RELEASE.md-Fix, Tippfehler) → **Patch**
- In beiden Fällen entfällt der **Customer-Repo-Bump** (`@cw/core`-Import sieht keinen Unterschied; Customer-Repos können auf alter Version bleiben)

Beispiel: `v0.22.0` (Hard-Rule + `/cw-component-audit`) — Workflow-Feature, kein API-Change. Customer-Repos bleiben bei `v0.21.2`, kriegen die Hard-Rule aber via Memory-Sync-System (`customer-websites/learnings/`).

## CHANGELOG

Liegt in `customer-websites/CHANGELOG-CW-CORE.md` (cross-repo, **nicht** in cw-core selbst).
Pflicht: Eintrag pro Release. Format siehe `cw-release` Skill.

cw-core hat zwar auch ein `CHANGELOG.md` — das ist aber **nicht** canonical (separate History, ggf. veraltet).

## Workflow

Verwende den `cw-release` Skill für jeden Release:
- `~/.claude-siluri/skills/cw-release/SKILL.md`

**Cross-Repo CHANGELOG-Timing:** Da `CHANGELOG-CW-CORE.md` in `customer-websites` lebt (separate Repo + PR-Flow), entsteht zwischen Tag-Push und CHANGELOG-PR-Merge ein kurzes Fenster (typisch < 5 Min), in dem der Tag remote existiert aber der CHANGELOG-Eintrag noch nicht. Akzeptiert als pragmatisches Trade-off. Wer den Skill als Single-Repo-Variant einsetzt (z.B. cw-cli mit lokalem CHANGELOG), folgt der strengen "Changelog zuerst"-Invariante.

Der Skill ist auch auf andere `cw-*` Repos übertragbar (Variables am Top: `CW_CORE_PATH`, `CHANGELOG_PATH`, `TAG_PREFIX`, `CUSTOMER_REPOS`).

## Historische Notizen

**2026-05-26: Tag-Cleanup `v1.0.x`** — 10 Tags (`v1.0.0`–`v1.0.9`, gesetzt zwischen 2026-04-12 und 2026-05-26) waren ein parallel-laufendes Schatten-Schema. Niemand referenzierte sie (Scan über alle 14 Customer-Repos: 0 Treffer auf `cw-core#v1.`). Am 2026-05-26 lokal + remote gelöscht.

SHA-Mapping für Rollback. **Primärer Anker ist diese committete Tabelle** (dauerhaft in git), nicht die ephemere `/tmp`-Datei. Achtung: `git reflog` hält Objekte zwar 90 Tage, aber `git gc.pruneExpire` (default 2 Wochen) kann orphaned commits nach Tag-Löschung früher entfernen — daher gilt: Rollback innerhalb 2 Wochen ohne Sorge, danach nur via diese Tabelle + verbleibende Branch-Referenzen.

| Tag | SHA |
|---|---|
| v1.0.0 | 141d437b98a0bcc48ca8d3048207a6ed648dcd9e |
| v1.0.1 | 5910d76cde83e5b2dffa9df6b312a98937225752 |
| v1.0.2 | d3a7a7b78e6166d1f4256a0f6891d1466585b2b8 |
| v1.0.3 | 0b1bfea0be83e8b57246c4e8822b24614507a3bb |
| v1.0.4 | 1674425b545b31d7d836d8868fe3012b4ac08a7e |
| v1.0.5 | afbe083cc5e2a6493a95966a3f26e55bd6c221a4 |
| v1.0.6 | 9d5ca6b04d6eb7830e2ab50bf9b9fc97ddf8c86f |
| v1.0.7 | b9b127c6a30e22b981c78442f78236bd75c1e356 |
| v1.0.8 | baeb952e60c69498b42fa48233afb069989fb84a |
| v1.0.9 | d69309d2fba55232b8eb89c0a029e2a2468c788b |

Rollback bei Bedarf:
```bash
git tag v1.0.X <sha>
git push origin v1.0.X
```

**Bestehende Altlasten (nicht funktional kritisch):**
- `CHANGELOG.md` (in cw-core, Zeile ~946) erwähnt `v1.0.8` als Erklärungstext — wird beim nächsten CHANGELOG-Touch nebenher bereinigt.
- Legacy `v0.X.Y`-ohne-Prefix Tags (z.B. `v0.7.x-alpha`, `v0.9.x`, `v0.10.1`) bleiben als historisch — sie waren teilweise commit-konsistent mit `release/cw-core/`-Variants und werden nicht angefasst.

**2026-04: alpha-Phase beendet** — bis `v0.8.4-alpha` wurden Releases mit `-alpha`-Suffix getaggt. Ab `v0.9.0` ohne Suffix, in Produktion bei mehreren Customer-Sites.
