# checks/ — die Flotten-Guards

Zwei Prüfungen, die in **jedem** Customer-Repo gegen den frisch gebauten Build laufen:

| Spec | Prüft | Bricht ab bei |
|---|---|---|
| `mobile-audit.spec.ts` | horizontaler Überstand, Bilder breiter als der Viewport, Touch-Ziele | Überstand, zu breite Bilder |
| `a11y-audit.spec.ts` | axe-core, WCAG 2.0/2.1/2.2 A + AA | `critical`- und `serious`-Verstößen |

Beide holen ihre Seitenliste aus `sitemap-0.xml` des Builds (`seiten.ts`) — **nicht** aus einer
gepflegten Liste. Der Anlass steht in `seiten.ts`: am 27.08.2026 sah die damals fest verdrahtete
Liste sieben von 49 Seiten, und `/forschung` — das an dem Tag nachweislich mobil brach — war
nicht dabei. Ein Guard, der die Hälfte nicht ansieht, ist kein Nachweis.

## Härtegrad: mobil hart, a11y meldend — mit Schalter

`mobile-audit` blockt immer. Horizontaler Überstand und Bilder breiter als der Viewport sind
sichtbare Defekte auf dem Gerät, mit dem die meisten Besucher kommen.

`a11y-audit` meldet per Default nur. Das ist gemessen, nicht vermutet: am 28.08.2026 wurden
alle 23 Kundenrepos gebaut und geprüft — a11y war in 19 von 22 rot, mit `color-contrast` als
dominierender Ursache (bei digital-direkt 150 von 158 Befunden). Ein Check, der am Rollout-Tag
flächig rot steht, wird weggeklickt; genau so ist der Vorgänger-Guard gestorben.

Drei Repos waren dabei schon vollständig grün (`donau-profi`, `pferdesport-silberhorn`,
`weinkontor-sinzing`). Die Prüfung unterscheidet also — sie ist nicht einfach überall rot.

**Ein Repo, das seinen Rückstand abgearbeitet hat, stellt a11y hart:** Datei
`.github/a11y-blocking` im Kundenrepo anlegen. Der Schalter liegt damit dort, versioniert und
begründbar, statt als Sonderfassung der Vorlage, die der nächste Rollout überschreiben würde.
Löschen macht die Prüfung wieder meldend.

## Warum die Specs hier liegen und nicht in cw-visual-tests

`cw-visual-tests` ist **privat**. Ein Workflow in einem Kundenrepo bräuchte zum Auschecken einen
Deploy-Key als Repo-Secret — bei 23 Repos also 23 Geheimnis-Stellen und 23 Ausfallmöglichkeiten.
Genau so eine fiel vom 03. bis 07.08.2026 still aus (abgelaufenes PAT) und noch einmal ab dem
25.08.2026 (Org-Umzug, Deploy-Key-Autorisierung folgt dem GitHub-Redirect nicht).

`cw-core` ist **public**: `actions/checkout` holt es ohne Schlüssel. Org-Secrets wären die
Alternative gewesen, scheiden aber aus — die Organisation liegt auf dem Free-Plan, und der
kennt keine Org-Secrets für private Repos.

In `cw-visual-tests` bleibt das A/B-Gate (`visual.spec.ts`, `visual-ab.yml`): dieselbe
Kundenseite zweimal bauen, alter Core gegen Kandidat, und diffen. Das braucht Snapshots und
gehört nicht hierher.

## Eigene package.json

Absicht. Die Wurzel von cw-core zieht astro, sharp, satori und exiftool-vendored — das in jedem
CI-Lauf von 23 Repos zu installieren wäre Verschwendung. Hier sind es drei Pakete.

`checks/` steht **nicht** in den `exports` von `cw-core/package.json`. Kundenrepos installieren
cw-core als `dependency`; deren devDependencies löst pnpm gar nicht erst auf. Der Guard kostet
eine Kunden-Installation also nichts.

## Lokal fahren

```bash
cd <kundenrepo> && pnpm build
cd cw-core/checks && pnpm install
DIST_DIR=<kundenrepo>/dist pnpm test      # dist/client bei Repos mit Vercel-Adapter
```
