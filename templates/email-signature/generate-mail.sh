#!/usr/bin/env bash
# =============================================================================
# cw-core Email-Mail-Versand Generator
# =============================================================================
# Erzeugt versandfertige .eml + HTML-Preview aus existierender Signatur
# (HTML + TXT, vorher mit generate.sh erstellt).
#
# Output:
#   $OUT_DIR/<slug>.eml          — versandfertige Mail (in Apple Mail / Outlook
#                                   öffenbar mit `open <slug>.eml`)
#   $OUT_DIR/<slug>-preview.html — Browser-Preview der Mail (was Empfänger sieht)
#
# Verwendung:
#   SIG_DIR=customer-x/email-signatures/firstname-lastname \
#   TO_EMAIL=person@firma.de TO_NAME="Vor Nach" FIRST_NAME=Vor \
#   SALUTATION="Hallo Vor" \
#   FROM_EMAIL=servus@blitzsicht.com \
#   FROM_NAME="Johannes-Maximilian Gottl" \
#   OUT_DIR=/tmp/customer-mails \
#   ./generate-mail.sh
#
# Voraussetzung: SIG_DIR enthält <slug>.html und <slug>.txt
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ── Pflicht-Inputs ────────────────────────────────────────────────────────────
SIG_DIR="${SIG_DIR:?'SIG_DIR fehlt — Pfad zu email-signatures/<slug>/'}"
TO_EMAIL="${TO_EMAIL:?'TO_EMAIL fehlt — Empfänger-Adresse'}"
TO_NAME="${TO_NAME:?'TO_NAME fehlt — Vor- und Nachname Empfänger'}"
FIRST_NAME="${FIRST_NAME:?'FIRST_NAME fehlt — Vorname für Anrede'}"

# ── Optional mit Defaults ─────────────────────────────────────────────────────
SALUTATION="${SALUTATION:-Hallo $FIRST_NAME}"
FROM_EMAIL="${FROM_EMAIL:-servus@blitzsicht.com}"
FROM_NAME="${FROM_NAME:-Johannes-Maximilian Gottl}"
FROM_PHONE="${FROM_PHONE:-+49 173 7215679}"
FROM_DOMAIN="${FROM_DOMAIN:-blitzsicht.com}"
SUBJECT="${SUBJECT:-Ihre neue E-Mail-Signatur — bereit zum Einbauen}"
OUT_DIR="${OUT_DIR:-/tmp/customer-mails}"

mkdir -p "$OUT_DIR"

# ── Slug aus SIG_DIR ableiten ────────────────────────────────────────────────
SLUG=$(basename "$SIG_DIR")
HTML_PATH="$SIG_DIR/$SLUG.html"
TXT_PATH="$SIG_DIR/$SLUG.txt"

[ -f "$HTML_PATH" ] || { echo "ABORT: $HTML_PATH fehlt"; exit 1; }
[ -f "$TXT_PATH" ]  || { echo "ABORT: $TXT_PATH fehlt"; exit 1; }

EML_OUT="$OUT_DIR/$SLUG.eml"
PREVIEW_OUT="$OUT_DIR/$SLUG-preview.html"

echo "→ Generiere Mail-Versand für: $TO_NAME <$TO_EMAIL>"
echo "  Signatur-Source: $SIG_DIR"
echo "  Output:          $OUT_DIR/"

# ── vCard (.vcf) generieren — aus Signatur-Files extrahieren ──────────────────
VCARD_PATH="$SIG_DIR/$SLUG.vcf"
if [ ! -f "$VCARD_PATH" ]; then
  # Extrahiere Daten aus der HTML-Signatur (Person der die Mail GEHÖRT, nicht Empfänger)
  # SIG_HTML contains person's NAME/POSITION/EMAIL/PHONE/COMPANY etc.
  SIG_NAME=$( { grep -oE 'class="esig-name"[^>]*>[^<]+' "$HTML_PATH" || true; } | sed -E 's|.*>||' | head -1)
  SIG_POSITION=$( { grep -oE 'class="esig-position"[^>]*>[^<]+' "$HTML_PATH" || true; } | sed -E 's|.*>||' | head -1)
  SIG_COMPANY=$( { grep -oE 'class="esig-company"[^>]*>[^<]+' "$HTML_PATH" || true; } | sed -E 's|.*>||' | head -1)
  SIG_EMAIL=$( { grep -oE 'mailto:[^"]+' "$HTML_PATH" || true; } | head -1 | sed 's|mailto:||')
  SIG_PHONE=$( { grep -oE 'tel:[^"]+' "$HTML_PATH" || true; } | head -1 | sed 's|tel:||')
  SIG_WEB=$( { grep -oE 'href="https?://[^"]+' "$HTML_PATH" || true; } | { grep -v 'mailto:' || true; } | { grep -v 'tel:' || true; } | head -1 | sed -E 's|^href="||')

  cat > "$VCARD_PATH" <<VCARDEOF
BEGIN:VCARD
VERSION:3.0
FN:${SIG_NAME:-$TO_NAME}
ORG:${SIG_COMPANY:-}
TITLE:${SIG_POSITION:-}
TEL;TYPE=WORK,VOICE:${SIG_PHONE:-}
EMAIL;TYPE=WORK:${SIG_EMAIL:-}
URL:${SIG_WEB:-}
END:VCARD
VCARDEOF
  echo "  ✓ $SLUG.vcf (vCard)"
fi

# vCard auch public hosten (für "Kontakt speichern"-Link in Sig).
# SIG_DIR-Struktur: customer-X/email-signatures/<slug>/ → public/email/ liegt 2 Ebenen höher.
CUSTOMER_REPO_ROOT=$(cd "$SIG_DIR/../.." 2>/dev/null && pwd)
if [ -n "$CUSTOMER_REPO_ROOT" ] && [ -d "$CUSTOMER_REPO_ROOT/public/email" ]; then
  cp "$VCARD_PATH" "$CUSTOMER_REPO_ROOT/public/email/$SLUG.vcf"
  echo "  ✓ public/email/$SLUG.vcf"
fi

# ── .eml via Python (zuverlässiges MIME-Encoding) ─────────────────────────────
python3 - "$HTML_PATH" "$TXT_PATH" "$SLUG" "$FROM_NAME" "$FROM_EMAIL" \
             "$TO_NAME" "$TO_EMAIL" "$SALUTATION" "$SUBJECT" "$EML_OUT" \
             "$FROM_PHONE" "$FROM_DOMAIN" "$VCARD_PATH" <<'PYEOF'
import sys, os
from email.message import EmailMessage
from email.utils import make_msgid, formatdate
from pathlib import Path

(html_path, txt_path, slug, from_name, from_email, to_name, to_email,
 salutation, subject, eml_out, from_phone, from_domain, vcard_path) = sys.argv[1:14]

html_sig = Path(html_path).read_text(encoding="utf-8")
txt_sig = Path(txt_path).read_text(encoding="utf-8")

msg = EmailMessage()
msg["From"] = f"{from_name} <{from_email}>"
msg["To"] = f"{to_name} <{to_email}>"
msg["Subject"] = subject
msg["Date"] = formatdate(localtime=True)
msg["Message-ID"] = make_msgid(domain=from_domain)

plain_body = f"""{salutation},

anbei deine neue E-Mail-Signatur — abgestimmt auf deinen Webauftritt
(Brand-Farben, Logo) und mit allen Pflichtangaben nach §35a HGB.

EINBAU IN OUTLOOK (WEB):
1. Einstellungen → Mail → Verfassen und antworten → E-Mail-Signatur
2. Auf das </>-Quelltext-Icon klicken
3. HTML aus der Anlage einfügen, speichern

EINBAU IN APPLE MAIL (macOS):
1. Mail → Einstellungen → Signaturen → "+" für neue
2. „Schriftart und Farbe der Standardnachricht beibehalten" deaktivieren
3. Im Mac-Finder: ~/Library/Mail/V*/MailData/Signatures/
4. Neueste .mailsignature-Datei mit TextEdit (HTML-Modus) öffnen
5. HTML-Inhalt aus der Anlage hineinkopieren und speichern

EINBAU IN GMAIL WEB:
1. Einstellungen (Zahnrad) → Alle Einstellungen anzeigen
2. Tab "Allgemein" → ganz nach unten zu „Signatur"
3. HTML aus der Anlage einfügen — Gmail rendert direkt

Bei Fragen einfach kurz auf diese Mail antworten.

Viele Grüße
{from_name} · Blitzsicht
{from_email} · {from_phone}
https://{from_domain}
"""

html_intro = f"""<html><body style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.55;color:#1f2937;max-width:580px;">
<p>{salutation},</p>
<p>anbei deine neue E-Mail-Signatur — abgestimmt auf deinen Webauftritt (Brand-Farben, Logo) und mit allen Pflichtangaben nach §35a HGB.</p>
<p><strong>Vorschau:</strong></p>
<div style="border:1px solid #e5e7eb;border-radius:6px;padding:20px;margin:15px 0;background:#fafafa;">
{html_sig}
</div>
<p><strong>Einbau-Anleitung:</strong></p>
<ul style="line-height:1.7;">
<li><strong>Outlook Web:</strong> Einstellungen → Mail → Verfassen und antworten → E-Mail-Signatur → <code>&lt;/&gt;</code>-Icon → HTML aus Anlage einfügen</li>
<li><strong>Apple Mail (macOS):</strong> Mail → Einstellungen → Signaturen → "+" → „Standardschriftart beibehalten" aus → HTML aus Anlage</li>
<li><strong>Gmail Web:</strong> Einstellungen → Allgemein → Signatur → HTML einfügen (rendert direkt)</li>
</ul>
<p>Bei Fragen einfach kurz antworten.</p>
<p>Viele Grüße<br>
{from_name} · Blitzsicht<br>
<a href="mailto:{from_email}">{from_email}</a> · {from_phone}<br>
<a href="https://{from_domain}">{from_domain}</a></p>
</body></html>"""

msg.set_content(plain_body, charset="utf-8")
msg.add_alternative(html_intro, subtype="html")

with open(html_path, "rb") as f:
    msg.add_attachment(f.read(), maintype="text", subtype="html", filename=f"{slug}.html")
with open(txt_path, "rb") as f:
    msg.add_attachment(f.read(), maintype="text", subtype="plain", filename=f"{slug}.txt")
if vcard_path and os.path.exists(vcard_path):
    with open(vcard_path, "rb") as f:
        msg.add_attachment(f.read(), maintype="text", subtype="vcard", filename=f"{slug}.vcf")

Path(eml_out).write_bytes(bytes(msg))
print(f"  ✓ {os.path.basename(eml_out)} ({os.path.getsize(eml_out)} bytes)")
PYEOF

# ── HTML-Preview (Mail-Window-Optik im Browser) ───────────────────────────────
# Cache-Busting: MD5-Hash der preview.css (erste 8 Zeichen)
PREVIEW_CSS_SRC="$SCRIPT_DIR/preview.css"
PREVIEW_CSS_HASH=$(md5sum "$PREVIEW_CSS_SRC" 2>/dev/null | cut -c1-8 || md5 -q "$PREVIEW_CSS_SRC" 2>/dev/null | cut -c1-8 || echo "00000000")

cat > "$PREVIEW_OUT" <<HTMLEOF
<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Mail-Preview: $SLUG</title>
<link rel="stylesheet" href="preview.css?v=${PREVIEW_CSS_HASH}">
<script>
  // Beim Load: pro <picture> die Light + Dark URLs cachen für Toggle
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.sig-preview picture').forEach(pic => {
      const source = pic.querySelector('source[media*="dark"]');
      const img = pic.querySelector('img');
      if (source && img) {
        img.dataset.lightSrc = img.src;
        img.dataset.darkSrc = source.srcset;
      }
    });
  });
  function toggleTheme() {
    document.body.classList.toggle('dark');
    const isDark = document.body.classList.contains('dark');
    document.getElementById('theme-btn').textContent = isDark ? '☀ Light Mode' : '🌙 Dark Mode';
    // Picture-Tag manuell switchen für Preview (echtes <picture> reagiert nur auf OS-prefers-color-scheme)
    document.querySelectorAll('.sig-preview picture img').forEach(img => {
      const target = isDark ? img.dataset.darkSrc : img.dataset.lightSrc;
      if (target) img.src = target;
    });
  }
</script>
</head><body>
<button id="theme-btn" class="theme-toggle" onclick="toggleTheme()">🌙 Dark Mode</button>
<div class="mail-window">
  <div class="mail-header">
    <div><strong>Von:</strong> $FROM_NAME &lt;$FROM_EMAIL&gt;</div>
    <div><strong>An:</strong> $TO_NAME &lt;$TO_EMAIL&gt;</div>
    <div><strong>Betreff:</strong> $SUBJECT</div>
  </div>
  <div class="mail-body">
    <p>$SALUTATION,</p>
    <p>anbei deine neue E-Mail-Signatur — abgestimmt auf deinen Webauftritt (Brand-Farben, Logo) und mit allen Pflichtangaben nach §35a HGB.</p>
    <p><strong>Vorschau:</strong></p>
    <div class="sig-preview">
HTMLEOF
cat "$HTML_PATH" >> "$PREVIEW_OUT"
cat >> "$PREVIEW_OUT" <<HTMLEOF
    </div>
    <p><strong>Einbau-Anleitung:</strong></p>
    <ul>
      <li><strong>Outlook Web:</strong> Einstellungen → Mail → Verfassen → Signatur → <code>&lt;/&gt;</code>-Icon → HTML aus Anlage einfügen</li>
      <li><strong>Apple Mail (macOS):</strong> Mail → Einstellungen → Signaturen → "+" → "Standardschrift beibehalten" aus → HTML aus Anlage</li>
      <li><strong>Gmail Web:</strong> Einstellungen → Allgemein → Signatur → HTML einfügen</li>
    </ul>
    <p>Bei Fragen einfach kurz antworten.</p>
    <p>Viele Grüße<br>$FROM_NAME · Blitzsicht</p>
  </div>
  <div class="attachments">📎 <strong>Anhänge:</strong> <code>$SLUG.html</code> · <code>$SLUG.txt</code> · <code>$SLUG.vcf</code></div>
</div></body></html>
HTMLEOF

echo "  ✓ $(basename "$PREVIEW_OUT") (Browser-Preview)"
echo ""
echo "Anschauen:"
echo "  open $PREVIEW_OUT       # Browser-Preview"
echo "  open $EML_OUT           # Mail-Entwurf in Apple Mail/Outlook"
