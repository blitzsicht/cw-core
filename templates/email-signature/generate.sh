#!/usr/bin/env bash
# =============================================================================
# cw-core Email-Signatur Generator (v2)
# =============================================================================
# Generiert HTML + TXT-Signatur aus Template.
# Verbesserungen v2 (2026-05-12):
#   - sed-Replacement escaping (& | \ /) — fixt "GmbH & Co. KG"-Bug
#   - PNG-Transparenz-Post-Step (weißer Bg → alpha=0)
#   - Aspect-Ratio-Detection: Logo > 3.5:1 → Layout-B (full-width oben)
#   - Compliance-Block-Builder (kein {{HRB}}-Leerwert mehr in Output)
#   - Dark-Mode CSS in Templates
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEMPLATE_HTML_A="$SCRIPT_DIR/PERSON.html.template"
TEMPLATE_HTML_B="$SCRIPT_DIR/PERSON-layout-b.html.template"
TEMPLATE_TXT="$SCRIPT_DIR/PERSON.txt.template"

# ── Konfiguration ─────────────────────────────────────────────────────────────
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
LAYOUT="${LAYOUT:-auto}"

SLUG=$(echo "$NAME" | tr '[:upper:]' '[:lower:]' | sed 's/ /-/g' | sed 's/ä/ae/g; s/ö/oe/g; s/ü/ue/g; s/ß/ss/g' | sed 's/[^a-z0-9-]//g')
SLUG="${EXPLICIT_SLUG:-$SLUG}"
OUT_DIR="${OUT_DIR:-email-signatures/$SLUG}"
mkdir -p "$OUT_DIR/assets"

echo "→ Generiere Signatur für: $NAME"
echo "  Output: $OUT_DIR/"

# ── sed-safe Replacement-Escape (& | \ / werden zu Sonderzeichen in sed) ──────
sed_escape() {
  printf '%s' "$1" | sed -e 's/[\&|/]/\\&/g'
}

# ── Compliance-Block bauen (rechtsform-abhängig) ──────────────────────────────
build_compliance_block() {
  local lines=()
  lines+=("${STREET} &middot; ${ZIP_CITY}")

  local lf_lower
  lf_lower=$(printf '%s' "$LEGAL_FORM" | tr '[:upper:]' '[:lower:]')

  case "$lf_lower" in
    einzelunternehmen|einzelunternehmer|freiberufler)
      # Keine GF/HRB-Zeile — bei Einzelunternehmen nicht relevant
      ;;
    egbr|"egbr (eingetragene gbr)")
      if [ -n "$GF_NAME" ]; then
        lines+=("eGbR &middot; vertretungsberechtigt: ${GF_NAME}")
      else
        lines+=("eGbR")
      fi
      [ -n "$REGISTERGERICHT" ] && [ -n "$HRB" ] && lines+=("${REGISTERGERICHT} &middot; ${HRB}")
      [ -n "$REGISTERGERICHT" ] && [ -z "$HRB" ] && lines+=("${REGISTERGERICHT}")
      ;;
    *)
      # GmbH, AG, UG, GmbH & Co. KG, …
      local gf_line="${LEGAL_FORM}"
      [ -n "$GF_NAME" ] && gf_line="${gf_line} &middot; GF: ${GF_NAME}"
      lines+=("$gf_line")

      if [ -n "$REGISTERGERICHT" ] && [ -n "$HRB" ]; then
        lines+=("${REGISTERGERICHT} &middot; ${HRB}")
      elif [ -n "$REGISTERGERICHT" ]; then
        lines+=("${REGISTERGERICHT}")
      elif [ -n "$HRB" ]; then
        lines+=("$HRB")
      fi
      ;;
  esac

  [ -n "$UST_ID" ] && lines+=("USt-IdNr.: ${UST_ID}")

  local IFS_OLD="$IFS"
  local IFS=$'\n'
  printf '%s' "${lines[*]}" | sed 's|$|<br>|g' | tr -d '\n' | sed 's|<br>$||'
  IFS="$IFS_OLD"
}

COMPLIANCE_BLOCK=$(build_compliance_block)

# ── Layout-Auswahl (auto/a/b) ─────────────────────────────────────────────────
detect_layout() {
  if [ "$LAYOUT" = "a" ] || [ "$LAYOUT" = "b" ]; then
    echo "$LAYOUT"; return
  fi
  # Aspect aus SVG/PNG lesen
  local dims aspect
  if command -v magick &>/dev/null; then
    dims=$(magick identify -format "%w %h" "$LOGO_SVG" 2>/dev/null | head -1)
  elif command -v identify &>/dev/null; then
    dims=$(identify -format "%w %h" "$LOGO_SVG" 2>/dev/null | head -1)
  else
    echo "a"; return
  fi
  local w h
  w=$(echo "$dims" | awk '{print $1}')
  h=$(echo "$dims" | awk '{print $2}')
  if [ -z "$w" ] || [ -z "$h" ] || [ "$h" -eq 0 ]; then echo "a"; return; fi
  aspect=$(awk -v w="$w" -v h="$h" 'BEGIN{printf "%.2f", w/h}')
  if awk -v a="$aspect" 'BEGIN{exit !(a>3.5)}'; then
    echo "b"
  else
    echo "a"
  fi
}

CHOSEN_LAYOUT=$(detect_layout)
case "$CHOSEN_LAYOUT" in
  b) TEMPLATE_HTML="$TEMPLATE_HTML_B"; echo "  Layout: B (Wortmarke — Logo full-width oben)" ;;
  *) TEMPLATE_HTML="$TEMPLATE_HTML_A"; echo "  Layout: A (Logo links)" ;;
esac

# ── Platzhalter-Ersetzung ─────────────────────────────────────────────────────
replace_html() {
  local file="$1"
  sed \
    -e "s|{{NAME}}|$(sed_escape "$NAME")|g" \
    -e "s|{{POSITION}}|$(sed_escape "$POSITION")|g" \
    -e "s|{{EMAIL}}|$(sed_escape "$EMAIL")|g" \
    -e "s|{{PHONE}}|$(sed_escape "$PHONE")|g" \
    -e "s|{{WEBSITE_URL}}|$(sed_escape "$WEBSITE_URL")|g" \
    -e "s|{{WEBSITE_FULL}}|$(sed_escape "$WEBSITE_FULL")|g" \
    -e "s|{{COLOR_PRIMARY}}|$(sed_escape "$COLOR_PRIMARY")|g" \
    -e "s|{{COLOR_ACCENT}}|$(sed_escape "$COLOR_ACCENT")|g" \
    -e "s|{{COMPANY_NAME}}|$(sed_escape "$COMPANY_NAME")|g" \
    -e "s|{{LOGO_URL}}|$(sed_escape "$LOGO_URL")|g" \
    -e "s|{{LOGO_ALT}}|$(sed_escape "$LOGO_ALT")|g" \
    -e "s|{{COMPLIANCE_BLOCK}}|$(sed_escape "$COMPLIANCE_BLOCK")|g" \
    "$file"
}

replace_txt() {
  # Python für sicheren Multi-Line-Replace (newlines in COMPLIANCE_BLOCK)
  local block_txt
  block_txt=$(printf '%s' "$COMPLIANCE_BLOCK" | sed 's|<br>|\
|g; s|&middot;|·|g; s|&nbsp;| |g')

  python3 - "$1" "$NAME" "$POSITION" "$EMAIL" "$PHONE" "$WEBSITE_URL" \
              "$WEBSITE_FULL" "$COMPANY_NAME" "$block_txt" <<'PYEOF'
import sys
path, NAME, POSITION, EMAIL, PHONE, WEBSITE_URL, WEBSITE_FULL, COMPANY_NAME, BLOCK = sys.argv[1:10]
with open(path) as f:
    t = f.read()
repl = {
    "{{NAME}}": NAME, "{{POSITION}}": POSITION, "{{EMAIL}}": EMAIL,
    "{{PHONE}}": PHONE, "{{WEBSITE_URL}}": WEBSITE_URL,
    "{{WEBSITE_FULL}}": WEBSITE_FULL, "{{COMPANY_NAME}}": COMPANY_NAME,
    "{{COMPLIANCE_BLOCK}}": BLOCK,
}
for k, v in repl.items():
    t = t.replace(k, v)
print(t, end="")
PYEOF
}

replace_html "$TEMPLATE_HTML" > "$OUT_DIR/$SLUG.html"
replace_txt "$TEMPLATE_TXT" > "$OUT_DIR/$SLUG.txt"
echo "  ✓ $SLUG.html"
echo "  ✓ $SLUG.txt"

# ── PNG-Pipeline mit Transparenz-Force ────────────────────────────────────────
PNG_OUT="$OUT_DIR/assets/logo.png"
LOGO_PNG_PUBLIC="${LOGO_PNG_PUBLIC:-public/email/logo.png}"

MAGICK=""
command -v magick &>/dev/null && MAGICK="magick"
[ -z "$MAGICK" ] && command -v convert &>/dev/null && MAGICK="convert"

if command -v rsvg-convert &>/dev/null; then
  rsvg-convert -w 480 -a -b transparent "$LOGO_SVG" > "$PNG_OUT"
  echo "  ✓ logo.png (via rsvg-convert)"
elif command -v inkscape &>/dev/null; then
  inkscape --export-filename="$PNG_OUT" --export-width=480 --export-background-opacity=0 "$LOGO_SVG" 2>/dev/null
  echo "  ✓ logo.png (via inkscape)"
elif [ -n "$MAGICK" ]; then
  $MAGICK -background none -density 288 "$LOGO_SVG" -resize 480x "$PNG_OUT" 2>/dev/null || true
  echo "  ✓ logo.png (via imagemagick — ggf. Browser-Render-Fallback bei Wortmarken)"
else
  printf '\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82' > "$PNG_OUT"
  echo "  ⚠ Kein SVG-Konverter → 1x1-Placeholder. ImageMagick installieren: brew install imagemagick"
fi

# Transparenz-Post-Step: weißen Hintergrund zu Alpha=0 machen
if [ -n "$MAGICK" ] && [ -f "$PNG_OUT" ]; then
  $MAGICK "$PNG_OUT" -fuzz 2% -transparent white -alpha set "$PNG_OUT" 2>/dev/null || true
  echo "  ✓ logo.png Transparenz-Check (weiß → alpha=0)"
fi

# Wenn PNG fehlt/zu klein (Wortmarken-SVG mit font-family ImageMagick nicht rendert):
# Browser-Render-Fallback
PNG_SIZE=0
[ -f "$PNG_OUT" ] && PNG_SIZE=$(wc -c < "$PNG_OUT")

# Browser-Render-Fallback wenn:
#  - PNG fehlt oder zu klein (<5KB → ImageMagick-Font-Fehler)
#  - ODER Layout-B (Wortmarke → ImageMagick rendert system-ui-Font nicht)
NEED_FALLBACK=false
if [ "$PNG_SIZE" -lt 5000 ]; then NEED_FALLBACK=true; fi
if [ "$CHOSEN_LAYOUT" = "b" ]; then NEED_FALLBACK=true; fi

if [ "$NEED_FALLBACK" = "true" ] && [ -x "$SCRIPT_DIR/render-png-fallback.sh" ]; then
  REASON="Wortmarke (Layout-B)"
  [ "$PNG_SIZE" -lt 5000 ] && REASON="zu klein ($PNG_SIZE B)"
  echo "  ⚠ Browser-Render-Fallback: $REASON"
  "$SCRIPT_DIR/render-png-fallback.sh" "$LOGO_SVG" "$PNG_OUT" 480 || true
  if [ -f "$PNG_OUT" ] && [[ -d "public" ]]; then
    cp "$PNG_OUT" "$LOGO_PNG_PUBLIC"
  fi
fi

# Auch nach public/email/logo.png
if [[ -d "public" ]]; then
  mkdir -p "$(dirname "$LOGO_PNG_PUBLIC")"
  cp "$PNG_OUT" "$LOGO_PNG_PUBLIC"
  echo "  ✓ $LOGO_PNG_PUBLIC"
fi

# ── README ────────────────────────────────────────────────────────────────────
cat > "$OUT_DIR/README.md" <<EOF
# E-Mail-Signatur: $NAME

Generiert $(date +%Y-%m-%d) mit cw-core generate.sh (v2). Layout: $CHOSEN_LAYOUT.

## Dateien

- \`$SLUG.html\` — HTML-Signatur (Outlook-kompatibel, Tabellen-Layout, Dark-Mode-ready)
- \`$SLUG.txt\` — Plain-Text-Fallback
- \`assets/logo.png\` — Logo als PNG mit transparentem Hintergrund

## Einbinden

### Outlook Web (OWA)
1. Einstellungen → Mail → Verfassen und antworten → E-Mail-Signatur
2. \`</>\`-Quelltext-Icon klicken (manchmal HTML-Editor)
3. Inhalt von \`$SLUG.html\` einfügen, speichern

### Apple Mail (macOS)
1. Mail → Einstellungen → Signaturen → "+"
2. „Schriftart und Farbe der Standardnachricht beibehalten" deaktivieren
3. \`$SLUG.html\` öffnen, alles kopieren → in Signaturfeld einfügen

### Gmail
1. Einstellungen → Allgemein → Signatur
2. \`$SLUG.html\` im Browser öffnen, alles kopieren, einfügen

## Logo

Öffentlich gehostet: $LOGO_URL

## §35a HGB Pflichtangaben

$COMPLIANCE_BLOCK
EOF

echo "  ✓ README.md"
echo ""
echo "Fertig! Layout: $CHOSEN_LAYOUT · Dateien in: $OUT_DIR/"
