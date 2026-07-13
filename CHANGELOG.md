# Changelog — @cw/core

Alle Versionen von `@cw/core` mit Breaking Changes, neuen Features und Fixes.
Kunden pinnen via `github:siluri/cw-core#release/cw-core/vX.Y.Z` in `package.json`.

> **SSOT-Hinweis (2026-07-09):** Diese Datei ist der **kanonische** Changelog von cw-core.
> Bis v0.56.0 lebte der kanonische Changelog cross-repo in
> `customer-websites/CHANGELOG-CW-CORE.md`; beide Historien wurden am 2026-07-09
> versions-sortiert in diese Datei gemerged (122 Einträge). Ab v0.57.0 wird nur noch
> hier gepflegt — Changelog + Code + Tag = ein Commit-Flow in cw-core.

> **`[kunde]`-Marker:** Kundenrelevante Änderungen tragen direkt unter dem
> Versions-Header eine Zeile `- [kunde] <laienverständlicher Satz, ohne direkte Anrede>` bzw.
> `- [kunde:sichtbar] …` wenn sich das Erscheinungsbild der Website ändert.
> Diese Zeilen werden maschinell in die Monatsreport-Sektion
> „Was ist neu auf Ihrer Website" übernommen — Pflichtfeld bei jedem Release
> mit kundenwirksamem Verhalten (siehe cw-release-Skill).

> **Hinweis 2026-05-26:** Releases v0.10.0 bis v0.21.2 (Apr–Mai 2026) wurden zur Zeit
> ihrer Veröffentlichung teils nicht dokumentiert; die vorhandenen Einträge stammen aus
> der Rekonstruktion. Detail via `git log release/cw-core/v0.9.10..release/cw-core/v0.21.2 --oneline`.

---

## v0.82.0 (2026-07-13)

**Feature (RichContentBlocks):** Neue Komponente `RichContentBlocks.astro` +
Typ `RichContentBlock` (`@cw/core/types/rich-content`) für strukturierten Fließ-Content
auf Detail-/Leistungsseiten: mehrere Abschnittsüberschriften (h2), Zwischenüberschriften
(h3), Absätze (p) und Stichpunktlisten (ul) mit optionalem fettem Lead-in pro Punkt.

Kontext: Detailseiten konnten Content bisher nur als flache `string[]`-Liste rendern.
Die Original-Copy-Struktur (Markdown `##`/`###`/`- **Lead:** Text`) wurde dadurch
plattgemacht — Zwischenüberschriften und Absatz-Umbrüche gingen verloren (Mika-Reklamation
07/2026). Die Komponente bildet die Struktur 1:1 ab, ohne Markdown-Parsing, und ist
marken-neutral gestylt (Customer branden per `:global(.rich-content h2){…}`-Override).

```astro
import RichContentBlocks from '@cw/core/components/blocks/RichContentBlocks.astro';
import type { RichContentBlock } from '@cw/core/types/rich-content';
<RichContentBlocks blocks={leistung.content} />
```

**Feature (CTAHeroBlock HTML-Headline):** `CTAHeroBlock.astro` rendert die `headline` jetzt
via `set:html` (wie `Hero.astro`) — erlaubt `<br/>` u. a. für harte Umbrüche
(z. B. „Ihr Dach?<br/>Hat Potenzial!").

**Tweak (tel:-Normalisierung):** Neuer Util `phoneToTelHref` (`@cw/core/utils/text/tel-href`)
normalisiert Anzeige-Nummern (führende `0`) zu internationalen `tel:`-Hrefs (`+49…`).
`Footer.astro` und `LeistungenSection.astro` nutzen ihn jetzt gemeinsam. Entkoppelt
Anzeige-Format („0160 …") vom Link, sodass alle Call-Sites konsistent `+49…` verlinken.

**Migrations-Hinweis:** Keiner (rein additiv). Bestehende Props/Verhalten unverändert;
`CTAHeroBlock`-Headlines als reiner Text rendern weiter identisch. `set:html`-Umstellung
beim Fleet-Bump beachten: Headlines mit rohem `<`/`&` würden als HTML interpretiert —
Fleet-Audit 07/2026 zeigte keine problematischen Fälle (nur gewolltes `&nbsp;`/`<br/>`).

---

## v0.81.0 (2026-07-11)

**Fix (Denylist-Twin-Alignment, blitzsicht-ops-Nachlauf):** `/email/` und `/social/` werden jetzt
in BEIDEN Bild-Denylists ausgeschlossen — `TAG_DENY_RE` (geotag-core.js) und `DENY_PATTERNS`
(scripts/optimize-images.mjs).

Kontext: Die zwei „Twin"-Denylists waren divergiert — `optimize-images` schloss `/email/` bereits
aus, `geotag-core` nicht, obwohl der Kommentar Spiegelung behauptete. Der `strictImageBudget`-Guard
walkt über `TAG_DENY_RE`; ohne `/email/` + `/social/` dort würden beim späteren Strict-Flip
spec-fixe Assets fälschlich als Budget-Verstoß blocken (z. B. donau-Facebook-Share-PNG
`titelbild.png` 1182 KB, Newsletter-APNGs). Beide Twins sind jetzt wieder ausgerichtet
(Twin-Divergenz-Guard, CLAUDE.md #1-Rule). Negativ-Guard im Test: „social" als Teilstring im
Dateinamen (`social-media-tipps.webp`) greift NICHT — nur das Pfad-Segment `/social/`.

**Migrations-Hinweis:** Keiner — reines internes Guard-Tuning, kein API-/Prop-Change.

---

## v0.80.0 (2026-07-11)

- [kunde] Das große Bild oben auf der Startseite lädt jetzt in einem moderneren, kleineren Bildformat — schnellerer Seitenaufbau bei gleichem Aussehen.

**Feature (Hero/AVIF, blitzsicht-ops#540):** Hero.astro liefert das astro:assets-Hero jetzt als
`<Picture formats={['avif','webp']}>` statt `<Image format="webp">` — moderne Browser bekommen AVIF
(~33–43 % kleiner als WebP, an schiller gemessen), ältere den WebP-Fallback. Support 93–95 %, Encode ist
reine Build-Zeit (egal für statische Sites).

Details:

- Beide Hero-Bild-Pfade (Parallax + statisch) auf `<Picture>` umgestellt.
- Neue CSS-Regel `.hero-image-wrap picture { display: contents }` macht den `<picture>`-Wrapper
  layout-transparent → `.hero-img` (width:100%) füllt weiter den Wrap, KEIN CLS/Layout-Shift.
- Nur der `image`-Prop (ImageMetadata/astro:assets). Der `imageSrc`-String-Pfad (public-URL) bleibt
  plain `<img>` — public/-srcset ist separat (#542).

**Migrations-Hinweis:** Keiner (rein additiv, gleiche Props). Nur Sites mit `<Hero image={…}>`
(astro:assets) profitieren; Fleet-Bump läuft mit dem Release-Train.

---

## v0.79.0 (2026-07-11)

**Feature (optimize-images):** Der Bild-Optimierer schließt zwei Lücken, durch die AI-generierte
1024²-Bilder als 230–260 KB in `public/` landeten (Ursache der #541-Fleet-Baseline von 18 Bildern):

- **Scope:** `--dir`-Default jetzt `public` statt `public/images` → auch `/staedte/`, `/leistungen/`
  u. a. public/-Unterordner werden optimiert. OG-Bilder, Icons, Favicons und `/email/` (animierte PNGs)
  sind per Denylist ausgenommen (neuer exportierter `isDenied`).
- **KB-Budget:** neuer opt-in `--target-kb=N` — ist ein WebP über Budget, wird die Breite iterativ
  (×0,85) bis `--min-width` (Default 640, schützt Heroes vor Über-Verkleinerung) gesenkt, bis es ≤ N KB
  ist. Immer vom Original neu kodiert → deterministisch + idempotent. Fängt 1024²-Bilder, die unter
  `--max-width` (1200) fallen und drum nie verkleinert wurden.
- **Animated-Guard:** animierte Bilder (`meta.pages > 1`) werden übersprungen (kein Frame-1-Flatten).

5 neue `isDenied`-Tests (204 gesamt grün). Verifiziert mit echtem sharp: 1024²/248 KB → 870²/180 KB
(−26 %, unter 200 KB Budget), zweiter Lauf idempotent (`already optimal`).

**Migrations-Hinweis:** `pnpm optimize:images` (prebuild) scannt nach dem Pin-Bump das ganze `public/`
statt nur `public/images/`. Beim ersten Build danach können bisher unoptimierte public/-Bilder einmalig
im Working Tree auftauchen (jpg/png → webp, > 1200 px verkleinert). `--target-kb` bleibt opt-in (kein
Auto-Resize bestehender Bilder ohne das Flag). Kein Code-Change an Komponenten.

---

## v0.78.0 (2026-07-11)

**Feature (Perf-Budget-Guard):** Neuer ai-discovery-Guard `checkImageBudget` warnt post-Build bei
einzelnen dist-Bildern über `maxImageKb` (Default 200 KB) — fängt das schwere Hero/Foto, das durch
die bestehenden Cache-/CSS-/Font-Guards fällt (blitzsicht-ops#541).

Kontext: Die Perf-Guards prüften Cache-Header, render-blockendes CSS und tote Fonts — aber niemand
fing ein 500-KB-Bild in dist. Große Bilder verschlechtern LCP + Bandbreite.

Neue Optionen (ai-discovery):

- `checkImageBudget` (Default true) — Guard an/aus
- `maxImageKb` (Default 200) — KB-Schwelle pro Einzelbild
- `strictImageBudget` (Default **false**, opt-IN) — `true` → Build-Fail bei Über-Budget-Bildern

Bewusst **Soft-Warn-Start** (anders als die v0.67-Guards, die opt-out-strict sind): Bildgröße ist
fuzzy, ein Strict-Default würde 7/11 Sites brechen. Reuse `walkImages` → OG-Bilder/Icons/Favicons
sind ausgenommen (dürfen legitim größer sein). Fleet-Audit-Baseline: 18 Bilder > 200 KB
(gottl/donau/schiller/soleno/zink/steller/digital-direkt — echte Treffer, keine Fehlfeuer;
blitzsicht/hausamlago/hausammincio/mika clean) → korrekt soft, Strict-Kandidat erst nach
Optimierungs-Sweep. 6 Logik-Tests (Cases 10–15 in `tests/integrations/perf-check.test.js`),
199 gesamt grün.

**Migrations-Hinweis:** Keiner (rein additiv, soft-warn). Fleet-Bump nicht dringend — läuft mit dem
nächsten Release-Train mit.

---

## v0.77.3 (2026-07-11)

**Fix (Perf-Linter/Dead-Font-Check):** `extractFontStacks` parst Tailwind-v4-Property-Tokens
(`--font-weight-*`, `--font-size-*`, `--font-style-*` u. ä.) nicht mehr als Font-Familien-Stacks.
Vorher wurde z. B. `--font-weight-bold: 700` als Stack mit Lead `'700'` gelesen →
`dead_font_family`-False-Positive, der mit `strictFonts=true` den Build abbricht.

Kontext: Gefunden bei der @cw/core-Aufnahme von customer-gympanzen (blitzsicht-ops#545) —
erste Site im Cluster, die Font-Weight-Tokens als `--font-weight-*` Custom-Properties emittiert.
Familien-Tokens (`--font-display`, `--font-sans` …) werden unverändert extrahiert
(Regressionstest 14 in `tests/integrations/perf-check.test.js`).

**Migrations-Hinweis:** Keiner. Fleet-Bump nicht dringend (nur Sites mit `--font-weight-*`-Tokens
betroffen) — läuft mit dem nächsten Release-Train mit.

---

## v0.77.2 (2026-07-11)

**Fix (Alt-Qualität-Guard):** (a) Brand-Mark-/Chrome-Ausnahme um `signet`/`badge` im `src`
erweitert (vorher nur `logo`/`favicon`). (b) Cross-Page-Duplikat-Check (`aggregateCrossPageDupAlts`,
`alt_dup_crosspage`) **entfernt**.

Kontext: Der v0.77.1-Fleet-Audit (lokale Builds aller 11 Live-Kunden) zeigte, dass die verbliebenen
Warnungen fast ausschließlich **globales Chrome** waren, das legitim auf jeder Seite wiederholt:
mika-„signet" (Bildmarke, `src=/signet.svg`, alt===Firmenname) + Status-/PageSpeed-Trust-Badges
(`status.…/badge/…svg`, festes Label). Der Cross-Page-Check verfehlte zudem sein eigentliches Ziel
(2-Seiten-Landing-Dups liegen unter Schwelle 3) und flaggte in der Praxis nur solches Chrome →
netto-negativ, daher entfernt. `signet`/`badge` im `src` nimmt die Bildmarken/Badges img-lokal aus.

**Ergebnis:** Fleet ist alt-quality-clean. Der Guard bleibt als rausch-freier **Regressions-Wächter**
(fängt künftige echte Fälle: Hero mit bloßem Firmennamen, „Bild:"-Platzhalter, Dateiname-als-Alt, <5).

**Migrations-Hinweis:** Keiner. Additiv/soft-warn. Reduziert nur Warnungen. `aggregateCrossPageDupAlts`
war nie öffentlich genutzt (nur intern im Hook) — Entfernen ist kein Breaking Change für Kunden.

---

## v0.77.1 (2026-07-10)

**Fix (Alt-Qualität-Guard):** Logo-`<img>` werden jetzt auch über den **`src`** ausgenommen
(`src` enthält `logo`/`favicon`) — nicht nur über `class~=logo`/`data-logo` am img-Tag. Auslöser:
der v0.77.0-Fleet-Audit flaggte fleet-weit das Footer-/Nav-Logo (`<a class="logo-img"><img
src="/logo-*.svg" alt="{Firmenname}">`) als `alt_generic_term` auf JEDER Seite — die `logo`-Klasse
sitzt am Eltern-`<a>`, das img-lokale (ancestor-blinde) Regex sah sie nicht. Das blähte jeden Kunden
um ~1 False-Positive pro Seite (soleno 96, blitzsicht 44, digital-direkt 42 — fast ausschließlich
das Logo). `src~=logo|favicon` fängt Logos ancestor-frei. Logo-Alt === Markenname ist korrekt.

**Migrations-Hinweis:** Keiner. Weiterhin additiv/soft-warn. Reduziert nur die Guard-Warnungen.

---

## v0.77.0 (2026-07-10)

**Feature (Build-Guard):** Neuer **Alt-Qualität-Guard** in ai-discovery — ergänzt die bestehenden
Alt-Text-Guards (die nur die *Existenz* eines Alt-Textes sichern) um die *Güte*. Zwei neue Exporte:
`lintPageImgAltQuality(htmlPath, distDir, genericTerms)` (per-Page) + `aggregateCrossPageDupAlts(pageAlts)`
(seitenübergreifend). Flaggt nicht-leere, aber generische/schwache Alts: `alt_generic_term`
(Alt === Firmenname/Leistungstitel/areaServed, exact-match), `alt_placeholder` (beginnt mit
„Bild/Foto/Image/Grafik/Abbildung"), `alt_filename` (Dateiname-/Slug-als-Alt), `alt_too_short` (<5
Zeichen), `alt_dup_crosspage` (wortgleicher Alt auf ≥3 Seiten). Deko-/Logo-Bilder (`aria-hidden`/
`role=presentation`/`class~=logo`/`data-logo`) sind ausgenommen.

Kontext: Der v0.73-Audit zeigte fleet-weit systematisch generische Alts (Hero → nackter Firmenname
via `imageAlt ?? siteName`-Fallback, Leistungs-Kacheln → Leistungstitel, Case-Study → „Bild: X").
Alt-Text ist einer der echten Bild-Ranking- + A11y-Hebel; die Existenz-Guards konnten schwache Alts
nicht erkennen. Der Guard macht sie sichtbar.

**Wichtig — permanent soft-warn:** Flag `strictAltQuality` ist **bewusst KEIN** Strict-Flip wie
`strictAltText`/`strictSiteDataShape`. Default = nur Warnung im Build-Log, **nie Build-Fail**.
Qualität ist fuzzy — ein False-Positive darf keinen Deploy brechen. Nur explizit `strictAltQuality: true`
pro Site macht daraus einen Fail. Der Guard wirkt als Signal + Regressionsschutz per Build-Log.

**Tweak (CaseStudyBlock):** Gallery-`<img>`-Fallback `alt={`Bild: ${customer}`}` → beschreibend
(`{Provider} — Referenzprojekt für {Kunde} in {Ort} (n)`) — kein literales „Bild:" mehr.

**Migrations-Hinweis:** Keiner. Additiv + soft-warn. Bestehende Builds sehen nur eine neue
Log-Zeile `Alt-Qualität-Guard: …`; kein Build bricht. Der Fleet-Rollout dieses Pins dient als
Gratis-Audit (Build-Logs harvesten → generische Alts pro Kunde beheben).

---

## v0.76.0 (2026-07-10)

**Breaking (Build-Guard):** `strictSiteDataShape` ist jetzt **Default `true`** — der Build **failt**
bei einer `warn`-Shape-Abweichung (z.B. `images.hero`-String statt canonical `hero.image`,
`services[]` ohne `leistungen[]`, verwaister `hero.imageAlt`). Vorher soft-warn. Muster wie
`strictAltText` (v0.75.0). Opt-out pro Site: `strictSiteDataShape: false`. Reine `[info]`-SEO-
Hinweise (fehlendes `legal.region`/`knowsAbout`) brechen NIE.

Kontext: Der Fleet war nach 4 Kunden-Fixes shape-clean (gottl: vestigiales `images.hero` entfernt +
abgeleitetes `leistungen[]`; hausamlago: vestigiales `images.hero` entfernt; hausammincio: canonical
`hero.image/imageAlt`; donau-profi: verwaisten `hero.imageAlt` entfernt). Jetzt wird die Canonical-
Shape erzwungen. Verifiziert: cleaner Build passt, künstliche Abweichung bricht mit klarer Meldung.

**Migrations-Hinweis:** Fleet ist beim Flip clean → kein Kunde betroffen. Neue Sites: Hero als
`hero: { image, imageAlt }` (nicht `images.hero`-String), Service-Liste als `leistungen[].title`
(oder `leistungen[]` als Alias, falls `services[].label` für SchemaOrg gebraucht wird).

---

## v0.75.0 (2026-07-10)

**Breaking (Build-Guard):** `strictAltText` ist jetzt **Default `true`** — der Build **failt**, wenn
ein nicht-dekoratives `<img>` mit fehlendem/leerem `alt` im dist-HTML landet (vorher soft-warn).
Muster wie `strictFonts` (v0.67.0). Opt-out pro Site: `strictAltText: false` in der ai-discovery-Config.

Kontext: Der v0.73-Rollout-Audit deckte ~359 leere `alt=""` fleet-weit auf; v0.74.0 (a11y-Marker am
`<img>`) + per-Kunde-Fixes (soleno/donau-profi FeaturedLeistungen) haben die Fleet auf 0 gebracht.
Jetzt wird der Zustand erzwungen: kein neuer leerer Alt kommt mehr unbemerkt live. Verifiziert:
cleaner Build passt, künstlich leeres `alt=""` bricht mit klarer Meldung (Fall-1/Fall-2-Test).

**Migrations-Hinweis:** Fleet ist beim Flip clean → kein Kunde betroffen. Neue/dekorative Bilder:
`aria-hidden="true"` bzw. `role="presentation"` **am `<img>`-Tag** setzen (nicht nur am Eltern-
Element — der Guard prüft tag-lokal), sonst echtes Alt ergänzen. `strictSiteDataShape` bleibt soft
(3 Kunden je 1 Abweichung offen).

---

## v0.74.0 (2026-07-10)

- [kunde] Dekorative Bilder (Logo, Icons, Signets) werden von Screenreadern nicht mehr doppelt vorgelesen — bessere Barrierefreiheit; sichtbar ändert sich nichts.

**Fix (a11y):** Dekorative `<img>` tragen den `aria-hidden="true"`-Marker jetzt am `<img>`-Tag selbst
statt nur am Eltern-Element. Betroffen: Header-Logo (`layout/Header.astro`), Block-Icons
(`LeistungenSection`, `ServiceTrioSection`, `USPSection`), CTA-Signets (`CTAHeroBlock`).

Kontext: Der Alt-Text-Guard (`lintPageImgAlt`) prüft nur das `<img>`-Tag auf `aria-hidden`/`role`,
nicht die Vorfahren. Dadurch flaggte er fleet-weit ~359 genuin-dekorative Bilder mit `alt=""` als
`alt_empty` (v0.73-Rollout-Audit: soleno 156, blitzsicht 41, …), obwohl der Marker korrekt am
Eltern-Link (`aria-label`) bzw. -Div (`aria-hidden`) saß. Der Marker am Tag ist a11y-korrekt (die
beschrifteten Vorfahren behalten den Accessible Name) UND räumt die Guard-Treffer ab. Verifiziert:
gottl 22→0, soleno 156→72 (Rest = kunden-eigene Content-Bilder, separat).

**Migrations-Hinweis:** Keiner (rein additiv). Ebnet den Weg für den `strictAltText`-Flip (v0.75.0),
sobald auch kunden-eigene Content-Bilder echtes Alt haben. strict-Flags unverändert soft.

---

## v0.73.0 (2026-07-10)

- [kunde] Die Urheber-/Copyright-Angabe in den Suchmaschinen-Strukturdaten der Bilder nennt jetzt einheitlich das rechtlich verantwortliche Unternehmen — identisch zur Angabe in den Bilddateien selbst.

**Feature:** JSON-LD `copyrightNotice` des Primärbild-`ImageObject` läuft jetzt über dieselbe
company-first-Logik (`resolveCopyrightHolder`) wie das EXIF-Copyright der Bilder — Single Source
of Truth, EXIF == JSON-LD.

Kontext: Bisher war die `copyrightNotice` in SchemaOrg hart auf `© ${name}` (Markenname) verdrahtet,
während das EXIF-Copyright der dist-Bilder bereits `resolveCopyrightHolder` (`legal.company ||
legal.owner || name`) nutzt. Für ~15 der Fleet-Repos divergiert der Markenname vom rechtlichen
Träger (z.B. „Sachverständigenbüro Gottl Richter Gomeier" vs. „Gottl Richter Gomeier GbR") — die
JSON-LD-Angabe war damit inkonsistent zur Bild-Metadaten-Angabe.

Neue APIs:

- `@cw/core/utils/copyright` — reiner `.js`-Util mit `resolveCopyrightHolder(siteData)` + `isTodo`.
  Kanonische Heimat; `geotag-core.js` importiert von hier und re-exportiert (öffentliche API stabil).
- `<SchemaOrg copyrightHolder={…} />` + `SchemaProps.copyrightHolder` (optional, additiv). Ohne
  Wert Fallback auf `name` → vollständig rückwärtskompatibel.

**Migrations-Hinweis:** Keiner (additiv). Optional pro Customer in `page-config.ts` im `schema`-Objekt
`copyrightHolder: resolveCopyrightHolder(siteData)` setzen (Import aus `@cw/core/utils/copyright`),
damit die JSON-LD-Angabe den rechtlichen Träger statt des Markennamens nennt. Die strict-Flags
(`strictAltText`/`strictSiteDataShape`) bleiben unverändert soft-warn (T3-Flip folgt in v0.74.0).

---

## v0.72.0 (2026-07-10)

**Feature (dormant):** Geteilte Image-Sitemap-`serialize`-Factory für `@astrojs/sitemap`
(`@cw/core/integrations/sitemap-images` → `imageSitemapSerialize`, `ogImageFor`), die
`<image:image>`-Einträge an Sitemap-Items hängt.

Kontext: Aus dem Bild-SEO-Review als Phase-2b-Option. **Bewusst NIRGENDWO verdrahtet** — für
unsere statischen HTML-Sites ist der ROI niedrig (Google crawlt in-page-`<img>` ohnehin; ein
sinnvoller Eintrag bräuchte gepflegte Per-Page-Bilddaten). Liegt im Repo bereit für den Fall
CDN-/JS-gerenderte Bilder oder große Kataloge. Reine, getestete Funktionen (4 Tests).

**Migrations-Hinweis:** Keiner — additiver, ungenutzter Export. **Kein Customer-Bump** (kein
Kunde importiert den Helper; die `@cw/core`-Auflösung ändert sich für bestehende Sites nicht).

---

## v0.71.0 (2026-07-10)

**Fix (Review-Nachzug):** Zwei Befunde aus dem Selbst-Review von v0.69.0/v0.70.0 behoben.

Kontext: Der Multi-Agent-Review fand (1) den `images.hero`-Caption-Fallback als toten Code — divergente Kunden (gottl, Ferienhäuser) haben KEINEN top-level `hero`-Key, also war `data.hero.imageAlt || data.hero.headline` immer `undefined` → keine Bild-Description trotz „Tolerance"-Claim; (2) den zugehörigen Unit-Test (#10), der eine fiktive Hybrid-Shape prüfte statt der echten → False-PASS-Risiko (CLAUDE.md-Testregel).

- `buildDescByStem`: Caption-Fallback für `images.hero`-Kunden jetzt auf `data.name` (Firmen-/Objektname) statt des nie existierenden `hero.headline` — echter, sinnvoller Wert.
- Test #10 nutzt jetzt die ECHTE divergente Shape (`images.hero`-String ohne `hero`-Objekt) + testet explizit die dokumentierte Grenze (kein `name`/`hero` → keine Caption).

**Migrations-Hinweis:** Keiner. `images.hero`-Kunden (gottl, hausamlago, hausammincio) bekommen jetzt den Firmennamen als Hero-Bild-Caption statt gar keiner.

---

## v0.70.0 (2026-07-10)

- [kunde] Die Bilder der Website liefern jetzt strukturierte Angaben (Bildunterschrift, Urheber, Copyright) mit, die Google Bilder und KI-Suchen tatsächlich auswerten — die Grundlage für bessere Bild-Auffindbarkeit.

**Feature (SEO/GEO):** `SchemaOrg` emittiert das LocalBusiness-Bild jetzt als schema.org `ImageObject` statt als nackte URL. Das ist — anders als eingebettete EXIF-Daten (die Google beim Ausliefern strippt) — ein Bild-Signal, das Google Images + KI-Suche (AI Overviews, Perplexity) beim Indexieren real auswerten. Zugleich der stärkste Hebel, damit KI-Antworten unsere eigenen Bilder zitieren statt Stock.

Kontext: Der v0.68.0-Review-Reframe zeigte, dass die EXIF-Bild-Metadaten fürs Ranking ~wertlos sind; die echten Hebel sind Alt-Text (v0.69.0-Guard) + ImageObject-JSON-LD (dieses Release).

Neue Konzepte:

- Neuer Builder `@cw/core/schema` → `imageObjectSchema({ url, caption, creditText, copyrightNotice, creatorId, ... })` (contentUrl, optional width/height nur bei bekannten Maßen, optionale Licensable-Felder).
- `SchemaOrg.astro`: LocalBusiness-`image` = ImageObject mit `@id` (`#primaryimage`), caption (Firmenname), creditText, copyrightNotice + creator-Referenz auf die Organization. Universell über das (immer vorhandene) OG-Bild — keine Per-Kunde-Datenpflege nötig.

**Migrations-Hinweis:** Keiner. Rein additive Schema-Anreicherung; der Schema-Linter bleibt clean (`#primaryimage` ist pro Seite eindeutig).

**Noch offen (Phase 2b, bewusst nicht in diesem Release):** Image-Sitemap (`<image:image>`) — für unsere statischen HTML-Sites niedriger ROI (Google findet die Bilder ohnehin per Crawl) und bräuchte gepflegte Per-Page-Bilddaten. Bei Bedarf separat.

---

## v0.69.0 (2026-07-10)

- [kunde] Die Urheber-/Copyright-Angabe in den Bild-Metadaten nennt jetzt zuverlässig den Firmennamen (statt in Sonderfällen eine Privatperson). Rein technisch, keine sichtbare Änderung.

**Feature (Guards + Bild-Metadaten-Härtung):** Multi-Agent-Review des v0.68.0-Rollouts deckte einen Live-Attributionsfehler + einen stillen Schema-Mismatch auf. Beide werden jetzt clusterweit per Build-Guard verhindert (CLAUDE.md #1-Rule), plus zwei SEO-Grundlagen-Checks.

Kontext: gottl lieferte `© Gottl Reiner` (Privatperson) statt „Gottl Richter Gomeier GbR" — `buildCommonTags` ignorierte `legal.company`. Zusätzlich taten divergente site-data-Shapes (gottl `services[].label`/`images.hero`, Ferienhäuser `images.hero`, donau `hero.imageAlt` ohne `image`) die Bild-Pipeline still WENIGER (keine Service-Keywords, keine Description), ohne Fehler. Reframe aus der Recherche: EXIF-GPS/XMP:City sind fürs Google-Ranking ~wertlos (EXIF wird gestrippt) — die echten Hebel sind Alt-Text, ImageObject-Schema, Image-Sitemap.

Neue Konzepte:

- **Copyright-Fix:** geteilter `resolveCopyrightHolder(data)` (= `legal.company || legal.owner || name`) in `geotag-core.js`; `buildCommonTags` nutzt ihn. Firma-als-owner-Kunden + Einzelunternehmer bleiben korrekt.
- **Pipeline-Tolerance:** `geotag-core` liest jetzt auch `images.hero`-String + `services[].label`, taggt `.jpg`, überspringt verwaiste Alt-Texte → divergente Kunden werden nicht mehr still weniger getaggt.
- **Denylist:** `walkImages` schließt `/og/`, `/icons/`, `favicon*` aus (keine Keyword/GPS-Payload auf Share-Cards/Favicons).
- **Schema-Consistency-Guard** `lintSiteDataShape` (soft-warn `strictSiteDataShape`) — macht Shape-Abweichungen im Build-Log sichtbar (Konvergenz auf Canonical). Nur `warn`-Severity bricht bei strict; reine SEO-Hinweise (fehlendes `legal.region`/`knowsAbout`) nie.
- **Alt-Text-Guard** `lintPageImgAlt` (soft-warn `strictAltText`) — flaggt `<img>` ohne bzw. leeres `alt=""` (ohne Deko-Marker); fängt das still auf `alt=""` kippende Hero-LCP-Bild.
- **Robustheit:** Top-Level-Error-Boundaries in `scripts/geotag-dist.mjs` + `verify-image-metadata.mjs`; Verify-Guard-Blindspot-Fix (loggt `✗` auch bei Totalausfall); `isTodo()` erweitert (TBD/Muster/[…]).

**Migrations-Hinweis:** Keiner. Neue `strict*`-Flags sind default soft-warn (opt-in strict später wie v0.67.0-Flip). Optional pro Kunde `legal.region` (→ `XMP:State`) pflegen — der Guard weist im Build-Log darauf hin.

---

## v0.68.0 (2026-07-10)

- [kunde:sichtbar] Die Bilder auf der Website tragen jetzt zusätzlich Ort- und Stichwort-Angaben in ihren Metadaten. Das verbessert die lokale Auffindbarkeit in Google, Google Bilder und KI-Suchen.

**Feature (SEO/Bild-Metadaten):** Bild-Metadaten-Pipeline um Keyword-Tags + Ortsnamen-Geo-Tags + PNG-Abdeckung erweitert, plus Selbstprüfung gegen stilles Metadaten-Stripping.

Kontext: Ein Audit (2026-07-10) zeigte, dass die Post-Build-Geotagging-Pipeline zwar Copyright/Artist + GPS-Koordinaten + best-effort Description in die dist-Bilder schrieb, aber **keine** Keyword-Tags (`IPTC:Keywords`/`XMP:Subject`) und **keine** Ortsnamen-Geo-Tags (`XMP:City/State/Country`) — und nur `.webp`, nie `.png`. Der Hook ist non-fatal → ein exiftool-Ausfall im Vercel-Build hätte alle Metadaten still gestrippt, ohne Alarm. Zudem waren `geotag.js` (Hook) und `scripts/geotag-dist.mjs` (CLI-Twin) divergierende Logik-Kopien.

Neue Konzepte/APIs:

- Neues shared Modul `src/integrations/ai-discovery/geotag-core.js` (reine, testbare Tag-Builder: `buildCommonTags`, `buildDescByStem`, `synthesizeKeywords`, `walkImages`, `descForFile`). `geotag.js` + `geotag-dist.mjs` importieren es jetzt beide → keine Twin-Divergenz mehr.
- Keyword-Tags: `IPTC:Keywords` + `XMP:Subject`, synthetisiert aus `seo.knowsAbout` + `seo.areaServed` + `leistungen[].title` (dedupe, cap 20) — oder explizit via neuem `seo.imageKeywords`.
- Ortsnamen-Geo-Tags: `XMP:City` (←`legal.city`), `XMP:State` (←neuem `legal.region`), `XMP:Country` (←`legal.country`). Getrennt von den reinen GPS-Zahlen.
- PNG-Tagging: `walkImages` erfasst `.webp` **und** `.png` (vorher nur `.webp`).
- Verify-Guard: nach dem Tagging werden 3 Sample-Bilder zurückgelesen; das Build-Log zeigt `Geotag-Verify: ✓/✗` → stilles Stripping wird sichtbar (bleibt non-fatal).
- Neues Audit-Script `scripts/verify-image-metadata.mjs` — prüft einen dist-Satz gegen alle 6 Kriterien (Größe/Meta/Keywords/Alt/GPS/Ort) mit Exit-Code für CI.
- Schema: `legal.region` + `seo.imageKeywords` neu (beide optional). TODO-Platzhalter aus der Vorlage werden nie getaggt.

**Migrations-Hinweis:** Keiner. Alle neuen Felder sind optional; ohne Pflege greift die Keyword-Synthese automatisch. Kunden können optional `legal.region` (→ `XMP:State`) und kuratierte `seo.imageKeywords` setzen.

---

## v0.67.1 (2026-07-10)

**Fix (Perf):** Dead-Font-Linter — False-Positives vom v0.67.0-Canary behoben (blitzsicht).

Kontext: Der strict-Canary brach blitzsicht mit 4 False-Positives: `inherit` (CSS-wide keyword, fehlte in der Allowlist) und Fallback-Namen hinter deklarierten Variable-Fonts (`'Inter Variable', 'Inter', …` — 'Inter' ist bewusster Fallback auf lokal installierte Fonts, kein toter Verweis).

- Allowlist um CSS-wide keywords ergänzt (inherit, initial, unset, revert, revert-layer).
- Neue Stack-Logik: Issue nur, wenn der FÜHRENDE Name eines font-family-Stacks weder @font-face-deklariert noch System-Font ist (der echte steller-Bug). Spätere Stack-Namen sind legitime Fallbacks.
- Neue API `extractFontStacks()`; `extractReferencedFontFamilies()` bleibt kompatibel.

**Migrations-Hinweis:** Keiner. Font-Demo-Seiten (z. B. Brand-Guides, die Kundenschriften zeigen) nutzen bei Bedarf das Opt-out `strictFonts: false`.

---

## v0.67.0 (2026-07-10)

**Workflow (Perf):** Perf-Guards strict — Cache-Header-, Inline-CSS- und Dead-Font-Linter brechen den Build jetzt per Default ab statt nur zu warnen (blitzsicht-ops#538).

Kontext: Der Speed-Rollout (v0.65.0/v0.65.1) ist fleet-weit abgeschlossen — alle 11 Live-Kunden haben Cache-Control-Regeln, `inlineStylesheets: 'always'` und saubere Font-Stacks (Config-Sweep `rollout-perf-config.sh`, inkl. Nachfass soleno/donau-profi + immutable-Anti-Pattern-Fix). Damit der Standard nicht zurückdriftet, gilt ab jetzt Build-Fail statt Soft-Warn. E2E-verifiziert: compliant Site baut grün; vercel.json ohne Asset-Cache-Regel → `strictCacheHeaders=true: Build abgebrochen`.

Änderungen:

- `strictCacheHeaders`, `strictInlineCss`, `strictFonts` defaulten auf **true** (vorher false). Opt-out pro Site: Option explizit auf `false` setzen (nur für begründete Sonderfälle).
- `isAssetSource` erkennt jetzt auch `/videos/`-Pfade (soleno-Befund: `immutable` auf `/videos/` wäre unentdeckt geblieben).

**Migrations-Hinweis:** Keiner für compliant Sites (alle 11 Live-Kunden sind es seit dem Config-Sweep). Nicht-compliant Sites: Build schlägt mit konkreter Guard-Meldung fehl → `rollout-perf-config.sh --only <slug>` fixt, oder begründetes Opt-out (`strictCacheHeaders: false` etc.) in `aiDiscovery({...})`.

---

## v0.66.0 (2026-07-10)

- [kunde] Die Auswertung von Klicks auf der Website misst jetzt sauberer: Klicks auf Navigations-Links werden nicht mehr fälschlich als Button-Klick gezählt, und mehrfach erfasste Klicks auf denselben Button wurden entfernt. Die Zahlen zu Handlungsaufrufen werden dadurch genauer.

**Fix (Tracking):** CTA-Click-Doppelfeuer in Hero, Header und LeistungenSection entfernt + Cluster-Guard `cta-double-fire`.

Kontext: Live-Audit auf blitzsicht.com (2026-07-10) zeigte, dass ein einzelner Klick zwei Plausible-Events auslöste. Ursache: Seit v0.63 feuert der globale SSOT-Listener (BaseLayout im inline-Modus, `<PlausibleEvents>` im full-Modus) das CORE-Goal `CTA Click` für jedes `[data-cta]`-Element. Drei Komponenten hatten zusätzlich einen eigenen `click`→`track`-Listener auf denselben (oder umschliessenden) Elementen:

- `Hero.astro` → `Hero CTA Click` + `CTA Click` (`hero-primary:`)
- `Header.astro` → `Nav Click` + `CTA Click` (`nav:`) — jeder Nav-Link trug `data-cta`, wodurch reine Navigation das CTA-Goal aufblähte
- `LeistungenSection.astro` → `Service Click` + `CTA Click` (`leistung-card:`) beim Klick auf die Link-Karte

Alle drei Komponenten-Events (`Hero CTA Click`, `Nav Click`, `Service Click`) sind keine konfigurierten Goals (`plausible-goals.mjs`) → totes Volumen auf demselben Klick, plus ein aufgeblähtes CTA-Click-Goal durch Navigations-Klicks.

Änderungen:
- `Hero.astro`: redundanten `Hero CTA Click`-Listener entfernt — Hero-CTAs zählen weiter via globalem `CTA Click` (`hero-primary:`/`hero-secondary:`).
- `Header.astro`: `data-cta` von normalen Nav-Links entfernt (nur der `nav-highlight`-Button behält es); Nav-Click-Listener auf `#main-nav a:not(.btn-accent)` eingeschränkt. Nav = `Nav Click`, der Highlight-CTA = `CTA Click` — nie beides.
- `LeistungenSection.astro`: Service-Click-Selektor auf `a.leistung-link` verengt (trifft nicht mehr den dekorativen `<span>` in der `data-cta`-Karte).
- **Neuer Guard** `scripts/lint/cta-double-fire-check.mjs` + Test `tests/ai-discovery/cta-double-fire.test.js`: scannt Komponenten auf `click`→`track`-Listener neben `data-cta` und verlangt Allowlist oder `cw-tracking-safe`-Annotation. Verhindert clusterweit die Wiedereinführung dieses Musters.

**Migrations-Hinweis:** Keiner (kein Prop-/API-Change). Rein tracking-seitig. Kunden mit einem eigens angelegten `Hero CTA Click`-/`Nav Click`-/`Service Click`-Goal (keiner im Cluster) würden ab dieser Version keine bzw. weniger Treffer sehen; die Conversion bleibt über `CTA Click` erfasst.

---

## v0.65.1 (2026-07-10)

**Fix (Types):** `BaseLayout.astro` — TypeScript-Fehler in den Schema-Props behoben, sodass `astro check` in Kunden-Repos nicht mehr an diesen Meldungen scheitert.

Kontext: Die `BaseLayout`-Props deklarierten Arrays als `Array<T> | readonly Array<T>` — `readonly Array<...>` ist ungültiges TypeScript (ts(1354): `readonly` nur auf Array-/Tupel-Literaltypen erlaubt), korrekt ist `ReadonlyArray<...>`. Diese Syntax-Fehler maskierten zusätzlich einen echten Prop-Mismatch: `BaseLayout` reichte `faqs` an `<SchemaOrg>` durch, obwohl `SchemaOrg` bewusst **kein** `faqs`-Prop hat (sonst doppelte FAQPage-Schemas). Zur Laufzeit war der Prop wirkungslos (Astro ignoriert unbekannte Props), aber `astro check` brach mit ts(2322).

Änderungen:
- `readonly Array<...>` → `ReadonlyArray<...>` (3× in der Props-Definition)
- Wirkungslosen `faqs={schema.faqs}`-Pass an `<SchemaOrg>` entfernt

**Migrations-Hinweis:** Keiner. Rein typseitig, kein Verhaltens- oder Darstellungs-Unterschied.

---

## v0.65.0 (2026-07-10)

- [kunde:sichtbar] Die Website lädt schneller: Bilder werden im Browser zwischengespeichert, Folgeseiten laden im Hintergrund vor, und Seitenwechsel sind jetzt sanft animiert.

**Feature (Perf):** Speed-Rollout — Build-time-Perf-Guards, Turnstile-Lazy-Load, View Transitions zentral, Performance-Standard-Templates.

Kontext: Cluster-Audit 2026-07-09 fand: keine einzige Customer-`vercel.json` hatte Cache-Control-Header (alle public/-Assets gingen mit `max-age=0` zum Browser; nur `/_astro/*` ist via Vercel-Preset immutable), kein Astro-Prefetch, `inlineStylesheets: 'always'` nur bei blitzsicht (~720 ms gemessen), Turnstile-`api.js` (~100–200 KB) im Startup-Critical-Path jeder Formular-Seite, tote Font-Referenzen ohne `@font-face`. Nach der #1-Regel als wiederverwendbare Guards + Templates codifiziert. Rationale-SSOT: `docs/caching-rationale.md` (u. a.: Vercel IST das CDN — kein Cloudflare-Proxy davor; kein `immutable` auf public/-Pfaden; SWR wird von Vercels Proxy konsumiert).

Neue Konzepte/APIs:

- `ai-discovery` Cache-Header-Linter (`cache-header-check.js`): warnt bei fehlender Cache-Control für public/-Assets, `immutable` außerhalb `/_astro/`, `no-store` auf Assets. Optionen `checkCacheHeaders`/`strictCacheHeaders` (Default: an / Soft-Warn).
- `ai-discovery` Perf-Linter (`perf-check.js`): render-blockendes `<link rel="stylesheet">` auf `/_astro/`-CSS (= fehlendes `inlineStylesheets: 'always'`) + tote Font-Familien ohne `@font-face`. Optionen `checkInlineCss`/`strictInlineCss`, `checkFonts`/`strictFonts`.
- Turnstile lädt lazy: `ContactForm` erst bei Form-im-Viewport/Fokus, `TurnstilePreClearance` nach `window.load` + idle; `preconnect` + Dedup via `window.__cwTsLoad`.
- View Transitions zentral in `tokens-base.css` (`@view-transition`, hinter `prefers-reduced-motion`) — alle Sites erben beim Pin-Bump.
- Neues Template `src/templates/astro.config.template.mjs` (Pflicht-Standard: `prefetch` viewport + `inlineStylesheets: 'always'`); `vercel.template.json` um Cache-Control-Blöcke + Plausible-Script-Rewrite-Caching erweitert; `templates/customer-CLAUDE.md` um Abschnitt „Performance-Standard".

**Migrations-Hinweis:** Keiner für den Pin-Bump (Guards sind Soft-Warn, View Transitions sind Progressive Enhancement). Empfohlen pro Customer-Repo (Config-Sweep `rollout-perf-config.sh`): Cache-Control-Blöcke in `vercel.json` + `prefetch`/`inlineStylesheets` in `astro.config` — sonst melden die neuen Linter Warnings im Build-Log.

---

## v0.64.0 (2026-07-10)

**Feature (Blocks):** `Testimonials.astro` — optionale Props `ratingValue` + `reviewCount`, die den aus den `items`-Sternen errechneten `aggregateRating`-Wert im Schema.org-Markup überschreiben.

Kontext: Bisher leitete `Testimonials` das strukturierte `aggregateRating` (JSON-LD/Microdata) hart aus den angezeigten `items` ab — `ratingValue` = Ø der Sterne, `reviewCount` = `items.length`. Wenn die kuratierten Stimmen nur ein Ausschnitt der echten Bewertungen sind (z. B. 6 handverlesene 5★-Karten bei real 4,8★/24 Google-Rezensionen), wies das Markup gegenüber Google eine Zahl aus, die weder dem eigenen Google Business Profile noch der Realität entsprach — eine Inkonsistenz, die Googles Rich-Results-Richtlinie (aggregateRating muss die echte Gesamtbewertung spiegeln) verletzt.

Neue Props:
- `ratingValue?: number` — überschreibt den Sterne-Durchschnitt (z. B. `4.8`)
- `reviewCount?: number` — überschreibt `items.length` (z. B. `24`)

Beide immer zusammen setzen; wird die echte GBP-Aggregatzahl durchgereicht, spiegelt das Schema die Realität statt der angezeigten Kartenanzahl.

```astro
<Testimonials items={siteData.testimonials} ratingValue={4.8} reviewCount={24} reviewSource="google" />
```

**Migrations-Hinweis:** Keiner. Vollständig rückwärtskompatibel — ohne die neuen Props verhält sich `Testimonials` exakt wie bisher (berechneter Durchschnitt). Opt-in.

---

## v0.63.0 (2026-07-09)

- [kunde] Klicks auf die Handlungs-Buttons (z. B. „Anfragen", „Kontakt aufnehmen") werden jetzt in der Besucherstatistik gezählt. Damit ist erkennbar, wie viele Besucher aktiv einen Kontakt starten wollten — nicht nur, wie viele die Seite geöffnet haben.

**Fix (Tracking):** Vollständiger Event-Satz im Default-`inline`-Modus + Aufräumen der Goal-Provisionierung. Auslöser: Tracking-Audit 2026-07-09.

Kontext: Im `inline`-Tracking-Modus (Default aller Live-Kunden ohne `<PlausibleEvents>`-Mount) feuerte der `BaseLayout`-Auto-Listener **kein** `CTA Click`-Event — das clusterweit provisionierte CORE-Goal „CTA Click" war bei jedem inline-Kunden eine tote DB-Zeile. Zusätzlich war `Paid Visit` als CORE-Goal provisioniert, obwohl es strukturell nur über die gclid/utm-Attribution in `<PlausibleEvents>` (`full`-Modus) feuern kann → tote Goal-Zeile bei jedem inline-Kunden ohne Paid-Traffic.

Änderungen:
- `BaseLayout`: `[data-cta]`-Klick-Listener feuert jetzt auch im `inline`-Modus `CTA Click` (gegated auf `inline` — im `full`-Modus bleibt `<PlausibleEvents>` alleinige Quelle, kein Doppelfeuer).
- `plausible-goals.mjs`: `Paid Visit` aus `CORE_GOALS` entfernt und in neues `PAID_GOALS`-Set verschoben (nur für Kunden mit bezahltem Traffic provisionieren).
- `page-config`/`site-data`-Templates: `trackingMode`-Passthrough + First-Party-Proxy-Defaults (`/js/script.js` + `/api/event`) — frisch gescaffoldete Sites erben nicht mehr hart `inline`, und die Onboarding-Kommentare erklären den `full`-Mount-Fall.

**Feature (Onboarding):** `plausible-add-site.mjs --pa <pa-ID>` — verwendet eine vorgegebene pa-ID statt einer frisch gewürfelten. Zwingend, wenn eine Site angelegt wird, deren Repo bereits eine pa-ID in `vercel.json` verdrahtet hat (sonst zeigt der `/js/script.js`-Rewrite auf eine andere pa-ID als die DB und Events verpuffen). Format-validiert; der Reconcile-Guard nutzt das.

**Refactor (Onboarding):** Box-Zugriff (SSH → `docker exec psql`) in neues `plausible-box.mjs` als SSOT extrahiert; `plausible-add-site.mjs` + `plausible-add-goals.mjs` importieren daraus (`remoteQuery`/`remoteWrite`/`sqlEscape`). `add-site` läuft `main()` nur noch bei direktem Aufruf (`import.meta.url`-Guard), nicht beim Import durch Reconcile/Test. Test 10/10 grün.

**Migrations-Hinweis:** Keiner für den Pin-Bump (Runtime-Verhalten additiv — inline-Kunden gewinnen `CTA Click`, kein Feld entfernt). Onboarding-Betrieb: bei Bestandskunden ohne bezahlten Traffic kann das alte `Paid Visit`-CORE-Goal aus Plausible entfernt werden (`plausible-add-goals.mjs --remove`), ist aber nur Kosmetik.

---

## v0.62.0 (2026-07-09)

**Fix (OG-Studio):** Non-Foto-Layouts im `offer`-Template komplett einfarbig (Marken-Primary) — der diagonale Verlauf ließ die Logo-Seite wie eine zweite Hintergrundfarbe wirken, zusätzlich hatte v0.61.0 versehentlich noch den Panel-Tint. Logo-Fläche = Textfläche; Foto-Split behält den Verlauf (Foto deckt die helle Seite). Logo im Fallback größer.

**Migrations-Hinweis:** Keiner. Agentur-Tooling (`@cw/core/og`), kein Runtime-Effekt beim Pin-Bump.

---

## v0.61.0 (2026-07-09)

**Feature (OG-Studio):** `offer`-Template — Logo-Fallback + Foto-Feinschliff.

- Kein Foto → Marken-Logo groß rechts direkt auf der Markenfarbe (nie leere Fläche; Standard-Fallback der OG-Pipeline).
- `logoImgFit()`: Logo in Box einpassen (maxW×maxH), jedes Seitenverhältnis.
- `featherLeft`: `fill`/`valign`/`padRight` → Porträts mit Kopffreiheit (Mika-Fix).

**Migrations-Hinweis:** Keiner. Agentur-Tooling, kein Runtime-Effekt beim Pin-Bump.

---

## v0.60.0 (2026-07-09)

**Feature (OG-Studio):** `offer` Foto-Split + PNG-Logo-Support.

- `featherLeft()` (photo.mjs): Person rechtsbündig, linker Rand per Alpha-Verlauf ins Transparente — weicher Blend, kein Farb-Wash übers Gesicht.
- `offer`: optionales Split-Layout mit Foto rechts (`photo`/`photoWidth`), Text links.
- `logoImg`: PNG-IHDR-Ratio (nicht nur SVG-viewBox) → PNG-Logos nicht mehr gequetscht.

**Migrations-Hinweis:** Keiner. Agentur-Tooling, kein Runtime-Effekt beim Pin-Bump.

---

## v0.59.0 (2026-07-09)

**Feature (OG-Studio):** `offer`-Template (Werbe-Stil) + Logo-Aspect-Fix.

Betrachter-zentrierte OG-Ads: Angebot (Headline) + 3 Benefit-Bullets + Grund-zu-klicken (CTA + Domain) + optionaler Trust-Chip. Wird Cluster-Default für Homepages; `proof` (Live-Scores) ist nicht mehr das Share-Bild.

- `logoImg()`-Helper liest SVG-viewBox-Ratio → Logos nicht mehr auf 48×48 gequetscht (galt für offer/cta/hero).
- `generate-og.mjs`: `--template offer` (`--headline "a|b" --bullets "a|b|c" …`). 9/9 Tests grün.

**Migrations-Hinweis:** Keiner. Agentur-Tooling, kein Runtime-Effekt beim Pin-Bump.

---

## v0.58.0 (2026-07-09)

- [kunde] Bessere Lesbarkeit: Quellenangaben unter Zitaten haben jetzt mehr Kontrast (Barrierefreiheit nach WCAG-Standard).

**Fix (a11y):** `PainPoints` Quellenzeile Kontrast — `opacity` 0.6 → 0.8. `.painpoints__proof-source` erfüllte auf `--color-primary` (#284898) WCAG-AA nicht (≈4,2:1); mit 0.8 ≥4,5:1 → Lighthouse color-contrast PASS. Rein visuell, additiv. Löst den TEMP-Override in customer-donau-profi ab (dort entfernen).

**Migrations-Hinweis:** Keiner. Betrifft nur Sites mit `PainPoints`-Block.

---

## v0.57.0 (2026-07-09)

**Feature (OG-Studio v3):** Neues Modul `@cw/core/og` — scharfe, brand-treue, CTA-fähige OG-Images (Link-Vorschaubilder). Satori (Layout + eingebettete Brand-Fonts → vektorisiertes SVG) → sharp mit 2×-Supersampling; kein resvg nötig.

- Templates: `cta` (Cluster-Default), `hero` (Foto-Composite), `proof` (nur Blitzsicht, Live-PageSpeed-Scores).
- `renderOg()` mit <300 KB-Zielgröße-Guard (JPG-Fallback) + Brand-Override.
- `generate-og.mjs`: `--template cta|hero|proof` (Legacy-Modus bleibt).
- quality-checks: og:image-Guard (existiert, 1200×630, <300 KB, png/jpg).
- `satori` als optionale peerDependency (Muster wie sharp); Brand-Fonts (Plus Jakarta Sans, Inter, JetBrains Mono) vendored, OFL.

**Migrations-Hinweis:** Keiner. OG-Bilder werden per Script generiert (kein Auto-Effekt beim Pin-Bump); neue Vorschaubilder pro Site sind ein eigener bewusster Schritt.

---

## v0.56.0 (2026-07-09)

- [kunde] Videos laufen jetzt datenschutzfreundlich direkt auf der Website — ohne YouTube-/Facebook-Cookies.

**Feature:** `VideoEmbed` bekommt einen zweiten Modus. Neben der bisherigen YouTube-Facade (`youtubeId`) nun **self-hosted** via `src`-Prop → rendert ein natives `<video controls preload="none" poster>` mit lokaler MP4-Quelle.

Kontext: Für Videos, die self-hosted mit Ton laufen sollen (z. B. ein aus Facebook exportiertes Erklärvideo, donau-profi), ist ein Facebook/YouTube-Embed datenschutzrechtlich unnötig heikel. Der self-hosted-Modus ist DSGVO-clean (kein iframe, kein Dritt-Request, nur `media-src 'self'`).

- Genau EINES von `youtubeId` / `src` angeben; `youtubeId` ist jetzt optional.

**Migrations-Hinweis:** Keiner. Additiv/backwards-compatible.

---

## v0.55.0 (2026-07-09)

- [kunde:sichtbar] Kundenstimmen wirken hochwertiger: kursive Zitate, optional mit Google-Bewertungs-Logo. Außerdem stehen neue Landingpage-Bausteine bereit.

**Feature:** Drei neue Landingpage-Blocks + Testimonials-Politur — operationalisiert den Blitzsicht-Landingpage-Blueprint als wiederverwendbare, prop-driven cw-core-Bausteine.

Kontext: Der Blueprint (Hero → Problem → Lösung/Story/Prozess → Proof → Leistungen → Einwände → Risk-Reversal → CTA) war bisher nur als Doku + **lokale** Komponenten bei customer-blitzsicht umgesetzt (`PainPointsSection`, `GarantieBlock`). Andere Sites (soleno, mika) fehlten Problem-/Risk-Reversal-Sektion. Diese generalisierten Blocks machen die Blueprint-Konformanz fleet-weit nutzbar (erste Anwendung: donau-profi).

Neue Komponenten:

- `HeroVideo.astro` — cinematischer Vollbild-Hero mit stummem, loopendem, self-hosted MP4-Hintergrund + Overlay (Badge/Headline/Subtext/CTAs/USP-Row). Prop-Signatur kompatibel zu `Hero.astro`, plus `videoSrc`/`videoSrcWebm?`/`poster`. DSGVO/LCP-safe: Poster als LCP/Fallback, `preload="metadata"`, `prefers-reduced-motion` → nur Poster; braucht nur `media-src 'self'`.
- `PainPoints.astro` — Blueprint-Sektion 2 „Problem": Schmerzpunkt-Karten (`items: {icon,text}[]`), optionales eingebettetes Proof-Zitat + Abschluss-Lede, KEIN CTA. `bg: 'dark' | 'surface'`.
- `RiskReversal.astro` — Blueprint-Sektion 7: Zusage-/Garantie-Karten (`items: {icon,title,text}[]`), optionale Promise-Box, Footnote, Häkchen-Siegel, optionaler CTA. `bg: 'surface' | 'white'`.

Testimonials:

- Neuer Prop `reviewSource?: 'google'` → rendert pro Karte ein Google-„G"-Logo (Markenfarben) + Label.
- Zitat-`blockquote` jetzt `font-style: italic` (Zitat-Konvention, gilt für alle Sites).

CSP-Template: `frame-src` um `https://www.youtube-nocookie.com` ergänzt (für `VideoEmbed` aus v0.54.3; `HeroVideo` benötigt es nicht).

**Migrations-Hinweis:** Keiner. Alle Änderungen additiv/backwards-compatible. `reviewSource` ist opt-in; das Testimonials-`italic` ist rein visuell.

---

## v0.54.3 (2026-07-09)

- [kunde] YouTube-Videos laden erst nach Klick — schneller und ohne Cookies vor dem Abspielen.

**Feature (Nachzügler):** `VideoEmbed` — DSGVO-konformer YouTube-Lite-Embed (Facade-Pattern, youtube-nocookie, Video-Play-Event). Die Komponente stammte aus der donau-profi-Session (PR donau#5 nutzte sie bereits), war aber nie committet — donaus Vercel-Build hing dadurch. Lesson: Cross-Repo-Features erst mergen, wenn die cw-core-Seite released ist. CSP-Voraussetzung: `frame-src https://www.youtube-nocookie.com`.

---

## v0.54.2 (2026-07-09)

- [kunde] Präzisere Besucherstatistik: doppelt gezählte Klicks und Formular-Ereignisse wurden bereinigt.

**Fix:** Tracking-Dedup — EIN kanonischer Event-Satz clusterweit.

Kontext (Tracking-Audit 2026-07-09, Live-Payload-Mitschnitt): Der Plausible-Tracker sendete EINGEBAUT `Outbound Link: Click`, `File Download` (Name-Kollision mit unserem Event → Doppelzählung) und `Form: Submission` — parallel zu unseren kontrollierten Events. Fix: BaseLayout-Init schaltet die drei Builtins ab (Pageviews unberührt); Inline-Block sendet kanonisches `Form Submit {form}`; PlausibleEvents (full-Mode-SSOT) um `Outbound Click {url}` + `File Download {filename}` ergänzt. Flankierend wurden die CORE_GOALS auf alle Live-Domains der Analytics-Box provisioniert (Drift: zink/mika hatten nur Alt-Goals — mikas WhatsApp-Conversions waren unsichtbar). **Rollout: alle 11 Live-Customer (donau via v0.54.3).** Verifiziert: Outbound-Klick = exakt 1 Event in beiden Modi.

---

## v0.54.1 (2026-07-09)

- [kunde] Das Status-Siegel im Footer führt jetzt direkt zur Status-Seite der eigenen Website.

**Fix:** Footer-Status-Badge verlinkt auf die eigene Status-Detailseite (`/customer/<slug>/`) statt der öffentlichen Kunden-Übersicht.

Kontext: Die Übersicht status.blitzsicht.com listet alle Blitzsicht-Kunden — auf einer Kundensite war damit die komplette Kundenliste für jeden Besucher einen Klick entfernt (Operator-Fund 2026-07-09, geschäftlich indiskret). Explizites `statusBadge.statusUrl`-Override gewinnt weiterhin; ohne Slug bleibt die Übersicht der Fallback. Konsistent mit dem psiBadge-Link (v0.53.0). **Rollout 2026-07-09: alle 11 Live-Customer.**

---

## v0.54.0 (2026-07-08)

- [kunde] Die Besucherstatistik zählt jetzt auch WhatsApp-Klicks — und nichts mehr doppelt.

**Feature/Fix:** `trackingMode`-Prop — Tracking-Doppelfeuer eliminiert + WhatsApp-Click im Inline-Block.

Kontext: Die BaseLayout-Inline-Listener (Phone/Email/PDF/Outbound/Scroll/Time) feuerten UNBEDINGT; 5 Repos (digital-direkt, gottl-richter-gomeier, schiller-gartenbau, soleno, steller-sanierungen) mounten zusätzlich `<PlausibleEvents />` → `Phone/Email/Scroll` doppelt mit inkompatiblen Props (`{number}` vs `{location}`, depth `"50%"` vs `50`). Neu: `trackingMode?: 'inline' | 'full' | 'none'` (Default inline = bisheriges Verhalten; full = Inline-Listener aus, PlausibleEvents ist SSOT; Runtime-Gate über `html[data-cw-tracking]`), durchgereicht via LandingPage/ContentPage. Außerdem: `WhatsApp Click`-Event im Inline-Block (wa.me/api.whatsapp.com, vor dem Outbound-Check — schloss die Lücke bei blitzsicht/mika) und Scroll-Depth inline als Zahl statt `"25%"`-String.

**Rollout 2026-07-08:** die 5 PlausibleEvents-Repos auf v0.54.0 + `trackingMode: 'full'` (page-config); mika auf v0.54.0 inline. Live-verifiziert per Playwright-Plausible-Stub: steller Phone Click exakt 1× `{location}`, mika `WhatsApp Click {number}`. blitzsicht folgt beim nächsten Bump (Checkout war durch parallele Instagram-Session belegt).

---

## v0.53.0 (2026-07-08)

**Feature:** Footer-Opt-in `psiBadge` — Google-PSI-Score-Badge („Gemessen von Google") neben dem Status-Badge.

Kontext: Phase-2 des Live-Beweis-Systems (Sales-Asset auf Referenz-Kundensites). Neue cw-uptime-Route `/badge/<slug>/psi.svg` (Lighthouse-Ampelfarbe, stale >14 d → „wird gemessen", Consent-Gate = `PSI_PUBLIC_ALLOWLIST`, kein Score-Filter). `Footer.astro` rendert bei `psiBadge: true` (Default false, clusterweit no-op) ein zweites Badge mit Slug-Auto-Detection, verlinkt auf die öffentliche Beweis-Detailseite `/customer/<slug>/`. Durchgereicht via ContentPage/LandingPage (`footer.psiBadge`). **Pro Customer erst aktivieren, wenn Messwert-Consent in customer-registry.json `reference.metrics` dokumentiert ist** (Badge ändert den Footer der Kunden-Site → eigenes OK nötig, Nachfass-Mails siehe `docs/live-proof/consent-nachfassung-mails-2026-07-08.md`). Rollout: zunächst nur blitzsicht (Dogfood).

---

## v0.52.2 (2026-07-08)

**Fix:** `optimize-images.mjs` Idempotenz-Guard — bereits optimierte WebPs werden nicht mehr bei jedem Build re-encodet.

Kontext: Der prebuild re-encodete WebPs (q80→q80), sobald 1 Byte gespart wurde — generationsweiser Qualitätsverlust + dauerhaft dirty Working Tree (Drift-Vorfall blitzsicht 2026-07-08: `dachdecker.webp` schrumpfte ~100 B pro Build, konvergierte nie). Neu: WebP wird nur neu geschrieben bei anstehendem Resize ODER Ersparnis >2 % UND >2 KB (`shouldRewriteWebp()`, 8 Logik-Tests inkl. der echten Bug-Fälle). jpg/png-Konvertierung unverändert. `sharp` lazy geladen, `main()` realpath-gated (pnpm-Symlinks).

---

## v0.52.1 (2026-07-08)

- [kunde] Stabilerer Seitenaufbau auf dem Handy: Überschriften „springen" beim Laden nicht mehr.

**Fix:** TextReveal mobil layout-neutral — CLS-Quelle bei langen Headlines eliminiert.

Kontext: TextReveal zerlegt Headlines in `display:inline-block`-Wort-Spans; inline-Blocks sind atomar und hebeln `hyphens:auto`/`overflow-wrap` aus. Traf der Webfont nach First Paint ein (langsames Netz — Bilder sättigen die Leitung), brach die H1 auf mehr Zeilen um: blitzsicht.com maß mobil CLS 0,29 / PSI-Performance 100→85 (H1 +81 px bei ~1,1 s). Fix: Reveal-Styles gelten erst ab `min-width: 901px` (Hero-Desktop-Breakpoint); mobil bleiben die Spans normaler Inline-Fluss, sofort sichtbar. Desktop-Animation unverändert. Nach Fix + Font-Preload (customer-seitig): PSI 99, CLS 0.

Flankierend für Webfont-Customer (blitzsicht-Muster, customer-seitig): Fontsource-CSS nie per `@import` einbinden (bringt `font-display:swap`-Faces mit, die optional-Overrides aushebeln) — nur explizite optional-`@font-face` + `<link rel="preload" as="font">`.

**Rollout 2026-07-08:** Alle 11 Live-Customer auf v0.52.2 gebumpt (Build-Gate grün, Prod-Deploys via Vercel-API/Marker verifiziert).

---

## v0.52.0 (2026-07-07)

- [kunde:sichtbar] Auf dem Handy stehen Überschrift und Kontakt-Button jetzt vor dem Foto im ersten Bildschirm — Besucher sehen sofort, worum es geht.

**Fix + Feature:** Hero Mobile-Fold-Korrektur, optionales Confirmation-Foto, plus Abschluss der WS-A/WS-E-Ads-Bausteine (Offline-Conversion-Store, Consent-Checkbox).

Kontext: Auf Split-Hero-Layouts renderte das Bild auf Mobile per `order:-1` VOR H1/Trust/CTA — Verstoß gegen die Mobile-Fold-Regel des Landingpage-Blueprints (`customer-websites/docs/landingpage-blueprint.md`). Die Bestätigungsseite (`DankePage`) hatte kein Foto-Slot für den in der Blueprint-Checkliste (#16) geforderten persönlichen Rückruf-Anker. Parallel wurden die in v0.51.0 begonnenen Ad-Attribution-Bausteine (WS-A/WS-E) fertiggestellt.

Änderungen:

- **`Hero.astro` (Fix):** `order:-1` auf `.hero-image-wrap` in der Mobile-Media-Query (`max-width: 900px`) entfernt. H1 + Trust-Zeile + CTA stehen jetzt im ersten Viewport vor dem Foto (natürliche Dokumentreihenfolge). Betrifft alle Customer mit Split-Hero (`image`-Prop). Rein visuell/additiv, kein API-Change.
- **`DankePage.astro` (Feature):** neue optionale Props `photo?: ImageMetadata` + `photoAlt?: string` — rendert bei Angabe ein rundes Portraitbild (via `astro:assets` `Image`, Retina-srcset) statt des Checkmark-Icons. `photoAlt`-Default = `heading`. Ohne die Props unverändert.
- **`ContactForm.astro` (WS-E):** opt-in `adsConsent`-Prop (Default `false`) — DSGVO-konforme, ungecheckte Marketing-Consent-Checkbox, postet `marketing_consent`. Kein Customer aktiviert es standardmäßig.
- **`conversion-store.js` + `contact-handler.js` (WS-A):** dormanter Offline-Conversion-Store (Neon, optionale peerDependency). Doppelt gegatet (Env `CW_CONVERSION_STORE_URL` + `marketingConsent===true`), `Promise.allSettled`-gekapselt, dynamischer Import — No-op ohne Env/Consent.
- **`plausible-add-goals.mjs` (Tooling):** `--remove`-Rollback-Pfad + Logik-Tests.

**Migrations-Hinweis:** Keiner — vollständig additiv/abwärtskompatibel. Der Hero-Fix greift automatisch beim Pin-Bump (Mobile-Layout ändert die Bild-Reihenfolge; empfohlen: Post-Bump Visual-QA bei 375×667). `photo`-Prop und `adsConsent` sind opt-in.

---

## v0.51.0 (2026-07-06)

- [kunde] Vorbereitung für Werbekampagnen: Anfragen lassen sich cookielos (ohne Cookie-Banner-Zwang) einer Anzeige zuordnen.

**Feature:** Cookielose Ad-Attribution (gclid/utm) + Plausible-Goals-Provisioner — zwei Bausteine für Google-Ads-Lead-Gen ohne Cookie/Consent.

Kontext: Für bezahlte Kampagnen (Pilot Digital-Direkt) fehlte (a) die Zuordnung Ad-Klick → Lead und (b) waren beim Umzug plausible.io → self-hosted CE alle Conversion-Goals verloren gegangen (nur Statistik-CSVs migriert, Goal-Definitionen nicht). Beides wird hier geschlossen — DSGVO-schlank, ohne Browser-Tag.

Neue Features:

- **Ad-Attribution:** `<PlausibleEvents>` sammelt `gclid`/`gbraid`/`wbraid`/`msclkid`/`fbclid` + `utm_*` cookielos aus der URL in `sessionStorage` (überlebt Landing → Kontakt) und feuert einmalig ein `Paid Visit`-Event. `ContactForm` trägt die Werte als Hidden-Felder; `contact-handler` reicht sie (Whitelist, 512-Zeichen-Kappung) in die Lead-Mail (neuer „Herkunft (Kampagne)"-Block) und den Telegram-Push (`📣`-Zeile) durch. Ermöglicht Offline-Conversion-Upload zu Google Ads ohne Enhanced Conversions.
- **Plausible-Goals-Provisioner:** `scripts/onboard/plausible-goals.mjs` (deklarative Goals-SSOT) + `scripts/onboard/plausible-add-goals.mjs` (idempotenter DB-INSERT via ssh→docker psql, Schema-Introspektion, `--dry-run` default). Schließt die CE-Migrationslücke; Goals in Plausible sind rückwirkend.

**Migrations-Hinweis:** Keiner — vollständig additiv/abwärtskompatibel. Ad-Attribution greift automatisch beim Pin-Bump (Hidden-Felder bleiben leer ohne Ad-Klick). Der Goals-Provisioner ist ein Onboarding-Tool (kein Runtime-Impact); Bestandssites via `plausible-add-goals.mjs --domain <domain> --apply` nachziehen.

---

## v0.50.0 (2026-07-06)

**Feature:** Automatische `favicon.ico`-Build-Pipeline — neue Astro-Integration `faviconIco()` erzeugt beim Build aus `public/favicon.svg` eine multi-resolution `favicon.ico` (16/32/48px), plus `<link rel="icon" href="/favicon.ico" sizes="any">`-Fallback in `BaseLayout.astro`.

Kontext: Plausibles DuckDuckGo-basierter Icon-Lookup fragt `/favicon.ico` ab; ohne generierte `.ico` lieferten 7/12 Sites dort 404. Das Feature wurde zunächst versehentlich gegen den deprecateten `main`-Branch gemergt (blitzsicht-ops#491 / cw-core#51) und anschließend auf `release/cw-core` portiert (blitzsicht-ops#509 / cw-core#52).

Neue Nutzung:

- `faviconIco()` aus `@cw/core/integrations/favicon-ico` in das `integrations`-Array der `astro.config.ts` aufnehmen.
- Optionaler Fleet-Sweep via `scripts/sweep-favicon.mjs` (curl über die Kunden-Domains).

**Migrations-Hinweis:** Neue Sites binden `faviconIco()` in `astro.config.ts` ein (siehe `cw-core/docs/onboarding-checklist.md`). Bestandssites erhalten es beim nächsten Pin-Bump (Rollout blitzsicht-ops#507) — bis dahin unverändert lauffähig.

---

## v0.40.0 (2026-06-25)

**Feature:** Footer-Klicks tragen jetzt ihre Source — Plausible unterscheidet Footer von Hero/Sticky, und der Blitzsicht-Backlink zeigt die Kunden-Domain.

Kontext: Footer-Kontaktklicks (Telefon/WhatsApp/Mail) wurden zwar via `PlausibleEvents.astro` getrackt, aber mit `location: "unknown"` — den Footer-Links fehlte ein `data-section`. Und der „Erstellt von Blitzsicht"-Backlink trug nur `?ref=footer`, sodass blitzsicht.com nicht sah, von welcher Kundenseite der Klick kam.

Änderungen:

- `<footer data-section="footer">` + die `wa.me`/`mailto`-Handler in `PlausibleEvents.astro` auf dieselbe `sectionLoc`-Fallback-Kette wie `tel:` harmonisiert (behebt eine bestehende Inkonsistenz). Footer-Kontaktklicks melden nun `location: "footer"` statt `"unknown"`.
- Footer-„Termin buchen"-Link erhält `data-cta="footer:booking"` (vorher gar nicht erfasst).
- Blitzsicht-Backlink: `?ref=footer` → `?utm_medium=footer`; `PlausibleEvents.astro` hängt client-seitig `utm_source=<hostname>` an. Auf blitzsicht.com erscheint damit Source = Kundendomain, Medium = `footer`.

**Migrations-Hinweis:** Keiner — keine neuen Props, keine CSP-Änderung, reiner Pin-Bump. (Falls auf blitzsicht.com ein Plausible-Segment auf `ref=footer` gespeichert war, greift es jetzt über `utm_medium=footer`.)

---

## v0.39.0 (2026-06-25)

> Neuer Block `MapEmbed` — privacy-by-default OpenStreetMap-Embed (click-to-load).
> Erster Karten-Embed im Cluster. Erstkunde: customer-braustall.

### Added

- `src/components/blocks/MapEmbed.astro`: OpenStreetMap-Embed, das **erst nach Nutzer-Klick**
  lädt — kein Drittanbieter-Request beim Seitenaufruf (DSGVO-konform ohne Consent-Banner).
  Prop-driven (`lat`, `lng`, `zoom`, `markerLabel`, `address`, `height`). CSP-Bedarf beim
  Customer: `frame-src https://www.openstreetmap.org`.

---

## v0.38.1 (2026-06-22)

**Fix:** E-Mail-Signatur-Generator behandelt GbR rechtsform-korrekt (§5-DDG-Compliance-Block).

Kontext: Der Signatur-Generator (`templates/email-signature/`) kannte keinen GbR-Fall —
eine GbR fiel in den GmbH-Default und produzierte einen falschen Compliance-Block:
„GF: …" (eine GbR hat keinen Geschäftsführer) plus eine Registergericht-Zeile (eine
nicht-eingetragene GbR hat keinen Registereintrag). Aufgetreten bei
`customer-gottl-richter-gomeier` (normale GbR, 3 Gesellschafter).

Änderungen (lokales Tooling, kein Customer-Bump nötig):

- `generate.sh`: neuer `*gbr*`-Case im Compliance-Builder. Nennt „vertretungsberechtigt:
  <Gesellschafter>" statt „GF:". Registerzeile nur wenn eine echte Registernummer (`HRB`)
  vorliegt — fängt damit auch tote `registry`-Felder ab, die fälschlich ein Amtsgericht führten.
- `read-customer-data.py`: mappt `legal.representatives[]` → `REPRESENTATIVES` (alle
  vertretungsberechtigten Gesellschafter). `UST_ID` liest weiterhin `ustIdNr` vor `taxId`,
  sodass die echte USt-IdNr statt einer Steuernummer in die Signatur kommt.

**Migrations-Hinweis:** Keiner. Reines Generator-Tooling — Customer-Repos importieren das
nicht via `@cw/core`-Pin. GbR-Customer profitieren bei der nächsten Signatur-Regenerierung.

---

## v0.38.0 (2026-06-21)

**Feature:** `ImpressumBlock` rendert Firmenname + Rechtsform; Impressum-Linter gegen §5-DDG-Lücken.

Kontext: Bei `customer-gottl-richter-gomeier` (eingetragene GbR / eGbR) stand im Impressum
nur die Privatperson („Gottl Reiner"), nicht die Firma. Ursache: `ImpressumBlock` rendert
seit jeher nur `legal.owner` + Adresse — das vorhandene `legal.company`-Feld (Firmenname
inkl. Rechtsform) und `legal.form` wurden nie ausgegeben. Zusätzlich zeigte der Block
Vertretungsberechtigte nur für GmbH/UG/AG/GmbH-Co-KG, nicht für (e)GbR. Eine Falle für
jeden Customer, der die Firma sauber in `company` statt in einen firmierten `owner` legt.

Änderungen:

- `ImpressumBlock`: wenn `legal.company` gesetzt ist, wird der Firmenname als erste
  § 5 DDG-Zeile gerendert (statt `owner`); `owner` gilt dann als Vertreter-Person.
  Customer ohne `company` (firmierter `owner`) bleiben unverändert.
- `showRepresentatives` deckt jetzt auch `gbr`/`egbr` ab — bei einer GbR sind die
  Gesellschafter vertretungsberechtigt und müssen genannt werden.
- `LegalProps` um optionales `company?: string` erweitert.
- Neuer Impressum-Linter in `ai-discovery` (`lintImpressumLegalForm` + `ImpressumIssue`,
  Build-Warnung in `astro:config:done`): meldet (1) eine Gesellschaft ohne Firma/Rechtsform
  im Impressum und (2) eine eingetragene Rechtsform ohne Registernummer. Neue Option
  `strictImpressum` (Default false → Warnung; true → Build-Fail). 9 neue Unit-Tests.

**Migrations-Hinweis:** Keiner. Additiv + rückwärtskompatibel — Customer mit firmiertem
`owner` (z. B. „Soleno GmbH") rendern identisch wie bisher. Wer `legal.company` setzt,
bekommt automatisch den Firmennamen als erste Impressum-Zeile.

---

## v0.37.0 (2026-06-21)

**Feature:** `buildBookingUrl` — getrackte Cal.com/cal.eu-Buchungs-URLs.

Kontext: Buchungs-CTAs (Header, Sticky, Footer, Hero, Branchen-/Blog-/Audit-Seiten,
Monats-Report) liefen bisher ohne Attribution — man wusste nicht, welche Stelle eine
Buchung ausgelöst hat. Neuer Util `@cw/core/utils/booking-url` hängt eine konsistente
UTM-Konvention (+ optional `notes`-Prefill) an die Buchungs-URL.

Neue API:

- `buildBookingUrl(base, { content, source?, medium?, campaign?, term?, notes? })` —
  hängt `utm_source` / `utm_medium` / `utm_campaign` / `utm_content` (+ optional
  `utm_term`, `notes`) an. Defaults: `source=website`, `medium=web`, `campaign=booking`.
- UTM-Konvention (SSOT): `utm_source` = Ursprung · `utm_medium` = Fläche ·
  `utm_campaign` = Kontext · `utm_content` = Placement (header/sticky/footer/hero/
  branche-…/blog/audit) · `utm_term` = optional.

**Migrations-Hinweis:** Keiner — rein additiver Util, kein Default-Verhalten geändert.
Consumer nutzen ihn opt-in: `import { buildBookingUrl } from '@cw/core/utils/booking-url'`.

---

## v0.36.0 (2026-06-19)

**Feature:** `ImpressumBlock` — optionales Feld `steuernummer`.

Kontext: Manche Kunden möchten neben der USt-IdNr. auch die Steuernummer des Finanzamts im Impressum ausweisen (nicht §5-DDG-Pflicht, aber zulässig auf Kundenwunsch). Bisher konnte der `ImpressumBlock` nur die USt-IdNr. rendern.

Neue Props (optional, backwards-kompatibel):

- **`ImpressumBlock`** (`components/blocks/ImpressumBlock.astro`): `LegalProps.steuernummer?: string` → rendert eine eigene Section „Steuernummer" direkt nach der USt-IdNr.-Section. Wird nur ausgegeben, wenn gesetzt.

Beispiel:

```ts
// site-data.ts → legal
steuernummer: '244/277/32351'
```

**Migrations-Hinweis:** Keiner. Rein additiv — Repos ohne `legal.steuernummer` rendern unverändert.

---

## v0.35.0 (2026-06-18)

> Design-Polish-Paket: Form-Health Opt-out, Gradient-Entblauen + steuerbares
> Token, neue DesignPreviewBanner-Komponente. Drei Fixes die auf verwaister
> main-Linie (v0.13) landeten, jetzt sauber gegen v0.34 portiert.
> Refs: blitzsicht-ops#367, #371, #372.

### Added

- `scripts/verify-form-health.mjs`: **Opt-out (a)** — `SKIP_FORM_HEALTH=true`
  Env-Var (Exit 0, ganz am Anfang vor SITE_URL-Check). Ersetzt die bisherige
  Nur-Variable-Condition im CI-Workflow (`vars.SKIP_FORM_HEALTH != 'true'`).
- `scripts/verify-form-health.mjs`: **Opt-out (b)** — `contactForm: false` in
  `src/data/site-data.ts` (CWD-relativ, readFileSync, regex `\bcontactForm\s*:\s*false\b`).
  Fail-open wenn Datei fehlt (kein Crash). Ermöglicht Code-seitigen Opt-out
  ohne Repository-Variable setzen zu müssen.
- `scripts/verify-form-health.test.mjs`: 5 Logik-Tests via `node:test`
  (beide Opt-out-Pfade, Fail-open, Negativ-Test).
- `src/components/layout/DesignPreviewBanner.astro`: Neue Komponente für
  Design-Vorschau-Banners. Props: `customerName` (Pflicht), `dismissVersion`
  (optional, Default `"v1"`). Sticky-top, dismissible via localStorage,
  neutral Anthrazit (#1f2937), BEM `cw-preview-banner__*`-Klassen.
  Import: `@cw/core/components/layout/DesignPreviewBanner.astro`.

### Changed

- `Hero.astro`, `CTABlock.astro`, `KarriereHero.astro`, `PageHero.astro`,
  `CalEmbed.astro`: Gradient-Endfarbe von hardcoded Blau-Fallbacks (`#0f3460`,
  `#141528`, `color-mix(..., black 25%)`) auf neues Token
  `--color-hero-gradient-end` umgestellt. Default-Berechnung:
  `color-mix(in srgb, var(--color-primary), #000 35%)` — folgt damit der
  Customer-Primärfarbe statt immer blau zu werden.
- `src/styles/tokens-base.css`: Kommentar-Doku für `--color-hero-gradient-end`
  (optional, muss in `:root` gesetzt werden, nicht `@theme`).
- `src/templates/tokens.template.css`: `:root`-Block mit auskommentiertem
  `--color-hero-gradient-end` und Erklärung warum `:root` statt `@theme`.
- `package.json`: Test-Script erweitert auf `scripts/**/*.test.mjs`.
- Version: 0.34.0 → **0.35.0** (Minor: neue Komponente + neues Token).

---

## v0.34.0 (2026-06-11)

**Feature:** Sticky-Schnellkontakt mit cal-Booking-Button + site-weites Layout-Wiring + Footer-WhatsApp/Booking-Links.

Kontext: Wenn Booking-CTAs extern auf cal.eu verlinken, braucht es einen persistenten Conversion-Pfad (Terminbuchung + WhatsApp) ohne pro Seite manuell platzierte Buttons. Aufbauend auf dem bestehenden `StickyContact` (WhatsApp + Telefon, Floating-Cluster bottom-right).

Neue Props (alle optional, backwards-kompatibel):

- **`StickyContact`** (`components/blocks/StickyContact.astro`): `calUrl` (+ `calLabel`) → rendert einen 📅-Termin-Button im Cluster (Reihenfolge Termin · WhatsApp · Telefon), `target="_blank"`, DSGVO-clean Direkt-Link, Plausible-Track `channel='sticky-cal'`.
- **`LandingPage`** (`layouts/LandingPage.astro`): `stickyContact?: { calUrl?, calLabel?, whatsapp?, phone?, prefilledMessage?, hideOnMobile? }` → rendert `<StickyContact>` nach dem Footer. Eine Config aktiviert den Cluster site-weit über alle LandingPage-Seiten; ContentPage (Legal/Blog) bleibt ausgenommen.
- **`Footer`** (`components/layout/Footer.astro` + `FooterConfig`): `whatsapp` + `bookingUrl` → rendern als „WhatsApp"- und „Termin buchen"-Links in der Brand-Spalte (neben email/phone, `target="_blank"`).

Beispiel:

```ts
// LandingPage-Props
stickyContact: { calUrl: 'https://app.cal.eu/firma/30min', whatsapp: '+49…', phone: '+49…', hideOnMobile: true }
// FooterConfig
footer: { …, whatsapp: '+49…', bookingUrl: 'https://app.cal.eu/firma/30min' }
```

**Migrations-Hinweis:** Keiner — alle Props optional, ohne Angabe rendert nichts Neues. Bei vorhandener `StickyMobileCTA` auf Mobile `stickyContact.hideOnMobile: true` setzen, um Überlappung am unteren Rand zu vermeiden.

---

## v0.33.0 (2026-06-11)

**Feature:** Optionales `target`/`rel` auf Hero- und Header-CTAs (externe Booking-Links im neuen Tab).

Kontext: Hero- und Header-CTA werden aus `site-data` gerendert und konnten bisher **kein** `target` setzen. Für einen externen Direkt-Link (z. B. cal.eu-Buchungsseite) im neuen Tab — DSGVO-sauber, kein Embed-Script auf der eigenen Domain, konsistent mit dem bestehenden `FloatingCalButton` — fehlte die Möglichkeit. Blitzsicht stellt damit seine Buchungs-CTAs auf 1-Klick-Direkt-Links um.

Neue Props (beide optional, Default-Verhalten unverändert):

- **`HeroCTA`** (`components/blocks/Hero.astro`): `target?: string` + `rel?: string` — gerendert auf `ctaPrimary` und `ctaSecondary`.
- **`NavItem`** (`components/layout/Header.astro`): `target?: string` + `rel?: string` — gerendert auf highlight- und normale Nav-Links.

Beispiel:

```ts
ctaSecondary: { label: '30-Min-Gespräch buchen', href: 'https://app.cal.eu/firma/30min', target: '_blank', rel: 'noopener noreferrer' }
```

**Migrations-Hinweis:** Keiner — Props sind optional, ohne Angabe rendert kein `target`/`rel` (wie bisher). Nur Customer, die externe CTA-Links im neuen Tab wollen, setzen sie.

---

## v0.32.2 (2026-06-11)

**Feature + Fix:** Aktive Fehlmeldung bei fehlender Form-Env + bing-indexnow-Guard.

Kontext: Fehlte eine Env-Var (`CONTACT_EMAIL`/`RESEND_API_KEY`), verschluckte der Handler das still (nur `console.error` + 500) → niemand merkte es, der Lead war weg. Außerdem crashte `bing-indexnow` kryptisch (`undefined.replace`), wenn `siteUrl` nicht übergeben wurde (Config-Drift) → Vercel-Build-Fail.

- **`api/contact-handler.js`**: Bei fehlendem `CONTACT_EMAIL`/`RESEND_API_KEY` wird der Lead jetzt VOR dem 500 via `emitLead(..., { deliveryError })` an Telegram gemeldet → Ops wird **aktiv alarmiert** UND der Lead geht **nicht verloren** (kommt mit dem Alarm). Voraussetzung: `TELEGRAM_BOT_TOKEN`/`CHAT_ID` gesetzt (sonst still wie bisher).
- **`api/lead-sink.js`**: `emitLead`/`formatTelegramMessage` unterstützen `ctx.deliveryError` → `⚠️ ZUSTELLUNG FEHLGESCHLAGEN (<grund>)`-Warn-Header vor der Lead-Darstellung. +3 node:tests.
- **`integrations/bing-indexnow/index.ts`**: Guard — fehlt `siteUrl`, wird die Integration sauber deaktiviert (Warn-Log) statt den Build abzubrechen.

**Migrations-Hinweis:** Keiner zwingend (Verhalten ist additiv/defensiv). Re-Pin auf v0.32.2 aktiviert die Fehlmeldung; ideal zusammen mit der RESEND-Shared-Var-Migration.

---

## v0.32.1 (2026-06-10)

**Fix:** Build-Robustheit (optimize-images) + Origin-Drift-Guard — beide aus dem Kontaktformular-Vorfall.

Kontext: Beim Cluster-Rollout zeigte sich: (1) `optimize-images.mjs` crasht mit `ENOENT public/images`, wenn ein Customer keine Bilder in dem Ordner hat (zink) → Vercel-Build schlägt fehl → altes Deployment bleibt live (mit veralteter Config). (2) zinks `allowedOrigins` zeigte nach Domain-Migration noch auf die tote `zinkbaeckerei.de` → Origin-Check lehnte echte Nutzer mit 403 ab.

- **`scripts/optimize-images.mjs`**: fehlendes Bild-Verzeichnis wird sauber übersprungen (`ENOENT → []`, „No images found"), statt den Build abzubrechen. Robust für image-lose Customer.
- **`scripts/validate-form-backend.mjs`**: zusätzlicher **Origin-Drift-Guard** — `allowedOrigins` in `/api/contact.ts` MUSS die Serving-Domain (aus astro.config `site`/site-data `url`) enthalten, sonst **exit 1** (www-tolerant). Hätte zinks 403 zur Build-Zeit gefangen.

**Migrations-Hinweis:** Customer-Repos auf v0.32.1 pinnen. Wer eine falsche `allowedOrigins`-Domain hat, dessen CI wird jetzt rot, bis es korrigiert ist.

---

## v0.32.0 (2026-06-10)

**Fix + Feature:** Kontaktformulare funktionsfähig + harter Guard gegen tote Formulare.

Kontext (Vorfall 2026-06-10): donau-profis Kontaktformular postete an `/api/contact`, aber die Route-Datei `/api/contact.ts` fehlte → 404 → still tot. Bei mika & Co existiert die Route, doch der Handler erzwang **Turnstile** — ohne konfiguriertes Widget → 400 „Bot-Schutz-Prüfung fehlt". Resultat: ausgelieferte Seiten mit nicht-funktionierendem Formular. Das darf strukturell nicht passieren.

- **`api/contact-handler.js`: Turnstile jetzt OPTIONAL** — nur erzwungen, wenn `TURNSTILE_SECRET_KEY` gesetzt ist; sonst übersprungen. Die übrigen Schichten (Honeypot, Rate-Limit, Origin-Check, Content-Filter, Email-Validation) bleiben aktiv. Formular funktioniert damit mit `RESEND_API_KEY` + `CONTACT_EMAIL` allein. Backward-compatible: mit gesetztem Secret weiterhin Pflicht.
- **NEU `scripts/validate-form-backend.mjs`** — CI-Gate (build-check.yml-Step): **exit 1**, wenn eine Seite an `/api/contact` postet, aber `/api/contact.ts` (root, Vercel Function) bzw. `src/pages/api/contact.ts` fehlt → kein totes Formular kann mehr deployen.
- **`scripts/verify-form-health.mjs` gehärtet** — `/api/contact` **404 = FAIL** (vorher als „sauberes 4xx" durchgewunken, der eigentliche Blind-Spot). Turnstile-Checks jetzt konditional (Widget vorhanden → Konsistenz prüfen, sonst valider Zustand).
- **NEU `templates/api-contact.ts`** — Onboarding-Vorlage (root `/api/contact.ts`, `{{DOMAIN}}`/`{{LEGAL_NAME}}`).
- **`PriceTransparency.astro`** — `.container`-Begrenzung (`max-width` + horizontales Padding) ergänzt; lief vorher über volle Viewport-Breite (Text links abgeschnitten).

**Migrations-Hinweis:** Customer-Repos auf v0.32.0 pinnen + build-check.yml-Step `validate-form-backend.mjs` übernehmen. **donau-profi** braucht eine neue `/api/contact.ts`. Pflicht-Env je Vercel-Projekt: `RESEND_API_KEY` (account-weit) + `CONTACT_EMAIL` (= siteData.contact.email). Turnstile optional.

---

## v0.31.1 (2026-06-10)

**Fix:** CI-Gate lauffähig machen — `ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING` behoben.

Kontext: v0.31.0 ließ die CI-Scripts (`validate-csp.mjs`/`gen-vercel-csp.mjs`) die Logik aus `csp-check.ts`/`csp-build.ts` importieren. Im Customer-CI liegen diese Module aber **unter `node_modules`**, und Node weigert sich, dort TS-Typen zu strippen → der harte Gate-Step brach mit Exit 1 aus dem falschen Grund (Pilot donau-profi CI rot). Ein Gate, der aus technischen Gründen immer rot ist, wird vom Operator entnervt deaktiviert — also Pflicht-Fix vor Cluster-Rollout.

- **`csp-check.ts` → `csp-check.js` + `csp-check.d.ts`**, **`csp-build.ts` → `csp-build.js` + `csp-build.d.ts`** — reines JS (`// @ts-check` + JSDoc) für node_modules-Lauf, Typen separat für TS-Consumer. Logik identisch.
- **`gen-vercel-csp.mjs`:** `out.replace(csp, fixed)` → `out.split(csp).join(fixed)` (ersetzt jetzt **alle** CSP-Vorkommen, z. B. zusätzlicher Report-Only-Header — Review-Major-Finding).
- **`csp-check.js` SELF_DIRECTIVES** um `media-src`/`img-src` ergänzt (Review-Finding: Pragma-Origin-Check deckte sie nicht ab).
- **`fixCsp` aktive Security-Sanitisierung:** strippt `'unsafe-eval'`/`*`/`https:`/`http:` aus Script-Direktiven + ergänzt `frame-ancestors 'none'` (defense-in-depth, falls der Gate mal nicht läuft).
- Tests + alle Modul-Imports (`index.ts`, beide Scripts, beide Test-Dateien) auf `.js` umgestellt. 29 Tests grün.

**Migrations-Hinweis:** Keiner für Komponenten-Consumer (interne Umstrukturierung). Customer-Repos auf v0.31.1 pinnen statt v0.31.0, sonst bleibt das CI-Gate rot.

---

## v0.31.0 (2026-06-10)

**Feature:** Harter, repo-übergreifender CSP-Gate — kaputte CSP kann nicht mehr live gehen.

Kontext: Der v0.30-Soft-Warn-Guard hätte den donau-profi-Vorfall **nicht** gestoppt (Vercel liest vercel.json vor dem Build, Build-Log-Warnung blockt keinen Deploy). `/review` (critic+plan-reviewer+aegis) verlangte: hartes Gate, exakter Host-Match, echte Security-Checks. User-Entscheidung: Generator-Ansatz (drift-frei by-design).

Neu in `ai-discovery`:
- **`csp-build.ts`** — `buildCsp(origin, opts)` (SSOT, kanonische CSP) + `fixCsp(existing, origin)` (repariert bestehende CSP: Pragma-Origin neben jedes `'self'`, `object-src 'none'`/`base-uri 'self'`, `*-elem`-Konsistenz — ohne Dienst-Hosts zu verlieren, idempotent).
- **`scripts/validate-csp.mjs`** — CI-Backstop: `exit 1` bei jedem Verstoß. Als Step in `build-check.yml`-Template → CI rot **vor** Vercel-Deploy, repo-übergreifend, unabhängig von astro.config-Flags.
- **`scripts/gen-vercel-csp.mjs`** — regeneriert die vercel.json-CSP (ersetzt nur den CSP-Header, bewahrt redirects).
- **`csp-check.ts` gehärtet:** exakter Host-Match statt substring (`tokenHost`, behebt `profi.de`⊂`donau-profi.de`-False-Positive), www-Normalisierung, `parseCsp` erste-Direktive-gewinnt (Spec), neue Security-Checks `unsafe_eval`/`script_src_wildcard`/`missing_object_src`/`missing_base_uri`.
- Tests: 21 (csp-check) + 8 (csp-build), alle grün.

**Migrations-Hinweis:** Customer-Repos bekommen den CI-Step via build-check.yml-Rollout; `gen-vercel-csp` regeneriert ihre CSP (ergänzt object-src/base-uri). Cluster-Scan v0.31: blitzsicht konform, ~10 fehlten object-src/base-uri, weinkontor+siluri-de fehlte Pragma — alle per Rollout gefixt.

---

## v0.30.0 (2026-06-10)

**Feature:** CSP-Guard erkennt jetzt den `'self'`-ohne-Origin-Bug (`self_without_origin`).

Kontext: `'self'` **allein** matcht same-origin Assets in Chrome/Edge/Safari (auch Inkognito) auf cw-core/Astro/Vercel-Static-Sites nicht zuverlässig → CSS/JS/Plausible geblockt, Seite ungestyled. Der Fix (expliziter Origin neben `'self'`) war seit 12.05. in `CLAUDE.md` + `docs/CSP-rationale.md` dokumentiert — aber nur **passiv**, und wurde beim donau-profi-Live-Gang (09.06.) übersehen → erneut stundenlanges Phantom-Debugging. Konsequenz: aus passiver Doku wird ein aktiver Build-Guard.

`ai-discovery/csp-check.ts` bekommt eine neue Option `siteOrigin` (aus `siteData.url`); prüft jede `'self'`-Source-Direktive (`default-src`, `script-src{,-elem}`, `style-src{,-elem}`, `font-src`, `connect-src`) auf den expliziten Origin und warnt im `astro:build:done`-Hook. +4 node:test-Cases (15 gesamt).

**Migrations-Hinweis:** Keiner für cw-core. Aber: Customer-`vercel.json` mit nur-`'self'`-CSP müssen den Pragma-Fix (`https://<domain>` neben `'self'`) bekommen — der Guard meldet sie ab nächstem Build. donau-profi bereits gefixt; übrige Customer folgen.

---

## v0.29.0 (2026-06-09)

**Feature:** CSP-Drift-Guard in der `ai-discovery`-Integration (build-time). Koexistiert mit dem Brand-Name-Literal-Guard aus v0.28.0 (PR #46) im selben `astro:build:done`-Hook.

Kontext: Das "DD-CSP-Mystery" (11.–12.05.2026) zeigte das Symptom `style-src-elem 'self'` blockt eigene `/_astro/*.css`. Damals nur per Re-Deploy umgangen, Root-Cause offen gelassen, kein Guard gebaut — Verstoß gegen die #1-Regel. Der konkrete Vorfall war ein gecachter alter CSP-Stand im Browser; der *wiederholbare* Bug dahinter ist CSP-Drift: 8/11 Customer-Repos hatten zeitweise unvollständige CSPs (manuell am 11.05. nachgezogen). Jetzt als zero-config Build-Check codifiziert.

Neuer Check (`src/integrations/ai-discovery/csp-check.ts`), läuft im `astro:build:done`-Hook gegen die Customer-`vercel.json`:

- fehlende `*-elem`-Direktiven (`style-src` ohne `style-src-elem`, analog `script-src`)
- fehlendes `media-src` (stiller `default-src`-Fallback — der DD-Fall)
- `*-elem` schmaler als die Basis-Direktive (z. B. `'unsafe-inline'` fehlt)
- Analytics-Host (`plausible.io`) nicht in `script-src-elem` **und** `connect-src`
- Smart-Quotes / Nicht-ASCII im CSP-String (U+2018/U+2019 statt ASCII `'`)

Soft-Warn per Default; `strictCsp: true` → Build-Fail. Neue Optionen: `checkCsp` (default `true`), `strictCsp`, `analyticsHost`. Logik als pure, testbare Funktionen (`parseCsp`, `checkCspCompleteness`, `extractCspValuesFromVercelJson`) mit 11 `node:test`-Cases. Cluster-Scan beim Release: 13 Live-Repos, 1 echter Drift gefunden + gefixt (digital-direkt fehlte `media-src`).

**Migrations-Hinweis:** Keiner — zero-config, greift automatisch bei Customern die `aiDiscovery()` nutzen (12/14). Soft-Warn, bricht keinen Build.

---

## v0.28.0 (2026-06-08)

> Brand-Name-Literal-Guard in der ai-discovery-Integration. Verhindert, dass
> triviale Umbenennungen zur teuren Multi-File-Aktion werden. Auslöser:
> customer-mika-elektrotechnik hatte ~30 Literal-Duplikate in 13 Dateien
> (blitzsicht-ops#316).

### Added

- ai-discovery prüft in `astro:config:done` alle Prosa-Felder in `siteData`
  (description, tagline, FAQs, Leistungen) auf Literal-Duplikate des Brand-Namens
  (`siteData.name`). Loggt Warnungen mit Feld-Pfad + Vorkommen-Count.
- ai-discovery prüft in `astro:build:done` die generierte `dist/robots.txt`
  auf Brand-Name-Literale (robots.txt braucht den Namen nie).
- Neue Option `AiDiscoveryOptions.strictBrandName` (Default `false` = Warnung,
  `true` = Build-Fail).
- Neue exportierte Funktionen `lintBrandNameInSiteData()` und
  `lintBrandNameInRobotsTxt()` für Unit-Tests und CI-Skripte.
- `docs/brand-name-convention.md` — vollständige Konvention mit Beispielen,
  Cluster-Scan-Befehl und Rollout-Plan.
- 11 Logik-Tests in `tests/ai-discovery/brand-name-linter.test.js`.

### Added (CLAUDE.md)

- Brand-Name-Konvention als eigenen Abschnitt in CLAUDE.md dokumentiert.

---

## v0.27.0 (2026-05-30)

> Meta-Length-Linter in der ai-discovery-Integration. Fängt zu lange `<title>`-
> und `<meta name="description">`-Werte, die Google in den SERPs truncated
> (≈ 60 Zeichen Title, ≈ 160 Zeichen Description) → CTR-Verlust ohne sichtbares
> Symptom im Code. Cluster-Audit blitzsicht 2026-05-30: 13/42 Titles und
> 12/42 Descriptions zu lang.

### Added

- ai-discovery prüft im `astro:build:done`-Hook (nach Schema-Linter) für jede
  `dist/**/index.html` die Längen von `<title>` und `<meta name="description">`.
- Default-Schwellen: Title 60, Description 160. Beide konfigurierbar via
  `AiDiscoveryOptions.maxTitleLength` und `maxDescriptionLength`.
- Sekundär: warnt wenn `<title>` oder Description ganz fehlen.
- Neue Option `AiDiscoveryOptions.strictMeta` (Default `false` = nur Warnung,
  `true` = Build-Fail).
- Whitespace-Normalisierung + HTML-Entity-Dekodierung für korrekte Längen-Messung.

---

## v0.26.1 (2026-05-30)

> Bugfix zu v0.26.0: BaseLayout.astro reichte die neuen `slogan` + `numberOfEmployees`
> Props nicht an SchemaOrg durch (in v0.26.0 nur am SchemaOrg-Type, nicht im Pass-through).

### Fixed

- `SchemaProps.slogan` + `SchemaProps.numberOfEmployees` jetzt korrekt von BaseLayout an
  SchemaOrg.astro weitergereicht (vorher: in Type da, aber im JSX-Block fehlten die Lines).

---

## v0.26.0 (2026-05-30)

> SchemaOrg.astro um `slogan` + `numberOfEmployees` erweitert. Schließt die Lücke,
> wegen der customer-blitzsicht einen eigenen `orgSupplementSchema`-Block mit
> doppelter `@id="#organization"` brauchte (war Auslöser des Schema-Duplikat-Bugs).

### Added

- `SchemaOrgProps.slogan?: string` — emittiert als schema.org `slogan` auf der
  LocalBusiness-Node.
- `SchemaOrgProps.numberOfEmployees?: number | string` — emittiert als
  `numberOfEmployees: { @type: QuantitativeValue, value }`.

Beide optional, additive — bestehende Customer ohne diese Props unverändert.

---

## v0.25.0 (2026-05-30)

> Schema-Linter in der ai-discovery-Integration. Fängt den Drift, der bei blitzsicht
> und zink-baeckerei auftrat: Customer-Pages emittieren parallel zu cw-core SchemaOrg
> eigene JSON-LD-Blöcke mit identischer `@id` (z.B. `#organization`). Google Rich
> Results meldet das als doppelte Entität → unterdrückte/fragile Rich Results.

### Added

- ai-discovery prüft im `astro:build:done`-Hook jede `dist/**/index.html` auf doppelte
  JSON-LD-`@id`s (Top-Level + `@graph`). Bei Duplikat → Warnung (mit `strictSchema: true`
  → Build-Fail).
- Sekundär-Checks im selben Lauf: warnt bei JSON-LD-Blöcken ohne `@context` oder ohne
  `@type` und bei kaputtem JSON (Validität-Smoke-Test).
- Neue Option `AiDiscoveryOptions.strictSchema` (Default `false` = nur Warnung).

### Why

cw-core SchemaOrg.astro emittiert standardmäßig ein `Organization`-Schema mit
`@id="${url}/#organization"`. Customer-Pages (Inline-JSON-LD im index.astro,
eigene BranchesSchema-Komponenten etc.) emittieren manchmal parallel Schemas mit
derselben `@id` — niemand prüfte das. Cluster-Scan 2026-05-30 ergab 2/9 Live-Sites
betroffen (blitzsicht, baeckereizink). Linter greift zero-config bei allen Customern.

---

## v0.24.0 (2026-05-29)

> Domain-Guard in der ai-discovery-Integration. Fängt den Drift, der bei zink-baeckerei
> auftrat: `astro.config.site` zeigte auf die echte Domain, `site-data.url` auf eine
> Tippfehler-/tote Domain — canonical, Schema, Sitemap und die generierte llms.txt
> verwiesen dadurch auf die falsche Domain (stiller SEO-Killer).

### Added

- ai-discovery prüft im `astro:config:done`-Hook, ob `astro.config.site` und
  `siteData.url` auf dieselbe Domain zeigen (www-tolerant). Bei Mismatch → Warnung
  (mit `strictDomain: true` → Build-Fail).
- Fehlt `astro.config.site` ganz → Warnung (canonical/Sitemap hätten keine Basis-URL).
- Bei Vercel-Production-Builds mit echter Custom-Domain: zusätzlicher Abgleich von
  `siteData.url` gegen `VERCEL_PROJECT_PRODUCTION_URL` (Ground-Truth der deployten Domain).
- Neue Option `AiDiscoveryOptions.strictDomain` (Default `false` = nur Warnung).

### Why

`site-data.url` wird von Hand gepflegt und war gegen nichts validiert. Der Guard greift
zero-config bei allen Customern, die ai-discovery bereits einbinden — kein astro.config-Rollout nötig.

---

## v0.23.0 (2026-05-29)

> Briefing-Form Vorausfüllung. Additive, backward-compatible — bestehende `briefing-fields.ts`
> ohne `prefill` rendern unverändert.

### Added

- `BriefingField.prefill?: string` — vorausgefüllter Feldwert (Recherche/Vermutung). `BriefingForm.astro`
  rendert ihn als initialen `value` (text/email/phone), `<textarea>`-Inhalt, `<option selected>` (select)
  bzw. `checked` (radio/checkbox).
- `BriefingField.prefillNote?: string` — optionaler Marker-Text statt Default
  ("Vorausgefüllt — bitte prüfen"); für Quelle/Confidence, z. B. "aus Handelsregister — bitte bestätigen".
- Visuelle Markierung: amber Badge + amber Feld-Hintergrund/Border (`#fffbeb` / `#fcd34d`) für
  vorausgefüllte Felder. Beim ersten User-Edit verschwindet die Markierung (persistiert via
  `<storageKey>__touched` in localStorage → bleibt auch nach Reload entfernt).
- Vorausgefüllte Felder zählen sofort zum Progress-Bar → "fast fertig"-Effekt senkt die
  Aktivierungshürde im Onboarding.

---

## v0.22.0 (2026-05-26)

**Workflow:** Hard Rule "Customer-Repos enthalten keine UI-Logik" + `/cw-component-audit` Slash-Command.

Komponenten-Audit-Workflow für Customer-Repos. Verstoß-Erkennung via Slash-Command in cw-core.
Slice in `customer-websites/learnings/no-custom-components-in-customer-repos.md` (`applies_to: *`),
gesynct in alle Customer-`MEMORY.md`.

Zusätzlich Cleanup-Release: Tag-Schema kanonisiert auf `release/cw-core/vX.Y.Z`, parallele `v1.0.x`-Schatten-Tags gelöscht. Single Source of Truth: `cw-core/docs/RELEASE.md`. `cw-release` Skill aktualisiert (`-alpha`-Suffix raus, Tooling/Doku-Release-Case rein, 14-Repo-Loop mit dry-run).

**Migrations-Hinweis:** Keiner — kein API-Change. Customer-Repos können bei v0.21.2 bleiben. Hard-Rule wird via Memory-Sync-System verteilt, nicht via `@cw/core`-Import.

---

## v0.21.2 (2026-05-26) — (release/cw-core — Review-Polish zu v0.21.0)

> Kleine Korrekturen aus dem Code-Review der v0.21.0-Komponenten, vor dem Multi-Customer-Rollout
> der Breadcrumb-bar. Rein additiv/kosmetisch, keine API-Änderung. (Hinweis: package.json war seit
> v0.21.0 nicht gebumpt — mit diesem Release auf 0.21.2 synchronisiert.)

### Fixed

- `Breadcrumbs.astro` (`variant="bar"`) — Trennstrich nutzt jetzt
  `color-mix(in srgb, var(--color-muted) 22%, transparent)` statt des **nicht existierenden**
  `--color-border`-Tokens → theme-abgeleitet statt Hardcode `#e7e8ee`.
- `Hero.astro` — `imageSrc`-Pfad: `imageSizes` defaultet auf `"(max-width: 767px) 100vw, 45vw"`
  (gleicher Wert wie der `<Image>`-Pfad) falls nicht gesetzt → kein `srcset` ohne `sizes`-Hint.
  Plus `imageSrc!`-Assertion (TS-Sauberkeit; durch `hasImage`-Guard ohnehin truthy).

---

## v0.21.1 (2026-05-26) — (release/cw-core — verify-form-health Auto-Skip für form-lose Customer)

> Patch: `scripts/verify-form-health.mjs` skippt sich selbst (exit 0) wenn `/kontakt/`
> kein `<form>`-Element enthält. Behebt False-positive failures bei phone-/whatsapp-only
> Customer (z.B. hausamlago, Markus Eules Setup). Override via `FORCE_FORM_CHECK=1`.

### Changed

- `scripts/verify-form-health.mjs` — Pre-Check vor den 6 Form-Health-Checks: wenn kein
  `<form\b`-Element in `/kontakt/` HTML, exit 0 mit Info-Message. Kein per-Customer
  `SKIP_FORM_HEALTH` Workflow-Gate mehr nötig. `FORCE_FORM_CHECK=1` erzwingt die alten
  Checks (für Debug oder wenn ein Customer fälschlich form-los rendert).
- Plus: `/kontakt/`-status≠200 → fail-fast vor allen anderen Checks (vorher implizit, jetzt explizit).

### Notes

- Backward-compatible: alle Customer mit Form sehen unverändertes Verhalten.
- Customer-Workflow-Override (`vars.SKIP_FORM_HEALTH != 'true'` in build-check.yml) bleibt
  weiter gültig — wird mit nächster `rollout-build-check.sh`-Welle aufgeräumt.

---

## v0.21.0 (2026-05-26) — (release/cw-core — Hero public-URL-Bild + Breadcrumbs bar-Variante)

> Zwei additive, backward-kompatible Erweiterungen. Anlass: gottl-Production-Regressionen
> nach der @cw/core-Migration — Homepage-Hero-Foto fehlte (public-Asset, kein astro:assets-Import
> möglich) und Breadcrumbs standen über dem Hero (page-lokales `bc-wrap` zwischen Nav und Hero).
> Reusability-first für alle Customer.

### Added

- `components/blocks/Hero.astro` — optionale public-URL-Bild-Props `imageSrc` / `imageSrcset` /
  `imageSizes` / `imageWidth` / `imageHeight`. Triggert dasselbe Split-Layout wie `image`
  (ImageMetadata), rendert aber ein natives `<img>` mit `loading=eager`/`fetchpriority=high`.
  Für Customer, deren Hero-Foto in `public/` liegt (z.B. zusätzlich als CSS-Background) und
  eigene responsive Varianten mitbringt. `image` (ImageMetadata) hat Vorrang.
- `components/blocks/Breadcrumbs.astro` — `variant: 'plain' | 'bar'` (Default `'plain'`) +
  `maxWidth`. `variant="bar"` rendert eine **self-contained Surface-Leiste** mit eigenem
  Container (Brand-Tokens `--color-surface`/`--color-border`/`--container-max`) — direkt UNTER
  den Hero platzieren, kein page-lokaler Wrapper (`bc-wrap`) mehr nötig.

### Notes

- Beide non-breaking: bestehende `Hero image={…}`-Aufrufe und `Breadcrumbs` ohne `variant`
  rendern byte-identisch (plain-Variante nutzt `display:contents`-Shells ohne Layout-Effekt).
- Validiert via `examples/` (`hero-image.astro`, `breadcrumbs-bar.astro`). `astro check`:
  0 neue Fehler in Hero/Breadcrumbs.

---

## v0.20.0 (2026-05-25) — (release/cw-core — USPSection-Header + PageHero-CTAs)

> Zwei additive, backward-kompatible Prop-Erweiterungen für die faithful SEO-Page-Migration
> (entdeckt bei gottl-richter-gomeier `fuer-anwaelte`): `vorteile`-Sections haben durchgängig
> eine `<h2>`-Überschrift und SEO-Heroes durchgängig zwei Conversion-CTAs, die bei der Migration
> auf @cw/core sonst verloren gingen. Reusability-first — generische, optionale Props für alle
> Customer; bestehende Aufrufe ohne Änderung unverändert.

### Added

- `components/blocks/USPSection.astro` — optionale `heading` + `subheading` Props. Rendern einen
  zentrierten Header über dem Grid; ohne beide Props bleibt das Grid headerlos (Backward-Compat).
- `components/blocks/PageHero.astro` — optionale CTA-Buttons via `primaryLabel`/`primaryHref`
  (+ optional `secondaryLabel`/`secondaryHref`). Naming spiegelt `CTABlock` für API-Konsistenz.
  Styling auf dunklem Hero: primary = Accent-Fill, secondary = Outline-on-dark. CTA-Block nur
  gerendert wenn `primaryLabel` + `primaryHref` gesetzt (Backward-Compat).

### Notes

- Beide additiv & non-breaking: bestehende Customer-Aufrufe (USPSection ohne Header, PageHero
  ohne CTAs) rendern byte-identisch.
- Validiert via `examples/`-Build (symlink `@cw/core`): neue Showcase-Pages `usp-section.astro`
  und `page-hero.astro` decken alle Varianten ab (mit/ohne Header, mit/ohne CTAs).
- `astro check`: 0 neue Fehler in USPSection/PageHero (die 5 vorbestehenden Fehler liegen
  ausschließlich in `BaseLayout.astro`, unberührt).

---

## v0.19.0 (2026-05-25) — (release/cw-core — generische TeamGrid/TrustBadges/LinkGrid-Blocks)

> Drei neue, headless/prop-getriebene Block-Komponenten, die wiederkehrende Customer-Muster
> abdecken, die bisher pro Site inline hand-codiert waren (Survey: `trust-bar` 7×, `related` 7×,
> `team-grid` 3×). Reusability-first entworfen — generische API über alle Customer, keine
> customer-spezifischen Annahmen. Anlass: gottl-richter-gomeier-Migration von Inline-HTML auf
> @cw/core-Komposition.

### Added

- `components/blocks/TeamGrid.astro` — Team-Member-Grid. Foto- ODER Initialen-Avatar (Fallback
  aus `name`), optional `role`/`credentials`/`profileUrl`/`email`/`phone`, optionaler CTA,
  `background: 'surface' | 'default'`. Section wird bei leerem `members` weggelassen.
- `components/blocks/TrustBadges.astro` — Zertifizierungen/Trust-Signale. `variant: 'cards'`
  (umrandete Badge-Cards mit Label+Beschreibung, optional Banner-Bild) oder `'bar'` (kompakter
  Inline-Credential-Strip). Deckt Cert-Card-Layouts und den verbreiteten `trust-bar` ab.
- `components/blocks/LinkGrid.astro` — interne Link-Cards (Cross-Links/„weiterführend"):
  `title`/`description?`/`href`/`icon?`, optional `heading`/`intro`, `background`-Variante.

### Notes

- Alle drei nutzen nur Brand-Tokens (`--color-primary`, `--color-accent`, `--color-surface`,
  `--color-muted`, `--container-max`, `--section-padding`) mit Fallback-Defaults.
- Source-only (kein Build); Validierung via Customer-`pnpm build`. Direkt-Import:
  `import TeamGrid from '@cw/core/components/blocks/TeamGrid.astro'`.

---

## v0.18.0 (2026-05-25) — (release/cw-core — ImpressumBlock hasContactForm-Prop)

> `ImpressumBlock` unterstützt jetzt den optionalen Prop `hasContactForm`.
> Bisherige Customer ohne Änderungen weiter funktionsfähig (default `true`).
> Betrifft: §5 Abs. 1 Nr. 2 DDG — Kontaktformular-Klausel darf nur gerendert werden
> wenn tatsächlich ein Formular existiert (analog DatenschutzBlock-Fix v0.17.0).

### Added

- `ImpressumBlock.astro` neuer Prop (optional, default `true`):
  - `hasContactForm?: boolean` — Kontrolliert §5 Abs.1 Nr.2 DDG-Klausel + Formular-Link
    - `true` (default): bisheriges Verhalten — Formular-Link + §5-Klausel über Formular
    - `false` + Email gesetzt: §5-Klausel verweist auf E-Mail als elektronischen Kontaktweg
    - `false` + kein Email: §5-Klausel verweist auf Telefon als Kontaktweg

### Backward-Compat

- `hasContactForm` default `true` — bestehende Customer (blitzsicht, gottl-richter-gomeier, hausammincio etc.) ohne Änderungen unverändert
- Kein Breaking Change in Props-Interface

### Unblockt

- siluri/customer-hausamlago#18 nach cw-core@v0.18.0-Bump + `hasContactForm={false}` in hausamlago-Impressum-Page

---

## v0.17.0 (2026-05-25) — (release/cw-core — DatenschutzBlock prop-driven)

> `DatenschutzBlock` unterstützt jetzt vier optionale Props zur Steuerung der Service-Sections.
> Bisherige Customer ohne Änderungen weiter funktionsfähig (alle Props default `true`).
> Betrifft: §13 DSGVO + §5 TDDDG Transparenz — nur tatsächlich genutzte Auftragsverarbeiter
> dürfen in der Datenschutzerklärung genannt werden.

### Added

- `DatenschutzBlock.astro` Props (alle optional, default `true`):
  - `hasPlausible?: boolean` — §5 Plausible Analytics-Section + §8-Eintrag
  - `hasResend?: boolean` — Resend-Abschnitt in §6 + §8-Eintrag (nur wirksam wenn `hasContactForm=true`)
  - `hasTurnstile?: boolean` — §7 Cloudflare Turnstile-Section + §8-Eintrag (nur wirksam wenn `hasContactForm=true`)
  - `hasContactForm?: boolean` — §6 Kontaktformular-Section. `false` + `email` gesetzt → reduzierter E-Mail-only §6
- Section 1 (Verantwortlicher): `{country}` wird jetzt gerendert wenn `legal.country !== 'DE'` (analog ImpressumBlock IT-Suffix, behebt Asymmetrie)

### Changed

- `§8 Empfänger`-Liste ist jetzt prop-driven: nur aktive Services erscheinen
- `§7 Turnstile`-Section wird nur gerendert wenn `hasContactForm && hasTurnstile`

### Backward-Compat

- Alle neuen Props default `true` — bestehende Customer (blitzsicht, gottl-richter-gomeier etc.) ohne Änderungen unverändert
- Kein Breaking Change in Props-Interface

### Unblockt

- Sub-Issues #234, #235, #237, #238, #239, #240 (customer-hausamlago + hausammincio + weitere) nach cw-core@v0.17.0-Bump

---

## v0.16.0 (2026-05-25) — (release/cw-core — Status-Badge Auto-Detection)

> Customer-Sites müssen `statusBadge` nicht mehr explizit in `page-config.ts` setzen.
> cw-core leitet den Slug aus `import.meta.env.CW_CUSTOMER_SLUG` (gefüllt via Vite-Define
> aus `package.json.name`) ab. Eliminiert einen Drift-Punkt im Onboarding.

### Added

- `Footer.astro` Auto-Detection: Wenn `statusBadge` undefined ist, liest cw-core den
  Slug aus `import.meta.env.CW_CUSTOMER_SLUG`. Wenn auch der leer ist → kein Badge.
- Opt-Out via `statusBadge: null` (NEU, vorher gab es keine explizite Opt-Out-Option).
- `docs/STATUS-BADGE-AUTO.md` — Setup-Anleitung für Customer-Sites (Vite-Define-Snippet).

### Changed

- Footer-Prop-Typing erweitert: `statusBadge?: {...} | null` (vorher nur `{...} | undefined`).
- Layout-Forward (`LandingPage.astro`, `ContentPage.astro`) auf neuen Typ angeglichen.

### Backward-Compat

- Bestehende Customer mit explizitem `statusBadge: { slug: 'x' }` funktionieren unverändert (explicit wins).
- Bestehende Customer ohne `statusBadge` UND ohne Vite-Define rendern wie bisher kein Badge.
- Phase 3 des Onboarding-Automation-Plans (`~/.claude-blitzsicht/plans/breezy-bouncing-seal.md`).

### Migration für Customer-Site (optional)

```ts
// astro.config.mjs
import pkg from './package.json' with { type: 'json' };
const customerSlug = pkg.name.replace(/^customer-/, '');

export default defineConfig({
  vite: {
    define: { 'import.meta.env.CW_CUSTOMER_SLUG': JSON.stringify(customerSlug) },
  },
});
```

Dann optional `statusBadge`-Eintrag aus `page-config.ts` entfernen (Cleanup).

---

## v0.15.0 (2026-05-24) — (release/cw-core — Footer Status-Badge)

> Status-Badge im Customer-Footer (verlinkt auf `status.blitzsicht.com/`) — End-User-Trust
> + Cross-Promotion ohne Aufdrängen. Opt-In per Customer (kein Default-Verhalten).

### Added

- `Footer.astro` neuer optionaler Prop `statusBadge: { slug, statusUrl?, badgeUrlBase?, alt? }`.
  Wenn gesetzt: rendert `<img>` mit Status-SVG aus `status.blitzsicht.com/badge/<slug>.svg`,
  verlinkt zentriert unter Credit-Line, opacity 0.6 → 1.0 bei Hover (subtil).
- `site-data.template.ts` neue optionale Top-Level-Property `statusBadge` mit Beispiel-Doc.

### Use-Case

```astro
<Footer
  siteName={siteData.name}
  {...}
  statusBadge={siteData.statusBadge}
/>
```

In `src/data/site-data.ts`:
```ts
statusBadge: { slug: 'hausamlago' },
```

### Notes

- Backward-compatible: bestehende Customer ohne `statusBadge` rendern unverändert.
- Slug muss in `cw-uptime/src/index.ts` CUSTOMERS-Array existieren, sonst fallback-SVG (`status: unknown`).
- 20px-Höhe, ~120×20 SVG, lazy-loaded. Edge-cached (CF) → kein Performance-Impact.
- Sales-Argument: Customer-Vertrauen durch transparent gezeigte Uptime ohne Login-Hürde.

---

## v0.14.5-rc.1 (2026-05-24) — (release/cw-core — Email-Sig TIER-Gating)

> **Plan-Phase 10.5:** Email-Sig v4-Extras (Booking-CTA, Google-Review-CTA, Trust-Badges) sind nur ab Business-Tier inkludiert. Bisher hätte `regenerate-all.sh` v4-Extras unabhängig vom Tier ausgegeben wenn die Vars in `site-data.ts` gesetzt sind. Diese Version macht das Tier-bewusst.

### Added

- `templates/email-signature/regenerate-all.sh` v6.6: liest `tier` + `addons` aus `customer-websites/customer-registry.json` (Pfad via `REGISTRY_PATH` ENV überschreibbar) und blankt v4-Vars (BOOKING_URL, GOOGLE_REVIEW_URL) entsprechend Tier-Buchung.
  - `tier=starter` ohne `cal-booking-starter` Add-On → beide Vars geblankt + Info-Hinweis
  - `tier=starter` mit `cal-booking-starter` → BOOKING_URL aktiv, REVIEW geblankt
  - `tier=business` / `enterprise` → alle v4-Vars aktiv (wenn site-data.ts gesetzt)
  - Customer nicht in Registry → fail-open + Warning (rückwärtskompatibel für Test-Setups)
- vCard bleibt in allen Tiers aktiv (Basic-Service, auto-generiert).
- README: TIER-Gating-Sektion mit Tabelle + Aktivierungs-Schritten pro Customer.

### Notes

- Source-only-Lib bleibt: kein Astro-Build, kein Bundling. Version-Bump ist nur Marker — keine Consumer-Migration nötig.
- Customer-Sites die das neue Verhalten testen wollen: `REGISTRY_PATH=/path/to/test-registry.json pnpm sig:regenerate`
- Backward-compatible: Customer-Sites die `customer-registry.json` nicht haben, bekommen `tier=unknown` + fail-open (= altes Verhalten).

---

## v0.14.4-rc.1 (2026-05-23) — (release/cw-core — ContentPage padding-bottom)

> **Plan-Phase 10 Hotfix:** ContentPage hatte `padding: 4rem 0 6rem` — bei Pages mit eigener CTA-Section am Ende (z.B. mika-elektrotechnik /leistungen/e-mobilitaet) war 6rem doppelt-padding zwischen CTA und Footer. Auf mobile sichtbar als großer Leerraum.

### Changed

- `.content-page` padding-bottom: `6rem` → `3rem`. 3rem reicht für Atemraum vor Footer auch bei Pages ohne CTA-Section.

### Affected

Alle Customer-Sites die ContentPage-Layout nutzen — visuell etwas kompaktere Bottom-Marge. Kein API-Change.

---

## v0.14.3-rc.1 (2026-05-23) — (release/cw-core — a11y-Fix AddOnsSection .addon-price)

> **Plan-Phase 10 (a11y-Hotfix):** `.addon-price` hatte Kontrast 2.88:1 (orange `#EF7612` auf weiß) — unter WCAG-AA-Schwelle 3:1 für large bold text. Visual-Regression-CI hat das auf customer-blitzsicht detected.

### Fixed

- `.addon-price` Color: `var(--color-accent)` → `var(--color-accent-text, #B85A0D)`. Neuer Kontrast 4.95:1 — WCAG AA ✓ (auch für normalen Text).
- Kein API-Change, rein visuell. Backward-compatible.

### Affected

Alle Customer-Sites die `AddOnsSection` rendern — aktuell nur customer-blitzsicht. Andere Customer-Sites die später auf v0.14.3+ pinnen bekommen den Fix automatisch.

---

## v0.14.2-rc.1 (2026-05-22) — (release/cw-core — PaketeSection ctaSecondaryHref)

> **Plan-Phase 9 (Pakete-Redesign):** Sekundärer CTA in der Paket-Karte.
> Vorher: "Alle Leistungen ansehen"-Block neben der PaketeSection.
> Nachher: 2-CTA-Pattern in der Karte selbst (Primary "Anfragen" + Secondary "Alle Leistungen ansehen →").

### Added

- `PaketeItem.ctaSecondaryHref` (optional) — z.B. `/pakete/starter` für Detail-Seite-Verlinkung.
- `PaketeItem.ctaSecondaryLabel` (optional) — Default: `'Alle Leistungen ansehen →'`.
- CSS-Style `.paket-cta-secondary` — dezent unter dem primären CTA, text-only mit Pfeil.
- Plausible-Event-Tracking: `Paket Card Detail-Link Click` mit `tier`-Prop.

### Use-Case

```astro
<PaketeSection
  items={[
    {
      name: 'Starter',
      ... ,
      ctaHref: '/kontakt?paket=starter',
      ctaLabel: 'Starter anfragen',
      ctaSecondaryHref: '/pakete/starter',
      ctaSecondaryLabel: 'Alle Leistungen Starter →',
    },
    ...
  ]}
/>
```

### Backward-Compat

Wenn `ctaSecondaryHref` nicht gesetzt: kein sekundärer CTA wird gerendert. Andere
Customer-Sites brauchen kein Update.

---

## v0.14.0-rc.1 (2026-05-22) — (release/cw-core — Pricing-Refresh: PaketeSection detailedFeatures + AddOnsSection)

> **Blitzsicht Pricing-Pakete Refresh** (Plan: `kunde-markus-eule-will-spicy-pike.md` v2).
> Macht 30 Standard-Services in Paket-Karten sichtbar + ermöglicht Cal-Booking-Tiering
> (Starter: Add-On +29€/Mo, Business/Enterprise: inkl.) + neue Add-On-Sektion für
> paket-unabhängige Zusatzleistungen.

### Added

- `PaketeSection.astro` — neues optionales Prop `detailedFeatures: PaketeFeature[]`
  mit Variants `'included' | 'excluded' | 'addon'`. Ermöglicht differenzierte
  Feature-Matrix pro Paket (✓ / — / ✓ +Preis-Badge). Backward-compatible:
  bestehende Customer-Sites mit `features: string[]` rendern unverändert.
- `PaketeFeature` Type exportiert (`label`, `variant`, `tooltip?`, `addonPrice?`).
- `AddOnsSection.astro` (NEU) — eigenständige Sektion für Add-On-Items mit
  optionalem Kategorie-Filter (booking/content/seo/legal/support). Sortiertes
  Grid-Layout, Default-CTA `/kontakt?anfrage=<slug>`, Plausible-Tracking.
- `AddOnItem` + `AddOnCategory` + `AddOnPriceModel` Types exportiert.

### Use-Case

```astro
<PaketeSection
  items={[
    {
      name: 'Starter',
      subtitle: 'Für Solo + kleine Teams',
      priceSetup: 2490,
      priceMonthly: 79,
      features: [],
      detailedFeatures: [
        { label: 'AI-SEO Starter-Pack', variant: 'included' },
        { label: 'Plausible-Events', variant: 'excluded' },
        { label: 'Cal-Booking', variant: 'addon', addonPrice: '+29 €/Mo',
          tooltip: 'Bei Business/Enterprise inkl.' },
      ],
    },
    // …Business / Enterprise mit unterschiedlichen Variants…
  ]}
/>

<AddOnsSection
  items={[
    { slug: 'gmb-aktivierung', name: 'GMB-Aktivierung', description: 'Monatliche Profil-Pflege …',
      price: '290 €/Mo', priceModel: 'monthly', category: 'seo' },
    // …
  ]}
/>
```

### Affected

- Alle Customer-Sites die nur `features: string[]` nutzen → kein Update nötig.
- Customer-Sites die auf detaillierte Tiering-Sichtbarkeit upgraden wollen → optional
  `detailedFeatures` befüllen + ggf. AddOnsSection einbinden.
- customer-blitzsicht ist Pilot — eigener Folge-PR pinnt diesen Commit + füllt
  Pakete-Daten + neue `/pakete` Seite.

### Migration

Kein Breaking Change. Sites die ihre Pakete mit den neuen Variants schärfen wollen:

1. cw-core auf v0.13.0 Commit pinnen
2. `src/data/site-data.ts` Paket-Einträge um `detailedFeatures` erweitern
3. Optional: `<AddOnsSection items={…} />` unter `<PaketeSection>` einbinden

---

## v0.12.1-alpha (2026-05-21) — (release/cw-core — Briefing-Handler: Telegram-Push-Fix)

> **Hotfix für v0.12.0-alpha.** `emitLead` wurde fälschlicherweise via `void`-Pattern
> NACH `res.status(200)` aufgerufen — Vercel Serverless killt die Function aber
> bevor das detached promise resolvt, dadurch kam **kein Telegram-Push** für
> Briefing-Submissions an (in Mika-Production-Test am 21.05. festgestellt).

### Fixed

- `briefing-handler.js` Zeile 370–397: `await emitLead(...)` VOR `res.status(200)`
  statt `void emitLead(...)` danach. Worst-case 5s zusätzliche Response-Latenz
  (durch `AbortSignal.timeout(5_000)` in `lead-sink.js` begrenzt) — akzeptabel
  für low-traffic Briefing-Forms. Vorteil: Telegram-Push-Reliability 100% statt 0%.

### Affected

- Alle Customer-Sites die `createBriefingHandler` aus v0.12.0-alpha nutzen (aktuell
  Mika + Zink) — benötigen `package.json`-Bump auf `v0.12.1-alpha` + Re-Deploy.

---

## v0.12.0-alpha (2026-05-21) — (release/cw-core — Briefing-Handler + BriefingForm)

> **Phase A des `glistening-snacking-papert`-Plans.** Generischer Onboarding-
> Briefing-Endpoint + Single-Page-Form, extrahiert aus Mika-Elektrotechnik
> (Anti-Pattern: 700-Zeilen inline). Mika und Zink konsumieren ab jetzt in
> ~20 Zeilen.

### Added — `@cw/core/api/briefing-handler`

- `createBriefingHandler(config)` — Factory analog zu `createContactHandler`.
  - **Required-Field-Validation** wird aus `config.sections` derived — keine
    magische ID-Liste mehr im Customer-Repo.
  - **Mail-Versand awaited** (internal + customer-confirmation) **VOR** dem
    200-Response — fixt den Mika-M1-Bug (fire-and-forget killt das Promise
    sobald die Vercel-Function-Response gesendet ist).
  - **`emitLead`/Telegram detached** NACH dem Response — User wartet nicht
    auf das 5s-Timeout.
  - **Payload-Cap 256 KB** (413 bei Überschreitung).
  - **Origin-Check** mit optionalem Vercel-Preview-Bypass
    (`allowVercelPreviewOrigins`, default `true`).
  - **Rate-Limit** via Upstash KV (Vercel-Marketplace + Legacy) mit in-memory
    Fallback.
  - **Optionale Overrides**: `subjectInternal`, `subjectConfirmation`,
    `fromEmail`, `confirmationFromEmail`, `rateLimitMax`,
    `rateLimitWindowMs`, `brand` (für customer-spezifische Mail-Akzente).
  - **Server-side Email-Regex** (m13) für das `email_kontakt`-Feld.

### Added — `@cw/core/components/forms/BriefingForm.astro`

- Generic Single-Page-Briefing-Form mit 7 Field-Types
  (`text` / `textarea` / `email` / `phone` / `select` / `checkbox` / `radio`).
- localStorage-Auto-Save mit **`storageKey` als REQUIRED prop** — kein default,
  damit Customer-Konflikte (Mika ↔ Zink) ausgeschlossen sind.
- Progress-Bar (dual-source: Gesamt-Felder + Pflichtfelder, live update).
- Sticky-TOC links (mobile collapsible mit `aria-expanded`).
- Submit-Button disabled bis alle Required-Felder gefüllt.
- Reset-Button mit confirm-Dialog.
- On 200: localStorage cleanup + Redirect zu `successRedirect`
  (default `/danke?from=onboarding`).
- `is:inline` Vanilla-JS-Script — DSGVO-clean, kein extern Script-Load.
- Brand-aware Styles via `var(--color-*)` — keine hardcoded Hex-Werte.
- **Note (m14):** Turnstile bewusst NICHT integriert (Briefing-URLs sind
  privat per E-Mail + Page hat `noindex,nofollow`).

### Added — `@cw/core/types/briefing`

- `BriefingField`, `BriefingSection`, `FieldType`, `SectionPriority`
  Type-Definitions — Source-of-Truth für Customer-Repos.
- Convenience-Helpers: `getRequiredFieldIds(sections)`,
  `getTotalFieldCount(sections)`, `findFieldById(sections, id)`.

### Added — `@cw/core/utils/forms/build-briefing-email`

- `buildBriefingEmail(input)` — rendert HTML + Plain-Text für die zwei
  Briefing-Mails (intern + Confirmation), Pattern aus Mika übernommen.
- Brand-Akzent parametrisiert (`brand.primary` + `brand.accent`), Default =
  Blitzsicht Nachtblau/Orange.
- Customer-Submission-URL als Param (NICHT hardcoded).

### Added — `@cw/core/utils/net/get-client-ip`

- Shared `getClientIp(req)` Utility — bevorzugt
  `x-vercel-forwarded-for` (single value, Vercel-signed) > `x-forwarded-for`
  **LAST** entry > `x-real-ip` > `socket.remoteAddress`.
- **Sicherheits-Fix:** XFF-LAST statt XFF-FIRST (Client kann FIRST-Slot
  spoofen, LAST kommt vom nächsten trusted Proxy).

### Changed — `@cw/core/api/contact-handler`

- IP-Extraction migriert auf shared `getClientIp` Utility — der alte
  `[0]`-Lookup-Pattern (Client-spoofbar) ist weg. **Non-breaking** für
  bestehende Customer (gleiche Funktionssignatur, sicherere Default-Reihen-
  folge).

### Changed — `@cw/core/api/lead-sink`

- `Lead.kind`-Union um `'briefing-form'` erweitert.
- `formatTelegramMessage` hat einen eigenen Briefing-Branch:
  - Format: `📋 Briefing · {Customer} · {filled}/{total} Pflicht`
  - Plus Preview der ersten 2 ausgefüllten Felder.
  - Hard-Cap **200 Zeichen** (Contact-Form bleibt bei 1024).
- Neue optionale Felder im Lead-Type: `customerName`, `requiredFilled`,
  `requiredTotal`, `briefingPayload`.

### Added — Tests

- `tests/api/briefing-handler.test.js` — Node-native (`node --test`,
  kein vitest-Install nötig). 6 Tests:
  1. Required-Field-Validation derived from sections (CRIT-Anchor MAJ-12.1).
  2. IP-Extraction prefers x-vercel-forwarded-for + XFF LAST (MAJ-12.2 / CRIT-5).
  3. Promise-Ordering: Mails awaited, Telegram detached (MAJ-12.3 / MAJ-7).
  4. Payload-Size 413 (MAJ-10).
  5. Telegram-Briefing-Branch formatting + Cap (CRIT-2).
  6. Method-Check 405.
- Neuer Script: `pnpm test` (`node --test tests/**/*.test.js`).

### Version

- `0.11.0-rc.3` → **`0.12.0-alpha`**.
- **Rationale:** RC3 ist noch nicht final-promoted (kein ≥3-Customer-
  Smoketest), und Briefing-Handler ist ein neues Feature-Surface.
  `v0.12.0-alpha` signalisiert: stabil genug für Mika/Zink, aber noch
  Alpha-Tag — Final-Promotion folgt nach Smoketest-Cycle.

---

## v0.11.0-rc.3 (2026-05-19) — (release/cw-core — Component-Showcase + quality-checks)

### Added (Plan-Phase 1.6 — Component-Showcase via Examples-Pattern)

- `examples/` — Mini-Astro-Project mit Demo-Page pro neuer Component.
  - 9 Pages total (1 Übersicht + 8 Component-Demos)
  - Lokaler Start: `pnpm examples:dev` (Port 4322)
  - Build grün: 9 pages in 811ms
- pnpm-Scripts in Root: `examples:dev` + `examples:build`

**Hintergrund:** User-Plan-Antwort vom 19.05. war "Storybook 8". Aber Storybook + Astro 5 ist Mai 2026 noch nicht stabil — `@storybook/addon-astro` existiert nicht in npm registry, nur Community-Package `storybook-astro@0.2.1` (3 Versionen). Pragmatische Entscheidung: Examples-Pattern statt Storybook. Erfüllt den Zweck (interaktive Component-Demos für interne Doku + Customer-Calls) ohne experimentelles Ökosystem.

### Verbleibend Plan-Phase 1

(keine — Phase 1 komplett mit RC3. Promotion zu v0.11.0-final nach Smoke-Build auf ≥3 Customer-Sites.)

---

## v0.11.0-rc.2 (2026-05-19) — (release/cw-core — Quality-Checks-Integration)

### Added (Plan-Phase 1.3 — Build-Time-Checks)

- `integrations/quality-checks/index.ts` — neue Astro-Integration (opt-in).
  Im `astro:build:done`-Hook scannt sie `dist/*.html` und prüft:
  - **1× `<h1>` pro Page** (h1Count !== 1 → Warning oder Build-Fail in strict-Mode)
  - **AnswerBlock-Pflicht** für Pages die einem `servicePagePatterns`-Regex matchen
- Default-Mode: Soft-Warnings (kein Build-Fail). `strict: true` macht es hart.
- ignorePaths-Default: /404, /danke, /impressum, /datenschutz, /agb
- Aktivierung pro Customer-Site (opt-in via `astro.config.ts`).

### Package-Exports erweitert

- `./integrations/quality-checks` → `src/integrations/quality-checks/index.ts`

---

## v0.11.0-rc.1 (2026-05-19) — (release/cw-core — Google AI Optimization Guide Phase 1)

> **Release-Candidate.** Trifft erstmals den Plan-Phase-1-Scope (Google AI
> Optimization Guide Rollout). Customer-Sites können auf diesen Commit-Hash
> pinnen für Beta-Testing. Promotion zu 0.11.0 nach Smoke-Build auf ≥3 Customer.

### Added (Plan-Phase 1.1 — 8 neue Components)

- `blocks/AnswerBlock.astro` — Lead-with-Answer-Block für Service-Pages. Props:
  `question`, `directAnswer` (max 50 Wörter empfohlen), `details?`, `priceRange?`,
  `timeline?`, `highlights?`. Schema: `Question`/`Answer` JSON-LD. Build-Warning
  bei `directAnswer > 80 Wörter`. **Plan-Hintergrund:** 44.2% AI-Citations aus
  ersten 30% Page-Content (Mai 2026).
- `blocks/RecentlyUpdated.astro` — sichtbares "Aktualisiert am DD.MM.YYYY"-Badge
  mit Stale-Warning bei >90 Tagen. Variants: `badge` (Pill) und `banner` (volle Breite).
  Dev-Mode-Console-Warning bei stale Content. **Plan-Hintergrund:** Pages <30 Tage
  bekommen 3.2× mehr AI-Citations.
- `blocks/CTAPrimary.astro` — Agent-Friendly Primary-CTA-Primitive mit
  `data-cta-type`-Attribut (contact/quote/phone/booking/whatsapp/email). Build-Warning
  bei vagen Labels ("hier klicken", "weiter lesen").
- `blocks/CaseStudyBlock.astro` — Customer/Location/Problem/Approach/Outcome-Block.
  Schema: `CreativeWork` + optional `Review` (mit Rating). Compact-Mode für
  Referenzen-Grids.
- `blocks/BehindTheJob.astro` — Erfahrungs-Block mit Learnings + ehrlichen Fehlern +
  Konsequenz. Schema: `Article` mit Author=Organization.
- `blocks/PriceTransparency.astro` — Preis-Range-Block mit Faktoren-Liste pro
  Service. Verhindert "auf Anfrage"-Antipattern. Schema: `ItemList` of `Offer` +
  `PriceSpecification`.
- `blocks/LocalProofMap.astro` — lokale Referenzen-Liste (City + Service + Year)
  ohne Map-Embed (Privacy + Performance). Schema: `ItemList` of `Place`.
- `blocks/FAQHonest.astro` — FAQ-Variante mit `minAnswerChars` (default 150).
  Antworten unter Schwelle werden visuell gezeigt aber NICHT ins FAQPage-Schema
  aufgenommen — vermeidet Thin-Content-Flag von Google.

### Added (Plan-Phase 1.2 — Schema-Helpers konsolidiert)

- `schema/local-business.ts` — **Subtype-aware** `localBusinessSchema(input)`.
  `BusinessType` → Schema.org-Subtype-Mapping (Plumber, Electrician, HVACBusiness,
  Bakery, WineStore, BedAndBreakfast, RoofingContractor, ...). Plus
  `validateLocalBusiness()` für Compile-Time-Warnings.
- `schema/article.ts` — `articleSchema(input)` für BehindTheJob + Blog-Pages.
- `schema/creative-work.ts` — `caseStudySchema(input)` für CaseStudyBlock
  (CreativeWork + optional Review).
- `schema/breadcrumb-list.ts` — `breadcrumbListSchema(items)` — schließt
  bisherige JSON-LD-Lücke (Breadcrumbs.astro hat keinen Schema-Output).
- `schema/service.ts` — `serviceSchema(input)` pro Service-Page mit
  areaServed + offers.
- `schema/index.ts` — Re-Export aller Helpers für `import { ... } from '@cw/core/schema'`.

### Added (Plan-Phase 1.4 — IndexNow-Integration, Default-Aktiv)

- `integrations/bing-indexnow/index.ts` — Astro-Integration für Post-Build-Ping
  an Bing/Yandex IndexNow-API. Liest Sitemap, generiert Verifikations-Key-File,
  Bulk-Ping (max 10.000 URLs). **Default-Aktiv** (im Gegensatz zu llms.txt:
  IndexNow hat nachgewiesenen Nutzen für ChatGPT-Sichtbarkeit).

### Package-Exports erweitert

- `./integrations/bing-indexnow` → `src/integrations/bing-indexnow/index.ts`
- `./schema` → `src/schema/index.ts`
- `./schema/*` → `src/schema/*.ts`

### Compatibility

- **Voll backwards-kompatibel** zu v0.10.7. Alle neuen Components sind
  additive (keine Breaking-Changes an existing). Schema-Helpers können
  parallel zu existing `components/seo/*.astro` genutzt werden.
- IndexNow-Integration ist opt-in via `astro.config.ts` — wird nicht
  automatisch aktiviert beim Bump.

### Verbleibend Plan-Phase 1 (kommen in folgenden RCs)

- 1.3: Build-Time-Checks in BaseLayout (1× h1 / Page, AnswerBlock-Pflicht für Service-Pages)
- 1.5: Doku-Update für ai-discovery + neue optional-features.md
- 1.6: Storybook 8 Setup
- 1.7: docs/non-commodity-content-guide.md + google-ai-guide-compliance.md

---

## v0.10.7 (2026-05-19) — (release/cw-core — Header hideBrandName-Prop)

### Added

- `layout/Header.astro`: **Neue Prop `hideBrandName`** (default `false`) — unterdrückt den
  `<span>{siteName}</span>` Text neben dem Logo-Bild. Verwenden wenn das Logo-SVG selbst bereits
  den Markennamen als `<text>`-Element enthält (Text-Logo), um Doppel-Anzeige im Header zu vermeiden.
  (Fixes siluri/blitzsicht-ops#202)

- `layouts/LandingPage.astro`: **`HeaderConfig.hideBrandName`** — neue optionale Prop im
  `header`-Config-Objekt, wird transparent an `Header.astro` weitergegeben.

### Compatibility

- Backwards-kompatibel: `hideBrandName` Default ist `false` — HTML-Output für alle bestehenden
  Customers identisch zu v0.10.6.
- Keine Prop-Entfernungen, keine Umbenennungen.

### Migration (Customers mit Text-Logo-SVG)

```ts
// page-config.ts
export const headerConfig = {
  navItems: siteData.nav.main,
  showKarriereLink: false,
  logoSrc: '/logo.svg',
  logoSrcDark: '/logo-dark.svg',
  hideBrandName: true,  // ← neu: SVG enthält bereits Text, Span unterdrücken
};
```

---

## v0.10.6 (2026-05-19) — (release/cw-core — StickyMobileCTA WCAG-Fix + primaryVariant)

### Fixed (Accessibility)

- `blocks/StickyMobileCTA.astro`: **WhatsApp-Default-Color WCAG 2.1 AA Fix** — `secondaryVariant="whatsapp"`
  Background von `#25D366` (1.98:1, FAIL) auf `#197F40` (5.06:1, PASS) geändert.
  Hover von `#1ebd5a` auf `#136A35`. Konsistent mit Hero-Card-Buttons der Customer-Sites.
  (Fixes siluri/blitzsicht-ops#195)

### Added

- `blocks/StickyMobileCTA.astro`: **Neue Prop `primaryVariant`** — steuert Hintergrundfarbe des primären
  Buttons im Split-Layout:
  - `'accent'` (Default): `--color-accent` / `--color-accent-hover` — bisheriges Verhalten, Backwards-Compat.
  - `'primary'`: `--color-primary` / `--color-primary-dark` — Nachtblau als Primary-Button.
  (Fixes siluri/blitzsicht-ops#195)

### Migration (Customers)

**WhatsApp-Color — kein Code-Change nötig:**
```astro
{/* secondaryVariant="whatsapp" rendert jetzt automatisch WCAG-konformes #197F40 */}
<StickyMobileCTA
  href="/kontakt"
  label="Jetzt anfragen"
  secondaryHref="https://wa.me/49151xxxxxxxx"
  secondaryLabel="WhatsApp"
  secondaryVariant="whatsapp"
/>
```

**primaryVariant="primary" — neues Feature:**
```astro
<StickyMobileCTA
  href="/kontakt"
  label="Jetzt anfragen"
  primaryVariant="primary"
  secondaryHref="https://wa.me/49151xxxxxxxx"
  secondaryLabel="WhatsApp"
  secondaryVariant="whatsapp"
/>
```

### Compatibility

- Backwards-kompatibel: `primaryVariant` Default ist `'accent'` — HTML-Output identisch zu v0.10.5.
- WhatsApp-Farbänderung ist visuell (etwas dunkler/satter), kein Breaking Change.
- Keine Prop-Entfernungen, keine Umbenennungen.

---

## v0.10.5 (2026-05-19) — (release/cw-core — StickyMobileCTA Split-CTA + StickyContact hideOnMobile)

### Added

- `blocks/StickyMobileCTA.astro`: **Split-CTA Layout** — neue Props `secondaryHref`, `secondaryLabel`,
  `secondaryTarget`, `secondaryVariant` (`'whatsapp' | 'accent'`). Wenn `secondaryHref` + `secondaryLabel`
  gesetzt: Flex-Layout mit 2 Buttons à 50% Breite, border-Trenner statt Gap. Einzelner CTA verhält sich
  **HTML-identisch zu v0.10.4** (Backwards-Compat-Pflicht). (Fixes siluri/blitzsicht-ops#192)

  Neue Props:
  - `secondaryHref?: string` — href des zweiten Buttons
  - `secondaryLabel?: string` — Label des zweiten Buttons
  - `secondaryTarget?: string` — target-Attribut (Default: `'_self'`)
  - `secondaryVariant?: 'whatsapp' | 'accent'` — Farbvariante; Default `'accent'` (gleiche Farbe wie Primary).
    `'whatsapp'` → Hintergrund `#25D366`, hover `#1ebd5a`.

  Optional Slot-API für Icons direkt vor dem Label:
  - `<slot name="primary-icon" />` im primären Button
  - `<slot name="secondary-icon" />` im sekundären Button

- `blocks/StickyContact.astro`: **`hideOnMobile` Prop** — blendet den schwebenden Kontakt-Button
  auf mobilen Viewports (< 768px) aus. Nützlich wenn gleichzeitig `StickyMobileCTA` sichtbar ist
  und ein visuelles Überlappen verhindert werden soll. Default `false` → unverändert. (Fixes siluri/blitzsicht-ops#192)

### Migration (Customers)

**Single CTA — unverändert:**
```astro
{/* Kein Code-Change nötig — HTML-Output identisch */}
<StickyMobileCTA href="/website-audit" label="Kostenloser Website-Audit" />
```

**Split CTA — neu:**
```astro
<StickyMobileCTA
  href="/kontakt"
  label="Jetzt anfragen"
  secondaryHref="https://wa.me/49151xxxxxxxx"
  secondaryLabel="WhatsApp"
  secondaryVariant="whatsapp"
  secondaryTarget="_blank"
/>
```

**StickyContact auf Mobile ausblenden (z.B. wenn StickyMobileCTA aktiv):**
```astro
<StickyContact
  whatsapp="+49151xxxxxxxx"
  phone="+498xxxxxxxxxxx"
  hideOnMobile={true}
/>
```

### Compatibility

- Backwards-kompatibel: `StickyMobileCTA` ohne Secondary-Props rendert HTML-identisch zu v0.10.4.
- `StickyContact` ohne `hideOnMobile` (oder `hideOnMobile={false}`) verhält sich unverändert.
- Keine Breaking Changes.

---

## v0.10.4 (2026-05-19) — (release/cw-core — StickyContact in cw-core hochgehoben)

### Added

- `blocks/StickyContact.astro`: Schwebender WhatsApp + Telefon-Button (fixed, bottom-right).
  Bisherige Duplikate in `customer-soleno`, `customer-hausamlago` und `customer-hausammincio`
  werden mit der nächsten Customer-Migration auf diese zentrale Komponente umgestellt.
  (Fixes siluri/blitzsicht-ops#183 Phase 1)

  **Props (API-stabil zu den Customer-Kopien):**
  - `whatsapp?: string` — WhatsApp-Nummer inkl. Ländervorwahl
  - `phone?: string` — Telefonnummer inkl. Ländervorwahl
  - `prefilledMessage?: string` — Vorbefüllte WA-Nachricht (Default: generisch, Customer überschreibt)

  **Features:**
  - Mobile-first 56px Buttons, 52px auf < 480px
  - Dezenter Puls-Effekt am WA-Button (deaktiviert bei prefers-reduced-motion)
  - Plausible-Events: `'Sticky Contact Click'` mit `{ props: { channel } }`
  - WCAG: `role="complementary"`, `aria-label`, `focus-visible` outline
  - CSS Custom Properties: `--color-primary` für Phone-Button-Farbe, `--color-accent` für Focus-Ring

### Migration (Customer-Repos)

Customer-Repos können ihre lokale `StickyContact.astro`-Kopie löschen und auf den cw-core-Import
umstellen:

```diff
- import StickyContact from '../components/StickyContact.astro';
+ import StickyContact from '@cw/core/components/blocks/StickyContact.astro';
```

Die Props-API ist identisch — kein weiterer Anpassungsbedarf außer dem Import-Pfad.
Die `prefilledMessage`-Prop sollte weiterhin als Customer-spezifischer Wert übergeben werden
(z.B. "Hallo Soleno, ich interessiere mich für eine PV-Beratung."); der neue Default
("Hallo, ich interessiere mich für Ihr Angebot.") greift nur wenn kein Prop übergeben wird.

### Compatibility

- Backwards-kompatibel: API-stabil zu allen 3 Customer-Kopien.
- Keine Breaking Changes.

---

## v0.10.3 (2026-05-19) — (release/cw-core — Footer WCAG 2.1 AA Kontrast-Fix)

### Fixed (Accessibility)

- `Footer.astro`: WCAG 2.1 AA Kontrast-Fail behoben. Drei hardcoded `rgba(255,255,255,0.x)` Werte
  lagen unter dem 4.5:1 Mindestkontrastwert auf dem Nachtblau-Hintergrund `#1D1E3B`:
  - `.footer-links h3` (Spalten-Überschriften): `0.5` → `0.85` (war ~3.1:1, jetzt ~8.0:1)
  - `.footer-bottom` (Copyright-Zeile): `0.6` → `0.75` (war ~3.9:1, jetzt ~6.0:1)
  - `.footer-credit a` (Blitzsicht-Backlink): `0.55` → `0.75` (war ~3.5:1, jetzt ~6.0:1)
- CSS Custom Properties eingeführt für Customer-Overrides falls benötigt:
  - `--color-footer-text-muted` (default `rgba(255,255,255,0.85)`) — Spalten-Überschriften
  - `--color-footer-text-bottom` (default `rgba(255,255,255,0.75)`) — Copyright-Bar
  - `--color-footer-credit-link` (default `rgba(255,255,255,0.75)`) — Backlink
  (Fixes siluri/blitzsicht-ops#180)

### Compatibility

- Backwards-kompatibel: alle bestehenden Customer-Sites erhalten höheren Kontrast ohne Code-Änderungen.
  Visuell: Footer-Labels sind etwas heller/lesbarer — kein "schreiende-weiße-Wand"-Effekt da
  auf dunklem Background. Customer-Repos können die Custom Properties überschreiben falls gewünscht.
- Erwartetes Lighthouse-Ergebnis: customer-hausamlago steigt von 96/100 auf ≥ 98/100 Accessibility
  beim nächsten `pnpm update @cw/core`.

---

## v0.10.2 (2026-05-19) — (release/cw-core — email-Prop optional in ImpressumBlock + DatenschutzBlock)

### Changed

- `ImpressumBlock.astro`: Prop `email` ist jetzt optional (`string?` statt `string`).
  Render-Stellen (`E-Mail:`-Link in §Kontakt) mit Truthy-Guard geschützt.
  Wenn kein `email` gesetzt: E-Mail-Link wird nicht gerendert, nur Kontaktformular
  als elektronischer Kontaktweg. (Fixes siluri/blitzsicht-ops#174)
- `DatenschutzBlock.astro`: Prop `email` ist jetzt optional (`string?` statt `string`).
  Render-Stellen in §1 Verantwortlicher und §10 Betroffenenrechte mit Truthy-Guard.
  Fallback ohne E-Mail: "wenden Sie sich an den Verantwortlichen (Kontaktdaten siehe Impressum)".
  (Fixes siluri/blitzsicht-ops#174)

### Compatibility

- Backwards-kompatibel: alle bestehenden Customer-Sites übergeben
  `email={siteData.contact.email}` als string — Verhalten unverändert.
  Neu: Customer-Sites die `email` auf `undefined` setzen (z.B. Eule-Phase-2) brechen
  nicht mehr mit TypeScript-Fehler, sondern rendern graceful ohne E-Mail-Link.

---

## v0.10.1 (2026-05-19) — (release/cw-core — DSGVO-Fix datenschutzEmail)

### Fixed (DSGVO-kritisch)

- `InformationspflichtBlock.astro`: **Halluzinierte `datenschutz@<domain>`-Adresse entfernt.**
  Die Komponente generierte automatisch `datenschutz@<email-domain>` wenn kein explizites
  `datenschutzEmail`-Prop übergeben wurde — diese Adresse existiert bei allen bestehenden
  Kunden nicht. DSGVO Art. 13/14 verlangt erreichbare Kontaktdaten. (Fixes #173)

### Changed

- `InformationspflichtBlock.astro`: Prop `email` ist jetzt optional (war: required string).
  Breaking-frei: bestehende Customer-Sites übergeben `email={siteData.contact.email}` — Verhalten
  ändert sich nur in Bezug auf den Datenschutz-Kontakt (jetzt direkte E-Mail statt fiktive Subdomain).
- Neue Priorität für Datenschutz-Kontaktadresse:
  1. Explizites `datenschutzEmail`-Prop (nur setzen wenn Adresse real existiert)
  2. `email`-Prop direkt (Direktkontakt — rechtskonform, keine Halluzination)
  3. Fallback: kein Mail-Block, Hinweis "Kontaktdaten siehe Impressum"
- Hilfsfunktion `datenschutzDomain()` entfernt (war nur für Auto-Generation nötig).

### Documentation

- README: Neue Section "Rechtliche Blöcke (DSGVO)" mit Hinweis zum neuen Verhalten und Beispielen.

### Compatibility

- Backwards-kompatibel: Customer-Sites die `email={siteData.contact.email}` übergeben
  rendern jetzt die reale Kontaktadresse statt einer fiktiven — kein Code-Change nötig.
- Bestehende `datenschutzEmail`-Props werden weiterhin unverändert übernommen.

---

## v0.10.0 (2026-05-19) — (release/cw-core — SEO Components)

### Added

- `FAQSchema.astro` — standalone props-driven FAQPage JSON-LD (cherry-pick #16 von main)
- `ServiceAreaSchema.astro` — GeoShape-Schema für Geo-Landing-Pages (cherry-pick #14)
- `PriceSpecSchema.astro` — JSON-LD PriceSpecification für Pricing-Pages (cherry-pick #17)
- `docs/seo-title-pattern.md` — SEO-Title-Tag-Pattern-Dokumentation (cherry-pick #15)

### Hinweis zur Versionsnummer

Diese Version läuft auf dem `release/cw-core` Branch (Customer-Pins). Der `main`-Branch
ist bei v1.0.8 (Major-Bump nach ContactForm-Refactor). `release/cw-core` wurde bewusst
auf v0.10.0 gehoben (nächster Minor nach 0.9.16) um den Main-Branch-API-Bruch zu umgehen.
Customer-Upgrade: `"@cw/core": "github:siluri/cw-core#release/cw-core/v0.10.0"`

### Compatibility

- Additive Änderung, keine Breaking Changes. Nur neue SEO-Components hinzugefügt.

---

## v0.9.16 (2026-05-13) — (release/cw-core → main)

### Fixed (kritisch)

- `InformationspflichtBlock.astro` § 1 + § 12: **„Verantwortlicher" wird jetzt korrekt als juristische Person dargestellt.** Vorher rendete der Block `legal.owner` (Geschäftsführer-Name) als Entität — bei einer GmbH ist aber die GmbH selbst Verantwortlicher i.S.d. Art. 4 Nr. 7 DSGVO, der GF ist nur Vertreter. Multi-Agent-Audit-Befund K5 (haftungsrelevant für den GF persönlich).

### Added

- Neue optionale Prop `companyName?: string`. Wenn gesetzt: rendert die juristische Person als Verantwortlichen + Geschäftsführer als Vertreter darunter. Wenn nicht gesetzt: Fallback auf `legal.owner + legal.form` (Backwards-Compat — passt für Einzelunternehmer).
- Customer-Site-Integration: `<InformationspflichtBlock legal={siteData.legal} email={...} companyName={siteData.name} branche="..." />`

### Compatibility

- Additive Änderung, keine Breaking Changes. Bestehende Aufrufe ohne `companyName`-Prop rendern wie vor 0.9.15.

---

## v0.9.15 (2026-05-13) — (release/cw-core → main)

### Highlights

- `InformationspflichtBlock.astro` ist jetzt embeddable in größere Pages (z. B. `/datenschutz`). Mit `hideLeadIntro={true}` werden Intro/Cross-Links/Stand-Datum ausgeblendet, mit `id="..."` wird der Wrapper-Anchor gesetzt. Heading-Hierarchie wird im Embed-Mode automatisch auf `h3` abgesenkt (statt h2-Kollision mit der hosting Page).

### Added

- `InformationspflichtBlock` neue optionale Props:
  - `id?: string` (Default `'art-13-geschaeftskontakte'`) — HTML-Anchor für Link-Targets
  - `hideLeadIntro?: boolean` (Default `false`) — Lead-Paragraph, Cross-Links, Stand-Datum ausblenden
  - `showSectionHeading?: boolean` (Default `false`) — optionale h2-Section-Headline „Informationspflichten nach Art. 13 DSGVO (Geschäftskontakte)"
- CSS: Heading-Selektoren matchen jetzt `:is(h2, h3)` — funktioniert in beiden Modi.

### Compatibility

- Vollständig additiv. Bestehende `<InformationspflichtBlock>`-Aufrufe rendern unverändert (h2-Headings, mit Lead-Intro).

---

## v0.9.14 (2026-05-13) — (release/cw-core → main)

### Fixed

- `InformationspflichtBlock.astro`: `Branche`-Union-Type von Multi-Line-Leading-Pipe auf Single-Line umgestellt. esbuild lehnte die Multi-Line-Variante in Astro-Frontmatter mit "Unexpected '|'" ab.

---

## v0.9.13 (2026-05-13) — (release/cw-core → main)

### Highlights

- Neue Block-Komponente `InformationspflichtBlock.astro` für die Art-13-DSGVO-Informationspflicht gegenüber Geschäftskontakten (Neukunden, Interessenten, Vertragspartner). Ergänzt `DatenschutzBlock.astro`, der weiterhin für die allgemeine Website-Datenschutzerklärung zuständig ist.

### Added

- `src/components/blocks/InformationspflichtBlock.astro` — prop-driven Art-13-Page (12 Sections: Verantwortlicher, DSB, Zwecke+Rechtsgrundlagen-Tabelle, Datenkategorien, Empfänger, Drittland-Übermittlung, Speicherdauer, Bereitstellungspflicht, Profiling, Betroffenenrechte, Beschwerde, Kontakt).
- 7 branche-spezifische Empfänger-Default-Sets via `branche`-Prop: `druck`, `solar`, `web`, `handwerk`, `beratung`, `ferienhaus`, `generic`. Customer kann via `empfaenger`-Prop komplett überschreiben.
- Defaults: BayLDA als Aufsichtsbehörde (override-bar), keine DSB-Pflicht angenommen (override-bar via `hatDSB`/`dsb`), Aufbewahrungspflichten HGB/AO.

### Recommended Customer-Integration

Customer-Site: dünne Page `src/pages/informationspflicht.astro`:

```astro
<ContentPage title="Informationspflichten nach Art. 13 DSGVO">
  <InformationspflichtBlock
    legal={siteData.legal}
    email={siteData.contact.email}
    branche="druck"
  />
</ContentPage>
```

Plus Footer-Link in `siteData.nav.footer.rechtliches`:
```ts
{ label: 'Art. 13 DSGVO', href: '/informationspflicht' }
```

### Compatibility

- Additive Änderung, keine Breaking Changes.

---

## v0.9.12 (2026-05-13) — (release/cw-core → main)

### Highlights

- `StellenListe.astro` JobPosting JSON-LD: vollständige PostalAddress + automatisches `validThrough` + optionaler `baseSalary`. Schließt Google-for-Jobs-Warnungen "streetAddress/addressRegion/postalCode/validThrough fehlt" (GSC-Befund customer-digital-direkt 2026-05-13).

### Added

- `StellenListe.astro` neue optionale Props: `street`, `zip`, `region` (PostalAddress).
- `StelleItem` neue optionale Felder: `validThrough` (ISO-Date), `gehaltMin` + `gehaltMax` (EUR pro Jahr, nur emittiert wenn beide gesetzt).
- Auto-Fallback: `validThrough` defaultet auf `datePosted + 90 Tage`, falls pro Stelle nicht gesetzt.

### Changed

- JobPosting `jobLocation.address` enthält jetzt zusätzlich `streetAddress`, `postalCode`, `addressRegion` (nur wenn Props gesetzt).

### Compatibility

- Additive Änderung — alle bestehenden `<StellenListe>`-Aufrufe funktionieren weiter ohne Änderungen.

---

## v0.9.11 (2026-05-12) — (release/cw-core → main)

### Highlights

- CSP-Pragma-Fix für customer-Sites: explicit-domain neben `'self'` in allen Source-Direktiven (siehe Bisection 2026-05-12 auf digital-direkt.com).

---

## v0.9.10 (2026-05-12)

**Feature + Fix:** AI-SEO-Integration, Hreflang-Tags, Plausible Init-Bug-Fix

Drei zusammenhängende SEO-Verbesserungen aus dem digital-direkt.com Phase-2-Audit (`/cw-ai-seo` + `/cw-seo-audit`).

### Feature: `@cw/core/integrations/ai-discovery`

Neue Astro-Integration die zur Build-Zeit `/llms.txt` + `/llms-full.txt` aus `site-data.ts` generiert (llmstxt.org-Spec). Spart pro Customer-Site 1-2h manuelle Wartung — Break-even ab Customer #3.

Setup in `astro.config.ts`:

```ts
import aiDiscovery from '@cw/core/integrations/ai-discovery';

export default defineConfig({
  integrations: [
    aiDiscovery({
      siteData: () => import('./src/data/site-data').then(m => m.siteData),
      faqs: (s) => s.faqs,
      services: (s) => s.leistungen,
    }),
  ],
});
```

Output: `dist/llms.txt` (Discovery: name, description, services, contact) + `dist/llms-full.txt` (Volltext mit FAQs + Service-Details).

### Feature: Hreflang-Tags in BaseLayout.astro

Direkt nach `<link rel="canonical">` werden jetzt `hreflang={lang}` + `hreflang="x-default"` ausgegeben. Nutzt den vorhandenen `lang`-Prop (Default `de`), zero extra config.

### Fix: Plausible `init()` für Custom-Scripts

Bei Plausible Proxy-Scripts (`pa-XXX.js`) ohne `data-domain` muss `plausible.init()` explizit aufgerufen werden, sonst lädt das Script aber initialisiert sich nicht. Bisher wurde `init()` nur bei gesetztem `plausibleEndpoint` aufgerufen (für Self-Hosted-Proxy-Setups). Jetzt unconditional, mit optional Endpoint-Override.

**Wer betroffen ist:** Alle Customer-Sites mit Plausible Custom-Scripts (`pa-...`) ohne Self-Hosted-Endpoint — Install-Verify schlug vorher fehl. DD war betroffen, der Bug hat dieses Release ausgelöst.

**Keine Breaking Changes.** Drop-in-Update von `v0.9.8` aus möglich.

---

## v0.9.9 — 2025 (pre-release)

- data-cta attributes on Hero/CTABlock/Header for global Plausible Events

---

## v0.9.8 (2026-05-09)

**Stable-Promotion** von `v0.9.8-alpha`. **Keine Code-Änderungen** — identischer Tree, nur `-alpha`-Suffix entfernt.

Hintergrund: `v0.9.8-alpha` lief seit dem 8. Mai produktiv in 8 von 10 Customer-Sites (digital-direkt, gottl-richter-gomeier, blitzsicht, hausammincio, hausamlago, soleno, weinkontor-sinzing, steller-sanierungen) ohne Regressions. Plausible-Components, Telegram-Lead-Sink + form-health Smoke-Test sind seitdem unverändert in Produktion. Der Stable-Tag erlaubt die zwei verbleibenden Customer (donau-profi, schiller-gartenbau, beide noch auf v0.9.7) auf einen klar promoteten Pin zu migrieren.

**Migration für Customer-Repos:**

```diff
-  "@cw/core": "github:siluri/cw-core#release/cw-core/v0.9.8-alpha",
+  "@cw/core": "github:siluri/cw-core#release/cw-core/v0.9.8",
```

(bzw. von `v0.9.7` aus für donau-profi + schiller-gartenbau).

Ein nachfolgender `v1.0.0`-Major-Bump als symbolischer Production-Ready-Meilenstein ist eingeplant, sobald alle 10 Customer-Repos auf `v0.9.8` umgepinned und in Prod verifiziert sind.

---

## v0.9.8-alpha (2026-05-08)

**Feature:** Neue Plausible-Analytics-Components als wiederverwendbares Modul unter `src/components/analytics/`.

Bisher war die Plausible-Integration als Inline-Snippet im `BaseLayout.astro` (Zeile ~196–210) hart verdrahtet. Custom-Events lagen ausschließlich in `customer-soleno/src/components/PlausibleEvents.astro` und mussten pro Customer kopiert werden. Dieses Release promotet die Soleno-Lösung zu einem cw-core-Bürger und ergänzt einen Self-Hosted-Migration-Hook für den späteren Hetzner-Switch (Trigger ab Customer 15, M006-Vision).

Neue Components/Module:

- `components/analytics/Plausible.astro` — kapselt Queue-Shim + Script-Loading + Endpoint-Override + neuer `domain`-Override (Self-Hosted-Migration via `data-domain`).
- `components/analytics/PlausibleEvents.astro` — Auto-Event-Tracking für Phone/WhatsApp/Email/CTA/Form/Scroll-Depth. Inhaltlich identisch zur soleno-Version, aber als cw-core-Komponente verfügbar.
- `components/analytics/plausible-events.ts` — TypeScript-Helper `trackPlausible(event, props)` plus `PlausibleEvents`-Konstanten (PhoneClick, EmailClick, ...).

Standard-Setup in einer Customer-Site:

```astro
<BaseLayout {...layoutProps}>
  <Plausible script="https://plausible.io/js/pa-XYZ.js" endpoint="/api/event" />
  <PlausibleEvents />
  <slot />
</BaseLayout>
```

Self-Hosted-Migration via Env-Variable:

```astro
<Plausible
  script={import.meta.env.PLAUSIBLE_SCRIPT_URL ?? 'https://plausible.io/js/pa-XYZ.js'}
  domain={import.meta.env.PLAUSIBLE_DOMAIN}
/>
```

Custom-Events aus TS-Modulen:

```ts
import { trackPlausible, PlausibleEvents } from '@cw/core/components/analytics/plausible-events';
trackPlausible(PlausibleEvents.PhoneClick, { location: 'header' });
```

**Migrations-Hinweis:** Backwards-compatible. Bestehende `BaseLayout`-Props (`plausibleScript`, `plausibleHost`, `plausibleEndpoint`) funktionieren weiter inline. Customer-Repos können optional auf die neuen Components migrieren — Empfehlung: bei nächster Touch-Renovation pro Customer.

Privacy-Hinweis: keine Cookies, keine Schreib-Operationen in Browser-Speicher. Der defensive Lese-Zugriff des Plausible-Scripts auf `localStorage.plausible_ignore` (Self-Opt-Out für Site-Betreiber) ist im Doku-Header der `Plausible.astro`-Component dokumentiert (Pre-Audit M004).

---

## v0.8.31-alpha (2026-04-30)

**Fix:** `ProcessSteps.astro` `.step-nr` als `::before` pseudo-element rendern.

v0.8.30 hat `color: transparent` + `-webkit-text-stroke` versucht — axe-core 4.x prüft `color-contrast` trotzdem auf der computed `color`-Property (= `transparent`, was als 1:1 gegen jeden Hintergrund interpretiert wird) und meldete weiterhin `serious`.

Pseudo-element-Lösung:

- Markup: `<div class="step" data-step-nr={step.nr}>` (kein `<div class="step-nr">`-Inner mehr).
- CSS: `.step::before { content: attr(data-step-nr); color: transparent; -webkit-text-stroke: 1.5px var(--color-accent); … }`.

axe-core 4.x prüft `color-contrast` nicht auf CSS-generated content via `content:` — Pseudo-elemente werden in der color-contrast-Regel anders behandelt (DOM-Text-Knoten only). **Lokal verifiziert** mit cw-audit gegen `pnpm preview`-Build: a11y axe `pass`, 24 passes, 0 verbleibende color-contrast-Verstöße.

Visueller Effekt unverändert: Outline-Watermark in accent-color, opacity 0.55.

---

## v0.8.30-alpha (2026-04-30)

**Fix:** `ProcessSteps.astro` `.step-nr` Watermark rendert jetzt WCAG-konform.

Das große dekorative Schritt-Nummer-Watermark (`<div class="step-nr" aria-hidden="true">`) nutzte `color: var(--color-accent)` + `opacity: 0.15`. Die effektive Farbe nach Alpha-Blending verfehlt WCAG 2.2 AA Color-Contrast (4.5:1) — axe meldet das als `serious`, weil `aria-hidden="true"` die `color-contrast`-Regel **nicht** ausnimmt (Spec-Konformität).

Fix: `color: transparent` + `-webkit-text-stroke: 1.5px var(--color-accent)`. Element wird als Outline gerendert — kein Fill bedeutet keine Color-Contrast-Prüfung gegen den Hintergrund. Visueller Effekt bleibt subtil-dekorativ, opacity 0.55 ersetzt 0.15 für vergleichbare Dezenz.

Wirkt auf alle Customer-Sites mit `<ProcessSteps/>` (schiller, gottl-richter-gomeier, hausamlago, hausammincio, steller, weinkontor, donau-profi, digital-direkt). Vorher 1× `serious` axe-Verstoß auf Sites mit ProcessSteps auf der Homepage; nach Pin-Bump weg.

**Bonus:** `package.json`-Version war seit v0.8.27 nicht mehr gebumpt (v0.8.28 + v0.8.29 hatten den Bump vergessen) — jetzt auf v0.8.30-alpha synchronisiert.

---

## v0.8.29-alpha (2026-04-30)

**Fix:** `BaseLayout.astro` reicht den `founder`-Prop jetzt durch zu `<SchemaOrg/>`.

`v0.8.28` hat den `founder`-Prop in `SchemaOrg.astro` eingeführt, aber `BaseLayout` hatte den Typ nicht in `SchemaProps` und reichte den Wert nicht weiter. Resultat: Customer-Repos konnten den Prop in `schemaConfig` setzen, aber im gerenderten HTML fehlte das Person-JSON-LD. Behoben durch:

- `SchemaProps.founder?: FounderData` im BaseLayout-Interface.
- `<SchemaOrg founder={schema.founder} … />` im Forwarding-Block.

**Customer-Repos:** Non-breaking. Wer den Prop nicht setzt, kriegt nichts. Aktivierung via `schemaConfig.founder` in `src/data/page-config.ts` (siehe schiller-gartenbau Commit `ae057a2` als Referenz).

---

## v0.8.28-alpha (2026-04-30)

**Feature:** `founder`-Prop in `SchemaOrg.astro` für E-E-A-T Person-Entity.

Audit-Warn `marketing.eeat-author` zeigt: Google + KI-Crawler bewerten Quellen-Vertrauen unter anderem über sichtbare Inhaber-/Autor-Entitäten (Schema.org `Person`, `rel="author"`, `worksFor`). Bisher rendert `SchemaOrg.astro` nur `LocalBusiness`/`ProfessionalService` ohne Personen-Verknüpfung.

Neuer Prop:

```typescript
founder?: {
  name: string;
  jobTitle?: string;
  description?: string;
  image?: string;
  email?: string;
  phone?: string;
  knowsAbout?: string[] | readonly string[];
  credentials?: string[] | readonly string[];
  sameAs?: string[] | readonly string[];
};
```

Verhalten:
- Wenn gesetzt: separates `<script type="application/ld+json">` mit `Person`-Entity, stable `@id` (`{siteUrl}/#person-{slug}`), `worksFor: { @id: organizationId }`.
- LocalBusiness/Organization bekommt `founder: { @id: personId }` als Cross-Reference (Schema.org-Best-Practice für Entity-Linking).
- `slugifyName()` normalisiert deutsche Umlaute (Schiller, Müller, Gröning) deterministisch.

**Hinweis:** Dieser Tag allein reichte den Prop nicht durch BaseLayout — siehe v0.8.29 für den vollständigen Fix.

---

## v0.8.27-alpha (2026-04-30)

**Feature:** Site-wide Cloudflare Turnstile Pre-Clearance — schließt Bot-Fight-Mode-Loop bei Plugin-heavy Browsern.

Cloudflare Bot Fight Mode (`enable_js: true`) führt eine clientseitige JS-Challenge aus, die DevTools-Open + Browser-Plugins (1Password, Wappalyzer, etc.) als Bot-Signal interpretieren kann. Resultat: Visitor sieht "Sicherheitsüberprüfung wird durchgeführt", `cf_clearance` wird ausgestellt, beim nächsten Request invalidiert — Loop. Auf CF Free Plan koppelt die API `fight_mode` und `enable_js` (kann nicht solo abgeschaltet werden).

Lösung: Pre-Clearance-Widget unsichtbar Site-Wide rendern, damit Cloudflare `cf_clearance` ausstellt **bevor** Bot Fight Mode challengen kann.

Neue Komponente:

- `@cw/core/components/forms/TurnstilePreClearance.astro` — invisible Turnstile-Widget. Renders nur wenn `sitekey` Prop gesetzt ist. Cohabitates mit Form-Widgets (gleicher Sitekey, andere `data-action`).

Neue Layout-Props:

- `LandingPage.turnstileSiteKey?: string`
- `ContentPage.turnstileSiteKey?: string`

**Voraussetzung:** Das Turnstile-Widget am angegebenen Sitekey muss `clearance_level: "non_interactive"` konfiguriert haben (CF-Setting, nicht im Code). Sonst zeigt CF beim Pre-Clearance-Check eine sichtbare Klick-Aufforderung.

**Customer-Repos:** Non-breaking — wer den Prop nicht setzt, kriegt nichts gerendert (gleiches Verhalten wie v0.8.26). Aktivierung: `turnstileSiteKey={import.meta.env.PUBLIC_TURNSTILE_SITE_KEY}` an LandingPage/ContentPage durchreichen (analog zum bestehenden Form-Widget-Pattern).

### Auch in diesem Tag enthalten (Onboarding-Tooling)

- `scripts/validate-tokens-css.mjs` — WCAG 2.2 AA Color-Contrast-Check für `tokens.css` vor erstem Build. Hätte gottl/siluri/schiller a11y-Fails beim Onboarding gefangen statt 6 Monate später beim Audit.
- `src/templates/llms-endpoint.ts.template` — SSOT-getriebener Astro-Endpoint, generiert `public/llms.txt` aus `site-data.ts` beim Build. Customer kopiert nach `src/pages/llms.txt.ts`.
- `templates/customer-CLAUDE.md` — Astro `<Image>` als Default-Pattern, llms-Endpoint-Convention, WCAG-Validator-Aufruf.

---

## v0.8.26-alpha (2026-04-30)

**Feature:** Branded Lead-Notification-Mail mit Blitzsicht-Header + Direkt-Antworten-Button.

`createContactHandler` ruft jetzt intern `buildLeadEmail` auf (`@cw/core/utils/forms/build-lead-email`) und schickt eine HTML-Mail an den Customer:

- **FROM-Display-Name** zeigt `"{Lead-Name} via {Customer-Site}"` — Outlook-Posteingang macht sofort klar, *wer* der Lead ist und *über welche Seite* er kam.
- **Branded HTML** mit Blitzsicht-Header (Logo + Nachtblau-Stripe), formatierter Lead-Detail-Tabelle, Nachricht in Akzent-Quote-Box, dickem Orange-CTA-Button, dezentem Footer-Stripe.
- **Direkt-Antworten-Button** mit `mailto:` inkl. vorgefülltem Subject (`Re: Ihre Anfrage über {siteName}`) und freundlichem Body-Opener (`Hallo {leadName}, vielen Dank für Ihre Anfrage…`) plus Quote der Original-Anfrage.
- **Plain-Text-Fallback** bleibt für Spam-Filter / alte Mail-Clients erhalten.
- `reply_to: leadEmail` bleibt — Klick auf "Antworten" geht direkt an den Lead.

**Voraussetzung:** Logo-Asset muss unter `https://blitzsicht.com/lead-mail/logo-white.png` öffentlich erreichbar sein (240×64, weiß auf transparent). Liegt im `customer-blitzsicht`-Repo.

**Customer-Repos:** Nach `package.json`-Bump auf `v0.8.26-alpha` automatisch aktiv. Keine API-Änderungen, kein Code-Update im Customer-Repo nötig.

---

## v0.8.21-alpha (2026-04-29)

**Chore:** `.d.ts` für `contact-handler.js` ergänzt — TypeScript-Customer-Repos können den Handler jetzt typsicher importieren.

---

## v0.8.20-alpha (2026-04-29)

**Hotfix:** v0.8.19 hat den Handler als `.ts` exportiert, das kann Vercel Function Builder nicht aus node_modules auflösen. Konvertiert zu `.js` mit JSDoc-Types — gleicher Stil wie der bestehende `handle-submission.js`.

→ **Customer-Repos sollten v0.8.19 überspringen und direkt auf v0.8.20-alpha pinnen.**

---

## v0.8.19-alpha (2026-04-29)

**Feature:** Zentraler Form-Handler `createContactHandler` (`@cw/core/api/contact-handler`)

**Hintergrund:** Bisher hatte jedes Customer-Repo seinen eigenen `api/contact.ts` mit unterschiedlichem Schutz-Niveau (Schiller hatte Turnstile, Weinkontor nicht, Hausamlago auch nicht…). cw-core-Bugs (z.B. fehlender Honeypot in v0.8.4) wurden N-mal wiederholt. Konsolidierung ist überfällig.

**Neue API:**

```typescript
// customer-repo/api/contact.ts
import { createContactHandler } from '@cw/core/api/contact-handler';

export default createContactHandler({
  allowedOrigins: ['https://kunde.de', 'https://www.kunde.de'],
  fromName: 'Kunde GmbH',
  subject: 'Neue Anfrage über kunde.de',
});
```

**Schichten (in Prüf-Reihenfolge):** Method-Check → Origin-Check → Rate-Limit → Body-Parsing → Honeypot (botcheck + url_honey) → Turnstile (Pflicht) → Email-Validation → Content-Filter (Spam-Keywords, multiple URLs, BTC/ETH-Adressen, Cyrillic/CJK-Anteil ≥30%) → Resend-Versand.

**Erforderliche Vercel Env-Vars:** `CONTACT_EMAIL`, `RESEND_API_KEY`, `TURNSTILE_SECRET_KEY`. Optional `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` für persistenten Rate-Limit über alle Function-Instances.

**Migration:** Customer-Repos mit eigenem `api/contact.ts` ersetzen ihren Code durch den 3-Zeilen-Aufruf oben + Bump auf v0.8.19-alpha. Der alte `handleFormSubmission` (v0.8.3) bleibt für Backwards-Compat erhalten, neue Repos sollten `createContactHandler` nutzen.

---

## v0.8.18-alpha (2026-04-29)

**Fix:** Honeypot wurde nur im Web3Forms-Branch gerendert — Custom-Endpoint-Kunden hatten keinen Honeypot

**Hintergrund:** Bei Schiller Gartenbau kam SPAM trotz Turnstile durch. Root Cause: Der `botcheck`-Honeypot in `ContactForm.astro` war innerhalb des `useWeb3Forms`-Conditional eingebettet (Zeile 72-80). Kunden mit eigenem `actionUrl` (Schiller, Blitzsicht) hatten den Honeypot nicht im DOM — die Server-Prüfung lief ins Leere. Bots die Turnstile via Captcha-Solving-Services lösen ($1-3/1000) hatten freie Bahn.

**Fix:**
- `botcheck`-Honeypot aus dem `useWeb3Forms`-Conditional rausgezogen → wird jetzt in beiden Submit-Pfaden gerendert
- Zusätzlicher `url_honey`-Honeypot eingeführt (Bots füllen oft URL/Website-Felder automatisch aus)

**Action für Customer-Repos mit eigenem `api/contact.ts`:**

Server-seitig sicherstellen, dass beide Honeypot-Felder geprüft werden:

```typescript
if (body.botcheck || body.url_honey) {
  res.status(200).json({ ok: true });  // silent drop
  return;
}
```

**Roll-out:** Alle Customer-Repos mit Custom-Endpoint sollten auf v0.8.18-alpha+ aktualisieren.

---

## v0.8.4-alpha (2026-04-23)

**Fix:** Astro-Komponenten nutzten `@/`-Alias-Imports — bricht beim Build im Kunden-Repo

Hintergrund: Seit v0.7.9 (Plausible-Tracking) verwendeten 12 Komponenten `import { track } from '@/utils/analytics/track'`. Im cw-core-Repo selbst funktioniert das (Alias in tsconfig), aber wenn die Komponenten als Tarball ins node_modules eines Kunden landen, kann Vite/Rollup `@/` nicht auflösen → `Rollup failed to resolve import`. Alle Kunden-Builds auf v0.7.9–v0.8.3 brechen.

Fix: Alle `@/utils/...`-Imports in Komponenten/Layouts auf relative Pfade (`../../utils/...`) umgestellt.

Betroffene Dateien (12):
ContactForm, Hero, Header, BaseLayout, FAQ, CTABlock, DankePage, FloatingCalButton, LeistungenSection, NotFoundPage, PaketeSection, StellenListe.

---

## v0.8.3-alpha (2026-04-23)

**Feature:** Cloudflare Turnstile Spam-Schutz für ContactForm

**CSP-Pflicht:** Jedes Kunden-Repo braucht in `vercel.json` einen CSP-Update, sonst blockt der Browser das Turnstile-Widget (iframe + Script von `challenges.cloudflare.com`):

```text
script-src  ... https://challenges.cloudflare.com
connect-src ... https://challenges.cloudflare.com
frame-src   ... https://challenges.cloudflare.com
```

→ wurde am 2026-04-23 in allen 8 Customer-Repos nachgepflegt.

Hintergrund: Kunden-Kontaktformulare wurden von Bots mit russischsprachigem Spam geflutet.
Der bisherige Honeypot-Schutz (`botcheck`) wird von modernen Bots ignoriert.
Cloudflare Turnstile ist kostenlos, DSGVO-konform, und für echte Nutzer unsichtbar.

Neue Props / Config:

- `ContactForm` akzeptiert optional `turnstileSiteKey?: string` — rendert das Turnstile-Widget und lädt das CF-Script
- `handleFormSubmission` akzeptiert optional `turnstileSecretKey?: string` in der Config — validiert den Token gegen die Cloudflare-API
- Ohne diese Props/Keys: kein Turnstile, altes Verhalten bleibt erhalten (backward-compatible)

Setup pro Kunde:

1. Turnstile-Site im CF Dashboard anlegen, Domain eintragen
2. Vercel: `PUBLIC_TURNSTILE_SITE_KEY` + `TURNSTILE_SECRET_KEY` setzen
3. `kontakt.astro`: `turnstileSiteKey={import.meta.env.PUBLIC_TURNSTILE_SITE_KEY}` zu `<ContactForm>` hinzufügen
4. `api/contact.ts` (cw-core-Kunden): `turnstileSecretKey: process.env.TURNSTILE_SECRET_KEY` in den `handleFormSubmission`-Config

**Neuer-Kunde-Hinweis:** Beim Onboarding die neue Domain im Cloudflare Turnstile Dashboard nachtragen.

---

## v0.8.2-alpha (2026-04-21)

**Feature:** Form Abandonment, Service Click, Time on Page

Kontext: Ergänzt das Event-Set um Abbruch-Tracking (welche Formulare werden angefangen aber nicht abgeschickt?), Leistungs-Interesse und Engagement-Tiefe über Zeit.

Neue Events:

| Event | Komponente | Props |
| ----- | ---------- | ----- |
| `Form Abandoned` | ContactForm | `type` — nur wenn Form gestartet, nicht submitted, Seite verlassen |
| `Service Click` | LeistungenSection | `service` (Karten-Titel) — nur wenn Item ein `href` hat |
| `Time on Page` | BaseLayout (global) | `duration: '30s' \| '2min' \| '5min'` |

`Form Abandoned` feuert via `visibilitychange` — sicherer als `beforeunload` mit Astro View Transitions.

---

## v0.8.1-alpha (2026-04-21)

**Feature:** DankePage Tracking, PDF Downloads, Nav Clicks, Mobile Nav Toggle

Kontext: Schließt den Conversion-Funnel (Thank You Page als Zielereignis in Plausible nutzbar), erfasst PDF-Downloads und Navigation-Verhalten passiv ohne Konfiguration.

Neue Events:

| Event | Komponente | Props |
| ----- | ---------- | ----- |
| `Thank You Page Viewed` | DankePage | — |
| `File Download` | BaseLayout (global) | `filename` |
| `Nav Click` | Header | `label`, `href` |
| `Mobile Nav Open` | Header | — |

---

## v0.8.0-alpha (2026-04-21)

**Feature:** Erweiterte Plausible Events — Scroll Depth, Outbound Clicks, 404 Tracking, Job Application

Kontext: v0.7.9 hat alle primären Conversion-Events eingebaut. v0.8.0 ergänzt Engagement-Metriken (Scroll Depth) und passives Tracking (Outbound, 404) — gibt Kunden ein vollständiges Bild wie weit User lesen und wohin sie abspringen.

Neue Events:

| Event | Komponente | Props |
| ----- | ---------- | ----- |
| `Scroll Depth` | BaseLayout (global) | `depth: '25%' \| '50%' \| '75%' \| '100%'` |
| `Outbound Click` | BaseLayout (global) | `url` (nur Origin, z.B. `https://instagram.com`) |
| `404 Error` | NotFoundPage | `path` (aktuelle URL-Pfad) |
| `Job Application Click` | StellenListe | `position`, `type: 'apply' \| 'initiative'` |

Scroll Depth wird einmalig pro Seite gefeuert (kein Doppelfire beim Zurückscrollen). Outbound trackt alle externen Links außer der eigenen Domain — Instagram, Google Maps, Partner-Sites etc.

---

## v0.7.9-alpha (2026-04-21)

**Feature:** Plausible Custom Events in allen relevanten Komponenten

Bisher hat cw-core nur Pageviews getrackt. Ab v0.7.9 feuern alle
Conversion-relevanten Komponenten Custom Events — unabhängig davon ob
der Kunde Plausible konfiguriert hat (Graceful Degradation).

**Graceful Degradation Fix (BaseLayout):**
Der `window.plausible` Queue-Shim wird jetzt immer gerendert, auch wenn
`plausibleScript` nicht gesetzt ist. Bisher crashten Seiten ohne Plausible
mit `TypeError` sobald eine Komponente `plausible()` aufrief.

**Neue Tracking-Utility:** `src/utils/analytics/track.ts`
Typsichere Wrapper-Funktion, importierbar in allen Astro-Script-Blöcken.

**Neue Custom Events:**

| Komponente         | Event               | Props                                                        |
| ------------------ | ------------------- | ------------------------------------------------------------ |
| `BaseLayout`       | `Phone Click`       | `number` — alle `tel:`-Links seitenübergreifend              |
| `BaseLayout`       | `Email Click`       | `address` — alle `mailto:`-Links seitenübergreifend          |
| `Hero`             | `Hero CTA Click`    | `label`                                                      |
| `CTABlock`         | `CTA Click`         | `label`                                                      |
| `ContactForm`      | `Form Start`        | `type` (contact/audit/bewerbung)                             |
| `ContactForm`      | `Form Submit`       | `type`, `status` (success/error)                             |
| `FAQ`              | `FAQ Open`          | `question` (erste 60 Zeichen)                                |
| `PaketeSection`    | `Package Click`     | `package_name`                                               |
| `CalEmbed`         | `Calendar Opened`   | — (nur lazy-mode)                                            |
| `CalEmbed`         | `Booking Completed` | `calendar` — feuert wenn tatsächlich gebucht (lazy+non-lazy) |
| `FloatingCalButton`| `Cal Button Click`  | —                                                            |

**Migrations-Hinweis für bestehende Customer-Repos:**
Keine Breaking Changes. Events sind additiv — Customer-Repos bauen ohne
Änderungen. `window.plausible` ist jetzt immer als Shim vorhanden, selbst
wenn `plausibleScript` in `site-data.ts` leer/undefined ist.

**Weitere Fixes (aufgeräumte uncommitted changes):**

- `Header.astro`: `width`/`height` Attribute auf Logo-`<img>` für bessere CLS-Werte
- `Footer.astro`: Copyright-Zeile Textfarbe von `rgba(255,255,255,0.4)` → `0.6` (besser lesbar)

---

## v0.7.7-alpha (2026-04-21)

**Tweak:** Bento-Hero symmetrisch — Triangle-Anordnung mit Spiegel-Achse

v0.7.6 war rechtslastig: Big Hero rechts-außen, beide Inset-Cards unten
rechts mit leichtem Overlap. User-Feedback: „schön symmetrisch ist".

Neue Anordnung (Triangle-Bento):
- `--1` (Big Hero): `top:0; left:50%; translateX(-50%); width:85%`
  → zentriert oben
- `--2` (Inset rechts): `bottom:0; right:0; width:45%; z-index:2`
- `--3` (Inset links): `bottom:0; left:0; width:45%; z-index:2`

Beide Inset-Cards haben jetzt identische Breite, gleiche Bottom-Ankerung,
gleichen Kantenabstand und gleichen z-index. Vertikale Spiegel-Achse durch
die Container-Mitte. Container-aspect 1/1 → 4/3 (breiter) für sauberen
Überlapp zwischen Big Hero und den beiden unteren Karten.

API/Props unverändert.

---

## v0.7.6-alpha (2026-04-21)

**Redesign:** `Hero.images` — Bento-Layout statt Collage

Nach 5 Collage-Iterationen (v0.7.0–v0.7.5) zeigte die finale diagonale Treppe
mit 3 gleich breiten Bildern im 45%-Grid-Slot keine visuelle Wirkung — User-
Feedback: „schaut nach nichts aus". Statt 6. Iteration: Konzeptwechsel auf
Bento-Layout.

**Neues Konzept:** klare Bild-Hierarchie
- `--1` (Big Hero): `top:0; right:0; width:100%` — Haupt-Layer
- `--2` (Medium Inset): `bottom:0; right:0; width:50%; z-index:2`
- `--3` (Small Inset): `bottom:8%; left:12%; width:42%; z-index:3`

Container-aspect von 5/4 → 1/1 (square) für mehr vertikalen Raum. Border von
1px transparent auf 2px weiß verstärkt zur klaren Kartentrennung. Shadow
0.32 Alpha (leicht dunkler als 0.28).

**Backward-Compat:** API unverändert — `images?: HeroCollageImage[]`-Prop
akzeptiert weiterhin 2–3 Einträge. Andere Customer ohne `images`-Prop
unaffected (Split-Layout mit `image`-Prop bleibt identisch).

Erhaltene Patterns aus v0.7.3–v0.7.5:
- `.hero-collage :global(...)` Scoped-Parent-Pattern
- `height: auto` Override für TiltCard's `height: 100%`
- Mobile (< 900px) zeigt nur `--1` (display:none für --2, --3)

---

## v0.7.5-alpha (2026-04-21)

**Fix:** Hero-Collage — TiltCard `height: 100%` verdeckt Item--1; Mobile-Single-Image

**Bug 1 (Desktop):** Trotz korrekter Positionierung zeigten sich nur 2 von 3
Collage-Bildern. Ursache: TiltCard's interne CSS setzt `.motion-tilt { height: 100% }`.
Die `.hero-collage-item` Klasse liegt genau auf diesem Wrapper — jeder Item wurde
damit full-height des Containers. Item--1 und Item--3 landeten komplett
übereinander, DOM-später (Item--3) verdeckte Item--1 visuell.

**Fix 1:** `.hero-collage :global(.hero-collage-item) { height: auto }` — Items
nehmen jetzt Content-Höhe (= img mit aspect-ratio 4/3), diagonale Treppe ist
sauber sichtbar.

**Bug 2 (Desktop):** Item--2 mit `left: -18%; width: 80%` ragte bewusst über die
Grid-Spalte hinaus, überlappte aber mit dem Text der linken Spalte.

**Fix 2:** Conservativere Layout-Werte — alle Items `width: 68%`, Item--2
leicht eingerückt mit `left: 6%` statt negative overhang. Saubere Treppe innerhalb
der 45%-Spalte, kein Text-Overlap. `.hero-collage` aspect-ratio auf 5/4 (etwas
breiter statt fast-square).

**Feature (Mobile):** Nur Item--1 anzeigen, Item--2 und --3 `display: none`.
Motivation: 3 gestackte Bilder auf schmalen Viewports waren visuell zu viel;
ein klares Produktbild (Showroom) reicht auf Mobile.

---

## v0.7.4-alpha (2026-04-21)

**Fix:** Hero-Collage Mobile-Override leakt auf Desktop — `@media` wurde gestrippt

**Bug in v0.7.3:** Die Desktop-Regeln mit `:global(.hero-collage-item*)` funktionierten,
aber die Mobile-Overrides — ebenfalls mit `:global(...)`, eingeschlossen in
`@media (max-width: 900px)` — wurden von Astros Scoped-CSS-Compiler falsch
transformiert: der `@media`-Wrapper verschwand aus der kompilierten CSS.

Folge: `.hero-collage-item{position:static;width:100%}` galt auf allen Viewports,
überschrieb die Desktop-Positionen (`left: -18%` etc.) → Items stapelten vertikal
in der Flex-Column, volle Breite, ohne Diagonal-Versatz. Genau wie der User
sagte: "Frames rendern vollflächig schwarz, keine Bildinhalte sichtbar" — in
Wahrheit waren die Bilder 100%-breit gestapelt, nicht schwarz.

**Fix:** Pattern-Wechsel von standalone `:global(.hero-collage-item*)` zu
`.hero-collage :global(.hero-collage-item*)`. Der scoped `.hero-collage`-Parent
bekommt Astros data-cid-Binding, der `:global(...)`-Child bleibt unscoped. Die
Kombination behält den `@media`-Wrapper korrekt bei. Gleiche Spezifität auf
Desktop wie Mobile → saubere Overrides per Media-Query.

Gilt für alle Collage-Regeln: `.hero-collage-item*`, `.hero-collage-frame`,
`.hero-collage-img`, `.hero-image-wrap` (im Collage-Modus versteckt).

---

## v0.7.3-alpha (2026-04-21) — CRITICAL

**Fix:** Hero-Collage Positioning greift jetzt überhaupt (CSS-Scoping-Bug)

**Bug:** In v0.7.0 / v0.7.1 / v0.7.2 wurden die `.hero-collage-item--1/2/3` sowie
`.hero-collage-frame` und `.hero-collage-img` Regeln als Astro-scoped-CSS mit
`data-astro-cid-oupxbpgs` kompiliert. Die Class landet aber auf Wrapper-Divs aus
der `TiltCard`-Komponente (und `<Image>` aus `astro:assets`) — beide haben eigene
Astro-Komponenten-Scopes (z.B. `data-astro-cid-wusev46n`). Der generierte Selector
`.hero-collage-item--2[data-astro-cid-oupxbpgs]` matchte damit **null Elemente**.

Resultat: `position: absolute` + `top/left/right` Werte wurden gar nicht
angewendet. Die Items fielen auf `position: static` zurück und stapelten vertikal
im Normal-Flow — in der 45%-Grid-Spalte des Split-Layouts.

**Fix:** Alle Regeln die auf child-component-Wrapper zielen mit `:global(...)`
wrappen: `.hero-collage-item*`, `.hero-collage-frame`, `.hero-collage-img`, und
das versteckte `.hero-image-wrap` im Collage-Modus. Der äußere `.hero-collage`
div bleibt scoped (gehört Hero.astro direkt).

Ohne diesen Fix war jede `.hero-collage-item*`-Änderung seit v0.7.0 faktisch
unwirksam.

---

## v0.7.2-alpha (2026-04-21)

**Tweak:** `Hero.images` Collage — mittleres Bild ragt nach links aus Container

- Feedback Digital-Direkt: In v0.7.1 lag die Staffelung komplett innerhalb der 45%-Spalte
  des Split-Grids, wodurch die Diagonal-Staffelung visuell nicht ankam.
- Neu: Das mittlere Bild wird mit `left: -18%` und `width: 80%` positioniert und ragt
  damit bewusst über die Grid-Spaltengrenze in den Text-Raum hinein — analog zum
  User-Mockup. Die äußeren Bilder bleiben im 72%-Bereich mit 0/4% Versatz rechts.
- Container (`.hero--collage .container`) bekommt `overflow: visible`, damit das
  "ausbrechende" Bild nicht abgeschnitten wird. Aspect-Ratio auf 4/4.2 (leicht hoch).
- Border sehr dezent (1px halbtransparent) statt 2px weiß — keine Polaroid-Anmutung mehr.
- API/Prop-Struktur unverändert.

---

## v0.7.1-alpha (2026-04-21)

**Tweak:** `Hero.images` Collage — diagonale Treppe statt Polaroid-Rotation

- Feedback aus Digital-Direkt-Release v0.7.0: die rotierten, stark überlappenden
  Polaroids wirkten zu verspielt für ein B2B-Druckdienstleister-Hero.
- Neues Layout: drei Bilder als diagonale Treppe (top-right → mid-left → bottom-right),
  keine Rotation, nur leichte Überlappung an den Kanten. Border von 4px → 2px
  reduziert, Shadow dezenter (`0 18px 40px rgba(0,0,0,0.30)`). Border-radius leicht
  erhöht auf `1.125rem` für moderneren Look.
- Nur CSS-Tweak an `.hero-collage-item--*` — API/Prop-Struktur unverändert,
  Customer brauchen keinen Code-Change, nur Pin-Update.

---

## v0.7.0-alpha (2026-04-21)

**Feature:** `Hero.images` — Collage-Modus mit 2–3 überlappenden Bildern

- Neues optionales Prop `images?: readonly { src: ImageMetadata; alt?: string }[]` auf `Hero.astro`
- Drittes Layout neben Split-Image und Gradient-Only: versetzte, rotierte Bilder mit weißem
  Polaroid-Rahmen und Box-Shadow. Auf Desktop positioniert (rotate: -4deg / +2deg / +5deg),
  stapelt mobil vertikal ohne Rotation.
- Hover-Interaktivität über bestehende `TiltCard.astro` (`maxTilt={4}`, `scale={1.02}`) —
  identische Subtle-Animation wie bei `PaketeSection`. Respektiert `prefers-reduced-motion`.
- `images` hat Vorrang vor `image`, wenn ≥ 2 Einträge geliefert werden; das Split-Layout
  bleibt für alle anderen Customer unverändert.
- Use-Case: Digital-Direkt Hero (Kundenwunsch — drei Leistungsbilder überlappend).

```astro
<Hero
  images={[
    { src: imgA, alt: 'Büro' },
    { src: imgB, alt: 'Managed Print' },
    { src: imgC, alt: 'Service vor Ort' },
  ]}
  ... // alle anderen Props bleiben identisch
/>
```

Backward-kompatibel: Customer ohne `images`-Prop laufen unverändert weiter.

---

## v0.6.5-alpha (2026-04-20)

**BREAKING:** `Hero.image` und `KarriereHero.teamImage` akzeptieren nur noch `ImageMetadata`, nicht länger `string`

- Bug: Ein String-Pfad (z.B. `"/images/hero/hero.webp"`) landete unverändert im `<img src="...">` und
  umging Astros Bild-Pipeline komplett — kein `srcset`, keine Rekompression, keine Responsive-Varianten.
  Konsequenz: Schiller Gartenbau lieferte 247 KB Hero-Bild in 946×728 aus, obwohl nur 788×560 angezeigt.
  Lighthouse meldete 175 KiB Einsparpotenzial.
- Fix: Prop-Typ auf `ImageMetadata` verengt. Der String-Fallback-Pfad im Template ist gestrichen.
  TypeScript blockiert jetzt bereits beim Build, wenn jemand versehentlich einen String durchreicht.
- Migration in `index.astro`:

  ```diff
  - image="/images/hero/hero.webp"
  + import heroImage from '@/assets/images/hero.webp';
  + image={heroImage}
  ```

- Das Bild muss dabei aus `public/images/hero/` nach `src/assets/images/` umziehen.

---

## v0.6.4-alpha (2026-04-18)

**Fix:** `PageHero` Subtext-Zentrierung — `margin-inline: auto` auf `.page-hero p`

- Bug: `max-width: 44rem` ohne `margin-inline: auto` → `<p>`-Block saß linksbündig
  im Container (224px Versatz zur h1-Mitte auf Desktop). Text war zentriert
  innerhalb des Blocks, der Block selbst nicht. Ein 1-Zeilen-Fix.

**Fix:** `CalEmbed.lazy` Placeholder — kein 680px-Void mehr

- Der Placeholder-Container startete mit `min-height: 680px` → Button schwamm
  in einer 680px großen leeren Fläche (sah aus wie ein kaputter Ladescreen).
- Neues Verhalten: Placeholder startet bei `min-height: 280px`. Bei Klick:
  Container bekommt JS-gesteuertes `style.minHeight = fullHeight` → CSS-Transition
  `0.3s ease-out` auf 680px → danach Cal-Script-Injection.
- Kein CLS für echte User (aktiver Click = kein unerwarteter Layout-Shift).
  Kein visuell gebrochenes Interface mehr.

**Feature:** `PageHero` — neue Props `backgroundPosition` und `overlayStrength`

- `backgroundPosition?: string` (Default `'center'`) — CSS-Position des Hintergrundbilds.
- `overlayStrength?: 'light' | 'medium' | 'strong'` (Default `'medium'`) — steuert
  die Dunkelheit des Overlay-Gradients über dem Bild.
  - `light`: `rgba(29,30,59,0.45)` — Bild dominanter
  - `medium`: `rgba(29,30,59,0.7)` — ausgewogen (bisheriges Verhalten)
  - `strong`: `rgba(29,30,59,0.85)` — Text-Lesbarkeit maximiert
- Beide Props sind opt-in, bestehende PageHero-Nutzungen unverändert.

**Breaking:** Keine. Alle Änderungen sind backward compatible.

**Upgrade-Check:**
- `/kontakt`: Subtext jetzt korrekt zentriert ohne Änderungen am Customer-Repo.
- Lazy-Cal: Placeholder-UI sieht jetzt sauber aus (280px statt 680px leer).
- PageHero mit Bild: `overlayStrength="strong"` setzen wenn Text schwer lesbar.

---

## v0.6.3-alpha (2026-04-18)

**Feature:** `CalEmbed.lazy` — Cal-Skript hinter Button-Klick verstecken (kein LCP-Impact)

- Neues Prop `lazy?: boolean` (Default `false`). Bei `true`: Container behält `minHeight`
  und zeigt einen "Termin direkt buchen"-Button. Beim Klick: Placeholder faded aus,
  Cal-Skript wird dynamisch injiziert. **Kein CLS** — der Raum ist bereits reserviert.
- `lazyLabel` und `lazySubtext` Props für Button-Beschriftung + Unterzeile.
- Cleanup-Listener (`astro:before-swap`) wird nur registriert wenn tatsächlich geklickt.
  Kein Memory-Leak, kein toter Listener auf Seiten wo der Button nie angeklickt wird.
- Empfohlen für alle Seiten wo der Kalender below-the-fold ist (z.B. `/kontakt`).

**Feature:** `PaketeSection.single` — Single-Card-Modus für Homepage-Teaser

- Neues Prop `single?: boolean` (Default `false`). Bei `true`: Grid wechselt auf
  `1 col, max-width 460px, margin-inline auto`. Negative Margins der Highlighted-Card
  werden aufgehoben. Gedacht für Homepage-Pattern "nur das Highlight-Paket + Link zu /pakete".

**Breaking:** Keine. Alle neuen Features sind opt-in.

**Upgrade-Check:**
- `/kontakt`: `<CalEmbed lazy={true} />` setzen → ~120 KB JS erst on-demand.
- Homepage: `<PaketeSection items={[highlighted]} single />` + Link zu `/pakete`.

---

## v0.6.2-alpha (2026-04-18)

**Docs:** `CalEmbed.astro` JSDoc um Layout-Regel erweitert — Widget gehört
IMMER in eine eigene `<section>` mit full container-width, NIEMALS in Grid-
Spalten oder neben Form-Feldern. Cal.com-Kalender braucht ≥ 600 px Breite,
sonst gequetscht auf Desktop und unbenutzbar auf Tablet.

**Fix:** `CalEmbed.minHeight` Default `500px → 600px` — 500 war zu knapp
für den realen Widget-Inhalt (Monatsview + Slot-Picker).

**Breaking:** Keine. API und Verhalten sind rückwärtskompatibel.

---

## v0.6.1-alpha (2026-04-18)

**Fix:** Motion Wave 2 Defaults waren zu subtil — User sieht den Effekt nicht.

- `TiltCard` Defaults: `maxTilt: 6 → 10`, `scale: 1.01 → 1.03`. Deutlich wahrnehmbar, weiterhin B2B-tauglich.
- `MagneticButton` Defaults: `strength: 0.2 → 0.35` (am Clamp), `maxOffset: 18 → 28`, `radius: 120 → 140`.

**Fix:** Konsistenz über Customer-Seiten hinweg — `PaketeSection` und `Testimonials` hatten
`tilt` auf `false` als Default. Das führte dazu, dass nur Seiten mit explizitem `tilt={true}`
Prop den Effekt zeigten (z.B. Homepage ja, `/pakete` nein — gleicher Block, anderes Verhalten).

- `PaketeSection`: `tilt` Default **`true`** (opt-out via `tilt={false}`).
- `Testimonials`: `tilt` Default **`true`** mit intern milderem `maxTilt={4}, scale={1.02}`
  (textlastig → Lesbarkeit bleibt erhalten).

**Breaking:** Keine — API ist gleich, nur Defaults anders. Customer die Tilt nicht wollen
setzen `tilt={false}` explizit. Customer die v0.6.0 bereits auf `tilt={true}` gesetzt hatten
können den Prop jetzt entfernen (wird Default).

**Upgrade-Check:** Visuell auf `/pakete`, `/` sowie allen Seiten mit Testimonials prüfen.
Falls zu aktiv → in der Customer-Seite `<Testimonials tilt={false} />` setzen.

---

## v0.6.0-alpha (2026-04-18)

**Feature:** Motion Wave 2 — drei neue Hover- und Layout-Primitives

- `motion/MagneticButton` — zieht Slot-Inhalt magnetisch zum Cursor. On-demand
  rAF-Loop (stoppt bei Ruhelage), Rect-Cache + rAF-throttled Invalidierung,
  harter Offset-Cap (default 18 px), `strength` auf ≤0.35 geclamped.
  Capability-Check `(hover: hover) and (pointer: fine)` (iPad+Trackpad /
  Surface+Maus werden unterstützt, Touch-only skippt sauber).
- `motion/TiltCard` — subtiles 3D-Tilt auf Hover. rAF-Lerp während Hover
  (`transition: none`), CSS-Transition nur beim Verlassen (präziser als
  Transition-during-Hover). Defaults absichtlich zurückhaltend:
  `maxTilt: 6`, `scale: 1.01`.
- `blocks/BentoGrid` — asymmetrisches CSS-Grid-Primitive mit
  Column-/Row-Spanning. Link-Kacheln werden als `<a>` gerendert
  (A11y-konform), Daten-Kacheln als `<article>`. Zero Runtime-JS.

**Feature:** `Hero.motion` hat neues Flag `magnetic` — wrappt **nur** den
Primary-CTA in `<MagneticButton>`. Der Secondary-CTA bleibt statisch
(bewusst — zwei magnetische Buttons wirken wie Demo-Seite).
`motion={true}` expandiert jetzt automatisch inkl. `magnetic: true`.

**Feature:** `PaketeSection` + `Testimonials` haben opt-in `tilt?: boolean`
Prop. Default `false`. Empfohlen: `true` bei Pakete (Conversion-Punkt),
aus bei Testimonials (textlastig → Tilt reduziert Lesbarkeit).

**Astro View-Transitions:** MagneticButton + TiltCard registrieren
`astro:before-swap` Cleanup-Listener (cancelAnimationFrame, disconnect
ResizeObserver, removeEventListener) — kein Memory-Leak bei
`<ClientRouter />`-Nutzung.

**Bundle-Impact:** Keine neuen externen Deps. ~3 KB gzipped extra
JavaScript für die drei neuen Primitives.

**Breaking:** Keine. Alle neuen Features sind opt-in.

**Upgrade-Check:** In `package.json` auf `github:siluri/cw-core#release/cw-core/v0.6.0-alpha`
bumpen. Optional: `motion={{ magnetic: true }}` im Hero, `tilt={true}` in
PaketeSection. Testimonials-Tilt bewusst ausgelassen lassen.

---

## v0.5.0-alpha (2026-04-18)

**Feature:** Motion-System — 9 neue Motion-Primitives unter `@cw/core/components/motion/`

- `ScrollReveal`, `StaggerGroup`, `ParallaxImage`, `CountUp`, `TextReveal`
- `AnimatedBlob` (organische Mesh-Gradient-Backgrounds, CSS-only)
- `SmoothScroll` (Lenis-Integration mit GSAP-ScrollTrigger-Bridge)
- `ScrollProgress` (fixer Accent-Fortschrittsbalken)
- `CustomCursor` (Follow-Circle auf Desktop, touch-safe)

**Feature:** `Hero` hat neue opt-in `motion`-Prop (`blob`, `textReveal`, `stagger`, `parallax`)

**Feature:** `LandingPage` hat neue opt-in `motion`-Prop (`smoothScroll`, `progress`, `cursor`)

**Feature:** Motion-Tokens (`--motion-duration-*`, `--motion-ease-*`) + globales
`prefers-reduced-motion: reduce` + Touch-Device-Fallbacks in `tokens-base.css`

**Peer-Dependencies (optional):** `gsap >= 3.12`, `lenis >= 1.1`. Kunden die kein
Motion wollen installieren die Peers nicht und ändern keinen Code — alle bestehenden
Hero/LandingPage-Aufrufe bleiben unverändert funktionieren.

**Breaking:** Keine. Alle Motion-Features sind opt-in über neue Props.

**Upgrade-Check:** Falls du Motion nutzen willst: `pnpm add gsap lenis` in der Kundensite
und setze `motion={true}` auf dem Hero bzw. `motion={{smoothScroll: true, progress: true, cursor: true}}`
auf der LandingPage.

---

## v0.4.6-alpha (2026-04-17)

**Fix:** Audit compliance — Security Headers, A11y, Bilddimensionen

- CSP-Header, HSTS, X-Content-Type-Options
- Aria-Labels, Alt-Texte, Bildgrößen

**Upgrade-Check:** Prüfe ob CSP-Header mit externen Embeds (Cal.eu, etc.) kompatibel sind

---

## v0.4.5-alpha (2026-04-17)

**Feature:** PageHero `backgroundImage` Prop + Leistung-Seiten-Template

- Neue Prop `backgroundImage` für PageHero-Komponente
- Template für individuelle Leistungs-Unterseiten

**Upgrade-Check:** Bestehende PageHero-Nutzungen unverändert (backward compatible)

---

## v0.4.4-alpha (2026-04-17)

**Feature:** generate-og.mjs Batch-Mode + Sharp-Fix

- OG-Image Generator kann jetzt mehrere Seiten auf einmal verarbeiten
- Sharp Resolution Bug behoben

---

## v0.4.3-alpha (2026-04-17)

**Feature:** Script-Exports + Image-Optimierung

- `scripts/*` wird jetzt exportiert
- Neue npm Scripts: `optimize:images`, `generate:og`
- `optimize-images.mjs` für WebP-Konvertierung

**Fix:** Body/Footer/Badge-Farben von `--color-primary` entkoppelt

**Upgrade-Check:** Kunden die eigene Footer-Farben haben: prüfen ob Colors noch stimmen

---

## v0.4.2-alpha (2026-04-17)

**Feature:** SchemaOrg erweitert

- `employees`, `services`, `faqs`, `additionalTypes`, `knowsAbout` als optionale Props
- Alles backward compatible

**Fix:** Hardcoded `#0f3460` Gradient durch `var(--color-primary-dark)` ersetzt

**Upgrade-Check:** Kunden mit dunklem Primary: Gradient kontrollieren

---

## v0.4.1-alpha (2026-04-17)

**Feature:** Neue Block-Komponenten

- `AEOSection` (AI Engine Optimization)
- `ReferenzenGrid`
- Neue Types exportiert

---

## v0.4.0-alpha (2026-04-17)

**Feature:** Große Block-Erweiterung

- `StatsGrid`, `KundenfeedbackSection`, `CalEmbed` Blocks
- `LeistungDetail` Type
- `ProcessSteps` mit `columns` Prop
- Readonly Array Props (TypeScript-Verbesserung)

**Upgrade-Check:** Readonly Arrays — TypeScript-Fehler möglich wenn mutable Arrays übergeben werden

---

## v0.3.8-alpha (2026-04-17)

**Feature:** PageHero mit Gradient-Banner für Unterseiten

---

## v0.3.7-alpha (2026-04-17)

**Feature:** OG-Logo zentriert + Hero responsive srcset (mobile-first)

---

## v0.3.6-alpha (2026-04-17)

**Feature:** "Erstellt von Blitzsicht" Backlink im Footer

**Upgrade-Check:** Kunden sehen jetzt Blitzsicht-Backlink — falls unerwünscht, kommunizieren

---

## v0.3.5-alpha (2026-04-17)

**Feature:** CTA-Button ist jetzt Pflichtfeld im OG-Image Generator

---

## v0.3.4-alpha (2026-04-17)

**Feature:** OG Image Generator (SVG+Sharp, datengetrieben)

---

## v0.3.2-alpha (2026-04-17)

**Feature:** Logo in eigener Zeile (Footer) + größer (Header)

**Upgrade-Check:** Visuell prüfen ob Logo-Größe zum Kunden passt

---

## v0.3.1-alpha (2026-04-17)

**Features:**
- Breadcrumbs mit BreadcrumbList JSON-LD
- OpeningHours, Geo, Multi-City AreaServed, FoundingDate im Schema
- `--font-heading` Token für CI-Branding
- `logoSrcDark` Prop für dunkle Hintergründe
- `LeistungenSection` mit `columns` Prop
- `plausibleEndpoint` Prop für Same-Origin-Proxy

**Fixes:**
- Logo weiß auf dunklem Header/Footer
- `btn-accent` Textfarbe konfigurierbar (WCAG AA)
- `fetchpriority="high"` für LCP Hero-Bild
- "Auf Anfrage" wenn `priceSetup === 0`

**Upgrade-Check:** Viele Änderungen — vollständiger visueller Check empfohlen

---

## v0.3.0-alpha (2026-04-16)

**Features:**
- Customer-Starter Template + `cw init` CLI
- Public API Exports + Usage Docs
- 13 prop-driven Komponenten extrahiert
- Monorepo-Skeleton

**Upgrade-Check:** BREAKING — erste echte Package-Version. Migration von Copy-Paste zu Package nötig.

---

## v0.2.0-alpha (2026-04-16)

**Features:**
- `--font-heading` Token
- `logoSrcDark` Prop
- `LeistungenSection` mit Columns
- `plausibleEndpoint` Prop

**Fixes:**
- Hero fetchpriority
- btn-accent WCAG
- readonly string[] für sameAs

---

## v0.1.0 — Initial (alpha)

- Monorepo-Skeleton, erste Komponenten-Extraktion

---

## v0.1.0-alpha (2026-04-15)

**Initial Release** — Erster @cw/core Package-Extract aus customer-blitzsicht.
