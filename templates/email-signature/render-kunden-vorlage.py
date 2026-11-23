#!/usr/bin/env python3
"""Setzt die Werte einer Person in eine Kundenvorlage ein (`layout: 'kunde'`).

Aufruf (aus generate.sh):
  render-kunden-vorlage.py <vorlage> NAME=… POSITION=… …   → fertiges HTML auf stdout
  render-kunden-vorlage.py --liste                          → alle Platzhalter, je Zeile „NAME<TAB>Beschreibung“

Regeln:
- Jeder Platzhalter aus PLATZHALTER muss als KEY=VALUE übergeben werden, kein
  anderer. Fehlt einer, ist generate.sh nicht nachgezogen worden — Exit 3, nicht
  still leer.
- Steht in der Vorlage ein `{{…}}`, das es nicht gibt (Tippfehler wie
  `{{REGISTER_NUMMER}}`), bricht das Skript mit Exit 2 ab und nennt den Namen.
  Leer ersetzen hieße: eine Pflichtangabe fehlt in der Signatur, und keiner merkt es.
- Ist ein Wert leer, den die Vorlage benutzt, wird er leer eingesetzt und je
  Platzhalter einmal auf stderr gewarnt. Im Ergebnis steht nie ein `{{…}}`.
- Werte werden roh eingesetzt wie bei den eingebauten Layouts (sed in
  generate.sh): `PHOTO_BLOCK`, `COMPLIANCE_BLOCK` und `EXTRAS_BLOCK` sind HTML.
"""
import re
import sys
from pathlib import Path

# Reihenfolge = Reihenfolge in README und --liste. Namen wie die Shell-Variablen
# in generate.sh, so wie bei den eingebauten Layouts ({{NAME}} ↔ $NAME).
PLATZHALTER = (
    # bestehend (auch in Layout a/b)
    ("NAME", "Anzeigename der Person (persons[].name)"),
    ("POSITION", "Position der Person (persons[].position)"),
    ("EMAIL", "E-Mail der Person (persons[].email)"),
    ("PHONE", "Telefon der Person (persons[].phone)"),
    ("WEBSITE_URL", "Domain zur Anzeige, ohne https:// (siteData.url)"),
    ("WEBSITE_FULL", "volle Website-URL mit UTM-Parametern, für href"),
    ("COLOR_PRIMARY", "Primärfarbe (--color-primary aus tokens.css)"),
    ("COLOR_ACCENT", "Akzentfarbe (--color-accent aus tokens.css)"),
    ("COMPANY_NAME", "Firmen-/Markenname (siteData.name)"),
    ("LOGO_URL", "öffentliche Logo-URL (…/email/logo.png)"),
    ("LOGO_URL_LIGHT", "Logo für helle Darstellung (…/email/logo-light.png, mit Animation die APNG)"),
    ("LOGO_URL_DARK", "Logo für dunkle Darstellung (…/email/logo-dark.png)"),
    ("LOGO_ALT", "Alternativtext des Logos (Standard: COMPANY_NAME)"),
    ("COMPLIANCE_BLOCK", "fertiger HTML-Block Pflichtangaben (Adresse, Rechtsform, GF, Register, USt-IdNr.)"),
    ("CONFIDENTIALITY_NOTE", "Vertraulichkeitshinweis (derselbe Satz wie in der Textfassung)"),
    ("EXTRAS_BLOCK", "fertiger HTML-Block Termin-/Bewertungsknopf und vCard-Link"),
    ("PHOTO_BLOCK", "fertiger HTML-Block Porträt (110 px rund), leer ohne persons[].photo"),
    # neu mit layout 'kunde'
    ("PHOTO_URL", "nackte Porträt-URL (persons[].photo)"),
    ("PHOTO_ALT", "Alternativtext des Porträts (Standard: NAME)"),
    ("COMPANY_LEGAL_NAME", "Firmenname mit Rechtsform (legal.owner, wenn er die Rechtsform trägt, sonst Name + Rechtsform)"),
    ("LEGAL_FORM", "Rechtsform (legal.form)"),
    ("STREET", "Straße und Hausnummer (legal.street)"),
    ("ZIP", "Postleitzahl (legal.zip)"),
    ("CITY", "Ort (legal.city)"),
    ("ZIP_CITY", "PLZ und Ort (legal.zip + legal.city)"),
    ("REGISTERGERICHT", "Registergericht (legal.registerCourt / registergericht)"),
    ("HRB", "vollständige Registernummer mit Art (legal.registerNumber, z. B. „HRB 21336“)"),
    ("REGISTER_ART", "Registerart aus der Registernummer (z. B. „HRB“)"),
    ("REGISTER_NR", "Nummer ohne Registerart (z. B. „21336“)"),
    ("REPRESENTATIVES", "Geschäftsführer/Vertretungsberechtigte, kommagetrennt (legal.representatives)"),
    ("UST_ID", "USt-IdNr. (legal.ustIdNr)"),
    ("PHONE_TEL", "Telefon der Person für href=\"tel:\", nur „+“ und Ziffern"),
    ("PHONE_NATIONAL", "Telefon der Person zur Anzeige, +49 als führende 0 („0151 25073136“)"),
    ("COMPANY_PHONE", "Firmennummer (legal.phone, sonst contact.phone), wie in site-data geschrieben"),
    ("COMPANY_PHONE_TEL", "Firmennummer für href=\"tel:\", nur „+“ und Ziffern"),
)
NAMEN = tuple(n for n, _ in PLATZHALTER)

# Alles, was wie ein Platzhalter aussieht — auch `{{ name }}` oder `{{Name}}`.
KANDIDAT = re.compile(r"\{\{(.*?)\}\}", re.S)


def fehler(text, code):
    print(f"✗ render-kunden-vorlage: {text}", file=sys.stderr)
    sys.exit(code)


def main(argv):
    if argv[:1] == ["--liste"]:
        for name, beschreibung in PLATZHALTER:
            print(f"{name}\t{beschreibung}")
        return 0
    if len(argv) < 1:
        fehler("Aufruf: render-kunden-vorlage.py <vorlage> KEY=VALUE … | --liste", 1)

    vorlage = Path(argv[0])
    if not vorlage.is_file():
        fehler(f"Vorlage fehlt: {vorlage}", 1)

    werte = {}
    for paar in argv[1:]:
        key, sep, value = paar.partition("=")
        if not sep:
            fehler(f"Argument ohne '=': {paar!r}", 3)
        werte[key] = value
    fehlen = [n for n in NAMEN if n not in werte]
    fremd = sorted(k for k in werte if k not in NAMEN)
    if fehlen or fremd:
        fehler(
            "generate.sh und Platzhalterliste laufen auseinander — "
            f"nicht übergeben: {', '.join(fehlen) or '–'}; unbekannt übergeben: {', '.join(fremd) or '–'}",
            3,
        )

    text = vorlage.read_text(encoding="utf-8")
    benutzt = []
    unbekannt = []
    for m in KANDIDAT.finditer(text):
        inhalt = m.group(1)
        if inhalt in NAMEN:
            if inhalt not in benutzt:
                benutzt.append(inhalt)
        elif m.group(0) not in unbekannt:
            unbekannt.append(m.group(0))
    if unbekannt:
        fehler(
            f"unbekannte Platzhalter in {vorlage}: {', '.join(unbekannt)}\n"
            f"  bekannt: {', '.join('{{' + n + '}}' for n in NAMEN)}",
            2,
        )
    # Eine offene Klammer ohne Gegenstück (`{{NAME` oder `NAME}}`) wäre sonst ein Rest im Ergebnis.
    rest = KANDIDAT.sub("", text)
    if "{{" in rest or "}}" in rest:
        fehler(f"unvollständiger Platzhalter in {vorlage} (einzelnes '{{{{' oder '}}}}')", 2)

    for name in benutzt:
        if not werte[name]:
            print(f"  ⚠ Platzhalter {{{{{name}}}}} ist leer (kein Wert in site-data) — leer eingesetzt", file=sys.stderr)

    # Ein Durchgang über die Vorlage: eingesetzte Werte werden nicht erneut abgesucht.
    ergebnis = KANDIDAT.sub(lambda m: werte[m.group(1)], text)
    sys.stdout.buffer.write(ergebnis.encode("utf-8"))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
