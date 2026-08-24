# EU-Kennzeichnungssymbole für KI-Inhalte

Die zwölf SVGs in diesem Ordner stammen von der Europäischen Kommission und gehören zum
Symbolsatz für die Kennzeichnung KI-erzeugter Inhalte.

**Quelle und Wiederbeschaffungsweg:**
<https://digital-strategy.ec.europa.eu/de/policies/eu-icons-labelling-ai-generated-content>

## Nutzungsbedingungen

Die Kommission hält dort ausdrücklich fest: **„Die Verwendung dieser EU-Symbole ist
fakultativ, die Kennzeichnungsanforderungen nach Artikel 50 des KI-Gesetzes jedoch nicht."**

Frei verwendbar, **ohne Attributionspflicht**. Verlangt wird von der Kennzeichnung selbst:

- wahrnehmbar spätestens bei erster Exposition,
- in den Inhalt eingebettet,
- beim Teilen oder Herunterladen erhalten,
- in sichtbarer Größe,
- mit Alt-Text bzw. ARIA-Beschriftung.

Die letzten beiden Punkte erfüllt `AiLabel.astro`, den dritten die Metadaten-Stufe im
Post-Build-Hook (`ai-discovery/geotag.js`). Das Symbol allein genügt nicht: Art. 50 Abs. 5
verlangt Barrierefreiheit, deshalb rendert die Komponente **immer auch Text**.

## Dateien

Drei Symbole à vier Varianten (schwarz/weiß, je deckend/transparent):

| Symbol | Wofür |
|---|---|
| `ai-*` | allgemein „KI" |
| `ai-generated-*` | vollständig KI-erzeugt |
| `ai-modified-*` | KI-bearbeitet |

Die Originaldateinamen (`LABEL_AI GENERATED_black transparent.svg`) enthielten Leerzeichen
und wurden beim Import auf Kleinschreibung mit Bindestrichen normalisiert — Leerzeichen in
Importpfaden sind eine unnötige Fehlerquelle.

## Warum sie hier liegen

Bis zum 24.08.2026 existierte der Satz nur unter `~/Downloads/LABEL_AI_GENERATED_SVG_…` —
ein flüchtiger Ort, der bei der nächsten Aufräumaktion verschwindet. Ein Repo, das eine
Rechtspflicht erfüllt, darf nicht von einem Downloads-Ordner abhängen.
