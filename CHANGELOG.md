# Changelog — @cw/core

Alle Versionen von `@cw/core` mit Breaking Changes, neuen Features und Fixes.
Kunden pinnen via `github:blitzsicht/cw-core#release/cw-core/vX.Y.Z` in `package.json`.

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

## v0.143.0 (2026-08-30)

- [kunde] Die beiden Dateien, aus denen ChatGPT, Claude und Perplexity eine Website lesen, tragen jetzt die echten Seitentitel und den vollständigen Text aller Seiten. Vorher stand dort nur eine Kurzbeschreibung der Firma — ein Assistent, der nach einem Seiteninhalt gefragt wurde, fand ihn nicht.

**Die Datei, die Sprachmodelle als Erstes lesen, schrieb eine Norm falsch.**

Gemessen an falzmarke.com am 30.08.2026:

| in `llms.txt` | tatsächlicher `<title>` |
|---|---|
| **Din 5008** | DIN 5008: alle Regeln mit Quellenangabe |
| **Brief Mit Ki** | Briefe mit KI, ohne dass man es merkt |
| Falzmarken | Falzmarken bei 105 und 210 mm — warum dort |
| Briefe | Briefvorlagen |
| Datenschutz | Datenschutzerklärung |

Seiten der **Tiefe 1** bekamen den titelisierten Slug als Label, Seiten ab Tiefe 2 den
echten `<title>`. Die Begründung dafür stand im Code — „ab Tiefe 2 ist der erste Slug
nicht mehr aussagekräftig" — und sie trägt; sie gilt für Tiefe 1 nur genauso. `/din-5008`
ist eine gute URL, gerade weil sie kurz ist. Der Titel trägt die Aussage, der Slug trägt
sie nicht, und die Titelisierung schreibt Eigennamen zusätzlich falsch: eine Norm und
eine Abkürzung, beide daneben, in genau der Datei, die Modelle zuerst lesen.

Jetzt gilt eine Regel für alle Tiefen: `<title>` ohne Marken-Suffix, Rückfall auf die
kuratierte Slug-Map, zuletzt Title-Case. Der Slug ist damit das, was er sein sollte —
eine Notlösung, keine Voreinstellung. Als Nebenwirkung wirken auch die beiden schon
vorhandenen Verfeinerungen (HTML-Entitäten dekodieren, nur `|` und `·` trennen die Marke
ab) endlich auf der ersten Ebene.

**`llms-full.txt` beschrieb die Firma, nicht die Seiten.**

Die Datei trug Unternehmensdaten und FAQ, aber keinen Seiteninhalt: bei falzmarke
2828 Bytes für zwanzig Seiten, von denen einzelne über 1400 Wörter haben. Wer wissen
wollte, was auf `/din-5008` steht, erfuhr es dort nicht — obwohl genau das der Zweck der
Datei ist (llmstxt.org).

Neu: ein Abschnitt „Seiten im Volltext" aus den REAL gebauten `dist/`-Routen. Quelle ist
`<main>`, damit Navigation und Fußzeile draußen bleiben; sonst stünde bei zwanzig Seiten
zwanzigmal dasselbe Menü in der Datei und verdrängte den Inhalt. Überschriften, Listen
und Tabellenzeilen bleiben erhalten — genau die Gliederung lässt einen Assistenten einen
Antwortblock am Stück übernehmen. `noindex`-Seiten und `/404` bleiben draußen.

Zwei Dinge, die beim ersten echten Lauf an falzmarke auffielen und mit Test belegt sind:
HTML-Kommentare gehören entfernt (auf der Startseite stand eine interne Notiz über ein
totes Tracking-Event samt Test-Pfad im Markup), und eine Überschrift mit `<br>` darf
nicht über zwei Zeilen reißen — die zweite wäre sonst keine Überschrift mehr.

**Neue Option `llmsFullMaxBytes`** (Default 524288 = 512 KB, `0` schaltet ab). Bei
falzmarke sind es rund 85 KB für neunzehn Seiten; bei einer Standort- oder
Katalog-Struktur wächst dieselbe Regel unbegrenzt. Greift das Budget, werden die
ausgelassenen URLs **namentlich** genannt — im Build-Log *und* in der Datei selbst. Eine
stille Kappung liest sich wie „alles enthalten" und wäre schlechter als gar kein
Volltext.

**Gegenprobe** — beide Hälften gegen den unveränderten v0.142.0-Stand gefahren:
`resolveImportantPages` liefert dort wörtlich `'Din 5008'` statt
`'DIN 5008: alle Regeln mit Quellenangabe'` und `'Kurse'` statt `"Kurse & Kursplan '26"`;
`extractPageText`, `collectPageTexts` und `generateLlmsFullTxt` sind dort `undefined`.
Der Rückfall-Test bleibt in beiden Fassungen grün und belegt damit, dass der Zweig
erreicht wird. Am echten Build von customer-falzmarke: `llms-full.txt` 2828 → 84.662
Bytes, 19 Seiten, kein Restmarkup, keine rohe Entität, kein Skript-Rest.

**Migrations-Hinweis:** Keiner. `llms-full.txt` wächst beim nächsten Build jeder Site;
wer das nicht will, setzt `llmsFullMaxBytes: 0`.

---

## v0.142.0 (2026-08-29)

**Workflow:** Der Sicht-Guard prüft im Lauf nach, ob er wirklich gegen den gepinnten
cw-core-Stand geurteilt hat.

Kontext: Seit v0.141.0 checkt `templates/.github/workflows/site-checks.yml` seine Specs
mit einem festen Tag aus statt mit dem Branch-Kopf. Gehoben wurde dieser Pin bisher
allein von einer Regel im cw-release-Skill (Schritt 6b). Wird sie übersprungen, prüft
die gesamte Flotte still mit dem Spec der Vorversion — Vorlage und Kundenrepos sind
dann einvernehmlich veraltet, und niemand sieht es.

Der Tag stand außerdem zweimal in der Datei (am checkout-Step und in der Log-Zeile).
Zwei Fundstellen für dieselbe Tatsache heißt: eine veraltet irgendwann still, und dann
meldet das Protokoll einen Tag, gegen den gar nicht geprüft wurde — ein Beleg, der
schlechter ist als keiner.

Neu in der Vorlage:

- `env: CW_CORE_PIN` als **einzige** Fundstelle des Pins; `ref:` und Log-Zeile ziehen
  ihn von dort. cw-release Schritt 6b hebt damit eine Stelle statt zweier.
- **Harte Prüfung:** ist der ausgecheckte cw-core-Commit der, den der Pin meint?
  Sonst `::error::` und Abbruch. Löst die env-Variable nicht auf, nähme
  `actions/checkout` still den Default-Branch `release/cw-core` — genau der bewegliche
  Branch-Kopf, an dem der Guard vorher krankte, und in der Oberfläche nicht von einem
  normalen grünen Lauf zu unterscheiden.
- **Weiche Prüfung:** ist der Pin noch der neueste Tag? Nur `::warning::` — zwischen
  Tag-Push und Rollout liegen Minuten, in denen kein Kunden-PR rot werden darf.
- Ist der Pin weder lokal noch remote auflösbar, wird das als dritter Zustand benannt
  statt als Erfolg gewertet.

Belegt in echtem CI (customer-falzmarke): mit Pin `v0.140.0` wurde `a2a6742`
ausgecheckt, nicht der Branch-Kopf `a99fc8a` — die env-Auflösung im `ref:` trägt. Der
erste Lauf mit `v0.141.0` konnte das nicht zeigen, weil Tag und Branch-Kopf derselbe
Commit sind.

Die flottenweite, harte Fassung derselben Frage steht in customer-websites:
`./scripts/rollout-site-checks.sh --check` (Exit 1 bei Drift, Exit 2 wenn nicht
vollständig geprüft).

**Migrations-Hinweis:** Keiner. Kundenrepos bekommen die Datei über
`rollout-site-checks.sh`, nicht über den `@cw/core`-Import.

---

## v0.141.0 (2026-08-28)

**Der Guard zeigte auf das falsche Element.**

Die Täter-Diagnose der Mobil-Prüfung nahm das erste Element in DOM-Reihenfolge,
dessen rechte Kante über den Viewport ragt. Ob dieses Element den Scroll
überhaupt verursacht, prüfte sie nicht — und ein Element unter einem Vorfahren
mit `overflow: hidden` verursacht ihn nie: es ragt nur geometrisch hinaus,
gezeichnet und gescrollt wird es nicht.

Belegt an `customer-herztoene`, Lauf 33164034921 vom 28.08.2026:

```
Error: /: horizontal scroll (scrollWidth=791 > clientWidth=768)
       Ueberstand verursacht von: div.hero-blob — rechte Kante 844.8px, 76.8px zu weit
```

**23 px echter Überstand, 76,8 px gemeldeter Täter.** Die Zahlen passen nicht
zusammen — wäre der Blob die Ursache, stünde `scrollWidth` bei 845. Er sitzt in
`.hero { overflow: hidden }` und scrollt gar nicht. Die eigentlichen 23 px kamen
von woanders, und die Meldung schickte die Suche in die falsche Datei. Eine
Diagnose, die aufs falsche Element zeigt, ist teurer als keine.

**Jetzt gemessen statt geschlossen:** jeder Kandidat wird kurz auf
`display: none` gesetzt und `scrollWidth` neu gelesen. Was den Scroll
verursacht, verkürzt ihn beim Verschwinden. Gemeldet wird das Element mit der
größten Wirkung, zusammen mit den Pixeln, die es tatsächlich verursacht.

Der Umweg über die Kausalmessung ist Absicht: Clipping-Regeln nachzubauen hieße,
Containing Blocks korrekt zu behandeln — `position`, `transform`, `filter`,
`contain` —, und genau dort verliert eine Heuristik die Sonderfälle. Das
Ausblenden deckt alle ab, ohne eine einzige davon zu kennen.

Zwei Zusätze, die stille Fehlschlüsse verhindern:

- Bleibt nach dem Ausblenden Scroll übrig, steht das in der Meldung
  (`— danach bleiben Npx von anderer Stelle`). Sonst wird nach dem ersten Fix
  Vollzug gemeldet und der Rest fällt beim nächsten Lauf erneut auf.
- Ragen Elemente hinaus, verursacht aber keines Scroll, sagt die Meldung genau
  das — statt eines davon zu beschuldigen. Das ist der herztoene-Fall.
- Geprüft werden höchstens 50 Kandidaten (jeder kostet einen Reflow). Wird
  gekappt, steht die Zahl in der Meldung — eine unerwähnte Obergrenze liest sich
  wie „alles geprüft".

**Gegenprobe** an einer nachgestellten Seite mit exakt den Zahlen des echten
Laufs (`scrollWidth=791`, `clientWidth=768`): die alte Fassung meldet
`div.hero-blob — 76,8px zu weit`, die neue `div.taeter — verursacht 23.0px
Scroll`. Im Fall ohne echten Verursacher meldet die alte weiterhin den Blob, die
neue „keines verursacht Scroll".

Der Guard-Pin in `templates/.github/workflows/site-checks.yml` steht auf
`release/cw-core/v0.141.0`.

## v0.140.0 (2026-08-28)

**Der Guard steht jetzt so fest wie das, was er prüft.**

Der Flotten-Guard checkte seine eigenen Specs mit `ref: release/cw-core` aus —
einem beweglichen Branch-Kopf. Das Kundenrepo pinnt cw-core als Bibliothek
dagegen exakt. Der Prüfling stand fest, der Prüfer nicht.

Am 28.08.2026 fielen drei cw-core-Commits mitten in ein Messfenster: auf
`customer-gympanzen@43ec4d4` standen 7 grüne gegen 3 rote Läufe bei **gleichem
Kunden-Commit**. Sichtbar wurde es an den Zeilennummern im Fehlertext — derselbe
Fehler zeigte einmal `83|84`, einmal `66|67`, weil sich das Spec zwischen den
Läufen geändert hatte.

`templates/.github/workflows/site-checks.yml` pinnt deshalb auf
`release/cw-core/v0.140.0` statt auf den Branch. Ein neuer Schritt
protokolliert den aufgelösten Guard-SHA — ohne ihn war im Nachhinein nicht
feststellbar, gegen welche Fassung ein Lauf geurteilt hat.

Der Pin wird künftig vom `cw-release`-Skill gehoben und über
`customer-websites/scripts/rollout-site-checks.sh` verteilt. Er von Hand zu
pflegen hieße, ihn stillschweigend veralten zu lassen.

**Nicht an den Bibliotheks-Pin gekoppelt** — geprüft und verworfen: `checks/`
existiert erst ab v0.138.0. Bei v0.114.0, v0.110.0 und v0.39.0 antwortet die
API mit 404, fünf Repos hätten also gar keinen Guard-Code.

### Enthält außerdem die bis dahin ungetaggten Guard-Fixes

**#95 — der Guard urteilte bei gleichem Eingang unterschiedlich**

Gemessen wurde bei `domcontentloaded`, während Schriften und Bilder noch liefen.
Ob das Layout beim Messen stand, war ein Rennen. Jetzt `load` + `fonts.ready`:
gemessen wird der Zustand, den ein Besucher sieht, wenn die Seite fertig ist.
Dauerhafte Überstände fängt das unverändert — an `gottl-richter-gomeier`
nachgemessen, wo der Befund bestehen blieb (797 px), weil er nicht vom Laden abhing.

**#96 — der Guard maß Kacheln, die noch gar nicht eingeblendet waren**

`transition-duration: 0s` nahm der Einblendung das Tempo, nicht den Startzustand:
`[data-reveal]` steht auf `opacity: 0; transform: translateY(30px) skewX(-2deg)`,
bis der IntersectionObserver `.is-visible` setzt. Ein `skewX(-2deg)` verbreitert
die Bounding-Box um rund `Höhe × tan(2°)` — bei einer 200 px hohen Kachel etwa
7 px. Genau das war der 7,3-px-Befund an `/club/`: **ein Messartefakt des Guards,
kein Defekt der Kundenseite.** Einblendungen werden jetzt in ihren Endzustand
gezwungen, und die Täter-Meldung gibt `transform` mit aus — ein Skew erklärt
einen Überstand, den die reine Breite nicht hergibt.

**#97 — der Guard läuft nur noch vor dem Merge**

`pull_request` + `workflow_dispatch` statt zusätzlich bei jedem Push. Das
Actions-Kontingent gibt mehr nicht her (August 2026: 5.915 gewichtete von 2.000
Freiminuten).

## v0.139.0 (2026-08-28)

- [kunde:sichtbar] Die Kennzahlen-Kacheln stehen auf dem Handy jetzt untereinander statt zu zweit nebeneinander. Die Zahlen bekommen dadurch die volle Breite und werden nicht mehr abgeschnitten.

**Fix:** eine Kennzahl war breiter als ihre Spalte

`.stats-grid` stellte mit `minmax(140px, 1fr)` bei 390 px Viewport zwei Spalten à
rund 163 px. `.stat-value` hat aber einen festen Untergrenzwert von
`clamp(2.5rem, …)` = 40 px, und der weiß nichts von der Spaltenbreite: „9.000+"
wurde etwa 164 px breit und ragte um **1 px** hinaus.

Gemessen am 28.08.2026 auf dem CI-Runner bei customer-soleno, auf 25 Seiten.
Ein Pixel genügt für echtes seitliches Scrollen — an einer Testseite mit exakt
gesetztem Überstand nachgemessen: ab 0,5 px meldet der Browser `scrollWidth+1`,
und `scrollTo(9999, 0)` verschiebt die Seite tatsächlich (`scrollX = 1`).

Jetzt `minmax(min(180px, 100%), 1fr)`: bei 390 px passen keine zwei Spalten mehr
(2 × 180 + 24 Abstand = 384 > 342 verfügbar), die Kennzahl bekommt die volle
Breite. Die engste Luft steigt damit von 20 px auf 203 px — struktureller
Abstand statt knappem Vermeiden.

Die Schriftgröße blieb bewusst unangetastet. Sie kleiner zu rechnen wäre eine
Breiten-Wette gewesen, die eine breitere Systemschrift auf einer anderen
Plattform erneut verliert.

## v0.138.0 (2026-08-28)

- [kunde:sichtbar] Auf schmalen Bildschirmen liess sich manche Seite seitlich verschieben, weil einzelne Bausteine breiter wurden als das Fenster. Das ist behoben; die Seite endet jetzt dort, wo der Bildschirm endet.

**Fix:** vier Bausteine sprengten den Viewport

Anlass war eine Messung ueber alle 23 Kundenrepos am 28.08.2026: 7 von 22 hatten
horizontalen Ueberstand. Die Befunde fuehrten auf vier Stellen im Kern.

**1. `1fr` ist `minmax(auto, 1fr)`** — und `auto` heisst min-content. Ein langes Wort
zieht die Spur damit ueber ihren Anteil hinaus, und das Raster sprengt seinen eigenen
Container. Dieselbe Falle wie beim Tabellenbruch in v0.133.0, an drei weiteren Stellen:

| Stelle | gemessen |
|---|---|
| `LeistungenSection` | gottl-richter-gomeier @768: Spuren 225,9 + 216,3 + 260,5 px + 48 px Abstand = 750,7 px in einem 720 px breiten Raster. Ursache: „Betriebskostenabrechnungen" |
| `Hero` (zweispaltig und einspaltig) | digital-direkt @390: einzige Spur 373 px statt der verfuegbaren 342 px, scrollWidth 397 |
| `StatsGrid` | soleno @390: „Leistungsbereiche" in Grossbuchstaben mit Sperrung 162 px breit, scrollWidth 393 |

Alle drei bekommen `minmax(0, …)`; wo eine Spur dadurch schmaler werden kann als das
laengste Wort, bricht das Wort jetzt (`overflow-wrap`, bei `StatsGrid` zusaetzlich
`hyphens`).

**2. `PriceTransparency`: `white-space: nowrap` auf einem freien Textfeld.** Gedacht war
es fuer kurze Angaben wie „800 EUR". Bei steller-sanierungen steht dort „800 EUR -
2.500 EUR pro m2 Wohnflaeche" — 305 px breit, auf 12 Ortsseiten, scrollWidth 513 bei
390 px Viewport. Der Kern kennt den Text nicht, den ein Kunde eintraegt, und darf ihn
deshalb nicht am Umbrechen hindern.

**3. Der Header mass die falsche Schrift.** `fit()` entscheidet anhand gemessener
Breiten, ob die volle Navigation passt — laeuft aber synchron vor dem ersten Paint und
misst damit die Ersatzschrift. Ist die echte Schrift breiter, waechst die Navigation
danach, und niemand rechnet nach.

Gemessen an gottl-richter-gomeier @768: nach dem Schriftwechsel ergibt die Rechnung
805 > 720, die Kompaktschaltung MUESSTE greifen — `data-nav` war trotzdem nie gesetzt,
auf allen 22 Seiten, dauerhaft.

Nachgemessen wurde auch, was NICHT reicht: weder `fonts.ready.then(fit)` noch
`loadingdone` bringen den Wert unter 797, denn beide feuern erst nach dem ersten Paint.
Deshalb zusaetzlich `flex-wrap: wrap` auf dem Header-Container: passt die Navigation
nicht, rutscht sie in eine zweite Zeile, statt die Seite aufzuschieben. Passt sie,
aendert die Regel nichts. Die Nachmessung per `loadingdone` bleibt trotzdem drin — sie
schaltet zeitnah auf den Hamburger.

**Nachweis:** gottl-richter-gomeier 22 rote Tests → 44/44 gruen, steller-sanierungen
13 → 134/134, digital-direkt 1 → 78/78, soleno 1 → 146/146. Jeweils gemessen mit
`checks/mobile-audit.spec.ts` ueber die vollstaendige Sitemap, beide Viewports.

## v0.137.0 (2026-08-28)

- [kunde:sichtbar] Der Hinweis auf KI-erzeugte Bilder passt sich jetzt der Bildgröße an — auf Übersichtskacheln war er zuvor viel zu groß geraten, auf großen Bildern zu klein.
- [kunde:sichtbar] Der Schnellhilfe-Knopf ist auf allen Unterseiten wieder gut lesbar. Auf einigen stand die Schrift grün auf rotem Grund.

**Fix:** Das KI-Badge ließ sich von seiner Umgebung aufblasen

Kontext: Nach v0.135.0 füllte die Kennzeichnung auf der Startseiten-Kachel von
elektro-mika.com die ganze Kachel, statt als Badge unten links zu sitzen.
`.leistung-image :global(img) { width:100%; height:100% }` in `LeistungenSection`
trifft **jedes** `img` im Container — auch das Badge-SVG. Mit (0,2,1) schlug die Regel
die einstufige `.ai-label__icon` (0,2,0). Dieselbe Falle steht in `ReferenzenGrid`,
`CaseStudyBlock` und `DankePage`; sichtbar wurde sie nur dort, wo als Erstes ein Label
rendert.

Die Icon-Regel ist deshalb doppelt gestaffelt (`.ai-label .ai-label__icon`, mit den
Scope-Attributen (0,4,0)). Kein `!important` — eine Kundenseite soll bewusst eingreifen
dürfen.

**Tweak:** Das Badge wächst mit der Bildbreite

`clamp(22px, 4.5cqw, 34px)` statt fester 18–22px. `cqw` und nicht `vw`: `vw` misst das
Browserfenster, nicht das Bild, und gäbe einer schmalen Kachel dasselbe große Badge wie
einem Hero. Der Faktor ist an echten Breiten gemessen — Grid-Kachel ~400px
(Untergrenze), Split-Hero ~600px (27px), seitenbreites Bild ~1200px (Obergrenze).

**Fix:** Schnellhilfe-Knopf war auf ContentPage-Seiten grün auf rot

Die Prosa-Link-Regel dort nimmt Buttons per Namensbestandteil aus („btn", „button");
`FloatingCallButton` heißt `floating-call` und trug keinen davon. Ergebnis rund 1,5:1 —
und ausgerechnet die Farbkombination, die eine Rot-Grün-Schwäche zuerst verschluckt.
`floating` und `sticky` sind jetzt ebenfalls ausgenommen. Derselbe Vorfall wie am
07.08.2026 bei Zink, nur eine Komponente weiter.

Nachweis: 704 Tests, `astro check` 0 Fehler, stylelint sauber. `examples` 21 von 22
Seiten strukturell unverändert, kein CSS-Selektor verschwunden. Die Beispielseite
`ai-label-in-komponenten` deckt jetzt alle neun Komponenten **mit** gesetzter Prop ab —
genau das fehlte, weshalb der Fehler durchrutschte. Gegenprobe gefahren: mit
zurückgekürzter Regel reproduziert sie den Live-Fehler.

**Migrations-Hinweis:** Keiner. Wer `groesse` an `AiLabelAmBild` fest setzt, behält
seinen Wert.

---

## v0.136.0 (2026-08-28)

- [kunde:sichtbar] Die Schrift auf dem Haupt-Knopf wird nachgerechnet: liegt sie zu blass auf der Markenfarbe, bricht der Build ab, statt einen unlesbaren Knopf auszuliefern.

**Fix:** eine falsche Zusicherung im Kern

Über dem `text-shadow` von `.btn-accent` stand seit Langem:

> `/* Subtle shadow ensures WCAG AA contrast even on lighter accent backgrounds */`

Das ist ein Irrtum. Ein Schatten geht in kein Kontrastverhältnis ein — weder bei axe noch
nach WCAG 2.x. Die Zeile hat eine Prüfung vorgetäuscht, die nie stattfand, und darunter
setzte `.btn-accent` `color: var(--color-accent-btn-text, white)`: wer den Token nicht
definiert, bekommt weiße Schrift auf seiner Markenfarbe.

Gemessen am 28.08.2026 gegen die echten `tokens.css` der Live-Flotte fiel der Haupt-CTA
bei **drei von zwölf** Kunden durch — soleno 1,65:1, digital-direkt 3,57:1,
hausammincio 4,12:1.

**Guard:** `button-contrast-check`

Rechnet beim Build den Kontrast der Knopfschrift gegen `--color-accent` und bricht ab,
wenn er unter 4,5:1 liegt — mit dem gemessenen Wert und dem Hinweis, dass die Markenfarbe
dafür nicht weichen muss. Der Kern kann die Farbe nicht wählen; welche Schrift auf eine
Marke passt, entscheidet der Kunde. Er kann sich aber weigern, einen unlesbaren Knopf
auszuliefern.

Ist ein Wert nicht rechenbar (`color-mix`, `rgb()`, ein exotischer Farbname), schweigt der
Guard, statt eine Zahl zu erfinden. 12 Tests, alle mit echten Kundenfarben; drei Sabotagen
machen 2, 4 bzw. 1 davon rot.

## v0.135.0 (2026-08-28)

- [kunde:sichtbar] Bilder, die mit KI erzeugt wurden, tragen den gesetzlich vorgeschriebenen Hinweis jetzt auch auf der Startseite — bisher erschien er nur auf einzelnen Unterseiten.

**Feature:** Neun Komponenten setzen die KI-Kennzeichnung selbst

Kontext: Die Einheit der Pflicht aus Art. 50 Abs. 4 UAbs. 1 AI Act ist die
**Fundstelle**, nicht das Bild. Bei mika-elektrotechnik stand `installation.webp` auf
der Leistungsseite (dort gekennzeichnet) und als Kachel auf der Startseite (dort
nicht) — dasselbe KI-Bild einmal offengelegt und einmal nicht. Von außen war das nicht
zu beheben: die Komponenten rendern ihr `<Image>` im eigenen Markup, dort ist nichts zu
platzieren.

Alle neun bildrendernden Komponenten bekommen eine optionale `bildHerkunft`-Prop:
`Hero`, `LeistungenSection`, `KarriereHero`, `DankePage` (über `astro:assets`) sowie
`TeamGrid`, `ReferenzenGrid`, `CaseStudyBlock`, `AuthorBox`, `VideoEmbed` (public-URL-
Strings).

```astro
<Hero image={heroImage} bildHerkunft={siteData.bildHerkunft} ... />
```

Neu:

- `utils/bildlabel.js` — löst Deklaration und Badge-Farbe an einer Stelle auf.
  `publicFsPath` findet auch Bilder aus `public/`, die kein `fsPath` tragen; ohne diesen
  Weg fiele die Farbmessung bei fünf der neun Komponenten still auf Schwarz zurück.
- `blocks/AiLabelAmBild.astro` — hält die über die Flotte gemessene Position (unten
  links) an einer Stelle statt neunmal. Die Positionierung steht inline, nicht in einem
  `<style>`-Block: Astro bündelt das CSS einer importierten Komponente auch auf Seiten,
  wo sie nie rendert.
- `tests/utils/bildlabel.test.js` — 7 Tests; der Modul hatte vorher keinen einzigen.

Nachweis: `examples/`, 21 Seiten, gleiche Basis — **0 strukturelle Abweichungen** ohne
gesetzte Prop, kein Element und kein Leerzeichen. Gegenprobe gegen einen Baum mit einem
eingefügten `<span>`: erkannt. An einem echten Kundenrepo 1 → 3 Fundstellen, und zwar
genau die beiden Bilder mit `deepfake: 'ja'`.

Kosten, beziffert: das `AiLabel`-Stylesheet (~1,28 KB inline) liegt auf jeder Seite, die
eine der neun Komponenten nutzt — auch ohne Kennzeichnung.

**Migrations-Hinweis:** Keiner. Ohne `bildHerkunft`-Prop ist der gerenderte Ausgang
unverändert. Wer die Kennzeichnung will, reicht `siteData.bildHerkunft` an die
Komponente durch, die das Bild rendert.

---

## v0.134.0 (2026-08-27)

- [kunde:sichtbar] Gedämpfte Textfarben und die Kopfzeile der Vergleichstabelle sind jetzt auch für Menschen mit schwacher Sehkraft lesbar — sie erfüllen den Kontrast-Mindestwert der Barrierefreiheits-Norm.
- [kunde:sichtbar] Seitlich scrollbare Kästen — nicht nur Tabellen, auch Diagramme — lassen sich mit der Tastatur bedienen.

**Anlass.** Der geschärfte Mobil-Guard zog am 27.08.2026 `a11y-audit` mit über alle
46 Seiten statt über sieben. Ergebnis: 45 vorbestehende Verstöße auf Seiten, die die
alte Liste nie ansah. Keine Regression — sie lagen nur hinter dem blinden Fleck. Die
Kontrast-Befunde hatten drei Ursachen, nicht 25.

**Fix:** die Markenfarbe als Schrift und unter Schrift

Weiße Schrift auf der Markenfarbe erreichte im Kopf der Markenspalte **2,89:1**, AA
verlangt 4,5:1. Dieselbe Farbe als Textfarbe (`.cell-win`) ebenso. Die Markenfarbe
selbst bleibt — sie kommt aus dem Logo. Geändert wird, was darauf und was daraus
geschrieben wird, über die Tokens, die es dafür schon gibt:
`--color-accent-btn-text` für Schrift **auf** der Fläche, `--color-accent-text` für
Schrift **in** der Farbe. Gerechnet für alle vier Repos, die `VergleichsTabelle`
benutzen: blitzsicht 2,89 → 5,59 · digital-direkt 3,57 → 4,52 · falzmarke 2,78 → 6,03.
`mazterplan` setzt `--color-accent-btn-text` selbst auf Weiß und bleibt damit bei 3,56 —
die eigene Wahl wird respektiert, das Repo ist nicht live.

Ein pauschales Abdunkeln der Fläche per `color-mix` war der naheliegende Griff und ist
verworfen: bei platzfreis Neon-Cyan `#04FFF7` reicht selbst −35 % nicht (3,01) und
zerstört die Marke.

**Feature:** `.scroll-region` — `.tabelle-scroll` für alles, was nicht Tabelle ist

axe meldete zwei Diagramm-Kästen auf `/forschung` als `scrollable-region-focusable`:
dieselbe Barriere wie bei Tabellen, nur ohne Tabelle darin. `.scroll-region` ist die
allgemeine Fassung derselben Utility, und `ergaenzeWrapperTabindex` erkennt sie beim
Build genauso. `.tabelle-scroll` bleibt gültig — es ist der Sonderfall mit sprechendem
Namen. 20 Tests; nimmt man `scroll-region` aus der Liste, wird einer davon rot.

**Guard:** Anker-Integrität — kaputte Links im ausgelieferten HTML

Auf `/agb/sla` stand der Schluss-Absatz der Seite **innerhalb** eines Telefon-Links,
dazu zwei leere Anker. Im Quelltext war nichts davon zu sehen; die Anker-Bilanz der
Datei war ausgeglichen. Minimal reproduziert: steht ein `<a>` als letzter Knoten der
letzten Tabellenzelle, macht der Astro-Compiler ihn nach `</table>` wieder auf und
schluckt alles Folgende. Vier Umgehungen sind sauber — Text dahinter, eine
`<span>`-Hülle, ein Punkt, oder der Link in einer anderen Zelle. Es hängt an der
Position, nicht am Inhalt.

Gefunden hat es axe (`link-name`), nicht der Blick in die Datei. `anchor-integrity-check`
meldet beides beim Build: Anker direkt hinter `</table>`, und Anker ohne Text, Bild oder
`aria-label`. Hart per Default. 8 Tests; drei Sabotagen machen 3, 2 bzw. 1 davon rot.

**Fix:** `--color-muted` in der Kunden-Vorlage

`#6b7280` (gray-500) besteht nur auf reinem Weiß (4,83:1) und fällt auf **jedem**
getönten Grund durch — gemessen zwischen 4,06 und 4,49:1 auf acht verschiedenen
Flächen. `tokens.template.css` seedet jetzt `#4B5563` (gray-600, 6,36:1 im
schlechtesten Fall), damit der nächste Neukunde nicht mit demselben Fehler startet.
Bestehende Kunden bringt das nicht mit — die definieren den Token selbst.

## v0.133.0 (2026-08-27)

- [kunde:sichtbar] Breite Tabellen lassen sich auf dem Handy jetzt seitlich schieben. Vorher wurden die rechten Spalten abgeschnitten und waren gar nicht erreichbar.
- [kunde:sichtbar] Lange zusammengesetzte Wörter in Überschriften brechen um, statt über den Bildschirmrand hinauszulaufen.

**Fix:** Tabellen sprengten schmale Viewports — und waren dabei nicht einmal scrollbar

Gemessen auf blitzsicht.com bei 360 px, sieben Seiten mit horizontalem Überstand, und in
JEDEM Fall war das breiteste Element eine `<table>`: `/agb/sla` +206 px,
`/agb/onboarding` +155, `/blog/website-kosten-handwerker` +154,
`/blog/agentic-browsing-ki-agenten` +126, `/blog/wordpress-vs-blitzsicht` +124,
`/datenschutz` +54, `/blog/website-in-7-werktagen` +43. Verschärfend: die Seite setzt
`html,body{overflow-x:hidden}` — die Tabellen ließen sich also nicht wegschieben,
sondern waren schlicht **abgeschnitten**, die rechten Spalten unerreichbar.

`tokens-base.css` macht Tabellen jetzt zu ihrem eigenen Scroll-Container. Die Regel
steht in `:where()` und hat damit Spezifität 0 — eine Kundenregel gewinnt jederzeit.
`role="presentation"` ist ausgenommen: Layout-Tabellen aus Mail-Templates dürfen
niemals scrollen. Für Wrapper, die eine Tabelle selbst einfassen, gibt es die Utility
`.tabelle-scroll`; `InformationspflichtBlock.astro` benutzt sie jetzt, `VergleichsTabelle`
und `ResponsiveTable` sind über ihre eigenen Wrapper-Klassen ausgenommen.

Gegenprobe über alle 46 Seiten des Builds: vorher 8 Brüche bei 360 px und 7 bei 390 px,
nachher **0** — zweimal gemessen. Bei 768 px und 1280 px ändert sich keine Tabellenbreite;
die verbliebenen Abweichungen von 3–8 px sind Messrauschen, nachgewiesen dadurch, dass
derselbe Build zweimal gemessen dieselben Abweichungen zeigt.

Kein Rehype-Plugin: das erreicht die Markdown-Tabelle, aber nicht die handgeschriebene
in `.astro`, und bräuchte eine neue Abhängigkeit plus einen Eingriff in jede
`astro.config.mjs`. Die CSS-Regel erwischt beide Formen ohne Zutun des Kunden.

**Fix:** Lange deutsche Komposita in Überschriften

`/software` scrollte um 7 px, und kein einziges Element ragte heraus — der Überstand
steckte im Inhalt der `<h1>`: „Softwareentwicklung", 19 Zeichen ohne Trennstelle, passte
nicht in die 264 px breite Textbox. Der Messwert schwankte zwischen +7 und +27 px, je
nachdem ob die Webfont beim Messen schon geladen war. `overflow-wrap: break-word` auf
`h1`–`h6` schließt das: `/software` 7 → 0 px, während die H1-Höhe auf `/`, `/forschung`
und `/pakete` auf die Pixel gleich bleibt — die Eigenschaft greift nur, wenn ein
einzelnes Wort seine Zeile sonst überliefe. Bewusst nicht `hyphens: auto`: das trennt
auch Wörter, die passen, und würde flottenweit den Umbruch mehrzeiliger Überschriften
verändern.

**Und der Fehler, den der erste Entwurf eingebaut hätte:** Tastaturfalle

Eine Tabelle zum Scroll-Container zu machen, macht sie zu einem scrollbaren Bereich —
und ein scrollbarer Bereich ohne Tastaturzugang ist selbst ein WCAG-Verstoß. axe meldet
ihn als `scrollable-region-focusable`. Gemessen an sieben Seiten bei 390 px:

| Stand | Verstöße |
|---|---:|
| vorher | 2 |
| nur die CSS-Regel | 13 |
| CSS-Regel + `tabindex` | **0** |

Der Build gibt deshalb jeder Inhaltstabelle `tabindex="0"` (`table-focusable.js`,
17 Tests) — und ebenso jedem `.tabelle-scroll`-Wrapper, der noch keinen hat. Der zweite
Teil kam erst durch den CI-Lauf dazu: `.tdddg-table-wrap`, `.preistabelle-wrapper` und
`.upgrade-comparison-wrap` trugen die Klasse, scrollten und hatten keinen Fokus. Die
Tabelle darin bleibt bewusst `display: table` und ist selbst nicht scrollbar — ihr
`tabindex` hätte also nichts genützt, der Fokus gehört an den Wrapper. Attribut statt Wrapper: ein zusätzliches `<div>` würde jeden Kundenselektor
der Form `.legal-content > table` still brechen. `role` bleibt unangetastet — eine
Tabelle muss eine Tabelle bleiben, sonst verlieren Screenreader die Zeilen- und
Spaltenbezüge. Tabellen, die schon in einem Wrapper mit Fokus sitzen, bekommen keinen
zweiten Tab-Halt. Der Ausgangszustand wird damit nicht nur gehalten, sondern verbessert.

**Guard:** Tabellen-Scroll-Guard in ai-discovery

Neu, zero-config, hart per Default (`strictTableScroll`): liefert eine Seite eine
Tabelle aus, ohne dass im ausgelieferten CSS eine Scroll-Regel steht, bricht der Build.
Gegen das echte `dist/` des Zustands von vorher meldet er 19 Seiten, gegen den Kandidaten
0. Er beweist, dass der Schutz **mitgeliefert** wird — ob eine konkrete Tabelle im
Browser passt, misst `mobile-audit.spec.ts` in cw-visual-tests. 10 Tests, gegen die
sabotierte Fassung 4 davon rot.

## v0.132.0 (2026-08-27)

- [kunde:sichtbar] Jede Seite bekommt beim Teilen in WhatsApp, LinkedIn oder Facebook ein eigenes Vorschaubild statt für die ganze Website dasselbe — mit dem Bild und der Überschrift der jeweiligen Seite.
- [kunde:sichtbar] Beim Teilen steht jetzt der Firmenname über der Vorschau statt nur die Internetadresse.

Diese Version fasst drei Änderungen zusammen, die am 27.08.2026 nacheinander
gemergt wurden — #75 (Vorschaubild je Seite), #77 (og:site_name), #76 (FAQ-Symbol).

**Fix:** `og:site_name` fehlte flottenweit — bei jedem Kunden

Der Open-Graph-Debugger meldete auf blitzsicht.com/forschung genau einen roten Punkt in
einer sonst vollständigen Auszeichnung. Gegenprobe bei `baeckereizink.de`,
`donau-profi.de` und `platzfrei.club`: überall dasselbe. `siteName` lag in
`BaseLayout.astro` längst als Prop vor und wird für `titleTemplate` und Schema.org
genutzt — der og-Tag wurde nur nie ausgegeben. Facebook und LinkedIn zeigen ihn als
Quelle über der Überschrift; ohne ihn steht dort die nackte Domain. Konditional
gesetzt, damit Kunden ohne `siteName` keinen leeren Tag bekommen.

**Feature:** `showQuestionIcon` für den FAQ-Block

Setzt links vor jede Frage ein dezentes Fragezeichen. Bewusst EIN gleiches Symbol für
alle Einträge statt eines Feldes je Frage: ein `icon` pro Item müsste bei jeder neuen
Frage mitgepflegt werden und wäre beim ersten Vergessen halb leer. Default `false`,
damit sich bestehende Kundenseiten durch ein Update nicht ungefragt ändern.

**Nachtrag zum Vorschaubild-Feature (Selbstreview vor dem Merge):**
Der erste Entwurf baute die Bild-URL aus dem bisherigen `og:image`, indem er `/og/…`
abschnitt und den neuen Pfad anhängte. Das ergibt nur dann eine gültige URL, wenn das
alte Bild zufällig unter `/og/` lag — bei einem Kunden mit anderem Ablageort wären
flottenweit 404-Vorschaubilder entstanden, also schlechter als der Ausgangszustand.
Die Basis kommt jetzt aus `og:url`, dem Canonical der Seite. Drei Regressionstests
halten das fest. Zweiter Fund derselben Durchsicht: Der Perf-Budget-Guard läuft VOR
`og-pages` und sieht dessen Bilder nie — `maxBytes` war damit eine Absichtserklärung
ohne Nachweis; `og-pages` zählt jetzt selbst und meldet Überschreitungen.

**Fix + Feature:** ein eigenes og:image pro Seite — und drei Gründe, warum es vorher keines gab

Auslöser: Auf blitzsicht.com trugen alle Unterseiten `/og/default.png` — /forschung,
/software, /referenzen, /pakete, /kontakt, /ueber-uns. Nur die Startseite hatte ein
eigenes. Flottenweit dasselbe Bild: 12 von 13 Live-Kunden haben genau **ein** OG-Bild
für ihre gesamte Website.

Bei der Ursachensuche kamen drei Fehler zum Vorschein, von denen jeder für sich das
System lahmgelegt hätte. Alle drei waren still.

**1. `satori` war eine optionale peerDependency — und kein Kunde hatte sie.**
`render-og-home.mjs` scheiterte deshalb bei jedem Build, fiel fail-open zurück und
liess die committete `home.png` stehen: datiert auf den **09.07.2026**, sieben Wochen
alt. Das OG-System hat flottenweit nie gerendert. Sichtbar war das als eine Warnzeile
im Build-Log. `satori` ist jetzt eine echte `dependency` von cw-core.

**2. Im `astro:build:done` ist Vites Module-Runner geschlossen.** Jeder dynamische
Import scheitert dort — auch über eine `file://`-URL. Der `catch` in `engine.mjs` fing
das ab und meldete `'satori' fehlt`, obwohl das Paket installiert war. Diese falsche
Fährte hat die Diagnose mehrfach in die Irre geführt. `engine.mjs` lädt satori und
sharp jetzt über `createRequire` an Vite vorbei, und der echte Fehlertext bleibt
stehen statt durch eine Vermutung ersetzt zu werden.

**3. satori dekodiert weder WebP noch AVIF.** Ein solches Foto rendert lautlos als
nichts; man sieht nur den Verlauf des Templates und hält es für ein zu helles Motiv.
Gemessen mit demselben Bild: als WebP übergeben ergab das OG **8 KB** (leer), nach
Umwandlung in JPEG **241 KB** (Foto drin). Die Fleet liefert ihre Hero-Bilder
durchgängig als WebP — ohne diese Umwandlung wäre die ganze Automatik ein
Verlaufsgenerator gewesen. `og-pages` wandelt WebP/AVIF jetzt vor dem Rendern um.

**Was die Integration tut.** Nach dem Build liest sie aus jeder fertigen Seite Titel,
Beschreibung und Hero-Foto und rendert daraus ein eigenes Vorschaubild:

| Seite | Vorlage |
|---|---|
| mit Hero-Foto | `hero` — genau dieses Foto, Titel, gekappte Beschreibung |
| ohne | `cta` — Logo, Titel, Domain |

Aus dem gebauten HTML statt über Props: so ist jede Seite erfasst, unabhängig von
Layout und Blöcken, und die nächste neue Seite wird nicht vergessen.

Abschaltbar über `ogPerPage: false`; `strictOgPerPage: true` lässt den Build scheitern,
wenn keine einzige Seite gerendert werden konnte.

**Kosten:** 4,3 s bei 49 Seiten (hero mit Foto 853 ms inkl. Fontladen, cta warm 81 ms).
Die Bilder werden mit `maxBytes: 200 * 1024` gerendert — der Perf-Budget-Guard der
Fleet läuft VOR dieser Stelle und hätte sie sonst nie geprüft.

**Sichtbarkeit statt stillem Rückfall.** Rendert keine einzige Seite, steht das als
Warnung im Log statt als Schweigen; teilen sich Seiten vorher dasselbe Bild, wird das
mit Zahl und Pfad benannt. Genau diese Meldung hätte den Ausfall vom 09.07. am selben
Tag sichtbar gemacht.

**Nebenbefund:** Der Lauf über blitzsicht meldete `/faq` — die Seite verweist auf
`/images/hero/faq.webp`, das es nicht gibt (live HTTP 404). Das ist ein Fehler auf der
Seite, kein Fehler der Integration; sie hat ihn nur sichtbar gemacht.

Der Test-Glob deckt jetzt auch `src/integrations/**/*.test.mjs` ab — die neuen Tests
wären sonst nie gelaufen (622 → 635).

---

## v0.131.0 (2026-08-27)

- [kunde:sichtbar] Die Menüzeile oben bricht nicht mehr um: lange Menüpunkte bleiben in einer Zeile, der Firmenname überlagert sie nicht mehr, und wenn das Menü für die Bildschirmbreite zu lang wird, klappt es automatisch zum Menü-Symbol zusammen.

**Fix:** Header — Navigation brach um und überlagerte das Logo

Auslöser: Auf blitzsicht.com brachen fünf von neun Navigationspunkten mitten im Wort um
(„So funktioniert's" → „So" / „funktioniert's"), und der Markenname ragte 17 px in den
ersten Punkt hinein. Nicht auf schmalen Fenstern — auf **allen** Desktop-Breiten bis
2400 px.

Ursache: `.container` ist auf `--container-max` (72 rem = 1152 px) gedeckelt. Innerhalb
davon brauchten Logo und neun Punkte bei 1920 px 1251 px von 1104 px verfügbaren.
Erschwerend wächst `gap: clamp(0.75rem, 1.5vw, 1.75rem)` mit der Fensterbreite, der
Container aber nicht — breitere Fenster machten es also schlimmer. Flexbox löst den
Platzmangel, indem sie jedes Item bis auf sein längstes Wort staucht und die Logo-Box
unter ihren eigenen Inhalt drückt.

Drei Änderungen in `components/layout/Header.astro`:

- `.logo { flex-shrink: 0 }` — die Marke wird nie mehr mitgestaucht, damit kann ihr
  Text nicht mehr in die Navigation laufen.
- `#main-nav a { white-space: nowrap }` — ein Label ist eine Einheit und bricht nicht
  mehr an einem Leerzeichen um.
- Fit-Messung statt geratener Pixelgrenze: ein Inline-Skript rechnet vor dem ersten
  Paint nach, ob Logo plus Navigation samt 2 rem Mindestluft in den Container passen,
  und setzt sonst `data-nav="compact"` (Hamburger). Läuft erneut bei `resize` und bei
  `astro:page-load`. Die feste 1099-px-Grenze bleibt als `<noscript>`-Fallback erhalten,
  das Verhalten ohne JavaScript ist damit unverändert.

Warum gemessen statt konfiguriert: eine feste Grenze weiß nichts über die Länge der
Navigation eines Kunden. Genau deshalb blieb der Bruch monatelang unbemerkt — die
Navigation war gewachsen, die Zahl nicht. Eine Prop, die jemand pflegen müsste, wäre
denselben Weg gegangen.

Regressionsprobe an allen Live-Kunden: kein anderer wechselt in den Kompakt-Modus, der
knappste (`baeckereizink.de`, 8 Punkte) behält 252 px Reserve.

Fleet-Guard dazu: `customer-websites/scripts/check-header-fit.mjs` misst Umbruch und
Logo-Überlauf im echten Browser. Gegenprobe belegt — Exit 1 gegen den kaputten Stand,
Exit 0 gegen den gefixten.

---

## v0.130.1 (2026-08-25)

**Fix:** `utils/labelfarbe` war ausgeliefert, aber nicht exportiert

Kontext: v0.130.0 brachte `src/utils/labelfarbe.js` mit — die Datei lag im Tarball, der
Import brach trotzdem: `Rollup failed to resolve import "@cw/core/utils/labelfarbe"`. Der
Sammel-Eintrag `./utils/*` zeigt auf `./src/utils/*.ts` und trifft JavaScript nicht; deshalb
haben `bildherkunft` und `copyright` eigene Einträge. `labelfarbe` fehlte dieser Eintrag.

Auffallen konnte das erst im Kundenrepo: cw-core importiert intern über relative Pfade, und
`examples/` bindet die Bibliothek als `link:..` ein, wo die exports-Map großzügiger greift.
Ein Release ohne Consumer-Build zeigt den Fehler nicht.

- `./utils/labelfarbe` mit `types` + `default` ergänzt, dazu `src/utils/labelfarbe.d.ts`
- `./utils/image-format` ergänzt — Nachbefund: die Datei nennt sich im Kopfkommentar
  `@cw/core/utils/image-format`, war aber seit ihrer Einführung nie exportiert. Bisher
  folgenlos, weil sie nur intern über relative Pfade benutzt wird.
- Neuer Wächter `tests/exports-map.test.js`: jede `.js` in `src/utils/` muss über die
  exports-Map auflösbar sein. Gegen den Zustand vor dem Fix gefahren — er meldet dort beide
  Lücken.

**Migrations-Hinweis:** Keiner. Wer v0.130.0 gepinnt hat und `utils/labelfarbe` importiert,
muss auf v0.130.1 gehen.

---

## v0.130.0 (2026-08-25)

- [kunde:sichtbar] Bilder, die mit KI erzeugt wurden, tragen jetzt das offizielle EU-Kennzeichen — ein kleines Symbol in der unteren linken Ecke des Bildes. Es erscheint nur dort, wo die Kennzeichnung rechtlich verlangt ist, und passt seine Farbe automatisch an das jeweilige Motiv an.

**Feature:** Das KI-Label wird sichtbar — deckende EU-Symbole, Farbe nach Motiv

Kontext: Die Deklaration je Bild stand seit v0.128.0, die Komponente `AiLabel` war gebaut —
aber flottenweit nirgends verwendet. Art. 50 Abs. 4 UAbs. 1 AI Act verlangt die Offenlegung
gegenüber dem Menschen; die Metadaten allein erfüllen das nicht (Abs. 2 bindet den Anbieter,
nicht den Betreiber). Beim ersten Einbau zeigte sich, dass die verwendete Symboldatei die
falsche war: die Kommission liefert jede Kennzeichnung zweifach, und die transparente Fassung
lässt den Untergrund zu 50 % durchscheinen.

Neu in `AiLabel.astro`:

- `ausfuehrung` — `deckend` (neuer Standard) nutzt die volldeckende EU-Datei, die ihren
  Kontrast selbst mitbringt: 21:1 bei Schwarz, 16,88:1 bei Weiß, bildunabhängig.
  `transparent` bleibt für Umgebungen mit eigenem Untergrund.
- `beschriftung` — `sichtbar` (Standard), `nur-vorlesbar` (visuell verborgen, im DOM) oder
  `im-alt` (kein Textelement mehr, die Aussage sitzt als `alt` am Symbol).
- `groesse` — Symbolhöhe als CSS-Länge statt fest an der Textzeile.

Neu: `utils/labelfarbe.js` mit `labelFarbeFuerBild(pfad, { ueberlagerung })`. Misst zur
Bauzeit die Helligkeit dort, wo das Badge sitzt, und wählt Schwarz oder Weiß. Gemessen über
die 35 kennzeichnungspflichtigen Bilder der Flotte gewinnt Weiß bei 25, Schwarz bei 10 — eine
feste Farbe wäre bei der Mehrheit die schlechtere. `ueberlagerung` rechnet einen dunklen
Hero-Verlauf ein, der zwischen Bild und Label liegt; ohne ihn würde das nackte Bild gemessen,
also nicht das, worauf das Badge tatsächlich sitzt. Nicht bestimmbar → Schwarz, ohne Abbruch.

Position: unten links, fest. Unten rechts ist die ruhigste Ecke, aber dort sitzen
`StickyContact` und die Floating-Buttons. Fest statt je Motiv, weil die Kommission
„deutlich wahrnehmbar und unterscheidbar" verlangt — eine wandernde Kennzeichnung ist nicht
auffindbar. Begründung samt Messwerten im Kopfkommentar der Komponente.

Werkzeug: `bildherkunft-übernehmen.mjs` kennt `--nur <slug>` und `--repo <pfad>`, um in einen
Worktree statt in den Haupt-Checkout zu schreiben — nötig, wenn dort eine andere Sitzung
arbeitet. `--repo` ohne `--nur` wird abgelehnt, statt still auf alle Sites zu wirken.

**Migrations-Hinweis:** Bestehende `AiLabel`-Aufrufe ohne `ausfuehrung` nutzen jetzt die
deckende Fassung und sehen dadurch anders aus als vorher. Das ist die kontrastsichere
Voreinstellung; wer die alte Darstellung braucht, setzt `ausfuehrung="transparent"`.
`labelFarbeFuerBild` braucht `sharp` im Consumer-Projekt — fehlt es, liefert die Funktion
Schwarz statt zu werfen.

---

## v0.129.0 (2026-08-24)

- [kunde] Auch Bilder im modernen AVIF-Format tragen jetzt die maschinenlesbare Herkunftsangabe. Vorher blieben sie als Einzige ohne — auf manchen Seiten war das die Mehrheit der Bilder.

**Feature:** AVIF wird getaggt — der Ausschluss war überholt

`TAGGABLE_EXT` schloss AVIF aus, mit der Begründung, exiftool könne damit nichts anfangen
(blitzsicht-ops#660). Das stimmte einmal und stimmt nicht mehr: **exiftool 13.50 schreibt
XMP in AVIF.** An einer echten Datei gemessen — Tag gesetzt, zurückgelesen, Datei danach
weiterhin gültiges AVIF.

Aufgefallen ist es beim Rollout von v0.128.0: Bei `gympanzen` sind **19 der 32** als
KI deklarierten Bilder AVIF und blieben deshalb ohne `DigitalSourceType`. Kein
Rechtsverstoß — die maschinenlesbare Markierung schuldet nach Art. 50 Abs. 2 der Anbieter,
nicht der Betreiber — aber eine Lücke ohne Grund, und AVIF wird mehr statt weniger.

`BUDGET_EXT` ist dadurch mit `TAGGABLE_EXT` deckungsgleich geworden und wurde entdoppelt.
Beide bleiben getrennt benannt: sie beantworten verschiedene Fragen („was kann exiftool
taggen" vs. „was zählt fürs Größen-Budget") und können wieder auseinanderlaufen.

Sollte exiftool das je wieder verlernen, ist es sichtbar und nicht still: `geotag.js` fängt
jeden fehlgeschlagenen Schreibversuch, zählt ihn und schreibt eine Warnung ins Build-Log.

**Migrations-Hinweis:** Keiner. Wirkt beim nächsten Build.

---

## v0.128.0 (2026-08-24)

- [kunde] KI-erzeugte Bilder auf der Website tragen ab dem nächsten Build eine maschinenlesbare Herkunftsangabe in den Bilddaten. Grundlage für die Kennzeichnung nach dem EU-KI-Gesetz, die seit dem 2. August 2026 gilt.

**Feature:** Bild-Herkunft deklarieren und kennzeichnen — Art. 50 AI Act

Art. 50 Abs. 4 UAbs. 1 der KI-Verordnung (EU) 2024/1689 verlangt vom **Betreiber** eine
Offenlegung, wenn er KI-erzeugte Bild-, Ton- oder Videoinhalte veröffentlicht, die ein
**Deepfake** sind. Die Norm gilt seit dem 02.08.2026 — Art. 113 nimmt Kapitel IV in keiner
seiner Ausnahmen aus. Verstöße: bis 15 Mio EUR oder 3 % des weltweiten Jahresumsatzes,
für KMU der jeweils niedrigere Betrag (Art. 99 Abs. 4 lit. g, Abs. 6).

Rechtstext im Spiegel: `cw-recht` → `texte/eu/ai-act/ai-act.md`, Abschnitt „## Artikel 50".
Bewertung: `cw-legal` → `04-betroffenheit/D1-art50-ki-kennzeichnung.md`.
**Keine amtliche Fassung, keine Rechtsberatung.**

Neue APIs:

- `@cw/core/utils/bildherkunft` — `resolveBildHerkunft`, `istKennzeichnungspflichtig`,
  `pruefeBildHerkunftRegeln`. Deklaration über `siteData.bildHerkunft` nach dem Vorbild von
  `imageRights`: `pathPrefix` für Bilder aus `public/`, `stem` für Bilder aus
  `src/assets/` (die Astro-Assetpipeline hängt einen Content-Hash an, ein Pfad-Präfix
  träfe sie nie).
- `components/blocks/AiLabel.astro` — die Offenlegung am Bild. Rendert **immer auch Text**,
  das EU-Symbol ist `aria-hidden`: Abs. 5 verlangt Barrierefreiheit, ein Piktogramm allein
  erfüllt sie nicht. Sichtbar ohne JavaScript und nicht hinter Hover — Abs. 5 verlangt die
  Information „spätestens zum Zeitpunkt der ersten Interaktion".
- `src/assets/ai-labels/` — die zwölf EU-Kennzeichnungssymbole der Kommission.
  Verwendung fakultativ und ohne Attributionspflicht; die Pflicht aus Art. 50 dagegen nicht.
- `withDigitalSourceType` (`ai-discovery/geotag-core.js`) — schreibt
  `XMP-iptcExt:DigitalSourceType` je Bild, eingehängt neben `withImageRights` im
  Post-Build-Hook.
- `scripts/bild-einbauen.mjs` — legt ein neues Bild ab und deklariert es im selben Zug.
- `scripts/bildherkunft-arbeitsliste.mjs` / `-übernehmen.mjs` — Kontaktbogen für den
  Bestandsdurchgang und Übernahme in die Repos.

Zwei Festlegungen, die aus der Norm folgen und nicht aus dem Geschmack:

**Herkunft und Deepfake-Einordnung stehen getrennt.** Die Legaldefinition (Art. 3 Nr. 60)
verlangt zwei Merkmale **kumulativ**: der Inhalt ähnelt wirklichen Personen, Gegenständen,
Orten, Einrichtungen oder Ereignissen — **und** würde fälschlicherweise als echt
erscheinen. Ein einzelnes Feld „istKI" hätte beides vermengt: dann wäre entweder jedes
KI-Bild gekennzeichnet (falsch, und es entwertet das Label dort, wo es Pflicht ist) oder die
Einordnung verschwände in einem Kopf statt im Repo. Die `begründung` ist Pflicht, sobald
die Einordnung entschieden ist — gerade beim „Nein", denn darauf beruht der Verzicht.

**Ohne passende Regel ist das Ergebnis `ungeklaert` mit Befund, nie ein stiller Fallback auf
„menschliches Foto".** Sonst meldete der Guard jedes undeklarierte Bild grün und verdeckte
die Pflicht dauerhaft. `problem === null` heißt damit wirklich „nichts zu tun".

Warum deklariert und nicht erkannt: Gemessen am 24.08.2026 trägt **kein einziges** Bild der
Live-Flotte einen KI-Herkunftsmarker (0 von 54 Stichproben) — `astro:assets` (sharp) strippt
EXIF beim Transform. Ein Detektor über den Altbestand würde raten und dabei grün melden.
Beim **Einbau** dagegen ist der Marker noch da; genau dort setzt `bild-einbauen.mjs` an.

**Migrations-Hinweis:** Keiner. Ohne `siteData.bildHerkunft` ändert sich nichts —
fleet-neutral wie `imageRights`. Ein Repo mit Deklaration braucht zwei Zeilen in
`site-data.ts`: `import { bildHerkunft } from './bild-herkunft';` und `bildHerkunft,` im
Objekt. Das Label selbst wird noch nicht automatisch platziert; das ist der nächste Schritt.

---

## v0.127.2 (2026-08-24)

**Fix:** Auch die Prop-Defaults zeigen auf die kanonische Adressform — Nachtrag zu v0.127.1

v0.127.1 hat die internen Links in den Rechtstext-Blöcken gezogen, aber nur die im Markup
(`<a href="…">`). Vier **Prop-Defaults** blieben dabei übersehen und erzeugten in jedem
Repo, das den Prop nicht selbst setzt, weiterhin eine 308-Weiterleitung:

| Datei | Default |
|---|---|
| `ImpressumBlock.astro` | `contactFormPath = '/kontakt'` |
| `CTABlock.astro` | `primaryHref = '/kontakt'` |
| `Header.astro` | `karriereHref = '/karriere'` |
| `Footer.astro` | `karriereHref = '/karriere'` |

Der `ImpressumBlock` zeigt den Pfad zusätzlich als **Linktext** an — dort steht jetzt
sichtbar „/kontakt/". Das ist gewollt: die angezeigte Adresse ist die, die auch aufgerufen
wird.

Gefunden, weil nach v0.127.1 in customer-zink-baeckerei genau **ein** nicht-kanonischer
Link übrig blieb. Die Lehre für den nächsten Sweep dieser Art: Prop-Defaults gehören in die
Suche, nicht nur das Markup.

**Migrations-Hinweis:** Keiner. Repos, die diese Props selbst setzen, sind nicht betroffen.

---

## v0.127.1 (2026-08-24)

**Fix:** Interne Links in den Rechtstext-Bloecken zeigen auf die kanonische Adressform

`DatenschutzBlock` und `InformationspflichtBlock` verlinkten intern auf `/impressum`,
`/datenschutz` und `/agb` — ohne abschließenden Schrägstrich. Wo ein Repo die Slash-Form
als kanonisch führt (`canonical` und Sitemap tun das standardmäßig), lief damit jeder
dieser Klicks über eine 308-Weiterleitung, und Google folgte beim Crawlen einem Umweg
statt dem Ziel.

Aufgefallen in customer-zink-baeckerei: Dort zeigten **22 von 22** internen Links auf die
Nicht-Slash-Form. Nach dem Nachziehen im Kundenrepo blieben genau zwei übrig — beide aus
diesen Blöcken.

Zehn Links in zwei Dateien. Doku-Kommentare in denselben Dateien blieben unangetastet.

**Migrations-Hinweis:** Keiner. Repos ohne Slash-Konvention sind nicht betroffen, dort
lösen beide Formen auf dieselbe Seite auf.

---

## v0.127.0 (2026-08-24)

**Fix:** E-Mail-Signatur nannte bei GmbH-Kunden die Firma als Geschäftsführer

Aufgefallen beim Erzeugen der Signaturen für customer-zink-baeckerei: im
Compliance-Block stand `GmbH · GF: Zink GmbH Bäckerei und Konditorei` — die Firma
als ihr eigener Geschäftsführer. Nachgemessen über alle Customer-Repos: **alle acht
GmbH-Kunden** betroffen (digital-direkt, donau-profi, itk-regensburg,
mika-elektrotechnik, schiller-gartenbau, soleno, weinkontor-sinzing,
zink-baeckerei). Bei allen acht war `legal.representatives` gepflegt und wurde nur
nicht gelesen.

Ursache: `generate.sh` nutzte `REPRESENTATIVES` ausschließlich im GbR-Zweig; der
Zweig für GmbH/AG/UG/GmbH & Co. KG griff auf `GF_NAME` zurück, und das ist
`legal.owner` — bei einer GmbH der Firmenname. Der GmbH-Zweig hat jetzt dieselbe
Reihenfolge wie der GbR-Zweig: Vertretungsberechtigte zuerst, `owner` nur als
Fallback. § 35a HGB verlangt die Geschäftsführer namentlich.

**Zweiter Fund derselben Runde:** `read-customer-data.py` las die Registerangaben
nur in der deutschen Schreibweise (`registerNummer`, `registergericht`). Repos mit
der englischen SSOT-Form (`registerNumber`, `registerCourt`) — zink-baeckerei und
mika-elektrotechnik — lieferten deshalb **gar keine Handelsregister-Zeile**, ebenfalls
eine Pflichtangabe. Beide Schreibweisen werden jetzt gelesen, `ImpressumBlock` kann
das seit jeher.

Dabei kam ein dritter Unterschied heraus, der ohne Prüfung eine Dopplung erzeugt
hätte: `registerNummer` (deutsch) enthält nur die Ziffern (`11164`),
`registerNumber` (englisch) das Präfix gleich mit (`HRB 2749`). Ohne Abfangen stand
dort `HRB HRB 2749`. Gegengeprüft über beide Konventionen: zink `HRB 2749`, mika
`HRB 21336`, donau-profi `HRB 11755`, weinkontor `HRA 5928, Amtsgericht Regensburg`.

**Migrations-Hinweis:** Keiner für den Build — die Änderung betrifft nur den
Signatur-Generator. Aber: **wer die Signaturen eines GmbH-Kunden neu erzeugt, ändert
damit den Compliance-Block.** Sechs der acht Kunden haben ihre Signatur bereits
installiert; ein Neuversand ist eine Kundenentscheidung, kein Nebeneffekt eines
Bumps. Für customer-zink-baeckerei am 24.08.2026 bewusst neu erzeugt (die Signatur
war dort noch nie ausgeliefert).

---

## v0.126.0 (2026-08-24)

**Fix:** `astro check` in den Customer-Repos wieder fehlerfrei — Typlücken an drei Stellen

Der Bump auf v0.125.0 hinterließ in customer-zink-baeckerei fünf `astro check`-Fehler,
zwei davon aus cw-core. Gemessen mit einer Gegenprobe gegen den v0.125.0-Tag in
derselben Umgebung: dieselben Fehler, gleiche Zeilen — sie kamen mit dem Release, nicht
aus dem Kundencode. `pnpm build` blieb dabei grün, `astro check` läuft in keinem Gate;
deshalb ist es beim Release nicht aufgefallen.

Drei Ursachen, alle rein deklarativ — kein Verhalten und keine Ausgabe ändert sich:

- **`src/utils/copyright.js` hatte keine Typen** (ts7016). Die Datei bleibt bewusst reines
  `.js`, weil sie sowohl per `node:test` geprüft als auch vom plain-node-CLI-Twin
  importiert wird. Neu daneben: `src/utils/copyright.d.ts`, plus eine `types`-Condition
  im `exports`-Mapping.
- **`ImpressumBlock.astro`: `representatives?: string[]`** (ts2322). Kundendaten stehen in
  `site-data.ts` unter `as const`, sind also `readonly` — der mutable Typ war die Lücke.
  Jetzt `readonly string[]`. `ai-discovery/index.ts` hatte das bereits richtig.
- **`copyrightHolder?: string`** in `SchemaOrg.astro` und `BaseLayout.astro` (ts2322).
  `resolveCopyrightHolder()` liefert laut eigener JSDoc `string | null`, und die
  Prop-Dokumentation empfiehlt ausdrücklich, genau diese Funktion zu übergeben. Der Body
  verarbeitet `null` seit jeher korrekt (`copyrightHolder || name`) — nur die Deklaration
  schloss es aus. Das war unsichtbar, solange `copyright.js` als `any` ankam: **der erste
  Fix legt diesen dritten frei.** Ohne ihn hätte dieses Release in den betroffenen Repos
  sechs neue Fehler erzeugt statt zwei alte zu beheben.

**Nachtrag 24.08.2026 — Reichweite nachgemessen, erste Fassung war zu weit gefasst.**
Hier stand „in jedem Customer-Repo". Das stimmt nicht: die beiden Lücken schlagen nur
zu, wo die betroffenen Stellen überhaupt benutzt werden. Gezählt über alle 21 Repos mit
cw-core-Pin: **11 importieren `utils/copyright`, 11 setzen `legal.representatives`.**
Gegenprobe an customer-platzfrei, dem einzigen anderen Repo auf v0.125.0: **0 Fehler** —
es tut beides nicht. Für die übrigen zehn gilt die Aussage; für den Rest der Flotte war
v0.125.0 unauffällig.

Belegt in customer-zink-baeckerei: 5 Fehler → 2 nach den kundenseitigen Fixes → **0** mit
diesem Release. Gegenprobe mit ungepatchtem v0.125.0-Tarball in derselben Umgebung: 2.
552 Tests grün, Build 30 Seiten, `copyrightNotice` im JSON-LD unverändert.

**Migrations-Hinweis:** Keiner. Reine Typerweiterungen, kein Prop entfällt oder wechselt
die Bedeutung. Repos, die heute `astro check`-sauber sind, bleiben es.

---

## v0.125.0 (2026-08-19)

**Fix:** Impressum verweist nicht mehr auf die eingestellte EU-Streitbeilegungsplattform

- [kunde:sichtbar] Im Impressum stand ein Verweis auf eine Schlichtungsplattform der EU, die
  es seit Juli 2025 nicht mehr gibt. Der Verweis ist durch einen Hinweis auf die Abschaltung
  ersetzt; die gesetzlich vorgeschriebene Erklärung zur Verbraucherschlichtung bleibt
  unverändert stehen.

blitzsicht-ops#702. Der Zweig `osPlatformDisclaimer` verlinkte
`https://ec.europa.eu/consumers/odr/`. Die Plattform wurde am **20.07.2025** durch
VO (EU) 2024/3228 eingestellt.

**Kein toter Link, und genau deshalb fiel er nicht auf.** Die URL liefert weiterhin HTTP 200
und leitet auf `consumer-redress.ec.europa.eu/site-relocation_en` mit dem Satz *„The Online
dispute resolution (ODR) platform is now closed"* — direkt nachgeprüft am 19.08.2026, nicht
aus einem Werkzeug übernommen. Ein Link-Checker meldet hier nichts; hinfällig ist die
Rechtsangabe, nicht die Erreichbarkeit.

Gemessen über die Flotte: **11 von 14 Impressen** trugen den Verweis. Die drei ohne sind
zugleich die Gegenprobe, dass das Suchmuster unterscheiden kann.

**Der zweite Satz bleibt — das ist der eigentliche Punkt.** Der Zweig trägt ZWEI Aussagen,
und nur eine ist hinfällig: Die Erklärung nach § 36 VSBG („Wir sind nicht bereit oder
verpflichtet…") ist von der Abschaltung unberührt. Sie beim Entfernen des Links mitzulöschen
ist der naheliegende Fehler, weil der Prop-Name nahelegt, hier ginge es nur um die
OS-Plattform. `tests/blocks/impressum-os-plattform.test.js` hält beide Hälften fest.

**Der Prop heisst weiter `osPlatformDisclaimer`,** obwohl der Name jetzt schief ist: Sechs
Repos setzen ihn. Umbenannt fielen sie still auf den Default zurück und blendeten die
VSBG-Klausel wieder ein — ein Rename wäre hier kein Aufräumen, sondern eine stille
Verhaltensänderung auf sechs Live-Seiten.

**Wortlaut nicht neu erfunden:** `customer-hausamlago` führt ihn seit dem 25.05.2026
(Kommentar dort: „osPlatformDisclaimer=false (ODR-Link eingestellt 2025-07)"),
`customer-schiller-gartenbau` ebenso. Die Entscheidung war getroffen und nur nie flottenweit
nachgezogen.

**Gegenproben gefahren:**
- alten Zustand wiederhergestellt → 2 Tests rot (Link-Test und Kommentar-Test)
- VSBG-Satz mitgelöscht → der VSBG-Test rot
- Das Suchmuster prüft `<a href>`, nicht die Zeichenkette: Die URL steht bewusst im
  Erklär-Kommentar der Komponente. Ein Substring-Zähler wäre dort immer rot — genau der
  Fehler aus blitzsicht-ops#659, hier bewusst vermieden.

**Migrations-Hinweis:** Keiner. Repos, die `osPlatformDisclaimer={false}` setzen, sind
unverändert — sie zeigen den Abschnitt weiterhin gar nicht und tragen ihre Fassung im
`slot="extra"`.

---

## v0.124.0 (2026-08-19)

**Feature:** `verify-touchpoints` meldet eager geladene Drittanbieter-Skripte — `eagerScriptChecks`

- [kunde] Ein neuer Prüfschritt beim Bauen erkennt Skripte, die beim Seitenaufruf sofort
  von einem fremden Anbieter geladen werden, obwohl sie erst bei Bedarf gebraucht werden.
  Das hält Ladezeit und Fremdkontakte klein.

blitzsicht-ops#659 meldete zwei Live-Seiten mit einem eigenen
`<script src="https://challenges.cloudflare.com/turnstile/v0/api.js">` — gegen den
Performance-Standard, denn cw-core lädt Turnstile seit dem Speed-Rollout 09.07.2026 lazy.
Eine der beiden war ein Fehlalarm, und daran hängt der eigentliche Punkt dieses Releases.

**Warum der bisherige Weg das nicht messen konnte.** Gemessen wurde mit
`grep -c 'turnstile/v0/api.js'` über das ausgelieferte HTML. Der Lazy-Loader trägt dieselbe
URL als Zeichenkette in seinem Skriptkörper (`s.src = 'https://challenges…'`). Der Zähler
trifft sie dort genauso und meldet für die **behobene** Seite eine 1. platzfrei.club war nie
eager und stand trotzdem in der Befundtabelle; die Acceptance Criteria des Issues forderten
damit einen Zustand, den nur das Entfernen des Lazy-Loaders hergestellt hätte. Ein Zähler,
der den behobenen vom kaputten Zustand nicht unterscheiden kann, ist keine Messung.

`extractEagerThirdPartyScripts(html, origin)` liest ausschließlich Tag-Attribute, nie den
Inhalt eines Skripts, und kann die beiden Fälle deshalb trennen. `async`/`defer` gelten
nicht als Entschuldigung: sie steuern, wann ausgeführt wird, nicht ob geladen wird.

**Default `fail`, und zwar belegt statt geraten.** Vormessung am 19.08.2026 über alle
13 Live-Seiten: 191 `<script>`-Tags insgesamt, davon **0** mit fremdem `src`. Die Flotte
steht bereits auf null; blosses Warnen liesse sie zurückdriften — dieselbe Begründung wie
beim Link-Check in v0.109.0 und beim Asset-Check in v0.112.0.

**Drei Zustände, nicht zwei.** Der Zählwert der angesehenen `<script>`-Tags steht immer im
Log, auch bei Befunden — sonst wäre „0 gefunden" von „gar nicht gelaufen" nicht zu
unterscheiden. Fehlt `<link rel="canonical">`, ist eine absolute Same-Site-URL nicht von
einer fremden zu trennen; solche Fälle werden sichtbar als ungeprüft gezählt statt still
als sauber durchgewunken.

**Gegenproben gefahren**, weil grüne Tests allein nichts belegen:
- Implementierung liest Skriptinhalt statt Attribute → der Lazy-Loader-Test wird rot
  („behobene Seite als Befund gemeldet")
- Fremd-Origin-Erkennung entfernt → der gympanzen-Test wird rot
- Default auf `off` gesetzt → beide E2E-Tests der Verdrahtung werden rot

**Migrations-Hinweis:** Repos, die bewusst ein Drittanbieter-Skript eager laden, setzen
`eagerScriptChecks: 'warn'` oder `'off'` in der Touchpoint-Config. Heute betrifft das kein
einziges Live-Repo.

---

## v0.123.1 (2026-08-19)

**Fix:** llms.txt — HTML-Entitaeten im Titel-Label zurueck in Text wandeln

Direkt nach v0.123.0 im ersten echten Lauf aufgefallen: Der Eintrag lautete
`Kurse &amp; Kursplan – Victory Gym Neutraubling`. Das Label kommt ab Tiefe 2
aus dem `<title>`, und dort ist der Text korrekt HTML-escaped — llms.txt ist
aber eine Textdatei, keine Auszeichnungssprache. Betroffen waren nur die in
v0.123.0 neu hinzugekommenen Labels; Top-Level-Labels stammen aus Slugs und
hatten das Problem nie.

Dekodiert werden `&amp;`, `&lt;`, `&gt;`, `&quot;`, `&apos;`, `&#39;`/`&#x27;`
und `&nbsp;` — die Entitaeten, die in einem Seitentitel real vorkommen.

**Migrations-Hinweis:** Keiner.

---

## v0.123.0 (2026-08-19)

**Feature:** `aiDiscovery`-Option `importantPageDepth` — llms.txt kann Seiten unterhalb der ersten Pfadebene aufnehmen

Kontext: Die „Wichtige Seiten"-Liste in llms.txt kam bisher ausschliesslich aus
Top-Level-Routen. Dahinter steckt die Annahme, dass Detailseiten Leistungen sind
und damit ohnehin unter „Was wir anbieten" auftauchen. Fuer die meisten
Kundenseiten stimmt das. Fuer Sites mit Standort- oder Katalogstruktur stimmt es
nicht — dort liegt der gesamte inhaltliche Wert unterhalb der ersten Ebene.

Belegt an platzfrei.club (19.08.2026): llms.txt und llms-full.txt nannten weder
das Studio noch eine einzige Kursart. Die vier Landingpages, fuer die die Site
gebaut wurde, kamen mit null Treffern gar nicht vor; aufgefuehrt waren
Datenschutz und Impressum. Eine Datei, deren Zweck es ist, KI-Agenten zu sagen
worum es auf der Site geht, beschrieb damit eine Site, die es so nicht gibt.

Neue Option:

- `importantPageDepth?: number` — Default `1` (nur Top-Level, Verhalten
  unveraendert). Hoehere Werte nehmen tiefere Routen auf.
- Ab Tiefe 2 wird als Label der `<title>` der Seite genommen statt des ersten
  Slugs: `/studios/x/` und `/studios/x/kurse/y/` hiessen sonst beide „Studios".
  Das Marken-Suffix faellt weg (getrennt wird nur an `|` und `·` — Gedanken-
  striche gehoeren zum Titel und werden nicht angeschnitten).
- Seiten bleiben aus REAL gebauten dist-Dateien abgeleitet, es entstehen also
  weiterhin keine toten Links. Der noindex-Ausschluss gilt auch in der Tiefe.

Tests: 3 neue Faelle in `tests/ai-discovery/llms-txt.test.js` (Default-Tiefe
bleibt unveraendert, Tiefe nimmt auf und labelt aus dem Titel, noindex greift
auch verschachtelt). Volle Suite 534/534 gruen. Gegenprobe gefahren: mit der
alten Bedingung fallen die beiden neuen Verhaltens-Tests.

**Migrations-Hinweis:** Keiner. Ohne gesetzte Option ist das Verhalten
identisch zu v0.122.0 — der Default entspricht exakt der bisherigen Bedingung.

---

## v0.122.0 (2026-08-18)

**Fix:** `verify-form-health.mjs` — fehlendes Turnstile-Widget failt jetzt, statt gruen
durchzulaufen.

Kontext: Der Check behandelte ein fehlendes Widget als gueltigen Zustand — er gab eine
ℹ️-Zeile aus, zaehlte einen Check weniger (5/5 statt 6/6) und endete mit Exit 0. Damit
konnte er genau bei den Customern nie rot werden, bei denen der Bot-Schutz fehlte.

Messung am 18.08.2026: elektro-mika.com und donau-profi.de renderten 0x `cf-turnstile`
und hatten weder `TURNSTILE_SECRET_KEY` noch `PUBLIC_TURNSTILE_SITE_KEY` in der
Vercel-Env. Beide bekamen Fake-Leads ueber das Kontaktformular. Beide Laeufe: Exit 0.
Ein Check, der beim Defekt nicht rot wird, ist kein Nachweis.

Neu: Formular gerendert + kein `data-sitekey` im HTML → **Exit 1**.

Dritter, feiner Opt-out ergaenzt — die drei sind gestaffelt, nicht konkurrierend:

| Opt-out | Wirkung | Ort |
| --- | --- | --- |
| `SKIP_FORM_HEALTH=true` | ganzer Check aus | Repository-Variable |
| `contactForm: false` | ganzer Check aus | `site-data.ts` |
| `turnstile: false` | **nur** der Turnstile-Check aus | `site-data.ts` |

Bewusst keine Env-Variable fuer den neuen Opt-out: eine fehlende Env-Var soll nie wieder
wie eine bewusste Entscheidung aussehen.

Gegenprobe aus echten Laeufen — vorher (v0.121.2) / nachher:

```
elektro-mika.com     5/5 Exit 0  →  5/6 Exit 1
donau-profi.de       5/5 Exit 0  →  5/6 Exit 1
soleno-energie.com   6/6 Exit 0  →  6/6 Exit 0
```

Tests: 3 neue Faelle (Widget vorhanden / fehlt / Opt-out) gegen einen lokalen
HTTP-Server. Dieselbe Testdatei gegen v0.121.2 ergibt 7 pass / 2 fail — genau die beiden
neuen Verhaltenstests fallen um.

**Migrations-Hinweis:** Customer ohne Turnstile, die bewusst keinen Bot-Schutz wollen,
tragen `turnstile: false` in `src/data/site-data.ts` ein. Alle anderen setzen
`PUBLIC_TURNSTILE_SITE_KEY` + `TURNSTILE_SECRET_KEY` in der Vercel-Env und deployen neu.

---

## v0.121.2 (2026-08-17)

**Fix:** Der `visual`-Slot sprengte das Hero-Layout, sobald sein Inhalt breiter
war als die Spalte. Der Wrapper ist ein Grid-Item, und Grid-Items haben per
Default `min-width: auto` — sie lassen sich von unteilbarem Inhalt aufdruecken.
Weil der Track dadurch breiter wird, wachsen **alle** Items der Spalte mit, auch
der Text daneben.

Gemessen auf platzfrei.club bei 390 px: `.hero-content` sprang von 342 auf
389 px und ragte 23 px ueber den Viewport; die Schlagzeile wurde rechts
abgeschnitten. Gegen `origin/main` gemessen, wo derselbe Hero 342 px breit ist.

Behoben mit `min-width: 0; max-width: 100%` am Wrapper.

**Warum v0.121.0 und .1 das nicht gefangen haben:** Der Slot-Inhalt der
Beispielseite war schmal genug, um in die Spalte zu passen. Die Seite enthaelt
jetzt bewusst breiten Inhalt (eine lange, nicht umbrechbare Zeile), und die
Pruefung schlaegt ohne den Fix an.

---

## v0.121.1 (2026-08-17)

**Fix:** `visualSwap` blendete das Hero-Bild nicht aus, sobald `motion.parallax`
gesetzt war. Dann rendert `ParallaxImage` den Wrapper, und er traegt dessen
Scope-Kennung statt der von `Hero` — die gescopte Regel griff an ihm nicht.

Gemessen auf platzfrei.club: Das Foto blieb im Layout und schob den visual-Slot
um 486 px nach unten, also genau aus dem ersten Bildschirm heraus, den der Slot
gewinnen sollte (Demo bei 1195 px statt unter 844 px).

Behoben mit `:global(.hero-image-wrap)` — dieselbe Loesung, die eine Zeile
weiter unten bei `.hero--collage` schon steht.

**Warum v0.121.0 das nicht gefangen hat:** Die Beispielseite `/hero-visual-slot`
setzt kein `motion`, also rendert dort `Hero` den Wrapper selbst und die Kennung
passt. Der Fall mit Parallax war ungeprueft. Die Seite deckt ihn jetzt ab.

---

## v0.121.0 (2026-08-17)

**Neu:** `Hero.astro` bekommt einen benannten Slot `visual` und die Prop
`visualSwap`. Damit kann interaktiver Inhalt an die Stelle des Hero-Bildes
treten — eine Demo, ein Rechner —, ohne dass ohne JavaScript eine leere Flaeche
neben der Schlagzeile steht.

Bewusst **ohne** `[kunde]`-Zeile: Wer den Slot nicht befuellt, sieht keinen
Unterschied. `hatVisual` prueft `Astro.slots.has('visual')`, und `visualSwap`
wirkt nur zusammen damit.

### Warum ueberhaupt

Auf platzfrei.club lagen nach drei Runden Arbeit 26 Motion-Elemente und eine
spielbare Buchung auf der Seite — alle unterhalb des ersten Bildschirms.
Gemessen bei 390 px: Der Hero ist 1143 px hoch bei 844 px Schirm, die Demo
beginnt bei 2138 px. Im Hero selbst greift auf einem Telefon **kein** Effekt
(TextReveal erst ab 901 px, MagneticButton braucht einen Zeiger, Parallax nur
beim Scrollen, der Blob laeuft in 18–26-s-Zyklen). Der Operator sagte dazu
zutreffend: „hat sich nicht wirklich was veraendert, zumindest nicht auf den
ersten Blick."

Ein Hero, der etwas Interaktives aufnehmen kann, loest das an der Wurzel.

### Der Tausch haengt an `scripting`, nicht an einer Klasse

```css
.hero--visual-swap .hero-visual-wrap { display: none; }
@media (scripting: enabled) {
  .hero--visual-swap .hero-visual-wrap { display: block; }
  .hero--visual-swap .hero-image-wrap { display: none; }
}
```

Ein per Skript gesetzter Umschalter waere ein sichtbarer Sprung — erst Foto,
dann Demo. So passiert der Wechsel im ersten Frame.

Das Bild bleibt dabei im Markup und verliert nur seine Ladeprioritaet
(`loading="lazy"`, `fetchpriority="auto"` statt `eager`/`high`). Ohne diese
Absenkung laedt der Browser ein grosses Foto mit hoher Prioritaet, das
anschliessend versteckt wird — das Schlechteste aus beiden Welten.

`hero--split` greift jetzt auch, wenn NUR ein Visual da ist und gar kein Bild.

### Gegenprobe

| Zustand | Ergebnis |
|---|---|
| mit JS | Slot sichtbar, Foto ausgeblendet |
| ohne JS | Foto sichtbar, Slot-Container weg |
| beide Faelle | **genau eines** von beiden sichtbar — nie eine leere Flaeche |
| Tausch-Regel entfernt | **rot** (2 Pruefungen) |

Examples: `/hero-visual-slot` zeigt es, inklusive Anleitung zum Nachstellen
ohne JavaScript.

528/528 Tests, lint:css sauber, astro check unveraendert bei 2 vorbestehenden
Fehlern, 20 Beispielseiten bauen, 6/6 Browser-Checks.

---

## v0.120.0 (2026-08-17)

- [kunde:sichtbar] Hochzählende Zahlen zeigen jetzt auch dann den richtigen Wert, wenn im Browser kein JavaScript läuft.

**Fix:** `CountUp` liess ohne JavaScript den **Startwert** stehen. Der Zaehler haengt
dann auf `from` und behauptet damit etwas anderes als gemeint.

Gemessen, nicht vermutet — die einzige Kundenseite, die `CountUp` heute nutzt, ist
betroffen: `customer-blitzsicht/src/components/StatsBar.astro` zeigt den
PageSpeed-Score mit `countFrom: 90, countTo: 95`. Ohne JavaScript stand dort **90+
statt 95+**, also eine zu niedrige Angabe ueber die eigene Leistung. Auf
platzfrei.club haette dieselbe Luecke „0 Sekunden" statt „10 Sekunden" ergeben.

### Wie es behoben ist

Der Endwert steht ohnehin im Markup — als `sr-only`-Span fuer Screenreader. Faellt
das Skript aus, wird der laufende Zaehler ausgeblendet und dieses Span sichtbar
gemacht:

```css
@media not (scripting: enabled) {
  [data-motion-countup-vis] { display: none; }
  .motion-countup .sr-only { position: static; /* … */ }
}
```

Der sichtbare Teil liegt dafuer neu in einem eigenen Wrapper
`[data-motion-countup-vis]`. Ohne ihn liessen sich `prefix` und `suffix` nicht
mit ausblenden und stuenden doppelt da. Die Runtime findet
`[data-motion-countup-num]` weiterhin, sie sucht in die Tiefe.

`not (scripting: enabled)` statt `(scripting: none)`, damit auch `initial-only`
getroffen wird — Umgebungen, in denen Skripte nur beim Laden laufen.

### Gegenprobe

| Zustand | Ergebnis |
|---|---|
| mit JS | Zaehler sichtbar (`display: inline`), sr-only weggeklippt, Endwert 127 |
| ohne JS | Zaehler `display: none`, sr-only `position: static`, sichtbar „127+" |
| Fix wieder entfernt | **rot** — Zaehler `display: inline` mit sichtbarer „0" |

Die erste Fassung der Pruefung war untauglich und wurde ersetzt: sie las den
sichtbaren Text zusammen und uebersah, dass `.sr-only` sich per `clip` versteckt,
nicht per `display`. Sie las den Endwert also aus dem Screenreader-Span mit und
waere auch ohne den Fix gruen geblieben. Geprueft wird jetzt, was tatsaechlich
umschaltet.

528/528 Tests, lint:css sauber, 19 Beispielseiten bauen.

---

## v0.119.0 (2026-08-17)

- [kunde:sichtbar] Die Fragen im FAQ klappen jetzt weich auf, statt schlagartig zu erscheinen.

**Drei Bausteine, die BESTEHENDE Komponenten anfassen** — anders als v0.118.0, das rein
additiv war. Deshalb der `[kunde:sichtbar]`-Marker und der erweiterte Canary-Check.

### FAQ-Hoehenuebergang (`FAQHonest`)

Bisher wechselte nur das Zeichen von `+` auf `x`, waehrend die Antwort im selben Frame
erschien. Das liest sich wie ein Neuaufbau der Seite, nicht wie eine Antwort auf den
Klick — man verliert kurz, wo man war.

`<details>` laesst sich nicht direkt animieren. Erst `::details-content` zusammen mit
`interpolate-size: allow-keywords` macht den Weg von `0` nach `auto` interpolierbar.
Beides steht hinter `@supports`: wo es fehlt, klappt das Element auf wie bisher — kein
Bruch, nur kein Uebergang. `interpolate-size` steht auf `.fh-item` statt auf `:root`,
weil es global gesetzt JEDE `height: auto`-Transition der Seite veraendern wuerde, auch
in Komponenten, die davon nichts wissen.

Gemessen: geschlossen 59 px, nach 90 ms 135 px, offen 149 px — es waechst also ueber
Zeit. Unter `prefers-reduced-motion` steht es nach 60 ms bereits auf 149 px, das
Aufklappen bleibt also, nur die Zeit faellt weg.

### `.motion-lift` — Karten-Reaktion

Eine Karte, die auf Annaeherung reagiert, sagt "ich bin anfassbar". Nur hinter
`@media (hover: hover) and (pointer: fine)`: auf einem Telefon vergibt der Browser den
Hover-Zustand beim Antippen und behaelt ihn, bis woanders getippt wird — die Karte
bliebe angehoben stehen, ohne dass jemand darauf zeigt.

`translateY` statt `scale`, weil eine skalierende Karte ihren Text um Subpixel
verschiebt und ihn flimmern laesst. Opt-in, an keiner Seite aendert sich etwas von
selbst.

### `motion`-Prop fuer `ContentPage`

Bis hierher kannte nur `LandingPage` die Prop. Auf einer Startseite gab es also einen
Fortschrittsbalken, auf jeder Unterseite desselben Kunden nicht — dieselbe Website
verhielt sich je nach Layout anders, ohne dass das jemand entschieden hatte.

`ContentPage` importiert `MotionLayerConfig` per `import type` aus `LandingPage`, statt
einen zweiten Typ mit gleichem Inhalt zu deklarieren: Zwillinge laufen auseinander, und
dann heisst dieselbe Prop auf zwei Layouts Verschiedenes. Default bleibt aus.

**Nebenbefund:** `examples/` konnte bis jetzt keine einzige Seite auf einem cw-core-Layout
bauen. `BaseLayout.astro` importiert fest `@/styles/tokens.css` und setzt damit die
Kundenstruktur voraus; in examples fehlte der Alias, der Build brach mit
`Rollup failed to resolve import` ab. Alle bisherigen Beispielseiten bauen deshalb ihren
HTML-Rahmen selbst. Mit `@`-Alias und einer minimalen `examples/src/styles/tokens.css`
sind BaseLayout, ContentPage und LandingPage dort erstmals pruefbar.

### Gegenbeweise — zwei Pruefungen fielen dabei durch

| Sabotage | Ergebnis |
|---|---|
| Hover-Anhebung entfernt | **rot** (2 Pruefungen) |
| `@media (hover: hover)` entfernt | **zuerst gruen** — die Pruefung las `window.matchMedia`, also die Testumgebung statt das CSS. Nach Reparatur rot |
| FAQ-Hoehenuebergang entfernt | **rot** — nach 90 ms bereits am Endwert, also ein Sprung |
| `motion`-Prop entfernt | **zuerst wortloser Absturz** — Locator-Exception statt roter Meldung. Nach Reparatur rot |

Zwei der vier Sabotagen deckten Fehler in den Pruefungen auf, nicht im Code. Eine
Pruefung, die die Testumgebung misst, kann nicht rot werden; ein Absturz sieht aus wie
ein kaputter Testaufbau und nicht wie ein Befund.

528/528 Tests, lint:css sauber, astro check unveraendert bei 2 vorbestehenden Fehlern,
19 Beispielseiten bauen, Reproduzierbarkeit 31 Dateien byte-identisch, 11/11 Browser-Checks.

---

## v0.118.0 (2026-08-17)

**Neu:** `motion/ThresholdBar.astro` — ein Zustandsbalken, dessen Aussage die
**Schwellenmarke** ist, nicht die Füllbewegung. Dazu die Utility-Klasse
`.motion-focus-glow` für einen Fokusring, der sofort da ist und nur außen
nachglüht.

Bewusst **ohne** `[kunde]`-Zeile: beides sind neue, opt-in Bausteine. An keiner
der 24 ausgelieferten Seiten ändert sich etwas — wer sie nicht importiert bzw.
die Klasse nicht setzt, sieht keinen Unterschied. Die Regeln in `tokens-base.css`
sind additiv und greifen an keinem bestehenden Element.

Beide Bausteine waren seit dem 06.08. in `customer-platzfrei/src/pages/motion-lab.astro`
erprobt und nie geerntet — sie lagen zehn Tage lang in einem Kundenrepo statt im Kern.

### Warum die Marke der Punkt ist

Ein Balken ohne Bezugspunkt ist ein Ladebalken: er sagt „etwas füllt sich", aber
nicht, worauf es hinausläuft. Der Strich sagt, ab wann es kippt — ab wann der Kurs
stattfindet, ab wann die Mindestmenge erreicht ist. Er bewegt sich deshalb nie.

### § 5a UWG steht an der Komponente, nicht nur im Plan

Füllstand und Schwelle müssen aus einer echten Datenquelle kommen. Ein Balken mit
ausgedachten Zahlen ist erfundene Dringlichkeit und damit eine irreführende
geschäftliche Handlung. Die Auflage steht als Kommentar im JSDoc der Komponente,
in `tokens-base.css` und in der Examples-Seite — dort, wo sie jemand liest, der
den Balken einbaut. Beispielwerte müssen am Bauteil selbst gekennzeichnet sein.

### Reduced Motion: nachgemessen statt behauptet

Der erste Kommentar an der Reduced-Motion-Regel behauptete, ohne den Dauer-Kollaps
bliebe der Balken auf Keyframe 1 stehen, also leer. Drei Sabotageläufe haben das
widerlegt und die Lage geklärt:

| Sabotage | Ergebnis |
|---|---|
| `animation: none` statt Dauer-Kollaps | **grün** — der Balken steht weiterhin richtig |
| Basisregel `transform: scaleX(var(--fill))` entfernt | **rot** — `transform: none`, der Balken zeigt 100 % statt 25 % |
| Dauer-Kollaps entfernt | **rot** — Füllung läuft 700 ms trotz `prefers-reduced-motion` |

Den Standzustand trägt also die Basisregel, nicht der Dauer-Kollaps; der Kollaps
hält die Bewegung an. Beides ist nötig, aber aus verschiedenen Gründen — und der
Kommentar sagt das jetzt richtig. Die dritte Sabotage deckte zugleich eine Lücke
in der Prüfung auf: sie wartete 1,2 s und sah deshalb in beiden Fällen nur den
Endzustand. Sie prüft jetzt zusätzlich die `animation-duration`.

### Guard-Registrierung

`ThresholdBar` steht in `IMPORT_ONLY_MOTION` und setzt `data-motion-threshold`.
Ohne den Marker wäre die Füllanimation für den Motion-Consent-Guard unsichtbar
gewesen — der Test `jede Motion-Komponente setzt einen erkennbaren Marker` hat
das beim ersten Lauf gefangen, bevor es jemand hätte übersehen können.

Die Styles liegen auf Klassen statt auf dem Attribut, damit sie auch für Elemente
gelten, die JavaScript nachträglich einfügt. Grund ist ein Fehler aus derselben
Woche in `customer-platzfrei`: ein per `document.createElement` erzeugtes Element
trägt Astros Scope-Kennung nicht, und gescopte Regeln greifen dann an ihm nicht.

Examples: `/motion` zeigt beide unter Nr. 13 und 14.

---

## v0.117.0 (2026-08-13)

**Fix:** Der `smoke-test`-Job überspringt sich nicht mehr stillschweigend, wenn
`PRODUCTION_URL` fehlt — bei zahlenden Kunden schlägt er stattdessen fehl.

Bewusst **ohne** `[kunde]`-Zeile — an keiner ausgelieferten Seite ändert sich etwas, die
Änderung wirkt ausschließlich in der CI. Sie entscheidet aber, ob ein totes Kontaktformular
überhaupt auffällt.

Anlass: siluri/blitzsicht-ops#661. Die Job-Bedingung lautete

```yaml
if: github.ref == 'refs/heads/main' && vars.PRODUCTION_URL != '' && vars.SKIP_FORM_HEALTH != 'true'
```

Fehlte die Variable, wurde der ganze Job übersprungen. `conclusion=skipped` ist **kein**
Fehlschlag: der Lauf steht trotzdem auf `success`, `gh pr checks` exitet 0, und in der Anzeige
steht `smoke-test  skipping` neben lauter `pass`. Der Ausfall tarnt sich als Erfolg.

Gemessen am 13.08.2026 über alle 24 `customer-*`-Repos (`scripts/audit-form-health-coverage.sh`):

| Repo | `customer.yml` | `PRODUCTION_URL` | letzter `main`-Lauf |
|---|---|---|---|
| customer-donau-profi | `type: active` | fehlt | workflow `success`, `smoke-test skipped` |
| customer-mika-elektrotechnik | `type: active` | fehlt | workflow `success`, `smoke-test skipped` |
| customer-zink-baeckerei | `type: active` | fehlt | workflow `success`, `smoke-test skipped` |

Drei zahlende Kunden, bei denen der Form-Health-Check nie lief — ohne dass es je rot wurde.

Neu:

- `scripts/form-health-gate.mjs` — Vorschalt-Schritt **im** Job statt Bedingung **am** Job.
  `SKIP_FORM_HEALTH=true` → exit 0 (sichtbarer Opt-out). `PRODUCTION_URL` gesetzt → exit 0,
  Smoke-Test läuft. Fehlt sie und `customer.yml` meldet `type: active` → **exit 1**, roter Job.
  Fehlt sie bei `prospect`/`paused`/ohne `customer.yml` → exit 0, kein Vorfall (fail-open,
  damit Repos ohne `customer.yml` nicht zwangsweise rot werden).
- `scripts/form-health-gate.test.mjs` — 7 Tests. Der entscheidende ist der Gegenbeweis nach
  HANDBOOK §2.6: `type: active` ohne `PRODUCTION_URL` **muss** exit 1 liefern.
- `scripts/audit-form-health-coverage.sh` — flottenweiter, rein lesender Coverage-Report über
  alle `customer-*`-Repos: `customer.yml:type`, beide Variablen und ob überhaupt Formular-Code
  im Repo liegt. Exit 1, solange ein `type: active`-Repo ohne laufenden Check dasteht.
  Ein fehlgeschlagener Abruf wird als `?` ausgewiesen, **nicht** als „kein Formular" —
  nicht geprüft ist kein Negativbefund.
- `templates/.github/workflows/build-check.yml` — Job-`if:` auf `github.ref` reduziert; die
  Folge-Steps hängen jetzt an `steps.gate.outputs.run_smoke`. Der Job bleibt damit sichtbar
  grün oder rot, statt als `skipped` aus der Anzeige zu verschwinden.

Nicht in diesem Release: die drei fehlenden `PRODUCTION_URL`-Variablen selbst und die
`customer.yml` für `customer-gympanzen` — beides liegt in fremden Repos, nicht in cw-core.

## v0.116.0 (2026-08-13)

**Workflow:** Der Release-Train fragt vor jedem Bump, ob der Kunde überhaupt etwas davon hat.

Bewusst **ohne** `[kunde]`-Zeile — an keiner ausgelieferten Seite ändert sich etwas. Dieser
Eintrag ist zugleich das erste Beispiel für den Fall, den das neue Gate abfängt.

Gemessen am 13.08.2026, und der Anlass für den Umbau:

| | |
|---|---|
| cw-core-Releases seit 01.08. | 40 in 13 Tagen, davon 26 in KW33 |
| Bump-Commits über die Flotte, 90 Tage | 550 |
| je Live-Repo | 40–51, also etwa jeden zweiten Tag ein Production-Deploy |
| CHANGELOG-Einträge **ohne** `[kunde]`-Marker | **155 von 204** |

Der Train zog stumpf den neuesten Tag und koppelte damit zwei Dinge, die nichts miteinander
zu tun haben: „unsere neuen Guards sollen über die Flotte laufen" und „der Kunde bekommt
einen Commit und einen Deploy". Drei Viertel der Releases ändern an der ausgelieferten Seite
nachweislich nichts — gympanzens Sprung v0.95.0 → v0.110.0 ergab über 82 Dateien und 18
Seiten null Byte Unterschied.

Die Klassifikation existierte längst: der `cw-release`-Skill verlangt bei kundenwirksamen
Releases eine `[kunde]`- bzw. `[kunde:sichtbar]`-Zeile. Sie wurde nur nie gelesen.

Neu:

- `scripts/lib/changelog-kunde.mjs` — reine Logik. `kundenwirkung(md, von, bis)` sammelt die
  `[kunde]`-Zeilen der Spanne (`von` exklusiv, `bis` inklusive) und kennt **drei** Zustände:
  `kundenwirksam`, `nur-tooling` und `unbekannt`. Der dritte ist der wichtige — fehlt eine der
  Versionen im CHANGELOG oder umfasst die Spanne 0 Versionen, ist das kein „nur Tooling".
  Eine leere Menge beweist nichts, also **fail open**: bumpen und den Grund melden.
- `scripts/kunde-gate.mjs` — CLI für den Train. Exit 0 = bumpen, 10 = überspringen,
  11 = unbekannt, 2 = Aufruffehler. Bewusst so geschnitten, dass ein kaputter Aufruf nie wie
  „überspringen" aussieht.
- `upgrade-cw-core-mass.sh` in `customer-websites` ruft das Gate vor jedem Bump. Notausgang
  `--ignore-kunde-gate`.

**Das Gate entscheidet über den Pin, nicht über das Messen.** `--build-only` läuft bewusst
daran vorbei: ein alter Pin versteckt Guards, statt sie zu entschärfen. Wer nicht bumpt, muss
trotzdem scannen — sonst tauscht man Deploy-Lärm gegen blinde Flecken.

Vier Zweige an echten Kunden gegengeprüft: gympanzen v0.113.0 → v0.114.0 (reines Tooling)
wird übersprungen, digital-direkt v0.112.0 → v0.115.0 geht durch, `--ignore-kunde-gate` hebelt
den Skip aus, und `--build-only` misst weiterhin (21 Guards mit ✓). Tests 509 → 521.

**Migrations-Hinweis:** Keiner.

---

## v0.115.0 (2026-08-13)

- [kunde:sichtbar] Die Überschrift im oberen Seitenbereich erscheint wieder in voller Größe. Auf Seiten mit eingeblendeter Titel-Animation war sie zuletzt deutlich zu klein.

**Fix:** Die Hero-Überschrift wird jetzt in **beiden** Motion-Zweigen gestylt.

`Hero.astro` rendert die Überschrift bei aktivem `motion.textReveal` nicht selbst, sondern
über `<TextReveal as="h1">`. Das `<h1>` trägt dadurch den Astro-Scope von TextReveal, und der
scoped Element-Selektor `h1 { font-size: clamp(2.25rem,5vw,3.75rem); color: white }` im Hero
konnte es nicht mehr treffen. Übrig blieb, was der Kunde global für `h1` gesetzt hatte — oder
gar nichts.

Gemessen im Browser an der neuen Fixture, gleiche Seite, beide Zweige nebeneinander:

| Zweig | vorher | nachher |
|---|---|---|
| ohne `textReveal` | 60 px | 60 px |
| mit `textReveal` | **24 px** | 60 px |

**Live betroffen war blitzsicht.com**: dort gab es **keine einzige** Regel, die dem `<h1>`
Größe oder Farbe zuwies — die Überschrift lief auf Browser-Default. Bei
`customer-weinkontor-sinzing` kam zusätzlich ein globales `h1 { color: … }` aus den
Kunden-Tokens durch und färbte sie weinrot auf dunklem Grund.

Neu: beide Zweige rendern `class="hero-title"`, und die Regel bindet als
`.hero-content :global(.hero-title)`. Dasselbe Muster, das `Hero.astro` für TiltCard-Kinder
schon nutzt — der scoped Parent bindet die `data-astro-cid`, `:global()` umgeht den fremden
Kind-Scope. Erwünschter Nebeneffekt: Spezifität `0,2,0` schlägt kundenseitige globale
`h1`-Regeln. `TextReveal.astro` bleibt unverändert; es nahm den `class`-Prop schon entgegen.

Abgesichert durch `scripts/verify-hero-title-scope.mjs` gegen die Fixture
`examples/src/pages/hero-title-scope.astro`, die beide Zweige in einem Build nebeneinander
rendert. Gemessen werden die **berechneten** Stile im echten Browser, nicht der CSS-Text — ein
Selektor kann korrekt aussehen und trotzdem nichts treffen. Der Check hängt über
`scripts/verify-hero-title-scope.test.mjs` an `pnpm test` (Tests 508 → 509) und kennt drei
Zustände: grün, rot, und `NICHT GEPRÜFT` als sichtbares `skip`, wenn Playwright oder Fixture
fehlen. Gegenbeweis gefahren: gegen den Stand von v0.114.0 meldet er Exit 1 und benennt den
textReveal-Zweig.

Cluster-Scan: `<TextReveal as=…>` kommt in cw-core **nur** in `Hero.astro` vor. In der Flotte
nutzen `blitzsicht` und `braustall` `textReveal`; `mazterplan` und `preshot` fahren nur
`motion={{ progress: true }}` und sind nicht betroffen.

**Migrations-Hinweis:** Keiner. Wer die Überschrift kundenseitig über einen `h1`-Selektor
übersteuert hat, muss auf `.hero-title` wechseln — in der Flotte tut das niemand.

Refs: blitzsicht-ops#662

---

## v0.114.0 (2026-08-13)

**Fix:** Der SiteData-Shape-Guard meldet reine SEO-Hinweise als `info` statt als `[WARN]`.

`lintSiteDataShape` stuft `legal.region` und `seo.knowsAbout` seit jeher als
`severity: 'info'` ein — der Kommentar im Code sagt wörtlich „reine Hinweise, brechen nie
den Build", und `strictSiteDataShape` wirft ausschließlich bei `warn`. Ausgegeben wurden
sie trotzdem über `logger.warn`. Astro schreibt daraufhin `[WARN]` ins Build-Log, und der
strict-warnings-Gate des Release-Trains zählt jede WARN-Zeile mit `@cw/core`-Label als
Guard-Befund, ohne die Severity zu kennen (`customer-websites/scripts/lib/build-warnings.mjs`).

Folge: ein Hinweis, der laut eigener Definition nichts bricht, verweigerte den PR.
`customer-allstargirls-regensburg` und `customer-itk-regensburg` hingen **allein deswegen**
auf v0.110.0 fest — ihr einziger Befund war „`legal.region` fehlt". Zwei weitere Repos
trugen den Hinweis zusätzlich zu echten Befunden.

Neu: `planShapeReport(issues, strict)` entscheidet als reine Funktion über Log-Level,
Kopfzeile und Abbruch; der Astro-Hook loggt nur noch, was sie zurückgibt.

- keine Issues → `info`, `✓ Canonical-Shape (Bild-Pipeline voll wirksam).`
- nur `info`-Issues → **`info`**, `✓ Canonical-Shape, N SEO-Hinweis(e) (kein Befund):` —
  die Hinweise stehen weiterhin vollständig im Log, nur eben nicht mehr als Warnung.
- mindestens ein `warn`-Issue → unverändert `warn` + Abbruch bei `strictSiteDataShape`.

Das `✓` im Hinweis-Fall ist Absicht: der Report zählt Info-Zeilen mit `✓` als Beleg, dass
ein Guard überhaupt gelaufen ist. Ohne Häkchen hätte ausgerechnet ein Repo mit SEO-Hinweisen
still einen Guard weniger vorzuweisen als ein sauberes.

Belegt in beiden Richtungen: `tests/ai-discovery/sitedata-shape-linter.test.js` prüft neben
dem Hinweis-Fall den Gegenbeweis (echte Shape-Abweichung → `warn` **und** Abbruch) sowie die
Mischung aus beidem — ein Hinweis darf eine echte Abweichung nicht herunterstufen. Auf
Log-Ebene liefert `build-warnings-report.mjs` gegen dasselbe Build-Log vorher `rc=2` und
nachher `rc=0`, bei `guardOk` 20 → 21.

**Migrations-Hinweis:** Keiner. Sichtbare Website-Ausgabe unverändert; betroffen ist nur das
Build-Log.

---

## v0.113.0 (2026-08-12)

**Fix:** Der Perf-Budget-Guard misst jetzt auch `.avif`.

`checkImageBudget` ist formatagnostisch, bekam seine Dateiliste aber aus `walkImages`, das über
`TAGGABLE_EXT = ['.webp','.png','.jpg','.jpeg']` läuft — die Liste dessen, was **exiftool
geo-taggen** kann. AVIF gehört dort zu Recht nicht hinein, fürs Größenbudget war es aber die
falsche Liste.

Folge: bei `<picture>` lädt der Browser das AVIF **zuerst**, und genau das Format blieb
ungemessen. Bei gympanzen lagen 5 AVIF zwischen 215 und 348 KB unbemerkt über Budget, während
die Guard-Meldung selbst „(oder AVIF-Variante)" empfahl — sie riet zu einem Format, das sie
anschliessend nicht prüfte. Wer nur die gemeldeten WebP verkleinert hätte, wäre formal grün
gewesen, ohne dass ein einziger Besucher weniger lädt.

Neu: `BUDGET_EXT = [...TAGGABLE_EXT, '.avif']` und ein optionaler `exts`-Parameter an
`walkImages`. **`TAGGABLE_EXT` bleibt unverändert** — sie steuert das exiftool-Geotagging, und
der Fix darf nicht dorthin wandern. Die Denylist (OG/Icons/Favicons/Email/Social) gilt im
Budget-Pfad unverändert weiter.

**Cluster-Scan vor der Änderung** (12.08.2026, alle `customer-*`-Repos gegen ihren
Default-Branch): **5 AVIF über 200 KB, alle in gympanzen.** Kein anderes Repo betroffen — der
Fix legt also nirgends sonst neue Warnungen frei.

Gegenprobe gegen v0.110.0: derselbe Verzeichnisbaum liefert dort nur das WebP, mit dem Fix
beide Dateien. Zwei neue Tests sichern beide Richtungen ab — AVIF im Budget-Walk **und**
weiterhin kein AVIF im Geotag-Walk, sonst schickt der Fix exiftool Formate, die es nicht
verarbeitet.

Tests 502 → 504.

---

## v0.112.0 (2026-08-12)

**Breaking (Guard):** `assetRefChecks` steht per Default auf `"fail"`. Eine Asset-Referenz,
die im gebauten `dist/` weder als Datei noch über ein Rewrite auflösbar ist, bricht den Build
ab statt nur zu warnen.

Gedeckt durch eine Flottenmessung auf **frischen** Builds (12.08.2026), nicht auf vorhandenen
`dist/`-Ständen — die hatten bei v0.108.0 schon einmal 15 Altbefunde vorgetäuscht, von denen
genau einer echt war:

| Messung | Umfang | Befunde |
|---|---|---|
| Live-Crawl, 13 Seiten, HEAD je Referenz | 549 Referenzen | 0 (549× HTTP 200, kein Redirect) |
| Lokale Frisch-Builds, 20 Repos | 703 Referenzen | 0 |
| CI nach dem Bump, 10 Live-Repos | 513 Referenzen | 0 |

Die Einzelzahlen aus CI und lokaler Messung sind deckungsgleich (blitzsicht 61, zink 179,
digital-direkt 90 …) — zwei unabhängige Wege, dasselbe Ergebnis.

Eine saubere Flotte, die nur gewarnt wird, driftet zurück — dieselbe Begründung wie beim
Link-Check in v0.109.0.

**Migration:** Repos mit Altbefunden setzen `"assetRefChecks": "warn"` in ihrer
`touchpoint-audit.config.json`, bis sie abgearbeitet sind. Mit Grund, nicht stillschweigend.

**Fix:** Der `llms.txt`-Guard benennt die tatsächliche Ursache, statt sie zu raten.

Der Check sieht nur `dist/llms.txt` und kann daraus nicht ableiten, woher die Datei stammt.
Eine statische `public/llms.txt` und eine Astro-Route `src/pages/llms.txt.ts` erzeugen dasselbe
Artefakt, brauchen aber gegensätzliche Handgriffe — die Meldung nannte trotzdem immer
`public/llms.txt`. Bei schiller-gartenbau (Route, keine Datei) schickte sie damit auf die Suche
nach einer Datei, die es im Repo nicht gibt, und blockierte den Kunden über den
strict-warnings-Gate vom Pin-Bump.

Neu wird unterschieden: Datei vorhanden → Datei löschen. Route vorhanden → Route löschen.
Keins von beidem → explizit als „Quelle unklar" gemeldet, statt eine zu erfinden.
Cluster-Scan über alle `customer-*`-Repos: braustall hat die Datei, schiller-gartenbau hatte
die Route, sonst niemand. Beide Zweige an einem echten Build von
`customer-schiller-gartenbau` gegengeprüft.

Tests bleiben bei 502 — der Default-Test wurde auf `fail` umgestellt, nicht ergänzt, und
prüft weiterhin alle vier Zustände (`fail` per Default, `warn`, `off`, Unsinnswert → Exit 2).

---

## v0.111.1 (2026-08-12)

**Fix:** Der dist-Check gibt die Zahl der geprüften Links und Asset-Referenzen jetzt **immer**
aus, nicht nur wenn nichts zu beanstanden war.

Bis v0.111.0 stand die Zeile `N Asset-Referenzen im dist … alle auflösbar` ausschliesslich im
sauberen Fall. Ein Repo mit einem Befund zeigte im CI-Log also den Befund, aber keinen
Zählwert — und war damit von einem Repo, in dem der Check gar nicht lief, nicht mehr zu
unterscheiden. „NICHT GEPRÜFT" und „geprüft, etwas gefunden" sahen gleich aus.

Aufgefallen beim Bau der Flottenmessung für den Rollout von v0.111.0: die Auswertung meldete
für ein absichtlich kaputtes Fixture `KEINE_ZEILE` statt einer Zahl — bei einem Lauf, der
sauber geprüft und den Fehler korrekt gemeldet hatte.

Neu bei Befunden:

```
ℹ️  61 Asset-Referenzen im dist (1 CSS-Datei(en) mitgelesen) — 1 davon nicht auflösbar (oben gemeldet).
ℹ️  131 interne Links im dist geprüft — 2 davon nicht auflösbar (oben gemeldet).
```

Ohne Befund bleibt die bisherige `✓`-Zeile unverändert. Kein Verhaltensunterschied bei
Exit-Codes, reine Nachweis-Ausgabe. Tests 501 → 502.

---

## v0.111.0 (2026-08-12)

- [kunde] Der automatische Vorab-Check prüft ab sofort auch Bilder, Schriften und Skripte:
  Verweist die Website auf eine Bilddatei, die es nach dem Bauen nicht mehr gibt, fällt das
  jetzt vor der Veröffentlichung auf statt gar nicht.

**Fix:** Der dist-Link-Check erfasst zusätzlich `src`, `srcset` und CSS-`url()` — und schneidet
bei `href` das Fragment ab, statt am `#` den ganzen Link zu verlieren.

Kontext (blitzsicht-ops#656): Die Extraktion sah bis v0.110.0 ausschließlich `href=`. Bilder
hängen aber an `src=`. Beim Heben der Alt-Repos rutschten dem Guard deshalb zwei tote
Bildverweise durch — beide vom selben Mechanismus verursacht: `optimize-images.mjs
--delete-originals` macht aus `public/*.png` ein `.webp` und räumt das Original weg, der
Verweis bleibt auf `.png` stehen. Das lief bei **jedem** Build in einen 404, ohne dass je ein
PR rot wurde.

- `[blumen-schmid]` Footer-Logo `<img src="/signet-white.png">`, gebaut wurde nur `.webp`
- `[allstargirls]` Hintergrund `url(/star.png)` in `_astro/index.*.css`, gebaut nur `.webp`

Neu: `extractAssetRefs(source, origin, {cssOnly})` neben `extractInternalLinks`. Getrennt
gemeldet, weil ein fehlendes Bild ein anderer Schaden ist als ein toter Seiten-Link.

**Geltungsbereich, vorher gemessen statt geraten** (12.08.2026, 22 Repos, 518 Seiten):

- CSS-`url()` wird **nur** in `<style>`-Blöcken und `.css`-Dateien gelesen. Über rohes HTML
  trifft der Regex JavaScript statt CSS (`new URL(t.href)` → `url(t.href)`): 502 von 554
  Treffern waren Falschpositive. Auf `<style>` eingegrenzt bleibt exakt null davon übrig.
- `src`/`srcset` nur an `img`, `source`, `script`, `video`, `audio`, `track`, `embed`, `iframe`.
- Übersprungen: `data:`, `blob:`, protokoll-relativ, fremde Origins, `/_vercel/…`, `/_image…`.
  Dokument-relative Pfade werden übersprungen, aber **gezählt** und ausgegeben.
- Kein `<link rel="canonical">` nötig — anders als der Link-Check läuft die Asset-Prüfung auch
  auf Repos ohne Canonical (Beleg: herztoene).

**Vormessung über die 13 Live-Seiten** (deployte Builds, nicht lokale dist-Stände): 549
distinkte Asset-Referenzen, **549× HTTP 200**, kein Redirect, kein 404. Einziges per Rewrite
statt als Datei bedientes Asset ist der Plausible-Proxy `/js/script.js`; in allen 12
referenzierenden Repos als unbedingter Rewrite in `vercel.json` verifiziert.

**Fragment-Strip:** `extractInternalLinks` verlor bisher jeden href mit `#` komplett — die
Zeichenklasse `[^"'#]+` liess den Match scheitern, statt `#…` abzuschneiden. 2166 hrefs der
Flotte waren unsichtbar. Der Fix deckt 136 zusätzliche distinkte Pfade ab und erzeugt dabei
über alle 22 Repos **0 zusätzliche Befunde** (28 vorher, 28 nachher).

**Konfiguration:** neuer Schlüssel `assetRefChecks` in `touchpoint-audit.config.json`,
`"warn"` (Default) | `"fail"` | `"off"`. Bewusst getrennt von `distLinkChecks`, das auf
`"fail"` bleibt. Der Default wird nach der Flottenmessung über frische CI-Builds auf `"fail"`
gezogen — derselbe Weg wie v0.108.0 → v0.109.0. Unbekannter Wert → Exit 2, kein stiller Pass.

Tests 484 → 501. Der Rot-Beweis fährt beide realen Bugs nach (Attribut- und CSS-Form) und
sichert den grünen Zweig ab; die Falschpositiv-Klasse `new URL()` ist negativ abgetestet.

---

## v0.110.0 (2026-08-12)

- [kunde] In der maschinenlesbaren Datei für KI-Assistenten stehen jetzt auch Firmierung,
  Vertretungsberechtigte, Handelsregister und Umsatzsteuer-Nummer — aus derselben Quelle wie
  der Rest der Website, statt aus einer handgepflegten Datei, die dabei veraltete.

**Fix:** `llms.txt` gibt die Rechtsform-Angaben aus `siteData.legal` aus, und eine statische
`public/llms.txt` wird beim Build gemeldet.

Kontext (blitzsicht-ops#648): `generateLlmsTxt` kannte die Felder `owner`, `representatives`,
`registerCourt`, `registerNumber` und `ustIdNr` nicht — sie fehlten im Typ, obwohl die
Kunden-Repos sie längst pflegten. Zwei Kunden (mika, zink) haben deshalb eine statische
`public/llms.txt` gepflegt und per `postbuild: cp public/llms.txt dist/llms.txt` **nach** dem
Generator darübergelegt. Ergebnis war ein Mischzustand: `llms.txt` handgepflegt und
eingefroren, `llms-full.txt` aus `siteData`. Eine Änderung an `siteData.description` blieb bei
mika wirkungslos, während sie bei soleno live durchschlug.

Neu in den Eckdaten, jedes Feld einzeln optional:

```
- Firma: Elektrotechnik Mika GmbH
- Vertretungsberechtigt: Kewin Mika
- Handelsregister: HRB 21336, Amtsgericht Regensburg
- USt-IdNr.: DE451598291
```

Dazu ein Guard: Findet die Integration eine `public/llms.txt`, warnt sie. Die Datei kann
nichts bewirken — der Generator überschreibt sie eine Zeile später — und ist entweder toter
Ballast oder, mit `postbuild`-`cp`, die Ursache genau dieser Drift. Gemessen am 12.08.2026:
**12 Repos** hatten eine solche Datei, 10 davon wirkungslos.

Bewusst nicht aufgenommen: Öffnungszeiten und Handwerkskammer. Beide stehen im JSON-LD-Schema,
das KI-Agenten ohnehin lesen; `llms.txt` bleibt auf die Impressumspflichtfelder beschränkt.

**Migrations-Hinweis:** Wer eine `public/llms.txt` hat, bekommt beim Build eine Warnung —
im Release-Train ist die hart (#646). Die Datei löschen; trägt sie Inhalte, die die generierte
nicht hat, gehören sie nach `siteData`. Ein `postbuild: cp public/llms.txt dist/llms.txt`
gehört ersatzlos entfernt.

---

## v0.109.0 (2026-08-12)

**Tweak:** `distLinkChecks` ist per Default `"fail"` — der dist-Link-Check aus v0.108.0 macht
den Build jetzt rot statt nur zu warnen.

Kontext: v0.108.0 startete bewusst als Warnung, weil eine Vorab-Messung Altbefunde vermuten
liess. Der Rollout mit frischen CI-Builds ergab dann über alle 12 Live-Repos **543 interne
Links und 0 Befunde**. Eine saubere Flotte, die nur gewarnt wird, driftet zurück — und der
Warn-Default wäre ohnehin fast wirkungslos gewesen: nur digital-direkt hat überhaupt eine
`touchpoint-audit.config.json`, in 11 von 12 Repos hätte niemand je auf `"fail"` gestellt.

Ab jetzt gilt: ein interner Link oder eine Ads-Final-URL, die weder als Datei gebaut wird
noch von einem Rewrite bedient wird, bricht den Build. Ein Redirect-Treffer zählt als Hop und
ebenfalls als Befund.

**Migrations-Hinweis:** Für die 12 Live-Repos keiner — sie sind gemessen sauber. Repos auf
Pins älter als v0.108.0 (alle nicht-live: weinkontor-sinzing, allstargirls-regensburg,
braustall, herztoene, itk-regensburg, pferdesport-silberhorn, siluri, mazterplan, preshot)
sehen ihre Altbefunde beim Bump hart. Wer dort erst abarbeiten will, setzt in
`touchpoint-audit.config.json`:

```json
{ "distLinkChecks": "warn" }
```

`"off"` schaltet nur diese Auflösung ab; der tel:/mailto:/WhatsApp-Check bleibt in jedem Fall
hart.

---

## v0.108.0 (2026-08-12)

**Feature:** Touchpoint-Audit prüft interne Links und Ads-Final-URLs jetzt auch im
`--dist`-Modus — also im PR, ohne Netzwerk, vor dem Deploy.

Kontext: Beide Checks liefen bislang ausschließlich hinter `if (liveUrl)`, also nur im
`smoke-test`-Job nach dem Vercel-Deploy auf `main`. digital-direkt-ops#17 lag deshalb sechs
Tage unentdeckt: eine Seite wurde am 06.08. in eine andere eingearbeitet und ein Redirect
gesetzt, aber die Ads-Soll-Liste zeigte weiter auf die alte URL. Im PR war nichts rot. Der
dist-Modus stellt dieselbe Frage eine Stufe früher: Ist der Pfad als Datei gebaut, wird er
von einem Rewrite bedient — oder hängt er an einem Redirect (Hop) bzw. an gar nichts (tot)?

Neue exportierte Helfer in `scripts/verify-touchpoints.mjs`:

- `resolveDistPath(urlPath, files)` — löst gegen das gebaute Verzeichnis auf; kennt
  directory- und file-Format, das trailingSlash-Paar, Prozent-Encoding und NFC.
- `matchVercelRoute(urlPath, vercelJson)` — `redirect` / `rewrite` / `unknown` / `null`.
  Liest `:param` und `:rest*`; unbekannte Syntax wird nie geraten.
- `pickDistRoot(distDir, entries)` — findet `dist/client/` bei Adapter-Builds.
- `normalizeUrlPath`, `distPathCandidates`, `detectOriginFromHtml`.

Zwei Fallen, die den Guard ohne Gegenmaßnahme fleetweit unbrauchbar gemacht hätten und
darum je einen Pflicht-Test haben:

- **`has`/`missing` müssen gelesen werden.** 16 von 22 Repos tragen die www→Apex-Kanonisierung
  als `{"source":"/:path*","has":[{"type":"host",…}]}`. Wer die Bedingung ignoriert, hält
  jeden Pfad für einen Redirect — gemessen wären das ~700 Hop-Befunde über die Flotte
  gewesen. Bedingte Regeln gelten auf dem kanonischen Host als nicht anwendbar.
- **`dist/client/` bei Adapter-Builds.** blitzsicht baut `output:'static'` + `adapter: vercel()`;
  ein naives `join(dist, pfad)` meldet dort alle 131 Links als tot.

Neuer Config-Key in `touchpoint-audit.config.json`:

```json
{ "distLinkChecks": "warn" }
```

`"warn"` (Default) · `"fail"` · `"off"`. Betrifft **nur** diese Auflösung — der
tel:/mailto:/WhatsApp-Check bleibt unverändert hart, damit ein Repo mit Altlinks nicht den
Check mit abschaltet, der Anlass des ganzen Scripts war.

**Fleet-Messung, korrigiert.** Eine erste Messung über die lokal vorhandenen `dist/`-Stände
meldete 19 Treffer und nach einer Live-Gegenprobe „15 echte Befunde". Beides war falsch. Die
lokalen `dist/` waren Wochen alt, und die Gegenprobe fragte nur, ob das *Ziel* einen Hop
macht — nicht, ob die aktuelle Seite den Link überhaupt noch enthält. Beim Rollout auf die
12 Repos hat die CI dann frisch gebaut und geprüft:

**543 interne Links, 0 Befunde.** Genau ein Treffer der Erstmessung war echt (donau-profi
verlinkte `/informationspflicht`, ein 308 auf `/datenschutz/#art-13-geschaeftskontakte`;
im selben Rollout behoben). Alles andere waren Artefakte veralteter Build-Stände.

Lehre für den nächsten Guard dieser Art: eine Messung über vorhandene `dist/` misst
Repo-Historie, nicht den Guard. Und bei einem Link-Befund gehören immer zwei Fragen geprüft
— antwortet das Ziel mit einem Hop, *und* steht der Link noch auf der Seite.

Der Check startet trotzdem als Warnung. Die Flotte steht auf 0, der Hart-Flip auf `"fail"`
ist damit vorbereitet, gehört aber als eigener Schritt gefahren.

Tests: 23 → 44. Gegenbeweis geführt — `has`-Auswertung entfernt bricht 3 Tests,
`dist/client` entfernt 2, Encoding/NFC entfernt 2.

**Migrations-Hinweis:** Keiner. Ohne `distLinkChecks` verhält sich der Guard als Warnung und
kann keinen Build rot machen, der vorher grün war.

---

## v0.107.4 (2026-08-12)

- [kunde:sichtbar] Auf Seiten mit dem großen Abschluss-Block verschwindet der zweite Knopf
  („Pakete & Preise ansehen"), wo er auf eine Seite zeigte, die es gar nicht gibt. Der
  Hauptknopf bleibt unverändert.
- [kunde] Websites ohne hinterlegtes App-Icon bekommen es jetzt beim Bauen automatisch aus
  dem vorhandenen Logo. Vorher zeigte das Lesezeichen auf dem Handy-Startbildschirm kein
  Bild.

**Fix:** Drei tote Enden, die der Fleet-Rollout sichtbar gemacht hat

Der Touchpoint-Audit lief nach dem vollständigen Template-Rollout erstmals in allen Repos.
Was er in der zweiten Welle fand, waren wieder je zur Hälfte echte Defekte und Guard-Lücken:

**1. `CTABlock` verlinkte `/pakete` als Voreinstellung.** Weil auch `secondaryLabel` einen
Default hat, rendert jeder `<CTABlock />` ohne explizite Props einen Knopf dorthin. Gemessen
über die committeten Quellen: **`/pakete` existiert in genau 1 von 14 Repos** (blitzsicht) —
82 Verwendungen des Blocks über die Fleet. Bei gottl-richter-gomeier meldete der Live-Audit
den toten Link. Der Default ist raus; der zweite Knopf rendert nur noch, wenn `secondaryHref`
gesetzt ist. Dasselbe Muster wie der TiltCard-Vorfall: ein Prop-Default liefert etwas aus,
das der Kunde nie bestellt hat.

**2. `favicon-192.png` wurde bedingungslos verlinkt, existierte aber oft nicht.**
`BaseLayout.astro` schreibt `<link rel="icon">` und `<link rel="apple-touch-icon">` in jede
Seite. Gemessen: **6 von 20 Repos haben die Datei nicht** (hausamlago, hausammincio,
mika-elektrotechnik, zink-baeckerei, blumen-schmid, weinkontor-sinzing). Gleiche Antwort wie
bei `favicon.ico` (#491): nicht 20 Repos einsammeln, sondern beim Build aus `favicon.svg`
erzeugen. Die `favicon-ico`-Integration macht das jetzt für 192 und 512 px — **vorhandene
Dateien werden nicht überschrieben**, wer ein eigenes PNG pflegt, behält es. Abschaltbar über
`pngSizes: []`.

**3. Die `/api/contact`-Probe lief auch auf Sites ohne Formular.** hausamlago ist bewusst
Telefon-/WhatsApp-only, hat weder Formular noch Route — der Audit meldete die Route als tot
und hätte die CI dieses Kunden dauerhaft rot gehalten. Die Probe läuft jetzt nur, wenn
mindestens eine ausgelieferte Seite tatsächlich auf `/api/contact` postet (`postsToContactApi`,
am `action`-Attribut, nicht an „gibt es ein `<form>`" — Suchfelder sind auch Formulare). Der
Skip wird ausgegeben, nicht verschwiegen: „kein Grün für die Formular-Kette, sondern deren
Abwesenheit".

Tests 455 → 458.

## v0.107.3 (2026-08-12)

**Fix:** Zwei Lücken im Touchpoint-/Form-Health-Gate, beide beim Fleet-Rollout aufgefallen

Der vollständige Rollout des `build-check.yml`-Templates (12.08.2026, 13 von 13 Repos)
brachte den Audit erstmals in Repos, die ihn nie hatten. Von den daraufhin roten CIs waren
zwei **wieder** Guard-Lücken, keine Kundenfehler:

**1. `parseSsot` las den `mobile`-Key nicht.** donau-profi meldete 17-mal *„Nummer nicht im
SSOT-Telefon-Set"* für `+49 151 18220924` — eine Nummer, die sauber in `site-data.ts` steht,
nur unter `mobile:` statt `phone:`. Der Key ist jetzt in der Liste
(`phone|fax|tel|mobile|whatsapp`). Gegenprobe im Test: ein beliebiger Key (`umsatzsteuerId`)
wird weiterhin **nicht** zur Telefonquelle — die Liste bleibt eine Liste, kein
„alles was nach Nummer aussieht".

**2. Das Template reichte `FORM_PAGE_PATH` nicht durch.** platzfrei fiel mit
*„/kontakt/ status=404"*, obwohl die Site ein funktionierendes Formular hat — es sitzt auf
der Startseite (One-Pager). `verify-form-health.mjs` kann das seit jeher über
`FORM_PAGE_PATH`, nur kam die Variable im Workflow nie an. Jetzt durchgereicht; unbelegt
bleibt der Default `/kontakt/`.

Setzen mit `gh variable set FORM_PAGE_PATH --body "/" --repo <repo>`.

Beide Befunde folgen demselben Muster wie v0.107.2: Der Guard zeigte auf den Kunden, der
Fehler lag im Guard. Wer einen Guard neu ausrollt, sollte die ersten Befunde grundsätzlich
gegen den Guard prüfen, bevor er Kundendaten anfasst.

Tests 453 → 455.

## v0.107.2 (2026-08-12)

**Fix:** Der Touchpoint-Audit meldete die Adresse, die cw-core selbst ausliefert

`scripts/verify-touchpoints.mjs` prüft jede `mailto:`-Href im gebauten HTML gegen das
E-Mail-Set des Kunden aus `site-data.ts`. Die Datenschutz-Aufsichtsbehörde steht dort
naturgemäß nicht — sie gehört niemandem im Haus. Geschrieben wird sie aber von cw-core
selbst: `InformationspflichtBlock.astro` rendert den Hinweis auf das Beschwerderecht
(Art. 77 DSGVO) samt `mailto:poststelle@lda.bayern.de`.

Der Guard meldete damit die eigene Ausgabe als Fremdkörper. Gemessen am 12.08.2026 beim
Rollout des `build-check.yml`-Templates: **drei von vier** frisch ausgerollten Repos fielen
mit exakt dieser Zeile (zink-baeckerei, schiller-gartenbau, mika-elektrotechnik). Und in den
committeten Quellen aller **23 Kunden-Repos** kommt die Adresse **kein einziges Mal** vor —
sie kann also gar nicht vom Kunden stammen. Das war kein Kundenfehler, das war der Guard.

Neu ist `src/utils/legal/aufsichtsbehoerde.js` mit `DEFAULT_BESCHWERDESTELLE`. Beide
Datenschutz-Blöcke lesen von dort, und `verify-touchpoints.mjs` leitet seine Allowlist
daraus ab — wer die Behörde austauscht, ändert die Allowlist mit, ohne etwas nachzuziehen.

Die Angabe stand vorher **doppelt** als Literal in den Prop-Defaults von
`DatenschutzBlock.astro` und `InformationspflichtBlock.astro` und war bereits
auseinandergelaufen: eine Fassung trug Telefon und `mailto:`, die andere nicht. Der Output
ändert sich dadurch nicht — `DatenschutzBlock` rendert nur `name`, `address` und `url`.

**Geltungsbereich bewusst eng:** in die Allowlist kommen **nur die Adressen, die cw-core
selbst ausliefert** — keine aus dem Gedächtnis abgeschriebene Liste aller 17 deutschen
Aufsichtsbehörden. Eine falsche Adresse dort wäre schlimmer als keine: sie stünde als
„geprüft" in einem Guard, ohne je geprüft worden zu sein. Kunden außerhalb Bayerns setzen
ihre Behörde über das Prop `beschwerdeStelle` und tragen deren Adresse in
`allowExternalMailto` ein — dieser Weg existierte schon und bleibt.

Gegenproben gefahren: eine erfundene Fremdadresse bleibt ein Befund; am echten `dist/` von
zink-baeckerei geht der alte Guard mit Exit 1 raus, der neue mit Exit 0 bei 13 geprüften
Seiten. Dazu ein Drift-Test, der fehlschlägt, sobald eine Komponente die Behördenangabe
wieder als Literal führt.

Tests 444 → 453.

## v0.107.1 (2026-08-12)

**Docs:** `[kunde]`-Zeile zur Dateigröße korrigiert — sie behauptete mehr als gemessen ist

Die zweite `[kunde]`-Zeile von v0.107.0 sagte „Die Seiten mit Animationen werden dabei
deutlich kleiner". Für die Referenzseite stimmt das (31 214 → 22 669 Bytes, −27 %), für eine
echte Kundenseite nicht zwingend: blitzsichts Startseite wuchs von 272 217 auf 273 423 Bytes
(+0,4 %). Ursache ist der CLS-Fix selbst — die wortweise zerlegte Headline steht jetzt im
Quelltext, statt vom Browser zusammengebaut zu werden. Das kostet Bytes und spart
Layout-Sprünge.

Diese Zeilen gehen wörtlich in die Monatsreport-Sektion „Was ist neu auf Ihrer Website".
Eine Größenzusage, die auf der eigenen Seite nicht eintritt, ist dort schlechter als keine.
Der Nutzen ist der Cache, nicht die Größe — die korrigierte Zeile sagt genau das.

Kein Code-Change, kein Kunden-Pin-Bump nötig.

## v0.107.0 (2026-08-12)

- [kunde] Die Website erzeugt jetzt bei jedem Bauen exakt dieselbe Datei, solange sich am
  Inhalt nichts geändert hat. Vorher bekam ein Teil der Seiten bei jeder Veröffentlichung
  neue Zufallswerte im Quelltext — Browser mussten sie deshalb jedes Mal komplett neu
  laden, obwohl sich nichts geändert hatte.
- [kunde] Derselbe Programmcode für die Animationen steht nicht mehr Dutzende Male im
  Quelltext, sondern einmal. Wie stark eine Seite dadurch schrumpft, hängt davon ab, wie
  viele Animationen auf ihr liegen — bei wenigen kann sie auch minimal wachsen, weil
  animierter Text jetzt fertig im Quelltext steht statt erst im Browser zusammengesetzt zu
  werden. Das ist gewollt: es verhindert das kurze Verspringen des Layouts beim Laden.
- [kunde:sichtbar] Bei gestaffelt einfliegenden Kachelreihen startet die Bewegung jetzt für
  die ganze Reihe gemeinsam, sobald sie ins Bild kommt — vorher zählte jede Kachel für
  sich.

**Fix + Feature:** Das HTML ist wieder reproduzierbar — und ein Guard, der das offen hält

Vier Motion-Komponenten vergaben ihre Element-ID mit
`Math.random().toString(36).slice(2, 9)` — nur damit ihr eigenes Inline-Script sich per
`getElementById` selbst wiederfand. Zwei Builds derselben Quelle erzeugten dadurch
unterschiedliches HTML (blitzsicht-ops#650):

| Messung (11.08.2026, zwei Builds hintereinander) | Ergebnis |
|---|---:|
| blitzsicht, Dateien im `dist/` | 203 |
| davon zwischen zwei Builds verschieden | **13** |
| übrige 12 Live-Kunden | **0** |

Der Fehler lag drei Jahre im Code, ohne dass etwas rot wurde — ein einzelner Build kann
ihn nicht sehen. Er kostete bei jedem Deploy den Cache jeder betroffenen Seite (ETag und
Last-Modified sind wertlos, wenn sich die Bytes ohne Grund ändern) und machte den
Byte-Vergleich zweier Builds unbrauchbar: in #649 war er das Hauptwerkzeug für den Nachweis
„Output unverändert" und musste für blitzsicht erst per `sed` normalisiert werden.

**Der Fix nimmt die ID nicht deterministisch, sondern ersatzlos raus.** Die Konfiguration
stand ohnehin schon als `data-*`-Attribut am Element; eine ID war nie nötig. Das
Laufzeitverhalten liegt jetzt in einem gemeinsamen Modul (`src/scripts/motion-runtime.ts`),
das über `MotionRuntime.astro` genau einmal pro Seite ausgeliefert wird.

Zwei Stellen durften dabei nicht einfach „später laufen", weil sie das Layout anfassen:

- **TextReveal** zerlegt den Text jetzt im **Build** (`utils/text/split-text-units.js`), nicht
  mehr im Browser. Nach dem ersten Paint umzubrechen ist genau die CLS-Quelle, die diese
  Komponente mobil schon einmal hatte (0,29 am 08.07.2026).
- **StaggerGroup** bekommt Vorzustand und Staffelung aus `tokens-base.css` (`nth-child`-Leiter
  bis 24, Zeitwerte als Custom Properties am Wurzelelement). Ein nachträglich per JS
  gesetzter `opacity: 0` hätte die Kinder erst sichtbar und dann wieder unsichtbar gemacht.

Beide neuen Vorzustände liegen hinter `@media (scripting: enabled)` — ohne das bliebe der
Text ohne JavaScript dauerhaft unsichtbar (Defekt D1, der auf blitzsicht.com schon einmal
14 Elemente verschwinden liess).

Nebenbei fallen die duplizierten Inline-Scripts weg: `examples/motion` liefert statt 13
Script-Tags noch 6 aus, das HTML schrumpft von 31 214 auf 22 669 Bytes (−27 %), ohne einen
einzigen zusätzlichen Request.

**Zwei Guards, damit diese Fehlerklasse nicht zurückkommt:**

1. **Render-Entropy-Guard** (`ai-discovery`, `astro:config:done`) — findet Zufallsaufrufe im
   Build-Pfad jeder `.astro`-Quelle und zeigt auf die Zeile. `<script>`/`<style>`-Blöcke und
   Kommentare fallen vorher raus: Zufall im Browser ist in Ordnung, und die Kommentare der
   reparierten Komponenten nennen `Math.random()` wörtlich. **Default strict**
   (`strictRenderEntropy`), gedeckt durch eine Messung über die committeten Quellen aller
   25 Repos: **371 `.astro`-Dateien, 4 Befunde, alle vier der echte Bug, 0 Falsch-Positive.**
2. **Doppel-Build-Nachweis** (`scripts/verify-reproducible-build.mjs`) — baut zweimal und
   vergleicht Byte für Byte, meldet Datei, Zeile und Spalte. Sieht auch, was der Quell-Guard
   nicht sieht (Zufall in einem importierten Modul, in einer Abhängigkeit, ein Zeitstempel).
   Läuft als `pnpm verify:reproducible` gegen `examples/` und als neuer Schritt in
   `templates/.github/workflows/build-check.yml` in jedem Kunden-Repo.

Bewusst `astro build` statt `pnpm build`: blitzsichts `prebuild` holt Live-Daten (Plausible,
PSI, Audit-Statistiken) — zweimal `pnpm build` wäre dort strukturell rot, und ein Guard, der
bei einem Kunden immer rot ist, wird abgeschaltet.

Datumsfunktionen sind bewusst kein Befund (`new Date()` steht an sieben Stellen berechtigt:
Copyright-Jahr, `datePosted`, Sitemap-`lastmod`). Dass sich das HTML dadurch täglich ändert,
ist derselbe Cache-Effekt aus anderer Ursache und ein eigenes Thema.

Tests: 394 → 444 (18 für die Build-Zerlegung, 19 für den Quell-Guard, 13 für den
Baum-Vergleich, inklusive Gegenproben, die den Bug wieder einsetzen und rot werden müssen).

## v0.106.0 (2026-08-11)

- [kunde] Neue Prüfung beim Bauen der Website: Bilddateien, deren Dateiendung nicht zum
  tatsächlichen Inhalt passt, werden jetzt gemeldet statt still mitgeschleppt. Solche
  Dateien entstehen durch fehlgeschlagene Downloads und sind entweder unnötig groß oder
  gar keine Bilder.

**Feature:** Magic-Byte-Guard für Quell-Assets — die Endung lügt, und `dist/` verdeckt es

Zwei Kunden, ein Fehlertyp: **die Dateiendung lügt über den Inhalt.**

| Kunde | Datei | Endung sagt | Inhalt ist |
|---|---|---|---|
| gottl-richter-gomeier | `public/images/badges/rics.png` | PNG | HTML (Bot-Schutz-Seite), 212 B |
| gottl-richter-gomeier | `public/images/badges/rics.svg` | SVG | HTML, 2146 B |
| steller-sanierungen | `src/assets/images/hero/hero.webp` | WebP | **PNG, 1024×1024, 1257 KB** |

Der Anlass ist nicht die Datei, sondern dass der Befund **still verschwunden ist**. Bis
v0.101.1 meldete exiftool über den Geotag-Guard noch `hero…webp: Not a valid WEBP (looks
more like a PNG)`. Seit v0.101.2 (`fallbackFormat="webp"`) sind die dist-Derivate echte
WebP — der Geotag-Check sieht nur `dist/`, dort ist alles in Ordnung, und die falsch
benannte Quelle wurde unsichtbar. steller wanderte in der Fleet-Basiszahl von „5 Bilder
über Budget + Formatwarnung" auf „sauber", ohne dass jemand die Datei angefasst hatte.
Der Fix von v0.101.2 war richtig; er hat den Befund nur zugedeckt statt gelöst.

Ein Guard, der nur das Ergebnis prüft, kann eine kaputte Quelle nicht sehen, sobald die
Pipeline sie glattbügelt.

Neu ist `lintSourceAssetFormat(dirs)` im `astro:config:done`-Hook (dort, wo auch
Brand-Name-, Impressum- und Shape-Guard sitzen — nur dieser Hook kennt die
Quellverzeichnisse). Geprüft werden `publicDir` und `srcDir/assets`, jede Datei mit
eindeutig zuordenbarer Bild-Endung, gegen ihre Magic Bytes. Gemeldet wird auch **„gar kein
Bild"** — gottls Fall war HTML, nicht bloß eine Format-Verwechslung.

**Geltungsbereich bewusst eng.** Über die Fleet gemessen liegen im ganzen Repo 1377
Bilddateien, in `public/` + `src/assets/` aber nur 524. Der Rest sind Foto-Master,
Website-Archive, QA-Screenshots und Marketing-Exporte, die nie beim Besucher ankommen.
Bilder unter `src/` außerhalb `src/assets/`: keine. Der enge Schnitt verliert nichts.

**Default strict** (`strictAssetFormat`, Opt-out `false`). Gedeckt durch eine Messung über
die **committeten** Blobs aller Kunden-Repos (`git show origin/main:<pfad>` — nicht über
die Arbeitskopien, die teils Commits zurück und teils schon repariert sind):

| Umfang | Assets | Befunde |
|---|---:|---:|
| 20 Kunden-Repos, `public/` + `src/assets/` | **524** | **1** |

Der eine Befund ist stellers `hero.webp`. **Null Falsch-Positive** — und die Null ist
erarbeitet: ein naiver Text-Sniff („beginnt mit `<?xml` oder `<svg`") meldete zuerst vier
gültige SVGs, weil zinks Logos mit einem mehrzeiligen `<!-- … -->`-Kommentar über die
Illustrator-Herkunft beginnen. `sniffImageFormat` streift deshalb BOM, Whitespace,
Processing Instructions, Kommentare und DOCTYPE ab, bevor es das erste Tag liest.

**Fix:** `optimize-images` deckt eine falsch benannte Datei nicht mehr zu

Derselbe Fehler saß eine Stufe früher in der Pipeline. `optimize-images.mjs` läuft im
`prebuild` über `public/`; `isWebP` kam aus der **Endung**, sharp liest aber den
**Inhalt**. Ein falsch benanntes PNG über 5 KB erfüllte damit `shouldRewriteWebp` und
wurde still in ein echtes WebP umgeschrieben — bevor irgendein Guard es sehen konnte. Auf
Vercel passiert das bei jedem Build neu, die committete Datei bleibt für immer falsch,
und niemand erfährt davon.

Gegenprobe an derselben Datei, beide Fassungen:

```
v0.105.0   ✅ luegner.webp → .webp  1.2MB → 35KB  -97%     (Lüge still repariert)
v0.106.0   ⚠️  luegner.webp — Endung sagt WEBP, Inhalt ist PNG — nicht angefasst
```

Neu ist `formatMismatch(ext, metaFormat)` (rein, ohne sharp testbar). Bei Abweichung wird
die Datei nicht angefasst und laut gemeldet; den Build bricht dann der Guard ab — eine
Meldestelle, nicht zwei. `meta.format` ist bereits geladen, es kostet keine zusätzliche I/O.

Die Endung→Format-Tabelle liegt geteilt in `src/utils/image-format.js`, damit Pipeline und
Guard nicht auseinanderlaufen (Twin-Divergenz-Guard, wie `copyright.js`).

**Gegenbeweis** (ein Check, der nie rot werden kann, ist kein Nachweis): im echten
steller-Build das PNG unter dem Namen `hero.webp` zurückgeschrieben → Build bricht mit
exit 1 ab und nennt Pfad, Format und Größe. Mit der reparierten Datei → exit 0 und
`Asset-Format: ✓ 16 Quell-Assets`. Fehlen beide Quellverzeichnisse oder findet sich keine
einzige Bilddatei, meldet der Guard **NICHT GEPRÜFT** ohne ✓ — eine leere Menge darf nicht
wie eine geprüfte aussehen.

Guard-Zahl im Fleet-Scan steigt 19 → 20 (hausamlago 17 → 18).

21 neue Tests, Gesamtsuite 394 (vorher 373).

Closes: siluri/blitzsicht-ops#651

---

## v0.105.0 (2026-08-11)

**Feature:** Stray-Brace-Guard — Template-Klammern, die als Text auf der Seite landen

Der Astro-Compiler (2.13.1) beendet einen Template-Ausdruck zu früh, wenn ein Regex-Literal
darin **Anführungszeichen in der Zeichenklasse** trägt. Die schließende Klammer wird dann
als Text ausgegeben. Am Compiler direkt gemessen, mit Negativkontrollen:

```
{v.split(',')[0].replace(/['"]/g, '')}   →  <span>${…}</span>}</span>   DEFEKT
{v.split(',')[0].replace(/[xy]/g, '')}   →  <span>${…}</span>           ok
{v.split(',')[0].replaceAll("'", '')}    →  <span>${…}</span>           ok
{v.split(',')[0]}                        →  <span>${…}</span>           ok
```

Es liegt nicht am Regex, sondern an den Quotes darin. In `customer-blitzsicht` rendered
dadurch jedes Schriftmuster der Brand-Guide-Seiten monatelang „Work Sans}",
„Inter Variable}" — kundensichtbar, auf einer Seite, die wir Kunden als Ergebnis zeigen,
und **keiner der 18 Guards schlug an**. Genau diese Lücke schließt der neue Check: nicht
den einen Regex-Fall, sondern die allgemeine Form — Zeichen, die der Parser als Text
ausgibt, obwohl sie Syntax sein sollten.

Neu ist `lintPageStrayBraces(htmlPath, distDir)`, aufgebaut wie `lintPageImgAlt`: pure
Funktion, Regex statt DOM, pro Seite über die `index.html` aus `walkHtml`.

**Gemeldet wird nur eine verwaiste Klammer** — eine, die im selben Textknoten kein
Gegenstück hat. `'{ "a": 1 }'` ist Prosa und geht durch, `' Work Sans}'` ist ein Artefakt.
Reihenfolge zählt: `}{` ist zweimal verwaist, nicht ausgeglichen.

Ausgenommen sind `<script>`, `<style>`, `<pre>` und `<code>`. Die ersten beiden sind kein
Text; in Code-Beispielen sind unbalancierte Klammern richtig (`if (x) {`). Code-Blöcke gibt
es auf 17 der 22 Sites — heute noch ohne Klammern, aber ein technischer Blogpost hätte den
Guard sonst zu Recht ausgelöst.

**Default strict** (`strictStrayBraces`, Opt-out `false`). Ungewöhnlich für einen neuen
Guard, hier aber gedeckt: der Fehler schreibt sichtbaren Müll auf die Kundenseite, und eine
Log-Warnung hat ihn nachweislich nicht verhindert — er stand monatelang live.

Messung vor dem Release über die dist-Verzeichnisse aller 22 vorhandenen Kunden-Repos
(11.08.2026), **344 Seiten**:

| Umfang | Treffer |
|---|---:|
| alle `*.html` | 440 — unbrauchbar |
| nur `index.html` (= was `walkHtml` liefert) | **4**, und alle vier sind der echte Bug |

Die 436 Falsch-Positiven steckten ausnahmslos in zwei statischen Dateien aus `public/`, die
nie durch Astros Parser liefen (ein Handbuch mit Code-Beispielen, eine Mail-Vorlage). Über
`index.html` gemessen: null Falsch-Positive.

Gegenprobe in beide Richtungen gefahren, weil ein Check, der nie rot wird, nichts belegt:
gegen den Stand *vor* dem Kunden-Fix 4 Befunde, gegen die reparierten Live-Seiten 0. Dazu
ein Integrationstest — der alte Ausdruck testweise zurückgeschrieben bricht den Build mit
exit 1 ab.

Tests: 10 Fälle in `stray-brace-linter.test.js`, darunter der wörtliche Bug-Ausschnitt,
beide Spiegelfälle (`{` und `}`), Code-Blöcke, JSON-LD und HTML-Entities.

**Migrations-Hinweis:** Keiner für die aktuelle Fleet — alle zwölf Live-Kunden bauen mit
diesem Guard grün. Die Guard-Zahl im Scan steigt von **18 auf 19** (`hausamlago` 16 → 17);
wer gegen die alte Zahl prüft, muss sie nachziehen, sonst liest sich „nicht gelaufen" wie
„sauber".

---

## v0.104.0 (2026-08-11)

**Fix:** Brand-Name-Linter prüft FAQs am Quelltext statt am Wert — er traf bisher nur einwortige Marken

Der Guard verbot den Markennamen in `siteData.faqs[].q/.a` und verglich dafür den
**ausgewerteten** Wert. Das hatte zwei Folgen, die beide erst der Fleet-Scan sichtbar machte:

1. **Die Regel war nicht erfüllbar.** `` `Was ist ${BRAND}?` `` und `'Was ist Blitzsicht?'`
   ergeben zur Laufzeit denselben String. Die rename-sichere Variante wurde also genauso
   gemeldet wie die hartkodierte — es gab keinen Weg, den Befund loszuwerden, außer den
   Namen ganz zu streichen.
2. **Sie traf ungleich.** Gemessen am 11.08.2026: `zink` (`name: "Zink Bäckerei &
   Konditorei"`) stand bei 0 Befunden, obwohl seine FAQ „Wie viele Filialen hat Zink?"
   lautet — der volle Name steht dort nie wörtlich. `blitzsicht` (`name: "Blitzsicht"`)
   bekam 7 Befunde für exakt denselben Stil. Gemessen wurde die Länge des Namens, nicht
   die Rename-Kosten.

Fachlich kommt dazu, dass in einer FAQ der Markenname hingehört: „Was ist <Marke>?" /
„<Marke> ist ein …" ist die Entitäts-Definition, an der AI Overviews, ChatGPT und
Perplexity die Marke festmachen. Ausgerechnet dort den Namen zu verbieten, arbeitet gegen
den Zweck der Seite.

Neu ist `lintBrandNameInFaqSource(siteDataPath, brandName)` — dieselbe Quelltext-Technik,
die `lintBrandNameInSeoSource` seit v0.100.0 für den `seo`-Block nutzt (#647). Interpolation
geht durch, ein ausgeschriebenes Literal bleibt ein Befund, mit Datei und Zeilennummer:

```
[brand-name] site-data.ts:514 (faqs.q): 1× — "Blitzsicht" steht 1× ausgeschrieben in den FAQs
```

`description`, `tagline` und `leistungen` bleiben unverändert Wert-Checks — dort ist
„generisch formulieren" weiterhin die richtige Antwort, der Name gehört schlicht nicht hinein.

Nebenbei generalisiert: `extractSeoBlock` → `extractBlock(source, key, '{' | '[')`, damit
auch Array-Blöcke wie `faqs: [ … ]` sauber abgegrenzt werden. Die Zeilen-Scan-Logik liegt
jetzt einmal in `countBrandLiteralsInLine` statt zweimal.

Tests: 37 Fälle in `brand-name-linter.test.js` (vorher 30). Enthalten sind die Gegenprobe
(hartkodierte FAQ **muss** flaggen, sonst wäre „grün" nur Abwesenheit) und ein Fall, der
ein- und mehrwortige Marken nebeneinander stellt und gleiche Behandlung festnagelt.

**Migrations-Hinweis:** Keiner. Der Guard meldet ab jetzt weniger, nie mehr. Kunden, die
den Markennamen in FAQs hartkodiert haben, sehen denselben Befund wie zuvor — nur mit
Zeilennummer und dem ausführbaren Hinweis, auf `${BRAND}` umzustellen statt zu streichen.

---

## v0.103.1 (2026-08-11)

**Fix:** Schema-Linter kennt Top-Level-Arrays — `/karriere/` war nie kaputt

Ein JSON-LD-Block darf laut Spec ein einzelnes Objekt **oder ein Array von Objekten**
sein; Google unterstützt beide Formen. Bei der Array-Form trägt jedes Element `@context`
und `@type`, der Wurzelknoten selbst hat keine. Der Linter las die Pflichtfelder aber am
Wurzelknoten — auf einem Array ist `root['@context']` immer `undefined`, also feuerten
`missing_context` **und** `missing_type` auf einem völlig korrekten Block.

Betroffen war jede Seite, die mehrere Items in einem Block ausliefert. `StellenListe.astro`
tut genau das: digital-direkts `/karriere/` meldete zwei Befunde für zwei einwandfreie
`JobPosting`s. Fleet-Trockenlauf über alle vorhandenen `dist/`: **36 Falschmeldungen auf
2 Kunden** (digital-direkt 2, gympanzen 34 auf allen 17 Seiten). Der Fix nimmt ausschließlich
weg — kein Kunde bekommt dadurch einen neuen Befund.

**Zweite Lücke im selben Zug:** `collectIds` stieg auf Top-Level-Arrays gar nicht ein
(`o['@id']` und `o['@graph']` sind auf einem Array `undefined`). Die Duplikat-Erkennung —
der Kern-Check dieses Linters, der mikas doppelte `@id` gefunden hat (#643) — war auf
Array-Blöcken blind. Sie greift jetzt auch dort.

Befunde in Arrays nennen ab sofort den Element-Index (`#4[1]` statt `#4`), sonst ist die
Stelle in einem Block mit N Items nicht auffindbar.

**Warum das so lange durchkam:** `lintPageSchema` war als einziger Linter der Datei weder
exportiert noch getestet — alle Geschwister (`lintPageMeta`, `lintPageImgAlt`,
`lintBrandNameInSiteData` …) sind beides. Beides ist jetzt nachgezogen:
`tests/ai-discovery/schema-linter.test.js` mit 12 Fällen, darunter der Gegenbeweis, dass
ein echt fehlendes `@context` weiterhin rot wird. Gegen den alten Code fallen genau die
vier Array-Fälle um, die acht übrigen bleiben grün.

**Migrations-Hinweis:** Keiner. Der Linter warnt beim Build, er verändert kein Markup.

---

## v0.103.0 (2026-08-11)

**Feature:** Brand-Name-Linter prüft den `seo`-Block — die Felder, die wirklich ausgeliefert werden

Der Guard prüfte `description`, `tagline`, `faqs[]` und `leistungen[]`. Die `<meta
description>` einer Seite kommt aber aus `seo.defaultDescription`; `siteData.description`
speist nur `llms.txt`. Er prüfte also das Feld mit der kleineren Reichweite und ließ das
mit der größeren aus. Fleet-Scan vom 10.08.2026: **31 ausgeschriebene Marken-Literale in
14 von 20 Repos** — darunter donau-profi und platzfrei, die als „0 Befunde" geführt wurden.
„Sauber" hieß nicht rename-sicher.

**Zwei Checks, weil die Zielzustände verschieden sind.** Bei Prosa lautet die Regel „Marke
kommt nicht vor". Im `seo`-Block gilt das Gegenteil — die Marke *gehört* in den Title.
Verboten ist nur ihr zweites Original:

| Befund | Bedingung | Handlung |
|---|---|---|
| `redundant_title_template` | `seo.titleTemplate` ist byte-gleich mit `%s \| ${name}` | Feld löschen |
| `seo_literal` | Marke steht ausgeschrieben im `seo`-Block der Quelldatei | interpolieren |

`BaseLayout.astro:212` leitet `%s | ${siteName}` seit jeher selbst ab, wenn `titleTemplate`
fehlt. 10 der 20 Repos wiederholen es trotzdem wörtlich — dort ist das Feld reine
Duplikation und kann ersatzlos weg, der Output bleibt identisch. Abweichende Templates
(`%s · Marke`, Kurzformen wie `%s | GRG`) sind erlaubt und werden nicht gemeldet.

**Warum `lintBrandNameInSeoSource` den Quelltext liest und nicht das Objekt:** `` `… ${BRAND}` ``
und `'… Marke'` sind zur Laufzeit derselbe String. Ein Guard auf dem Wert könnte das
Zielmuster nicht vom Fehler unterscheiden — er würde die Interpolation mitflaggen und wäre
unerfüllbar, denn die Marke muss im Title stehen. Der Check liest deshalb
`src/data/site-data.ts`, grenzt den `seo`-Block über Klammer-Matching ein und ignoriert
Kommentare wie `${…}`-Interpolationen. Fehlt die Datei oder gehen die Klammern nicht auf,
meldet er nichts, statt auf einer falschen Region zu urteilen.

**Bekannte Grenze, bewusst offen:** Umschreibungen entgehen jedem Literal-Guard. zinks Name
ist „Zink Bäckerei & Konditorei", sein Template `%s | Bäckerei Zink`; gottl kürzt auf `GRG`,
digital-direkt auf `DD`. Alle drei kosten bei einer Umbenennung Handarbeit und bleiben still.
Bei 0 Befunden ist der `seo`-Block deshalb weiterhin manuell durchzusehen — dokumentiert in
`docs/brand-name-convention.md`.

Dieselbe Doku behauptete bis hierher, Seiten-Titles seien „generiert aus `siteData.name`,
kein Literal im Source". Das war in 14 Repos falsch und ist korrigiert.

`src/templates/site-data.template.ts` war die Quelle der flottenweiten Verbreitung
(`titleTemplate: '%s | TODO: Firmenname'`). Das Template zeigt Neukunden jetzt das
`const BRAND`-Muster und lässt `titleTemplate` weg.

Trockenlauf gegen die echten `site-data.ts` der Live-Fleet: **17 neue Befunde bei 8 von 13
Kunden**, keine Doppelmeldung. 13 neue Tests, 3 davon gegengeprobt rot gegen den ungefixten
Stand; Suite 344/344.

**Migrations-Hinweis:** Keiner — Soft-Warn wie alle Guards. Der Aufwand kommt erst mit
`--strict-warnings` (blitzsicht-ops#646).

Issue: siluri/blitzsicht-ops#647

---

## v0.102.1 (2026-08-10)

**Fix:** Meta-Linter zählte HTML-Entities als Escape-Sequenz statt als Zeichen

`zink-baeckerei` stand mit „`/festival/` Title 61 Zeichen > 60" im Fleet-Report. Der Title
lautet „Festival — Bäckerstand für Feste & Events | Bäckerei Zink" und ist **57** Zeichen
lang. Die vier Zeichen Differenz sind das `&`, das Astro als `&amp;` ins HTML schreibt:
`extractTitle` maß den rohen HTML-Text, `extractDescription` direkt daneben dekodierte
ausdrücklich vor dem Längen-Check. Google zählt das dargestellte Zeichen — der Guard war
der Fehler, nicht die Copy.

Zweite Lücke im selben Zug: die alte Dekodier-Tabelle kannte nur `&amp;`. Astro schreibt
denselben `&` im `content`-Attribut aber als **`&#38;`** — fleet-weit 62 Descriptions, die
bisher jeweils 4 Zeichen zu lang gemessen wurden. Heute riss keine davon die 160er-Grenze,
die Falle stand aber scharf.

| | vorher | nachher |
|---|---|---|
| `<title>` | roh gezählt | Entities dekodiert |
| `<meta description>` | `&amp;` + 4 Named-Entities | alle Named- **und** numerischen Entities |

Die Dekodierung läuft in **einem** Durchgang, damit `&amp;lt;` zu `&lt;` wird und nicht zu
`<` weiterzerfällt. Unbekannte Named-Entities (`&copy;`) und ungültige Code-Points
(`&#1114112;`) bleiben als Literal stehen, statt still zu verschwinden oder zu werfen.

Fleet-Scan über alle gebauten `dist/`: 46 Titles in 9 Repos tragen Entities. Genau einer
kippte über die Grenze — zinks `/festival/`. Sein Befund fällt damit ersatzlos weg, ohne
dass eine Zeile Copy angefasst wurde.

11 neue Tests (`tests/ai-discovery/meta-linter.test.js`), 4 davon gegengeprobt rot gegen den
ungefixten Stand. `lintPageMeta` ist dafür exportiert, wie `lintPageImgAlt` es schon war.

**Migrations-Hinweis:** Keiner. Reiner Build-time-Guard, kein Output-Unterschied.

Issue: siluri/blitzsicht-ops#644

---

## v0.102.0 (2026-08-10)

- [kunde:sichtbar] Vier Stellen auf der Website waren für Menschen mit eingeschränktem Sehvermögen schwer zu lesen: helle Schrift auf farbigem Grund war zu blass. Sie ist jetzt voll deckend. Außerdem sind Links im Datenschutz-Text unterstrichen, damit sie nicht allein an der Farbe erkennbar sind.

**Fix:** Vier A11y-Befunde, die beim Fix in v0.101.0/.1 übersehen wurden

Der Lauf, der v0.101.0 ausgelöst hat, prüfte nur die Startseite und zwei Unterseiten.
Nachdem die pa11y-Konfiguration bei Zink am 10.08. auf alle zwölf gebauten Seiten
erweitert wurde, tauchte dieselbe Ursache an vier weiteren Stellen auf — teils in
Komponenten, die vorher nie im Prüfumfang standen. Es ist **Bestand, kein Rückschritt**.

Alle Werte an Zinks `--color-primary` (`#d90570`) gemessen:

| Komponente | Stelle | vorher | nachher |
|---|---|---|---|
| `KarriereHero` | `.hero-badge` (Weißschleier `rgba(255,255,255,.1)`) | 3.95:1 | 6.49:1 |
| `KarriereHero` | `.hero-sub` (Deckkraft 0.8) | 3.52:1 | 4.99:1 |
| `DankePage` | `.danke-message` (Deckkraft 0.65) | **2.68:1** | 4.99:1 |
| `ContactForm` | Honeypot ohne zugänglichen Namen | — | — |
| `InformationspflichtBlock` | Links nur farblich unterschieden | — | — |

`KarriereHero` bekommt exakt die Behandlung, die `Hero.astro` in v0.101.0/.1 erhalten hat:
abdunkelnder statt aufhellender Schleier beim Badge, volle Deckkraft beim Subtext. Die
Komponente war damals schlicht nicht mitgeprüft worden.

`DankePage` ist der schwerwiegendste Einzelbefund — mit 2.68:1 der schlechteste Wert im
gesamten Bestand. Anders als bei `Hero` und `CTABlock` liegt dort eine **Volltonfläche**
statt eines Verlaufs, weshalb der Fix auch in der pa11y-Zahl sichtbar wird.

Beim `ContactForm`-Honeypot fehlte `aria-hidden`, das das `url_honey`-Feld direkt daneben
längst trägt. Ohne das stand ein Formularfeld ohne Label im A11y-Baum und erzeugte je eine
Meldung von axe und htmlcs. **Die Spam-Abwehr ist unverändert** — `botcheck` wird in
`handle-submission.js` und `contact-handler.js` weiterhin gelesen, `tabindex="-1"` hält das
Feld unfokussierbar.

Gegenprobe an Zink, identischer Build, nur die cw-core-Version unterschiedlich:

| Seite | vorher | nachher |
|---|---:|---:|
| `/danke` | 1 | **0** |
| `/kontakt` | 2 | **0** |
| `/datenschutz` | 4 | **0** |
| `/karriere` | 3 | 3 — siehe unten |
| Gesamt (12 Seiten) | 38 | 31 |

**Warum `/karriere` bei 3 bleibt, obwohl der Fix greift:** Der Block liegt auf einem
`linear-gradient`. Dort kann axe die Hintergrundfarbe an der Textposition nicht bestimmen
und meldet konservativ weiter — unabhängig davon, welche Textfarbe darauf steht. Derselbe
Effekt betrifft `Hero` und `CTABlock` und ist seit v0.101.0 dokumentiert. Der
Kontrastgewinn ist real, er ist nur rechnerisch zu belegen und nicht durch Zählen von
Meldungen. Wer an diesen Stellen „grün" will, muss den Verlauf antasten, nicht die Schrift.

322/322 Tests grün.

**Migrations-Hinweis:** Keiner, der Bump genügt. Sichtbar ändert sich das Erscheinungsbild
an drei Stellen: Karriere-Hero (Badge dunkler hinterlegt, Subtext heller), Danke-Seite
(Fließtext heller), Datenschutz (Links unterstrichen).

---

## v0.101.3 (2026-08-10)

- [kunde] Keine Auswirkung auf die Website. Eine interne Prüfung meldete bisher einen Fehler, wo keiner war — sie hätte irgendwann grundlos den Veröffentlichungs-Vorgang blockiert.

**Fix:** Brand-Name-Linter schlug bei Marken innerhalb eines Kompositums fehl

Der Zähler lief auf reinem `indexOf`, ohne Wortgrenze. Damit traf jede Marke an, die
Teil eines längeren deutschen Wortes ist. Konkret bei hausamlago: Marke `Haus am Lago`,
Prosa „Privates Ferien**haus am Lago** di Ledro" → gemeldet als vermeidbares Literal.

Entscheidend ist die Rename-Probe, auf der die Konvention beruht: eine Umbenennung
müsste diesen Satz nicht anfassen — also ist er kein Literal. Der Kunde stand allein
wegen dieser Kollision rot, an seinem Text war nichts falsch.

Gemessen am Fleet-Scan vom 10.08.2026, echte Kundendaten, nur die Guard-Version
unterschiedlich:

| Kunde | vorher | nachher | Text unverändert? |
|---|---|---|---|
| hausamlago `description` | 1 Befund | ✓ 0 | ja — keine Copy-Änderung |
| steller/soleno/mika `description` | je 1 Befund | je 1 Befund | echte Literale, bleiben gemeldet |
| 6× `robots.txt`-Kommentar | je 1 Befund | je 1 Befund | echte Literale, bleiben gemeldet |

Die Grenzprüfung (`isStandaloneMatch`) nutzt Unicode-Wortzeichen `/[\p{L}\p{N}_]/u` und
**nicht** `\b`/`\w` — die sind in JS ASCII-only. Für `\b` ist „ä" kein Wortzeichen, es
läge also mitten in `Sachverständigenbüro` eine Wortgrenze, und die Prüfung würde genau
bei den Marken versagen, für die sie gedacht ist. Ein Test hält das fest.

Trennzeichen bleiben Grenzen: `Soleno GmbH-Team` zählt weiter als Literal.

Geändert: beide Zählstellen in `ai-discovery/index.ts` (`countOccurrences` für
siteData-Prosa, `lintBrandNameInRobotsTxt` für das statische Asset). Der bestehende
URL-Strip bleibt unberührt. 6 neue Tests, davon 2 Negativ-Tests gegen den echten Bug
(gegengeprobt: gegen den ungefixten Stand sind genau diese 2 rot). 322/322 grün.

**Migrations-Hinweis:** Keiner, der Bump genügt. Die Änderung kann nur Warnungen
entfernen, keine hinzufügen.

**Bekannte Lücke, nicht Teil dieses Fixes:** der Linter prüft `description`, `tagline`,
`faqs[]` und `leistungen[]` — aber nicht `seo.defaultTitle`, `seo.defaultDescription`,
`seo.titleTemplate`, `seo.schemaDescription`. Dort liegen bei 14 von 20 Repos Literale,
auch bei Kunden, die heute als sauber gelten. „0 Befunde" heißt damit noch nicht
rename-safe. Separat erfasst.

Siehe blitzsicht-ops#642, `docs/brand-name-convention.md`.

---

## v0.101.2 (2026-08-10)

- [kunde] Beim Veröffentlichen wurden für das Titelbild bisher zusätzlich unkomprimierte Kopien angelegt, die kein Browser je abgerufen hat — teils fast 2 MB pro Stück. Sie entfallen.

**Fix:** `<Picture>` ohne `fallbackFormat` erzeugte PNG-Fallbacks bis 1,9 MB

`formats={['avif','webp']}` steuert nur die `<source>`-Einträge. Das `<img>`-Fallback,
das Astro daneben erzeugt, lief ohne `fallbackFormat` in den Default — PNG,
unkomprimiert. Aus einer 144-KB-WebP-Quelle wurde so ein 1900-KB-PNG.

Gemessen am 10.08.2026 beim Fleet-Scan gegen v0.101.1: fünf Kunden rissen das
200-KB-Bildbudget mit zusammen 18 Dateien, obwohl ihre Quelldateien zwischen 104 und
160 KB liegen. Die Ursache lag nicht bei den Kunden, sondern hier.

Paar-Messung an zink-baeckerei, gleicher Worktree, nur die Prop unterschiedlich:

| | PNG-Derivate | WebP | AVIF | Perf-Budget-Guard |
|---|---|---|---|---|
| ohne `fallbackFormat` | 4 (bis 1902 KB) | 5 | 4 | 4 Befunde |
| mit `fallbackFormat="webp"` | 0 | 4 | 4 | ✓ alle ≤ 200 KB |

Das Bild wird unverändert ausgeliefert, nur das Fallback ist jetzt WebP statt PNG.

Geändert: `Hero.astro` an beiden `<Picture>`-Stellen (Parallax- und Standard-Variante).
Weitere `<Picture>`-Aufrufe gibt es in cw-core nicht.

**Migrations-Hinweis:** Keiner, der Bump genügt. Einzige Verhaltensänderung: Browser
ohne WebP-Unterstützung (Safari < 14, IE) bekommen kein Hero-Bild mehr statt eines
PNG. WebP wird seit 2020 von allen aktuellen Browsern unterstützt.

Siehe blitzsicht-ops#641, Basiszahl in
`customer-websites/docs/fleet-guard-basiszahl-v0.101.1-2026-08-10.md`.

---

## v0.101.1 (2026-08-10)

- [kunde:sichtbar] Die kurzen Stichpunkte unter der Hauptüberschrift (etwa „Seit 1898 in Familienhand") waren ebenfalls leicht durchscheinend und stehen jetzt in vollem Weiß.

**Fix:** Dritte Stelle mit demselben Deckkraft-Befund — `.hero-usp-item`

Nachtrag zu v0.101.0. Dort waren `.hero-sub`, `.hero-badge` und `.cta-inner p`
erledigt, `.hero-usp-item` aber uebersehen — dieselbe Ursache, dieselbe Zahl:
`rgba(255,255,255,0.8)` ergibt auf Magenta 3.52:1, voll deckend 4.99:1. Bei 0.9rem
Schriftgroesse gilt die strenge 4.5:1-Grenze.

Aufgefallen beim Bump in einem Customer-Repo: Nach der Installation von v0.101.0
fand ein `grep` nach `rgba(255,255,255,0.8)` in `Hero.astro` noch einen Treffer.
In `Hero.astro` und `CTABlock.astro` gibt es jetzt keinen mehr.

**Migrations-Hinweis:** Keiner, der Bump genuegt.

---

## v0.101.0 (2026-08-10)

- [kunde:sichtbar] Erklärtexte auf den farbigen Blöcken (Hero und der Kontakt-Block am Seitenende) waren leicht durchscheinend und dadurch schwer zu lesen. Sie stehen jetzt in vollem Weiß. Das kleine Etikett über der Hauptüberschrift hat einen dunkleren Hintergrund bekommen, damit die Schrift darauf deutlich absteht.

**Fix:** Weisse Schrift mit reduzierter Deckkraft riss auf farbigem Grund die AA-Grenze

`Hero` und `CTABlock` setzten ihren Subtext auf `rgba(255,255,255,0.8)`. Auf einer
Magenta-Flaeche ergibt das 3.52:1 — WCAG AA verlangt 4.5:1. Ohne Transparenz sind
es 4.99:1. Nachgerechnet am 10.08.2026 an Zink (`--color-primary: #d90570`).

Derselbe Mechanismus beim `.hero-badge`: Dessen Hintergrund war ein **Weiss**schleier
(`rgba(255,255,255,0.22)`), der den farbigen Grund aufhellt und damit den Kontrast
des weissen Textes *senkt* — 4.00:1. Der Schleier ist jetzt abdunkelnd
(`rgba(0,0,0,0.15)`), das ergibt 6.52:1.

Geaendert:

- `CTABlock.astro` — `.cta-inner p` auf `#ffffff`
- `Hero.astro` — `.hero-sub` auf `#ffffff`, `.hero-badge` Hintergrund auf `rgba(0,0,0,0.15)`

**Wichtige Einschraenkung, die dieser Fix NICHT loest:** Ob weisser Text auf
`--color-primary` besteht, haengt an der Markenfarbe des jeweiligen Kunden — und die
liegt im Customer-Repo, nicht hier. Nachgerechnet:

| `--color-primary` | weisser Text |
|---|---:|
| `#d90570` (Zink heute) | 4.99:1 — pass |
| `#E20680` | 4.59:1 — pass, ohne Puffer |
| `#ed0677` | 4.29:1 — **fail** |

Auf einer zu hellen Primaerfarbe reisst also auch reines Weiss. cw-core kann das
nicht abfangen, ohne die Textfarbe aus der Markenfarbe zu berechnen — das waere ein
deutlich groesserer Eingriff und ist bewusst nicht Teil dieses Release. Wer eine
helle Marke fuehrt, dunkelt die Flaechenvariante im eigenen `tokens.css` ab, so wie
Zink es mit `#ed0677` → `#d90570` gemacht hat.

**Nicht wundern: die axe-Fehlerzahl sinkt dadurch nicht.** `Hero` und `CTABlock`
liegen auf einem `linear-gradient`. Gegen Verlaeufe kann axe die tatsaechliche
Hintergrundfarbe an der Textposition nicht bestimmen und meldet den Block
konservativ als Kontrastfehler — unabhaengig davon, welche Textfarbe darauf steht.

Am 10.08.2026 gegengeprueft: Ersetzt man im `CTABlock` versuchsweise den Verlauf
durch `background: var(--color-primary)` und laesst *alles andere unveraendert*,
fallen die Meldungen sofort weg — auf drei Zink-Seiten je von 3 auf 0, auf der
Startseite von 15 auf 12. Der Verlauf ist also die Ursache der Meldung, nicht der
Text. Diese drei Meldungen pro Block sind ein Werkzeug-Artefakt.

Der Fix hier ist trotzdem real: 3.52:1 war rechnerisch zu wenig, egal was axe dazu
sagt. Nur taugt die Fehlerzahl des Werkzeugs an dieser Stelle nicht als Nachweis —
wer den Erfolg messen will, rechnet die Kontrastwerte, statt Meldungen zu zaehlen.

**Migrations-Hinweis:** Keiner, der Bump genuegt. Aber es ist eine sichtbare
Aenderung: Subtexte wirken kraeftiger, das Hero-Etikett dunkler statt aufgehellt.
Bei `[kunde:sichtbar]`-Releases gilt der erweiterte Canary-Check im Release-Train.

---

## v0.100.0 (2026-08-10)

- [kunde:sichtbar] Inhalte, die beim Scrollen eingeblendet werden, bleiben jetzt auch dann sichtbar, wenn im Browser JavaScript abgeschaltet ist. Vorher blieben diese Stellen der Seite in dem Fall dauerhaft leer.

**Fix:** Eingeblendete Inhalte waren ohne JavaScript unsichtbar (D1)

`[data-motion-reveal]` setzte `opacity: 0`, aufgehoben wurde das ausschließlich
durch die Klasse `.is-visible` — und die vergibt nur JavaScript
(`ScrollReveal.astro:62,69`, `StaggerGroup:67,74`, `TextReveal:102,106`).
Ohne JavaScript wurde der Vorzustand nie zurückgenommen. Gemessen am
ausgelieferten HTML: auf blitzsicht.com blieben 14 Elemente dauerhaft leer.
Betroffen war nur dieser eine Live-Kunde — alle anderen zwölf liefern keine
Reveals aus.

Der komplette Vorzustand liegt jetzt hinter `@media (scripting: enabled)`,
inklusive der fünf Transform-Varianten. Nur `opacity` zu kapseln wäre schlimmer
als nichts gewesen: die Elemente wären dann sichtbar, aber um 2 rem verschoben —
und nichts hätte sie je zurückgesetzt. Ein Browser, der `scripting` nicht kennt,
verwirft den ganzen Block; Reveals bleiben dann sichtbar. Das ist die richtige
Fehlerrichtung.

Nachgewiesen mit vier Läufen (repariert × JavaScript an/aus), jeweils unter
`prefers-reduced-motion: no-preference` — unter `reduce` macht die Regel in
dieser Datei Reveals ohnehin sichtbar, ein Lauf mit `reduce` wäre fälschlich
grün gewesen. Unrepariert und ohne JavaScript: 7 von 7 unsichtbar. Repariert:
0 von 7. Mit JavaScript in beiden Fassungen identisch.

**Tweak:** `will-change` wird zurückgenommen (D3)

`.is-visible` setzt jetzt `will-change: auto`. Bisher behielt jedes einmal
eingeblendete Element seinen Compositor-Layer bis zum Seitenwechsel, weil
nichts das `will-change` aus dem Vorzustand aufhob.

**Feature:** Motion-Consent-Guard — ausgeliefert, ohne bestellt zu sein

Neue Build-Zeit-Warnung in `ai-discovery`: meldet, wenn das gebaute `dist/`
einen Motion-Effekt ausliefert, den der Kunde weder importiert noch per Prop
angefordert hat.

Anlass: `PaketeSection` hat `tilt = true` als Voreinstellung und `Hero` rendert
`TiltCard` ungated ab zwei Bildern. digital-direkt.com liefert dadurch sechs
TiltCards aus, ohne `TiltCard` je zu importieren — und ohne dass es jemand
bemerkt hätte. Eine Suche nach Importen sieht das prinzipiell nicht, weil die
öffentliche Schnittstelle hier eine Prop ist und kein Import.

Als Zustimmung gilt beides: der direkte Import und die explizite Prop
(`motion={{ textReveal: true }}`, `tilt={true}`). Gemessen gegen drei echte
Builds: digital-direkt meldet die sechs TiltCards, blitzsicht bleibt bei
309 ausgelieferten Markern still, soleno hat keine.

Neue Optionen:

- `checkMotionConsent` — Default `true`, permanent Soft-Warn. Kein Strict-Flip:
  der Guard misst Absicht, und Absicht ist nichts, wofür ein Deploy bricht.
- `acknowledgedMotion` — Liste gewollter Effekte, akzeptiert Prop-Keys
  (`['tilt']`) wie Komponentennamen (`['TiltCard']`). Macht die Absicht
  sichtbar, statt den Guard stillzulegen.

Ein mehrdeutiger Marker wird nur gemeldet, wenn keiner seiner möglichen
Verursacher zugestimmt ist — `data-motion-reveal` setzen `ScrollReveal`,
`StaggerGroup` und `FullBleed` gleichermaßen, eine Warnung darüber wäre sonst
nicht auflösbar.

**Migrations-Hinweis:** Keiner. Wer die neue Warnung bei sich sieht, hat
entweder einen Effekt an, den er nicht bestellt hat (dann `tilt={false}`), oder
er will ihn (dann `acknowledgedMotion`). Der Build bricht in keinem Fall.

---

## v0.99.1 (2026-08-09)

- [kunde:sichtbar] Die Rückmeldung beim Antippen von Schaltflächen wirkt jetzt auf allen Buttons der Website, nicht nur auf einzelnen. Auf Mobilgeräten passierte beim Drücken bisher nichts Sichtbares.

**Fix:** Druckpunkt lag an der falschen Stelle

v0.99.0 hat den Druckpunkt in die Komponente `CTAPrimary` gelegt. Nachgemessen
am ausgelieferten HTML: **kein einziger Live-Kunde importiert diese
Komponente.** Alle nutzen die Utility-Klassen `.btn-accent` und `.btn-outline`
aus dieser Datei — die hatten `:hover`, aber kein `:active`.

Der Fix wandert damit dorthin, wo er ankommt. `.btn-accent` und `.btn-outline`
sinken jetzt beim Druecken unter ihre Ruhelage (70 ms rein, 200 ms raus) statt
lediglich den Hover-Versatz aufzuheben — was ohne Hover, also auf jedem
Telefon, exakt keine sichtbare Aenderung war.

`:not(:disabled)` verhindert, dass deaktivierte Schaltflaechen auf Druck
reagieren und damit Bedienbarkeit vortaeuschen.

Unter `prefers-reduced-motion` bleibt das Einsinken erhalten, die Stauchung
faellt weg und die Dauer kollabiert auf 0,01 ms: Bewegung aus, Antwort an.

**Migrations-Hinweis:** Keiner. Wer eigene Button-Klassen mitbringt, ist nicht
betroffen; die Tokens tragen Fallback-Werte.

---

## v0.99.0 (2026-08-09)

- [kunde:sichtbar] Schaltflächen reagieren jetzt spürbar auf Berührung: sie sinken beim Antippen kurz ein und federn zurück. Auf Mobilgeräten passierte dabei bisher gar nichts. Nach dem Absenden eines Formulars springt die Bestätigung sichtbar auf.

**Feature:** Interaktions-Rueckmeldung — Druckpunkt und Erfolgs-Quittung

Die bisherigen Motion-Dauern (0,25–1,1 s) beschreiben, wie etwas *auftaucht*.
Eine Antwort auf eine Eingabe braucht eine andere Groessenordnung: sie muss der
Eingabe folgen, nicht ihr hinterherlaufen. Dafuer gibt es jetzt eine eigene
Skala in `tokens-base.css`:

| Token | Wert | Zweck |
| --- | --- | --- |
| `--motion-press-in` | 70ms | Eingabe → gedrueckt |
| `--motion-press-out` | 200ms | losgelassen → Ruhelage |
| `--motion-press-offset` | 2px | Einsinktiefe |
| `--motion-press-scale` | 0.97 | Stauchung |
| `--motion-ack` | 420ms | Dauer der Erfolgs-Quittung |
| `--motion-ack-delay` | 90ms | Taktschlag davor |

Die Asymmetrie zwischen `in` und `out` ist der Kern. Gleiche Dauern in beide
Richtungen sind der Hauptgrund, warum Web-Oberflaechen sich zaeh anfuehlen,
waehrend dieselbe Bewegung in Software wertig wirkt. Der Taktschlag vor der
Quittung laesst die Rueckmeldung wie eine Antwort wirken statt wie einen Reflex.

**Fix:** `CTAPrimary` hatte auf Mobilgeraeten keinen Druckpunkt

Bisher stand dort `:hover { translateY(-1px) }` und `:active { translateY(0) }`.
Der Druckpunkt hob also nur den Hover-Versatz auf. Ohne Hover — also auf jedem
Telefon — ist der Ausgangswert bereits `0`: Druecken bewirkte exakt keine
sichtbare Aenderung, und zwar auf dem Kanal, ueber den die meisten Besucher
kommen. Der Knopf sinkt jetzt unter seine Ruhelage.

**Fix:** Erfolgsmeldung in `ContactForm` war fuer Screenreader stumm

Der Block trug weder `role="status"` noch `aria-live`. Das Formular verschwand,
ein Bestaetigungstext erschien — beides ohne Ansage; das Haekchen ist
`aria-hidden` (korrekt, es ist Dekoration), die Ueberschrift wurde nie
vorgelesen. Jetzt `role="status" aria-live="polite"`.

**Barrierefreiheit:** Unter `prefers-reduced-motion` faellt die *Bewegung* weg,
die *Antwort* bleibt. Dauern kollabieren auf 0,01 ms statt auf `none` — so
erreicht jede Animation ihren Endzustand. Ein hartes `animation: none` haette
das Haekchen auf seinem Startbild eingefroren, also unsichtbar gemacht.

**Migrations-Hinweis:** Keiner. Alle Tokens haben Fallback-Werte; wer
`tokens-base.css` nicht einbindet, bekommt dieselben Zahlen ueber `var(…, …)`.
Der Quittungs-Keyframe wohnt bewusst in der Komponente, damit die Sichtbarkeit
des Haekchens nicht daran haengt, ob die Token-Datei geladen wurde.

---

## v0.98.0 (2026-08-09)

**Feature:** `ContentPage` kann den Titel weglassen — `showTitle`

`ContentPage.astro` rendert den `title`-Prop hart als `<h1>`. Bringt die Seite im
Slot eine eigene `<h1>` mit, stehen zwei sichtbare Ueberschriften untereinander —
die erste mit der `border-bottom`-Linie des Layouts. Das ist keine reine
Semantik-Frage: es sieht aus wie ein Fehler, und Suchmaschinen bekommen zwei
konkurrierende Hauptueberschriften.

Am 08.08.2026 live an `baeckereizink.de/catering` gemessen:

```html
<h1 data-astro-cid-gohdapgh>Catering — Brotzeit, Torten &amp; Fingerfood</h1>
<h1 data-astro-cid-456pihg2>Catering aus der eigenen Backstube</h1>
```

Ueber alle 25 Customer-Repos nachgezaehlt sind vier betroffen, mit elf Seiten:
`customer-zink-baeckerei` (sortiment, catering, festival-catering),
`customer-donau-profi` und `customer-pferdesport-silberhorn` (je datenschutz,
impressum, danke — dort exakte Dubletten „Impressum" / „Impressum") sowie
`customer-mika-elektrotechnik` (ueber-uns, leistungen/[slug]).

Neuer Prop:

- `showTitle?: boolean` — Default `true`. Auf `false` rendert das Layout keine
  eigene `<h1>`, die Seite bringt ihre eigene im Slot mit.

```astro
<ContentPage {...landingBaseProps} title="Catering — Brotzeit, Torten & Fingerfood" showTitle={false}>
  <h1>Catering aus der eigenen Backstube</h1>
</ContentPage>
```

`title` bleibt Pflicht-Prop und wird weiter gebraucht: `BaseLayout` speist daraus
`<title>` und die SEO-Tags. Weggelassen wird nur die sichtbare Ueberschrift.

Das scoped CSS `.content-page h1` bleibt unveraendert. Astro scopt es auf die
`cid` des Layouts, die Slot-H1 der Seite wird davon ohnehin nicht getroffen —
deshalb bringen die betroffenen Seiten eigene `.head h1`-Regeln mit.

Gleiches Muster wie `showTitle` in `PaketeSection.astro`.

**Migrations-Hinweis:** Keiner. Default `true` haelt bestehendes Verhalten
unveraendert — ohne Opt-in aendert der Bump auf keiner Seite etwas. Die vier
betroffenen Repos brauchen zusaetzlich `showTitle={false}` an den jeweiligen
Seiten; der Bump allein behebt dort nichts.

---

## v0.97.3 (2026-08-08)

- [kunde:sichtbar] Kurze Textstellen in Schreibmaschinenschrift (Jahreszahlen, Domainnamen, technische Angaben) wurden auf Android- und Linux-Geräten in einer zufälligen Schriftart angezeigt, teils sogar in einer für asiatische Schriftzeichen gedachten. Sie nutzen jetzt überall dieselbe, festgelegte Schrift.

**Fix:** monospace-Stacks nannten nur Apple-Schriften

`CaseStudyBlock`, `FAQHonest`, `LocalProofMap` und `TechExcellence` fuehrten
`font-family: ui-monospace, monospace` bzw. `ui-monospace, 'SF Mono', Menlo,
monospace`. Ausserhalb der Apple-Welt existiert keiner dieser Namen, also
entscheidet das generische `monospace` — und was es liefert, ist nicht
festgelegt.

Am 08.08.2026 im Linux-Testrunner gemessen (`playwright:v1.52.0-jammy`), an
`span.report-domain` mit dem Text `blitzsicht.com`: Chrome loeste `monospace`
beim ersten Layout als **`WenQuanYi Zen Hei Mono`** auf — eine Schrift fuer
chinesische Zeichen — und nach einem Re-Layout als `Liberation Mono`. Damit
aenderte sich die Textbreite von 112 px auf 134 px, ohne dass sich am Inhalt
etwas geaendert haette.

Alle vier Stacks nutzen jetzt `var(--font-mono)`. Das Token kommt aus dem
Tailwind-v4-Default und fuehrt fuer jede Plattform konkrete Namen
(`ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono",
"Courier New", monospace`). Kunden, die eine eigene Schreibmaschinenschrift
setzen wollen, ueberschreiben `--font-mono` im `@theme` — vorher war das gar
nicht moeglich.

Nebenwirkung fuers Visual-Gate: die schwankende Textbreite war eine der beiden
Ursachen fuer wechselnde Bildmasse im woechentlichen A/B-Lauf.

**Keine Breaking Changes.**

---

## v0.97.2 (2026-08-07)

- [kunde:sichtbar] Buttons auf Inhaltsseiten hatten teils dieselbe Textfarbe wie ihr eigener Hintergrund und waren dadurch kaum lesbar. Behoben.

**Fix:** `ContentPage` faerbte Buttons im Slot mit der Prosa-Linkfarbe ein

`.content-page :global(a) { color: var(--color-accent-text) }` galt fuer **jeden**
Anchor im Slot. Die Regel hat Spezifitaet (0,2,1) und schlaegt damit jede
Button-Klasse — `.btn-outline` und `.btn-accent` liegen bei (0,1,0). Wer einen
cw-core-Block mit Buttons in eine `ContentPage` legt (CTABlock, CTAHeroBlock,
StickyContact), bekam die Button-Beschriftung in `--color-accent-text` gemalt,
statt in Weiss.

Am 07.08.2026 an Zink im Browser gemessen: Buttontext `#9c0359` auf Button-Magenta
`#ed0677` — **Kontrast 1.9:1**. WCAG AA verlangt 4.5:1; der Text war praktisch
unsichtbar. Betroffen war jede Seite, die `ContentPage` **und** einen Button-Block
kombiniert; reine Prosa-Seiten (Impressum, Datenschutz) waren nie betroffen.
`LandingPage` hat die Regel nicht und war nie betroffen.

Die Regel klammert Buttons jetzt aus:

```css
.content-page :global(a:not([class*="btn"]):not([class*="button"])) { … }
```

Prosa-Links behalten `--color-accent-text` unveraendert.

**Keine Breaking Changes.**

---

## v0.97.1 (2026-08-07)

- [kunde:sichtbar] Der Markenname im Fussbereich lässt sich jetzt tatsächlich ausblenden — in v0.97.0 kam die Einstellung nicht an.

**Fix:** `footer.hideBrandName` erreichte den Footer nicht

v0.97.0 hat den Prop an `Footer.astro` gebaut, aber `LandingPage.astro` und
`ContentPage.astro` reichen die Footer-Konfiguration **feldweise** durch statt per
Spread — `hideBrandName` stand nicht in der Liste und fiel still auf `false` zurueck.
Der Prop war damit ueber die Layouts nicht erreichbar; nur ein direkter
`<Footer hideBrandName />`-Aufruf haette funktioniert.

Gefunden beim Gegencheck am Kunden: Header-Markup nach dem v0.97.0-Upgrade sauber,
im Footer stand `<a class="logo-name">Zink Baeckerei &amp; Konditorei</a>` unveraendert
weiter unter dem Logo.

Beide Layouts reichen den Prop jetzt durch, `FooterConfig` kennt ihn in beiden.

**Keine Breaking Changes.**

---

## v0.97.0 (2026-08-07)

- [kunde:sichtbar] Der Kopfbereich der Website kann jetzt eine eigene Hintergrundfarbe bekommen, unabhängig von der Hauptfarbe der Marke.
- [kunde:sichtbar] Steht der Markenname schon als Schrift im Logo, lässt er sich im Fussbereich ausblenden — er stand dort bisher zwangsläufig doppelt.

**Feature:** `--color-header-bg` — Header-Hintergrund unabhaengig von `--color-primary`

`Header.astro` hat seinen Hintergrund bisher fest aus `var(--color-primary)` gezogen.
Fuer Sites, deren CI die Primaerfarbe als *Akzent* fuehrt und nicht als flaechigen
Grund, gab es keinen Weg, den Header umzufaerben, ohne die Primaerfarbe global zu
kippen — und damit Buttons, CTA-Bloecke und Sections gleich mit.

Ausloeser: Zink Baeckerei. Offizieller Styleguide (Adobe-Export, geprueft am
07.08.2026) fuehrt Magenta `#ed0677` als Akzent auf weissem, beigem oder
dunkelbraunem Grund — einen magentafarbenen Vollflaechen-Hintergrund gibt es im
Styleguide nicht.

Neu, analog zum bereits existierenden `--color-footer-bg`:

```css
/* customer-x/src/styles/tokens.css */
@theme {
  --color-header-bg: #352408;   /* Header-Grund */
  /* optional, sonst erbt der Mobile-Nav --color-header-bg: */
  --color-header-bg-mobile: #4A3410;
}
```

Ohne Token rendert der Header **byte-identisch wie vorher** — die Fallback-Kette
endet in `var(--color-primary)`. Keine Migration noetig.

**Feature:** `Footer.hideBrandName` — Gegenstueck zu `Header.hideBrandName`

Der Footer rendert Logo-Bild **und** `siteName` als Textzeile. Bei einer Wortmarke,
die den Markennamen bereits als Schrift enthaelt, steht der Name damit zweimal
untereinander. `Header.astro` konnte das seit v0.63.0 per `hideBrandName`
unterdruecken, `Footer.astro` nicht — dieselbe Doppelung blieb unten stehen.

Belegt durch Kunden-Rueckmeldung Zink Baeckerei (07.08.2026): „Zink doppelt im
Header — das Image und den Header-Titel". Derselbe Befund gilt fuer den Footer.

```astro
<Footer siteName={siteData.name} logoSrc="/logo.svg" hideBrandName />
```

Default `false` — bestehende Sites rendern unveraendert.

**Keine Breaking Changes.** Beide Aenderungen sind additiv.

---

## v0.96.0 (2026-08-06)

**Fix:** CountUp blieb bei einem Tab-Wechsel auf einem Zwischenwert stehen

Kontext: `CountUp` zaehlt per `requestAnimationFrame` auf seinen Zielwert hoch. Der
Browser haelt rAF an, sobald der Tab in den Hintergrund geht — der Zaehler fror auf dem
gerade erreichten Zwischenwert ein und blieb dort stehen. Im Browser belegt am
06.08.2026 an der blitzsicht-StatsBar: **„91" statt „95"**. Auf Seiten, die mit
gemessenen Zahlen argumentieren, ist das keine Kosmetik, sondern eine Zahl, die so nie
gemessen wurde.

Der Zaehler setzt sich jetzt bei `visibilitychange` sofort auf den Endwert, und jeder
Tick prueft zusaetzlich `document.hidden`. Startet die Animation, waehrend der Tab schon
versteckt ist, wird gar nicht erst gezaehlt.

Gegenprobe mit demselben Ausloeser: vorher 91, nachher exakt 95.

Keine `[kunde]`-Zeile: `CountUp` wird fleetweit nur von der Eigen-Site blitzsicht genutzt,
und die bekommt keinen Kundenreport.

**Merksatz:** Jede rAF-Animation, die eine Zahl oder einen Messwert darstellt, braucht
einen Endwert-Anker. Ein Zwischenwert, der stehen bleibt, behauptet etwas.

**Migrations-Hinweis:** Keiner — keine neuen Props, kein geaendertes Markup.

---

## v0.95.0 (2026-08-06)

- [kunde:sichtbar] Aufzählungen auf den Textseiten haben wieder Punkte und Nummern.

**Fix:** Listen ohne Marker auf allen Content-Seiten

Kontext: Tailwinds Preflight setzt `ol, ul { list-style: none }` (preflight.css:205).
`ContentPage.astro` stellte davon nur das `padding-left` wieder her, nicht die Marker.
Ergebnis: Aufzaehlungen standen eingerueckt, aber ohne Punkte und Nummern — auf **jeder**
Content-Seite der Fleet, also auch in Impressum, Datenschutz und AGB. Aufgefallen ist es
am 06.08.2026 auf einer Studio-Seite von platzfrei; dort war eine nummerierte Anleitung
nicht als solche erkennbar.

`.content-page ul` bekommt `list-style: disc outside`, `ol` entsprechend `decimal outside`.
`outside` platziert die Marker in das bereits vorhandene `padding-left` — die Einrueckung
aendert sich also nicht, nur die Marker kommen zurueck.

Merksatz jetzt in `docs/ux-conventions.md`: Wer ausserhalb von ContentPage eine Prosa-Liste
baut, stellt die Marker selbst wieder her. Fuer Layout-Listen (Karten-Grids, Navigation,
Chip-Reihen) bleibt `list-style: none` richtig.

**Migrations-Hinweis:** Keiner — reine CSS-Aenderung. Sichtbar auf jeder Textseite, deshalb
Pin-Bump ueber den Release-Train mit Canary-Check.

---

## v0.94.0 (2026-08-06)

- [kunde:sichtbar] Auf der Website steht die wichtigste Schaltfläche jetzt überall an derselben Stelle — rechts. Zurück-Verweise bleiben links.

**Tweak:** UX-Konvention „Vorwärts gehört nach rechts"

Kontext: Bisher entschied jede Komponente für sich, wo die Hauptaktion sitzt — mal links
neben der Zweitaktion, mal linksbündig unter einem Formular. Für Besucher heißt das: die
Schaltfläche, die weiterführt, steht auf jeder Sektion woanders. Operator-Vorgabe vom
06.08.2026: Was weiterführt, gehört nach rechts; was zurückführt, bleibt links.

Die Regel in drei anwendbaren Sätzen (Details + Begründung in `docs/ux-conventions.md`):

- Im Button-Paar ist die Vorwärts-/Primäraktion das rechteste Element.
- Eine alleinstehende Vorwärts-CTA in einer Inhaltsspalte steht rechtsbündig.
- Zurück-Navigation bleibt links, als `.btn-outline` statt als nackter Textlink.

Betroffen: `Hero.astro`, `CTABlock.astro` (Reihenfolge im Paar; die Gruppen behalten ihre
Ausrichtung — eine rechtsbündige Buttonzeile unter linksbündigem Text wirkt abgerissen) und
`ContactForm.astro` (Absenden rechtsbündig).

Unter 641 px stapeln die Buttons per `flex-wrap`: dort steht die Primäraktion oben, weil es
auf schmalen Viewports kein „rechts" gibt. Deshalb greift die Umsortierung per `order` nur im
Desktop-Breakpoint, die DOM-Reihenfolge bleibt primary-first.

> **Korrektur 2026-08-06:** Dieser Absatz behauptete ursprünglich, die Primäraktion stehe
> mobil „über die volle Breite". Das tut sie nicht und tat sie nie — die Buttons brechen
> inhaltsbreit um und bleiben in ihrer Gruppen-Ausrichtung (bei `CTABlock` zentriert). Am
> Canary gemessen (blitzsicht, 375 px): Container 301 px, Buttons 179 px und 224 px,
> `order: 0` bei beiden. Kein Code-Defekt, nur ein falscher Satz — korrigiert, damit niemand
> einen Bug sucht, den es nicht gibt.

**Migrations-Hinweis:** Keiner — reine CSS-Änderung, keine API. Aber sichtbar bei jedem
Kunden: Pin-Bump gehört über den Release-Train mit Canary-Check (eine Seite mit Hero,
CTABlock und Formular im Browser prüfen), nicht nebenbei.

---

## v0.93.0 (2026-08-06)

**Feature:** `siteData.imageRights` — Fremdmaterial behält seinen Urheber

Kontext: Die Geotag-Stufe stempelte `© <eigene Entität>` als `Copyright` **und** `Artist`
in **jedes** taggbare Bild und überschrieb dabei vorhandene Angaben. Für eigene Bilder ist
das richtig. Sobald aber Partner-, Lieferanten- oder Herstellerfotos auf einer Seite liegen,
behaupten wir damit eine Urheberschaft, die uns nicht zusteht — und liefern diese Behauptung
in den Metadaten selbst aus. Nutzungserlaubnis ist keine Urheberschaft. Aufgefallen bei
customer-platzfrei: Studio-Fotos des Partners sollten auf die Studio-Seite.

Neue API:

- `siteData.imageRights?: { pathPrefix: string; holder: string }[]` — ordnet Pfad-Präfixen
  einen abweichenden Rechteinhaber zu. Beispiel:

  ```ts
  imageRights: [{ pathPrefix: 'images/studios/', holder: 'Victory Gym Neutraubling' }],
  ```

- `resolveImageCopyrightHolder(data, relPath)` in `@cw/core/utils/copyright`
- `withImageRights(common, data, relPath)` in `ai-discovery/geotag-core`

Verhalten: Präfixe matchen auf den dist-relativen Pfad (Backslashes und führende Slashes
normalisiert), **längstes Präfix gewinnt** — damit sind Ausnahmen innerhalb eines Ordners
möglich. Leere, fehlende oder `TODO`-Werte werden ignoriert und fallen auf den Customer
zurück, statt Unsinn ins Bild zu schreiben. **Ohne `imageRights` ändert sich nichts** —
Fleet-neutral.

Beide Geotag-Twins nutzen dieselbe Funktion (`ai-discovery/geotag.js` +
`scripts/geotag-dist.mjs`), damit die Tag-Logik nicht divergiert. 5 neue Tests, u. a. dass
der gemeinsame Tag-Satz nicht mutiert wird — sonst färbte das erste Fremdbild alle
folgenden ein.

**Migrations-Hinweis:** Keiner. Rein additiv.

---

## v0.92.0 (2026-08-05)

- [kunde] Der Blitzsicht-Link im Fußbereich gibt jetzt mit an, von welcher Website ein Besucher gekommen ist. Am Erscheinungsbild der Seite ändert sich nichts.

**Fix:** Footer-Backlink trägt `utm_source` serverseitig statt nur per Client-Script.

`Footer.astro` rendert den Eigen-Marken-Backlink seit jeher als
`https://blitzsicht.com/?utm_medium=footer` — ohne Quelle. Die fehlende
`utm_source` ergänzte bisher ausschließlich `PlausibleEvents.astro` per JS
(`a[data-brand-backlink]`, seit v0.63.0). Diese Komponente ist aber **optional**
und nur bei `trackingMode: 'full'` gemountet. Auf Sites ohne Analytics-Mount
kam jeder Klick ununterscheidbar als bloßes „footer" an — aufgefallen am
2026-08-05 auf platzfrei.club, das vor dem onboard-site-Lauf kein Plausible hat.

Der Link trägt seine Herkunft jetzt selbst: `utm_source` = `Astro.site.hostname`,
serverseitig ins `href` gerendert. Bewusst der Hostname und nicht der
Customer-Slug — identisch zu dem, was das Client-Script schon immer schrieb,
sonst zersplittert dieselbe Kundenseite in der Auswertung auf zwei Quellen.

Das Client-Script bleibt als Fallback für Sites ohne konfigurierte `site`-URL
und überschreibt den Wert nicht (es setzt `utm_source` nur, wenn der Parameter
fehlt) — server-gerendert ist ab jetzt der Primärpfad, JS nur noch die Sicherung.

Verifikation: Build von `customer-platzfrei` gegen diese Fassung — im dist-HTML
steht `?utm_source=platzfrei.club&utm_medium=footer`.

**Migrations-Hinweis:** Keiner. Sites mit `PlausibleEvents` verhalten sich
unverändert (gleicher Wert, nur früher gesetzt); Sites ohne bekommen die
Attribution neu dazu.

---

## v0.91.0 (2026-08-05)

- [kunde] Das Kontaktformular kann jetzt auch als Warteliste eingesetzt werden — Interessenten tragen sich mit Name, Betrieb und E-Mail ein, ohne dass ein klassisches Kontaktformular nötig ist.

**Feature:** Wartelisten-Formular als vierter `formType` — additiv, alle bestehenden Sites unverändert.

Anlass: `customer-platzfrei` (Produktseite platzfrei.club) braucht eine Warteliste für
interessierte Studios statt eines Kontaktformulars. Der bisherige Handler extrahierte nur
`name/email/company/phone/message/website` — ein `studio`-Feld wäre still verschluckt
worden. Gemäß #1-Regel generisch in cw-core gelöst statt customer-spezifisch.

Änderungen:

- `ContactForm.astro`: `formType="waitlist"` (Felder `name`*, `studio`*, `email`*,
  `message` optional; Texte per Du — Produkt-Tonalität). Neuer Prop
  `turnstileTheme?: 'light'|'dark'|'auto'` (Default `'light'`, war vorher hardcodiert —
  dunkle Sites setzen `'dark'`).
- `contact-handler.js`: Config-Option `kind?: 'contact-form'|'waitlist'` (Default
  unverändert); `studio` wird extrahiert, im Spam-Content-Filter mitgeprüft und an
  Mail + Lead-Sink durchgereicht.
- `build-lead-email.js`: `leadStudio` → „Studio“-Zeile in HTML- und Text-Fassung.
- `lead-sink.js`: `Lead.kind` + `'waitlist'`, `Lead.studio`; Telegram-Push trägt
  `📋 Warteliste`-Header statt `🆕 Lead`.
- `verify-form-health.mjs`: neue Env `FORM_PAGE_PATH` (Default `/kontakt/`) — One-Pager
  mit Formular auf der Startseite setzen `FORM_PAGE_PATH=/` statt `SKIP_FORM_HEALTH`.

Verifikation: 8 neue Tests (Studio in Resend-HTML/-Text, Warteliste-Header im
Telegram-Payload, MarkdownV2-Escaping, Spam-Filter aufs Studio-Feld,
Abwärtskompatibilitäts-Checks, FORM_PAGE_PATH mit echtem HTTP-Server). Rot-Beweis:
gegen die v0.90.0-Implementierung failen 7 davon, mit v0.91.0 sind alle 25 grün.

**Migrations-Hinweis:** Keiner. Alle Defaults unverändert (`kind` → `'contact-form'`,
`turnstileTheme` → `'light'`); bestehende Formulare rendern byte-identisch.

---

## v0.90.0 (2026-08-03)

- [kunde] Wo ein Buchungskalender auf der Website eingebunden ist, lädt er jetzt erst nach einem Klick. Ohne diesen Klick werden keine Daten an den Terminanbieter übertragen.

**Fix + Feature:** `CalEmbed` lädt standardmäßig lazy; neuer Embed-Consent-Guard als Regressions-Wächter.

Kontext: Ein Live-Audit am 2026-08-03 zeigte, dass `steller-sanierungen.com/kontakt`
`app.cal.eu/embed/embed.js` **beim Seitenaufruf** injizierte. Jeder Besucher übertrug
damit seine IP an Cal.com Inc., bevor er irgendetwas getan hatte. Art. 6 Abs. 1 lit. b
DSGVO setzt eine aktive Anfrage voraus — ein reiner Seitenaufruf ist keine; dazu
§ 25 TDDDG.

Ursache war der Default `lazy = false` in `CalEmbed.astro`. Die Seite setzte den Prop
nicht und erbte den Eager-Zweig. blitzsicht setzte `lazy={true}` explizit und war sauber
— der sichere Weg existierte im selben Repo, wurde aber nicht vererbt. Genau das ist der
Fehlertyp, den die #1-Regel adressiert: nicht patchen, sondern den Default sicher machen
und einen Guard bauen.

Änderungen:

- `CalEmbed.astro`: Default `lazy` von `false` auf `true`. Wer `false` setzt, braucht
  dafür eine dokumentierte Rechtsgrundlage — steht als Begründung am Prop.
- Neu `integrations/ai-discovery/embed-consent-check.js` + `.d.ts`: meldet Buchungs-Embeds,
  die ohne Nutzeraktion laden. Soft-warn, Strict per Opt-in `strictEmbedConsent`.
- Neue Optionen: `checkEmbedConsent` (Default `true`), `strictEmbedConsent` (Default `false`).

Der Guard ist **bewusst eng** auf die Cal-Signatur geschnitten. Eine generische Regel
„Drittanbieter-Host ohne click-Gate" hätte `TurnstilePreClearance.astro` getroffen, das
über `addEventListener('load', …)` + `requestIdleCallback` auf jeder Seite jedes Kunden
lädt — der Guard hätte ab Tag 1 fleet-weit Alarm geschlagen, und ein Guard im Dauer-Alarm
wird ignoriert. Die Gate-Taxonomie für eine spätere Verallgemeinerung (`click`/`pointerup`/
`touchend` = Einwilligung, `load`/`idle`/`setTimeout` = nur Deferral) steht im Modulkopf.

Verifikation: 10 Guard-Tests inkl. drei Fixtures aus echtem HTML (Steller-Eager muss
warnen, Blitzsicht-Lazy und TurnstilePreClearance dürfen nicht). Fleet-Trockenlauf gegen
31 echte Produktionsseiten: genau 1 Warnung — der bekannte Steller-Fall, null False
Positives.

**Migrations-Hinweis:** Keiner. Beide `<CalEmbed>`-Consumer im Fleet setzen den Prop nach
diesem Release explizit, der Default-Flip wirkt also nur für Neukunden. Wer den Eager-Modus
bewusst braucht, setzt `lazy={false}` — und dokumentiert die Rechtsgrundlage dafür.

---

## v0.89.0 (2026-07-30)

- [kunde:sichtbar] Die Einwilligungs-Checkbox unter dem Kontaktformular (nur auf Seiten mit Google-Ads-Messung) kann ihren Rechtstext jetzt hinter einem „Details"-Aufklapper verstecken. Sichtbar bleibt ein kurzer Satz, die Pflichtangaben stehen eine Klick-Ebene tiefer. Wer den Aufklapper nicht einrichtet, sieht seine Seite unverändert.

**Feature:** Neuer optionaler Prop `adsConsentDetails` an `ContactForm.astro`.

Ist er gesetzt, rendert unter dem Consent-Label ein `<details><summary>Details</summary>`
mit dem übergebenen Text, und der Container bekommt zusätzlich die Klasse `has-details`
(Grid statt Flex, damit der Aufklapper in der Label-Spalte sitzt). Ohne den Prop bleibt der
Block DOM- und CSS-seitig exakt wie in v0.88.0 — verifiziert: `display:flex`,
`align-items:flex-start`, `gap:8px` unverändert.

Hintergrund: Der Default-Consent-Text nennt Empfänger und Drittlandtransfer und ist damit
zwangsläufig lang. Direkt über dem Absenden-Button kostet das Conversions. Der Aufklapper
löst den Zielkonflikt, ohne die Pflichtangaben nach Art. 13 DSGVO wegzulassen.

Wer den Prop nutzt und dabei den `adsConsentText` kürzt, muss `adsConsentVersion` mit
hochziehen — die Version wird zusammen mit dem Zeitstempel in der `conversion_queue`
protokolliert und ist sonst als Einwilligungsnachweis (Art. 7 Abs. 1 DSGVO) wertlos.

Erste Nutzung: `customer-digital-direkt` (`ads-consent-v2`).

---

## v0.88.0 (2026-07-30)

- [kunde] Die Telefonnummern auf Impressum und Datenschutzerklärung lassen sich jetzt auf allen Geräten zuverlässig antippen — bisher enthielten diese Links einen Bindestrich, den nicht jedes Telefon korrekt verarbeitet.

**Feature (Touchpoint-Audit vor Ad-Spend):** Neues Prüfskript
`scripts/verify-touchpoints.mjs`, das jeden Kontaktweg einer Kundenseite automatisch
gegen die Stammdaten prüft — als PR-Gate gegen das gebaute `dist/` und live gegen
eine Deployment-URL.

Kontext: Auf digital-direkt.com wählte der Anruf-Button der Startseite
`tel:+4994015395900` — Durchwahl `00` statt `0`. Der Fehler war seit Monaten live und
wäre erst durch bezahlte Anzeigenklicks teuer aufgefallen. Ein Tippfehler in einer
Telefonnummer ist unsichtbar: Der Link sieht korrekt aus, die Seite baut grün, nur der
Anruf kommt nie an.

Was geprüft wird:

- jede `tel:`/`mailto:`/WhatsApp-Adresse kanonisch **und** in `src/data/site-data.ts` vorhanden
- Kontakt-Links ohne Schema (`<a href="+49…">` statt `tel:+49…`) — navigieren relativ statt zu wählen
- interne Links und Anzeigen-Ziel-URLs ohne Umleitungs-Hops (live-Modus)
- Analytics-Proxy-Kette und `/api/contact` per Honeypot-Submit, der keine echte Anfrage erzeugt

Aufruf: `node node_modules/@cw/core/scripts/verify-touchpoints.mjs --dist dist`
bzw. `--url https://kunde.de`. Optionale Konfiguration je Kunde in
`touchpoint-audit.config.json` (zusätzliche Nummern, erlaubte Fremd-Adressen,
Anzeigen-Ziel-URLs). Opt-out per Repository-Variable `SKIP_TOUCHPOINTS=true`.

**Fix (tel:-Hrefs in den Rechts-Bausteinen):** `ImpressumBlock`, `DatenschutzBlock` und
`InformationspflichtBlock` normalisierten die Nummer per Ad-hoc-`replace(/\s+/g, '')`,
wodurch Bindestriche im `href` überlebten (`tel:+49940153959-20`). Jetzt über
`phoneToTelHref()` wie im Footer.

**Migrations-Hinweis:** Keiner — beides ist additiv. Der neue CI-Step im
Workflow-Template (`templates/.github/workflows/build-check.yml`) ist dateigeguarded
und überspringt sich in Repos, deren Pin das Skript noch nicht enthält.

**Achtung bei eigener Verwendung von `phoneToTelHref()`:** Die Funktion liefert nur die
Ziffernfolge (`+4994015395920`) — das `tel:`-Präfix setzt der Aufrufer:
``href={`tel:${phoneToTelHref(x)}`}``. Ohne Präfix entsteht ein relativer Link statt
eines Anrufs; genau diese Falle trat beim Bau dieses Releases zweimal auf und wird
jetzt vom Audit erkannt.

---

## v0.87.3 (2026-07-23)

- [kunde:sichtbar] Logos und Social-Media-Vorschaubilder bleiben beim Optimieren unangetastet — sie konnten bisher in eine andere Dateiform umgewandelt werden, wodurch das Logo auf der Website ins Leere zeigte.

**Fix (Bild-Optimierung fraß Marken-Assets):** `optimize-images --delete-originals` schützte
per Denylist nur `/og/`, `/icons/`, `/email/`, `/social/` und `favicon` — Logos und OG-Bilder
**außerhalb** dieser Ordner fielen durch.

Aufgefallen beim Fleet-Bump v0.77.2 → v0.87.x: bei `customer-blitzsicht` und
`customer-donau-profi` löschte der Lauf `public/logo.png` (+ `logo-dark`, `logo-original`),
obwohl beide Seiten **live genau diese URL** auf jeder Seite referenzieren (verifiziert:
`https://blitzsicht.com/logo.png` und `https://donau-profi.de/logo.png` liefern 200, die
Referenz steht im ausgelieferten HTML). Der Deploy hätte die Logos auf 404 gesetzt.

Dasselbe Muster, bereits eingetreten: `customer-blitzsicht/public/images/blog/og-images-og.png`
liegt nicht in einem `/og/`-Ordner, wurde konvertiert — der Blogartikel „Open-Graph-
Vorschaubilder" zeigt seitdem live auf ein totes OG-Bild (404 verifiziert).

- **`scripts/optimize-images.mjs`**: Denylist um `/logo/i` und `/[-_]og\.(png|jpe?g)$/i`
  erweitert. Marken- und Social-Assets werden extern referenziert (Schema.org, OG-Tags,
  E-Mail-Signaturen, fremde Seiten) — ein paar KB sind billiger als eine tote Logo-URL.

Verifiziert über zehn Pfad-Fälle inkl. drei Gegenproben, die weiterhin optimiert werden
müssen (`artikel-hero.png`, `teppichreinigung.jpg`, `portrait.jpg`).

## v0.87.2 (2026-07-23)

- [kunde:sichtbar] Auf Seiten mit eingebetteter Google-Maps-Karte wird die Karte wieder angezeigt — sie wurde bisher von den eigenen Sicherheitsregeln der Website blockiert.

**Fix (CSP kannte Google Maps nicht):** `schiller-gartenbau.de/service/` liefert eine
Maps-Embed-iframe aus, die die eigene CSP blockt — `frame-src` erlaubte nur `'self'` +
Turnstile. Der Live-Zustand ist verifiziert: die iframe steht im ausgelieferten HTML, der
Header lässt sie nicht zu. Die Karte war also für Besucher tot.

Aufgefallen ist es erst durch den ai-discovery-Build-Guard beim Fleet-Bump — und der lief
in eine **Sackgasse**: Er brach den Build ab und empfahl `gen-vercel-csp.mjs`, aber dieses
Skript nutzt `fixCsp`, das nur die Struktur repariert und Dienst-Hosts **nicht** nachrüsten
kann. Die empfohlene Abhilfe änderte nichts.

- **`csp-build.js`**: neuer Dienst-Host `googleMaps` (`https://www.google.com`, nur der
  Embed-Host, nicht `maps.googleapis.com`), Flag in `buildCsp` + `frame-src`. `HOSTS` wird
  jetzt exportiert.
- **`scripts/gen-vercel-csp.mjs`**: neue Option `--service <name>[,<name>]`, die einen
  bekannten Dienst-Host in die passende Direktive einfügt — idempotent, mit harter
  Fehlermeldung bei unbekanntem Namen. Damit ist die Sackgasse geschlossen:

  ```bash
  node node_modules/@cw/core/scripts/gen-vercel-csp.mjs --service googleMaps
  ```

Verifiziert an schiller-gartenbau: `frame-src` um `https://www.google.com` ergänzt, Build
danach grün, zweiter Lauf meldet „bereits konform" (idempotent), unbekannter Dienst → exit 1.

## v0.87.1 (2026-07-23)

**Fix (Preview-Builds, Regression aus v0.87.0):** Der Empfänger-Guard in
`scripts/validate-form-backend.mjs` erzwang `CONTACT_EMAIL` bei `VERCEL === '1'` — das ist
in **jedem** Vercel-Build gesetzt, auch im Preview. Da die Var in vielen Projekten nur auf
dem `production`-Target liegt, hätte der Guard ab v0.87.0 jeden PR-Preview-Build gekillt.

- Die „fehlt"-Regel greift jetzt nur bei `VERCEL_ENV === 'production'`. Im Preview gibt es
  eine sichtbare Warnung (das Formular würde dort zur Laufzeit 500 liefern), aber keinen
  Build-Abbruch — ein fehlender Preview-Wert darf keinen PR blockieren.
- Die **inhaltlichen** Regeln (Blitzsicht-Empfänger auf Kunden-Domain, Whitespace im Wert)
  bleiben in **allen** Umgebungen hart. Sie können nicht falsch-positiv werden, weil sie
  einen tatsächlich gesetzten, tatsächlich falschen Wert bewerten.

Aufgefallen im Plan-Review vor dem Fleet-Rollout — also bevor der Fehler von zwei auf elf
Sites multipliziert wurde. Verifiziert über sieben Fälle: Preview ohne Var → exit 0 mit
Warnung, Production ohne Var → exit 1, falscher Empfänger und Whitespace → exit 1 in
**beiden** Umgebungen, korrekter Wert → exit 0.

## v0.87.0 (2026-07-23)

- [kunde] Anfragen über das Kontaktformular kommen jetzt zuverlässig beim richtigen Empfänger an; falsch eingestellte Empfänger-Adressen werden vor dem Veröffentlichen automatisch erkannt und gemeldet.

**Fix (Lead-Fehlleitung, Vorfall zink-baeckerei 2026-07-17):** Ein Lead über baeckereizink.de
landete nie bei der Bäckerei — `CONTACT_EMAIL` stand auf `servus@blitzsicht.com`. Ursache war
eine Doppelbelegung: **`briefing-handler` und `contact-handler` lasen dieselbe Env-Var mit
gegensätzlicher Bedeutung** (Briefing → Blitzsicht, Website-Lead → Kunde). Auf Sites mit
beiden Routen (`mika-elektrotechnik`, `blumen-schmid`) war dadurch zwangsläufig eine Seite
falsch adressiert. Verstärkt durch `cw-onboarding/docs/howto-onboard-new-customer.md`, das
`echo "servus@blitzsicht.com" | vercel env add CONTACT_EMAIL production` vorgab — inklusive
Trailing-`\n` im Wert.

- **`api/briefing-handler.js`**: liest jetzt `BRIEFING_EMAIL` statt `CONTACT_EMAIL`
  (Default unverändert `servus@blitzsicht.com` → **keine Migration nötig**). `CONTACT_EMAIL`
  gehört ab sofort exklusiv dem contact-handler und muss auf die **Kunden-Adresse** zeigen.
- **`api/contact-handler.js`**: Empfänger werden normalisiert (`trim`, Komma-Liste) — das
  `echo`-Newline-Artefakt kann keinen Versand mehr verfälschen. Neue optionale
  `LEAD_BCC_EMAIL` legt eine stille Blitzsicht-Kopie jedes Leads dazu; Adressen, die schon
  im `to` stehen, werden übersprungen (keine Doppel-Mail auf blitzsicht.com selbst).
- **`api/contact-handler.js`**: zwei Lead-Verlust-Lecks geschlossen. Lehnte Resend den
  Versand ab (`!r.ok`, u.a. bei ungültigem Empfänger), ging der Lead **komplett verloren** —
  kein `emitLead`, kein Alarm, nur eine Fehlermeldung im Browser des Interessenten. Jetzt
  läuft in beiden Fehlerpfaden der Telegram-Alarm mit `deliveryError`. Zusätzlich fängt ein
  äußerer Wrapper alles ab, was die Schichten nicht selbst behandeln (vorher: nackter
  Vercel-500 ohne Spur).
- **`api/error-sink.js` (neu)**: meldet Server-Fehler an das self-hosted GlitchTip
  (`errors.blitzsicht.com`, Projekt `customer-sites`), von dort per Relay nach Telegram.
  Bewusst ohne `@sentry/node` — plain `fetch` an die Store-API, gleiche Bauart wie
  `lead-sink.js`, keine neue Dependency in 15 Customer-Repos. No-op ohne `GLITCHTIP_DSN`.
- **`scripts/validate-form-backend.mjs`**: neuer Empfänger-Guard. Blockt den Build, wenn
  `CONTACT_EMAIL` auf `@blitzsicht.com` zeigt, während die Seite eine Kunden-Domain
  ausliefert; ebenso bei Whitespace im Wert und bei fehlender Var im Vercel-Build.
  Auf blitzsicht.com selbst greift die Regel korrekt nicht (Host-Vergleich statt Whitelist).

**Damit der Guard wirkt, muss das Skript im `prebuild` der Customer-Repos hängen** — in
`build-check.yml` allein läuft er ohne `CONTACT_EMAIL` und überspringt den Empfänger-Teil:

```jsonc
"prebuild": "node node_modules/@cw/core/scripts/validate-form-backend.mjs && node node_modules/@cw/core/scripts/optimize-images.mjs --delete-originals"
```

## v0.86.0 (2026-07-22)

**Feature (Generator auf Fleet-Ist-Stand):** Vorbereitung des Generator-Zwangs. `buildCsp()`
erzeugt jetzt die Härtungen, die die Fleet real nutzt — `manifest-src`, `form-action 'self'`,
`upgrade-insecure-requests` — und kennt die fehlenden Dienst-Hosts `youtube`
(`www.youtube-nocookie.com`), `osm` (`tile.openstreetmap.org`) und `vercelToolbar`
(`vercel.live`, in 3 Repos real im Einsatz). Neue Flags `inlineStyles` (Default `true` — der
Perf-Standard `inlineStylesheets: 'always'` erzwingt es) und `inlineScripts` (Default `true` =
Ist-Stand; `false` hält Script-Direktiven strikt, wenn der Build keine ausführbaren
Inline-Scripts erzeugt — JSON-LD zählt nicht).

Ohne diese Erweiterung konnte `buildCsp` die gewachsenen Kunden-CSPs nicht reproduzieren und
taugte nicht als SSOT.

**Neu: `scripts/csp-drift-report.mjs`** — misst pro Repo den Abstand zwischen handgeschriebener
CSP und Generator-Output (leitet die Flags aus dem Ist-Stand ab). Kein Gate, kein Fehler-Exit,
reines Messwerkzeug.

Erster Lauf über die Fleet (22.07.2026): **19 Repos mit CSP, 19 mit Drift, 0 identisch** —
fast durchweg die drei neuen Härtungen. Der Generator-Zwang (`csp_not_generated` als harter
Check) wird deshalb **bewusst noch nicht aktiviert**: ein Gate, das am Einführungstag bei allen
Repos rot ist, wird abgeschaltet statt befolgt (Lesson v0.31.1). Reihenfolge: erst angleichen
(`gen-vercel-csp.mjs` pro Repo), dann hart schalten.

Tests: +5 (`csp-build` 13 gesamt), darunter die Kern-Invariante „Generator-Output besteht
`checkCspCompleteness` mit 0 Issues" über fünf Flag-Kombinationen.

**Migrations-Hinweis:** Keiner (rein additiv). `buildCsp`-Aufrufer ohne neue Flags bekommen
zusätzlich die drei Härtungs-Direktiven.

## v0.85.1 (2026-07-22)

**Fix (Typen):** `csp-public.d.ts` nachgeliefert. Der neue Export `@cw/core/csp` hatte keine
Typdeklaration — TS-Consumer außerhalb des Astro-Builds (cw-uptime) bekamen
`TS7016: Could not find a declaration file`. Aufgefallen beim Worker-Typecheck, nicht bei
den cw-core-Tests (die importieren die `.js` direkt).

## v0.85.0 (2026-07-22)

- [kunde] Ein neuer Sicherheitsschritt prüft beim Erstellen der Website, ob alle Bausteine der Seite (Schriften, Bilder, Gestaltung) auch wirklich geladen werden dürfen. Findet er ein Problem, wird die Veröffentlichung gestoppt und die bisherige Seite bleibt online — statt dass eine unlesbare Version live geht.

**Feature (CSP-Output-Verifikation):** Der CSP-Schutz prüft ab jetzt nicht mehr nur den
CSP-*Text* gegen bekannte Fehlermuster, sondern die CSP gegen das **tatsächlich gebaute
`dist/`**. Damit fängt er auch Bruchmuster, die noch nie aufgetreten sind.

Anlass — der fünfte Vorfall derselben Familie: gympanzen.com lieferte vom 17.–22.07.2026 eine
komplett ungestylte Seite aus. `inlineStylesheets: 'always'` (Perf-Standard) erzeugt genau
einen `<style>`-Block, den `style-src-elem 'self'` verwirft. Der bestehende `validate-csp`-Gate
meldete dabei **exit 0** — die CSP war strukturell einwandfrei, sie passte nur nicht zum Output.
Vorgeschichte: soleno (09.05.), digital-direkt (11.05.), donau-profi (09.06.). Jedes Mal wurde
eine neue Regel für genau das beobachtete Symptom nachgerüstet; der Katalog stand bei 11 Regeln.

Neue Module (alle reines JS + `.d.ts`, ohne `node:*` — laufen im Astro-Build, im Customer-CI
unter `node_modules` und im Cloudflare-Worker):

- **`csp-match.js`** — `checkResource()`/`findViolations()`: macht, was der Browser macht.
  Fallback-Ketten (`style-src-elem` → `style-src` → `default-src`), `'unsafe-inline'`/Hash/Nonce
  inkl. der CSP2+-Regel „Nonce/Hash präsent ⇒ `'unsafe-inline'` wird ignoriert", Schema-Sources,
  Subdomain-Wildcards, exakter Host-Match. Markiert nacktes `'self'` in Asset-Direktiven als
  `risky` (donau-profi-Klasse) — bewusst **nicht** bei `form-action`/`frame-src`, sonst Rauschen.
- **`html-resources.js`** — `extractResources()`: zieht jede CSP-relevante Referenz aus dem HTML
  (`<style>`, Inline-`<script>`, `<link>`-Varianten, `img`/`srcset`, `<source>` je nach
  Medien-Kontext, `<iframe>`, `style=`/`on*=`-Attribute, `url()` inkl. `@font-face`).
  **`application/ld+json` wird nie als Script gewertet** — es steht auf jeder Kundenseite.
- **`csp-audit.js`** — `auditHtml()` + `formatFinding()`, mit Dedup (50 gleiche Bilder = 1 Fund).
- **`csp-public.js`** → neuer Export **`@cw/core/csp`**: der laufzeit-neutrale Kern für
  Consumer außerhalb des Astro-Builds (cw-uptime).

Zwei Verankerungen, eine Logik:

| Anker | Wirkung |
|---|---|
| `astro:build:done` (neue Option `checkOutputCsp`, Default **true und hart**) | `astro build` exit 1 ⇒ Vercel-Deploy `ERROR` ⇒ **der alte Build bleibt live** |
| `scripts/csp-audit-dist.mjs` als CI-Step nach `pnpm build` | Datei-genaues PR-Feedback |

Warum hart und warum im Build: ein rotes GitHub-CI stoppt keinen Deploy — ein Push auf `main`
startet den Vercel-Prod-Deploy **parallel** zur CI. Nur ein Fehlschlag im Build selbst hält den
kaputten Stand von Produktion fern. Verifiziert an einer Wegwerf-Site: kaputte CSP → Exit 1,
gefixte CSP → Exit 0.

**Fix (Guard-Lücke):** `SELF_DIRECTIVES` in `csp-check.js` **und** `csp-build.js` um
`manifest-src` + `worker-src` ergänzt. Der Output-Scanner fand bei gympanzen ein nacktes
`'self'` in `manifest-src` auf allen 18 Seiten — die Liste kannte die Direktive nicht.

**Refactor:** `resolveOrigin()` aus `validate-csp.mjs` nach `scripts/lib/resolve-origin.mjs`
gezogen, von beiden CLIs geteilt.

Tests: +37 (`csp-match` 21, `csp-audit` 16) — darunter die drei realen Vorfälle als Gegenbeweis
(gympanzen/donau-profi/soleno) und die Fallgruben (JSON-LD, Hash-CSP, externes Stylesheet).
CSP-Suite gesamt 66/66 grün.

**Migrations-Hinweis:** Keine Prop-Änderung. Beim Pin-Bump kann der Build **hart brechen**, wenn
die CSP des Repos etwas blockt, das der Build ausliefert — das ist der Zweck. Fix:
`node node_modules/@cw/core/scripts/gen-vercel-csp.mjs` + commit. Cluster-Sweep gegen die live
ausgelieferten Header am 22.07.2026: 21 Repos, 14 auf Vercel und grün, 1 kaputt (gympanzen,
gefixt), 5 liegen nicht auf Vercel (nginx/Apache/IONOS), 1 offline.

## v0.84.0 (2026-07-13)

- [kunde:sichtbar] Der farbige Aufruf-Block „Sprechen wir über Ihr Projekt" nutzt jetzt die volle Breite — Text und Button mittig statt schmal links.

**Feature (CTAHeroBlock signet-los):** Neuer Prop `signet` (Default `true`). Mit `signet={false}`
rendert `CTAHeroBlock` eine signet-lose Volle-Breite-Variante: einspaltig, Inhalt zentriert und
breiter (`.cta-hero-content` 56rem, `.cta-hero-sub` 48rem) statt der schmalen 40rem/32rem-Spalte.

Kontext: Sites, die das Signet per Customer-CSS ausblenden (Grid auf 1fr zwangen), hatten eine
schmale Textspalte links + leeren rechten Grid-Block. Die Variante löst das in der Standard-
komponente — der Customer-CSS-Hack entfällt. `signetSrc`/`signetLayered` werden bei
`signet={false}` ignoriert.

```astro
<CTAHeroBlock headline="…" sub="…" ctaLabel="…" ctaHref="…" background="primary" signet={false} />
```

**Migrations-Hinweis:** Keiner (rein additiv, Default `true` = unverändertes Verhalten).

---

## v0.83.0 (2026-07-13)

**Feature (FloatingCallButton):** Neue Komponente `FloatingCallButton.astro` — feste
Bottom-right-Anruf-Pill (Schwester zu `FloatingCalButton`, aber `tel:` statt cal.com).
Props: `phone`, `label`, `variant` ('notfall' Signal-Rot / 'primary' / 'accent'), `stacked`
(sitzt über einem WhatsApp-Sticky). DSGVO-clean (reiner `tel:`-Link, kein Client-JS —
Klick-Tracking über den globalen `[data-cta]`-Listener, kein CTA-Doppelfeuer).

```astro
<FloatingCallButton phone="0160 91172381" label="Schnellhilfe" variant="notfall" stacked />
```

**Fix (phoneToTelHref-Härtung):** Eine Nummer im Format `49 160 …` (Ländercode ohne `+`)
wurde bisher fälschlich zu `+4949…` (doppelter Ländercode). Jetzt: führendes `49` ohne `+`
wird als Ländercode erkannt. `0…` → `+49…`, `+…` bleibt. Verhindert kaputte `tel:`-Links
beim Fleet-Bump (plan-reviewer-Befund).

**Tweak (DRY/Konsistenz):** `linkify-phones` und `LeistungenSection` nutzen jetzt den
gemeinsamen `phoneToTelHref` (vorher dupliziert). `LeistungenSection` verlinkt außerdem die
Telefonnummer im Text der `ctaPhone`-Karte (vorher nur im Button). `RichContentBlocks` hat
einen expliziten `ul`-Guard (kein stiller Crash bei künftiger Union-Erweiterung).
`CTAHeroBlock.headline`-JSDoc warnt vor ungetrimmtem User-Input (set:html-Sink).

**Migrations-Hinweis:** Keiner (rein additiv). Neue Komponente ist opt-in; bestehende
Props/Verhalten unverändert.

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
