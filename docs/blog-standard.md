# Blog-Standard: „Kurz gesagt“ und viele Bilder

Operator-Regel vom 26.09.2026: „mit vielen Fotos und am Anfang immer ein TL;DR — das gehört
als Rule definiert und bei jedem Blog so.“ Diese Datei ist die Quelle der Regel; die
Kunden-Repos verweisen hierher.

## Die Regel

| Was | Soll | Wer prüft |
|---|---|---|
| „Kurz gesagt“ | Frontmatter-Feld `kurzGesagt`, 2–4 Sätze, 120–600 Zeichen | Guard (+ Content-Schema, wo vorhanden) |
| Kasten | `BlogKurzGesagt.astro` direkt über dem ersten Absatz; `## Kurz gesagt` im Text ist verboten | Guard |
| Bilder im Text | `max(3, ceil(Wörter / 400))`, das Hero zählt nicht | Guard, streng |
| Hero | nicht noch einmal im Text | Guard |
| Herkunft | jedes Textbild hat eine Regel in `src/data/bild-herkunft.ts` | Guard |
| KI-Bild | sichtbarer Titel „Symbolbild, KI-generiert“ (wird zur Bildunterschrift) | Guard |

Der Name „Kurz gesagt“ statt „TL;DR“ ist Operator-Entscheid: Die Zielgruppe sind Betriebe,
nicht Entwickler. Der Text fasst **nur zusammen, was im Beitrag steht** — keine neuen
Zahlen, Preise oder Versprechen.

## Bildquellen, in dieser Reihenfolge

1. Eigene Fotos des Betriebs (Produkte, Werkstatt, Team nur mit Freigabe).
2. Screenshots eigener oder öffentlicher Seiten, nie Screenshots fremder Betriebe.
3. Gemini-Symbolbilder (`gemini-2.5-flash-image`), mit Titel „Symbolbild, KI-generiert“.
   Jedes Bild ansehen und den Alt-Text an das anpassen, was wirklich drauf ist
   (blitzsicht: 3 von 49 falsch beschrieben).

Dateien nach `public/images/blog/<slug>/`, WebP ≤ 200 KB (Perf-Budget-Guard).

## Technik

| Baustein | Export |
|---|---|
| Prüfregeln | `@cw/core/blog-standard` (`pruefe`, `pruefeVerzeichnis`, `sollBilder`) |
| prebuild-CLI | `node node_modules/@cw/core/scripts/check-blog-standard.mjs [dir] [--herkunft modul] [--ohne-ki-unterschrift] [--warnen]` |
| Zero-Config | ai-discovery prüft `src/content/blog` bei jedem `astro build`, Abschalten nur mit `blogStandard: false` |
| Bilder → `<figure>` | `@cw/core/blog-standard/rehype` in `markdown.rehypePlugins` |
| Kasten | `@cw/core/components/blocks/BlogKurzGesagt.astro`, Farben über `--blog-kurz-bg`, `--blog-kurz-rand` |
| Bilder erzeugen + einfügen | `node node_modules/@cw/core/scripts/blog-bilder-erzeugen.mjs` liest `marketing/blog-bilder/manifest.json` (`art`: `ki`, `screenshot`, `foto`) |

Im Content-Schema: `kurzGesagt: z.string().min(120).max(600)`. Ins Article-/BlogPosting-
JSON-LD als `abstract`.

## Neuer Beitrag

1. `kurzGesagt` ins Frontmatter.
2. Bildplätze ins Manifest, dann `blog-bilder-erzeugen.mjs` — legt sie nach
   `public/images/blog/<slug>/` und fügt `![Alt](pfad "Unterschrift")` in den Text ein.
   Danach jedes Bild ansehen.
3. Herkunft in die Bild-Arbeitsliste → `scripts/bildherkunft-uebernehmen.mjs`.
4. `pnpm build` — der Guard sagt, was fehlt.

## Herkunft

customer-blitzsicht #154 und #155 (26.09.2026), nach cw-core gehoben mit blitzsicht-ops #894.
