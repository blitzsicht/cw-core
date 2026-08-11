# Brand-Name-Konvention — SSOT in siteData.name

**Status:** Aktiv seit v0.28.0 (Guard), dokumentiert 2026-06-08
**Auslöser:** siluri/blitzsicht-ops#316 (customer-mika-elektrotechnik, ~30 Literale in 13 Dateien)

---

## Kernregel

> `siteData.name` ist die einzige Wahrheitsquelle für den Markennamen.
> Alle anderen Felder müssen generisch formuliert sein.

Eine Umbenennung (z. B. "Mika Elektrotechnik" → "Elektrotechnik Mika GmbH") darf
**ausschließlich** eine Änderung in `siteData.name` erfordern — und sonst nichts.

---

## Was als Literal gilt

Ein "Literal" ist jede Zeichenkette, die identisch mit `siteData.name` (case-insensitive)
in einem Prosa-Feld steht — **und dort als eigenes Wort**, nicht als Teil eines längeren.

### Die Rename-Probe entscheidet

> Müsste eine Umbenennung diesen Satz anfassen? Ja → Literal. Nein → kein Literal.

Deutsche Komposita erzeugen sonst Treffer, an denen nichts vermeidbar ist:

| Marke | Text | Literal? |
|---|---|---|
| `Haus am Lago` | „Privates Ferien**haus am Lago** di Ledro" | **Nein** — steckt in „Ferienhaus". Eine Umbenennung ließe den Satz unberührt. |
| `Haus am Lago` | „**Haus am Lago** liegt am Bergsee" | Ja — freistehend. |
| `Soleno GmbH` | „Das **Soleno GmbH**-Team berät Sie" | Ja — Bindestrich ist ein Trennzeichen, kein Wortzeichen. |

Der Guard prüft das seit v0.101.3 über Wortgrenzen (`isStandaloneMatch` in
`ai-discovery/index.ts`). Die Grenzprüfung nutzt Unicode-Wortzeichen
(`/[\p{L}\p{N}_]/u`) und **nicht** `\b`/`\w` — die sind in JS ASCII-only, für sie ist
„ä" kein Wortzeichen. Mit `\b` läge mitten in `Sachverständigenbüro` eine Wortgrenze,
und die Prüfung würde genau bei den Marken versagen, für die sie gedacht ist.

Auslöser: Fleet-Scan 2026-08-10 ([#642](https://github.com/siluri/blitzsicht-ops/issues/642)) —
`hausamlago` stand allein wegen dieser Kollision rot. Unter `strictBrandName: true` wäre
daraus ein Build-Fail auf korrektem Deutsch geworden.

### Betroffen (must be generisch)

| Feld | Falsch | Richtig |
|---|---|---|
| `siteData.description` | `"Mika Elektrotechnik ist Ihr …"` | `"Ihr Elektrofachbetrieb in …"` |
| `siteData.tagline` | `"Mika Elektrotechnik — sicher."` | `"Sicher. Zuverlässig. Schnell."` |
| `siteData.faqs[].q` | `"Was macht Mika Elektrotechnik?"` | `"Was bieten Sie an?"` |
| `siteData.faqs[].a` | `"Mika Elektrotechnik bietet …"` | `"Wir bieten …"` |
| `siteData.leistungen[].title` | `"Mika Elektrotechnik Notdienst"` | `"Elektro-Notdienst"` |
| `siteData.leistungen[].description` | `"Mika Elektrotechnik kommt sofort"` | `"Wir sind rund um die Uhr erreichbar"` |
| `public/robots.txt` | `# Mika Elektrotechnik robots.txt` | (Kommentar weglassen, kein Brand nötig) |

### Nicht betroffen (darf/muss den Namen enthalten)

- `siteData.name` — das IST die SSOT
- `siteData.url` — enthält oft den Slug des Namens, das ist OK
- `siteData.contact.email` — oft `info@mika-elektrotechnik.de`, OK
- Schema.org `name`-Feld — wird aus `siteData.name` gesetzt, kein Literal im Source

---

## Der `seo`-Block: interpolieren statt streichen (v0.103.0)

Bis v0.102.1 stand hier, Seiten-Titles seien „generiert aus `siteData.name`, kein Literal
im Source". **Das stimmte nicht.** Der Fleet-Scan am 10.08.2026 fand den Markennamen
ausgeschrieben in `seo.titleTemplate`/`defaultTitle`/`defaultDescription`/`schemaDescription`
von **14 der 20 Repos** — darunter donau-profi und platzfrei, die als „0 Befunde" geführt
wurden (blitzsicht-ops#647). Der Guard prüfte das Feld mit der kleineren Reichweite
(`description` → nur `llms.txt`) und ließ das mit der größeren aus (`seo.defaultDescription`
→ die ausgelieferte `<meta description>`).

Hier gilt die Kernregel **anders herum**: die Marke *gehört* in den Title. Verboten ist
nicht ihr Vorkommen, sondern ihr zweites Original.

```ts
// FALSCH — Umbenennung kostet eine Suche über alle Felder
export const siteData = {
  name: 'Mika Elektrotechnik',
  seo: { defaultTitle: 'Elektroinstallation Rötz – Mika Elektrotechnik' },
};

// RICHTIG — Umbenennung kostet genau eine Zeile
const BRAND = 'Mika Elektrotechnik';
export const siteData = {
  name: BRAND,
  seo: { defaultTitle: `Elektroinstallation Rötz – ${BRAND}` },
};
```

### `titleTemplate` braucht meist gar nichts

`BaseLayout.astro:212` leitet den Default selbst ab:

```ts
const resolvedTitleTemplate = titleTemplate ?? (siteName ? `%s | ${siteName}` : '%s');
```

Ein `titleTemplate: '%s | <Name>'` wiederholt also nur, was ohnehin passiert — Feld löschen
(samt Durchreiche in `page-config.ts`), der Output bleibt identisch. Der Guard meldet diesen
Fall als `redundant_title_template`. **Abweichende** Templates (`'%s · Marke'`, Kurzformen
wie `'%s | GRG'`) sind erlaubt und werden nicht gemeldet — dort interpoliert man `${BRAND}`.

### Warum dieser Check den Quelltext liest

`` `… ${BRAND}` `` und `'… Marke'` sind zur Laufzeit **derselbe String**. Ein Guard auf dem
siteData-Objekt könnte das Zielmuster nicht vom Fehler unterscheiden und wäre unerfüllbar —
der Kunde käme nie auf 0, obwohl die Marke im Title stehen muss. `lintBrandNameInSeoSource`
liest deshalb `src/data/site-data.ts` und prüft, ob im `seo`-Block ein **ausgeschriebenes**
Literal steht. Kommentare und `${…}`-Interpolationen zählen nicht mit.

### Bekannte Grenze: Umschreibungen

Ein Literal-Guard fängt nur, was wörtlich übereinstimmt. Weicht die Schreibweise ab, sieht
er nichts — die Umbenennung kostet trotzdem Handarbeit:

| Kunde | `siteData.name` | `seo.titleTemplate` | Guard |
|---|---|---|---|
| zink-baeckerei | `Zink Bäckerei & Konditorei` | `%s \| Bäckerei Zink` | still |
| gottl-richter-gomeier | `Sachverständigenbüro Gottl Richter Gomeier` | `%s \| GRG` | still |
| digital-direkt | `Digital-Direkt GmbH` | `%s \| DD` | still |

Das ist keine Lücke, die sich mit mehr Regex schließen lässt — „GRG" ist für jede
Zeichenkettenprüfung ein anderer String. Bei einer Umbenennung bleibt der `seo`-Block
deshalb **immer** eine manuelle Durchsicht, auch bei 0 Befunden.

---

## Statische Assets

### robots.txt

robots.txt braucht den Markennamen **nie**. Crawl-Direktiven sind domänenbasiert.

```txt
# Korrekt — kein Brand-Name
User-agent: *
Allow: /

Sitemap: https://mika-elektrotechnik.de/sitemap-index.xml
```

Die ai-discovery-Integration generiert `llms.txt` und `llms-full.txt` automatisch
aus `siteData` — diese Dateien enthalten den Markennamen, sind aber generiert
(kein Literal im Source). Lege **keine** statischen `public/llms.txt`-Dateien an.

### llms.txt / llms-full.txt

Ausschließlich über die ai-discovery-Integration generieren:

```ts
// astro.config.ts
import aiDiscovery from '@cw/core/integrations/ai-discovery';

export default defineConfig({
  integrations: [
    aiDiscovery({
      siteData: () => import('./src/data/site-data').then(m => m.siteData),
    }),
  ],
});
```

Kein `public/llms.txt` — der Brand-Name steht dann im generierten Output,
stammt aber aus `siteData.name` (SSOT), nicht aus einem Literal.

---

## Build-time-Guard

Die ai-discovery-Integration prüft seit v0.28.0 automatisch:

1. **siteData-Felder** (in `astro:config:done`): description, tagline, FAQs, Leistungen
2. **dist/robots.txt** (in `astro:build:done`): auf Literal-Duplikate

### Konfiguration

```ts
aiDiscovery({
  siteData: () => import('./src/data/site-data').then(m => m.siteData),

  // Standard: Warnung im Build-Log (kein Fail)
  strictBrandName: false,

  // Empfohlen sobald Customer bereinigt: Build-Fail bei Literalen
  // strictBrandName: true,
})
```

### Beispiel-Output bei Literalen

```
[ai-discovery] Brand-Name-Linter: "Mika Elektrotechnik" kommt 3× als Literal in
2 siteData-Prosa-Feld(ern) vor. Convention: nur siteData.name, generische
Formulierung in allen anderen Feldern. Siehe docs/brand-name-convention.md
  [brand-name] siteData.description: 1× — "Mika Elektrotechnik" kommt 1× als Literal...
  [brand-name] siteData.faqs[0].a: 2× — "Mika Elektrotechnik" kommt 2× als Literal...
```

---

## Rollout-Plan

### Phase 1: Guard aktiv (Standard: Warnung) — v0.28.0
- Guard warnt bei jedem Build, bricht aber nicht ab
- Customer-Sites sehen Warnungen → motiviert Bereinigung

### Phase 2: Pilot-Customer bereinigen
- `customer-mika-elektrotechnik` (Auslöser des Issues) — Folge-Issue in customer-mika-Repo
- Cluster-Scan: alle 11 Customer-Sites auf Literale prüfen

### Phase 3: strictBrandName: true
- Sobald alle Customer-Sites bereinigt: `strictBrandName: true` als Default empfehlen
- Build-Fail verhindert neue Literale

---

## Cluster-Scan-Befehl

```bash
# Alle Customer-Repos nach Literal-Duplikaten scannen (ersetze BRAND durch siteData.name)
grep -rn "BRAND" \
  src/pages/ \
  src/components/ \
  src/data/site-data.ts \
  public/ \
  --include="*.astro" \
  --include="*.ts" \
  --include="*.tsx" \
  --include="*.txt"
```

Ergebnisse aus `siteData.ts` (die `name`-Zeile selbst) sind OK.
Alle anderen Treffer sind Literal-Duplikate und müssen bereinigt werden.
