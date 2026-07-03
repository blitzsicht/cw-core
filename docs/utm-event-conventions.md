# UTM-Parameter & Plausible-Event-Konventionen — SSOT

**Status:** Aktiv, dokumentiert 2026-07-03
**Auslöser:** E3 — bislang existierte die UTM-Konvention nur als Code-Kommentar in
`src/utils/booking-url.ts` (mit totem Verweis auf eine README-Sektion, die es nie gab),
der Event-Katalog nur implizit über `src/components/analytics/plausible-events.ts`.
Diese Datei ist ab jetzt die eine Wahrheitsquelle für beide.

---

## Kernregel

> **Events** = was auf der Seite passiert (Klick, Absenden, Scrollen). Englisch, `Title Case`.
> **UTM** = woher der Besucher kam (Kampagne, Placement). Kleinschreibung, `kebab-case`.
> Beides ist **konventionsbasiert, nicht erzwungen** — Plausible zeigt jeden eindeutigen
> String automatisch an. Diszipliniert bleiben, damit das Dashboard lesbar bleibt.

---

## Teil A — Plausible-Event-Katalog (cw-core-Cluster)

**SSOT der Namen:** `src/components/analytics/plausible-events.ts` (`PlausibleEvents`-Konstanten).
Namenskonvention: **Englisch, `Title Case` mit Leerzeichen** (z. B. `Phone Click`).

### Real ausgelöste Events (Stand 2026-07-03, per Code-Scan verifiziert)

| Event-Name | Ausgelöst von | Props | Trigger |
|---|---|---|---|
| `Phone Click` | `analytics/PlausibleEvents.astro` | — | Klick auf `tel:`-Link |
| `WhatsApp Click` | `analytics/PlausibleEvents.astro` | — | Klick auf `wa.me`/`whatsapp`-Link |
| `Email Click` | `analytics/PlausibleEvents.astro` | — | Klick auf `mailto:`-Link |
| `CTA Click` | `analytics/PlausibleEvents.astro` | `{ name }` | Element mit `data-cta="<name>"` |
| `Form Submit` | `analytics/PlausibleEvents.astro` | — | Kontaktformular abgeschickt |
| `Scroll Depth` | `analytics/PlausibleEvents.astro` | — | definierte Scroll-Tiefe erreicht |
| `FAQ Open` | `blocks/FAQ.astro` | `{ question }` | FAQ-Accordion geöffnet |
| `Sticky Contact Click` | `blocks/StickyContact.astro` | `{ channel }` | Sticky-Bar-Button (`sticky-wa` \| `sticky-phone`) |
| `Calendar Opened` | `blocks/CalEmbed.astro` | — | Cal.com-Widget geöffnet |
| `Booking Completed` | `blocks/CalEmbed.astro` | `{ calendar }` | Buchung im Cal.com-Widget abgeschlossen |
| `Map Load` | `blocks/MapEmbed.astro` | — | Karte (nach Consent/Klick) geladen |

### Regeln für neue Events

1. **Erst prüfen, ob ein bestehendes Event passt.** `CTA Click` mit `data-cta`-Prop deckt die
   meisten Button-Fälle ab — kein neues Event pro Button.
2. **Neue wiederverwendbare Events** in `PlausibleEvents` (`plausible-events.ts`) als Konstante
   ergänzen und über `trackPlausible(PlausibleEvents.X, props)` auslösen — nicht als loser String.
3. **Title Case, Englisch, Substantiv + Verb** (`Phone Click`, nicht `phone_click` / `PhoneClicked`).
4. **Anti-Pattern** (siehe `docs/optional-features.md`): kein Event für jede Page-Interaction.
   Plausible ist DSGVO-konform *genau weil* es wenige, aggregierte Events tracked.

### `data-cta`-Werte (CTA Click)

`CTA Click` liest den `name`-Prop aus `data-cta="<wert>"`. Konvention: **`<kontext>-<aktion>`**
in `kebab-case` — z. B. `audit-success-booking`, `notdienst-call`, `kontakt-whatsapp`.

> ⚠️ Bekannte Inkonsistenz: einzelne Altbestände nutzen `<kontext>:<aktion>` mit Doppelpunkt
> (z. B. `footer:booking`). **Standard ist Bindestrich.** Bei Berührung angleichen.

---

## Teil B — siluri.de (bewusste Ausnahme, eigener Stack)

`siluri.de` ist **kein** cw-core-Cluster-Site, sondern ein eigenständiger Astro-Stack mit
eigener Event-Sprache: **Deutsch, `Subjekt Aktion`** (z. B. `Anfrage gesendet`, `Telefon Klick`,
`DTF Bestellung gesendet`). Das ist Absicht, kein Fehler — dieser Katalog wird **nicht** nach
cw-core harmonisiert.

**SSOT dafür:** `siluri-de/instructions/EVENTSTRACKING.md` (inkl. Google-Ads-Conversion-Mapping).
Wer an siluri.de-Tracking arbeitet, richtet sich nach *diesem* Dokument, nicht nach Teil A.

---

## Teil C — UTM-Parameter-Konvention

**SSOT im Code:** `src/utils/booking-url.ts` → `buildBookingUrl()`. Jede getrackte Buchungs-URL
muss über diese Funktion gebaut werden (nicht von Hand zusammengesetzt).

| Parameter | Bedeutung | Erlaubte Werte (Konvention) |
|---|---|---|
| `utm_source` | Ursprung | `website` \| `report` \| `gbp` \| `outreach` \| `email-signature` \| `<kunden-hostname>` (Footer-Backlink) |
| `utm_medium` | Fläche | `web` \| `email` |
| `utm_campaign` | Kontext | `booking` \| `monthly-report` \| … |
| `utm_content` | Placement | `header` \| `footer` \| `sticky` \| `hero` \| `branche-<x>` \| `blog` \| `audit` \| … |
| `utm_term` | optional | z. B. `<customer-slug>-<YYYY-MM>` |

**Defaults** von `buildBookingUrl`: `source=website`, `medium=web`, `campaign=booking`.
`utm_content` ist **Pflicht** — ohne Placement gibt es keinen Attributions-Mehrwert.

### Bekannte Zweit-Schemata (Ist-Zustand, mit Ziel-Regel)

Historisch sind neben `buildBookingUrl` weitere UTM-Muster entstanden. Sie bleiben gültig, wo
dokumentiert, sind aber beim nächsten Touch an das obige Schema anzugleichen:

| Quelle | Muster | Bewertung |
|---|---|---|
| `customer-*/…/[token].astro` (Cold-Outreach-Redirect) | `source=outreach · medium=email · campaign=booking · content=termin-redirect` | ✅ konform |
| `customer-websites/docs/15-email-signaturen.md` | `source=email-signature · medium=email · campaign=<slug>-<linktyp>` | ⚠️ nutzt `campaign` für Personen-Slug statt Kontext — Sonderfall, dokumentiert |
| `analytics/PlausibleEvents.astro` (Footer-Backlink) | `source=<kunden-hostname>` | ✅ bewusst, identifiziert Backlink-Quelle |
| Investor-Outreach-Mails | `source=email · campaign=outreach-<LASTNAME>` | ⚠️ Alt-Schema, bei Neuauflage auf `source=outreach` umstellen |

> Geplant, aber **nicht** implementiert: die `touchpoints`-Tabelle in `cw-ads`
> (`docs/03-future-architecture.md`). Kein Code, keine Auswertung — hier nur als Referenz erwähnt,
> damit niemand sie fälschlich als aktiv annimmt.

---

## Teil D — Conversion-Goals

Goals werden **manuell im Plausible-Dashboard** angelegt (Settings → Goals), es gibt **keine**
Goal-Konfiguration im Code. Ein Goal ist entweder ein Custom-Event-Name aus Teil A
(z. B. `Booking Completed`) oder ein URL-Pfad. Wer eine Site neu anlegt oder migriert, muss die
Goals im Dashboard nachziehen — sie sind **nicht** Teil des CSV-Historie-Imports.

---

## Verwandte Dokumentation

- [`optional-features.md`](./optional-features.md) — Plausible-Custom-Events-Anti-Pattern
- [`src/utils/booking-url.ts`](../src/utils/booking-url.ts) — UTM-SSOT im Code (`buildBookingUrl`)
- [`src/components/analytics/plausible-events.ts`](../src/components/analytics/plausible-events.ts) — Event-Namen-SSOT
- `siluri-de/instructions/EVENTSTRACKING.md` — siluri.de-Event-Katalog (Deutsch, eigener Stack)
- `customer-websites/docs/15-email-signaturen.md` — UTM-Schema E-Mail-Signaturen
