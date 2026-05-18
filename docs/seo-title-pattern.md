# SEO Title-Pattern für Geo+Service-Pages

Dieses Dokument beschreibt das verbindliche Title-Tag-Pattern für Service-Pages
mit Geo-Ausrichtung in `@cw/core`-Projekten.
Grundlage: Audit-Erkenntnisse aus blitzsicht- und GRG/gottl-Kampagnen (2025–2026).

---

## Das Pattern

```
[Service] [Geo] | [Brand] — [USP-3-Wörter]
```

| Segment | Bedeutung | Zeichengrenze |
|---------|-----------|---------------|
| `[Service]` | Hauptkeyword, wie Nutzer suchen (z. B. „Website Handwerker") | 15–25 Zeichen |
| `[Geo]` | Stadt oder Ortsteil — so spezifisch wie möglich | 6–15 Zeichen |
| `[Brand]` | Kurzname (nicht Slogan, nicht Domain) | 4–12 Zeichen |
| `[USP-3-Wörter]` | Konkreter Vorteil — 3 Wörter max., keine Adjektive ohne Inhalt | 10–20 Zeichen |

**Gesamtlänge:** 50–60 Zeichen (Google zeigt ~58 Zeichen auf Desktop).

---

## Beispiele aus echten Projekten

### blitzsicht (Webdesign)

```
Website Handwerker Regensburg | Blitzsicht — 7 Werktage fertig
```

```
Webseite Gastronomie Regensburg | Blitzsicht — Fix & Fertig
```

### GRG / gottl (Sachverständige)

```
Immobiliengutachter Donaustauf | GRG — Verkehrswertgutachten
```

```
Sachverständiger Tegernheim | GRG — Wertgutachten
```

```
Verkehrswertgutachten Regensburg | GRG — Gerichtsfest & schnell
```

---

## Meta-Description-Pattern

```
[Nutzenversprechen konkret]. [Geo-Vertrauensanker]. [CTA mit Kontaktkanal].
```

Regeln:
- Länge: 140–155 Zeichen (Google kürzt ab ~158)
- Kein Keyword-Stuffing — ein natürlicher Satz reicht
- CTA muss handlungsauslösend sein: Telefon, E-Mail oder Preis-Range

### Beispiele

**blitzsicht:**
```
Professionelle Handwerker-Website in Regensburg — in 7 Werktagen online.
Festpreis, kein Abo. Jetzt kostenlos anfragen: 0941 123 456
```

**GRG:**
```
Verkehrswertgutachten in Donaustauf und Umgebung — gerichtsfest, ISO 17024.
Kostenfreies Erstgespräch: info@grg-gutachten.de
```

**Mit Preis-Range:**
```
Wertgutachten ab 390 € für Einfamilienhäuser im Landkreis Regensburg.
Zertifizierter Sachverständiger — Angebot in 24 Std.: 0941 …
```

---

## Anti-Patterns

| Anti-Pattern | Problem | Besser |
|---|---|---|
| `So funktioniert's` | Kein Geo, kein Service-Keyword | `Website erstellen Regensburg \| Blitzsicht — 7 Werktage` |
| `Sachverständiger Donaustauf \| GRG` | Kein USP — CTR bleibt bei 0 % (gottl Audit A1/A2, Pos 7–9) | `Sachverständiger Donaustauf \| GRG — Wertgutachten` |
| `Willkommen bei Blitzsicht` | Kein Keyword, kein Geo | Pattern von vorn beginnen |
| `Blitzsicht Webdesign Regensburg GmbH` | Brand first — Keyword zu weit hinten | `Webdesign Regensburg \| Blitzsicht — …` |
| `Immobiliengutachter \| GRG Gutachten` | Doppelter Brand-Begriff, kein Geo | `Immobiliengutachter Regensburg \| GRG — …` |
| `Günstige Websites für alle` | Kein Geo, Adjektiv ohne Inhalt | `Website Handwerker Regensburg \| … — ab 790 €` |

---

## Audit-Erkenntnisse (Hintergrund)

**gottl A1/A2 — Positionen 7–9, 0 Clicks:**
- Pages ranken, aber der Title `Sachverständiger Donaustauf | GRG` enthält keinen USP.
- Nutzer wählen Ergebnis 1–3 mit klarerem Vorteilsversprechen.
- Fix: USP-Suffix `— Wertgutachten` oder `— Gerichtsfest & schnell` anhängen.

**blitzsicht Geo-Pages:**
- Title `So funktioniert's` enthält weder Geo noch Service-Begriff.
- Seite kann für keinen Suchbegriff ranken.
- Fix: Jede Geo-Page bekommt ein eigenes Title-Tag nach obigem Pattern.

---

## Implementierung in Astro-Seiten

```astro
---
import LandingPage from '@cw/core/layouts/LandingPage.astro';
---
<LandingPage
  title="Sachverständiger Donaustauf | GRG — Wertgutachten"
  description="Verkehrswertgutachten in Donaustauf und Umgebung — gerichtsfest, ISO 17024. Kostenfreies Erstgespräch: info@grg-gutachten.de"
>
  <!-- Seiteninhalt -->
</LandingPage>
```

`title` und `description` werden vom `LandingPage`-Layout direkt als `<title>` und
`<meta name="description">` gerendert — kein weiterer Konfigurationsaufwand.

---

## Checkliste vor Go-Live

- [ ] Title: 50–60 Zeichen (prüfen mit [Portent SERP Preview](https://www.portent.com/tools/serp-preview))
- [ ] Service-Keyword an Position 1
- [ ] Geo-Begriff vorhanden und spezifisch (Ortsteil > Stadt > Landkreis)
- [ ] Brand nach `|`, nicht am Anfang
- [ ] USP-Suffix vorhanden (min. 2 Wörter nach `—`)
- [ ] Meta-Description 140–155 Zeichen mit CTA
- [ ] Kein `title`-Duplicate über mehrere Geo-Pages (`/regensburg`, `/donaustauf` etc. unterscheiden sich)
