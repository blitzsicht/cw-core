# PaketeSection + AddOnsSection (cw-core v0.13.0-rc.1)

Pricing-Block für Customer-Sites — 3-Pakete-Grid + (optionale) Add-Ons-Sektion.

Plan-Phase 2: Blitzsicht Pricing-Refresh, siehe `plans/kunde-markus-eule-will-spicy-pike.md`.

## PaketeSection

### Simple-Modus (Legacy, backward-compatible)

Wie v0.11/v0.12: einfache `features: string[]`-Liste.

```astro
---
import PaketeSection from '@cw/core/components/blocks/PaketeSection.astro';
---
<PaketeSection
  items={[
    {
      name: 'Starter',
      subtitle: 'Für Solo + kleine Teams',
      priceSetup: 2490,
      priceMonthly: 79,
      features: ['8–12 Seiten', '30 Min Support/Monat', '48h Reaktion'],
    },
    { name: 'Business', subtitle: '…', priceSetup: 4990, priceMonthly: 149, features: [...], highlighted: true },
    { name: 'Enterprise', subtitle: '…', priceSetup: 9990, priceMonthly: 299, features: [...] },
  ]}
/>
```

### Detailed-Modus (v0.13+, Tiered Services)

Mit `detailedFeatures` werden Variants pro Item gerendert:

- `'included'` → ✓ (grüner Haken)
- `'excluded'` → — (graues Em-Dash)
- `'addon'` → + (mit Preis-Badge, z.B. "+29 €/Mo")

```astro
<PaketeSection
  items={[
    {
      name: 'Starter',
      subtitle: 'Für Solo + kleine Teams',
      priceSetup: 2490,
      priceMonthly: 79,
      features: [], // bleibt leer wenn detailedFeatures gesetzt
      detailedFeatures: [
        { label: '8–12 Seiten', variant: 'included' },
        { label: '30 Min Support/Monat', variant: 'included' },
        { label: 'AI-SEO Starter-Pack', variant: 'included',
          tooltip: 'llms.txt, FAQ-Schema, sameAs, Content-Stats, WhatsApp-Sticky' },
        { label: 'Plausible-Events (CTA/Scroll-Tracking)', variant: 'excluded' },
        { label: 'GMB-Setup + GSC-Verifizierung', variant: 'excluded' },
        { label: 'Cal-Booking', variant: 'addon', addonPrice: '+29 €/Mo',
          tooltip: 'Bei Business + Enterprise inkl.' },
      ],
    },
    {
      name: 'Business',
      subtitle: 'Für Wachsende',
      priceSetup: 4990,
      priceMonthly: 149,
      features: [],
      highlighted: true,
      detailedFeatures: [
        { label: '15–30 Seiten', variant: 'included' },
        { label: '60 Min Support/Monat', variant: 'included' },
        { label: 'AI-SEO Starter-Pack', variant: 'included' },
        { label: 'Plausible-Events (CTA/Scroll-Tracking)', variant: 'included' },
        { label: 'GMB-Setup + GSC-Verifizierung', variant: 'included' },
        { label: 'Cal-Booking', variant: 'included' },
      ],
    },
    // Enterprise: alle ✓ + zusätzliche Items (Quartals-Audit, Bing/IndexNow…)
  ]}
/>
```

### Type-Reference

```typescript
export interface PaketeFeature {
  label: string;                  // kann HTML enthalten
  variant: 'included' | 'excluded' | 'addon';
  tooltip?: string;
  addonPrice?: string;            // nur bei variant='addon'
}

export interface PaketeItem {
  name: string;
  subtitle: string;
  priceSetup: number;
  priceMonthly: number;
  pages?: string;
  features: readonly string[];           // Legacy/Simple-Modus
  detailedFeatures?: readonly PaketeFeature[];  // v0.13+
  highlighted?: boolean;
  ctaHref?: string;
  ctaLabel?: string;
}
```

---

## AddOnsSection

Eigenständige Sektion für paket-unabhängige Zusatzleistungen. Wird typischerweise
**unter** `<PaketeSection>` auf der Pakete-Seite eingeblendet.

```astro
---
import AddOnsSection from '@cw/core/components/blocks/AddOnsSection.astro';
---
<AddOnsSection
  items={[
    {
      slug: 'cal-booking-starter',
      name: 'Cal-Booking-Upgrade (Starter)',
      description: 'Schaltet Termin-Buchung via Cal.eu im Starter-Paket frei. Sonst inkl. ab Business.',
      price: '29 €/Mo',
      priceModel: 'monthly',
      category: 'booking',
    },
    {
      slug: 'gmb-aktivierung',
      name: 'GMB-Aktivierungs-Service',
      description: 'Monatliche GBP-Pflege: 2 Posts, 4 Photos, Review-Antworten. Wir kümmern uns drum.',
      price: '290 €/Mo',
      priceModel: 'monthly',
      category: 'seo',
    },
    {
      slug: 'quartals-case-study',
      name: 'Quartals-Case-Study',
      description: 'Eine echte Case Study aus Ihrer Auftragsliste, mit CaseStudyBlock + Schema.org Review.',
      price: '390 €',
      priceModel: 'tiered',
      category: 'content',
      hint: 'Pro Quartal — verlängert sich automatisch',
    },
    {
      slug: 'blog-artikel-single',
      name: 'Blog-Artikel',
      description: 'SEO-optimiert, mit Schema.org Article. 800–1500 Wörter, inkl. Bild-Recherche.',
      price: '80 €',
      priceModel: 'one-time',
      category: 'content',
    },
    // …weitere Add-Ons…
  ]}
/>
```

### Kategorie-Filter

Wenn mehr als 1 Kategorie vorhanden ist, werden automatisch Tab-Buttons gerendert:
**Termin-Buchung · Content · SEO & AI · Rechtliches · Support**

Click toggelt den Filter (1x = aktivieren, nochmal = zurücksetzen).

Single-Category-Modus via Prop:

```astro
<AddOnsSection items={items} filterCategory="content" heading="Content-Erweiterungen" />
```

### Type-Reference

```typescript
export type AddOnCategory = 'booking' | 'content' | 'seo' | 'legal' | 'support';
export type AddOnPriceModel = 'monthly' | 'one-time' | 'tiered';

export interface AddOnItem {
  slug: string;             // für Tracking + Default-CTA-Anchor
  name: string;
  description: string;
  price: string;            // "29 €/Mo" / "150 €" / "ab 490 €"
  priceModel: AddOnPriceModel;
  category: AddOnCategory;
  ctaHref?: string;         // Default: /kontakt?anfrage=<slug>
  ctaLabel?: string;
  hint?: string;
}
```

---

## Analytics-Events

Beide Komponenten emittieren Plausible-Events (via `utils/analytics/track`):

- `Package Click` mit `package_name`
- `AddOn Click` mit `addon_slug`

Tracking läuft nur wenn `track` korrekt initialisiert ist (siehe Plausible-Setup-Doc).

---

## Migration von v0.12.x zu v0.13.0-rc.1

**Keine Breaking Changes.**

- Sites mit nur `features: string[]` → kein Update nötig.
- Sites die auf Tiered-Sichtbarkeit upgraden wollen:
  1. cw-core auf v0.13.0-rc.1 Commit pinnen
  2. `detailedFeatures` in `site-data.ts` Paket-Einträgen befüllen
  3. Optional: `<AddOnsSection>` einbinden

---

## Designentscheidungen

- **`excluded` als graues Em-Dash, nicht roter Strike** — vermeidet negative Wahrnehmung.
- **`addon` mit Preis-Badge inline** — Customer sieht sofort den Aufpreis, ohne Tooltip-Klick.
- **AddOnsSection als eigene Sektion (nicht im Paket-Grid)** — reduziert kognitive Last. Pakete bleiben überschaubar, Add-Ons sind sortiert + filterbar.
- **Kein Stripe-Self-Checkout** — Add-Ons werden über `/kontakt?anfrage=<slug>` angefragt, Buchhaltung läuft manuell. Self-Checkout kann später kommen.
