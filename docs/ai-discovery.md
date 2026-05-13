# AI-Discovery Integration

`@cw/core/integrations/ai-discovery` ist eine Astro-Integration, die zur Build-Zeit automatisch
zwei Dateien generiert, die KI-Agenten (ChatGPT, Claude, Perplexity u. a.) ermöglichen,
die Website korrekt zu verstehen und zu zitieren.

Generierte Dateien:

| Datei | Zweck |
|---|---|
| `dist/llms.txt` | Kompakte Kurzfassung (Name, Beschreibung, Leistungen, Kontakt) nach [llmstxt.org](https://llmstxt.org) Spec |
| `dist/llms-full.txt` | Vollständige Fassung mit allen Leistungen, FAQs und Unternehmensdaten |

## Installation

Die Integration ist Bestandteil von `@cw/core` — kein separates Paket erforderlich.

```jsonc
// package.json
{
  "dependencies": {
    "@cw/core": "github:siluri/cw-core#v1.0.5"
  }
}
```

## Einrichtung in `astro.config.ts`

```ts
import { defineConfig } from 'astro/config';
import aiDiscovery from '@cw/core/integrations/ai-discovery';

export default defineConfig({
  integrations: [
    aiDiscovery({
      // Pflicht: async-Callback, der das siteData-Objekt zurückgibt
      siteData: () => import('./src/data/site-data').then(m => m.siteData),

      // Optional: FAQs aus siteData extrahieren (Fallback: siteData.faqs)
      faqs: (s) => s.faqs,

      // Optional: Leistungen aus siteData extrahieren (Fallback: siteData.leistungen)
      services: (s) => s.leistungen,
    }),
  ],
});
```

## Pflichtfelder in `site-data.ts`

Folgende Felder in `siteData` werden von der Integration zwingend ausgelesen:

```ts
export const siteData = {
  // Pflicht: Firmenname (wird als H1 in llms.txt gerendert)
  name: 'Muster GmbH',

  // Pflicht: Kurzbeschreibung (wird als Blockquote in llms.txt gerendert)
  description: 'Wir sind ein Handwerksbetrieb aus Musterstadt.',

  // Pflicht: Kanonische URL der Website
  url: 'https://www.muster.de',

  // Pflicht: Kontaktinformationen
  contact: {
    phone: '+49 123 456789',
    email: 'info@muster.de',
  },

  // Pflicht: Adressdaten (Impressum)
  legal: {
    street: 'Musterstraße 1',
    zip: '12345',
    city: 'Musterstadt',
  },

  // Optional: FAQs — werden in llms-full.txt als Frage/Antwort-Blöcke gerendert
  faqs: [
    { q: 'Was kostet eine Anfrage?', a: 'Die Erstberatung ist kostenlos.' },
  ],

  // Optional: Leistungen — werden in llms.txt und llms-full.txt aufgelistet
  leistungen: [
    {
      title: 'Beratung',
      description: 'Individuelle Erstberatung vor Ort.',
      slug: 'beratung', // optional, erzeugt Link auf /leistungen/<slug>
    },
  ],
};
```

## Generierte Ausgabe

Nach `pnpm build` befinden sich die generierten Dateien in `dist/`:

```
dist/
  llms.txt       → https://www.muster.de/llms.txt
  llms-full.txt  → https://www.muster.de/llms-full.txt
```

**`llms.txt`** — Kurzfassung nach llmstxt.org Spec:
- H1: Firmenname
- Blockquote: Beschreibung
- Sektion "Was wir anbieten" mit Leistungsliste (inkl. Deep-Links)
- Sektion "Kontakt" mit Adresse, Telefon, E-Mail

**`llms-full.txt`** — Vollständige Fassung:
- Alle Daten aus `llms.txt`
- Detaillierte Leistungsbeschreibungen mit URLs
- Vollständige FAQ-Liste

## Optionale Felder

| Feld | Typ | Beschreibung |
|---|---|---|
| `tagline` | `string` | Wird in zukünftigen Versionen in `llms.txt` eingebunden |
| `seo.foundingDate` | `string` | Gründungsjahr — erscheint in Sektion "Eckdaten" |
| `seo.areaServed` | `string[]` | Servicegebiet — erscheint in Sektion "Eckdaten" |

## Hinweise

- Die Integration läuft ausschließlich im `astro:build:done`-Hook — kein Dev-Server-Overhead.
- `llms.txt` und `llms-full.txt` werden bei jedem `pnpm build` neu generiert. Die Felder
  `Letzte Aktualisierung` in `llms-full.txt` enthält das Build-Datum (ISO 8601).
- Keine externen Abhängigkeiten — ausschließlich Node.js built-ins (`fs`, `path`, `url`).
