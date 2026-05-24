#!/usr/bin/env bash
# =============================================================================
# Email-Signatur Master-Regenerator (v6 — fully data-driven)
# =============================================================================
# Auto-Discovery aller customer-* Verzeichnisse + Loop über persons[] aus
# customer-X/src/data/site-data.ts. Keine hardcoded Customer- oder Person-Daten.
#
# ENV (alle optional):
#   CUSTOMER_ROOT    Root-Verzeichnis mit customer-* Dirs
#                    (Default: $(dirname $(realpath cw-core/..)))
#   MAIL_OUT         Output-Verzeichnis für .eml + Preview
#                    (Default: /tmp/cw-sigs)
#   ONLY_CUSTOMER    Nur diesen einen customer-* Dir verarbeiten
#                    (z.B. ONLY_CUSTOMER=customer-soleno)
#   ONLY_SLUG        Nur diese eine Person (Filter über alle Customer)
#                    (z.B. ONLY_SLUG=markus-steller)
#   FROM_EMAIL       Absender der Begleit-Mail (Default: servus@blitzsicht.com)
#   FROM_NAME        Absender-Name (Default: Johannes-Maximilian Gottl)
#   REGISTRY_PATH    customer-registry.json für TIER-Gating
#                    (Default: $CUSTOMER_ROOT/customer-websites/customer-registry.json)
#
# TIER-Gating (v6.6, Phase 10.5):
#   tier=starter ohne 'cal-booking-starter' Add-On → BOOKING_URL/GOOGLE_REVIEW_URL geblankt
#   tier=starter mit 'cal-booking-starter'        → BOOKING_URL aktiv, REVIEW geblankt
#   tier=business / enterprise                    → alle v4-Extras aktiv (wenn site-data.ts gesetzt)
#   tier=unknown (Registry fehlt o.ä.)            → fail-open, alle Vars bleiben, Warning
#
# Nutzung:
#   bash cw-core/templates/email-signature/regenerate-all.sh
#   ONLY_CUSTOMER=customer-soleno bash .../regenerate-all.sh
#   ONLY_SLUG=markus-steller bash .../regenerate-all.sh
# =============================================================================
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GEN="$SCRIPT_DIR/generate.sh"
MAIL="$SCRIPT_DIR/generate-mail.sh"
READ="$SCRIPT_DIR/read-customer-data.py"

# Auto-detect CUSTOMER_ROOT (parent of cw-core)
if [ -z "${CUSTOMER_ROOT:-}" ]; then
  CUSTOMER_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
fi
MAIL_OUT="${MAIL_OUT:-/tmp/cw-sigs}"
ONLY_CUSTOMER="${ONLY_CUSTOMER:-}"
ONLY_SLUG="${ONLY_SLUG:-}"
REGISTRY_PATH="${REGISTRY_PATH:-$CUSTOMER_ROOT/customer-websites/customer-registry.json}"

# TIER-Gating: liest tier + addons aus customer-registry.json
# Args: $1 = customer-dirname (z.B. customer-blitzsicht) — wird zu Registry-Slug (blitzsicht) gestrippt
# Output: "tier|signature_version|addons_csv"
read_tier_info() {
  local CUST_NAME="$1"
  local REG_SLUG="${CUST_NAME#customer-}"
  if [ ! -f "$REGISTRY_PATH" ]; then
    echo "unknown|unknown|"
    return
  fi
  local RESULT
  RESULT=$(jq -r --arg s "$REG_SLUG" '
    .customers[] | select(.slug == $s) |
    "\(.tier // "unknown")|\(.signature_version // "v1")|\((.addons // []) | join(","))"
  ' "$REGISTRY_PATH" 2>/dev/null | head -1)
  [ -z "$RESULT" ] && RESULT="unknown|unknown|"
  echo "$RESULT"
}

mkdir -p "$MAIL_OUT"

# Shared Stylesheets (v6.5)
INSTALL_CSS_SRC="$SCRIPT_DIR/install.css"
PREVIEW_CSS_SRC="$SCRIPT_DIR/preview.css"

# preview.css → 1x nach $MAIL_OUT kopieren (alle preview.html liegen dort)
cp "$PREVIEW_CSS_SRC" "$MAIL_OUT/preview.css"

echo "═══════════════════════════════════════════════════════════════"
echo "Email-Signatur Master-Regenerator (v6.5)"
echo "  CUSTOMER_ROOT: $CUSTOMER_ROOT"
echo "  MAIL_OUT:      $MAIL_OUT"
[ -n "$ONLY_CUSTOMER" ] && echo "  ONLY_CUSTOMER: $ONLY_CUSTOMER"
[ -n "$ONLY_SLUG" ]     && echo "  ONLY_SLUG:     $ONLY_SLUG"
echo "═══════════════════════════════════════════════════════════════"

run_person_for_customer() {
  local CUSTOMER_DIR="$1"
  local PERSON_JSON="$2"

  # Person-Felder via jq lesen
  local SLUG NAME POSITION P_EMAIL P_PHONE LAYOUT SALUTATION ANIMATION_EFFECT
  SLUG=$(printf '%s' "$PERSON_JSON" | jq -r '.slug // empty')
  NAME=$(printf '%s' "$PERSON_JSON" | jq -r '.name // empty')
  POSITION=$(printf '%s' "$PERSON_JSON" | jq -r '.position // empty')
  P_EMAIL=$(printf '%s' "$PERSON_JSON" | jq -r '.email // empty')
  P_PHONE=$(printf '%s' "$PERSON_JSON" | jq -r '.phone // empty')
  LAYOUT=$(printf '%s' "$PERSON_JSON" | jq -r '.layout // "auto"')
  SALUTATION=$(printf '%s' "$PERSON_JSON" | jq -r ".salutation // \"Hallo $(printf '%s' "$NAME" | cut -d' ' -f1)\"")
  ANIMATION_EFFECT=$(printf '%s' "$PERSON_JSON" | jq -r '.animationEffect // empty')

  [ -z "$SLUG" ] && { echo "  ⚠ Person ohne slug — skip"; return; }
  [ -z "$NAME" ] && { echo "  ⚠ Person $SLUG ohne name — skip"; return; }
  [ -z "$P_EMAIL" ] && { echo "  ⚠ Person $SLUG ohne email — skip"; return; }

  # ONLY_SLUG-Filter
  if [ -n "$ONLY_SLUG" ] && [ "$SLUG" != "$ONLY_SLUG" ]; then
    return
  fi

  # 'auto' → leer (= Aspect-Ratio-Detection in generate.sh)
  [ "$LAYOUT" = "auto" ] && LAYOUT=""

  echo ""
  local HEADER="▓▓▓ $SLUG @ $(basename "$CUSTOMER_DIR") (LAYOUT=${LAYOUT:-auto}"
  [ -n "$ANIMATION_EFFECT" ] && HEADER="$HEADER, ANIM=$ANIMATION_EFFECT"
  echo "$HEADER) ▓▓▓"

  # Customer-Daten via SSOT-Reader
  eval "$(python3 "$READ" "$CUSTOMER_DIR")"

  # Person-Werte überschreiben (legal.email/phone aus site-data.ts wird ignoriert)
  EMAIL="$P_EMAIL"
  PHONE="$P_PHONE"

  # Logo-Discovery — prefer customer-spezifischen Filename (z.B. logo-soleno.svg)
  # über generischen logo.svg, weil mehrere Logos im public/ liegen können.
  local CUST_SLUG=$(basename "$CUSTOMER_DIR" | sed 's/^customer-//')
  local LOGO_SVG=""
  for cand in "logo-${CUST_SLUG}.svg" logo.svg "logo-${CUST_SLUG}.png" logo.png logo_blitzsicht.svg; do
    [ -f "$CUSTOMER_DIR/public/$cand" ] && LOGO_SVG="$CUSTOMER_DIR/public/$cand" && break
  done
  local LOGO_DARK_SVG=""
  for cand in "logo-${CUST_SLUG}-dark.svg" logo-dark.svg "logo-${CUST_SLUG}-inverted.svg" logo-inverted.svg logo-dark.png; do
    [ -f "$CUSTOMER_DIR/public/$cand" ] && LOGO_DARK_SVG="$CUSTOMER_DIR/public/$cand" && break
  done

  # Logo-Hosting-URL: bevorzugt Apex (CUSTOMER_URL), Vercel-Fallback wenn Apex nicht auf Vercel zeigt
  local LOGO_URL_HOST="$CUSTOMER_URL"
  case "$(basename "$CUSTOMER_DIR")" in
    customer-donau-profi) LOGO_URL_HOST="https://customer-donau-profi.vercel.app" ;;
    customer-weinkontor-sinzing) LOGO_URL_HOST="https://customer-weinkontor-sinzing.vercel.app" ;;
  esac
  local LOGO_URL="$LOGO_URL_HOST/email/logo.png"
  local VCARD_PUBLIC_URL="$LOGO_URL_HOST/email/$SLUG.vcf"

  local WEBSITE_URL_DISPLAY="${CUSTOMER_URL#https://}"
  WEBSITE_URL_DISPLAY="${WEBSITE_URL_DISPLAY#http://}"
  WEBSITE_URL_DISPLAY="${WEBSITE_URL_DISPLAY%/}"

  # ── TIER-Gating (v6.6, Plan-Phase 10.5) ───────────────────────────────────
  local TIER_INFO TIER SIG_VERSION ADDONS_CSV
  TIER_INFO=$(read_tier_info "$(basename "$CUSTOMER_DIR")")
  TIER=$(echo "$TIER_INFO" | cut -d'|' -f1)
  SIG_VERSION=$(echo "$TIER_INFO" | cut -d'|' -f2)
  ADDONS_CSV=$(echo "$TIER_INFO" | cut -d'|' -f3)

  case "$TIER" in
    starter)
      if echo "$ADDONS_CSV" | grep -q "cal-booking-starter"; then
        [ -n "$BOOKING_URL" ] && echo "  ⓘ Starter+cal-booking-Add-On — BOOKING_URL aktiv"
        GOOGLE_REVIEW_URL=""
      else
        if [ -n "$BOOKING_URL" ] || [ -n "$GOOGLE_REVIEW_URL" ]; then
          echo "  ⓘ Starter-Tier ohne cal-booking-Add-On — v4-Extras (Booking/Review) deaktiviert"
        fi
        BOOKING_URL=""
        GOOGLE_REVIEW_URL=""
      fi
      ;;
    business|enterprise)
      [ -z "$BOOKING_URL" ] && [ -z "$GOOGLE_REVIEW_URL" ] && \
        echo "  ⓘ $TIER-Tier ohne v4-Daten — booking.url/gmb.review_url in site-data.ts setzen für Premium-Signatur"
      ;;
    unknown)
      echo "  ⚠ Customer $(basename "$CUSTOMER_DIR") nicht in customer-registry.json — v4-Extras fail-open"
      ;;
  esac

  local SIG_OUT="$CUSTOMER_DIR/email-signatures/$SLUG"

  env \
    EXPLICIT_SLUG="$SLUG" NAME="$NAME" POSITION="$POSITION" \
    EMAIL="$EMAIL" PHONE="$PHONE" \
    WEBSITE_URL="$WEBSITE_URL_DISPLAY" \
    COLOR_PRIMARY="$COLOR_PRIMARY" COLOR_ACCENT="$COLOR_ACCENT" \
    COMPANY_NAME="$COMPANY_NAME" LEGAL_FORM="$LEGAL_FORM" GF_NAME="$GF_NAME" \
    STREET="$STREET" ZIP_CITY="$ZIP_CITY" \
    HRB="$HRB" REGISTERGERICHT="$REGISTERGERICHT" UST_ID="$UST_ID" \
    LOGO_SVG="$LOGO_SVG" LOGO_DARK_SVG="$LOGO_DARK_SVG" \
    LOGO_URL="$LOGO_URL" LOGO_ALT="$COMPANY_NAME" \
    LAYOUT="$LAYOUT" \
    GOOGLE_REVIEW_URL="$GOOGLE_REVIEW_URL" \
    BOOKING_URL="$BOOKING_URL" BOOKING_LABEL="$BOOKING_LABEL" \
    VCARD_PUBLIC_URL="$VCARD_PUBLIC_URL" \
    ANIMATION_EFFECT="$ANIMATION_EFFECT" \
    OUT_DIR="$SIG_OUT" \
    "$GEN" 2>&1 | grep -E "(✓|⚠|ⓘ|Layout|APNG|Fertig)" | head -12

  rm -f "$SIG_OUT/$SLUG.vcf"

  SIG_DIR="$SIG_OUT" \
  TO_EMAIL="$EMAIL" TO_NAME="$NAME" \
  FIRST_NAME="${NAME%% *}" \
  SALUTATION="$SALUTATION" \
  OUT_DIR="$MAIL_OUT" \
  "$MAIL" 2>&1 | grep "✓" | head -5

  # Smoke-Test (v6.5): Shared-Stylesheet-Verifikation
  # 1. install.css muss in customer/public/email/ existieren (Single-Source deployed)
  # 2. install.css muss prefers-color-scheme: dark enthalten (Dark-Mode sicher)
  # 3. Install-Page muss via <link href="/email/install.css?v= geladen werden
  local CUSTOMER_PUBLIC_EMAIL="$CUSTOMER_DIR/public/email"
  local INSTALL_CSS_DEPLOYED="$CUSTOMER_PUBLIC_EMAIL/install.css"
  local INSTALL_PAGE="$CUSTOMER_PUBLIC_EMAIL/$SLUG-install.html"

  if [ ! -f "$INSTALL_CSS_DEPLOYED" ]; then
    echo "  ⚠ WARN: install.css fehlt in $CUSTOMER_PUBLIC_EMAIL — Deploy-Copy nicht erfolgt!"
  elif ! grep -q "prefers-color-scheme: dark" "$INSTALL_CSS_DEPLOYED"; then
    echo "  ⚠ WARN: $INSTALL_CSS_DEPLOYED enthält keinen Dark-Mode-Block — dark-Logo wird unsichtbar!"
  fi

  if [ -f "$INSTALL_PAGE" ] && ! grep -q 'href="/email/install.css?v=' "$INSTALL_PAGE"; then
    echo "  ⚠ WARN: $SLUG-install.html lädt install.css nicht via <link> — Stylesheet nicht verknüpft!"
  fi
}

# Auto-Discovery
PROCESSED=0
for CUSTOMER_DIR in "$CUSTOMER_ROOT"/customer-*/; do
  CUSTOMER_DIR="${CUSTOMER_DIR%/}"
  CUSTOMER_NAME=$(basename "$CUSTOMER_DIR")

  # Skip planning-only repos
  case "$CUSTOMER_NAME" in
    customer-websites|customer-schiller) continue ;;  # schiller ist alter Name; aktuell schiller-gartenbau
  esac

  # ONLY_CUSTOMER-Filter
  if [ -n "$ONLY_CUSTOMER" ] && [ "$CUSTOMER_NAME" != "$ONLY_CUSTOMER" ]; then
    continue
  fi

  # site-data.ts vorhanden?
  [ -f "$CUSTOMER_DIR/src/data/site-data.ts" ] || continue

  # persons[] auslesen
  PERSONS_JSON=$(python3 "$READ" "$CUSTOMER_DIR" --list-persons 2>/dev/null || echo '[]')
  PERSON_COUNT=$(printf '%s' "$PERSONS_JSON" | jq 'length')

  if [ "$PERSON_COUNT" -eq 0 ]; then
    continue  # Stilles Skip — Customer ohne persons[]
  fi

  # Shared Stylesheet (v6.5): install.css 1x pro Customer nach public/email/ kopieren
  mkdir -p "$CUSTOMER_DIR/public/email"
  cp "$INSTALL_CSS_SRC" "$CUSTOMER_DIR/public/email/install.css"
  echo "  ✓ $(basename "$CUSTOMER_DIR")/public/email/install.css (Shared Stylesheet)"

  # Loop über jede Person
  printf '%s' "$PERSONS_JSON" | jq -c '.[]' | while IFS= read -r person; do
    run_person_for_customer "$CUSTOMER_DIR" "$person"
  done
  PROCESSED=$((PROCESSED + PERSON_COUNT))
done

echo ""
echo "═══════════════════════════════════════════════════════════════"
EML_COUNT=$(ls "$MAIL_OUT"/*.eml 2>/dev/null | wc -l | tr -d ' ')
echo "DONE — $EML_COUNT .eml Files in $MAIL_OUT/"
echo "═══════════════════════════════════════════════════════════════"
