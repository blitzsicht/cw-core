#!/usr/bin/env bash
# audit-form-health-coverage.sh — Flottenweiter Form-Health-Coverage-Check
# (siluri/blitzsicht-ops#661, AC4)
#
# Listet für jedes `customer-*`-Repo unter der GitHub-Org (Default: siluri):
#   - customer.yml:type       (aus dem Repo-Root, per `gh api .../contents`)
#   - PRODUCTION_URL          (Repository-Variable, per `gh variable list`)
#   - SKIP_FORM_HEALTH        (Repository-Variable)
#   - FORM                    (liegt tatsächlich Formular-Code im Repo?)
#   - Coverage-Urteil: ok (Check läuft oder ist begründet abgeschaltet) vs.
#     LUECKE (type: active, aber weder PRODUCTION_URL noch SKIP_FORM_HEALTH=true)
#
# Die FORM-Spalte beantwortet die Frage, die AC1/AC5 offen lassen: ein
# SKIP_FORM_HEALTH=true ist nur dann begründet, wenn im Repo gar kein Formular
# liegt. Erhoben wird — passend zu dem, was verify-form-health.mjs tatsächlich
# prüft (`/kontakt/` + `<form action="/api/contact">` + POST auf /api/contact):
#   form     — kontakt.astro enthält <form> bzw. /api/contact → echtes Formular
#   page     — kontakt-Seite vorhanden, aber OHNE Formular-Markup (nur mailto:/tel:)
#   api      — Contact-Endpoint vorhanden: `api/contact.{ts,js,mjs}` im Repo-Root
#              (Vercel-Function — so liegt er hier tatsächlich) ODER unter
#              `src/pages/api/` (Astro-Endpoint)
#   cf:false — src/data/site-data.ts sagt `contactForm: false`
#              (der SSOT-Opt-out, den verify-form-health.mjs selbst respektiert)
#   none     — nichts davon gefunden
#   ?page/?sd — Abruf fehlgeschlagen: NICHT geprüft, ausdrücklich kein
#              Negativbefund (Netzwerk-Timeout darf nicht als "kein Formular"
#              durchgehen)
#
# Rein LESEND — setzt/ändert nichts. `gh variable list`, `gh api contents` und
# `gh api git/trees` sind read-only GitHub-API-Aufrufe, kein Checkout, kein
# Klonen nötig.
#
# Usage:
#   scripts/audit-form-health-coverage.sh [org]     # Default-Org: siluri
#
# Exit-Codes:
#   0 — keine Lücke gefunden (kein type:active-Repo ohne Coverage)
#   1 — mindestens eine Lücke gefunden
#   2 — Tooling-Fehler (gh fehlt / nicht eingeloggt)

set -euo pipefail

ORG="${1:-siluri}"

command -v gh >/dev/null 2>&1 || { echo "FATAL: gh nicht im PATH" >&2; exit 2; }
gh auth status >/dev/null 2>&1 || { echo "FATAL: gh nicht eingeloggt" >&2; exit 2; }

# Vollständige Pfadliste des Default-Branch in EINEM API-Call.
repo_tree() {
  local repo="$1"
  gh api "repos/$ORG/$repo/git/trees/HEAD?recursive=1" -q '.tree[].path' 2>/dev/null || true
}

# customer.yml:type lesen. "unknown" wenn Datei fehlt oder Feld nicht lesbar.
read_customer_type() {
  local repo="$1" content t
  content=$(gh api "repos/$ORG/$repo/contents/customer.yml" -q '.content' 2>/dev/null | base64 -d 2>/dev/null) || {
    echo "unknown"; return
  }
  [ -z "$content" ] && { echo "unknown"; return; }
  t=$(printf '%s\n' "$content" | grep -E '^type:' | head -1 | sed -E 's/^type:[[:space:]]*"?'"'"'?([A-Za-z_-]+).*/\1/')
  [ -n "$t" ] && echo "$t" || echo "unknown"
}

# Repository-Variable lesen. Leerer String wenn nicht gesetzt.
read_var() {
  local repo="$1" name="$2"
  gh variable list -R "$ORG/$repo" --json name,value \
    -q ".[] | select(.name==\"$name\") | .value" 2>/dev/null || true
}

# Datei-Inhalt in eine Zieldatei holen. Unterscheidet HART zwischen "geholt"
# (return 0) und "Abruf kaputt" (return 1) — ein Netzwerk-Timeout darf NIE als
# "Datei enthält X nicht" durchgehen.
#
# Bewusst über eine Datei statt über stdout+globalem Flag: Command-Substitution
# läuft in einer Subshell, eine dort gesetzte globale Variable käme beim Aufrufer
# nie an (und jeder Abruf sähe fälschlich fehlgeschlagen aus).
fetch_file() {
  local repo="$1" path="$2" dest="$3"
  gh api "repos/$ORG/$repo/contents/$path" -q '.content' 2>/dev/null \
    | base64 -d > "$dest" 2>/dev/null || return 1
  [ -s "$dest" ] || return 1
  return 0
}

# Liegt tatsächlich ein Formular im Repo? Marken:
#   form     — kontakt.astro enthält <form> bzw. /api/contact (echtes Formular)
#   page     — kontakt-Seite da, aber OHNE Formular-Markup (z.B. nur mailto:)
#   api      — Contact-Endpoint vorhanden (Repo-Root api/ = Vercel-Function,
#              oder src/pages/api/ = Astro-Endpoint)
#   cf:false — src/data/site-data.ts sagt contactForm: false (SSOT-Opt-out)
#   none     — nichts davon
#   ?xxx     — Abruf fehlgeschlagen, NICHT geprüft (kein Negativbefund!)
detect_form() {
  local repo="$1" tree="$2" marks=() page_path="" tmp
  tmp=$(mktemp)
  page_path=$(printf '%s\n' "$tree" | grep -E '^src/pages/kontakt(\.astro|/index\.astro)$' | head -1)

  if [ -n "$page_path" ]; then
    if fetch_file "$repo" "$page_path" "$tmp"; then
      if grep -qiE '<form|/api/contact' "$tmp"; then
        marks+=("form")
      else
        marks+=("page")
      fi
    else
      marks+=("?page")
    fi
  fi

  # Endpoint: Vercel-Function im Repo-Root ODER Astro-Endpoint unter src/pages.
  if printf '%s\n' "$tree" | grep -qE '^(api|src/pages/api)/contact\.(ts|js|mjs)$'; then
    marks+=("api")
  fi

  if printf '%s\n' "$tree" | grep -qE '^src/data/site-data\.ts$'; then
    if fetch_file "$repo" "src/data/site-data.ts" "$tmp"; then
      if grep -qE 'contactForm[[:space:]]*:[[:space:]]*false' "$tmp"; then
        marks+=("cf:false")
      fi
    else
      marks+=("?sd")
    fi
  fi

  rm -f "$tmp"

  if [ ${#marks[@]} -eq 0 ]; then
    echo "none"
  else
    local IFS='+'; echo "${marks[*]}"
  fi
}

REPOS=$(gh repo list "$ORG" --limit 200 --json name -q '.[].name' | grep -E '^customer-' | sort)

printf '%-30s %-9s %-6s %-26s %-14s %s\n' "REPO" "TYPE" "SKIP" "PRODUCTION_URL" "FORM" "URTEIL"
printf '%-30s %-9s %-6s %-26s %-14s %s\n' "------------------------------" "---------" "------" "--------------------------" "--------------" "------"

gap_count=0
total=0

for repo in $REPOS; do
  total=$((total + 1))
  tree=$(repo_tree "$repo")
  type=$(read_customer_type "$repo")
  url=$(read_var "$repo" "PRODUCTION_URL")
  skip=$(read_var "$repo" "SKIP_FORM_HEALTH")
  if [ -z "$tree" ]; then
    form="?tree"   # Pfadliste nicht abrufbar — NICHT geprüft, kein Negativbefund
  else
    form=$(detect_form "$repo" "$tree")
  fi

  verdict="ok"
  if [ "$type" = "active" ] && [ -z "$url" ] && [ "$skip" != "true" ]; then
    verdict="LUECKE"
    gap_count=$((gap_count + 1))
  fi

  printf '%-30s %-9s %-6s %-26s %-14s %s\n' \
    "$repo" "$type" "${skip:-.}" "${url:-.}" "$form" "$verdict"
done

echo ""
echo "Repos geprueft: $total | Luecken (type:active ohne Coverage): $gap_count"

if [ "$gap_count" -gt 0 ]; then
  echo "ERGEBNIS: $gap_count Repo(s) mit type: active haben weder PRODUCTION_URL noch SKIP_FORM_HEALTH=true."
  exit 1
fi

echo "ERGEBNIS: Kein type:active-Repo ohne laufenden Form-Health-Check."
exit 0
