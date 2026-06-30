# CSP `unsafe-inline` — Rationale & Risk-Acceptance

**Status:** Akzeptiertes Risiko (Stand 2026-04-30)
**Geltungsbereich:** alle Customer-Sites auf cw-core (siluri.de, blitzsicht.com, gottl-richter-gomeier.de, …)
**Review-Frequenz:** jährlich, oder bei Astro Major-Bump

## Kontext

Die Content-Security-Policy in `templates/vercel.template.json` und allen abgeleiteten `vercel.json`-Dateien enthält:

```
script-src 'self' 'unsafe-inline' …
style-src  'self' 'unsafe-inline'
```

Audit-Tools (cw-audit, Mozilla Observatory, securityheaders.com) markieren `unsafe-inline` üblicherweise als Schwachstelle, weil ein erfolgreicher XSS-Vektor damit nicht durch CSP abgefangen wird.

## Warum `unsafe-inline` aktuell bleibt

1. **Astro 4 + Tailwind v4 generieren inline `<style>`-Blöcke pro Page** — aus den scoped `<style>` der Components und aus dem critical CSS für das above-the-fold Rendering. Ohne `unsafe-inline` müssten alle diese Hashes oder Nonces in der CSP stehen, was statisch nicht möglich ist.
2. **Dynamische `style={…}`-Attribute** auf Components wie `BentoGrid` setzen CSS Custom Properties zur Render-Zeit. Diese sind weder hashable noch nonce-fähig ohne SSR.
3. **Static-Output-Mode**: cw-core-Sites werden als statische HTML-Bundles auf Vercel deployt. Eine Nonce-basierte CSP würde SSR oder Edge-Middleware erzwingen, was Hosting-Kosten und Komplexität erhöht.

## Realer Bedrohungsvektor

XSS via `unsafe-inline` ist nur dann ausnutzbar, wenn eine andere Schwachstelle bereits Markup einschleust (Stored-XSS, Reflected-XSS). cw-core-Sites haben:

- **Keine User-Generated-Content** auf den ausgelieferten Pages (keine Kommentare, Forum, Profile)
- **Keine Server-Side-Rendering von User-Eingaben** (alle Inputs gehen ausschliesslich an validierte Form-Handler `cw-core/utils/forms`)
- **Keine Third-Party-Embeds** ausser Plausible Analytics, Cal.com Booking, Tally Forms (alle in `connect-src`/`frame-src` whitelisted)

Damit ist `unsafe-inline` aktuell ein theoretischer „Defense-in-Depth"-Verlust, kein realer Angriffsvektor.

## Geprüfte Alternativen + Aufwand

| Option | Aufwand | Bewertung |
|---|---|---|
| Hash-basierte CSP (build-time SHA-256 pro inline-Block) | 16–20h | overengineered für Mittelstand-Site, fragil bei Astro-Updates |
| Nonce-basierte CSP (Edge-Middleware + SSR-Switch) | 8–12h | bricht static-output, erhöht Vercel-Function-Kosten |
| Astro `experimental.csp` (Astro 5+) | 4–6h | abhängig von Astro-Major-Bump, derzeit nicht in Roadmap |
| **Akzeptieren + dokumentieren (dieser Beschluss)** | 1h | aktuell empfohlen |

## Trigger für Re-Evaluation

Wir bewerten diese Entscheidung neu, sobald:

- **User-Generated-Content** (Kommentare, Profile) auf einer Site eingeführt wird
- **Third-Party-Scripts** mit dynamischen Tags hinzukommen (Tag-Manager, Heatmaps)
- **Astro 5+** auf cw-core mit stabiler `experimental.csp`-Integration verfügbar wird
- **Compliance-Anforderung** eines Kunden eine strikte CSP fordert (B2B-Banken, Versicherungen)

## Defense-in-Depth-Massnahmen, die bestehen bleiben

Auch ohne strikte CSP sind aktiv:

- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `X-Frame-Options: SAMEORIGIN` + `frame-ancestors 'none'` (CSP)
- `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`
- Eingabe-Validierung in allen Form-Handlern (`cw-core/utils/forms/handle-submission`)
- Cloudflare WAF + Bot-Fight-Mode + Turnstile (siehe `project_spam_defense_stack.md`)

## Audit-Tool-Wertung

`cw-audit` (intern) wertet `security.headers.csp` und `security.csp-effective` nicht mehr als `warn`, sondern als `info`, sofern **alle** anderen Pflicht-Header (HSTS, X-Content-Type-Options, Referrer-Policy, X-Frame-Options) sauber gesetzt sind. Begründung: das Risiko ist akzeptiert und dokumentiert.

Externe Audit-Tools (Mozilla Observatory, securityheaders.com) bleiben bei „strict CSP" als Bewertung. Das ist erwartetes Verhalten; bei Kunden-Reviews kann auf dieses Dokument verwiesen werden.

## Pragma: explicit-domain neben 'self' (seit Bisection 2026-05-12)

**Pflicht-Pattern für alle Source-Directives:**

```
script-src 'self' https://<DOMAIN> 'unsafe-inline' …
script-src-elem 'self' https://<DOMAIN> 'unsafe-inline' …
style-src 'self' https://<DOMAIN> 'unsafe-inline'
style-src-elem 'self' https://<DOMAIN> 'unsafe-inline'
font-src 'self' https://<DOMAIN> data:
connect-src 'self' https://<DOMAIN> …
```

Wo `<DOMAIN>` der Production-Origin der Customer-Site ist (z.B. `digital-direkt.com`).

### Symptom
Auf `digital-direkt.com` (Astro 5 statisch + Tailwind v4 + @cw/core v0.9.10, Vercel-deployed) blockt der Browser **same-origin** `<link rel="stylesheet">` und `<script src="">` mit:

```
Loading the stylesheet 'https://digital-direkt.com/_astro/foo.css' violates
the following Content Security Policy directive: 'style-src 'self' 'unsafe-inline''.
The action has been blocked.
```

Reproduziert in Edge **und** Safari, im Inkognito, in Mobilfunk und WLAN.

### Was verifiziert ausgeschlossen ist
- ✗ Server sendet 2 CSP-Header: `grep -c` = 1
- ✗ Meta-CSP im HTML
- ✗ Service Worker
- ✗ `experimental.csp` in `astro.config.ts`
- ✗ @cw/core-Integration injiziert CSP (Code-Sweep)
- ✗ Edge-Middleware / API-Routes setzen CSP
- ✗ Browser-Extension / Tracking-Prevention (Safari reproduziert ohne Extensions)
- ✗ Network-Layer-MITM (User-Terminal-curl identisch)
- ✗ Vercel-Edge-Cache (force-redeploy `age:0` ändert nichts)
- ✗ Vercel-Toolbar (Inkognito reproduziert)
- ✗ Astro `crossorigin`-Attribut auf `<link>` (Live-HTML hat keine)
- ✗ Vercel rewritet `/_astro/*` zu fremder Origin (curl zeigt 200 direkt)
- ✗ Link-Preload-HTTP-Header (`curl -I | grep -i ^link:` leer)
- ✗ Header-Encoding (Byte-Dump zeigt sauberes ASCII)

### Bisection-Befund
- C1 (CSP komplett raus) → rendert
- C5 (NUR `script-src 'self' …`) → rendert
- C6 (`script-src` + `script-src-elem`) → rendert
- **C7 (script* + `style-src 'self' 'unsafe-inline'`) → bricht**
- **C8 (script* + `style-src-elem 'self' 'unsafe-inline'`) → bricht auch**

Beide `style-src{,-elem}` mit `'self'` einzeln brechen same-origin Stylesheets.

### Pragma-Fix (verifiziert in Production)
Expliziter Origin neben `'self'` in allen Source-Directives. Commit `8e91d5d` auf customer-digital-direkt — rendert mit Styles, 0 Violations.

### Reviewer-Erklärung (zwei Hypothesen, nicht final geklärt)
1. Browser sieht einen anderen CSP-Header als curl (Vercel sendet je nach Client unterschiedlich)
2. Header-Parser im Browser hat einen Edge-Case mit `'self' 'unsafe-inline'` ohne expliziten Host

Beide Hypothesen werden durch das Pragma umgangen. Sicherheitstechnisch ist `'self' https://<domain>` ≡ nur `'self'`.

### Anwendung
- **Neue Customer-Sites:** `templates/vercel.template.json` enthält `{{DOMAIN}}`-Placeholder, der via `@cw/cli` oder manuell durch echten Origin ersetzt wird.
- **Bestehende Customer-Sites:** vercel.json einzeln patchen (siehe `/Users/johannesgottl/.claude-blitzsicht/plans/image-1-erneut-csp-atomic-sutton.md` Track 4-Liste, 7 Sites betroffen).
- **CSP-Test-Protokoll:** siehe `CLAUDE.md` für Pflicht-Smoke-Test vor Release.

### Aktiver Guard (seit cw-core v0.30.0)

Diese Doku allein hat die Wiederholung **nicht** verhindert: Am **2026-06-09** ging donau-profi.de mit nur-`'self'`-CSP live (mit altem Template generiert, Doku übersehen) → erneut stundenlanges Phantom-Debugging (Cache-/Toolbar-/Extension-Hypothesen), bis die alte Memory + Bisection den Fix lieferten.

Konsequenz: Der Pragma-Fix ist jetzt ein **Build-time-Guard** statt nur Doku. `ai-discovery/csp-check.ts` prüft via `siteOrigin` (aus `siteData.url`) jede `'self'`-Source-Direktive auf den expliziten Origin und warnt im `astro:build:done`-Hook (Issue-Typ `self_without_origin`). Passive Konvention → aktiver Test, der sich beim Build meldet. **Lehre:** Recurring Bugs gehören als Guard codifiziert, nicht nur dokumentiert (#1-Regel des customer-websites-Repos).

---

## Warum `'unsafe-inline'` in `script-src`/`style-src` bleibt (Stand 2026-06-30)

Ein Security-Review (mazterplan.com) flaggte `'unsafe-inline'` als Defense-in-Depth-Lücke. **Bewusste Entscheidung: bleibt — eine Entfernung ist im aktuellen Cluster nicht machbar.** Begründung:

- **`script-src`:** Echter Treiber sind dynamische `is:inline define:vars`-Scripts in cw-core-Komponenten (`BaseLayout.astro` Plausible-`init`, `Footer.astro` cwCoreVersion-Log, `analytics/Plausible.astro`, mehrere `motion/*`- und `forms/*`-Komponenten). `define:vars` injiziert pro Customer/Page andere Werte → der Script-Body ist **nicht build-stabil und damit nicht hash-bar**. Hash-basierte CSP (`'sha256-…'`) bräche bei jedem cw-core-Bump und pro Customer. Nonce-basiert geht nicht: die Sites sind **statisch auf Vercel** (kein SSR → kein Per-Request-Nonce). Der statische Plausible-Shim und die `application/ld+json`-Blöcke (nicht-ausführbare Daten, von `script-src` spec-konform nicht geblockt) allein würden `'unsafe-inline'` NICHT erzwingen.
- **`style-src`:** Getrieben von dynamischen Inline-`style={…}`-Attributen in vielen Block-/Form-/Motion-Komponenten (BentoGrid-Spans, PageHero-Gradients, AnimatedBlob …). Inline-`style`-Attribute sind in CSP2 **nicht** über Hashes abdeckbar.

**Risikobewertung:** Auf den cw-core-Sites (statisch, kein Backend, keine Formular-/Reflected-/DOM-Input-Sinks, mailto encoded) ist `'unsafe-inline'` praktisch nicht ausnutzbar — es gibt keinen Injection-Punkt für Inline-Script. Defense-in-Depth-Schwäche, kein exploitable Bug.

**Voraussetzung für spätere Entfernung:** Umbau aller `define:vars`-Inline-Scripts auf gebündelte externe Module (`'self'`) + Eliminierung dynamischer Inline-`style`-Attribute zugunsten von CSS-Custom-Properties. Großer Cluster-Refactor — erst sinnvoll, wenn eine Site echte User-Input-Sinks bekommt (Formulare/SSR).
