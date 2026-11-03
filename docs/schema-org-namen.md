# SchemaOrg: Namensfelder (alternateName, legalName, additionalName)

`src/components/seo/SchemaOrg.astro` kennt vier optionale Namensfelder für
Markenabgrenzung und Personen-Entitäten. Alle werden nur gerendert, wenn sie
gesetzt (und bei Arrays nicht leer) sind.

| Ebene | Prop | schema.org |
|-------|------|------------|
| Organization/LocalBusiness | `alternateName?: string[]` | `alternateName` |
| Organization/LocalBusiness | `legalName?: string` | `legalName` |
| `founder` (Person) | `additionalName?: string` | `additionalName` (zweiter Vorname) |
| `founder` (Person) | `alternateName?: string[]` | `alternateName` |

```astro
<SchemaOrg
  name="Musterbetrieb Huber"
  legalName="Musterbetrieb Huber, Inh. Max Huber"
  alternateName={['Huber Sanierung']}
  founder={{
    name: 'Max Josef Huber',
    additionalName: 'Josef',
    alternateName: ['Josef Huber'],
  }}
  ...
/>
```

Anlass: `[steller-sanierungen]` — Person „Frank Arno Steller" wird unter
„Arno Steller" gefunden; die Entität muss beide Namensformen tragen.
Kundenseiten setzen die Felder nicht an der Komponente, sondern über
`<BaseLayout schema={{ … }}>` (bzw. `LandingPage`/`ContentPage`); `SchemaProps` in
`BaseLayout.astro` reicht sie durch. Tests: `tests/blocks/schemaorg-namen.test.js`.
