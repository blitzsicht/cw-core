# UX-Konventionen

Verbindlich für alle cw-core-Komponenten und alle Customer-Repos. Wer eine Aktion platziert,
schlägt hier nach, statt pro Seite neu zu entscheiden.

## Richtung: Vorwärts gehört nach rechts

Operator-Vorgabe vom 06.08.2026. Sie folgt der Leserichtung: was weiterführt, liegt in
Leserichtung vorn — rechts. Was zurückführt, liegt hinter einem — links.

Vage formuliert („alles rechts") kippt die Regel bei der ersten Hero-Sektion. Deshalb in drei
anwendbaren Sätzen:

1. **Button-Paar:** Die Vorwärts-/Primäraktion ist das **rechteste** Element der Gruppe.
2. **Alleinstehende Vorwärts-CTA in einer Inhaltsspalte:** **rechtsbündig** zur Spaltenkante.
3. **Zurück-Navigation:** bleibt **links**, als `.btn-outline` (nicht als nackter Textlink —
   eine Navigationsaktion soll wie eine Aktion aussehen und die 48-px-Tap-Target-Regel erfüllen).

### Ausnahme: Hero und CTABlock

Dort behält die Buttongruppe ihre bisherige Ausrichtung — links beim Hero, zentriert beim
CTABlock. Geändert wird nur die **Reihenfolge im Paar**.

Grund: Eine rechtsbündige Buttonzeile unter einer linksbündigen Textspalte wirkt abgerissen; die
Regel würde gegen ihren eigenen Zweck arbeiten. Regel 2 greift dort, wo eine CTA **allein** in einer
Textspalte steht.

### Mobile

Unter 641 px stapeln die Buttons. Dort gibt es kein „rechts" — die Primäraktion steht **oben**
(Daumenreichweite) und über die volle Breite.

Umgesetzt über `order: -1` auf `.btn-outline` **nur im Desktop-Breakpoint**; die DOM-Reihenfolge
bleibt primary-first.

**Bewusster Trade-off:** Auf dem Desktop weicht damit die Fokusreihenfolge (primär → sekundär) von
der Leserichtung ab. Die Alternative — die DOM-Reihenfolge umzudrehen — würde auf Mobil die
Sekundäraktion nach oben ziehen und die wichtigere Aktion nach unten. Das wiegt schwerer als eine
Fokusreihenfolge, die weiterhin sinnvoll bleibt (WCAG 2.4.3 verlangt eine bedeutungserhaltende
Reihenfolge, nicht die visuelle).

### Umgesetzt in

| Ort | Wie |
| --- | --- |
| `src/components/blocks/Hero.astro` | `.hero-cta .btn-outline { order: -1 }` ab 641 px |
| `src/components/blocks/CTABlock.astro` | `.cta-buttons .btn-outline { order: -1 }` ab 641 px |
| `src/components/forms/ContactForm.astro` | `.form-submit { justify-content: flex-end }`, mobil volle Breite |
| `customer-platzfrei` `/studios/<slug>` | `.studio-cta-row` rechtsbündig (Regel 2), Zurück-Button links (Regel 3) |

Keine generische Utility-Klasse: diese drei Komponenten decken die Vorwärts-Aktionen der Fleet ab.
Eine `.action-row` ohne zweiten Verwender wäre Vorratsbau.
