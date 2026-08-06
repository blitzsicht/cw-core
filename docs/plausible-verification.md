# Plausible verifizieren — wie man belegt, dass eine neue Site wirklich misst

**Zweck:** Nach `onboard-site` (bzw. `scripts/onboard/plausible-add-site.mjs`) sicher
feststellen, ob eine Site Daten sammelt — ohne zu raten und ohne sich von den vier
Fallen unten in die Irre führen zu lassen. Geschrieben am 05./06.08.2026, nachdem genau
diese Fallen bei `platzfrei.club` rund ein Dutzend Diagnose-Runden gekostet haben — für
einen Fehler, den es nicht gab (siehe Fallstudie am Ende).

**SSOT für Box-Zugriff:** `scripts/onboard/plausible-box.mjs` (Host, Container, DB).
Diese Doku beschreibt nur die Verifikation, nicht das Anlegen.

## Die vier Fallen — in dieser Reihenfolge prüfen

**Falle 3 zuerst prüfen, wenn du automatisiert misst.** Sie ist die häufigste und die
teuerste.

### 1. ClickHouse hinkt 2–4 Minuten hinterher

Plausible puffert Events, bevor sie in ClickHouse landen. Ein `SELECT` direkt nach dem
Seitenaufruf zeigt **nichts** — das ist kein Befund, das ist der Puffer.

Noch tückischer: verschiedene Event-Typen landen in verschiedenen Flush-Batches. Es kann
so aussehen, als kämen Custom-Events an und Pageviews nicht, obwohl beide unterwegs sind.
Genau dieses Bild führt zu der falschen Diagnose „Auto-Pageviews sind kaputt".

**Regel: nach dem Seitenaufruf mindestens 4 Minuten warten, dann messen.** Und mit einem
*eigenen Pfad* testen (z. B. `/impressum`), damit die Zuordnung eindeutig ist.

### 2. `HTTP 202` ist keine Zusage

Der Event-Endpunkt quittiert **jedes** wohlgeformte Event mit `202`, auch für unbekannte
Domains — und verwirft es danach. Ein 202 im Netzwerk-Tab beweist nur, dass der Request
rausging, nicht dass er gezählt wurde. Beweis ist ausschließlich die Zeile in ClickHouse.

### 3. Ein versteckter Browser-Tab erzeugt KEINEN Pageview

**Die teuerste Falle — sie kostete am 05./06.08.2026 rund ein Dutzend Diagnose-Runden.**

Der Plausible-Tracker hält den initialen Pageview bewusst zurück, wenn die Seite beim Laden
nicht sichtbar ist, und schickt ihn erst beim Sichtbarwerden:

```js
"hidden" === document.visibilityState || "prerender" === document.visibilityState
  ? document.addEventListener("visibilitychange", …)   // warten
  : t()                                                // sofort senden
```

Browser-Automatisierung (Claude in Chrome, Playwright headless, Hintergrund-Tabs) lädt Seiten
typischerweise mit `visibilityState = "hidden"`. Ergebnis: **kein Pageview, obwohl alles
korrekt konfiguriert ist.** Custom-Events aus cw-core haben diesen Guard nicht und landen
trotzdem — genau dieses Muster („Custom-Events ja, Pageviews nein") sieht wie ein
systematischer Fehler aus und ist keiner.

**Regel: vor jeder Pageview-Messung `document.visibilityState` prüfen.** Ist es `hidden`, ist
das Ergebnis wertlos. Tab in den Vordergrund holen (andere Tabs der Gruppe schließen), erneut
laden, dann messen:

```js
document.visibilityState   // muss "visible" sein
```

Dasselbe gilt für `prerender`: mit `prefetch: { prefetchAll: true }` (cw-core-Standard)
prerendert Chrome verlinkte Seiten — deren Pageview entsteht erst beim tatsächlichen Aufruf.
Das ist gewollt und korrekt, verfälscht aber jede naive Messung.

### 4. Der Stats-API-Key taugt nicht zur Verifikation

`https://stats.blitzsicht.com/api/v1/stats/...` antwortet mit
`"Invalid API key or site ID"` — auch für seit Monaten laufende Sites. Der hinterlegte Key
ist nicht (mehr) gültig. Wer das als Site-Problem liest, sucht an der falschen Stelle.
Gegenprobe: denselben Key gegen eine **Bestandssite** feuern. Scheitert der auch, liegt es
am Key, nicht an der neuen Site.

## Verifikations-Ablauf

```bash
SSH="ssh -i ~/.ssh/id_ed25519 -o BatchMode=yes root@100.96.26.82"
PG=plausible_db-x12kp2izcjwfau5vq90clcnn
CH=plausible_events_db-x12kp2izcjwfau5vq90clcnn
```

**Schritt 1 — Site-ID holen**

```bash
$SSH "docker exec $PG psql -U postgres -d plausible_db -t -A \
  -c \"SELECT id FROM sites WHERE domain='<domain>'\""
```

**Schritt 2 — Seite im Browser aufrufen**, mit einem eindeutigen Unterpfad. Dann **4 Minuten warten**.

**Schritt 3 — Events zählen**

```bash
$SSH "docker exec $CH clickhouse-client --database plausible_events_db --query \
  \"SELECT timestamp, name, pathname FROM events_v2 WHERE site_id = <ID> \
    ORDER BY timestamp DESC LIMIT 10 FORMAT PrettyCompact\""
```

Gesund sieht so aus: `pageview` **und** `engagement` vom Tracker, dazu die cw-core-
Custom-Events (`Time on Page`, `Scroll-Tiefe`, `CTA-Klick` …).

**Schritt 4 — gegen die Fleet einordnen**, falls etwas fehlt. Diese Abfrage trennt
„Site kaputt" von „Box kaputt" in einem Aufruf:

```bash
$SSH "docker exec $CH clickhouse-client --database plausible_events_db --query \
  \"SELECT site_id, countIf(name='pageview') AS pageviews, countIf(name!='pageview') AS andere, \
    max(timestamp) AS letzter FROM events_v2 WHERE timestamp > now() - INTERVAL 7 DAY \
    GROUP BY site_id ORDER BY site_id FORMAT PrettyCompact\""
```

Haben alle anderen Sites Pageviews und nur die neue nicht, **und** liegt der letzte
Aufruf über 5 Minuten zurück, dann ist es ein echter Befund.

## Wenn es wirklich klemmt — was zuerst ausschließen

In dieser Reihenfolge, weil aufsteigend teuer:

1. **Wurde die Seite überhaupt geladen?** `curl -sI https://<domain>/js/script.js` → 200.
   Der First-Party-Proxy ist das erste, was bei fehlenden Rewrites bricht.
2. **Geht der Event-Request first-party raus?** Im Browser die Payload abfangen:

   ```js
   const o = window.fetch;
   window.__cap = [];
   window.fetch = function (u, opt) {
     if (String(u).includes('event')) window.__cap.push([String(u), String(opt && opt.body)]);
     return o.apply(this, arguments);
   };
   ```

   Erwartet: URL `/api/event` (nicht `https://stats…`), Payload mit `"d":"<domain>"`.
   Steht dort eine absolute stats-URL, fehlt `plausibleEndpoint` in `site-data.ts`.
3. **Tracker-Config in der DB** gegen eine funktionierende Site vergleichen:

   ```bash
   $SSH "docker exec $PG psql -U postgres -d plausible_db -x -c \
     \"SELECT * FROM tracker_script_configuration WHERE site_id IN (<gut>,<neu>)\""
   ```
4. **`sites`-Zeile** vergleichen (`SELECT * FROM sites WHERE id IN (…)`). Relevante Felder:
   `team_id` (muss 1 sein), `locked`, `accept_traffic_until`, `native_stats_start_at`.

## Was NICHT die Ursache ist (nachgemessen ausgeschlossen, 05.08.2026)

- **CSP.** Bei First-Party-Pfaden (`/js/script.js`, `/api/event`) braucht es *keine*
  `connect-src`-Freigabe für `stats.blitzsicht.com`. `gen-vercel-csp.mjs` meldet
  völlig zu Recht „bereits konform". Abgefangene Payloads gehen an `/api/event`.
- **Falsche Payload.** Abgefangen und geprüft:
  `{"n":"pageview","v":33,"u":"https://<domain>/","d":"<domain>","r":null}` — korrekt.
- **Tracker-Config / `sites`-Zeile.** Feld für Feld gegen eine funktionierende Site
  verglichen: identisch (inkl. `team_id`, `locked`, `accept_traffic_until`).
- **cw-core-Version.** `BaseLayout.astro` ist zwischen `v0.77.2` (Fleet) und `v0.92.0`
  (platzfrei) byte-identisch — `git diff` über beide Tags ist leer.
- **Fehlender `site_memberships`-Eintrag.** Die Box läuft im Teams-Modell
  (`plausible-box.mjs`: `TEAM_ID = 1`), `site_memberships` ist ungenutzt.

## Fallstudie: der „fehlende Pageview" bei platzfrei.club (aufgeklärt)

**Symptom:** Normale Seitenaufrufe erzeugten keinen `pageview`, während Custom-Events
derselben Seite zuverlässig landeten. Alle 13 anderen Fleet-Sites zählten sauber.

**Ursache:** Falle 3 — sämtliche Messungen liefen in einem versteckten Automations-Tab
(`visibilityState = "hidden"`). Der Tracker hielt den initialen Pageview korrekt zurück.
**Es gab keinen Fehler an der Site.** Beweis: derselbe Aufruf im sichtbaren Tab schickt
sofort `{"n":"pageview",…}` — verifiziert mit deploytem Interceptor am 06.08.2026.

**Warum die Fleet gesund aussah:** Ihre Zahlen stammen von echten Besuchern mit sichtbaren
Tabs. platzfrei war zu dem Zeitpunkt einen Tag alt und hatte außer meinen
Automatisierungs-Aufrufen keinen Traffic — dadurch bestand die gesamte Stichprobe aus
Hidden-Tab-Ladevorgängen.

**Was die Diagnose so lange verschleppt hat**, in absteigender Kostenreihenfolge:

1. Nicht geprüft, ob die Messumgebung selbst valide ist. Der billigste Check
   (`document.visibilityState`) kam als letzter statt als erster.
2. Zu früh gemessen (Falle 1) — erzeugte zwischendurch die falsche Meldung, gar nichts käme an.
3. In-Page-Replays der Ladesequenz. Falsch-negativ wegen Tracker-Guards (`plausible.l`,
   „already initialized"), zwei Runden verloren.
4. Plausible klingende Hypothesen ohne Gegenprobe: CSP-Blockade, `autoCapturePageviews`
   fehlt in den cw-core-Optionen, cw-core-Versionsregression. Alle drei falsch — jede kostete
   eine Runde. **Wenn eine Fleet mit identischem Code gesund ist, ist die Hypothese
   „der Code ist kaputt" widerlegt, bevor man sie prüft.**

**Merksatz:** Erst die Messung validieren, dann das Gemessene. Ein Widerspruch zwischen
Befund und gesunder Vergleichsgruppe ist ein Hinweis auf die Messmethode, nicht auf das
Messobjekt.

## Checkliste für neue Sites

- [ ] `curl -sI https://<domain>/js/script.js` → 200
- [ ] `site-data.ts`: `plausibleScript: '/js/script.js'` **und** `plausibleEndpoint: '/api/event'`
      (niemals die stats-URL — sonst lädt der Browser drittanbieterseitig am Proxy vorbei)
- [ ] `vercel.json`: beide Rewrites, pa-ID korrekt
- [ ] `hasPlausible={true}` in `datenschutz.astro` — sonst misst die Seite etwas, das sie
      nicht erklärt
- [ ] Seite aufrufen → **4 Minuten warten** → `pageview` + `engagement` in ClickHouse
