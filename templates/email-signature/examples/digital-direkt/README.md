# E-Mail-Signatur: Melanie Steller

Digital-Direkt GmbH | Vertrieb & Kundenbetreuung
Generiert 2026-05-12 als erstes Referenzbeispiel fuer cw-core Email-Signatur Template.

## Dateien

- `melanie-steller.html` — HTML-Signatur (Outlook-kompatibel, Tabellen-Layout)
- `melanie-steller.txt` — Plain-Text-Fallback
- `assets/logo.png` — Logo 200px breit (aus public/logo.svg via ImageMagick)

## Farben (aus tokens.css)

- Primaer: `#312783` (Blau — Name, Tel-Link, Logo-Trennlinie)
- Akzent: `#3d7a12` (Gruen — Web-Link, Trennstreifen)

## Logo-Hosting

Logo liegt unter `public/email/logo.png` im customer-digital-direkt Repo.
Vercel deployed es automatisch unter:
```
https://digital-direkt.com/email/logo.png
```

## Einbinden

### Outlook Web (OWA)
1. Einstellungen (Zahnrad) → Alle Outlook-Einstellungen → E-Mail → Verfassen und Antworten
2. E-Mail-Signatur → "Neue Signatur"
3. Namen eingeben: "Melanie Steller"
4. `melanie-steller.html` in einem Browser oeffnen → Inhalt komplett markieren (Strg+A) → kopieren
5. In das Signatur-Feld einfuegen
6. Als Standard-Signatur setzen → Speichern

### Apple Mail
1. Mail → Einstellungen (Cmd+,) → Signaturen
2. Linke Spalte: "Alle Signaturen" → "+" klicken
3. Name: "Melanie Steller"
4. `melanie-steller.html` in Safari oeffnen → alles markieren → kopieren
5. In das rechte Signatur-Feld einfuegen
6. Signatur dem E-Mail-Account zuweisen

### Gmail
1. Einstellungen → Alle Einstellungen → Allgemein → Signatur
2. "Neue erstellen" → Name: "Melanie Steller"
3. `melanie-steller.html` in Chrome oeffnen → Strg+A → Strg+C
4. Im Gmail-Signatur-Editor: Strg+V einfuegen
5. Speichern

### Outlook Desktop (Windows, 2016/2019/365)
1. Datei → Optionen → E-Mail → Signaturen
2. Neu → Name: "Melanie Steller"
3. Im HTML-Editor (Quelle/Source): Inhalt von `melanie-steller.html` einfuegen
4. Alternativ: .html-Datei als .htm speichern und per Insert -> File einfuegen

## §35a HGB Pflichtangaben (verifiziert)

- Firma: Digital-Direkt GmbH
- Rechtsform: GmbH
- Sitz: Von-Miller-Strasse 2, 93092 Barbing-Unterheising
- Registergericht: Amtsgericht Regensburg
- HRB: 11164
- Geschaeftsfuehrer: Markus Steller
- USt-IdNr.: DE 262224662
