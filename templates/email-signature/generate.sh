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

# ── Dual-Logo (Light + Dark) ──────────────────────────────────────────────────
# Light = LOGO_SVG (Standard). Dark wird auto-detected oder explizit gesetzt.
LOGO_SVG_LIGHT="${LOGO_SVG_LIGHT:-$LOGO_SVG}"
LOGO_DIR=$(dirname "$LOGO_SVG_LIGHT")

if [ -z "${LOGO_SVG_DARK:-}" ]; then
  if [ -f "$LOGO_DIR/logo-dark.svg" ]; then
    LOGO_SVG_DARK="$LOGO_DIR/logo-dark.svg"
  elif [ -f "$LOGO_DIR/logo-inverted.svg" ]; then
    LOGO_SVG_DARK="$LOGO_DIR/logo-inverted.svg"
  elif [ -f "$LOGO_DIR/logo-dark.png" ]; then
    LOGO_SVG_DARK="$LOGO_DIR/logo-dark.png"
  else
    LOGO_SVG_DARK=""  # kein Dark-Asset gefunden → Color-Swap-Fallback
  fi
fi

# URLs ableiten: nimm Verzeichnis aus LOGO_URL, hänge logo-light.png / logo-dark.png an
LOGO_URL_BASE_DIR="${LOGO_URL%/*}/"  # alles bis zum letzten Slash
LOGO_URL_LIGHT="${LOGO_URL_LIGHT:-${LOGO_URL_BASE_DIR}logo-light.png}"
LOGO_URL_DARK="${LOGO_URL_DARK:-${LOGO_URL_BASE_DIR}logo-dark.png}"

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

# ── Extras-Block (Booking, GMB-Review, Trust-Badges) ──────────────────────────
build_extras_block() {
  local parts=""

  # Booking-CTA (subtil, primary-Farbe als border)
  if [ -n "${BOOKING_URL:-}" ]; then
    local label="${BOOKING_LABEL:-Termin vereinbaren}"
    parts="${parts}<a href=\"${BOOKING_URL}\" style=\"display:inline-block;margin-top:10px;padding:6px 12px;border:1px solid ${COLOR_PRIMARY};color:${COLOR_PRIMARY};text-decoration:none;font-size:11px;font-weight:600;border-radius:3px;\">📅 ${label}</a>"
  fi

  # Trust-Badges (komma-separierte Liste)
  if [ -n "${TRUST_BADGES_JSON:-}" ]; then
    local badges
    badges=$(printf '%s' "$TRUST_BADGES_JSON" | python3 -c '
import sys, json
try:
    items = json.loads(sys.stdin.read())
    out = []
    for b in items:
        label = b.get("label", "")
        url = b.get("url", "")
        if url:
            out.append(f"<a href=\"{url}\" style=\"color:#666;text-decoration:none;\">{label}</a>")
        else:
            out.append(label)
    print(" &middot; ".join(out))
except Exception:
    pass
' 2>/dev/null)
    if [ -n "$badges" ]; then
      parts="${parts}<p style=\"margin:10px 0 0 0;font-size:10px;color:#888;\">${badges}</p>"
    fi
  fi

  # Google-Bewertungs-CTA (prominent in Akzent-Farbe)
  if [ -n "${GOOGLE_REVIEW_URL:-}" ]; then
    # UTM am Review-URL anhängen (immer)
    local separator="?"
    [[ "$GOOGLE_REVIEW_URL" == *"?"* ]] && separator="&"
    local review_url_with_utm="${GOOGLE_REVIEW_URL}${separator}utm_source=email-signature&utm_medium=email&utm_campaign=${SLUG}-review"
    parts="${parts}<table cellpadding=\"0\" cellspacing=\"0\" border=\"0\" style=\"margin-top:12px;\"><tr><td style=\"padding:6px 12px;background:${COLOR_ACCENT};border-radius:3px;\"><a href=\"${review_url_with_utm}\" style=\"color:#ffffff;font-size:11px;font-weight:600;text-decoration:none;\">⭐ Auf Google bewerten</a></td></tr></table>"
  fi

  # vCard-Download-Link ("Kontakt speichern")
  if [ -n "${VCARD_PUBLIC_URL:-}" ]; then
    parts="${parts}<p style=\"margin:10px 0 0 0;font-size:11px;\"><a href=\"${VCARD_PUBLIC_URL}\" style=\"color:${COLOR_PRIMARY};text-decoration:none;\">📇 Kontakt speichern (vCard)</a></p>"
  fi

  printf '%s' "$parts"
}

EXTRAS_BLOCK=$(build_extras_block)

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
    -e "s|{{LOGO_URL_LIGHT}}|$(sed_escape "$LOGO_URL_LIGHT")|g" \
    -e "s|{{LOGO_URL_DARK}}|$(sed_escape "$LOGO_URL_DARK")|g" \
    -e "s|{{LOGO_URL}}|$(sed_escape "$LOGO_URL")|g" \
    -e "s|{{LOGO_ALT}}|$(sed_escape "$LOGO_ALT")|g" \
    -e "s|{{COMPLIANCE_BLOCK}}|$(sed_escape "$COMPLIANCE_BLOCK")|g" \
    -e "s|{{EXTRAS_BLOCK}}|$(sed_escape "$EXTRAS_BLOCK")|g" \
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

# ── Dual-PNG-Pipeline mit Transparenz-Force + Color-Swap-Fallback ─────────────
LOGO_PNG_LIGHT_OUT="$OUT_DIR/assets/logo-light.png"
LOGO_PNG_DARK_OUT="$OUT_DIR/assets/logo-dark.png"
LOGO_PNG_PUBLIC_LIGHT="${LOGO_PNG_PUBLIC_LIGHT:-public/email/logo-light.png}"
LOGO_PNG_PUBLIC_DARK="${LOGO_PNG_PUBLIC_DARK:-public/email/logo-dark.png}"

MAGICK=""
command -v magick &>/dev/null && MAGICK="magick"
[ -z "$MAGICK" ] && command -v convert &>/dev/null && MAGICK="convert"

# Helper: rendere SVG/PNG zu PNG mit Transparenz
# $1=SRC $2=OUT $3=variant (light|dark)  — variant beeinflusst transparent-strip-color
render_to_png() {
  local SRC="$1" OUT="$2" VARIANT="${3:-light}"
  local STRIP_COLOR="white"
  [ "$VARIANT" = "dark" ] && STRIP_COLOR="black"

  case "$SRC" in
    *.png)
      if [ -n "$MAGICK" ]; then
        $MAGICK "$SRC" -resize 480x -fuzz 2% -transparent "$STRIP_COLOR" -alpha set "$OUT" 2>/dev/null || cp "$SRC" "$OUT"
      else
        cp "$SRC" "$OUT"
      fi
      ;;
    *)
      # SVG → PNG (ImageMagick rendert auf transparent-bg, danach optional strip)
      if command -v rsvg-convert &>/dev/null; then
        rsvg-convert -w 480 -a -b transparent "$SRC" > "$OUT"
      elif command -v inkscape &>/dev/null; then
        inkscape --export-filename="$OUT" --export-width=480 --export-background-opacity=0 "$SRC" 2>/dev/null
      elif [ -n "$MAGICK" ]; then
        $MAGICK -background none -density 288 "$SRC" -resize 480x "$OUT" 2>/dev/null || true
      fi
      # Transparenz-Post-Step nur für Light (white→alpha). Dark: SVG-render war eh transparent.
      if [ "$VARIANT" = "light" ] && [ -n "$MAGICK" ] && [ -f "$OUT" ]; then
        $MAGICK "$OUT" -fuzz 2% -transparent white -alpha set "$OUT" 2>/dev/null || true
      fi
      ;;
  esac

  # Browser-Render-Fallback bei Wortmarken (Layout-B oder leeres PNG)
  local SIZE=0
  [ -f "$OUT" ] && SIZE=$(wc -c < "$OUT")
  if { [ "$SIZE" -lt 5000 ] || [ "$CHOSEN_LAYOUT" = "b" ]; } && [ -x "$SCRIPT_DIR/render-png-fallback.sh" ] && [[ "$SRC" == *.svg ]]; then
    echo "    → Browser-Render-Fallback ($(basename "$SRC") → $(basename "$OUT"), variant=$VARIANT)"
    "$SCRIPT_DIR/render-png-fallback.sh" "$SRC" "$OUT" 480 "$VARIANT" || true
  fi
}

# Color-Swap-Fallback: wenn keine Dark-Variant da, swap white→primary für Light
prepare_dark_svg_fallback() {
  local LIGHT_SRC="$1" DARK_OUT="$2"
  if grep -q 'fill="white"' "$LIGHT_SRC" 2>/dev/null; then
    # Das SVG hat fill="white" → das ist die DARK-Variante. Light = white→primary swap.
    cp "$LIGHT_SRC" "$DARK_OUT"  # Original (white) für dark
    return 0
  fi
  # Swap primary→white (best-effort) für dark-Variante
  sed -e "s|fill=\"$COLOR_PRIMARY\"|fill=\"#ffffff\"|g; s|fill=\"#000000\"|fill=\"#ffffff\"|g; s|fill=\"black\"|fill=\"#ffffff\"|g" "$LIGHT_SRC" > "$DARK_OUT"
}

prepare_light_svg_from_dark() {
  local DARK_SRC="$1" LIGHT_OUT="$2"
  # white → primary swap
  sed -e "s|fill=\"white\"|fill=\"$COLOR_PRIMARY\"|g; s|fill=\"#ffffff\"|fill=\"$COLOR_PRIMARY\"|g; s|fill=\"#FFFFFF\"|fill=\"$COLOR_PRIMARY\"|g" "$DARK_SRC" > "$LIGHT_OUT"
}

# Stage SVGs für beide Varianten
STAGE_DIR=$(mktemp -d)
LIGHT_SRC="$LOGO_SVG_LIGHT"
DARK_SRC="$LOGO_SVG_DARK"

# Wenn Light-SVG selbst white-fill ist (= dark-bg-Logo wie Soleno's logo-soleno.svg):
# → Light-SVG color-swappen für Light-Mail; Dark-SVG = das Original (auch wenn auto-detected was anderes).
if [[ "$LIGHT_SRC" == *.svg ]] && grep -q 'fill="white"' "$LIGHT_SRC" 2>/dev/null; then
  echo "  ⓘ Light-SVG hat white-fill → Color-Swap (white→$COLOR_PRIMARY) für Light + Original für Dark"
  prepare_light_svg_from_dark "$LIGHT_SRC" "$STAGE_DIR/light.svg"
  DARK_SRC="$LOGO_SVG_LIGHT"   # immer Original (mit white text) als Dark
  LIGHT_SRC="$STAGE_DIR/light.svg"
fi

# Hybrid-Fix für pseudo-dark SVGs (Steller-Pattern): logo-dark.svg existiert
# aber hat keine white-fills → wir generieren ein echtes dark-Logo aus dem light.
if [ -n "$DARK_SRC" ] && [[ "$DARK_SRC" == *.svg ]] && [ -f "$DARK_SRC" ]; then
  if ! grep -qiE 'fill="(white|#fff(fff)?)"' "$DARK_SRC" 2>/dev/null \
     && ! grep -qiE 'style="[^"]*fill:\s*(white|#fff(fff)?)' "$DARK_SRC" 2>/dev/null; then
    echo "  ⓘ logo-dark.svg hat keine white-fills → Auto-Color-Swap aus light.svg"
    # Alle hex-fills (außer transparent/none) → weiß. Behält Akzent-Farben wenn diese nicht hex sind.
    sed -E 's|fill="#[0-9a-fA-F]{6}"|fill="#ffffff"|g; s|fill="#[0-9a-fA-F]{3}"|fill="#ffffff"|g; s|fill:\s*#[0-9a-fA-F]{6}|fill:#ffffff|g' "$LIGHT_SRC" > "$STAGE_DIR/dark-derived.svg"
    DARK_SRC="$STAGE_DIR/dark-derived.svg"
  fi
fi

# Falls keine Dark-Source: Color-Swap-Fallback aus Light
if [ -z "$DARK_SRC" ]; then
  if [[ "$LIGHT_SRC" == *.svg ]]; then
    echo "  ⓘ Keine Dark-SVG gefunden → Color-Swap-Fallback (primary→white)"
    prepare_dark_svg_fallback "$LOGO_SVG_LIGHT" "$STAGE_DIR/dark.svg"
    DARK_SRC="$STAGE_DIR/dark.svg"
  else
    # PNG-only: nutze Light auch als Dark (wir haben keine bessere Option)
    DARK_SRC="$LIGHT_SRC"
  fi
fi

echo "  Logo-Light: $(basename "$LIGHT_SRC")"
echo "  Logo-Dark:  $(basename "$DARK_SRC")"

render_to_png "$LIGHT_SRC" "$LOGO_PNG_LIGHT_OUT" "light"
echo "  ✓ logo-light.png"
render_to_png "$DARK_SRC" "$LOGO_PNG_DARK_OUT" "dark"
echo "  ✓ logo-dark.png"

rm -rf "$STAGE_DIR"

# Backwards-compat: auch logo.png (= light) für ältere Templates
cp "$LOGO_PNG_LIGHT_OUT" "$OUT_DIR/assets/logo.png" 2>/dev/null || true

# Public-Hosting (für Vercel): beide PNGs + HTML nach <customer>/public/email/
# OUT_DIR-Struktur: <customer>/email-signatures/<slug>/ → public/email/ liegt 2 Ebenen höher
CUSTOMER_REPO_ROOT=$(cd "$OUT_DIR/../.." 2>/dev/null && pwd)
if [ -n "$CUSTOMER_REPO_ROOT" ] && [ -d "$CUSTOMER_REPO_ROOT/public" ]; then
  PUBLIC_EMAIL_DIR="$CUSTOMER_REPO_ROOT/public/email"
  mkdir -p "$PUBLIC_EMAIL_DIR"
  cp "$LOGO_PNG_LIGHT_OUT" "$PUBLIC_EMAIL_DIR/logo-light.png"
  cp "$LOGO_PNG_DARK_OUT"  "$PUBLIC_EMAIL_DIR/logo-dark.png"
  cp "$LOGO_PNG_LIGHT_OUT" "$PUBLIC_EMAIL_DIR/logo.png" 2>/dev/null || true
  echo "  ✓ public/email/logo-light.png"
  echo "  ✓ public/email/logo-dark.png"

  # HTML-Sig public hosten ("https://firma.de/email/<slug>.html" für Browser-Vorschau)
  cp "$OUT_DIR/$SLUG.html" "$PUBLIC_EMAIL_DIR/$SLUG.html" \
    && echo "  ✓ public/email/$SLUG.html"
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
