#!/usr/bin/env bash
# =============================================================================
# cw-core Email-Signatur Generator
# =============================================================================
# Generiert HTML + TXT-Signatur aus Template + siteData.legal
# Ergebnis liegt in: email-signatures/<person>/
#
# Voraussetzung: imagemagick (brew install imagemagick) ODER
#                rsvg-convert (brew install librsvg)  ODER
#                Inkscape
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEMPLATE_HTML="$SCRIPT_DIR/PERSON.html.template"
TEMPLATE_TXT="$SCRIPT_DIR/PERSON.txt.template"

# ── Konfiguration (vor Aufruf anpassen) ──────────────────────────────────────
NAME="${NAME:?'NAME fehlt — setze NAME="Vorname Nachname"'}"
POSITION="${POSITION:?'POSITION fehlt'}"
EMAIL="${EMAIL:?'EMAIL fehlt'}"
PHONE="${PHONE:?'PHONE fehlt'}"
WEBSITE_URL="${WEBSITE_URL:?'WEBSITE_URL fehlt (ohne https://)'}"
WEBSITE_FULL="https://${WEBSITE_URL}"
COLOR_PRIMARY="${COLOR_PRIMARY:-#312783}"
COLOR_ACCENT="${COLOR_ACCENT:-#3d7a12}"
COMPANY_NAME="${COMPANY_NAME:?'COMPANY_NAME fehlt'}"
LEGAL_FORM="${LEGAL_FORM:-GmbH}"
GF_NAME="${GF_NAME:-}"
STREET="${STREET:?'STREET fehlt'}"
ZIP_CITY="${ZIP_CITY:?'ZIP_CITY fehlt'}"
HRB="${HRB:-}"
REGISTERGERICHT="${REGISTERGERICHT:-}"
UST_ID="${UST_ID:-}"
LOGO_SVG="${LOGO_SVG:?'LOGO_SVG fehlt — Pfad zur logo.svg (public/logo.svg)'}"
LOGO_URL="${LOGO_URL:?'LOGO_URL fehlt — absolute URL (https://domain.com/email/logo.png)'}"
LOGO_ALT="${LOGO_ALT:-$COMPANY_NAME}"

# ── Output-Verzeichnis ────────────────────────────────────────────────────────
SLUG=$(echo "$NAME" | tr '[:upper:]' '[:lower:]' | sed 's/ /-/g' | sed 's/[^a-z0-9-]//g')
OUT_DIR="${OUT_DIR:-email-signatures/$SLUG}"
mkdir -p "$OUT_DIR"

echo "→ Generiere Signatur für: $NAME"
echo "  Output: $OUT_DIR/"

# ── Platzhalter-Ersetzung ─────────────────────────────────────────────────────
replace() {
  local file="$1"
  sed \
    -e "s|{{NAME}}|$NAME|g" \
    -e "s|{{POSITION}}|$POSITION|g" \
    -e "s|{{EMAIL}}|$EMAIL|g" \
    -e "s|{{PHONE}}|$PHONE|g" \
    -e "s|{{WEBSITE_URL}}|$WEBSITE_URL|g" \
    -e "s|{{WEBSITE_FULL}}|$WEBSITE_FULL|g" \
    -e "s|{{COLOR_PRIMARY}}|$COLOR_PRIMARY|g" \
    -e "s|{{COLOR_ACCENT}}|$COLOR_ACCENT|g" \
    -e "s|{{COMPANY_NAME}}|$COMPANY_NAME|g" \
    -e "s|{{LEGAL_FORM}}|$LEGAL_FORM|g" \
    -e "s|{{GF_NAME}}|$GF_NAME|g" \
    -e "s|{{STREET}}|$STREET|g" \
    -e "s|{{ZIP_CITY}}|$ZIP_CITY|g" \
    -e "s|{{HRB}}|$HRB|g" \
    -e "s|{{REGISTERGERICHT}}|$REGISTERGERICHT|g" \
    -e "s|{{UST_ID}}|$UST_ID|g" \
    -e "s|{{LOGO_URL}}|$LOGO_URL|g" \
    -e "s|{{LOGO_ALT}}|$LOGO_ALT|g" \
    "$file"
}

replace "$TEMPLATE_HTML" > "$OUT_DIR/$SLUG.html"
replace "$TEMPLATE_TXT"  > "$OUT_DIR/$SLUG.txt"
echo "  ✓ $SLUG.html"
echo "  ✓ $SLUG.txt"

# ── PNG aus SVG generieren ────────────────────────────────────────────────────
mkdir -p "$OUT_DIR/assets"
PNG_OUT="$OUT_DIR/assets/logo.png"
LOGO_PNG_PUBLIC="${LOGO_PNG_PUBLIC:-public/email/logo.png}"

if command -v rsvg-convert &>/dev/null; then
  rsvg-convert -w 200 "$LOGO_SVG" > "$PNG_OUT"
  echo "  ✓ logo.png (via rsvg-convert)"
elif command -v inkscape &>/dev/null; then
  inkscape --export-filename="$PNG_OUT" --export-width=200 "$LOGO_SVG" 2>/dev/null
  echo "  ✓ logo.png (via inkscape)"
elif command -v convert &>/dev/null || command -v magick &>/dev/null; then
  MAGICK="magick"
  command -v magick &>/dev/null || MAGICK="convert"
  $MAGICK -background none -density 144 "$LOGO_SVG" -resize 200x "$PNG_OUT"
  echo "  ✓ logo.png (via imagemagick)"
else
  echo "  ⚠ Kein SVG-Konverter gefunden (rsvg-convert, inkscape, imagemagick)"
  echo "    Placeholder PNG angelegt. Ersetze manuell durch echtes Logo."
  # Placeholder: leeres PNG (1x1 transparent)
  printf '\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82' > "$PNG_OUT"
  echo "    PNG-Placeholder: $PNG_OUT (1x1 transparent)"
fi

# Auch als public/email/logo.png ablegen (für Hosting)
if [[ -d "public" ]]; then
  mkdir -p "$(dirname "$LOGO_PNG_PUBLIC")"
  cp "$PNG_OUT" "$LOGO_PNG_PUBLIC"
  echo "  ✓ $LOGO_PNG_PUBLIC (für Vercel-Hosting)"
fi

# ── README ────────────────────────────────────────────────────────────────────
cat > "$OUT_DIR/README.md" <<EOF
# E-Mail-Signatur: $NAME

Generiert am $(date +%Y-%m-%d) mit cw-core generate.sh.

## Dateien

- \`$SLUG.html\` — HTML-Signatur (Outlook-kompatibel, Tabellen-Layout)
- \`$SLUG.txt\` — Plain-Text-Fallback
- \`assets/logo.png\` — Logo als PNG für E-Mail-Client-Kompatibilität

## Einbinden

### Outlook Web (OWA)
1. Einstellungen → Signatur → Neue Signatur
2. Inhalt von \`$SLUG.html\` kopieren (als HTML einfügen)
3. Als Standard-Signatur setzen

### Apple Mail
1. Mail → Einstellungen → Signaturen
2. "+" klicken → Namen eingeben
3. \`$SLUG.html\` öffnen, alles kopieren → in Signaturfeld einfügen

### Gmail
1. Einstellungen → Alle Einstellungen → Allgemein → Signatur
2. Signatur erstellen → \`$SLUG.html\` in Browser öffnen → kopieren → einfügen

### Outlook Desktop (Windows)
1. Datei → Optionen → Mail → Signaturen
2. Neu → Namen vergeben
3. HTML-Editor öffnen (Source) → Inhalt von \`$SLUG.html\` einfügen

## Logo-Hosting

Das Logo unter \`assets/logo.png\` muss öffentlich erreichbar sein:
\`\`\`
$LOGO_URL
\`\`\`
Für Vercel-Deployments liegt das Logo unter \`public/email/logo.png\` und
ist automatisch unter \`https://[domain]/email/logo.png\` verfügbar.

## §35a HGB Pflichtangaben (GmbH)

Enthalten in der Signatur:
- Firma: $COMPANY_NAME
- Rechtsform: $LEGAL_FORM
- Sitz: $STREET, $ZIP_CITY
- Registergericht: $REGISTERGERICHT
- Handelsregisternummer: $HRB
- Geschäftsführer: $GF_NAME
- USt-IdNr.: $UST_ID
EOF

echo "  ✓ README.md"
echo ""
echo "Fertig! Signatur-Dateien in: $OUT_DIR/"
