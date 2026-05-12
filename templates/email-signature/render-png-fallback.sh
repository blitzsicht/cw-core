#!/usr/bin/env bash
# =============================================================================
# render-png-fallback.sh — SVG → PNG via Headless-Browser-Render
# =============================================================================
# Browser-basierter Render-Fallback für SVGs die ImageMagick nicht rendern kann
# (z.B. Wortmarken mit font-family: system-ui).
#
# Verwendung:
#   ./render-png-fallback.sh <input.svg> <output.png> [width=480]
#
# Voraussetzung: gstack-browse installiert (~/.claude/skills/gstack/browse/dist/browse)
#                ImageMagick (für Transparenz-Post-Step)
# =============================================================================
set -euo pipefail

INPUT_SVG="${1:?'Usage: render-png-fallback.sh <input.svg> <output.png> [width]'}"
OUTPUT_PNG="${2:?'Usage: render-png-fallback.sh <input.svg> <output.png> [width]'}"
WIDTH="${3:-480}"

[ -f "$INPUT_SVG" ] || { echo "ABORT: SVG nicht gefunden: $INPUT_SVG"; exit 1; }

B="$HOME/.claude/skills/gstack/browse/dist/browse"
[ -x "$B" ] || { echo "ABORT: gstack-browse nicht gefunden: $B"; exit 1; }

STAGE="/tmp/render-png-fallback"
mkdir -p "$STAGE"
SVG_BASE=$(basename "$INPUT_SVG")
SVG_SLUG="${SVG_BASE%.*}-$$"
STAGED_SVG="$STAGE/$SVG_SLUG.svg"
WRAP_HTML="$STAGE/$SVG_SLUG.html"
TMP_PNG="$STAGE/$SVG_SLUG-render.png"

cp "$INPUT_SVG" "$STAGED_SVG"
cat > "$WRAP_HTML" <<EOF
<!DOCTYPE html><html><body style="margin:0;padding:0;background:transparent;">
<img src="$SVG_SLUG.svg" style="width:${WIDTH}px;display:block;" id="logo">
</body></html>
EOF

VIEWPORT_H=$((WIDTH * 9 / 16))
$B viewport "${WIDTH}x${VIEWPORT_H}" --scale 2 > /dev/null 2>&1
$B goto "file://$WRAP_HTML" > /dev/null 2>&1
sleep 2
$B screenshot "$TMP_PNG" --selector "#logo" > /dev/null 2>&1

if [ ! -f "$TMP_PNG" ] || [ "$(wc -c < "$TMP_PNG")" -lt 100 ]; then
  echo "ABORT: Browser-Render fehlgeschlagen"
  exit 1
fi

MAGICK=""
command -v magick &>/dev/null && MAGICK="magick"
[ -z "$MAGICK" ] && command -v convert &>/dev/null && MAGICK="convert"

if [ -n "$MAGICK" ]; then
  $MAGICK "$TMP_PNG" -fuzz 2% -transparent white -alpha set "$OUTPUT_PNG" 2>/dev/null
else
  cp "$TMP_PNG" "$OUTPUT_PNG"
fi

SIZE=$(wc -c < "$OUTPUT_PNG")
DIM=$(identify "$OUTPUT_PNG" 2>/dev/null | awk '{print $3}')
echo "  ✓ $OUTPUT_PNG ($DIM, ${SIZE}B)"
