# Animierte Email-Signaturen (APNG-Pipeline)

Generiert animierte Logos (APNG = Animated PNG) für E-Mail-Signaturen aus Logo-SVG/PNG + Brand-Farben + Effekt-Template. Mail-Clients, die APNG unterstützen (Apple Mail, Gmail Web, Thunderbird), zeigen die Animation. Outlook Desktop und viele Mobile-Apps zeigen das erste Frame als statisches Fallback.

## Quick-Start

```bash
# Einzelner Effekt-Render
cd cw-core/templates/email-signature

LOGO_SVG=/path/to/logo.svg \
ANIMATION_EFFECT=shine-sweep \
COLOR_PRIMARY="#1D1E3B" \
COLOR_ACCENT="#EF7612" \
WIDTH=200 HEIGHT=47 \
./animate/render-apng.sh /tmp/out.png
```

Aktivierung pro Person (regenerate-all.sh-Workflow):

```ts
// customer-X/src/data/site-data.ts
persons: [
  {
    slug: 'markus-mueller',
    name: 'Markus Müller',
    email: 'markus@firma.de',
    animationEffect: 'shine-sweep',   // ← aktiviert APNG
  }
]
```

```bash
cd cw-core
ONLY_CUSTOMER=customer-X pnpm sig:regenerate
# → customer-X/public/email/logo-light-animated.png wird generiert
```

## Effekt-Bibliothek

| Effekt | Beschreibung | Empfohlen für |
|---|---|---|
| **shine-sweep** | Diagonaler Glanz-Strahl wandert über das Logo | Handwerk, Beratung, "Premium"-Feel |
| **fade-reveal** | Logo dimmt kurz auf 35%, kehrt zurück | Steuerberater, Anwälte, "Dezent" |
| **subtle-pulse** | Skalierung 100% → 104% → 100% | Restaurants, Wein, "Lebendig" |
| **color-shift** | Brand-Accent-Glow erscheint um Logo und verschwindet | Tech, Bäckerei, "Modern" |
| **underline-grow** | Akzent-Linie wächst unter dem Logo, hält, schrumpft | Sanierung, Gartenbau, "Klassisch" |

Alle Loops dauern 2 Sekunden, repeat infinite.

## Wie es funktioniert

1. **Template-Substitution**: `effects/<name>.html.template` lädt Motion One (`vendor/motion.min.js`) und definiert die Animation. Platzhalter `{{COLOR_PRIMARY}}`, `{{COLOR_ACCENT}}`, `{{LOGO_DATA_URI}}`, `{{WIDTH}}`, `{{HEIGHT}}`, `{{MOTION_URL}}` werden ersetzt.
2. **Headless-Render**: `gstack-browse` lädt das HTML, wartet bis Motion-Animation gestartet ist.
3. **Frame-Loop**: 40 Frames × 50ms = 2000ms. Pro Frame:
   - `document.getAnimations().forEach(a => { a.pause(); a.currentTime = t })` friert Animation auf exakten Zeitpunkt
   - 80ms warten (Browser-Re-Render)
   - `screenshot --selector "#logo"` → frame-NN.png
4. **Alpha-Strip**: ImageMagick macht weißen Hintergrund transparent.
5. **Quantize**: pngquant (lossy 65-90%) reduziert Farbpalette pro Frame.
6. **APNG-Assembly**: apngasm baut Frames zu finalem APNG mit `-d 50 -l 0` (50ms pro Frame, infinite loop).

**First-Frame-Garantie**: Jeder Effekt-Template ist so designed, dass bei `t=0` das ruhende Logo gezeigt wird — identisch zum statischen `logo-light.png`. Outlook-User sehen also nicht angeschnittene Animation, sondern ein ordentliches Logo.

## Engine: Motion One

[Motion One](https://motion.dev) (3.7KB-24KB depending on build, MIT-licensed) ist eine moderne Animation-Library, die direkt die Web Animations API nutzt. Vorteile gegenüber plain CSS-Keyframes:

- Spring-Physics out-of-the-box (`spring({ stiffness: 100, damping: 12 })`)
- Smooth easing
- Animation-Composition (mehrere Properties parallel)
- `document.getAnimations()` findet alle Motion-Animations → unser Pause/Seek-Mechanismus funktioniert

Library ist lokal in `vendor/motion.min.js` gepinnt (deterministische Builds, offline-fähig).

**Update der Library:**
```bash
curl -fsSL https://cdn.jsdelivr.net/npm/motion@10/dist/motion.min.js > vendor/motion.min.js
# Smoke-Test alle 5 Effekte vor Commit
```

## Dependencies

- **apngasm** (`brew install apngasm`) — APNG-Builder
- **pngquant** (`brew install pngquant`) — Color-Quantization (optional, reduziert Größe ~50%)
- **ImageMagick** (`brew install imagemagick`) — Alpha-Strip
- **gstack-browse** (`~/.claude/skills/gstack/browse/dist/browse`) — Headless-Chromium

## Mail-Client-Kompatibilität

| Client | APNG-Animation | Fallback |
|---|---|---|
| Apple Mail (macOS) | ✓ animiert | — |
| Apple Mail (iOS) | ⚠ Mixed (neuere Versionen ✓) | First Frame |
| Gmail Web | ✓ animiert | — |
| Gmail App (iOS/Android) | ⚠ Meistens nur First Frame | First Frame |
| Thunderbird | ✓ animiert | — |
| Outlook Web | ✓ animiert | — |
| Outlook Desktop (Windows) | ✗ nur First Frame | First Frame |
| Outlook Mac | ⚠ Mixed | First Frame |

**Realistische Animation-Quote: 40-60% der Empfänger sehen die Animation.** Das ist OK — der First-Frame-Fallback garantiert, dass niemand ein kaputtes Logo sieht.

## Troubleshooting

**"40 Frames captured, aber alle identisch"**
→ `RENDER_WAIT` zu kurz. Default 80ms. Setze `RENDER_WAIT=0.15` ENV beim Render. Browser braucht Zeit zwischen `js eval` und `screenshot`.

**"APNG ist > 800kB"**
→ Effekt nutzt zu viele unterschiedliche Frames (z.B. color-shift hat kontinuierliche Glow-Änderung). Optionen:
- Reduziere `LOOP_MS` auf 1500ms
- Erhöhe `FRAME_STEP_MS` auf 80ms (= 18 Frames statt 40)
- Nutze einen "stiller" Effekt (shine-sweep, fade-reveal)

**"Library nicht gefunden: motion.min.js"**
→ `curl https://cdn.jsdelivr.net/npm/motion@10/dist/motion.min.js > vendor/motion.min.js`

**"Logo verzerrt"**
→ WIDTH/HEIGHT muss Logo-Aspect-Ratio matchen. `generate.sh` macht das automatisch via `magick identify`. Bei direktem `render-apng.sh`-Aufruf: WIDTH × Logo-Höhe / Logo-Breite = HEIGHT.

## Roadmap

**V2:** Zentrales Hosting auf `sig.siluri.de` mit Tracking-Capability (DSGVO-konform via Server-Logs statt Tracking-Pixels).

**V3:** Separates `cw-motion` Repository mit [Remotion](https://www.remotion.dev) für:
- Intro-Videos (Brand-Logo + Tagline)
- Social-Media-Posts (1080×1080, 5-15s)
- Multi-Composition-Animationen

Motion One bleibt für simple Logo-Loops. Remotion übernimmt komplexere Video-Generierung.
