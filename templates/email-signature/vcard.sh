#!/usr/bin/env bash
# =============================================================================
# vCard schreiben — eine Quelle für generate-mail.sh und generate.sh
# =============================================================================
# generate-mail.sh liest die Werte für Layout a/b aus den esig-*-Klassen des
# fertigen HTML. Eine Kundenvorlage (layout 'kunde') hat diese Klassen nicht;
# generate.sh schreibt die vCard dort direkt aus den Daten. Damit beide Wege
# dieselbe Datei erzeugen, steht das Format nur hier.
#
# Nutzung (nach `source vcard.sh`):
#   vcard_schreiben <ziel.vcf> <FN> <ORG> <TITLE> <TEL> <EMAIL> <URL>
# =============================================================================

vcard_schreiben() {
  local ziel="$1" fn="$2" org="$3" title="$4" tel="$5" email="$6" url="$7"
  cat > "$ziel" <<VCARDEOF
BEGIN:VCARD
VERSION:3.0
FN:${fn}
ORG:${org}
TITLE:${title}
TEL;TYPE=WORK,VOICE:${tel}
EMAIL;TYPE=WORK:${email}
URL:${url}
END:VCARD
VCARDEOF
}
