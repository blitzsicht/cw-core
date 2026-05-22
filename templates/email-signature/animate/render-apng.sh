#!/usr/bin/env bash
# =============================================================================
# render-apng.sh — Logo + Effekt-Template → APNG (Animated PNG)
# =============================================================================
# Renderet eine HTML/CSS-Animation Frame-by-Frame via headless Chromium,
# assembliert die Frames zu einer APNG-Datei (transparent, brand-color-aware).
#
# Verwendung:
#   render-apng.sh <output.png>
#
# ENV-Vars (required):
#   LOGO_SVG          — Pfad zum Logo (SVG oder PNG)
#   ANIMATION_EFFECT  — shine-sweep | fade-reveal | subtle-pulse | color-shift | underline-grow
#
# ENV-Vars (optional):
#   COLOR_PRIMARY     — Brand-Primary (default #312783)
#   COLOR_ACCENT      — Brand-Accent (default #3d7a12)
#   WIDTH             — Render-Width in px (default 200)
#   HEIGHT            — Render-Height in px (default 47)
#   LOOP_MS           — Animation-Loop-Duration in ms (default 2000)
#   FRAME_STEP_MS     — Frame-Step in ms (default 50 → 40 Frames bei 2000ms)
#
# Dependencies: apngasm, pngquant, magick (ImageMagick), gstack-browse
# =============================================================================
set -euo pipefail

OUTPUT_PNG="${1:?'Usage: render-apng.sh <output.png>'}"

LOGO_SVG="${LOGO_SVG:?'LOGO_SVG fehlt — Pfad zu logo.svg oder logo.png'}"
ANIMATION_EFFECT="${ANIMATION_EFFECT:?'ANIMATION_EFFECT fehlt — z.B. shine-sweep'}"

# Allowlist — Effekt-Name darf nur einer aus der bekannten Bibliothek sein.
# Verhindert Path-Traversal über das Template-Lookup.
case "$ANIMATION_EFFECT" in
  shine-sweep|fade-reveal|subtle-pulse|color-shift|underline-grow) ;;
  *) echo "ABORT: Unbekannter ANIMATION_EFFECT: $ANIMATION_EFFECT (erlaubt: shine-sweep, fade-reveal, subtle-pulse, color-shift, underline-grow)"; exit 1 ;;
esac

COLOR_PRIMARY="${COLOR_PRIMARY:-#312783}"
COLOR_ACCENT="${COLOR_ACCENT:-#3d7a12}"
WIDTH="${WIDTH:-200}"
HEIGHT="${HEIGHT:-47}"
LOOP_MS="${LOOP_MS:-2000}"
FRAME_STEP_MS="${FRAME_STEP_MS:-50}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEMPLATE="$SCRIPT_DIR/effects/${ANIMATION_EFFECT}.html.template"

[ -f "$LOGO_SVG" ]  || { echo "ABORT: Logo nicht gefunden: $LOGO_SVG"; exit 1; }
[ -f "$TEMPLATE" ]  || { echo "ABORT: Effekt-Template nicht gefunden: $TEMPLATE"; exit 1; }

# ── Dependency-Check ──────────────────────────────────────────────────────────
B="$HOME/.claude/skills/gstack/browse/dist/browse"
[ -x "$B" ] || { echo "ABORT: gstack-browse nicht gefunden: $B"; exit 1; }
command -v apngasm  >/dev/null || { echo "ABORT: apngasm fehlt (brew install apngasm)";   exit 1; }
command -v magick   >/dev/null || { echo "ABORT: ImageMagick fehlt";                       exit 1; }
HAS_PNGQUANT=0
command -v pngquant >/dev/null && HAS_PNGQUANT=1

# ── Stage-Dir ─────────────────────────────────────────────────────────────────
SLUG="$(basename "$OUTPUT_PNG" .png)-$$"
STAGE="/tmp/render-apng/$SLUG"
rm -rf "$STAGE"
mkdir -p "$STAGE"

# ── Logo → Data-URI ───────────────────────────────────────────────────────────
LOGO_EXT="${LOGO_SVG##*.}"
case "$LOGO_EXT" in
  svg|SVG)  MIME="image/svg+xml" ;;
  png|PNG)  MIME="image/png" ;;
  jpg|JPG|jpeg|JPEG) MIME="image/jpeg" ;;
  *) echo "ABORT: Logo-Format $LOGO_EXT nicht unterstützt"; exit 1 ;;
esac
LOGO_B64=$(base64 -i "$LOGO_SVG" | tr -d '\n')
LOGO_DATA_URI="data:${MIME};base64,${LOGO_B64}"

# Motion One Library-Pfad (absolut file:// URL für die Templates)
MOTION_PATH="$SCRIPT_DIR/vendor/motion.min.js"
[ -f "$MOTION_PATH" ] || { echo "ABORT: Motion One nicht gefunden: $MOTION_PATH (run: curl https://cdn.jsdelivr.net/npm/motion@10/dist/motion.min.js > $MOTION_PATH)"; exit 1; }
MOTION_URL="file://$MOTION_PATH"

# ── HTML aus Template generieren ──────────────────────────────────────────────
HTML_FILE="$STAGE/index.html"
python3 - "$TEMPLATE" "$HTML_FILE" "$WIDTH" "$HEIGHT" "$COLOR_PRIMARY" "$COLOR_ACCENT" "$LOGO_DATA_URI" "$MOTION_URL" <<'PYEOF'
import sys
tpl, out, w, h, cp, ca, uri, motion = sys.argv[1:9]
with open(tpl) as f:
    s = f.read()
s = (s.replace('{{WIDTH}}', w)
      .replace('{{HEIGHT}}', h)
      .replace('{{COLOR_PRIMARY}}', cp)
      .replace('{{COLOR_ACCENT}}', ca)
      .replace('{{LOGO_DATA_URI}}', uri)
      .replace('{{MOTION_URL}}', motion))
with open(out, 'w') as f:
    f.write(s)
PYEOF

echo "→ Effekt: $ANIMATION_EFFECT (${WIDTH}x${HEIGHT}, loop=${LOOP_MS}ms, step=${FRAME_STEP_MS}ms)"
echo "  Stage:  $STAGE"

# ── Browser starten, Seite laden ──────────────────────────────────────────────
# Viewport mit etwas Puffer + scale 2 für Retina-schärfe
VPW=$((WIDTH + 20))
VPH=$((HEIGHT + 20))
$B viewport "${VPW}x${VPH}" --scale 2 >/dev/null 2>&1
$B goto "file://$HTML_FILE" >/dev/null 2>&1
sleep 0.5

# ── Frame-Capture-Loop ────────────────────────────────────────────────────────
N_FRAMES=$((LOOP_MS / FRAME_STEP_MS))
echo "  Frames: $N_FRAMES × ${FRAME_STEP_MS}ms"

idx=0
t=0
# Sleep zwischen js-eval und screenshot, damit Browser neuen Frame rendert.
# 80ms ist empirisch zuverlässig; weniger führt zu identischen Frames.
RENDER_WAIT="${RENDER_WAIT:-0.08}"
while [ $idx -lt $N_FRAMES ]; do
  # Animation einfrieren auf exakten Zeitpunkt (deterministisch)
  $B js "document.getAnimations().forEach(a => { a.pause(); a.currentTime = $t; })" >/dev/null 2>&1
  sleep "$RENDER_WAIT"
  FRAME=$(printf "$STAGE/frame-%03d.png" $idx)
  $B screenshot "$FRAME" "#logo" >/dev/null 2>&1
  if [ ! -f "$FRAME" ]; then
    echo "ABORT: Frame $idx Screenshot fehlgeschlagen"
    exit 1
  fi
  idx=$((idx + 1))
  t=$((t + FRAME_STEP_MS))
done
echo "  ✓ $N_FRAMES Frames captured"

# ── Alpha-Strip (weiß → transparent) auf alle Frames ──────────────────────────
echo "  → Alpha-Strip…"
for f in "$STAGE"/frame-*.png; do
  magick "$f" -fuzz 2% -transparent white -alpha set "$f.tmp" 2>/dev/null
  mv "$f.tmp" "$f"
done

# ── Optional: pngquant pro Frame (Color-Quantization, lossy) ──────────────────
if [ "$HAS_PNGQUANT" -eq 1 ]; then
  echo "  → pngquant (Color-Quantization)…"
  for f in "$STAGE"/frame-*.png; do
    pngquant --quality 65-90 --force --output "$f" "$f" 2>/dev/null || true
  done
fi

# ── APNG assemblieren ─────────────────────────────────────────────────────────
echo "  → apngasm…"
apngasm -o "$OUTPUT_PNG" "$STAGE"/frame-*.png -d "$FRAME_STEP_MS" -l 0 -F >/dev/null 2>&1

if [ ! -f "$OUTPUT_PNG" ]; then
  echo "ABORT: apngasm hat keine Datei erzeugt"
  exit 1
fi

# ── Verifikation ──────────────────────────────────────────────────────────────
SIZE=$(wc -c < "$OUTPUT_PNG")
SIZE_KB=$((SIZE / 1024))
echo "  ✓ $OUTPUT_PNG (${SIZE_KB}kB, ${N_FRAMES} frames)"

if [ "$SIZE" -gt 800000 ]; then
  echo "  ⚠ WARNING: ${SIZE_KB}kB > 800kB Target — Mail-Provider könnten ablehnen"
fi

# Cleanup Stage (keep only on KEEP_STAGE=1)
if [ "${KEEP_STAGE:-0}" != "1" ]; then
  rm -rf "$STAGE"
fi
