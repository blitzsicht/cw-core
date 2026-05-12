# cw-core E-Mail-Signaturen

Standard-Service für alle Blitzsicht-Customer-Sites.

## Quick-Start (v6 — fully data-driven)

**Neuer Mitarbeiter, neue Signatur, alle Sigs frisch generieren:**

```bash
# 1. Person in customer-X/src/data/site-data.ts persons[]-Array hinzufügen
# 2. Generator laufen lassen:
cd cw-core && pnpm sig:regenerate
# → /tmp/cw-sigs/<slug>.eml + Preview für jede Person aller Customer
```

**Einzel-Customer / Einzel-Person:**

```bash
ONLY_CUSTOMER=customer-soleno pnpm sig:regenerate
ONLY_SLUG=markus-steller pnpm sig:regenerate
```

## Architektur

| Komponente | Zweck |
|---|---|
| `regenerate-all.sh` | Master-Orchestrator. Auto-Discovery aller `customer-*` Dirs, Loop über `persons[]`. |
| `read-customer-data.py` | SSOT-Reader. Liest `legal/gmb/booking` aus `site-data.ts` + `--color-primary/-accent` aus `tokens.css`. `--list-persons`-Flag für JSON-Output der Personen-Liste. |
| `generate.sh` | Kern-Generator. ENV → Template-Replacement → HTML/TXT/PNG. Hybrid-Color-Swap, Aspect-Ratio-Layout-Detection. |
| `generate-mail.sh` | Bündelt fertige Sig zu `.eml` + Browser-Preview. Auto-extracted vCard (.vcf) als 3. Anhang. |
| `onboard-person.sh` | Legacy: einzelne Person manuell mit ENV-Vars. Heute selten nötig (besser: persons[] in site-data.ts + regenerate-all). |
| `persons.schema.json` | JSON-Schema für `persons[]`-Array in customer-X/src/data/site-data.ts. |
| `persons.d.ts` | TypeScript-Type `EmailSigPerson` für IDE-Autocomplete in site-data.ts. |

## persons[]-Schema

In `customer-X/src/data/site-data.ts`:

```ts
import type { EmailSigPerson } from '@cw/core/templates/email-signature/persons';

const data = {
  // ...
  persons: [
    {
      slug: 'markus-steller',                    // URL-safe ID, wird Dateiname
      name: 'Markus Steller',                    // Anzeigename
      position: 'Geschäftsführer',
      email: 'markus.steller@digital-direkt.com',
      phone: '+49 9401 53959-20',
      layout: 'a',                               // 'a' (Logo links) | 'b' (Logo oben) | 'auto'
      salutation: 'Hallo Markus',                // Anrede in Begleitmail
    },
  ] as const satisfies readonly EmailSigPerson[],
};
```

Pflicht: `slug`, `name`, `email`. Alle anderen Felder optional.

## UTM-Klick-Tracking (v6.3)

Jeder klickbare Link in der Sig hat UTM-Params. Plausible erfasst beim Klick automatisch Source + Campaign.

| Link in Sig | UTM-Schema |
|---|---|
| Web-URL (`firma.de`) | `?utm_source=email-signature&utm_medium=email&utm_campaign=<slug>-web` |
| vCard-Download | `?...&utm_campaign=<slug>-vcard` |
| GMB-Review-CTA | `?...&utm_campaign=<slug>-review` |
| Booking-URL | `?...&utm_campaign=<slug>-booking` |
| `mailto:`/`tel:` | — (Schema ignoriert Query-Params) |

**Plausible-Dashboard-Auswertung pro Customer-Site:**
- *Sources* → Filter `email-signature` → Sig-Klicks total
- *Campaigns* → `<slug>-web` vs. `<slug>-review` → pro Mitarbeiter individuell auswertbar
- "Wer bringt am meisten Traffic?" wird damit messbar

**DSGVO-Status:** ✓ konform. Plausible ist cookieless + IP-anonymisiert. UTM ist Marketing-Standard (Branchenkonvention), kein personenbezogenes Tracking.

## Public-Hosting (v6.1)

Die Pipeline kopiert pro Person zusätzlich nach `<customer>/public/email/`:

| File | URL | Use-Case |
|---|---|---|
| `logo*.png` | `https://firma.de/email/logo.png` | Mail-Client lädt Logo aus HTML-Sig |
| `<slug>.vcf` | `https://firma.de/email/<slug>.vcf` | "📇 Kontakt speichern (vCard)"-Link in Sig |
| `<slug>.html` | `https://firma.de/email/<slug>.html` | Browser-Vorschau / Copy-Paste-Workflow |
| `<slug>-install.html` | `https://firma.de/email/<slug>-install.html` | **Install-Page**: Vorschau + Copy-Buttons (visuell + HTML-Source) + Einbau-Anleitung pro Mail-Client |

`regenerate-all.sh` setzt automatisch `VCARD_PUBLIC_URL=$LOGO_URL_HOST/email/$SLUG.vcf`. Der "Kontakt speichern"-Link erscheint nur wenn diese Var gesetzt ist (Opt-in über Pipeline).

**Robots-Block:** Pro Customer ist `Disallow: /email/` in `public/robots.txt`. Verhindert SEO-Indexierung. Mail-Clients ignorieren robots.txt → Logo-Loading bleibt funktionsfähig.

**Sitemap:** Public-Files (`/email/*`) sind nie in `sitemap.xml` (Astro-Default für statische Files). Kein Eingriff nötig.

## Was wird automatisch gezogen?

Aus `customer-X/src/data/site-data.ts`:
- `legal.{form, owner, street, zip, city, phone, email, ustIdNr, handelsregister, registergericht}` → §35a HGB Compliance-Block
- `gmb.review_url` → Google-Bewertungs-CTA mit UTM
- `booking.{url, label}` → Booking-Button (z.B. Cal.com)

Aus `customer-X/src/styles/tokens.css`:
- `--color-primary` → Brand-Primary in Sig (Trennlinien, Headline)
- `--color-accent` → Brand-Accent in Sig (Akzent-Strich, Web-Link, GMB-CTA-Background)

Konsequenz: Adressänderung im Impressum → Sig regeneriert mit der neuen Adresse, ohne Pipeline-Code-Touch.

## Lessons Learned (v4 → v5 → v6)

- **NIE Customer-Daten im Orchestrator hardcoden.** v4 hatte 7/9 Customer falsche Adressen + CI-Farben (Soleno bekam DD-Lila statt Schwarz/Gelb). v5 löste mit SSOT-Pattern.
- **Person-Daten gehören in den Customer-Repo**, nicht ins Pipeline-Script. v6 löste mit `persons[]` in site-data.ts.
- **Auto-Discovery** statt hardcoded Customer-Liste: Pipeline scannt `customer-*` Dirs selbst.

## Legacy

`examples/orchestrate-portfolio.sh` ist deprecated — nutze stattdessen `pnpm sig:regenerate`.

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
