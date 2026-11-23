# cw-core E-Mail-Signaturen

Standard-Service für alle Blitzsicht-Customer-Sites.

## Quick-Start (v6.5 — shared stylesheets)

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
| `regenerate-all.sh` | Master-Orchestrator. Auto-Discovery aller `customer-*` Dirs, Loop über `persons[]`. Kopiert `install.css` → `customer-*/public/email/` und `preview.css` → `/tmp/cw-sigs/`. |
| `read-customer-data.py` | SSOT-Reader. Liest `legal/gmb/booking` aus `site-data.ts` + `--color-primary/-accent` aus `tokens.css`. `--list-persons`-Flag für JSON-Output der Personen-Liste. |
| `generate.sh` | Kern-Generator. ENV → Template-Replacement → HTML/TXT/PNG. Hybrid-Color-Swap, Aspect-Ratio-Layout-Detection. Install-Page lädt CSS via `<link rel="stylesheet" href="/email/install.css?v=HASH">`. |
| `generate-mail.sh` | Bündelt fertige Sig zu `.eml` + Browser-Preview. Preview-Page lädt CSS via `<link href="preview.css?v=HASH">` (relativer Pfad in /tmp/cw-sigs/). |
| `render-kunden-vorlage.py` | Setzt bei `layout: 'kunde'` die Werte in die Vorlage des Kundenrepos ein. Hält die Platzhalterliste (`--liste`). Siehe [Kunden-Layout](#kunden-layout-layout-kunde). |
| `vcard.sh` | Das vCard-Format, eine Quelle für `generate-mail.sh` (Layout a/b) und `generate.sh` (Layout `kunde`). |
| `install.css` | **Single-Source** für alle Install-Pages (Browser-rendered). Brand-Farben via `var(--primary)` und `var(--accent)`. Style-Änderungen hier — nie inline in generate.sh. |
| `preview.css` | **Single-Source** für alle Mail-Preview-Pages (Browser-rendered). |
| `onboard-person.sh` | Legacy: einzelne Person manuell mit ENV-Vars. Heute selten nötig (besser: persons[] in site-data.ts + regenerate-all). |
| `persons.schema.json` | JSON-Schema für `persons[]`-Array in customer-X/src/data/site-data.ts. |
| `persons.d.ts` | TypeScript-Type `EmailSigPerson` für IDE-Autocomplete in site-data.ts. |

### Stylesheet-Architektur (v6.5)

```
cw-core/templates/email-signature/
  install.css      ← Single-Source für Install-Pages
  preview.css      ← Single-Source für Mail-Previews
  generate.sh      ← Brand-Farben inline (5 Zeilen), Rest via <link>
  generate-mail.sh ← preview.css via relativer <link>
  regenerate-all.sh← kopiert install.css/preview.css vor Person-Loop

customer-X/public/email/
  install.css       ← Kopie aus cw-core (1× pro Customer-Run)
  <slug>-install.html  ← Browser-rendered, lädt via <link>
  <slug>.html       ← Echte Sig (inline-CSS — Mail-Client-Pflicht!)

/tmp/cw-sigs/
  preview.css       ← Kopie aus cw-core (1× pro Regeneration)
  <slug>-preview.html  ← Browser-rendered, lädt via relativer <link>
```

**Style ändern:** Nur in `install.css` oder `preview.css` editieren, dann `pnpm sig:regenerate`. Alle Install-Pages und Customer-Repos bekommen das Update automatisch.

**Brand-Farben** (person-spezifisch) werden als minimaler Inline-Block injiziert:
```html
<style>:root { --primary: #312783; --accent: #3d7a12; }</style>
<link rel="stylesheet" href="/email/install.css?v=a1b2c3d4">
```

**Cache-Busting:** `?v=HASH` = erste 8 Zeichen des MD5-Hashes von `install.css`. Ändert sich automatisch bei Style-Änderungen — Vercel-Edge-Cache wird invalidiert.

**Mail-Client-Constraint:** Die echte Sig-HTML (`<slug>.html`) MUSS inline-CSS behalten. Mail-Clients (Outlook, Gmail, Apple Mail) laden kein externes CSS.

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
      layout: 'a',                               // 'a' (Logo links) | 'b' (Logo oben) | 'auto' | 'kunde' (eigene Vorlage)
      salutation: 'Hallo Markus',                // Anrede in Begleitmail
    },
  ] as const satisfies readonly EmailSigPerson[],
};
```

Pflicht: `slug`, `name`, `email`. Alle anderen Felder optional.

Ein unbekanntes `layout` (Tippfehler wie `'kunden'`) fällt weiter auf `auto` zurück, meldet das aber
seit 23.11.2026 mit `⚠ Unbekanntes Layout '…'` auf stderr.

## Kunden-Layout (`layout: 'kunde'`)

Für Kunden, deren Signatur nach einer eigenen (Agentur-)Vorlage aussehen soll. Das Design bleibt im
Kundenrepo, cw-core liefert nur die Daten. Die Daten kommen wie bei Layout a/b aus
`src/data/site-data.ts` (`persons[]`, `legal`, Kontakt) und `tokens.css`.

**Vorlage:** `customer-X/email-signatures/_layout/PERSON.html.template`, eine Datei für alle Personen
des Kunden. `_layout` steht neben den Personenordnern; ein Slug kann nicht so heißen (Schema erlaubt
keinen Unterstrich). Für einen Einzelaufruf von `generate.sh` lässt sich der Pfad mit
`TEMPLATE_HTML_KUNDE=/pfad/zur/vorlage` setzen; Standard ist `$(dirname $OUT_DIR)/_layout/PERSON.html.template`.

**Regeln:**

| Fall | Ergebnis |
|---|---|
| Vorlage fehlt | Abbruch vor dem ersten Schreiben: `✗ Layout 'kunde', aber die Kundenvorlage fehlt: <pfad>`, Exit 1. Kein Rückfall auf Layout a. `regenerate-all.sh` überspringt die Begleitmail dieser Person und endet mit Exit 1. |
| Platzhalter unbekannt (`{{REGISTER_NUMMER}}`, `{{ name }}`) | Abbruch mit dem Namen und der Liste der bekannten, Exit ≠ 0, kein HTML. |
| Wert leer, Vorlage benutzt ihn | wird leer eingesetzt, je Platzhalter eine Zeile `⚠ Platzhalter {{UST_ID}} ist leer …` auf stderr. Im Ergebnis steht nie ein `{{…}}`. |
| Textfassung (`.txt`) | wie bei Layout a/b aus `PERSON.txt.template`, also aus den Daten. |
| vCard (`.vcf`) | schreibt `generate.sh` aus den Daten (`vcard.sh`). Layout a/b liest sie aus den `esig-*`-Klassen des HTML; die trägt eine fremde Vorlage nicht, Firma und Position fehlten sonst. |

Werte werden roh eingesetzt wie bei den eingebauten Layouts. `{{COMPLIANCE_BLOCK}}`,
`{{EXTRAS_BLOCK}}` und `{{PHOTO_BLOCK}}` sind fertiges HTML.

**Platzhalter** (`python3 render-kunden-vorlage.py --liste` gibt dieselbe Liste aus; der Test
`tests/email-signature/signatur-kunden-layout.test.js` prüft, dass hier jeder steht). Beispielwerte:
customer-mika-elektrotechnik, Kewin Mika, gemessen 23.11.2026.

| Platzhalter | Inhalt | Beispiel |
|---|---|---|
| `{{NAME}}` | `persons[].name` | Kewin Mika |
| `{{POSITION}}` | `persons[].position` | Geschäftsführer & Elektrotechnikermeister |
| `{{EMAIL}}` | `persons[].email` | info@elektro-mika.com |
| `{{PHONE}}` | `persons[].phone` (nicht `legal.phone`) | +49 151 25073136 |
| `{{WEBSITE_URL}}` | Domain zur Anzeige | elektro-mika.com |
| `{{WEBSITE_FULL}}` | volle URL mit UTM, für `href` | https://elektro-mika.com?utm_source=email-signature&utm_medium=email&utm_campaign=kewin-mika-web |
| `{{COLOR_PRIMARY}}` | `--color-primary` aus tokens.css | #004650 |
| `{{COLOR_ACCENT}}` | `--color-accent` aus tokens.css | #19E187 |
| `{{COMPANY_NAME}}` | `siteData.name` (Marke) | Elektrotechnik Mika |
| `{{LOGO_URL}}` | öffentliches Logo | https://elektro-mika.com/email/logo.png |
| `{{LOGO_URL_LIGHT}}` | Logo hell (mit `animationEffect` die APNG) | https://elektro-mika.com/email/logo-light.png |
| `{{LOGO_URL_DARK}}` | Logo dunkel | https://elektro-mika.com/email/logo-dark.png |
| `{{LOGO_ALT}}` | Alternativtext Logo | Elektrotechnik Mika |
| `{{COMPLIANCE_BLOCK}}` | HTML: Adresse, Rechtsform, GF, Register, USt-IdNr. | `Xaver-Winklmann-Straße 19 &middot; 92444 Rötz<br>GmbH &middot; GF: Kewin Mika<br>…` |
| `{{CONFIDENTIALITY_NOTE}}` | Vertraulichkeitshinweis (wie in der Textfassung) | Hinweis: Diese E-Mail und etwaige Anhänge … |
| `{{EXTRAS_BLOCK}}` | HTML: Termin-/Bewertungsknopf, vCard-Link | `<p …><a href="https://elektro-mika.com/email/kewin-mika.vcf?…">…Kontakt speichern (vCard)…` |
| `{{PHOTO_BLOCK}}` | HTML: Porträt 110 px rund (Layout a/b) | `<img src="https://elektro-mika.com/email/kewin.png" … width="110" …>` |
| `{{PHOTO_URL}}` | nackte Porträt-URL aus `persons[].photo` | https://elektro-mika.com/email/kewin.png |
| `{{PHOTO_ALT}}` | Alternativtext Porträt (= Name) | Kewin Mika |
| `{{COMPANY_LEGAL_NAME}}` | Firmenname mit Rechtsform: `legal.owner`, wenn er die Rechtsform trägt, sonst Name + Rechtsform (Einzelunternehmen: nur Name) | Elektrotechnik Mika GmbH |
| `{{LEGAL_FORM}}` | `legal.form` | GmbH |
| `{{STREET}}` | `legal.street` | Xaver-Winklmann-Straße 19 |
| `{{ZIP}}` | `legal.zip` | 92444 |
| `{{CITY}}` | `legal.city` | Rötz |
| `{{ZIP_CITY}}` | PLZ und Ort | 92444 Rötz |
| `{{REGISTERGERICHT}}` | `legal.registerCourt` / `registergericht` | Amtsgericht Regensburg |
| `{{HRB}}` | vollständige Registernummer | HRB 21336 |
| `{{REGISTER_ART}}` | Registerart aus der Nummer | HRB |
| `{{REGISTER_NR}}` | Nummer ohne Art | 21336 |
| `{{REPRESENTATIVES}}` | `legal.representatives`, kommagetrennt (kein Rückfall auf `legal.owner`) | Kewin Mika |
| `{{UST_ID}}` | `legal.ustIdNr` | DE451598291 |

Beispiel Fußzeile: `{{COMPANY_LEGAL_NAME}} · {{STREET}} · {{ZIP}} {{CITY}} · Geschäftsführer: {{REPRESENTATIVES}} · {{REGISTERGERICHT}} · {{REGISTER_ART}} Nr. {{REGISTER_NR}}`
→ „Elektrotechnik Mika GmbH · Xaver-Winklmann-Straße 19 · 92444 Rötz · Geschäftsführer: Kewin Mika ·
Amtsgericht Regensburg · HRB Nr. 21336“. Eine vollständige Beispielvorlage mit allen Platzhaltern liegt
unter `tests/fixtures/email-signature/kunden/customer-fixture-kunde/email-signatures/_layout/`.

**Pflichtangaben:** Die Vorlage verantwortet sie selbst. Wer `{{COMPLIANCE_BLOCK}}` nicht einsetzt, muss
Firma, Rechtsform, Sitz, Registergericht, Registernummer und Geschäftsführer (§ 35a HGB) einzeln setzen.

### CUSTOMER_ROOT-Falle bei Worktrees

`regenerate-all.sh` sucht die Kunden drei Ebenen über sich (`cw-core/templates/email-signature/` →
`CLAUDE/`). Aus einem Worktree unter `~/Code/_worktrees/_worktrees-cw-core/wt-…/` liegt dort kein
`customer-*`. Bis 23.11.2026 endete das still mit „DONE — 0“ und Exit 0; jetzt bricht der Lauf mit
`✗ Keine customer-*-Ordner unter CUSTOMER_ROOT=…` (oder `ONLY_CUSTOMER=… nicht gefunden`) und Exit 1 ab.

Lösung: `CUSTOMER_ROOT` auf einen Ordner zeigen lassen, der die Kunden enthält. Liegt der Kunde selbst
in einem Worktree (Ordnername `wt-…` statt `customer-…`), einen Symlink-Ordner mit dem richtigen Namen
anlegen:

```bash
# cw-core-Stand aus dem Worktree, Kundenrepo aus seinem Worktree
SIG_ROOT=$(mktemp -d /tmp/cw-sig-root.XXXX)
ln -s ~/Code/_worktrees/_worktrees-customer-mika-elektrotechnik/wt-signatur \
      "$SIG_ROOT/customer-mika-elektrotechnik"
CUSTOMER_ROOT="$SIG_ROOT" ONLY_CUSTOMER=customer-mika-elektrotechnik \
  bash ~/Code/_worktrees/_worktrees-cw-core/wt-signatur-kunden-layout/templates/email-signature/regenerate-all.sh
```

Die Ausgabe landet im Ziel des Symlinks (`email-signatures/<slug>/`, `public/email/`). Ohne
`REGISTRY_PATH` gilt der Kunde als nicht registriert (`⚠ … fail-open`); für das TIER-Gating zusätzlich
`REGISTRY_PATH=/…/customer-websites/customer-registry.json` setzen.

## TIER-Gating v4-Extras (v6.6, Plan-Phase 10.5)

Email-Sig v4 (Booking-Button, Google-Review-CTA, Trust-Badges) ist **Premium-Service ab Business-Tier**. `regenerate-all.sh` liest `tier` + `addons` aus `customer-websites/customer-registry.json` und blankt v4-Vars wenn die Buchung sie nicht rechtfertigt:

| Registry-Tier | Add-On `cal-booking-starter` | BOOKING_URL | GOOGLE_REVIEW_URL | vCard |
|---|---|---|---|---|
| `starter` | ✗ nein | geblankt | geblankt | ✓ aktiv |
| `starter` | ✓ ja (+29 €/Mo) | **aktiv** | geblankt | ✓ aktiv |
| `business` | — | aktiv (wenn in site-data.ts) | aktiv | ✓ aktiv |
| `enterprise` | — | aktiv | aktiv | ✓ aktiv |
| `unknown` | — | aktiv (fail-open + warning) | aktiv | ✓ aktiv |

vCard ist Basic-Service und in allen Tiers aktiv (auto-generiert aus persons[]).

**Aktivierung pro Customer (Business+):**

1. `customer-X/src/data/site-data.ts` → `booking.url` + `gmb.review_url` setzen
2. `customer-websites/customer-registry.json` → `signature_version: "v4"` für diesen Customer
3. `pnpm sig:regenerate` ODER `ONLY_CUSTOMER=customer-X pnpm sig:regenerate`
4. Verify in `customer-X/email-signatures/<slug>/<slug>.html`:
   ```bash
   grep -c "Termin vereinbaren" customer-X/email-signatures/<slug>/<slug>.html  # ≥1
   grep -c "Auf Google bewerten" customer-X/email-signatures/<slug>/<slug>.html  # ≥1
   ```

**Override für Spezial-Fälle:** `REGISTRY_PATH=/path/to/custom-registry.json pnpm sig:regenerate` (z.B. für Tests).

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
