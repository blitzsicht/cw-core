# cw-core E-Mail-Signaturen

Standard-Service für alle Blitzsicht-Customer-Sites.

## Konzept

Jede Customer-Site bekommt auf Wunsch vollstaendig fertige E-Mail-Signaturen:
- HTML-Signatur (Outlook-kompatibel, Tabellen-Layout, ~580px)
- Plain-Text-Fallback
- Logo als PNG (Cross-Client-kompatibel, gehostet unter `/email/logo.png`)
- Einbauanleitung pro Mail-Client
- §35a HGB Pflichtangaben automatisch aus `siteData.legal`

## Output-Struktur (pro Customer)

```
customer-<name>/
  email-signatures/
    <person>.html        — HTML-Signatur (Outlook-kompatibel)
    <person>.txt         — Plain-Text-Fallback
    assets/logo.png      — Logo-PNG fuer E-Mail-Client
    README.md            — Einbauanleitung + Compliance-Check
  public/email/
    logo.png             — Oeffentlich gehostetes Logo (Vercel)
```

## Neue Signatur generieren

### 1. Variablen setzen

```bash
export NAME="Max Mustermann"
export POSITION="Vertrieb"
export EMAIL="max@meine-firma.de"
export PHONE="+49 123 456789"
export WEBSITE_URL="meine-firma.de"
export COLOR_PRIMARY="#312783"
export COLOR_ACCENT="#3d7a12"
export COMPANY_NAME="Meine Firma GmbH"
export LEGAL_FORM="GmbH"
export GF_NAME="Max Mustermann"
export STREET="Musterstrasse 1"
export ZIP_CITY="93092 Musterstadt"
export HRB="HRB 12345"
export REGISTERGERICHT="Amtsgericht Musterstadt"
export UST_ID="DE 123456789"
export LOGO_SVG="public/logo.svg"
export LOGO_URL="https://meine-firma.de/email/logo.png"
export OUT_DIR="email-signatures/max-mustermann"
```

### 2. Generator ausfuehren

```bash
bash templates/email-signature/generate.sh
```

### 3. Outputs pruefen

```
email-signatures/max-mustermann/
  max-mustermann.html
  max-mustermann.txt
  assets/logo.png
  README.md
public/email/logo.png
```

## PNG-Pipeline

Automatische Erkennung in dieser Reihenfolge:

1. `rsvg-convert` (beste Qualitaet) — `brew install librsvg`
2. `inkscape` — `brew install inkscape`
3. `convert` / `magick` (ImageMagick) — `brew install imagemagick`
4. Fallback: 1x1 Placeholder-PNG mit Hinweis

## Compliance-Check (§35a HGB)

Fuer GmbH/AG sind diese Angaben Pflicht in jeder geschaeftlichen E-Mail:

| Feld             | Variable          | Pflicht GmbH | Pflicht EU |
|------------------|-------------------|:---:|:---:|
| Firma            | `COMPANY_NAME`    | ✓  | ✓  |
| Rechtsform       | `LEGAL_FORM`      | ✓  | ✓  |
| Sitz             | `STREET`+`ZIP_CITY` | ✓ | ✓  |
| Registergericht  | `REGISTERGERICHT` | ✓  | ✓  |
| HRB-Nummer       | `HRB`             | ✓  | ✓  |
| Geschaeftsfuehrer| `GF_NAME`         | ✓  | —  |
| USt-IdNr.        | `UST_ID`          | (1)| ✓  |

(1) Nur wenn USt-IdNr. vorhanden — nach §27a UStG.

Einzelunternehmen / Freiberufler: Nur Name, Anschrift, ggf. USt-IdNr.

## Erstes Referenzbeispiel

`examples/digital-direkt/` — Digital-Direkt GmbH, Melanie Steller (2026-05-12)

- Farben: `#312783` (Primaer, Blau) / `#3d7a12` (Akzent, Gruen)
- Logo: `examples/digital-direkt/assets/logo.png` (200px breit)
- Vollstaendig mit §35a HGB Pflichtangaben

## Integration in Captain-Workflow

Der Captain triggert den Generator nach Customer-Onboarding:

```
Captain → cw-email-signature generieren → PR in customer-<name>
```

Voraussetzungen: `siteData.legal` vollstaendig ausgefuellt (via cw-onboard).

## Vorlagen

- `PERSON.html.template` — HTML-Basis mit allen `{{PLATZHALTER}}`
- `PERSON.txt.template` — Plain-Text-Fallback
- `generate.sh` — Automatischer Generator

## Bekannte Mail-Client-Limits

| Client         | HTML | PNG inline | PNG extern | Empfehlung |
|---------------|:----:|:----------:|:----------:|------------|
| Outlook 2016+ | ✓   | —         | ✓         | Extern hosten |
| Outlook Web   | ✓   | ✓         | ✓         | Beides ok  |
| Apple Mail    | ✓   | ✓         | ✓         | Inline oder extern |
| Gmail         | ✓   | —         | ✓ (1)    | Extern hosten |
| Thunderbird   | ✓   | ✓         | ✓         | Beides ok  |

(1) Gmail laedt externe Bilder erst nach User-Bestaetigung.
    Logo unter eigenem Domain (nicht Google CDN) verbessert Trust-Score.

## Warum Tabellen-Layout?

Outlook (Desktop, Windows) rendert kein CSS Flexbox/Grid. Tabellen sind der
einzige zuverlaessige Cross-Client-Standard fuer HTML-E-Mails (2026).
Max-Width: 580px (Outlook-Safe).

## End-to-End-Pipeline: `onboard-person.sh`

Komplett-Workflow für eine neue Person (z.B. neuer Mitarbeiter bei einem Customer):

```bash
cd cw-core/templates/email-signature

CUSTOMER_REPO=/path/to/customer-blitzsicht \
NAME="Max Mustermann" SLUG=max-mustermann \
POSITION="Geschäftsführer" \
EMAIL=max@meine-firma.de PHONE="+49 123 456789" \
WEBSITE_URL=meine-firma.de \
COLOR_PRIMARY=#312783 COLOR_ACCENT=#3d7a12 \
COMPANY_NAME="Meine Firma GmbH" LEGAL_FORM=GmbH GF_NAME="Max Mustermann" \
STREET="Straße 1" ZIP_CITY="93000 Stadt" \
HRB="HRB 12345" REGISTERGERICHT="Amtsgericht Stadt" UST_ID=DE123456 \
LOGO_SVG=$CUSTOMER_REPO/public/logo.svg \
LOGO_URL=https://meine-firma.de/email/logo.png \
TO_EMAIL=max@meine-firma.de FIRST_NAME=Max \
SALUTATION="Hallo Max" \
./onboard-person.sh
```

Output:
- `customer-X/email-signatures/<slug>/` (HTML, TXT, README, MAIL-VORLAGE.md, assets/logo.png)
- `/tmp/customer-mails/<slug>.eml` (versandfertige Mail mit Anhängen)
- `/tmp/customer-mails/<slug>-preview.html` (Browser-Vorschau)

Optional `COMMIT=true` → auto git add + commit + push.

## Nur Mail erzeugen (Signatur existiert schon)

```bash
SIG_DIR=customer-X/email-signatures/max-mustermann \
TO_EMAIL=max@meine-firma.de TO_NAME="Max Mustermann" FIRST_NAME=Max \
SALUTATION="Hallo Max" \
./generate-mail.sh
```

## Versand-Workflow

1. `onboard-person.sh` oder `generate-mail.sh` ausführen
2. `open /tmp/customer-mails/<slug>-preview.html` → Browser-Preview prüfen
3. Wenn ok: `open /tmp/customer-mails/<slug>.eml` → Apple Mail / Outlook öffnet als Entwurf
4. Vor dem Senden: ggf. Anrede anpassen (Du/Sie), Subject prüfen
5. ⌘+Shift+D (Apple Mail) bzw. „Senden"-Button (Outlook)

## UTM-Tracking

`onboard-person.sh` baut automatisch UTM-Params am Web-Link ein:
```
https://<domain>?utm_source=email-signature&utm_medium=email&utm_campaign=<slug>
```

Plausible misst Klicks pro Mitarbeiter automatisch (DSGVO-clean — nur Click-Tracking, kein Pixel).

Deaktivieren: `SKIP_UTM=true ./onboard-person.sh ...`

## Bekannte Cosmetic-Bugs (zu fixen)

- Umlaute im Slug werden gestripped statt transliteriert (`Pöppl` → `nico-pppl`). Workaround: SLUG-Var manuell setzen (z.B. `SLUG=nico-poeppl`).
- Bei `LEGAL_FORM=Einzelunternehmen` und leerem `GF_NAME` wird trotzdem „GF:"-Zeile mit leerem Wert gerendert. Manueller HTML-Fix oder Template-Patch.
- Bei leerem `HRB` und gesetztem `REGISTERGERICHT` bleibt „Amtsgericht xy ·"-Separator stehen.

## Customer mit Apex auf KAS (nicht Vercel)

Wenn Custom-Domain-Apex nicht auf Vercel zeigt (Donau-Profi, Weinkontor-Sinzing): `LOGO_URL` auf die Vercel-Auto-URL setzen:
```bash
LOGO_URL=https://customer-<name>.vercel.app/email/logo.png
```

Vorab prüfen: `dig +short A <domain>` → 76.76.21.21 oder 216.198.79.1 = Vercel.
