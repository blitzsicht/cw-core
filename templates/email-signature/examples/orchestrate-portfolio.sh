#!/usr/bin/env bash
# v5 Re-Generator — alle Customer-Daten aus site-data.ts + tokens.css
# Person-spezifisch: SLUG/NAME/POSITION/EMAIL/PHONE/LAYOUT/SALUTATION
set -uo pipefail

CW="/Volumes/SiluriWork/NAS-Spiegel/MEDIEN/CODE/CLAUDE"
GEN="$CW/cw-core/templates/email-signature/generate.sh"
MAIL="$CW/cw-core/templates/email-signature/generate-mail.sh"
READ="/tmp/read-customer-data.py"
MAIL_OUT="/tmp/all-customer-emails-v5"
mkdir -p "$MAIL_OUT"

run_person() {
  local CUSTOMER="$1" SLUG="$2" NAME="$3" POSITION="$4"
  local PERSON_EMAIL="$5" PERSON_PHONE="$6" LAYOUT="${7:-a}"
  local SALUTATION="${8:-Hallo $NAME}"

  local CUSTOMER_DIR="$CW/$CUSTOMER"
  echo ""
  echo "▓▓▓ $SLUG @ $CUSTOMER (LAYOUT=$LAYOUT) ▓▓▓"

  # Customer-Daten aus site-data.ts + tokens.css ziehen
  eval "$(python3 "$READ" "$CUSTOMER_DIR")"

  # Person-Werte überschreiben
  EMAIL="$PERSON_EMAIL"
  PHONE="$PERSON_PHONE"

  # Logo-Erkennung
  local LOGO_SVG=""
  for ext in svg png; do
    [ -f "$CUSTOMER_DIR/public/logo.$ext" ] && LOGO_SVG="$CUSTOMER_DIR/public/logo.$ext" && break
  done
  local LOGO_DARK_SVG=""
  for cand in logo-dark.svg logo-dark.png logo-inverted.svg; do
    [ -f "$CUSTOMER_DIR/public/$cand" ] && LOGO_DARK_SVG="$CUSTOMER_DIR/public/$cand" && break
  done

  # Website-URL für Logo-Hosting (apex preferred, vercel fallback for non-Apex-Vercel)
  local LOGO_URL_HOST="$CUSTOMER_URL"
  case "$CUSTOMER" in
    customer-donau-profi) LOGO_URL_HOST="https://customer-donau-profi.vercel.app" ;;
    customer-weinkontor-sinzing) LOGO_URL_HOST="https://customer-weinkontor-sinzing.vercel.app" ;;
  esac
  local LOGO_URL="$LOGO_URL_HOST/email/logo.png"
  local WEBSITE_URL_DISPLAY="${CUSTOMER_URL#https://}"
  WEBSITE_URL_DISPLAY="${WEBSITE_URL_DISPLAY#http://}"
  WEBSITE_URL_DISPLAY="${WEBSITE_URL_DISPLAY%/}"

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
    OUT_DIR="$SIG_OUT" \
    "$GEN" 2>&1 | grep -E "(✓|⚠|ⓘ|Layout|Fertig)" | head -12

  # vCard regenerate immer (alte löschen)
  rm -f "$SIG_OUT/$SLUG.vcf"

  SIG_DIR="$SIG_OUT" \
  TO_EMAIL="$EMAIL" TO_NAME="$NAME" \
  FIRST_NAME="${NAME%% *}" \
  SALUTATION="$SALUTATION" \
  OUT_DIR="$MAIL_OUT" \
  "$MAIL" 2>&1 | grep "✓" | head -5
}

# 10 Personen — Person-Daten (SLUG/NAME/POSITION/EMAIL/PHONE/LAYOUT/SALUTATION)
run_person customer-digital-direkt melanie-steller \
  "Melanie Steller" "Vertrieb & Kundenbetreuung" \
  "melanie.steller@digital-direkt.com" "+49 9401 53959-44" "a" "Hallo Melanie"

run_person customer-digital-direkt markus-steller \
  "Markus Steller" "Geschäftsführer" \
  "markus.steller@digital-direkt.com" "+49 9401 53959-20" "a" "Hallo Markus"

run_person customer-blitzsicht johannes-maximilian-gottl \
  "Johannes-Maximilian Gottl" "Inhaber" \
  "servus@blitzsicht.com" "+49 173 7215679" "a" "Servus Johannes"

run_person customer-donau-profi angelika-silberhorn \
  "Angelika Silberhorn" "Geschäftsführerin" \
  "info@donau-profi.de" "+49 941 63082470" "a" "Hallo Frau Silberhorn"

run_person customer-gottl-richter-gomeier reiner-gottl \
  "Reiner Gottl" "Sachverständiger" \
  "servus@gottl-richter-gomeier.de" "+49 157 78937752" "b" "Servus Papa"

run_person customer-hausammincio markus-eule \
  "Markus Eule" "Inhaber" \
  "info@wallerwelt.com" "+39 345 997 3997" "b" "Hallo Markus"

run_person customer-schiller-gartenbau daniel-schiller \
  "Daniel Schiller" "Geschäftsführer" \
  "info@schiller-service-gmbh.de" "+49 9406 4189540" "b" "Hallo Herr Schiller"

run_person customer-soleno nico-poeppl \
  "Nico Pöppl" "Geschäftsführer" \
  "info@soleno-energie.de" "+49 9402 9380193" "b" "Hallo Nico"

run_person customer-steller-sanierungen frank-steller \
  "Frank Steller" "Geschäftsführer" \
  "servus@steller-sanierungen.com" "+49 170 4655429" "a" "Servus Frank"

run_person customer-weinkontor-sinzing stefan-wagner \
  "Stefan Wagner" "Geschäftsführer" \
  "info@weinkontor-sinzing.de" "+49 941 3075755" "b" "Hallo Herr Wagner"

echo ""
echo "════════════════════════════════════════════════════════════════"
echo "DONE — $MAIL_OUT/  — $(ls $MAIL_OUT/*.eml 2>/dev/null | wc -l) .eml-Files"
