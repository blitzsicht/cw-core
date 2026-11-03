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
  name="Steller Sanierungen"
  legalName="Steller Sanierungen e. K."
  alternateName={['Steller Sanierung']}
  founder={{
    name: 'Frank Steller',
    additionalName: 'Arno',
    alternateName: ['Arno Steller'],
  }}
  ...
/>
```

Anlass: `[steller-sanierungen]` — Person „Frank Arno Steller" wird unter
„Arno Steller" gefunden; die Entität muss beide Namensformen tragen.
Tests: `scripts/schema-org.test.mjs`.
