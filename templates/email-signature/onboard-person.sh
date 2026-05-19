#!/usr/bin/env bash
# =============================================================================
# cw-core Email-Signatur End-to-End Onboarding-Pipeline
# =============================================================================
# Generiert für eine neue Person (z.B. neuer Mitarbeiter bei einem Customer)
# in einem Rutsch:
#   1. HTML-Signatur (via generate.sh)
#   2. Plain-Text-Fallback
#   3. README mit Einbau-Anleitung
#   4. .eml versandfertige Mail (via generate-mail.sh)
#   5. HTML-Preview für Browser-Anschau
#
# Verwendung:
#   CUSTOMER_REPO=/path/to/customer-X \
#   NAME="Vorname Nachname" SLUG=vorname-nachname \
#   POSITION="Geschäftsführer" \
#   EMAIL=person@firma.de PHONE="+49 …" \
#   WEBSITE_URL=firma.de \
#   COLOR_PRIMARY=#312783 COLOR_ACCENT=#3d7a12 \
#   COMPANY_NAME="Firma GmbH" LEGAL_FORM=GmbH GF_NAME="Vorname Nachname" \
#   STREET="Straße 1" ZIP_CITY="93000 Stadt" \
#   HRB="HRB 12345" REGISTERGERICHT="Amtsgericht X" UST_ID=DE123456 \
#   LOGO_SVG=/path/to/logo.svg \
#   LOGO_URL=https://firma.de/email/logo.png \
#   TO_EMAIL=person@firma.de FIRST_NAME=Vorname \
#   SALUTATION="Hallo Vorname" \
#   ./onboard-person.sh
#
# Optional:
#   SKIP_UTM=true                  # UTM-Params nicht einbauen
#   SKIP_MAIL=true                 # .eml nicht generieren (nur HTML+TXT)
#   COMMIT=true                    # automatisch git add + commit + push
#   MAIL_OUT_DIR=/tmp/customer-mails
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ── Pflicht-Inputs ────────────────────────────────────────────────────────────
CUSTOMER_REPO="${CUSTOMER_REPO:?'CUSTOMER_REPO fehlt — Pfad zum customer-* Repo'}"
SLUG="${SLUG:?'SLUG fehlt — z.B. vorname-nachname'}"
NAME="${NAME:?'NAME fehlt'}"
TO_EMAIL="${TO_EMAIL:?'TO_EMAIL fehlt'}"

# ── Setup ─────────────────────────────────────────────────────────────────────
SIG_DIR="$CUSTOMER_REPO/email-signatures/$SLUG"
MAIL_OUT_DIR="${MAIL_OUT_DIR:-/tmp/customer-mails}"

echo "═══════════════════════════════════════════════════════════════"
echo " Email-Sig Onboarding: $NAME → $TO_EMAIL"
echo " Repo:   $CUSTOMER_REPO"
echo " Slug:   $SLUG"
echo "═══════════════════════════════════════════════════════════════"

# ── Step 1: Signatur via generate.sh ─────────────────────────────────────────
echo ""
echo "[1/4] Generiere HTML+TXT-Signatur via generate.sh"
OUT_DIR="$SIG_DIR" "$SCRIPT_DIR/generate.sh"

# ── Step 2: UTM-Params (default an) ──────────────────────────────────────────
if [ "${SKIP_UTM:-false}" != "true" ]; then
  echo ""
  echo "[2/4] UTM-Params an Web-Link injecten"
  HTML="$SIG_DIR/$SLUG.html"
  TXT="$SIG_DIR/$SLUG.txt"
  DOMAIN="${WEBSITE_URL}"
  UTM="utm_source=email-signature&utm_medium=email&utm_campaign=$SLUG"
  sed -i.bak -E "s|href=\"https://${DOMAIN}\"|href=\"https://${DOMAIN}?${UTM}\"|g; s|href=\"https://${DOMAIN}/\"|href=\"https://${DOMAIN}/?${UTM}\"|g" "$HTML"
  sed -i.bak -E "s|https://${DOMAIN}$|https://${DOMAIN}?${UTM}|g; s|https://${DOMAIN}/?$|https://${DOMAIN}/?${UTM}|g" "$TXT"
  rm "${HTML}.bak" "${TXT}.bak"
  if grep -q "utm_source=email-signature" "$HTML"; then
    echo "  ✓ UTM eingebaut"
  else
    echo "  ⚠ UTM-Pattern nicht gematcht — Web-Link manuell prüfen"
  fi
else
  echo ""
  echo "[2/4] SKIP_UTM=true — UTM-Params übersprungen"
fi

# ── Step 3: .eml + Preview via generate-mail.sh ──────────────────────────────
if [ "${SKIP_MAIL:-false}" != "true" ]; then
  echo ""
  echo "[3/4] Generiere .eml + Browser-Preview"
  SIG_DIR="$SIG_DIR" \
  TO_EMAIL="$TO_EMAIL" \
  TO_NAME="$NAME" \
  FIRST_NAME="${FIRST_NAME:-${NAME%% *}}" \
  SALUTATION="${SALUTATION:-Hallo ${FIRST_NAME:-${NAME%% *}}}" \
  FROM_EMAIL="${FROM_EMAIL:-servus@blitzsicht.com}" \
  FROM_NAME="${FROM_NAME:-Johannes-Maximilian Gottl}" \
  FROM_PHONE="${FROM_PHONE:-+49 173 7215679}" \
  FROM_DOMAIN="${FROM_DOMAIN:-blitzsicht.com}" \
  OUT_DIR="$MAIL_OUT_DIR" \
  "$SCRIPT_DIR/generate-mail.sh"
else
  echo ""
  echo "[3/4] SKIP_MAIL=true — Mail-Generation übersprungen"
fi

# ── Step 4: Optional git commit + push ───────────────────────────────────────
if [ "${COMMIT:-false}" = "true" ]; then
  echo ""
  echo "[4/4] Git commit + push"
  cd "$CUSTOMER_REPO"
  git add public/email/ email-signatures/ 2>&1 | tail -1
  git commit -m "feat(email-sig): Signatur + Logo PNG für $SLUG" 2>&1 | tail -2
  BRANCH=$(git branch --show-current)
  git push origin "$BRANCH" 2>&1 | tail -1
else
  echo ""
  echo "[4/4] COMMIT=false — git skip (Set COMMIT=true für Auto-Commit)"
fi

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo " Fertig. Nächste Schritte:"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "  Mail-Preview im Browser:"
echo "    open $MAIL_OUT_DIR/$SLUG-preview.html"
echo ""
echo "  Mail-Entwurf in Mail-Client:"
echo "    open $MAIL_OUT_DIR/$SLUG.eml"
echo ""
[ "${COMMIT:-false}" != "true" ] && echo "  Commit + Push:"
[ "${COMMIT:-false}" != "true" ] && echo "    cd $CUSTOMER_REPO && git add public/email/ email-signatures/ && git commit && git push"
