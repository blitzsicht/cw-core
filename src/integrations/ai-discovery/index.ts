/**
 * @cw/core/integrations/ai-discovery
 *
 * Astro integration that auto-generates /llms.txt and /llms-full.txt
 * at build time from site-data.ts (llmstxt.org spec).
 *
 * Usage in astro.config.ts:
 *
 *   import aiDiscovery from '@cw/core/integrations/ai-discovery';
 *
 *   export default defineConfig({
 *     integrations: [
 *       aiDiscovery({
 *         siteData: () => import('./src/data/site-data').then(m => m.siteData),
 *         faqs: (s) => s.faqs,
 *         services: (s) => s.leistungen,
 *       }),
 *     ],
 *   });
 */

import {
  writeFileSync, mkdirSync, readdirSync, readFileSync, statSync, existsSync,
  openSync, readSync, closeSync,
} from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, relative, extname } from 'node:path';
import {
  sniffImageFormat, expectedFormatForExt, describeFormat, SNIFF_BYTES,
} from '../../utils/image-format.js';
import { createHash } from 'node:crypto';
import type { AstroIntegration } from 'astro';
import { checkCspCompleteness, extractCspValuesFromVercelJson } from './csp-check.js';
import { auditHtml, formatFinding } from './csp-audit.js';
import { checkCacheHeaders, extractHeaderRulesFromVercelJson } from './cache-header-check.js';
import { checkTableScroll, type TableIssue } from './table-scroll-check.js';
import { checkAnchorIntegrity, type AnchorIssue } from './anchor-integrity-check.js';
import { checkAiLabels, pruefeSeiteAufKennzeichnung, type Fundstelle as AiLabelFundstelle } from './ai-label-check.js';
import { pruefeButtonKontrast, type ButtonIssue } from './button-contrast-check.js';
import { ergaenzeTabellenTabindex, ergaenzeWrapperTabindex } from './table-focusable.js';
import {
  checkDeadFontFamilies,
  checkRenderBlockingCss,
  checkImageBudget,
  extractInlineStyles,
} from './perf-check.js';
import { checkEmbedConsent } from './embed-consent-check.js';
import {
  buildMarkerOwners,
  checkMotionConsent,
  collectConsent,
  countMarker,
  stripInlineBlocks as stripMotionInlineBlocks,
} from './motion-consent-check.js';
import { lintRenderEntropy } from './render-entropy-check.js';
import { geotagDist } from './geotag.js';
import { ogProSeite } from './og-pages.js';
import { resolveBildHerkunft, istKennzeichnungspflichtig } from '../../utils/bildherkunft.js';
import { walkImages, BUDGET_EXT } from './geotag-core.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FAQItem {
  q: string;
  a: string;
}

export interface ServiceItem {
  title: string;
  description: string;
  slug?: string;
}

export interface AiDiscoverySiteData {
  name: string;
  description: string;
  url: string;
  tagline?: string;
  contact: {
    phone?: string;
    email?: string;
  };
  legal: {
    street?: string;
    zip?: string;
    city?: string;
    // Geo-Tags (Ortsnamen) fürs Bild-Metadaten-Tagging (geotag-core):
    // country/region landen als XMP:Country / XMP:State in den dist-Bildern.
    country?: string;
    region?: string;
    // Rechtsform-Felder (optional) — vom Impressum-Linter geprüft. Customer ohne
    // gepflegtes Rechtsform-Schema lassen sie weg → Linter überspringt sie.
    owner?: string;
    company?: string;
    rechtsform?: string;
    register?: string;
    registerNumber?: string;
    registerNummer?: string;
    // Standen in den Kunden-Repos längst, fehlten aber im Typ — dadurch konnte
    // generateLlmsTxt sie nicht ausgeben, und mika/zink pflegten stattdessen eine
    // statische public/llms.txt, die per postbuild-cp die generierte überschrieb
    // (blitzsicht-ops#648).
    registerCourt?: string;
    ustIdNr?: string;
    representatives?: readonly string[];
  };
  seo?: {
    // Meta-Felder, die BaseLayout in <title> und <meta description> ausliefert.
    // Sie existierten in den Kunden-Repos längst, standen aber nicht im Typ — und
    // fielen deshalb aus dem Brand-Name-Linter heraus (blitzsicht-ops#647).
    titleTemplate?: string;
    defaultTitle?: string;
    defaultDescription?: string;
    schemaDescription?: string;
    foundingDate?: string;
    areaServed?: readonly string[];
    knowsAbout?: readonly string[];
    /**
     * Andere maßgebliche Adressen desselben Anbieters — Quelltext-Repository,
     * Paketverzeichnis, Profile. Semantik wie schema.org/sameAs.
     *
     * Stand bis v0.144.0 in den Kunden-Repos, aber nicht im Typ — und fiel
     * deshalb aus `llms.txt` heraus, genau wie die Registerdaten vor
     * blitzsicht-ops#648. Gemessen an falzmarke.com am 30.08.2026: Die Startseite
     * verlinkt das GitHub-Repo dreizehnmal und `llms-full.txt` zwölfmal, aber
     * `llms.txt` — die Datei, die Sprachmodelle als Erstes lesen — **kein
     * einziges Mal**. Ein Assistent, der das Werkzeug empfehlen soll, fand von
     * dort aus weder Quelltext noch Paket.
     */
    sameAs?: readonly string[];
    // Optionale explizite Bild-Keyword-Tags (IPTC:Keywords / XMP:Subject). Fehlt
    // das Feld, synthetisiert geotag-core aus knowsAbout + areaServed + leistungen.
    imageKeywords?: readonly string[];
    geo?: { latitude: number; longitude: number };
  };
  /**
   * Bild-Deklaration nach Art. 50 Abs. 4 UAbs. 1 AI Act — die Regeln aus
   * `src/data/bild-herkunft.ts`, wie `siteData.bildHerkunft` sie führt.
   *
   * Stand in den Kunden-Repos längst, fehlte aber im Typ — dieselbe Nachtragslage wie
   * bei `sameAs` und den Registerdaten. `geotagDist` griff bisher als einziger darauf
   * zu und kam als reines `.js` ohne Deklaration aus; seit v0.148.0 liest auch der
   * `og-pages`-Aufruf sie und braucht sie deshalb im Typ.
   *
   * Bewusst `readonly unknown[]` statt `BildHerkunftRegel[]`: Die Prüfung der Regeln
   * gehört in `pruefeBildHerkunftRegeln()`, das den Klartext-Befund liefert. Ein enger
   * Typ hier würde eine kaputte Regel als Compile-Fehler melden — an einer Stelle, die
   * mit dem Rechtsproblem nichts zu tun hat.
   */
  bildHerkunft?: readonly unknown[];
  faqs?: ReadonlyArray<FAQItem>;
  leistungen?: ReadonlyArray<ServiceItem>;
}

export interface AiDiscoveryOptions<T extends AiDiscoverySiteData = AiDiscoverySiteData> {
  /**
   * Async callback that resolves to the site's data object.
   * Typically: () => import('./src/data/site-data').then(m => m.siteData)
   */
  siteData: () => Promise<T>;

  /**
   * Ein eigenes og:image je Seite nach dem Build rendern (Default: an).
   *
   * Quelle sind Titel, Beschreibung und Hero-Foto der fertig gebauten Seite:
   * mit Hero-Foto das `hero`-Template, sonst `cta` mit dem Seitentitel. Auf
   * `false` setzen, wenn ein Kunde seine Vorschaubilder von Hand pflegt.
   */
  ogPerPage?: boolean;

  /**
   * Wenn `true`, bricht der Build, sobald KEINE einzige Seite gerendert werden
   * konnte. Default `false` (nur Warnung) — gedacht als Schärfung, sobald die
   * Flotte durchgängig rendert. Grund für den weichen Default: genau dieser
   * Totalausfall lief vom 09.07. bis 27.08.2026 unbemerkt, weil er still war.
   */
  strictOgPerPage?: boolean;

  /**
   * Optional: extract FAQs from siteData (falls back to siteData.faqs).
   */
  faqs?: (data: T) => ReadonlyArray<FAQItem> | undefined;

  /**
   * Optional: extract services from siteData (falls back to siteData.leistungen).
   */
  services?: (data: T) => ReadonlyArray<ServiceItem> | undefined;

  /**
   * Default false. Bei true → Build-Fail (throw) wenn `astro.config.site` und
   * `siteData.url` auf verschiedene Domains zeigen. Default nur Warnung.
   */
  strictDomain?: boolean;

  /**
   * Default false. Bei true → Build-Fail (throw) wenn der Schema-Linter im
   * dist/-Output doppelte JSON-LD-`@id`s findet (Google Rich Results meldet das
   * als doppelte Entität → unterdrückte/fragile Rich Results). Default nur Warnung.
   */
  strictSchema?: boolean;

  /**
   * Default false. Bei true → Build-Fail wenn Title oder Description die
   * konfigurierten Maximal-Längen überschreiten oder fehlen. Default nur Warnung.
   */
  strictMeta?: boolean;

  /** Maximal-Länge `<title>` in Zeichen. Default 60 (Google-SERP-Truncation). */
  maxTitleLength?: number;

  /** Maximal-Länge `<meta name="description">` in Zeichen. Default 160. */
  maxDescriptionLength?: number;

  /**
   * Bis zu welcher Pfadtiefe Seiten in die „Wichtige Seiten"-Liste von
   * llms.txt aufgenommen werden. Default 1 = nur Top-Level.
   *
   * Warum das überhaupt einstellbar sein muss: Der Default unterstellt, dass
   * Detailseiten Leistungen sind und damit ohnehin unter „Was wir anbieten"
   * stehen. Für die meisten Kundenseiten stimmt das. Für Seiten mit
   * Standort- oder Katalogstruktur stimmt es nicht — dort liegt der gesamte
   * inhaltliche Wert unterhalb der ersten Ebene, und llms.txt beschrieb
   * bis dahin eine Site, die es so nicht gibt.
   *
   * Belegt an platzfrei.club (19.08.2026): llms.txt und llms-full.txt nannten
   * weder das Studio noch eine einzige Kursart — die vier Landingpages, für
   * die die Site gebaut wurde, kamen mit null Treffern gar nicht vor.
   * Aufgeführt waren Datenschutz und Impressum.
   *
   * Seiten bleiben aus REAL gebauten Dateien abgeleitet, es entstehen also
   * weiterhin keine toten Links. Ab Tiefe 2 wird als Label der `<title>` der
   * Seite genommen (ohne Marken-Suffix) statt des Slugs: „Spinning" wäre ohne
   * seinen Ort wertlos, und der steht nur im Titel.
   */
  importantPageDepth?: number;

  /**
   * Byte-Budget für den Abschnitt „Seiten im Volltext" in `llms-full.txt`.
   * Default 524288 (512 KB). `0` schaltet den Abschnitt ab.
   *
   * Warum es das Budget überhaupt gibt: llms-full.txt trägt seit cw-core#105 den
   * Volltext aller gebauten Seiten — bei falzmarke sind das rund 100 KB für zwanzig
   * Seiten, unauffällig. Bei einer Katalog- oder Standort-Struktur (platzfrei.club)
   * wächst dieselbe Regel unbegrenzt, und eine Textdatei im Megabereich liest kein
   * Assistent mehr zu Ende.
   *
   * Greift das Budget, werden die ausgelassenen URLs **namentlich** genannt — im
   * Build-Log und in der Datei selbst. Eine stille Kappung liest sich wie
   * „alles enthalten" und wäre der schlechtere Zustand als gar kein Volltext.
   */
  llmsFullMaxBytes?: number;

  /**
   * Default false. Bei true → Build-Fail wenn der Brand-Name-Linter hartkodierte
   * Marken-Literale in siteData-Prosa-Feldern (description, tagline, FAQs,
   * Leistungen) oder in statischen Assets (robots.txt) findet.
   *
   * Hintergrund: Der Markenname gehört ausschließlich in `siteData.name`. Alle
   * anderen Textfelder sollen generisch formuliert sein (kein "Mika Elektrotechnik
   * ist Ihr …" — stattdessen "Ihr Elektrofachbetrieb in …"). Das verhindert, dass
   * eine triviale Umbenennung zur teuren Multi-File-Aktion wird.
   *
   * Default false = Warnung im Build-Log, kein Fail. Aktiviere auf `true` sobald
   * alle Customer-Sites bereinigt sind.
   */
  strictBrandName?: boolean;

  /**
   * Default false. Bei true → Build-Fail wenn der Impressum-Linter eine §5-DDG-Lücke
   * in den Rechtsform-Angaben findet (Gesellschaft ohne Firma/Rechtsform, oder
   * eingetragene Rechtsform ohne Registernummer).
   *
   * Hintergrund: customer-gottl-richter-gomeier (eGbR) hatte owner=Privatperson und
   * die Firma nur im (nie gerenderten) `company`-Feld → das Impressum nannte keine
   * Firma/Rechtsform. Default false = Warnung; auf true setzen, sobald alle Customer
   * vollständige Rechtsform-Angaben haben.
   */
  strictImpressum?: boolean;

  /**
   * Default true. Prüft die `vercel.json` auf CSP-Drift: fehlende `*-elem`-
   * Direktiven, fehlendes `media-src`, Analytics-Host nicht in
   * `script-src-elem`/`connect-src`, Smart-Quotes. Verhindert die Wiederholung
   * des DD-CSP-Mystery (Symptom: `style-src-elem 'self'` blockt eigene Assets).
   */
  checkCsp?: boolean;
  /** Bei true → Build-Fail (throw) bei CSP-Drift. Default false (Soft-Warn). */
  strictCsp?: boolean;
  /** Analytics-Host für die CSP-Konsistenz-Prüfung. Default 'plausible.io'; null = aus. */
  analyticsHost?: string | null;
  /**
   * Default true, und bewusst HART (kein Soft-Warn-Modus): prüft die CSP gegen
   * das tatsächlich gebaute `dist/` und bricht den Build ab, wenn sie eine
   * ausgelieferte Ressource blocken würde.
   *
   * Warum hart: gympanzen (22.07.2026) bestand den textuellen CSP-Linter mit
   * 0 Issues und war fünf Tage lang komplett ungestylt live. Ein rotes
   * GitHub-CI hätte das nicht verhindert — ein Push auf main startet den
   * Vercel-Prod-Deploy parallel zur CI. Nur ein Fehlschlag im Build selbst
   * hält den kaputten Stand von Produktion fern (der alte Build bleibt live).
   *
   * Auf `false` nur in begründeten Ausnahmen (z. B. Fremd-HTML im dist/).
   */
  checkOutputCsp?: boolean;

  /**
   * Default true. Prüft die `vercel.json` auf Cache-Control-Politik für
   * public/-Assets: fehlende Asset-/Font-Cache-Regeln, `immutable` auf
   * Nicht-/_astro-Pfaden (Stale-forever-Anti-Pattern), `no-store` auf Assets.
   * Hintergrund (Speed-Rollout 2026-07-09): kein Customer-vercel.json im
   * Cluster hatte Cache-Control → alle public/-Assets gingen mit max-age=0
   * zum Browser. Siehe docs/caching-rationale.md.
   */
  /** Gibt jeder Inhaltstabelle im Build `tabindex="0"`, damit der Scroll-Container
   *  per Tastatur erreichbar ist. Default: true. */
  makeTablesFocusable?: boolean;
  /** Knopf-Kontrast-Guard: prüft --color-accent-btn-text gegen --color-accent.
   *  Default: true. */
  checkButtonContrast?: boolean;
  /** Knopf-Kontrast-Guard bricht den Build ab. Default: true. */
  strictButtonContrast?: boolean;
  /** Anker-Integritäts-Guard: meldet Links, die der Compiler hinter einer Tabelle
   *  wieder aufgemacht hat, und Links ohne erkennbaren Namen. Default: true. */
  checkAnchorIntegrity?: boolean;
  /** Anker-Integritäts-Guard bricht den Build ab. Default: true. */
  strictAnchorIntegrity?: boolean;
  /**
   * KI-Kennzeichnungs-Guard: trägt jede ausgelieferte Seite ein Label für die
   * kennzeichnungspflichtigen Bilder, die auf ihr stehen? Default TRUE.
   *
   * 🔴 Anlass (03.09.2026): `customer-donau-profi` lieferte sechs als `deepfake: 'ja'`
   * deklarierte Städtebilder ohne jedes Label aus — neun Tage lang, während im lokalen
   * Klon eine fertige, nie gepushte Reparatur lag. Kein Build hat etwas gemeldet, weil
   * es nichts gab, was hätte melden können. Bei `customer-soleno` fanden sich am selben
   * Tag 50 weitere Fundstellen: dieselben Stadtbilder auf einer zweiten Vorlage.
   *
   * Bis dahin galt „Repo importiert AiLabel" als Nachweis. Das ist keiner — die Pflicht
   * aus Art. 50 Abs. 4 UAbs. 1 AI Act gilt je Fundstelle.
   */
  checkAiLabel?: boolean;
  /**
   * Default TRUE — **sofort strict, nicht Soft-Warn**, und das ist eine bewusste
   * Abweichung vom üblichen Soft-Warn-Start.
   *
   * Grund: Ein Soft-Warn müsste per `logger.warn` melden, und der strict-warnings-Gate
   * des Release-Trains zählt jede WARN-Zeile mit `@cw/core`-Label als Befund
   * (`customer-websites/scripts/lib/build-warnings.mjs`). Ein Hinweis, der nichts
   * bricht, verweigerte damit den PR — genau so hingen `allstargirls-regensburg` und
   * `itk-regensburg` allein wegen Info-Hinweisen auf v0.110.0 fest. Ein Guard, der die
   * Flotte blockiert, ohne den Build abzubrechen, ist die schlechteste beider Welten.
   *
   * Gedeckt durch eine Messung über die **ausgelieferten** Seiten aller Sites der
   * Registry (`scripts/kennzeichnung-live.mjs`, 03.09.2026, 469 Seiten): jeder Kunde
   * 0 fehlende Kennzeichnungen — mit einer benannten Ausnahme, `customer-soleno`, wo
   * `images/hero/hero-poster.webp` als dekoratives Kartenbild in einem
   * `aria-hidden`-Link steht (13 Fundstellen). Dort steht `strictAiLabel: false` mit
   * Begründung, bis die Einordnung dieser Verwendung entschieden ist.
   */
  strictAiLabel?: boolean;
  /** Tabellen-Scroll-Guard: meldet Seiten mit Tabelle, aber ohne Scroll-Regel
   *  im ausgelieferten CSS. Default: true. */
  checkTableScroll?: boolean;
  /** Tabellen-Scroll-Guard bricht den Build ab. Default: true. */
  strictTableScroll?: boolean;
  checkCacheHeaders?: boolean;
  /**
   * Default TRUE seit v0.67.0 (strict-Flip, blitzsicht-ops#538) → Build-Fail
   * (throw) bei Cache-Header-Issues. Opt-out pro Site: explizit `false`
   * setzen (Soft-Warn) — nur für begründete Sonderfälle.
   */
  strictCacheHeaders?: boolean;

  /**
   * Default true. Warnt, wenn gebaute Seiten render-blockende
   * `<link rel="stylesheet">` auf /_astro/-CSS enthalten — d. h.
   * `build: { inlineStylesheets: 'always' }` fehlt in astro.config
   * (blitzsicht-Messung: ~720 ms Ersparnis durch Inlining).
   */
  checkInlineCss?: boolean;
  /**
   * Default TRUE seit v0.67.0 (strict-Flip, blitzsicht-ops#538) → Build-Fail
   * (throw) bei render-blockendem CSS. Opt-out pro Site: explizit `false`.
   */
  strictInlineCss?: boolean;

  /**
   * Default true. Warnt bei toten Font-Familien: `font-family`/`--font-*`
   * referenziert einen Namen, für den es kein `@font-face` gibt und der
   * keine System-/generische Schrift ist → stiller System-Fallback.
   * Hintergrund: steller referenzierte 'Inter'/'Work Sans' ohne jegliche
   * Font-Dateien im Repo.
   */
  checkFonts?: boolean;
  /**
   * Default TRUE seit v0.67.0 (strict-Flip, blitzsicht-ops#538) → Build-Fail
   * (throw) bei toten Font-Familien. Opt-out pro Site: explizit `false`.
   */
  strictFonts?: boolean;

  /**
   * Default true. Perf-Budget-Guard (blitzsicht-ops#541): warnt bei einzelnen
   * dist-Bildern über `maxImageKb`. Reuse `walkImages` → OG/Icons/Favicons
   * sind ausgenommen (dürfen legitim größer sein). Opt-out pro Site: `false`.
   */
  checkImageBudget?: boolean;
  /** KB-Schwelle pro Einzelbild für den Perf-Budget-Guard. Default 200. */
  maxImageKb?: number;
  /**
   * Default FALSE (Soft-Warn-Start, opt-IN — anders als die v0.67-Guards):
   * `true` setzen → Build-Fail (throw) bei Bildern über Budget. Strict-Kandidat
   * erst nach Fleet-Lauf ohne False-Positives (blitzsicht-ops#541).
   */
  strictImageBudget?: boolean;

  /**
   * Default true. Embed-Consent-Guard: meldet Buchungs-Embeds, die schon beim
   * Parsen der Seite laden statt erst nach einem Klick. Opt-out pro Site: `false`.
   *
   * Hintergrund (Vorfall 2026-08-03): `steller-sanierungen.com/kontakt` lieferte live
   * den Eager-Zweig von `CalEmbed.astro` aus — `app.cal.eu/embed/embed.js` wurde beim
   * Parsen injiziert, die Besucher-IP floss vor jeder Nutzeraktion an Cal.com Inc.
   * Ursache war der Default `lazy = false`, den die Seite geerbt hat. Blitzsicht war
   * sauber, weil es `lazy={true}` explizit setzte. Der Default steht seit demselben
   * Tag auf `true`; dieser Guard ist der Regressions-Wächter dazu.
   *
   * Bewusst eng auf die Cal-Signatur geschnitten: eine generische Regel
   * „Drittanbieter-Host ohne click-Gate" würde `TurnstilePreClearance.astro`
   * (lädt via `load` + `requestIdleCallback` auf JEDER Seite JEDES Kunden)
   * fleet-weit flaggen. Verallgemeinerung erst mit expliziter Allowlist.
   */
  checkEmbedConsent?: boolean;
  /**
   * Default FALSE (Soft-Warn-Start, opt-IN — wie strictImageBudget): `true` setzen
   * → Build-Fail (throw) bei eager geladenem Buchungs-Embed. Strict-Flip erst nach
   * einem Fleet-Lauf ohne False-Positives.
   */
  strictEmbedConsent?: boolean;

  /**
   * Default TRUE seit v0.75.0 (strict-Flip, Fleet clean nach v0.74.0-a11y-Fix) → Build-Fail
   * (throw), wenn der Alt-Text-Guard ein nicht-dekoratives `<img>` ohne bzw. mit leerem `alt`
   * im dist-HTML findet. Dekorative Bilder mit `aria-hidden="true"`/`role="presentation"` am
   * `<img>`-Tag markieren. Opt-out pro Site: explizit `false`.
   * Hintergrund: der Hero-Fallback konnte still auf `alt=""` kippen — das LCP-Bild ohne Alt
   * ist ein Ranking-/A11y-Verlust.
   */
  strictAltText?: boolean;

  /**
   * Default TRUE ab v0.105.0 → Build-Fail (throw), wenn eine gerenderte Seite eine
   * **verwaiste** `{`/`}` in einem Textknoten trägt. Opt-out pro Site: explizit `false`.
   *
   * Sofort strict statt Soft-Warn, weil der Fehler sichtbaren Müll auf die Kundenseite
   * schreibt („Work Sans}") und eine Log-Warnung ihn nachweislich nicht verhindert hätte —
   * er stand monatelang live (blitzsicht-ops#652). Gedeckt ist das durch eine Messung über
   * die dist-Verzeichnisse aller 22 Kunden-Repos (11.08.2026): 344 Seiten, 4 Befunde, und
   * alle vier waren der echte Bug. Null Falsch-Positive.
   *
   * `<pre>`/`<code>` sind ausgenommen — dort sind unbalancierte Klammern richtig.
   */
  strictStrayBraces?: boolean;

  /**
   * Default true. Magic-Byte-Guard auf den Quell-Assets (`public/` + `src/assets/`):
   * hält bei jeder Bilddatei den Inhalt gegen die Endung. Opt-out pro Site: `false`.
   */
  checkAssetFormat?: boolean;

  /**
   * Default true. Render-Entropy-Guard auf den `.astro`-Quellen: findet
   * Zufallsaufrufe im Build-Pfad (Frontmatter und Template-Ausdrücke), die das
   * HTML zwischen zwei Builds verändern. Opt-out pro Site: `false`.
   */
  checkRenderEntropy?: boolean;

  /**
   * Default TRUE ab v0.107.0 → Build-Fail (throw), wenn eine `.astro`-Quelle zur
   * Build-Zeit einen Zufallswert erzeugt (`Math.random()`, `crypto.randomUUID()`).
   *
   * Anlass: vier Motion-Komponenten würfelten ihre Element-ID pro Build
   * (blitzsicht-ops#650). Bei blitzsicht änderten sich dadurch 13 von 52 Seiten
   * bei jedem Deploy, ohne inhaltliche Änderung — ETag und Last-Modified waren
   * wertlos, und der Byte-Vergleich zweier Builds, das schärfste Werkzeug für
   * „Output unverändert", ertrank in 121 Zeilen Rauschen.
   *
   * Sofort strict statt Soft-Warn, gedeckt durch eine Messung über die
   * **committeten** Quellen aller 25 Repos (11.08.2026, `git show <ref>:<pfad>`):
   * **371 `.astro`-Dateien, 4 Befunde, alle vier der echte Bug, 0 Falsch-Positive.**
   *
   * Die 0 ist erarbeitet: ein naiver Scan meldete zunächst die Kopfkommentare der
   * reparierten Komponenten, weil sie den Fehler erklären und `Math.random()`
   * dabei wörtlich nennen. Deshalb blendet der Guard Kommentare aus — und
   * `<script>`/`<style>`-Blöcke ebenso, denn Zufall im Browser ist in Ordnung.
   *
   * Nicht abgedeckt: Zufall in einem importierten `.ts`-Modul. Dafür ist
   * `scripts/verify-reproducible-build.mjs` da (zweimal bauen, Bytes vergleichen).
   */
  strictRenderEntropy?: boolean;

  /**
   * Default TRUE ab v0.106.0 → Build-Fail (throw), wenn die Endung einer Quell-Bilddatei
   * über ihren Inhalt lügt. Opt-out pro Site: explizit `false`.
   *
   * Sofort strict statt Soft-Warn, gedeckt durch eine Messung über die **committeten**
   * Blobs aller 23 Kunden-Repos (11.08.2026, `git show origin/main:<pfad>` — nicht über
   * die Arbeitskopien, die veraltet und teils schon repariert sind): 524 Quell-Assets,
   * **1 Befund** (stellers `hero.webp`, ein 1257-KB-PNG), **0 Falsch-Positive**.
   *
   * Die 0 ist erarbeitet, nicht geschenkt: ein naiver Text-Sniff meldete zunächst 4
   * Falsch-Positive, weil zinks Logos mit `<!-- … -->` beginnen. Deshalb streift
   * `sniffImageFormat` BOM, Whitespace, `<?…?>`, Kommentare und DOCTYPE ab, bevor es
   * das erste Tag liest.
   *
   * Gemeldet wird auch „gar kein Bild" (gottls `rics.png` war 212 Byte HTML), nicht nur
   * PNG-vs-WebP.
   */
  strictAssetFormat?: boolean;

  /**
   * Default TRUE seit v0.76.0 (strict-Flip, Fleet shape-clean). Build-Fail, wenn der
   * Schema-Consistency-Guard eine `warn`-Shape-Abweichung findet (z.B. `images.hero`-String
   * statt `hero.image`, `services[]` ohne `leistungen[]`, `hero.imageAlt` ohne `image`).
   * Opt-out pro Site: explizit `false`. Nur `warn`-Severity bricht den Build (reine SEO-
   * Hinweise wie fehlendes `legal.region`/`knowsAbout` nie).
   */
  strictSiteDataShape?: boolean;

  /**
   * PERMANENT soft-warn (Default undefined/false) — bewusst KEIN Strict-Flip wie
   * `strictAltText`/`strictSiteDataShape`. Der Alt-Qualität-Guard (`lintPageImgAltQuality` +
   * `aggregateCrossPageDupAlts`) flaggt nicht-leere, aber generische/schwache Alts
   * (Firmenname/Leistungstitel, „Bild:"-Platzhalter, Dateiname-als-Alt, <5 Zeichen,
   * Cross-Page-Duplikate). Qualität ist fuzzy → ein False-Positive darf keinen Deploy
   * brechen. Nur `true` (explizit pro Site opt-in) macht daraus einen Build-Fail.
   */
  strictAltQuality?: boolean;

  /**
   * Default true. Motion-Consent-Guard: warnt, wenn das gebaute `dist/` eine
   * Motion-Komponente ausliefert, die weder importiert noch per Prop
   * angefordert wurde.
   *
   * Auslöser (09.08.2026): `PaketeSection` hat `tilt = true` als Voreinstellung
   * und `Hero` rendert `TiltCard` ungated ab zwei Bildern — digital-direkt.com
   * lieferte dadurch 6 TiltCards aus, die niemand bestellt hatte. Ein
   * Import-Grep sieht das nicht, weil die API hier eine Prop ist.
   *
   * PERMANENT soft-warn — kein Strict-Flip. Der Guard misst Absicht, und
   * Absicht ist nichts, wofür ein Deploy brechen darf.
   */
  checkMotionConsent?: boolean;

  /**
   * Motion, die bewusst gewollt ist, obwohl sie nicht importiert wird.
   * Akzeptiert Prop-Keys (`'tilt'`, `'blob'`, …) wie Komponentennamen
   * (`'TiltCard'`). Macht die Absicht sichtbar, statt den Guard stillzulegen.
   *
   * @example acknowledgedMotion: ['tilt']
   */
  acknowledgedMotion?: readonly string[];
}

/** Hostname ohne führendes www., lowercase. Leerer String bei ungültiger URL. */
function normHost(u: string | undefined): string {
  if (!u) return '';
  try {
    return new URL(u).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}

/** Rekursiv alle index.html unter dir sammeln. */
function walkHtml(dir: string, results: string[] = []): string[] {
  if (!existsSync(dir)) return results;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      walkHtml(full, results);
    } else if (entry === 'index.html') {
      results.push(full);
    }
  }
  return results;
}

/** Slug → menschenlesbares Label für die llms.txt "Wichtige Seiten"-Liste. */
const IMPORTANT_PAGE_LABELS: Record<string, string> = {
  leistungen: 'Alle Leistungen',
  faq: 'FAQ',
  'ueber-uns': 'Über uns',
  kontakt: 'Kontakt',
  impressum: 'Impressum',
  datenschutz: 'Datenschutz',
  blog: 'Blog',
  referenzen: 'Referenzen',
  pakete: 'Pakete & Preise',
  team: 'Team',
  karriere: 'Karriere',
};

/**
 * Slug → Title-Case, letzte Rückfallstufe für ein Seiten-Label.
 *
 * Bewusst dumm: `din-5008` wird zu „Din 5008" und das ist falsch geschrieben. Genau
 * deshalb ist das die dritte Stufe und nicht die erste — greift sie, hat die Seite
 * weder einen `<title>` noch einen Eintrag in IMPORTANT_PAGE_LABELS, und dann ist ein
 * lesbarer Slug immer noch besser als eine leere Zeile (cw-core#105).
 */
function titleCaseSlug(slug: string): string {
  return slug
    .split('-')
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(' ');
}

/**
 * Leitet die "Wichtige Seiten"-Liste für llms.txt aus den REAL gebauten
 * dist/-Routen ab (statt hardcodeter Pfade, die bei Single-Page-/Produkt-Sites
 * tote Links erzeugten). Regeln: nur Top-Level-Routen (Tiefe 1), ohne Homepage,
 * ohne noindex-Seiten. Label aus dem `<title>` ohne Marken-Suffix, Rückfall auf die
 * Slug-Map und zuletzt Title-Case (cw-core#105). Alphabetisch
 * sortiert (deterministisch). Exportiert für Unit-Tests.
 */
/**
 * Die HTML-Entitäten, die in einem `<title>` real vorkommen, zurück in Text.
 *
 * llms.txt ist eine Textdatei, kein HTML. „Kurse &amp; Kursplan" ist dort
 * schlicht falsch — der Titel im Markup ist korrekt escaped, das Label darf es
 * nicht bleiben. Betrifft nur Labels ab Tiefe 2; Top-Level-Labels kommen aus
 * Slugs und hatten das Problem nie.
 */
function decodeEntities(text: string): string {
  return text
    .replace(/&(amp|lt|gt|quot|apos|nbsp|#0*39|#x0*27);/gi, (_, e) => {
      const key = e.toLowerCase();
      if (key === 'amp') return '&';
      if (key === 'lt') return '<';
      if (key === 'gt') return '>';
      if (key === 'quot') return '"';
      if (key === 'apos' || key === '#039' || key === '#39' || key === '#x27') return "'";
      return ' '; // nbsp
    })
    // &amp;amp; → doppelt kodiert; nach dem ersten Durchgang bleibt &amp; stehen.
    .replace(/&amp;/g, '&');
}

export function resolveImportantPages(
  htmlFiles: readonly string[],
  distDir: string,
  baseUrl: string,
  maxDepth = 1,
): Array<{ label: string; href: string }> {
  const base = distDir.replace(/\\/g, '/').replace(/\/$/, '');
  const pages: Array<{ label: string; href: string }> = [];
  for (const file of htmlFiles) {
    const rel = file.replace(/\\/g, '/').slice(base.length);
    const route = rel.replace(/index\.html$/, '').replace(/\/+$/, '');
    if (route === '') continue; // Homepage — steckt bereits in H1
    const segments = route.replace(/^\//, '').split('/').filter(Boolean);
    // Default 1 = nur Top-Level; Detailseiten stehen dann in "Was wir anbieten".
    // Höhere Tiefe für Sites, deren Inhalt unterhalb der ersten Ebene liegt
    // (Standorte, Kataloge) — siehe importantPageDepth in den Options.
    if (segments.length > maxDepth) continue;
    const slug = segments[0];
    let content = '';
    try {
      content = readFileSync(file, 'utf-8');
    } catch {
      /* unlesbar → überspringen */
    }
    if (/<meta[^>]+name=["']robots["'][^>]+content=["'][^"']*noindex/i.test(content)) {
      continue; // noindex-Seiten (z.B. /review) nicht bewerben
    }
    // Der <title> trägt die Aussage, der Slug trägt sie nicht — auf JEDER Tiefe.
    // Ab Tiefe 2 war das schon immer so (/studios/x und /studios/x/kurse/y hießen
    // beide „Studios"). Auf Tiefe 1 galt bis cw-core#105 der titelisierte Slug, und
    // der schreibt Eigennamen falsch: aus `din-5008` wurde „Din 5008", aus
    // `brief-mit-ki` „Brief Mit Ki" — eine Norm und eine Abkürzung, beide falsch, in
    // genau der Datei, die Sprachmodelle als Erstes lesen. Die alte Annahme „flach =
    // selbsterklärend" trägt für /impressum, aber nicht für Inhaltsseiten:
    // Top-Level-URLs sind kurz, weil sie kurz sein sollen.
    //
    // Das Marken-Suffix („… | Marke") fällt weg, weil es in llms.txt schon in der H1
    // steht. NUR `|` und `·` trennen es ab. Gedankenstriche gehören zum Titel selbst —
    // „Kurse & Kursplan – Victory Gym" wäre sonst nach dem ersten Strich
    // abgeschnitten. Entfernt wird das LETZTE Trenner-Segment, nicht alles ab dem ersten.
    const titleMatch = content.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const rawTitle = titleMatch ? titleMatch[1].replace(/\s+/g, ' ').trim() : '';
    const stripped = decodeEntities(rawTitle.replace(/\s*[|·]\s*[^|·]*$/, '')).trim();
    // Ohne Titel: die kuratierte Map, sonst der Slug in Title-Case. Beides ist der
    // Rückfall — der Slug war nie als Voreinstellung gemeint.
    const label =
      stripped || IMPORTANT_PAGE_LABELS[slug] || titleCaseSlug(segments[segments.length - 1]);
    pages.push({ label, href: `${baseUrl}/${segments.join('/')}/` });
  }
  pages.sort((a, b) => a.href.localeCompare(b.href));
  return pages;
}

export interface PageText {
  /** Seitentitel ohne Marken-Suffix — dieselbe Regel wie in der llms.txt-Liste. */
  title: string;
  /** Fließtext der Seite als Markdown-naher Klartext. */
  text: string;
}

/**
 * Holt den lesbaren Text einer gebauten Seite für llms-full.txt (cw-core#105).
 *
 * Quelle ist `<main>`, Rückfall `<body>`. Beide cw-core-Layouts setzen `<main>`
 * (LandingPage.astro, ContentPage.astro) — damit bleiben Navigation und Fußzeile
 * draußen. Ohne diese Eingrenzung stünde bei zwanzig Seiten zwanzigmal dasselbe
 * Menü in der Datei und verdrängte den Inhalt, für den sie gebaut ist.
 *
 * Regex statt Parser, wie im Rest dieser Datei: cw-core hat keinen HTML-Parser als
 * Abhängigkeit (nur exiftool-vendored und satori), und einen dafür einzuziehen stünde
 * in keinem Verhältnis. Die Eingabe ist kein fremdes HTML, sondern das eigene dist/.
 *
 * Die Gliederung bleibt erhalten (Überschriften, Listen), weil genau sie einen
 * Assistenten den Antwortblock am Stück übernehmen lässt. Als Textbrei wäre er nicht
 * auffindbar.
 *
 * @param minChars Unterhalb dieser Länge gilt die Seite als leer und liefert `null`.
 *   Eine leere Seite als leerer Abschnitt wäre in einer Datei, die Modelle als Fakten
 *   lesen, die teuerste Fehlerart.
 */
export function extractPageText(html: string, minChars = 80): PageText | null {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const rawTitle = titleMatch ? titleMatch[1].replace(/\s+/g, ' ').trim() : '';
  const title = decodeEntities(rawTitle.replace(/\s*[|·]\s*[^|·]*$/, '')).trim();

  const mainMatch = html.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  let text = mainMatch ? mainMatch[1] : bodyMatch ? bodyMatch[1] : '';
  if (!text) return null;

  text = text
    // Nicht-Text raus, samt Inhalt. `svg` trägt <title>-Elemente, die sonst als
    // Fließtext auftauchten; `template` ist per Definition nicht gerendert.
    .replace(/<(script|style|noscript|svg|template)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
    // Landmarken, die auch innerhalb von <main> vorkommen können (Brotkrumen,
    // Seiten-Fuß) — und alles, was der <body>-Rückfall sonst mitschleppte.
    .replace(/<(nav|header|footer|aside)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
    // HTML-Kommentare raus, samt Inhalt. Gemessen an falzmarkes Startseite: dort
    // steht eine interne Notiz über ein totes Tracking-Event samt Test-Pfad im
    // Markup. Ohne diese Zeile stünde die Entwickler-Notiz im Volltext, den ein
    // Assistent als Aussage der Seite liest.
    .replace(/<!--[\s\S]*?-->/g, '')
    // Überschriften: die Seite sitzt in llms-full.txt schon unter einer "###",
    // ihre eigene Gliederung beginnt deshalb eine Ebene darunter. Das Element wird
    // als Ganzes genommen und sein Innenleben flachgezogen — ein <br> oder <span>
    // in der Überschrift darf sie nicht über zwei Zeilen reissen, sonst ist die
    // zweite Zeile keine Überschrift mehr und die Gliederung stimmt nicht.
    .replace(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi, (_m, lvl: string, inner: string) => {
      const level = Number(lvl) <= 2 ? 4 : Number(lvl) === 3 ? 5 : 6;
      const flat = inner.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      return flat ? `\n\n${'#'.repeat(level)} ${flat}\n\n` : '\n\n';
    })
    .replace(/<li\b[^>]*>/gi, '\n- ')
    .replace(/<br\s*\/?>/gi, '\n')
    // Tabellenzellen bleiben in einer Zeile, getrennt wie in Markdown. Eine echte
    // Markdown-Tabelle wäre ohne Kopf-Trennzeile ohnehin keine.
    .replace(/<\/(td|th)>/gi, ' | ')
    .replace(/<\/(p|div|section|article|tr|ul|ol|dl|dd|dt|blockquote|figcaption)>/gi, '\n')
    // Der Rest fällt ersatzlos weg. NICHT durch ein Leerzeichen ersetzen: <strong>
    // und Konsorten stehen mitten im Wort, und die Blockenden oben haben ihre
    // Umbrüche bereits gesetzt.
    .replace(/<[^>]+>/g, '');

  text = decodeEntities(text)
    .split('\n')
    .map((line) => line.replace(/[ \t ]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (text.length < minChars) return null;
  return { title: title || '', text };
}

export interface CollectedPages {
  pages: Array<{ url: string; title: string; text: string }>;
  /** URLs, die das Byte-Budget nicht mehr aufgenommen hat — namentlich, nie still. */
  dropped: string[];
}

/**
 * Sammelt den Volltext aller gebauten Seiten für llms-full.txt (cw-core#105).
 *
 * Reihenfolge: Startseite, dann Tiefe 1, dann Tiefe 2 — innerhalb einer Ebene
 * alphabetisch. Deterministisch, und wenn das Budget greift, überlebt der wertvolle
 * Teil statt dem, was zufällig mit „a" beginnt.
 *
 * `maxBytes <= 0` schaltet den Volltext ab; das ist zugleich der Opt-out und braucht
 * damit keinen zweiten Schalter.
 */
export function collectPageTexts(
  htmlFiles: readonly string[],
  distDir: string,
  baseUrl: string,
  maxBytes: number,
): CollectedPages {
  if (!(maxBytes > 0)) return { pages: [], dropped: [] };
  const base = distDir.replace(/\\/g, '/').replace(/\/$/, '');
  const candidates: Array<{ depth: number; url: string; title: string; text: string }> = [];

  for (const file of htmlFiles) {
    const rel = file.replace(/\\/g, '/').slice(base.length);
    const route = rel.replace(/index\.html$/, '').replace(/\/+$/, '');
    const segments = route.replace(/^\//, '').split('/').filter(Boolean);
    // walkHtml sammelt nur index.html, dist/404.html ist also ohnehin draußen —
    // eine /404/-Route wäre es nicht, deshalb hier trotzdem geprüft.
    if (segments.includes('404')) continue;
    let content = '';
    try {
      content = readFileSync(file, 'utf-8');
    } catch {
      continue; // unlesbar → überspringen
    }
    if (/<meta[^>]+name=["']robots["'][^>]+content=["'][^"']*noindex/i.test(content)) {
      continue; // noindex-Seiten gehören auch nicht in den Volltext
    }
    const extracted = extractPageText(content);
    if (!extracted) continue;
    const url = segments.length === 0 ? `${baseUrl}/` : `${baseUrl}/${segments.join('/')}/`;
    candidates.push({
      depth: segments.length,
      url,
      title:
        extracted.title ||
        (segments.length === 0 ? 'Startseite' : titleCaseSlug(segments[segments.length - 1])),
      text: extracted.text,
    });
  }

  candidates.sort((a, b) => a.depth - b.depth || a.url.localeCompare(b.url));

  const pages: CollectedPages['pages'] = [];
  const dropped: string[] = [];
  let used = 0;
  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    const cost = Buffer.byteLength(`### ${c.title}\nURL: ${c.url}\n\n${c.text}\n\n`, 'utf-8');
    if (used + cost > maxBytes) {
      // Ab hier wird nichts mehr aufgenommen — nicht „die nächste kleine passt noch".
      // Sonst hinge die Auswahl an der Reihenfolge der Dateigrößen, und niemand könnte
      // erklären, warum eine Seite fehlt und eine spätere drinsteht.
      for (let j = i; j < candidates.length; j++) dropped.push(candidates[j].url);
      break;
    }
    used += cost;
    pages.push({ url: c.url, title: c.title, text: c.text });
  }
  return { pages, dropped };
}

/** Extrahiert alle JSON-LD-Block-Inhalte aus einem HTML-String. */
function extractJsonLd(html: string): string[] {
  const blocks: string[] = [];
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    blocks.push(m[1].trim());
  }
  return blocks;
}

export interface SchemaIssue {
  page: string;
  type: 'duplicate_id' | 'missing_context' | 'missing_type' | 'invalid_json';
  detail: string;
}

/**
 * Sammelt alle @id-Strings aus einem parsed JSON-LD-Block
 * (Top-Level-Objekt, Top-Level-Array und @graph).
 *
 * Die Array-Form fehlte bis v0.103.0: `o['@id']` ist auf einem Array immer
 * `undefined`, damit war die Duplikat-Erkennung auf Array-Bloecken blind.
 */
function collectIds(obj: unknown, out: string[] = []): string[] {
  if (!obj || typeof obj !== 'object') return out;
  if (Array.isArray(obj)) {
    for (const item of obj) collectIds(item, out);
    return out;
  }
  const o = obj as Record<string, unknown>;
  if (typeof o['@id'] === 'string') out.push(o['@id']);
  collectIds(o['@graph'], out);
  return out;
}

export interface MetaIssue {
  page: string;
  type: 'title_missing' | 'title_too_long' | 'description_missing' | 'description_too_long';
  detail: string;
}

// ---------------------------------------------------------------------------
// Brand-Name-Literal-Guard types + logic
// ---------------------------------------------------------------------------
// Hintergrund: Der Markenname soll ausschließlich in siteData.name stehen.
// Alle Prosa-Felder (description, tagline, FAQs, Leistungen, robots.txt)
// sollen generisch formuliert sein — keine Literal-Duplikate. Sonst wird
// eine triviale Umbenennung zur teuren Multi-File-Aktion (Vorfall 2026-06-08:
// customer-mika-elektrotechnik, ~30 Literale in 13 Dateien).
// Cluster-Risiko: potenziell alle 11 Customer-Sites betroffen.

export interface BrandNameIssue {
  /** Identifikator: siteData-Feldname oder Datei-Pfad (z. B. "dist/robots.txt"). */
  location: string;
  type: 'prose_literal' | 'seo_literal' | 'redundant_title_template' | 'static_asset_literal';
  /** Anzahl der gefundenen Vorkommen. */
  count: number;
  detail: string;
}

/**
 * Prüft alle Prosa-Felder in siteData auf hartkodierte Marken-Literale.
 *
 * Betrifft: description, tagline, FAQs (q + a), Leistungen (title + description).
 * Nicht betrifft: siteData.name selbst (das IST die SSOT), URL, Kontaktdaten.
 *
 * @param data  - Das vollständige siteData-Objekt.
 * @param brandName - Der Markenname aus siteData.name.
 * @returns Array von BrandNameIssues (leer = alles OK).
 */
/**
 * Wortzeichen im Unicode-Sinn — Buchstaben (inkl. Umlaute/Akzente), Ziffern, Unterstrich.
 *
 * Bewusst NICHT `\b`/`\w`: die sind in JS ASCII-only. Für `\b` ist "ä" kein Wortzeichen,
 * also läge mitten in "Sachverständigenbüro" eine Wortgrenze — die Grenzprüfung würde
 * bei genau den Marken versagen, für die sie gebraucht wird.
 */
function isWordChar(ch: string | undefined): boolean {
  return !!ch && /[\p{L}\p{N}_]/u.test(ch);
}

/**
 * Steht der Treffer bei `pos` als eigenes Wort da — oder klebt er in einem Kompositum?
 *
 * Deutsche Komposita machen aus einer Marke ungewollt einen Treffer: "Haus am Lago"
 * steckt in "Privates Ferienhaus am Lago di Ledro" (hausamlago, Fleet-Scan 2026-08-10).
 * Ein Literal ist der Name nur, wenn eine Umbenennung den Text anfassen müsste — bei
 * "Ferienhaus" müsste sie nicht. Trennzeichen (Bindestrich, Komma, `#`) sind keine
 * Wortzeichen, "Soleno GmbH-Team" bleibt daher ein Treffer.
 */
function isStandaloneMatch(lowerHaystack: string, pos: number, needleLength: number): boolean {
  return (
    !isWordChar(lowerHaystack[pos - 1]) && !isWordChar(lowerHaystack[pos + needleLength])
  );
}

export function lintBrandNameInSiteData(
  data: AiDiscoverySiteData,
  brandName: string,
): BrandNameIssue[] {
  if (!brandName || brandName.trim().length < 2) return [];

  const issues: BrandNameIssue[] = [];
  // Groß-/Kleinschreibung ignorieren für Robustheit (z. B. "mika elektrotechnik" == "Mika Elektrotechnik").
  const needle = brandName.trim().toLowerCase();

  function countOccurrences(text: string): number {
    if (!text) return 0;
    let n = 0;
    let pos = 0;
    const lower = text.toLowerCase();
    while ((pos = lower.indexOf(needle, pos)) !== -1) {
      if (isStandaloneMatch(lower, pos, needle.length)) n++;
      pos += needle.length;
    }
    return n;
  }

  function check(fieldPath: string, text: string | undefined): void {
    if (!text) return;
    const n = countOccurrences(text);
    if (n > 0) {
      issues.push({
        location: fieldPath,
        type: 'prose_literal',
        count: n,
        detail:
          `"${brandName}" kommt ${n}× als Literal in ${fieldPath} vor. ` +
          `Prosa-Felder sollen generisch formuliert sein — der Markenname ` +
          `gehört nur in siteData.name (SSOT). ` +
          `Umbenennung: nur siteData.name ändern, fertig.`,
      });
    }
  }

  check('siteData.description', data.description);
  check('siteData.tagline', data.tagline);

  // FAQs bewusst NICHT am Wert prüfen — das übernimmt lintBrandNameInFaqSource am
  // Quelltext. Dort ist die Marke erlaubt, solange sie interpoliert ist; am Wert wäre
  // `${BRAND}` von einem Literal nicht zu unterscheiden und der Check unerfüllbar.

  if (data.leistungen) {
    data.leistungen.forEach((svc, i) => {
      check(`siteData.leistungen[${i}].title`, svc.title);
      check(`siteData.leistungen[${i}].description`, svc.description);
    });
  }

  const seo = data.seo;
  if (seo) {
    // Der Redundanz-Fall zuerst: ist das Template byte-gleich mit dem, was BaseLayout
    // ohnehin ableitet, ist das Feld pure Duplikation — und die Meldung wäre als
    // "interpolieren" irreführend. Er greift auch bei Umschreibungen ohne Literal-Treffer.
    const derivedTemplate = `%s | ${brandName}`;
    if (seo.titleTemplate === derivedTemplate) {
      issues.push({
        location: 'siteData.seo.titleTemplate',
        type: 'redundant_title_template',
        count: 1,
        detail:
          `siteData.seo.titleTemplate ist identisch mit "${derivedTemplate}" — genau das, ` +
          `was BaseLayout aus siteData.name ableitet, wenn das Feld fehlt. ` +
          `Feld löschen (und die Durchreiche in page-config.ts dazu): identischer Output, ` +
          `eine Duplikation weniger. Abweichende Templates ("%s · Marke", Kurzformen) ` +
          `bleiben erlaubt und werden hier nicht gemeldet.`,
      });
    }
    // Ausgeschriebene Marken in defaultTitle/defaultDescription/schemaDescription prüft
    // lintBrandNameInSeoSource am Quelltext — am Wert wäre `${BRAND}` nicht von einem
    // Literal zu unterscheiden, und der Check damit unerfüllbar.
  }

  return issues;
}

/**
 * Findet den Block `<key>: { … }` bzw. `<key>: [ … ]` im Quelltext und gibt seinen Inhalt
 * mit Startzeile zurück. `null`, wenn kein Block gefunden wird oder die Klammern nicht
 * aufgehen — dann meldet der Guard lieber nichts, als auf einer falschen Region zu urteilen.
 */
function extractBlock(
  source: string,
  key: string,
  openCh: '{' | '[',
): { text: string; startLine: number } | null {
  const closeCh = openCh === '{' ? '}' : ']';
  const m = source.match(new RegExp(`(^|\\n)[ \\t]*${key}\\s*:\\s*\\${openCh}`));
  if (!m || m.index === undefined) return null;
  const open = source.indexOf(openCh, m.index);
  if (open === -1) return null;

  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === openCh) depth++;
    else if (source[i] === closeCh) {
      depth--;
      if (depth === 0) {
        return {
          text: source.slice(open, i + 1),
          startLine: source.slice(0, open).split('\n').length,
        };
      }
    }
  }
  return null; // Klammern gehen nicht auf → nicht raten
}

/** Findet den `seo: { … }`-Block. Dünner Aufruf von {@link extractBlock}. */
function extractSeoBlock(source: string): { text: string; startLine: number } | null {
  return extractBlock(source, 'seo', '{');
}

/**
 * Zählt freistehende Marken-Treffer in den String-Literalen **einer** Quelltextzeile.
 *
 * Entscheidend: {@link stripNonLiteral} entfernt vorher `${…}` — eine interpolierte Marke
 * zählt also nicht. Genau daran hängt die Unterscheidung „rename-sicher" vs. „hartkodiert",
 * die am ausgewerteten Wert prinzipiell nicht zu treffen ist.
 */
function countBrandLiteralsInLine(
  rawLine: string,
  needle: string,
): { count: number; literals: string[] } {
  if (/^\s*[*/]/.test(rawLine.trim())) return { count: 0, literals: [] }; // Kommentarzeile
  const line = stripNonLiteral(rawLine);

  const literals: string[] = [];
  for (const re of [
    /'([^'\\]*(?:\\.[^'\\]*)*)'/g,
    /"([^"\\]*(?:\\.[^"\\]*)*)"/g,
    /`([^`\\]*(?:\\.[^`\\]*)*)`/g,
  ]) {
    for (const lm of line.matchAll(re)) literals.push(lm[1]);
  }
  if (literals.length === 0) return { count: 0, literals };

  let count = 0;
  for (const lit of literals) {
    const lower = lit.toLowerCase();
    let pos = 0;
    while ((pos = lower.indexOf(needle, pos)) !== -1) {
      if (isStandaloneMatch(lower, pos, needle.length)) count++;
      pos += needle.length;
    }
  }
  return { count, literals };
}

/** Entfernt Zeilenkommentare und `${…}`-Interpolationen — beides zählt nicht als Literal. */
function stripNonLiteral(line: string): string {
  return line.replace(/\/\/.*$/, '').replace(/\$\{[^}]*\}/g, '');
}

/**
 * Prüft die SEO-Meta-Felder auf **ausgeschriebene** Marken-Literale — im Quelltext, nicht
 * im Wert.
 *
 * Warum nicht auf dem siteData-Objekt wie die Prosa-Felder: bei `description`/`tagline` ist
 * der Zielzustand „Marke kommt nicht vor". Bei `defaultTitle`/`defaultDescription` ist er das
 * nicht — die Marke GEHÖRT in den ausgelieferten Title. Rename-Sicherheit heißt hier, dass
 * sie **interpoliert** statt ausgeschrieben ist, und `` `… ${BRAND}` `` ist zur Laufzeit nicht
 * von `'… Marke'` zu unterscheiden. Ein Guard auf dem Wert würde das Zielmuster mitflaggen
 * und wäre unerfüllbar. Also liest dieser Check die Quelldatei.
 *
 * @param siteDataPath - Absoluter Pfad zu `src/data/site-data.ts`.
 * @param brandName    - Der Markenname aus siteData.name.
 * @returns Array von BrandNameIssues (leer = alles OK, Datei fehlt, oder Block nicht auffindbar).
 */
export function lintBrandNameInSeoSource(siteDataPath: string, brandName: string): BrandNameIssue[] {
  if (!brandName || brandName.trim().length < 2) return [];
  if (!existsSync(siteDataPath)) return [];

  let source: string;
  try {
    source = readFileSync(siteDataPath, 'utf-8');
  } catch {
    return [];
  }

  const block = extractSeoBlock(source);
  if (!block) return [];

  const needle = brandName.trim().toLowerCase();
  const issues: BrandNameIssue[] = [];
  const lines = block.text.split('\n');

  lines.forEach((rawLine, i) => {
    const { count, literals } = countBrandLiteralsInLine(rawLine, needle);
    if (count === 0) return;

    const field = rawLine.match(/^\s*([A-Za-z_$][\w$]*)\s*:/);

    // Ein titleTemplate, das exakt `%s | <Marke>` wiederholt, meldet der Wert-Check
    // bereits als redundant — mit der richtigen Handlung ("Feld löschen"). Hier nicht
    // zusätzlich als Literal melden, sonst zählt ein Fehler doppelt.
    if (field?.[1] === 'titleTemplate' && literals.some((l) => l === `%s | ${brandName}`)) return;

    const lineNo = block.startLine + i;
    issues.push({
      location: field ? `site-data.ts:${lineNo} (seo.${field[1]})` : `site-data.ts:${lineNo}`,
      type: 'seo_literal',
      count,
      detail:
        `"${brandName}" steht ${count}× ausgeschrieben im seo-Block (Zeile ${lineNo}) — dort, ` +
        `wo <title> und <meta description> herkommen. Nicht streichen: die Marke gehört in den ` +
        `Title. Stattdessen interpolieren — Marke einmal als const über siteData definieren ` +
        `(\`const BRAND = '${brandName}';\`, dann \`name: BRAND\`) und hier \`\${BRAND}\` einsetzen. ` +
        `Danach kostet eine Umbenennung genau eine Zeile. Siehe docs/brand-name-convention.md`,
    });
  });

  return issues;
}

/**
 * Prüft den `faqs: [ … ]`-Block auf **ausgeschriebene** Marken-Literale — im Quelltext,
 * nicht am Wert.
 *
 * Warum FAQs anders behandelt werden als description/tagline/leistungen: dort ist die
 * richtige Antwort „generisch formulieren", der Markenname gehört schlicht nicht hinein.
 * In FAQs gehört er hinein. „Was ist <Marke>?" / „<Marke> ist ein …" ist die
 * Entitäts-Definition, an der AI Overviews, ChatGPT und Perplexity die Marke festmachen —
 * ausgerechnet dort den Namen zu streichen, arbeitet gegen den Zweck der Seite.
 *
 * Der Zweck der Konvention (eine Umbenennung fasst genau eine Zeile an) bleibt trotzdem
 * erfüllbar: `` `Was ist ${BRAND}?` `` liefert denselben Text und ist rename-sicher.
 * Am ausgewerteten Wert sind beide Varianten identisch — deshalb liest dieser Check den
 * Quelltext, genau wie {@link lintBrandNameInSeoSource}.
 *
 * Vorgeschichte: bis v0.103.1 prüfte der Wert-Check die FAQs mit. Das traf nur Marken,
 * deren `name` wörtlich in der Prosa steht — also einwortige. „Zink Bäckerei & Konditorei"
 * blieb sauber, obwohl die FAQ „Wie viele Filialen hat Zink?" lautet; „Blitzsicht" bekam
 * 7 Befunde für denselben Stil. Der Guard maß die Länge des Namens, nicht die Rename-Kosten.
 *
 * @param siteDataPath - Absoluter Pfad zu `src/data/site-data.ts`.
 * @param brandName    - Der Markenname aus siteData.name.
 * @returns Array von BrandNameIssues (leer = OK, Datei fehlt, oder Block nicht auffindbar).
 */
export function lintBrandNameInFaqSource(siteDataPath: string, brandName: string): BrandNameIssue[] {
  if (!brandName || brandName.trim().length < 2) return [];
  if (!existsSync(siteDataPath)) return [];

  let source: string;
  try {
    source = readFileSync(siteDataPath, 'utf-8');
  } catch {
    return [];
  }

  const block = extractBlock(source, 'faqs', '[');
  if (!block) return [];

  const needle = brandName.trim().toLowerCase();
  const issues: BrandNameIssue[] = [];

  block.text.split('\n').forEach((rawLine, i) => {
    const { count } = countBrandLiteralsInLine(rawLine, needle);
    if (count === 0) return;

    const field = rawLine.match(/^\s*([A-Za-z_$][\w$]*)\s*:/);
    const lineNo = block.startLine + i;
    issues.push({
      location: field ? `site-data.ts:${lineNo} (faqs.${field[1]})` : `site-data.ts:${lineNo} (faqs)`,
      type: 'prose_literal',
      count,
      detail:
        `"${brandName}" steht ${count}× ausgeschrieben in den FAQs (Zeile ${lineNo}). ` +
        `Nicht streichen: in einer FAQ gehört die Marke hin, das ist die Entitäts-Definition ` +
        `für AI Overviews. Stattdessen interpolieren — Marke einmal als const über siteData ` +
        `definieren (\`const BRAND = '${brandName}';\`, dann \`name: BRAND\`) und hier ` +
        `\`\${BRAND}\` einsetzen. Gleicher Text, aber eine Umbenennung kostet eine Zeile. ` +
        `Siehe docs/brand-name-convention.md`,
    });
  });

  return issues;
}

/**
 * Prüft `dist/robots.txt` auf hartkodierte Marken-Literale.
 * robots.txt braucht den Markennamen nie — Crawl-Direktiven sind domänenbasiert.
 * Wenn er trotzdem drin ist, wurde die Datei manuell angelegt statt generiert.
 *
 * @param distDir  - Absoluter Pfad zum dist-Verzeichnis (ohne trailing slash).
 * @param brandName - Der Markenname aus siteData.name.
 * @returns Array von BrandNameIssues (leer = alles OK).
 */
export function lintBrandNameInRobotsTxt(distDir: string, brandName: string): BrandNameIssue[] {
  if (!brandName || brandName.trim().length < 2) return [];

  const robotsPath = join(distDir, 'robots.txt');
  if (!existsSync(robotsPath)) return [];

  const content = readFileSync(robotsPath, 'utf-8');
  // URLs (z.B. die Sitemap-Direktive) enthalten zwangsläufig die Domain. Wenn der
  // Markenname == Domain-Root ist (z.B. "mazterplan" → mazterplan.com), wäre das
  // ein False-Positive — die URL ist strukturell unvermeidbar (kein vermeidbares
  // Prosa-Literal). Daher http(s)-URL-Tokens vor der Zählung entfernen; echte
  // Literale in Kommentaren/Direktiven bleiben erfasst.
  const scannable = content.replace(/https?:\/\/\S+/gi, '');
  const needle = brandName.trim().toLowerCase();
  const lowerContent = scannable.toLowerCase();

  let count = 0;
  let pos = 0;
  while ((pos = lowerContent.indexOf(needle, pos)) !== -1) {
    // Wortgrenze: "Ferienhaus am Lago di Ledro" ist kein Literal von "Haus am Lago".
    if (isStandaloneMatch(lowerContent, pos, needle.length)) count++;
    pos += needle.length;
  }

  if (count === 0) return [];

  return [
    {
      location: 'dist/robots.txt',
      type: 'static_asset_literal',
      count,
      detail:
        `"${brandName}" kommt ${count}× in robots.txt vor. ` +
        `robots.txt braucht den Markennamen nicht — Crawl-Direktiven sind domänenbasiert. ` +
        `Entferne das Literal. Wenn ein Sitemap-Verweis gewünscht ist, nutze nur die URL (kein Brand-Name).`,
    },
  ];
}

/** Named-Entities, die in Astro-Output real vorkommen. Bewusst klein gehalten. */
const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  quot: '"',
  apos: "'",
  lt: '<',
  gt: '>',
  nbsp: ' ',
};

/**
 * Dekodiert HTML-Entities für den Längen-Check — Google zählt das dargestellte Zeichen,
 * nicht die Escape-Sequenz. `&amp;` ist 1 Zeichen in der SERP, nicht 5.
 *
 * Ein einziger Durchgang, damit `&amp;lt;` zu `&lt;` wird und nicht zu `<` weiterzerfällt.
 * Numerische Formen gehören dazu: Astro schreibt denselben `&` in `<title>` als `&amp;`,
 * im description-Attribut aber als `&#38;` (fleet-weit 49× bzw. 62×, Stand 10.08.2026).
 */
function decodeBasicEntities(text: string): string {
  return text.replace(
    /&(?:#(\d+)|#[xX]([0-9a-fA-F]+)|([a-zA-Z][a-zA-Z0-9]*));/g,
    (match, dec?: string, hex?: string, name?: string) => {
      if (dec !== undefined) return fromCodePointSafe(Number.parseInt(dec, 10), match);
      if (hex !== undefined) return fromCodePointSafe(Number.parseInt(hex, 16), match);
      return NAMED_ENTITIES[(name ?? '').toLowerCase()] ?? match;
    },
  );
}

/** `String.fromCodePoint` ohne Crash-Risiko — ungültige Code-Points bleiben als Literal stehen. */
function fromCodePointSafe(code: number, fallback: string): string {
  if (!Number.isInteger(code) || code < 0 || code > 0x10ffff) return fallback;
  try {
    return String.fromCodePoint(code);
  } catch {
    return fallback;
  }
}

/** Extrahiert den `<title>`-Text (Entities dekodiert, whitespace-normalized). Leer wenn fehlend. */
function extractTitle(html: string): string {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!m) return '';
  return decodeBasicEntities(m[1]).replace(/\s+/g, ' ').trim();
}

/** Extrahiert den Inhalt von `<meta name="description" content="...">`. Leer wenn fehlend. */
function extractDescription(html: string): string {
  const m = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["'][^>]*>/i);
  if (!m) return '';
  return decodeBasicEntities(m[1]).replace(/\s+/g, ' ').trim();
}

/** Prüft Title/Description-Längen einer Page. */
export function lintPageMeta(
  htmlPath: string,
  distDir: string,
  maxTitle: number,
  maxDesc: number,
): MetaIssue[] {
  const issues: MetaIssue[] = [];
  const pagePath = htmlPath.slice(distDir.length).replace(/\/index\.html$/, '/');
  const page = pagePath.startsWith('/') ? pagePath : `/${pagePath}`;
  const html = readFileSync(htmlPath, 'utf-8');

  const title = extractTitle(html);
  if (!title) {
    issues.push({ page, type: 'title_missing', detail: '<title> fehlt oder leer.' });
  } else if (title.length > maxTitle) {
    issues.push({
      page,
      type: 'title_too_long',
      detail: `<title> ${title.length} Zeichen > ${maxTitle} (Google truncated SERP-Title).`,
    });
  }

  const desc = extractDescription(html);
  if (!desc) {
    issues.push({ page, type: 'description_missing', detail: '<meta name="description"> fehlt oder leer.' });
  } else if (desc.length > maxDesc) {
    issues.push({
      page,
      type: 'description_too_long',
      detail: `<meta description> ${desc.length} Zeichen > ${maxDesc} (truncated in Google-SERPs).`,
    });
  }

  return issues;
}

/** Ein `<img>` ohne verwertbaren Alt-Text auf einer dist-Page. */
export interface AltIssue {
  page: string;
  type: 'alt_missing' | 'alt_empty';
  detail: string;
}

/**
 * Scannt eine dist-HTML nach `<img>`-Tags ohne verwertbaren Alt-Text.
 * Dekorativ ausgenommen: `role="presentation"` / `aria-hidden="true"`. Sonst wird
 * fehlendes `alt` (alt_missing) UND leeres `alt=""` ohne Deko-Marker (alt_empty)
 * geflaggt — letzteres fängt das still auf `alt=""` kippende Hero-LCP-Bild.
 * Pure Funktion (Regex, kein DOM) — wie lintPageMeta/lintPageSchema.
 */
export function lintPageImgAlt(htmlPath: string, distDir: string): AltIssue[] {
  const issues: AltIssue[] = [];
  const pagePath = htmlPath.slice(distDir.length).replace(/\/index\.html$/, '/');
  const page = pagePath.startsWith('/') ? pagePath : `/${pagePath}`;
  const html = readFileSync(htmlPath, 'utf-8');
  const imgs = html.match(/<img\b[^>]*>/gi) ?? [];
  for (const tag of imgs) {
    // Dekorative Bilder sind bewusst alt-frei → nicht flaggen.
    if (
      /\brole\s*=\s*["']presentation["']/i.test(tag) ||
      /\baria-hidden\s*=\s*["']true["']/i.test(tag)
    ) {
      continue;
    }
    const srcM = tag.match(/\bsrc\s*=\s*["']([^"']+)["']/i);
    const srcNote = srcM ? ` (src=${srcM[1]})` : '';
    const altMatch = tag.match(/\balt\s*=\s*("([^"]*)"|'([^']*)')/i);
    if (!altMatch) {
      issues.push({ page, type: 'alt_missing', detail: `<img> ohne alt-Attribut${srcNote}.` });
    } else if ((altMatch[2] ?? altMatch[3] ?? '').trim() === '') {
      issues.push({
        page,
        type: 'alt_empty',
        detail: `<img alt=""> ohne Deko-Marker${srcNote} — dekorativ? role="presentation" setzen, sonst Alt-Text ergänzen.`,
      });
    }
  }
  return issues;
}

/** Ein `<img>` mit nicht-leerem, aber generischem/schwachem Alt-Text. */
export interface AltQualityIssue {
  page: string;
  type: 'alt_generic_term' | 'alt_placeholder' | 'alt_filename' | 'alt_too_short';
  detail: string;
}

// „Bild: …", „Foto –", „Abbildung" etc. als Alt-Präfix — sagt nichts über den Inhalt.
const ALT_PLACEHOLDER_RE = /^(bild|foto|image|grafik|abbildung)\s*[:\-–]?\s*/i;
// Alt endet auf eine Bild-Endung → jemand hat den Dateinamen ins alt kopiert.
const ALT_EXT_RE = /\.(jpe?g|png|webp|svg|gif|avif)$/i;
// All-lowercase-Slug mit Separatoren („hero-image-2", „hero_bg") — filename-artig.
// Bewusst all-lowercase, damit deutsche Namen/Wörter mit Bindestrich („Vorher-Nachher",
// „Max-Mustermann") NICHT als Dateiname geflaggt werden (Groß-/Kleinschreibung schützt).
const ALT_SLUG_RE = /^[a-z0-9]+([-_][a-z0-9]+)+$/;
// Brand-Marks + globale Chrome-Widgets: deren Alt (Markenname/festes Label) ist bewusst
// überall gleich — nicht als Content-Alt bewerten. src~=logo/favicon/signet/badge fängt
// sie img-lokal, auch wenn die Marker-Klasse am Eltern-Element sitzt (kein Ancestor-Check).
// Auslöser (v0.77.0/0.77.1-Fleet-Audit): Footer-Logo (logo-Klasse am <a>), mika-„signet",
// Status-/PageSpeed-Badges (status.…/badge/…svg) flaggten sonst auf JEDER Seite.
const ALT_BRANDMARK_SRC_RE = /\bsrc\s*=\s*["'][^"']*(?:logo|favicon|signet|badge)[^"']*["']/i;

/**
 * Scannt eine dist-HTML nach `<img>` mit nicht-leerem, aber QUALITATIV schwachem Alt:
 * generischer Term (=== Firmenname/Leistungstitel, exact-match), Platzhalter-Präfix,
 * Dateiname-als-Alt, zu kurz (<5). Ergänzt `lintPageImgAlt` (Existenz) um Güte.
 * Deko-/Brand-Bilder sind ausgenommen (deren Alt === Markenname/festes Label ist korrekt):
 * `role=presentation`/`aria-hidden`/`class~=logo`/`data-logo` ODER `src` enthält
 * `logo`/`favicon`/`signet`/`badge`. Pure Funktion (Regex, kein DOM).
 *
 * `genericTerms` = Firmenname + Leistungstitel + areaServed (aus siteData, im Hook).
 */
export function lintPageImgAltQuality(
  htmlPath: string,
  distDir: string,
  genericTerms: readonly string[] = [],
): AltQualityIssue[] {
  const issues: AltQualityIssue[] = [];
  const pagePath = htmlPath.slice(distDir.length).replace(/\/index\.html$/, '/');
  const page = pagePath.startsWith('/') ? pagePath : `/${pagePath}`;
  const html = readFileSync(htmlPath, 'utf-8');
  const terms = new Set(genericTerms.map((t) => t.trim().toLowerCase()).filter(Boolean));
  const imgs = html.match(/<img\b[^>]*>/gi) ?? [];
  for (const tag of imgs) {
    // Deko + Brand-Marks/Chrome ausnehmen (siehe ALT_BRANDMARK_SRC_RE).
    if (
      /\brole\s*=\s*["']presentation["']/i.test(tag) ||
      /\baria-hidden\s*=\s*["']true["']/i.test(tag) ||
      /\bclass\s*=\s*["'][^"']*\blogo\b[^"']*["']/i.test(tag) ||
      /\bdata-logo\b/i.test(tag) ||
      ALT_BRANDMARK_SRC_RE.test(tag)
    ) {
      continue;
    }
    const altMatch = tag.match(/\balt\s*=\s*("([^"]*)"|'([^']*)')/i);
    if (!altMatch) continue; // fehlendes alt → Existenz-Guard (lintPageImgAlt), nicht Qualität
    const alt = (altMatch[2] ?? altMatch[3] ?? '').trim();
    if (alt === '') continue; // leeres alt → Existenz-Guard
    const srcM = tag.match(/\bsrc\s*=\s*["']([^"']+)["']/i);
    const srcNote = srcM ? ` (src=${srcM[1]})` : '';
    if (terms.has(alt.toLowerCase())) {
      issues.push({
        page,
        type: 'alt_generic_term',
        detail: `Alt „${alt}" = generischer Term (Firmenname/Leistungstitel)${srcNote} — konkretes Motiv beschreiben.`,
      });
    } else if (ALT_PLACEHOLDER_RE.test(alt)) {
      issues.push({ page, type: 'alt_placeholder', detail: `Alt „${alt}" beginnt mit Platzhalter-Wort${srcNote}.` });
    } else if (ALT_EXT_RE.test(alt) || ALT_SLUG_RE.test(alt)) {
      issues.push({ page, type: 'alt_filename', detail: `Alt „${alt}" sieht wie ein Dateiname/Slug aus${srcNote}.` });
    } else if (alt.length < 5) {
      issues.push({ page, type: 'alt_too_short', detail: `Alt „${alt}" zu kurz (<5 Zeichen)${srcNote}.` });
    }
  }
  return issues;
}

export interface StrayBraceIssue {
  page: string;
  type: 'stray_brace';
  detail: string;
}

/** Elemente, deren Inhalt kein Fließtext ist oder unbalancierte Klammern tragen darf. */
const BRACE_EXEMPT_ELEMENTS = ['script', 'style', 'pre', 'code'] as const;

/**
 * Scannt eine dist-HTML nach **verwaisten** `{`/`}` in gerenderten Textknoten.
 *
 * Hintergrund (blitzsicht-ops#652): der Astro-Compiler (2.13.1) beendet einen
 * Template-Ausdruck zu früh, wenn ein Regex-Literal darin Anführungszeichen in der
 * Zeichenklasse trägt — `{v.replace(/['"]/g, '')}`. Die schließende Klammer landet dann als
 * Text in der Seite. In customer-blitzsicht rendered jedes Schriftmuster der Brand-Guides
 * monatelang „Work Sans}" / „Inter Variable}", ohne dass irgendein Guard anschlug.
 *
 * Geprüft wird die **allgemeine Form** — Zeichen, die der Parser als Text ausgibt, obwohl
 * sie Syntax sein sollten — nicht dieser eine Regex-Fall.
 *
 * Zwei Einschränkungen halten die Regel falsch-positiv-frei (Messung 11.08.2026 über die
 * dist-Verzeichnisse aller 22 vorhandenen Kunden-Repos):
 *
 * 1. **Nur balancierte Knoten gehen durch.** `'{ "a": 1 }'` ist Prosa, `' Work Sans}'` ist
 *    ein Artefakt. Alle vier echten Treffer sind verwaiste `}`.
 * 2. **{@link BRACE_EXEMPT_ELEMENTS} ausgenommen.** `<script>`/`<style>` sind kein Text;
 *    `<pre>`/`<code>` dürfen unbalanciert sein — ein Code-Beispiel wie `if (x) {` ist
 *    richtig so. Code-Blöcke gibt es auf 17 der 22 Sites, heute noch ohne Klammern.
 *
 * Der Aufrufer reicht nur `index.html` herein ({@link walkHtml}). Das ist keine Feinheit,
 * sondern trägt die Messung: über *alle* `*.html` wären es 440 Treffer, davon 436 aus zwei
 * statischen Dateien aus `public/`, die nie durch Astros Parser liefen (ein Handbuch mit
 * Code-Beispielen, eine Mail-Vorlage). Über `index.html` sind es exakt die 4 echten.
 *
 * Pure Funktion (Regex, kein DOM) — wie lintPageMeta/lintPageImgAlt/lintPageSchema.
 */
export function lintPageStrayBraces(htmlPath: string, distDir: string): StrayBraceIssue[] {
  const issues: StrayBraceIssue[] = [];
  const pagePath = htmlPath.slice(distDir.length).replace(/\/index\.html$/, '/');
  const page = pagePath.startsWith('/') ? pagePath : `/${pagePath}`;
  if (!existsSync(htmlPath)) return issues;

  let html: string;
  try {
    html = readFileSync(htmlPath, 'utf-8');
  } catch {
    return issues;
  }

  // Ausgenommene Elemente samt Inhalt entfernen, bevor Textknoten gelesen werden.
  for (const tag of BRACE_EXEMPT_ELEMENTS) {
    html = html.replace(new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?</${tag}\\s*>`, 'gi'), '');
    // Self-closing/leere Variante (z. B. <script src=… />) hinterlässt keinen Text.
  }

  for (const m of html.matchAll(/>([^<]+)</g)) {
    const text = m[1];
    if (!text.includes('{') && !text.includes('}')) continue;

    // Entities sind gewollter Text, kein Parser-Artefakt — vor der Zählung entfernen.
    const cleaned = text.replace(/&(?:#x?[0-9a-f]+|[a-z]+);/gi, '');

    // Verwaist = im selben Knoten ohne Gegenstück. Reihenfolge zählt: "}{" ist zweimal
    // verwaist, nicht ausgeglichen.
    let open = 0;
    let orphanClose = 0;
    for (const ch of cleaned) {
      if (ch === '{') open++;
      else if (ch === '}') {
        if (open > 0) open--;
        else orphanClose++;
      }
    }
    if (open === 0 && orphanClose === 0) continue;

    const snippet = text.trim().replace(/\s+/g, ' ').slice(0, 80);
    const what = [
      orphanClose > 0 ? `${orphanClose}× verwaiste }` : '',
      open > 0 ? `${open}× verwaiste {` : '',
    ]
      .filter(Boolean)
      .join(', ');
    issues.push({
      page,
      type: 'stray_brace',
      detail:
        `„${snippet}" — ${what} im Text. Häufigste Ursache: ein Regex-Literal mit ` +
        `Anführungszeichen in der Zeichenklasse (/['"]/) in einem Template-Ausdruck — ` +
        `der Compiler beendet den Ausdruck zu früh und schreibt die Klammer als Text. ` +
        `Ausdruck ins Frontmatter ziehen.`,
    });
  }

  return issues;
}

/** Prüft eine einzelne dist-HTML auf Schema-Probleme. */
export function lintPageSchema(htmlPath: string, distDir: string): SchemaIssue[] {
  const issues: SchemaIssue[] = [];
  const pagePath = htmlPath.slice(distDir.length).replace(/\/index\.html$/, '/');
  const page = pagePath.startsWith('/') ? pagePath : `/${pagePath}`;
  const html = readFileSync(htmlPath, 'utf-8');
  const blocks = extractJsonLd(html);
  if (blocks.length === 0) return issues;

  const allIds: string[] = [];
  for (let i = 0; i < blocks.length; i++) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(blocks[i]);
    } catch {
      issues.push({ page, type: 'invalid_json', detail: `JSON-LD-Block #${i + 1} ist kein gültiges JSON.` });
      continue;
    }
    // Sekundär-Smoke-Checks: @context + @type
    //
    // Ein Block darf laut JSON-LD-Spec ein einzelnes Objekt ODER ein Array von
    // Objekten sein — Google unterstützt beide Formen. Bei der Array-Form trägt
    // jedes Element die Pflichtfelder, der Wurzelknoten selbst hat keine. Wer nur
    // die Wurzel prüft, meldet ein korrektes Array als kontext- und typlos
    // (digital-direkt `/karriere/`, zwei JobPostings in einem Block).
    const nodes: Array<{ node: unknown; where: string }> = Array.isArray(parsed)
      ? parsed.map((node, j) => ({ node, where: `#${i + 1}[${j}]` }))
      : [{ node: parsed, where: `#${i + 1}` }];

    for (const { node, where } of nodes) {
      if (!node || typeof node !== 'object' || Array.isArray(node)) {
        issues.push({ page, type: 'invalid_json', detail: `JSON-LD-Block ${where} ist kein Objekt.` });
        continue;
      }
      const n = node as Record<string, unknown>;
      if (!n['@context'] && !Array.isArray(n['@graph'])) {
        issues.push({ page, type: 'missing_context', detail: `JSON-LD-Block ${where} hat kein @context.` });
      }
      if (!n['@type'] && !Array.isArray(n['@graph'])) {
        issues.push({ page, type: 'missing_type', detail: `JSON-LD-Block ${where} hat kein @type.` });
      }
    }
    collectIds(parsed, allIds);
  }

  // Duplikat-Detektion (Kern-Check)
  const counts = new Map<string, number>();
  for (const id of allIds) counts.set(id, (counts.get(id) ?? 0) + 1);
  for (const [id, count] of counts) {
    if (count > 1) {
      issues.push({
        page,
        type: 'duplicate_id',
        detail: `@id "${id}" kommt ${count}× vor — Google Rich Results meldet doppelte Entität.`,
      });
    }
  }
  return issues;
}

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

export function generateLlmsTxt(
  data: AiDiscoverySiteData,
  services: ReadonlyArray<ServiceItem> | undefined,
  importantPages: ReadonlyArray<{ label: string; href: string }> = [],
): string {
  const lines: string[] = [];

  // H1 = site name (llmstxt.org spec)
  lines.push(`# ${data.name}`);
  lines.push('');

  // Blockquote = description
  const descriptionLines = data.description.split('\n');
  for (const line of descriptionLines) {
    lines.push(`> ${line}`);
  }
  lines.push('');

  // Services section
  if (services && services.length > 0) {
    lines.push('## Was wir anbieten');
    lines.push('');
    for (const service of services) {
      const slug = service.slug;
      const linkPart = slug
        ? ` ([Details](${data.url}/leistungen/${slug}))`
        : '';
      lines.push(`- **${service.title}** — ${service.description}${linkPart}`);
    }
    lines.push('');
  }

  // Key facts — only emit non-empty values
  //
  // Firmierung und Registerdaten gehören hierher, seit blitzsicht-ops#648: mika und
  // zink pflegten sie in einer statischen public/llms.txt, weil die generierte Datei
  // sie nicht enthielt — und überschrieben die generierte per postbuild-cp. Damit
  // drifteten Markenname und Beschreibung dauerhaft von siteData weg. Jetzt kommen
  // sie aus derselben Quelle wie alles andere.
  const facts: string[] = [];
  if (data.legal.owner) {
    facts.push(`- Firma: ${data.legal.owner}`);
  }
  if (data.legal.representatives && data.legal.representatives.length > 0) {
    facts.push(`- Vertretungsberechtigt: ${data.legal.representatives.join(', ')}`);
  }
  if (data.seo?.foundingDate) {
    facts.push(`- Gegründet: ${data.seo.foundingDate}`);
  }
  if (data.seo?.areaServed && data.seo.areaServed.length > 0) {
    facts.push(`- Servicegebiet: ${data.seo.areaServed.join(', ')}`);
  }
  const registerNo = data.legal.registerNumber ?? data.legal.registerNummer;
  if (registerNo) {
    const court = data.legal.registerCourt ? `, ${data.legal.registerCourt}` : '';
    facts.push(`- Handelsregister: ${registerNo}${court}`);
  }
  if (data.legal.ustIdNr) {
    facts.push(`- USt-IdNr.: ${data.legal.ustIdNr}`);
  }
  if (facts.length > 0) {
    lines.push('## Eckdaten');
    lines.push('');
    for (const fact of facts) {
      lines.push(fact);
    }
    lines.push('');
  }

  // Important pages — aus den REAL gebauten Seiten abgeleitet (keine toten Links)
  if (importantPages.length > 0) {
    lines.push('## Wichtige Seiten');
    lines.push('');
    for (const page of importantPages) {
      lines.push(`- [${page.label}](${page.href})`);
    }
    lines.push('');
  }

  // Andere maßgebliche Adressen (sameAs) — Repository, Paketverzeichnis, Profile.
  //
  // Bewusst VOR dem Volltext-Zeiger: Wer die Datei liest, um das Werkzeug zu
  // empfehlen, braucht die Adresse, unter der es liegt. Ohne sie kann ein Modell
  // die Seite zwar beschreiben, aber nicht auf die Quelle verweisen.
  if (data.seo?.sameAs && data.seo.sameAs.length > 0) {
    lines.push('## Auch zu finden unter');
    lines.push('');
    for (const adresse of data.seo.sameAs) {
      lines.push(`- ${adresse}`);
    }
    lines.push('');
  }

  // Machine-readable full text pointer
  lines.push('## Maschinenlesbarer Volltext');
  lines.push('');
  lines.push(
    `- [llms-full.txt](${data.url}/llms-full.txt) — Alle Seiten im Volltext, dazu Service-, FAQ- und Unternehmensinformationen für KI-Agenten`,
  );
  lines.push('');

  // Contact
  lines.push('## Kontakt');
  lines.push('');
  lines.push(`- Web: ${data.url}`);
  if (data.contact.phone) {
    lines.push(`- Telefon: ${data.contact.phone}`);
  }
  if (data.contact.email) {
    lines.push(`- E-Mail: ${data.contact.email}`);
  }
  const address = [data.legal.street, `${data.legal.zip ?? ''} ${data.legal.city ?? ''}`.trim()]
    .filter(Boolean)
    .join(', ');
  if (address) {
    lines.push(`- Anschrift: ${address}`);
  }
  lines.push('');

  return lines.join('\n');
}

export function generateLlmsFullTxt(
  data: AiDiscoverySiteData,
  services: ReadonlyArray<ServiceItem> | undefined,
  faqs: ReadonlyArray<FAQItem> | undefined,
  collected: CollectedPages = { pages: [], dropped: [] },
): string {
  const today = new Date().toISOString().slice(0, 10);
  const lines: string[] = [];

  lines.push(`# ${data.name} — Vollständige maschinenlesbare Informationen`);
  lines.push('');
  lines.push(`Letzte Aktualisierung: ${today}`);
  lines.push(`Kanonische URL: ${data.url}`);
  lines.push('');

  // Company overview
  lines.push('## Unternehmen');
  lines.push('');
  lines.push(data.description);
  lines.push('');
  const address = [data.legal.street, `${data.legal.zip ?? ''} ${data.legal.city ?? ''}`.trim()]
    .filter(Boolean)
    .join(', ');
  if (address) {
    lines.push(`- Anschrift: ${address}`);
  }
  if (data.contact.phone) {
    lines.push(`- Telefon: ${data.contact.phone}`);
  }
  if (data.contact.email) {
    lines.push(`- E-Mail: ${data.contact.email}`);
  }
  lines.push(`- Web: ${data.url}`);
  if (data.seo?.foundingDate) {
    lines.push(`- Gegründet: ${data.seo.foundingDate}`);
  }
  if (data.seo?.areaServed && data.seo.areaServed.length > 0) {
    lines.push(`- Servicegebiet: ${data.seo.areaServed.join(', ')}`);
  }
  lines.push('');

  // Services in detail
  if (services && services.length > 0) {
    lines.push('---');
    lines.push('');
    lines.push('## Leistungen im Detail');
    lines.push('');
    for (let i = 0; i < services.length; i++) {
      const service = services[i];
      lines.push(`### ${i + 1}. ${service.title}`);
      lines.push('');
      lines.push(service.description);
      if (service.slug) {
        lines.push('');
        lines.push(`URL: ${data.url}/leistungen/${service.slug}`);
      }
      lines.push('');
    }
  }

  // FAQs
  if (faqs && faqs.length > 0) {
    lines.push('---');
    lines.push('');
    lines.push('## FAQ — Häufige Fragen');
    lines.push('');
    for (const faq of faqs) {
      lines.push(`### ${faq.q}`);
      lines.push('');
      lines.push(faq.a);
      lines.push('');
    }
  }

  // Seiten im Volltext (cw-core#105)
  //
  // Bis v0.142.0 trug llms-full.txt Unternehmensdaten und FAQ, aber keinen
  // Seiteninhalt — bei falzmarke 2828 Bytes für zwanzig Seiten, von denen einzelne
  // über 1400 Wörter haben. Wer wissen wollte, was auf /din-5008 steht, erfuhr es
  // dort nicht. Genau das ist aber der Zweck der Datei (llmstxt.org).
  if (collected.pages.length > 0) {
    lines.push('---');
    lines.push('');
    lines.push('## Seiten im Volltext');
    lines.push('');
    for (const page of collected.pages) {
      lines.push(`### ${page.title}`);
      lines.push('');
      lines.push(`URL: ${page.url}`);
      lines.push('');
      lines.push(page.text);
      lines.push('');
    }
  }

  // Eine unerwähnte Obergrenze liest sich wie „alles enthalten". Wurde gekappt,
  // steht das IN der Datei und nicht nur im Build-Log — die Datei ist das, was ein
  // Assistent zu sehen bekommt, das Log sieht er nie.
  if (collected.dropped.length > 0) {
    lines.push(
      `> Nicht enthalten, weil das Byte-Budget dieser Datei erschöpft war: ` +
        `${collected.dropped.join(', ')}`,
    );
    lines.push('');
  }

  // Data usage notice
  lines.push('---');
  lines.push('');
  lines.push('## Datennutzung');
  lines.push('');
  lines.push(
    `Diese Datei darf von KI-Systemen (ChatGPT, Claude, Perplexity, Gemini, Copilot u. a.) ` +
      `für Antworten an Endnutzer ausgewertet und mit Quelle (${new URL(data.url).hostname}) zitiert werden.`,
  );
  lines.push('');

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Integration factory
// ---------------------------------------------------------------------------

/** Eine §5-DDG-Lücke in den Impressum-Rechtsform-Angaben. */
export interface ImpressumIssue {
  /** Betroffenes site-data-Feld (z. B. "legal.company"). */
  field: string;
  /** Erklärung + Fix-Hinweis. */
  detail: string;
}

// Rechtsformen, bei denen Firma + Rechtsform ins Impressum gehören (keine Einzelunternehmer).
const GESELLSCHAFT_FORMEN = new Set(['gbr', 'egbr', 'ek', 'ug', 'gmbh', 'gmbh-co-kg', 'ag']);
// Eingetragene Register → Registernummer ist §5-DDG-Pflicht.
const EINGETRAGENE_REGISTER = new Set(['hrb', 'hra', 'gnr', 'vr']);
// Marker, an denen man erkennt, dass `owner` bereits die Firma inkl. Rechtsform trägt.
const RECHTSFORM_MARKER = ['GmbH', 'mbH', 'eGbR', 'GbR', ' UG', ' AG', ' KG', 'OHG', 'e.K.', 'eG', 'e.V.'];

/**
 * Prüft die §5-DDG-Pflichtangaben zur Rechtsform im Impressum.
 *
 * Auslöser (2026-06-21): customer-gottl-richter-gomeier (eGbR) hatte owner=Privatperson
 * ('Gottl Reiner') und die Firma nur im `company`-Feld, das ImpressumBlock damals nie
 * renderte → das Impressum nannte keine Firma/Rechtsform. Cluster-Risiko: jeder Customer,
 * der `company` statt eines firmierten `owner` nutzt.
 *
 * Zwei Checks: (1) Gesellschaften müssen Firma+Rechtsform tragen (company ODER owner mit
 * Rechtsform-Marker); (2) eingetragene Rechtsformen brauchen eine Registernummer.
 */
export function lintImpressumLegalForm(legal: AiDiscoverySiteData['legal']): ImpressumIssue[] {
  const issues: ImpressumIssue[] = [];
  const rf = (legal.rechtsform ?? '').toLowerCase();
  if (!rf) return issues; // kein Rechtsform-Schema gepflegt → nichts zu prüfen

  if (GESELLSCHAFT_FORMEN.has(rf)) {
    const owner = legal.owner ?? '';
    const hasCompany = !!(legal.company && legal.company.trim());
    const ownerHatRechtsform = RECHTSFORM_MARKER.some((m) => owner.includes(m));
    if (!hasCompany && !ownerHatRechtsform) {
      issues.push({
        field: 'legal.company',
        detail:
          `rechtsform='${rf}' ist eine Gesellschaft, aber weder legal.company ist gesetzt noch ` +
          `enthält legal.owner ('${owner}') die Rechtsform → das Impressum nennt nur eine Privatperson ` +
          `statt der Firma (§5 DDG-Mangel). Setze legal.company auf den Firmennamen inkl. Rechtsform.`,
      });
    }
  }

  const reg = (legal.register ?? '').toLowerCase();
  const regNr = legal.registerNumber ?? legal.registerNummer;
  if (EINGETRAGENE_REGISTER.has(reg) && !(regNr && String(regNr).trim())) {
    issues.push({
      field: 'legal.registerNumber',
      detail:
        `register='${reg}' (eingetragen) aber keine registerNumber/registerNummer gesetzt → der ` +
        `Pflicht-Registereintrag fehlt im Impressum (§5 DDG). Registernummer + Registergericht ergänzen.`,
    });
  }

  return issues;
}

/** Eine site-data-Shape-Abweichung (Bild-Pipeline/SEO betroffen). */
export interface ShapeIssue {
  /** Betroffenes site-data-Feld. */
  field: string;
  /** `warn` = die Bild-Pipeline tut still weniger; `info` = reiner SEO-Vollständigkeits-Hinweis. */
  severity: 'warn' | 'info';
  /** Erklärung + Fix-Hinweis. */
  detail: string;
}

/**
 * Schema-Consistency-Guard: findet Abweichungen der site-data-Shape von der
 * Canonical-Vorlage (site-data.template.ts), die dazu führen, dass die Bild-Geotag-
 * Pipeline + SEO still WENIGER tun (keine Service-Keywords, keine Hero-Description,
 * XMP:State-Lücke). Die Pipeline toleriert diese Shapes bereits (geotag-core) —
 * dieser Guard macht sie im Build-Log sichtbar, damit die Fleet auf die Canonical-
 * Shape konvergiert (der Mismatch bleibt nie wieder unbemerkt).
 *
 * Auslöser (Review 2026-07-10): gottl nutzt `services[].label` + `images.hero`-String,
 * die Ferienhäuser `images.hero`, donau `hero.imageAlt` ohne `hero.image` → alle
 * bekamen still weniger Bild-Metadaten als die Canonical-Kunden.
 */
export function lintSiteDataShape(data: any): ShapeIssue[] {
  const issues: ShapeIssue[] = [];
  const hero = data?.hero ?? {};
  const stringHero = typeof data?.images?.hero === 'string' ? data.images.hero : null;

  // (a) Hero-Bild-Shape
  if (stringHero && !hero.image) {
    issues.push({
      field: 'images.hero',
      severity: 'warn',
      detail:
        `Hero-Bild als images.hero-String ('${stringHero}') statt canonical hero.image/hero.imageAlt. ` +
        `Die Pipeline toleriert es, aber ohne hero.imageAlt fehlt die Bild-Description.`,
    });
    if (/\.jpe?g$/i.test(stringHero)) {
      issues.push({
        field: 'images.hero',
        severity: 'warn',
        detail: `Hero ist ${stringHero} (.jpg) — Cluster-Standard ist .webp (kleiner, via optimize-images).`,
      });
    }
  }
  if (hero.imageAlt && !hero.image) {
    issues.push({
      field: 'hero.imageAlt',
      severity: 'warn',
      detail: `hero.imageAlt gesetzt, aber hero.image fehlt → verwaister Alt-Text, kein Hero-Bild getaggt.`,
    });
  }

  // (b) Service-Shape
  const hasLeistungen = Array.isArray(data?.leistungen) && data.leistungen.length > 0;
  const hasServices = Array.isArray(data?.services) && data.services.length > 0;
  if (hasServices && !hasLeistungen) {
    issues.push({
      field: 'services',
      severity: 'warn',
      detail:
        `Service-Liste als services[].label statt canonical leistungen[].title. Die Pipeline ` +
        `toleriert es für Keywords, aber andere cw-core-Features erwarten leistungen[].`,
    });
  }

  // (c) SEO-Vollständigkeit (reine Hinweise, brechen nie den Build)
  if (!data?.legal?.region) {
    issues.push({
      field: 'legal.region',
      severity: 'info',
      detail: `legal.region fehlt → das Bild-Geo-Tag XMP:State bleibt leer. Region ergänzen (z.B. 'Bayern').`,
    });
  }
  if (!(Array.isArray(data?.seo?.knowsAbout) && data.seo.knowsAbout.length)) {
    issues.push({
      field: 'seo.knowsAbout',
      severity: 'info',
      detail: `seo.knowsAbout fehlt/leer → schwächere AI-Zitierbarkeit + weniger Keyword-Quelle für Bild-Tags.`,
    });
  }

  return issues;
}

/** Was der Shape-Guard ins Build-Log schreibt — und ob er den Build abbricht. */
export interface ShapeReport {
  /** Log-Level für Kopf- UND Detailzeilen. */
  level: 'info' | 'warn';
  /** Kopfzeile. */
  header: string;
  /** Detailzeilen, je eine pro Issue. Führende zwei Leerzeichen sind Vertrag, s.u. */
  lines: string[];
  /** true → Build abbrechen. */
  throws: boolean;
  /** Text der Abbruch-Meldung. Leer, wenn `throws` false ist. */
  throwMessage: string;
}

/**
 * Entscheidet, mit welchem Level der Shape-Guard meldet. Reine Logik, kein Logger —
 * damit die Entscheidung testbar ist, statt nur im Astro-Hook zu leben.
 *
 * 🔴 Anlass (13.08.2026): `legal.region` und `seo.knowsAbout` sind hier ausdrücklich
 * `severity: 'info'` und brechen laut eigener Definition nie den Build — `strict` wirft
 * nur bei `warn`. Ausgegeben wurden sie trotzdem per `logger.warn`, Astro schrieb `[WARN]`
 * ins Log, und der strict-warnings-Gate des Release-Trains zählt jede WARN-Zeile mit
 * `@cw/core`-Label als Befund (`customer-websites/scripts/lib/build-warnings.mjs`). Ein
 * Hinweis, der nichts bricht, verweigerte damit den PR: `allstargirls-regensburg` und
 * `itk-regensburg` hingen allein deswegen auf v0.110.0 fest.
 *
 * Das `✓` im Hinweis-Fall ist Absicht, nicht Kosmetik: der Report zählt Info-Zeilen mit
 * `✓` als Beleg, dass ein Guard überhaupt gelaufen ist (`guardOk`). Ohne das Häkchen hätte
 * ein Repo mit SEO-Hinweisen still einen Guard weniger vorzuweisen als ein sauberes — und
 * ausgerechnet die Vorbedingungs-Zählung würde ungenau.
 *
 * Die zwei führenden Leerzeichen der Detailzeilen sind ebenfalls Vertrag: daran erkennt
 * der Report Detail- von Kopfzeilen und hängt sie an den richtigen Befund.
 *
 * @param issues Ergebnis von `lintSiteDataShape`
 * @param strict `strictSiteDataShape !== false`
 */
export function planShapeReport(issues: ShapeIssue[], strict: boolean): ShapeReport {
  const warnIssues = issues.filter((i) => i.severity === 'warn');
  const hintCount = issues.length - warnIssues.length;
  const lines = issues.map((i) => `  [${i.severity}] ${i.field}: ${i.detail}`);

  if (issues.length === 0) {
    return {
      level: 'info',
      header: `SiteData-Shape: ✓ Canonical-Shape (Bild-Pipeline voll wirksam).`,
      lines: [],
      throws: false,
      throwMessage: '',
    };
  }

  if (warnIssues.length === 0) {
    return {
      level: 'info',
      header: `SiteData-Shape: ✓ Canonical-Shape, ${hintCount} SEO-Hinweis(e) (kein Befund):`,
      lines,
      throws: false,
      throwMessage: '',
    };
  }

  return {
    level: 'warn',
    header:
      `SiteData-Shape: ${warnIssues.length} Shape-Abweichung(en), ` +
      `${hintCount} SEO-Hinweis(e):`,
    lines,
    throws: strict,
    // Leer, wenn nicht abgebrochen wird — eine Meldung, die niemand wirft, ist toter Text.
    throwMessage: strict
      ? `[ai-discovery] strictSiteDataShape=true: Build abgebrochen wegen ${warnIssues.length} Shape-Abweichung(en). ` +
        `Auf Canonical-Shape bringen (hero.image/hero.imageAlt, leistungen[].title). Opt-out: strictSiteDataShape:false.`
      : '',
  };
}

export interface AssetFormatIssue {
  /** Pfad relativ zum jeweiligen Wurzelverzeichnis (public/ bzw. src/assets/). */
  file: string;
  /** Endung der Datei, klein geschrieben, mit Punkt. */
  ext: string;
  /** Was die Endung verspricht. */
  expected: string;
  /** Was die Magic Bytes sagen. */
  actual: string;
  /** Dateigröße in Bytes — macht „212 Byte HTML statt Logo" auf einen Blick lesbar. */
  bytes: number;
}

/** Verzeichnisse, die auch unterhalb von public/ nie Ausliefer-Assets enthalten. */
const ASSET_WALK_SKIP = new Set(['node_modules', '.git', '.astro', '.vercel', 'dist']);

/**
 * Alle Dateien mit prüfbarer Bild-Endung unter `dir` einsammeln.
 * @param dir Wurzelverzeichnis
 * @param root Wurzel für die relative Pfadangabe
 */
function walkAssets(dir: string, root: string, results: string[] = []): string[] {
  if (!existsSync(dir)) return results;
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return results; // unlesbares Verzeichnis darf den Build nicht kippen
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    let stat;
    try {
      stat = statSync(full);
    } catch {
      continue; // toter Symlink o.ä.
    }
    if (stat.isDirectory()) {
      if (ASSET_WALK_SKIP.has(entry)) continue;
      walkAssets(full, root, results);
    } else if (expectedFormatForExt(extname(entry))) {
      results.push(full);
    }
  }
  return results;
}

/**
 * Magic-Byte-Guard für QUELL-Assets: hält bei jeder Bilddatei den Inhalt gegen die Endung.
 *
 * Warum an der Quelle und nicht (wie Geotag-/Perf-Guard) an `dist/`: bis cw-core v0.101.1
 * meldete exiftool über den Geotag-Guard noch `hero…webp: Not a valid WEBP (looks more like
 * a PNG)`. Seit v0.101.2 (`fallbackFormat="webp"`) sind die dist-Derivate echte WebP — der
 * Befund verschwand, ohne dass jemand die Datei angefasst hatte. steller wanderte in der
 * Fleet-Basiszahl still von „5 Bilder über Budget + Formatwarnung" auf „sauber".
 * Ein Guard, der nur das Ergebnis prüft, kann eine kaputte Quelle nicht sehen, sobald die
 * Pipeline sie glattbügelt (blitzsicht-ops#651).
 *
 * Geltungsbereich bewusst eng: nur was ausgeliefert wird. Gemessen über die Fleet
 * (11.08.2026) liegen im ganzen Repo 1377 Bilddateien, in `public/` + `src/assets/` aber
 * nur 524 — der Rest sind Foto-Master, Website-Archive, QA-Screenshots und Marketing-
 * Exporte, die nie beim Besucher ankommen. Bilder unter `src/` außerhalb `src/assets/`:
 * keine. Der enge Schnitt verliert also nichts und spart 839 irrelevante Dateien.
 *
 * @param dirs Wurzelverzeichnisse (publicDir, srcDir/assets) — fehlende werden übersprungen
 * @returns Befunde + wie viele Dateien tatsächlich gelesen wurden (Vorbedingungs-Beleg:
 *          `checked: 0` heißt „nichts gemessen", nicht „alles sauber")
 */
export function lintSourceAssetFormat(dirs: string[]): {
  issues: AssetFormatIssue[];
  checked: number;
} {
  const issues: AssetFormatIssue[] = [];
  let checked = 0;

  for (const root of dirs) {
    if (!root || !existsSync(root)) continue;
    for (const full of walkAssets(root, root)) {
      const ext = extname(full).toLowerCase();
      const expected = expectedFormatForExt(ext);
      if (!expected) continue;

      let head: Buffer;
      let bytes: number;
      try {
        bytes = statSync(full).size;
        const fd = openSync(full, 'r');
        try {
          const buf = Buffer.alloc(Math.min(SNIFF_BYTES, Math.max(bytes, 1)));
          const read = readSync(fd, buf, 0, buf.length, 0);
          head = buf.subarray(0, read);
        } finally {
          closeSync(fd);
        }
      } catch {
        continue; // unlesbar → kein Befund erfinden
      }

      checked++;
      const actual = sniffImageFormat(head);
      if (actual !== expected) {
        issues.push({ file: relative(root, full), ext, expected, actual, bytes });
      }
    }
  }

  return { issues, checked };
}

export default function aiDiscovery<T extends AiDiscoverySiteData>(
  options: AiDiscoveryOptions<T>,
): AstroIntegration {
  // Der Motion-Consent-Guard braucht beides: das gebaute dist/ (was kommt beim
  // Besucher an?) und den Kunden-Quelltext (was wurde angefordert?). `srcDir`
  // gibt es nur im config-Hook, geprüft wird erst nach dem Build.
  let customerSrcDir: string | null = null;
  let customerPublicDir: string | null = null;

  return {
    name: '@cw/core/integrations/ai-discovery',
    hooks: {
      // Domain-Guard: fängt den Fall, dass astro.config `site` und
      // site-data `url` auf verschiedene Domains zeigen. Genau dieser Drift
      // (config.site = echte Domain, site-data.url = Tippfehler-Domain) führt
      // dazu, dass canonical/Schema/Sitemap UND die hier generierte llms.txt
      // auf eine falsche/tote Domain verweisen — ein stiller SEO-Killer.
      'astro:config:done': async ({ config, logger }) => {
        try {
          customerSrcDir = fileURLToPath(config.srcDir);
        } catch {
          customerSrcDir = null; // Motion-Guard meldet das dann als ungeprüft
        }
        try {
          customerPublicDir = fileURLToPath(config.publicDir);
        } catch {
          customerPublicDir = null; // llms.txt-Guard benennt die Ursache dann unspezifisch
        }

        let data: T;
        try {
          data = await options.siteData();
        } catch {
          return; // siteData nicht ladbar → andere Hooks/Checks melden das
        }

        const siteDataHost = normHost(data.url);
        const configHost = normHost(config.site);

        if (!configHost) {
          logger.warn(
            `astro.config \`site\` ist nicht gesetzt — canonical/Sitemap fehlen die Basis-URL. ` +
            `Setze \`site: '${data.url}'\` im astro.config.`,
          );
        } else if (siteDataHost && configHost !== siteDataHost) {
          const msg =
            `Domain-Mismatch: astro.config site=${config.site} ≠ site-data url=${data.url}. ` +
            `Eine davon ist falsch — canonical, Schema, Sitemap und llms.txt würden auf ` +
            `unterschiedliche Domains zeigen. Bitte beide auf die echte Deploy-Domain angleichen.`;
          if (options.strictDomain) {
            throw new Error(`[ai-discovery] ${msg}`);
          }
          logger.warn(msg);
        }

        // Ground-Truth gegen Vercel: nur bei Production-Build UND wenn die
        // Production-Domain eine echte Custom-Domain ist (keine *.vercel.app),
        // sonst false-positives.
        const prodUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL;
        if (
          process.env.VERCEL === '1' &&
          process.env.VERCEL_ENV === 'production' &&
          prodUrl &&
          !prodUrl.endsWith('.vercel.app')
        ) {
          const prodHost = normHost(`https://${prodUrl}`);
          if (siteDataHost && prodHost && siteDataHost !== prodHost) {
            logger.warn(
              `site-data url=${data.url} ≠ Vercel-Production-Domain=${prodUrl}. ` +
              `Die canonical-Domain weicht von der tatsächlich deployten Domain ab.`,
            );
          }
        }

        // -------------------------------------------------------------------
        // Brand-Name-Literal-Guard: Prosa-Felder in siteData
        // -------------------------------------------------------------------
        // Auslöser: customer-mika-elektrotechnik hatte ~30 Literal-Duplikate
        // in 13 Dateien. Triviale Umbenennung wurde zur teuren Multi-File-Aktion.
        // Cluster-Risiko: potenziell alle 11 Customer-Sites betroffen (Issue #316).
        //
        // Konvention: siteData.name ist SSOT für den Markennamen. Alle anderen
        // Felder (description, tagline, FAQs, Leistungen) müssen generisch
        // formuliert sein — kein Literal-Duplikat des Markennamens.
        const brandIssuesSiteData = [
          ...lintBrandNameInSiteData(data, data.name),
          // Der seo-Block wird im Quelltext geprüft, nicht am Wert — Begründung an
          // lintBrandNameInSeoSource. Ohne srcDir (config.srcDir nicht auflösbar) entfällt
          // der Check still; das meldet der Motion-Guard bereits als ungeprüft.
          ...(customerSrcDir
            ? [
                ...lintBrandNameInSeoSource(join(customerSrcDir, 'data', 'site-data.ts'), data.name),
                // FAQs ebenfalls am Quelltext — Begründung an lintBrandNameInFaqSource.
                ...lintBrandNameInFaqSource(join(customerSrcDir, 'data', 'site-data.ts'), data.name),
              ]
            : []),
        ];
        if (brandIssuesSiteData.length > 0) {
          // Getrennt zählen: ein redundantes titleTemplate ist kein Literal-Duplikat,
          // und die beiden Befunde haben entgegengesetzte Fix-Richtungen (streichen
          // vs. interpolieren). Eine Sammelzahl würde beides verwischen.
          const literals = brandIssuesSiteData.filter((i) => i.type !== 'redundant_title_template');
          const literalCount = literals.reduce((s, i) => s + i.count, 0);
          const proseFields = literals.filter((i) => i.type === 'prose_literal').length;
          const seoFields = literals.filter((i) => i.type === 'seo_literal').length;
          const redundant = brandIssuesSiteData.length - literals.length;

          const parts: string[] = [];
          if (proseFields > 0) parts.push(`${proseFields} Prosa-Feld(ern)`);
          if (seoFields > 0) parts.push(`${seoFields} seo-Meta-Feld(ern)`);
          logger.warn(
            (literalCount > 0
              ? `Brand-Name-Linter: "${data.name}" kommt ${literalCount}× als Literal in ${parts.join(' + ')} vor. `
              : `Brand-Name-Linter: `) +
            (redundant > 0 ? `${redundant}× redundantes titleTemplate. ` : '') +
            `Convention: nur siteData.name, generische Formulierung in Prosa, Interpolation in seo. ` +
            `Siehe docs/brand-name-convention.md`,
          );
          for (const issue of brandIssuesSiteData) {
            const n = issue.type === 'redundant_title_template' ? 'redundant' : `${issue.count}×`;
            logger.warn(`  [brand-name] ${issue.location}: ${n} — ${issue.detail.split('.')[0]}.`);
          }
          if (options.strictBrandName) {
            throw new Error(
              `[ai-discovery] strictBrandName=true: Build abgebrochen wegen ${brandIssuesSiteData.length} Brand-Name-Befund(en) in siteData.`,
            );
          }
        } else {
          logger.info(`Brand-Name-Linter (siteData): ✓ Keine Literal-Duplikate in Prosa- und seo-Feldern.`);
        }

        // -------------------------------------------------------------------
        // Impressum-Rechtsform-Guard: Firma/Rechtsform + Registereintrag (§5 DDG)
        // -------------------------------------------------------------------
        // Auslöser: customer-gottl-richter-gomeier (eGbR) — owner war eine
        // Privatperson, die Firma stand nur im (damals nie gerenderten) company-Feld
        // → das Impressum nannte keine Firma/Rechtsform. Dieser Guard fängt den Fall
        // clusterweit, bevor ein unvollständiges Firmen-Impressum live geht.
        const impressumIssues = lintImpressumLegalForm(data.legal);
        if (impressumIssues.length > 0) {
          logger.warn(
            `Impressum-Linter: ${impressumIssues.length} §5-DDG-Lücke(n) in den Rechtsform-Angaben.`,
          );
          for (const issue of impressumIssues) {
            logger.warn(`  [impressum] ${issue.field}: ${issue.detail}`);
          }
          if (options.strictImpressum) {
            throw new Error(
              `[ai-discovery] strictImpressum=true: Build abgebrochen wegen ${impressumIssues.length} Impressum-Rechtsform-Lücke(n).`,
            );
          }
        } else {
          logger.info(`Impressum-Linter: ✓ Rechtsform-Angaben vollständig.`);
        }

        // -------------------------------------------------------------------
        // Asset-Format-Guard: lügt die Endung über den Inhalt?
        // -------------------------------------------------------------------
        // Begründung an lintSourceAssetFormat. Hier im config-Hook, weil nur er die
        // Quellverzeichnisse kennt — und weil dist/ die Frage nicht beantworten kann:
        // die Bild-Pipeline bügelt eine falsch benannte Quelle glatt, der Befund
        // verschwindet still (blitzsicht-ops#651).
        if (options.checkAssetFormat !== false) {
          const publicDir = (() => {
            try {
              return fileURLToPath(config.publicDir);
            } catch {
              return null;
            }
          })();
          const assetDirs = [
            publicDir,
            customerSrcDir ? join(customerSrcDir, 'assets') : null,
          ].filter((d): d is string => Boolean(d) && existsSync(d as string));

          if (assetDirs.length === 0) {
            // Dritter Zustand. Kein ✓ — „nicht geprüft" ist nicht „sauber".
            logger.warn(
              `Asset-Format: NICHT GEPRÜFT — weder publicDir noch src/assets auflösbar. ` +
                `Das ist kein grünes Ergebnis.`,
            );
          } else {
            const { issues: assetIssues, checked } = lintSourceAssetFormat(assetDirs);
            if (assetIssues.length > 0) {
              logger.warn(
                `Asset-Format: ${assetIssues.length} Datei(en) von ${checked}, deren Endung ` +
                  `nicht zum Inhalt passt. Die Datei ist falsch benannt oder der Download ist fehlgeschlagen:`,
              );
              for (const i of assetIssues) {
                logger.warn(
                  `  [asset-format] ${i.file}: ${describeFormat(i.actual)} statt ` +
                    `${i.expected.toUpperCase()} (${(i.bytes / 1024).toFixed(0)} KB)`,
                );
              }
              if (options.strictAssetFormat !== false) {
                throw new Error(
                  `[ai-discovery] strictAssetFormat=true: Build abgebrochen wegen ${assetIssues.length} ` +
                    `Quell-Asset(s) mit falscher Endung. Datei korrekt konvertieren oder umbenennen — ` +
                    `nicht die Endung raten. Opt-out: strictAssetFormat:false.`,
                );
              }
            } else if (checked === 0) {
              // Verzeichnisse da, aber keine einzige Bilddatei gelesen. Kein ✓ — sonst
              // meldete eine leere Menge dasselbe wie eine geprüfte (Gegenbeweis-Pflicht).
              logger.warn(
                `Asset-Format: NICHT GEPRÜFT — keine Bilddatei in ${assetDirs.length} ` +
                  `Quellverzeichnis(sen) gefunden. Das ist kein grünes Ergebnis.`,
              );
            } else {
              logger.info(`Asset-Format: ✓ ${checked} Quell-Assets, Endung passt zum Inhalt.`);
            }
          }
        }

        // -------------------------------------------------------------------
        // Render-Entropy-Guard: würfelt der Build das HTML?
        // -------------------------------------------------------------------
        // Begründung an lintRenderEntropy. Hier im config-Hook, weil die Frage an
        // der Quelle beantwortet wird: in dist/ sieht man nur, DASS eine ID komisch
        // aussieht — nicht, wer sie erzeugt. Ein einzelner Build kann den Fehler
        // ohnehin nicht sehen, dafür braucht es zwei (blitzsicht-ops#650).
        if (options.checkRenderEntropy !== false) {
          if (!customerSrcDir) {
            // Dritter Zustand. Kein ✓ — „nicht geprüft" ist nicht „sauber".
            logger.warn(
              `Render-Entropy: NICHT GEPRÜFT — srcDir nicht auflösbar. ` +
                `Das ist kein grünes Ergebnis.`,
            );
          } else {
            const { issues: entropyIssues, checked } = lintRenderEntropy([customerSrcDir]);
            if (entropyIssues.length > 0) {
              logger.warn(
                `Render-Entropy: ${entropyIssues.length} Zufallsaufruf(e) im Build-Pfad von ` +
                  `${checked} .astro-Datei(en). Das HTML ändert sich damit bei jedem Build:`,
              );
              for (const i of entropyIssues.slice(0, 20)) {
                logger.warn(`  [render-entropy] ${i.file}:${i.line} ${i.pattern} — ${i.snippet}`);
              }
              if (entropyIssues.length > 20) {
                logger.warn(`  … und ${entropyIssues.length - 20} weitere.`);
              }
              if (options.strictRenderEntropy !== false) {
                throw new Error(
                  `[ai-discovery] strictRenderEntropy=true: Build abgebrochen wegen ` +
                    `${entropyIssues.length} Zufallsaufruf(en) im Build-Pfad. Ein Wert, der pro ` +
                    `Build neu gewürfelt wird, entwertet den Cache jeder betroffenen Seite und ` +
                    `macht den Byte-Vergleich zweier Builds unbrauchbar. Braucht das Element ` +
                    `wirklich eine ID, oder findet das Script es über ein data-Attribut? ` +
                    `Opt-out: strictRenderEntropy:false.`,
                );
              }
            } else if (checked === 0) {
              // Verzeichnis da, aber keine einzige .astro gelesen. Kein ✓ — sonst
              // meldete eine leere Menge dasselbe wie eine geprüfte.
              logger.warn(
                `Render-Entropy: NICHT GEPRÜFT — keine .astro-Datei unter srcDir gefunden. ` +
                  `Das ist kein grünes Ergebnis.`,
              );
            } else {
              logger.info(`Render-Entropy: ✓ ${checked} .astro-Quellen, kein Zufall im Build-Pfad.`);
            }
          }
        }

        // -------------------------------------------------------------------
        // Schema-Consistency-Guard: site-data-Shape-Drift sichtbar machen
        // -------------------------------------------------------------------
        // Divergente Shapes (images.hero-String, services[], hero.imageAlt ohne
        // image) ließen die Bild-Pipeline still WENIGER tun. Die Pipeline toleriert
        // sie jetzt — dieser Guard loggt sie, damit die Fleet konvergiert. Nur
        // warn-Severity bricht bei strict; reine SEO-Hinweise (region/knowsAbout) nie —
        // und seit v0.114.0 melden sie sich auch als `info`, nicht als `[WARN]`.
        // Begründung an `planShapeReport`.
        const shape = planShapeReport(
          lintSiteDataShape(data),
          options.strictSiteDataShape !== false,
        );
        logger[shape.level](shape.header);
        for (const line of shape.lines) logger[shape.level](line);
        if (shape.throws) throw new Error(shape.throwMessage);
      },

      'astro:build:done': async ({ dir, logger }) => {
        logger.info('Generating llms.txt and llms-full.txt …');

        const data = await options.siteData();

        const services = options.services
          ? options.services(data)
          : data.leistungen;

        const faqs = options.faqs
          ? options.faqs(data)
          : data.faqs;

        const outDir = fileURLToPath(dir);
        mkdirSync(outDir, { recursive: true });

        // Real gebaute Seiten einmal scannen — Quelle für llms.txt "Wichtige
        // Seiten" UND den Schema-Linter weiter unten.
        const distDir = outDir.replace(/\/$/, '');
        const htmlFiles = walkHtml(distDir);
        const importantPages = resolveImportantPages(
          htmlFiles,
          distDir,
          data.url,
          options.importantPageDepth ?? 1,
        );

        // Alles, was vor diesem Hook ein llms.txt nach dist/ legt, ist wirkungslos —
        // die Zeile darunter überschreibt es. Das ist entweder toter Ballast oder,
        // schlimmer, es wird per postbuild-cp wieder darübergelegt und friert
        // Markenname und Beschreibung auf einem Stand ein, den niemand mehr pflegt
        // (blitzsicht-ops#648: mika + zink). Warnung statt Abbruch: unsauber, kein Defekt.
        //
        // 🔴 Die URSACHE muss benannt werden, nicht geraten. Der Check sieht nur
        // dist/llms.txt und kann daraus nicht ableiten, woher die Datei stammt:
        // eine statische public/llms.txt und eine Astro-Route src/pages/llms.txt.ts
        // erzeugen dasselbe Artefakt, brauchen aber gegensätzliche Handgriffe.
        // Bis v0.111.1 nannte die Meldung immer public/llms.txt — bei
        // schiller-gartenbau (Route, keine Datei) schickte sie damit auf die Suche
        // nach einer Datei, die es nicht gibt. Gemessen 12.08.2026 über die Flotte:
        // braustall hat die Datei, schiller die Route, sonst niemand.
        if (existsSync(join(distDir, 'llms.txt'))) {
          const staticFile = customerPublicDir ? join(customerPublicDir, 'llms.txt') : null;
          const routeFile = customerSrcDir
            ? ['llms.txt.ts', 'llms.txt.js', 'llms.txt.mjs']
                .map((f) => join(customerSrcDir!, 'pages', f))
                .find((f) => existsSync(f))
            : undefined;

          let ursache: string;
          if (staticFile && existsSync(staticFile)) {
            ursache = 'public/llms.txt gefunden — die Datei gehört gelöscht, Inhalte nach siteData.';
          } else if (routeFile) {
            ursache =
              `${relative(distDir, routeFile).replace(/^(\.\.\/)+/, '')} erzeugt llms.txt — ` +
              'die Route ist seit der ai-discovery-Integration überflüssig und gehört gelöscht.';
          } else {
            ursache =
              'dist/llms.txt lag schon vor diesem Hook vor — Quelle unklar, im Repo nach ' +
              'public/llms.txt oder einer llms.txt-Route suchen.';
          }
          logger.warn(
            `${ursache} Die Datei wird von der generierten überschrieben und kann nichts ` +
              'bewirken. Liegt sie per postbuild-cp NACH diesem Hook wieder in dist/, driftet ' +
              'die ausgelieferte Fassung dauerhaft von siteData weg (blitzsicht-ops#648).',
          );
        }

        const llmsTxt = generateLlmsTxt(data, services, importantPages);
        writeFileSync(join(outDir, 'llms.txt'), llmsTxt, 'utf-8');
        logger.info(`  → ${join(outDir, 'llms.txt')}`);

        // htmlFiles ist oben bereits gescannt (llms.txt + Schema-Linter) und wird
        // hier ein drittes Mal genutzt — kein zusätzlicher Durchlauf über dist/.
        const collectedPages = collectPageTexts(
          htmlFiles,
          distDir,
          data.url,
          options.llmsFullMaxBytes ?? 524288,
        );
        if (collectedPages.dropped.length > 0) {
          logger.warn(
            `llms-full.txt: Byte-Budget erschöpft — ${collectedPages.dropped.length} Seite(n) ` +
              `nicht im Volltext enthalten: ${collectedPages.dropped.join(', ')}. ` +
              'Budget über llmsFullMaxBytes anheben oder die Auslassung bewusst hinnehmen.',
          );
        }

        const llmsFullTxt = generateLlmsFullTxt(data, services, faqs, collectedPages);
        writeFileSync(join(outDir, 'llms-full.txt'), llmsFullTxt, 'utf-8');
        logger.info(
          `  → ${join(outDir, 'llms-full.txt')} (${collectedPages.pages.length} Seiten im Volltext)`,
        );

        // -------------------------------------------------------------------
        // Schema-Linter: doppelte JSON-LD @id pro Page erkennen
        // -------------------------------------------------------------------
        // Hintergrund: cw-core SchemaOrg.astro emittiert ein Organization-Schema
        // mit @id="${url}/#organization". Customer-Pages emittieren manchmal
        // parallele Schema-Blöcke (Article isPartOf:Organization, eigene
        // BranchesSchema-Komponenten, Inline-JSON-LD) — bei gleicher @id meldet
        // Google Rich Results doppelte Entität → Rich Results werden unterdrückt.
        //
        // Cluster-Scan 2026-05-30: 2/9 Live-Sites (blitzsicht, baeckereizink)
        // hatten 2× #organization. Linter fängt das beim Build.
        // distDir + htmlFiles bereits oben gescannt (für llms.txt wiederverwendet).
        const allIssues: SchemaIssue[] = [];
        for (const file of htmlFiles) {
          allIssues.push(...lintPageSchema(file, distDir));
        }

        const dupCount = allIssues.filter((i) => i.type === 'duplicate_id').length;
        const otherCount = allIssues.length - dupCount;

        if (allIssues.length === 0) {
          logger.info(`Schema-Linter: ✓ ${htmlFiles.length} Pages clean.`);
        } else {
          logger.warn(
            `Schema-Linter: ${dupCount}× doppelte @id, ${otherCount}× sonstige Issues über ${htmlFiles.length} Pages:`,
          );
          for (const issue of allIssues.slice(0, 20)) {
            logger.warn(`  ${issue.page} [${issue.type}] ${issue.detail}`);
          }
          if (allIssues.length > 20) {
            logger.warn(`  … und ${allIssues.length - 20} weitere.`);
          }
          if (options.strictSchema) {
            throw new Error(
              `[ai-discovery] strictSchema=true: Build abgebrochen wegen ${allIssues.length} Schema-Issues.`,
            );
          }
        }

        // -------------------------------------------------------------------
        // Meta-Length-Linter: Title + Description Längen
        // -------------------------------------------------------------------
        // Hintergrund: Google truncated SERP-Title bei ~580px (≈ 50-60 Zeichen)
        // und SERP-Description bei ~160 Zeichen. Längere Werte verlieren das
        // Suffix in der Anzeige — CTR-Verlust ohne sichtbares Symptom im Code.
        // Cluster-Audit blitzsicht 2026-05-30: 13/42 Titles > 60, 12/42 Desc > 160.
        const maxTitle = options.maxTitleLength ?? 60;
        const maxDesc = options.maxDescriptionLength ?? 160;
        const metaIssues: MetaIssue[] = [];
        for (const file of htmlFiles) {
          metaIssues.push(...lintPageMeta(file, distDir, maxTitle, maxDesc));
        }

        if (metaIssues.length === 0) {
          logger.info(`Meta-Linter: ✓ ${htmlFiles.length} Pages Title/Description in Length-Limit.`);
        } else {
          const titleLong = metaIssues.filter((i) => i.type === 'title_too_long').length;
          const titleMiss = metaIssues.filter((i) => i.type === 'title_missing').length;
          const descLong = metaIssues.filter((i) => i.type === 'description_too_long').length;
          const descMiss = metaIssues.filter((i) => i.type === 'description_missing').length;
          logger.warn(
            `Meta-Linter: ${titleLong}× Title > ${maxTitle}, ${descLong}× Description > ${maxDesc}, ` +
              `${titleMiss}× Title fehlt, ${descMiss}× Description fehlt:`,
          );
          for (const issue of metaIssues.slice(0, 30)) {
            logger.warn(`  ${issue.page} [${issue.type}] ${issue.detail}`);
          }
          if (metaIssues.length > 30) {
            logger.warn(`  … und ${metaIssues.length - 30} weitere.`);
          }
          if (options.strictMeta) {
            throw new Error(
              `[ai-discovery] strictMeta=true: Build abgebrochen wegen ${metaIssues.length} Meta-Length-Issues.`,
            );
          }
        }

        // -------------------------------------------------------------------
        // Alt-Text-Guard: <img> ohne (verwertbaren) Alt-Text
        // -------------------------------------------------------------------
        // Alt-Text ist eines der stärksten Bild-Ranking- + A11y-Signale (Mueller:
        // "alt + surrounding text = really strong signals"). Der Hero-Fallback
        // konnte still auf alt="" kippen (LCP-Bild). Soft-warn (opt-in strict).
        const altIssues: AltIssue[] = [];
        for (const file of htmlFiles) {
          altIssues.push(...lintPageImgAlt(file, distDir));
        }
        if (altIssues.length === 0) {
          logger.info(`Alt-Text-Guard: ✓ ${htmlFiles.length} Pages — alle <img> mit Alt-Text.`);
        } else {
          const miss = altIssues.filter((i) => i.type === 'alt_missing').length;
          const empty = altIssues.filter((i) => i.type === 'alt_empty').length;
          logger.warn(
            `Alt-Text-Guard: ${miss}× <img> ohne alt, ${empty}× leeres alt="" ohne Deko-Marker:`,
          );
          for (const issue of altIssues.slice(0, 20)) {
            logger.warn(`  ${issue.page} [${issue.type}] ${issue.detail}`);
          }
          if (altIssues.length > 20) {
            logger.warn(`  … und ${altIssues.length - 20} weitere.`);
          }
          if (options.strictAltText !== false) {
            throw new Error(
              `[ai-discovery] strictAltText=true: Build abgebrochen wegen ${altIssues.length} Alt-Text-Issues. ` +
                `Dekorative <img> mit aria-hidden="true"/role="presentation" markieren, sonst Alt-Text ergänzen. Opt-out: strictAltText:false.`,
            );
          }
        }

        // -------------------------------------------------------------------
        // Alt-Qualität-Guard: nicht-leere, aber generische/schwache Alts
        // -------------------------------------------------------------------
        // Ergänzt den Existenz-Guard (oben) um QUALITÄT: Alt === Firmenname/
        // Leistungstitel, „Bild:"-Platzhalter, Dateiname-als-Alt, <5 Zeichen +
        // Cross-Page-Duplikate. PERMANENT soft-warn — Qualität ist fuzzy, ein
        // False-Positive darf keinen Deploy brechen (opt-in strict: strictAltQuality:true).
        // Divergente Kunden haben teils `services[].label` statt `leistungen[].title` —
        // defensiv über unknown lesen (nicht im kanonischen Typ), damit beide erfasst sind.
        const extraServices = (data as unknown as {
          services?: ReadonlyArray<{ label?: string; title?: string }>;
        }).services;
        const genericTerms = [
          data.name,
          ...(Array.isArray(data.leistungen) ? data.leistungen.map((l) => l?.title) : []),
          ...(Array.isArray(extraServices) ? extraServices.map((s) => s?.label ?? s?.title) : []),
          ...(Array.isArray(data.seo?.areaServed) ? data.seo!.areaServed : []),
        ].filter((t): t is string => typeof t === 'string' && t.trim() !== '');
        const qualityIssues: AltQualityIssue[] = [];
        for (const file of htmlFiles) {
          qualityIssues.push(...lintPageImgAltQuality(file, distDir, genericTerms));
        }
        if (qualityIssues.length === 0) {
          logger.info(`Alt-Qualität-Guard: ✓ ${htmlFiles.length} Pages — keine generischen Alts.`);
        } else {
          logger.warn(`Alt-Qualität-Guard: ${qualityIssues.length} generische/schwache Alts (soft-warn):`);
          for (const issue of qualityIssues.slice(0, 20)) {
            logger.warn(`  ${issue.page} [${issue.type}] ${issue.detail}`);
          }
          if (qualityIssues.length > 20) {
            logger.warn(`  … und ${qualityIssues.length - 20} weitere.`);
          }
          if (options.strictAltQuality === true) {
            throw new Error(
              `[ai-discovery] strictAltQuality=true: Build abgebrochen wegen ${qualityIssues.length} Alt-Qualität-Issues.`,
            );
          }
        }

        // -------------------------------------------------------------------
        // Tabellen per Tastatur erreichbar machen
        // -------------------------------------------------------------------
        // tokens-base.css macht Tabellen zu ihrem eigenen Scroll-Container —
        // sonst schneiden sie auf schmalen Viewports ihre rechten Spalten ab.
        // Ein scrollbarer Bereich ohne Tastaturzugang ist aber selbst ein
        // WCAG-Verstoss (axe: scrollable-region-focusable). Gemessen an sieben
        // Seiten von blitzsicht.com bei 390 px: vorher 2 Verstoesse, mit der
        // CSS-Regel allein 13, mit diesem tabindex 0. Siehe table-focusable.js.
        if (options.makeTablesFocusable !== false) {
          let ergaenztGesamt = 0;
          let seitenMitTabelle = 0;
          for (const file of htmlFiles) {
            let html: string;
            try {
              html = readFileSync(file, 'utf-8');
            } catch {
              continue;
            }
            // Erst der Wrapper, dann die Tabelle: eine Tabelle in einem
            // .tabelle-scroll-Wrapper bleibt display:table und ist selbst gar
            // nicht scrollbar — dort gehört der Fokus an den Wrapper.
            const wrapper = ergaenzeWrapperTabindex(html);
            const tabellen = ergaenzeTabellenTabindex(wrapper.html);
            const ergaenzt = wrapper.ergaenzt + tabellen.ergaenzt;
            if (ergaenzt === 0) continue;
            writeFileSync(file, tabellen.html, 'utf-8');
            ergaenztGesamt += ergaenzt;
            seitenMitTabelle++;
          }
          if (ergaenztGesamt > 0) {
            logger.info(
              `Tabellen-Fokus: ${ergaenztGesamt} Scroll-Bereich(e) auf ${seitenMitTabelle} Seite(n) per Tastatur erreichbar gemacht.`,
            );
          }
        }

        // -------------------------------------------------------------------
        // Kontrast der Schrift auf dem Akzent-Knopf
        // -------------------------------------------------------------------
        // .btn-accent faellt ohne --color-accent-btn-text auf weisse Schrift
        // zurueck. Bei hellen Markenfarben ist das unlesbar: am 28.08.2026 fiel
        // der Haupt-CTA bei vier von zwoelf Live-Kunden durch, soleno mit
        // 1,65:1. Der Kern kann die Farbe nicht waehlen — welche Schrift auf
        // eine Marke passt, entscheidet der Kunde. Er kann sich aber weigern,
        // einen unlesbaren Knopf auszuliefern. Siehe button-contrast-check.js.
        if (options.checkButtonContrast !== false) {
          const cssDateien: string[] = [];
          const suche = (dir: string) => {
            let eintraege;
            try {
              eintraege = readdirSync(dir, { withFileTypes: true });
            } catch {
              return;
            }
            for (const e of eintraege) {
              const voll = `${dir}/${e.name}`;
              if (e.isDirectory() && e.name !== 'node_modules') suche(voll);
              else if (e.name.endsWith('.css')) cssDateien.push(voll);
            }
          };
          suche('src/styles');

          // Drei Zustaende, nicht zwei. Bis v0.143.0 lief hier alles, was kein
          // Befund war, in EINE info-Zeile: "✓ … (oder ist nicht berechenbar)".
          // Weil build-warnings.mjs nur WARN/ERROR zaehlt, buchte der
          // Flotten-Scan "geprueft und bestanden", wo "konnte nicht pruefen"
          // stand. Vier Wege fuehrten dorthin: keine CSS gefunden, CSS
          // unlesbar, --color-accent nicht rechenbar, Schriftfarbe nicht
          // rechenbar. gympanzen lag am 30.08.2026 in genau dieser Luecke.
          const btnIssues: ButtonIssue[] = [];
          const nichtRechenbar: string[] = [];
          let gerechnet = 0;
          let unlesbar = 0;
          for (const datei of cssDateien) {
            let ergebnis;
            try {
              ergebnis = pruefeButtonKontrast(readFileSync(datei, 'utf-8'));
            } catch {
              unlesbar++;
              continue;
            }
            if (ergebnis.status === 'nicht-rechenbar') {
              if (ergebnis.grund) nichtRechenbar.push(`${datei}: ${ergebnis.grund}`);
            } else {
              gerechnet++;
              btnIssues.push(...ergebnis.issues);
            }
          }

          if (btnIssues.length > 0) {
            for (const issue of btnIssues) logger.warn(`Knopf-Kontrast: ${issue.detail}`);
            if (options.strictButtonContrast !== false) {
              throw new Error(
                `[ai-discovery] strictButtonContrast=true: Build abgebrochen — Schrift auf .btn-accent erreicht nur ${btnIssues[0].ratio}:1.`,
              );
            }
          } else if (gerechnet > 0) {
            // Zaehlwert statt blossem Haeckchen: "✓" ohne Grundgesamtheit ist
            // ein Haeckchen ueber ungeprueftem Gebiet.
            logger.info(
              `Knopf-Kontrast: ✓ Schrift auf .btn-accent erfüllt AA (${gerechnet} CSS-Datei(en) gerechnet).`,
            );
          } else {
            // Nichts gerechnet. Ob das ein Problem ist, entscheidet das
            // AUSGELIEFERTE Markup — nicht die Konfiguration: ein Kunde mit
            // eigener Palette, der .btn-accent gar nicht nutzt, darf hier
            // keinen Fehlalarm bekommen (gympanzen importiert von cw-core nur
            // utils/bildherkunft und rendert die Klasse nirgends).
            let genutzt = false;
            for (const datei of htmlFiles) {
              try {
                if (readFileSync(datei, 'utf-8').includes('btn-accent')) {
                  genutzt = true;
                  break;
                }
              } catch {
                /* eine unlesbare HTML-Datei aendert das Urteil nicht */
              }
            }
            if (genutzt) {
              logger.warn(
                'Knopf-Kontrast: NICHT GEPRÜFT — .btn-accent steht im ausgelieferten HTML, aber ' +
                  `der Kontrast war aus keiner CSS-Datei rechenbar. ${
                    nichtRechenbar.length > 0
                      ? nichtRechenbar.join(' · ')
                      : `keine CSS-Datei unter src/styles gefunden${unlesbar > 0 ? `, ${unlesbar} unlesbar` : ''}`
                  }. Solange das so bleibt, sagt der grüne Build über diesen Knopf nichts aus.`,
              );
            } else {
              logger.info(
                'Knopf-Kontrast: übersprungen — .btn-accent kommt im ausgelieferten HTML nicht vor.',
              );
            }
          }
        }

        // -------------------------------------------------------------------
        // Anker-Integrität: kaputte Links im ausgelieferten HTML
        // -------------------------------------------------------------------
        // Auf blitzsicht.com/agb/sla stand der Schluss-Absatz der Seite INNERHALB
        // eines Telefon-Links, dazu zwei leere Anker — im Quelltext war nichts
        // davon zu sehen. Ursache: steht ein <a> als letzter Knoten der letzten
        // Tabellenzelle, macht der Compiler ihn nach </table> wieder auf.
        // Gefunden hat es axe (link-name), nicht der Blick in die Datei. Ein
        // Guard am ausgelieferten HTML meldet es beim naechsten Mal sofort.
        if (options.checkAnchorIntegrity !== false) {
          const seiten = htmlFiles.map((file) => {
            const pfad = file.slice(distDir.length).replace(/\/index\.html$/, '/');
            let html = '';
            try {
              html = readFileSync(file, 'utf-8');
            } catch {
              /* unlesbare Datei: andere Guards melden das laut genug */
            }
            return { page: pfad.startsWith('/') ? pfad : `/${pfad}`, html };
          });
          const anchorIssues: AnchorIssue[] = checkAnchorIntegrity(seiten);
          if (anchorIssues.length === 0) {
            logger.info(`Anker-Guard: ✓ ${htmlFiles.length} Pages — keine kaputten Links.`);
          } else {
            logger.warn(`Anker-Guard: ${anchorIssues.length} Befund(e):`);
            for (const issue of anchorIssues.slice(0, 20)) {
              logger.warn(`  ${issue.page} [${issue.type}] ${issue.detail}`);
            }
            if (anchorIssues.length > 20) {
              logger.warn(`  … und ${anchorIssues.length - 20} weitere.`);
            }
            if (options.strictAnchorIntegrity !== false) {
              throw new Error(
                `[ai-discovery] strictAnchorIntegrity=true: Build abgebrochen wegen ${anchorIssues.length} kaputten Link(s).`,
              );
            }
          }
        }

        // -------------------------------------------------------------------
        // KI-Kennzeichnung: pflichtiges Bild ausgeliefert, Label nicht
        // -------------------------------------------------------------------
        // donau-profi lieferte sechs als deepfake:'ja' deklarierte Stadtbilder ohne
        // jedes Label aus, soleno 50 weitere auf einer zweiten Vorlage. Beides fiel
        // erst durch eine Handmessung auf, weil „Repo importiert AiLabel" als Nachweis
        // galt — die Pflicht gilt aber je Fundstelle. Gemessen wird am AUSGELIEFERTEN
        // HTML, weil nur dort steht, was der Betrachter sieht.
        if (options.checkAiLabel !== false && Array.isArray(data?.bildHerkunft)) {
          const seiten = htmlFiles.map((file) => {
            const pfad = file.slice(distDir.length).replace(/\/index\.html$/, '/');
            let html = '';
            try {
              html = readFileSync(file, 'utf-8');
            } catch {
              /* unlesbare Datei: andere Guards melden das laut genug */
            }
            return { seite: pfad.startsWith('/') ? pfad : `/${pfad}`, html };
          });
          const eigenerHost = (() => {
            try {
              return new URL(String(data?.url ?? '')).host;
            } catch {
              return undefined;
            }
          })();
          const fehlende: AiLabelFundstelle[] = checkAiLabels(
            seiten,
            data.bildHerkunft as Parameters<typeof checkAiLabels>[1],
            { eigenerHost },
          );
          if (fehlende.length === 0) {
            // Die Zahl der geprüften pflichtigen Fundstellen gehört in die Zeile: „keine
            // Lücke" bei null gefundenen Fundstellen ist kein Ergebnis, sondern ein
            // stummer Check. Wer die Vorbedingung nicht sieht, kann grün nicht deuten.
            const pflichtige = seiten.reduce(
              (n, x) => n + pruefeSeiteAufKennzeichnung(x.html, data.bildHerkunft as never, { eigenerHost }).pflichtig.length,
              0,
            );
            logger.info(
              `KI-Kennzeichnung: ✓ ${htmlFiles.length} Pages, ${pflichtige} kennzeichnungspflichtige Fundstelle(n) — alle mit Label.`,
            );
          } else {
            // Meldelevel hängt am Schalter, und zwar aus einem gemessenen Grund: der
            // strict-warnings-Gate des Release-Trains zählt JEDE `[WARN]`-Zeile mit
            // `@cw/core`-Label als Befund (`build-warnings.mjs`, LINE_RE + GUARD_LABEL_PREFIX).
            // Wo der Abbruch bewusst ausgesetzt ist, wäre eine WARN-Zeile also eine
            // Dauerblockade für einen Zustand, den der Operator kennt und begründet hat —
            // genau daran hingen `allstargirls-regensburg` und `itk-regensburg` auf
            // v0.110.0 fest. Das `✓` ist dabei kein Schönreden: der Report zählt
            // Info-Zeilen mit `✓` als Beleg, dass der Guard überhaupt gelaufen ist, und
            // die Zahl der Fundstellen steht in derselben Zeile.
            const strikt = options.strictAiLabel !== false;
            const melde = strikt ? logger.warn.bind(logger) : logger.info.bind(logger);
            melde(
              strikt
                ? `KI-Kennzeichnung: ${fehlende.length} Fundstelle(n) ohne Label (Art. 50 Abs. 4 AI Act):`
                : `KI-Kennzeichnung: ✓ Guard gelaufen — ${fehlende.length} Fundstelle(n) ohne Label, ` +
                  `Abbruch per strictAiLabel:false ausgesetzt (Art. 50 Abs. 4 AI Act):`,
            );
            for (const f of fehlende.slice(0, 20)) {
              melde(`  ${f.seite} — ${f.bild}`);
            }
            if (fehlende.length > 20) {
              melde(`  … und ${fehlende.length - 20} weitere.`);
            }
            if (strikt) {
              throw new Error(
                `[ai-discovery] strictAiLabel=true: Build abgebrochen wegen ${fehlende.length} ungekennzeichneter ` +
                  `Fundstelle(n). Entweder <AiLabelAmBild ergebnis={resolveBildHerkunft(siteData, pfad)} /> an der ` +
                  `rendernden Stelle ergänzen, oder die Einordnung in src/data/bild-herkunft.ts korrigieren. ` +
                  `Opt-out mit Begründung: strictAiLabel:false.`,
              );
            }
          }
        }

        // -------------------------------------------------------------------
        // Tabellen-Scroll-Guard: Tabelle ausgeliefert, Scroll-Regel nicht
        // -------------------------------------------------------------------
        // Sieben Seiten auf blitzsicht.com sprengten am 27.08.2026 bei 360 px die
        // Seitenbreite, jedes Mal wegen einer <table>. Weil dort zugleich
        // html,body{overflow-x:hidden} steht, war die Tabelle nicht wegschiebbar,
        // sondern ABGESCHNITTEN — Spalten unerreichbar, monatelang unbemerkt.
        // Der Guard prüft am ausgelieferten HTML, ob der Schutz überhaupt
        // mitgeliefert wird; ob eine konkrete Tabelle passt, misst
        // mobile-audit.spec.ts in cw-visual-tests. Siehe table-scroll-check.js.
        if (options.checkTableScroll !== false) {
          const seiten = htmlFiles.map((file) => {
            const pfad = file.slice(distDir.length).replace(/\/index\.html$/, '/');
            let html = '';
            try {
              html = readFileSync(file, 'utf-8');
            } catch {
              /* unlesbare Datei: andere Guards melden das laut genug */
            }
            return { page: pfad.startsWith('/') ? pfad : `/${pfad}`, html };
          });
          const tableIssues: TableIssue[] = checkTableScroll(seiten);
          if (tableIssues.length === 0) {
            logger.info(
              `Tabellen-Scroll-Guard: ✓ ${htmlFiles.length} Pages — jede Tabelle hat eine Scroll-Regel.`,
            );
          } else {
            logger.warn(
              `Tabellen-Scroll-Guard: ${tableIssues.length} Seite(n) liefern eine Tabelle ohne Scroll-Regel aus:`,
            );
            for (const issue of tableIssues.slice(0, 20)) {
              logger.warn(`  ${issue.page} [${issue.type}] ${issue.detail}`);
            }
            if (tableIssues.length > 20) {
              logger.warn(`  … und ${tableIssues.length - 20} weitere.`);
            }
            if (options.strictTableScroll !== false) {
              throw new Error(
                `[ai-discovery] strictTableScroll=true: Build abgebrochen wegen ${tableIssues.length} Seite(n) mit ungeschützter Tabelle.`,
              );
            }
          }
        }

        // -------------------------------------------------------------------
        // Stray-Brace-Guard: Template-Klammern, die als Text in der Seite landen
        // -------------------------------------------------------------------
        // Der Astro-Compiler beendet einen Ausdruck zu früh, wenn ein Regex-Literal darin
        // Anführungszeichen in der Zeichenklasse trägt — die Klammer wird zu Text.
        // blitzsichts Brand-Guides rendered monatelang „Work Sans}", ohne dass etwas rot
        // wurde (blitzsicht-ops#652). Strict per Default: der Fehler ist kundensichtbar,
        // und eine Warnung im Log hat ihn nachweislich nicht verhindert.
        const braceIssues: StrayBraceIssue[] = [];
        for (const file of htmlFiles) {
          braceIssues.push(...lintPageStrayBraces(file, distDir));
        }
        if (braceIssues.length === 0) {
          logger.info(
            `Stray-Brace-Guard: ✓ ${htmlFiles.length} Pages — keine verirrten Template-Klammern.`,
          );
        } else {
          const pages = new Set(braceIssues.map((i) => i.page)).size;
          logger.warn(
            `Stray-Brace-Guard: ${braceIssues.length} verirrte Template-Klammer(n) auf ${pages} Seite(n):`,
          );
          for (const issue of braceIssues.slice(0, 20)) {
            logger.warn(`  ${issue.page} [${issue.type}] ${issue.detail}`);
          }
          if (braceIssues.length > 20) {
            logger.warn(`  … und ${braceIssues.length - 20} weitere.`);
          }
          if (options.strictStrayBraces !== false) {
            throw new Error(
              `[ai-discovery] strictStrayBraces=true: Build abgebrochen wegen ${braceIssues.length} verirrten ` +
                `Template-Klammer(n). Ursache ist fast immer ein Regex-Literal mit Anführungszeichen in der ` +
                `Zeichenklasse (/['"]/) in einem .astro-Template-Ausdruck — den Ausdruck ins Frontmatter ziehen. ` +
                `Opt-out: strictStrayBraces:false.`,
            );
          }
        }

        // -------------------------------------------------------------------
        // Brand-Name-Literal-Guard: Statische Assets (robots.txt)
        // -------------------------------------------------------------------
        // robots.txt braucht den Markennamen nie. Wenn er trotzdem drin ist,
        // wurde die Datei manuell angelegt statt generiert/bereinigt.
        const brandIssuesAssets = lintBrandNameInRobotsTxt(distDir, data.name);
        if (brandIssuesAssets.length > 0) {
          for (const issue of brandIssuesAssets) {
            logger.warn(`Brand-Name-Linter: ${issue.location}: ${issue.count}× Literal — ${issue.detail.split('.')[0]}.`);
          }
          if (options.strictBrandName) {
            const total = brandIssuesAssets.reduce((s, i) => s + i.count, 0);
            throw new Error(
              `[ai-discovery] strictBrandName=true: Build abgebrochen wegen ${total} Brand-Name-Literalen in statischen Assets.`,
            );
          }
        } else {
          logger.info(`Brand-Name-Linter (assets): ✓ robots.txt ohne Marken-Literal.`);
        }

        // -------------------------------------------------------------------
        // CSP-Drift-Linter: vercel.json (nicht dist/HTML)
        // -------------------------------------------------------------------
        // Hintergrund: DD-CSP-Mystery (11.–12.05.2026). Das damalige Symptom
        // ("style-src-elem 'self'" blockt eigene /_astro/*.css) war ein
        // gecachter alter CSP-Stand im Browser — der echte WIEDERHOLBARE Bug
        // ist CSP-Drift: 8/11 Customer-Repos hatten zeitweise unvollständige
        // CSPs (fehlende -elem-Direktiven, media-src, plausible.io in
        // script-src-elem/connect-src) oder Smart-Quotes. Wurde nie als Guard
        // codifiziert → jetzt hier (siehe csp-check.js). Soft-Warn per Default.
        if (options.checkCsp !== false) {
          const analyticsHost =
            options.analyticsHost === undefined ? 'plausible.io' : options.analyticsHost;
          const vercelPath = [join(process.cwd(), 'vercel.json'), join(distDir, '..', 'vercel.json')].find(
            (p) => existsSync(p),
          );
          if (!vercelPath) {
            logger.info('CSP-Linter: keine vercel.json gefunden — Skip.');
          } else {
            const cspValues = extractCspValuesFromVercelJson(readFileSync(vercelPath, 'utf-8'));
            const cspIssues = cspValues.flatMap((csp) =>
              checkCspCompleteness(csp, { analyticsHost, siteOrigin: data.url }),
            );
            if (cspIssues.length === 0) {
              logger.info(`CSP-Linter: ✓ vercel.json CSP vollständig (${cspValues.length} Header geprüft).`);
            } else {
              logger.warn(
                `CSP-Linter: ${cspIssues.length} CSP-Drift-Issue(s) in ${vercelPath} (verhindert DD-CSP-Mystery-Wiederholung):`,
              );
              for (const ci of cspIssues) {
                logger.warn(`  [${ci.type}] ${ci.details}`);
              }
              if (options.strictCsp) {
                throw new Error(
                  `[ai-discovery] strictCsp=true: Build abgebrochen wegen ${cspIssues.length} CSP-Drift-Issue(s).`,
                );
              }
            }

            // ---------------------------------------------------------------
            // CSP-Output-Verifikation: CSP gegen das GEBAUTE dist/ (hart)
            // ---------------------------------------------------------------
            // Der Linter oben prüft den CSP-*Text* gegen bekannte Fehlermuster
            // und kann darum nur Brüche fangen, die schon einmal live waren.
            // gympanzen (22.07.2026) bestand ihn mit 0 Issues und lieferte
            // trotzdem fünf Tage lang eine komplett ungestylte Seite aus:
            // inlineStylesheets:'always' erzeugt einen <style>-Block, den
            // "style-src-elem 'self'" verwirft.
            //
            // Deshalb hier die Gegenprobe gegen den echten Output — und
            // bewusst HART: ein Fehlschlag im astro:build:done lässt den
            // Vercel-Build scheitern, wodurch der alte (funktionierende)
            // Build live bleibt. Ein GitHub-CI-Gate allein reicht nicht: ein
            // Push auf main startet den Prod-Deploy PARALLEL zur CI, rotes CI
            // stoppt ihn nicht.
            if (options.checkOutputCsp !== false) {
              const htmlFiles: string[] = [];
              const walk = (dir: string) => {
                for (const entry of readdirSync(dir, { withFileTypes: true })) {
                  const p = join(dir, entry.name);
                  if (entry.isDirectory()) walk(p);
                  else if (entry.name.endsWith('.html')) htmlFiles.push(p);
                }
              };
              walk(distDir);

              const hashFn = (content: string, algo: string) =>
                createHash(algo).update(content, 'utf8').digest('base64');

              let blockedCount = 0;
              let riskyCount = 0;
              const messages: string[] = [];
              for (const file of htmlFiles) {
                const rel = relative(process.cwd(), file);
                const html = readFileSync(file, 'utf-8');
                for (const csp of cspValues) {
                  for (const f of auditHtml(html, csp, { siteOrigin: data.url, file: rel, hashFn })) {
                    if (f.result.allowed) riskyCount++;
                    else blockedCount++;
                    messages.push(formatFinding(f));
                  }
                }
              }

              if (blockedCount === 0 && riskyCount === 0) {
                logger.info(
                  `CSP-Output-Check: ✓ ${htmlFiles.length} Seite(n) gegen die CSP geprüft — keine blockierte Ressource.`,
                );
              } else {
                // Als Pfeilfunktion, nicht als Methoden-Referenz: Astros Logger
                // braucht sein `this` (sonst "Cannot read properties of undefined").
                const log = (msg: string) => (blockedCount > 0 ? logger.error(msg) : logger.warn(msg));
                log(
                  `CSP-Output-Check: ${blockedCount} blockierte (❌), ${riskyCount} riskante (⚠) Ressource(n) in ${htmlFiles.length} Seite(n):`,
                );
                for (const m of messages.slice(0, 20)) log(`  ${m.replace(/\n/g, '\n  ')}`);
                if (messages.length > 20) log(`  … und ${messages.length - 20} weitere.`);
                if (blockedCount > 0) {
                  throw new Error(
                    `[ai-discovery] Build abgebrochen: die CSP in vercel.json blockt ${blockedCount} Ressource(n), die dieser Build ausliefert. ` +
                      'Der Deploy würde eine kaputte Seite live stellen. Fix: node node_modules/@cw/core/scripts/gen-vercel-csp.mjs + commit.',
                  );
                }
              }
            }
          }
        }

        // -------------------------------------------------------------------
        // Cache-Header-Linter: vercel.json (Speed-Rollout 2026-07-09)
        // -------------------------------------------------------------------
        // Kein Customer-vercel.json im Cluster hatte Cache-Control → alle
        // public/-Assets gingen mit Vercel-Default max-age=0 zum Browser
        // (nur gehashte /_astro/* sind via Astro-Preset immutable). Dazu
        // Anti-Pattern-Schutz: immutable auf public/-Pfaden, no-store auf
        // Assets. Siehe cache-header-check.js + docs/caching-rationale.md.
        if (options.checkCacheHeaders !== false) {
          const vercelPath = [join(process.cwd(), 'vercel.json'), join(distDir, '..', 'vercel.json')].find(
            (p) => existsSync(p),
          );
          if (!vercelPath) {
            logger.info('Cache-Header-Linter: keine vercel.json gefunden — Skip.');
          } else {
            const rules = extractHeaderRulesFromVercelJson(readFileSync(vercelPath, 'utf-8'));
            const hasFontsDir = existsSync(join(distDir, 'fonts'));
            const cacheIssues = checkCacheHeaders(rules, { hasFontsDir });
            if (cacheIssues.length === 0) {
              logger.info('Cache-Header-Linter: ✓ vercel.json Cache-Politik ok.');
            } else {
              logger.warn(`Cache-Header-Linter: ${cacheIssues.length} Issue(s) in ${vercelPath}:`);
              for (const ci of cacheIssues) {
                logger.warn(`  [${ci.type}] ${ci.details}`);
              }
              if (options.strictCacheHeaders !== false) {
                throw new Error(
                  `[ai-discovery] strictCacheHeaders=true: Build abgebrochen wegen ${cacheIssues.length} Cache-Header-Issue(s).`,
                );
              }
            }
          }
        }

        // -------------------------------------------------------------------
        // Embed-Consent-Guard: Buchungs-Embeds, die ohne Nutzeraktion laden
        // -------------------------------------------------------------------
        // Auslöser 2026-08-03: steller-sanierungen.com/kontakt lieferte live den
        // Eager-Zweig von CalEmbed.astro — Besucher-IP floss an Cal.com, bevor
        // irgendwer geklickt hatte. Ursache war der Default `lazy = false`.
        if (options.checkEmbedConsent !== false) {
          const embedIssues: { type: string; details: string }[] = [];
          for (const file of walkHtml(distDir)) {
            const html = readFileSync(file, 'utf-8');
            const rel = file.slice(distDir.length).replace(/^\//, '') || 'index.html';
            embedIssues.push(...checkEmbedConsent(html, rel));
          }
          if (embedIssues.length > 0) {
            logger.warn(
              `Embed-Consent-Guard: ${embedIssues.length} Seite(n) laden ein Buchungs-Embed ohne Nutzeraktion:`,
            );
            for (const ei of embedIssues.slice(0, 5)) {
              logger.warn(`  [${ei.type}] ${ei.details}`);
            }
            if (embedIssues.length > 5) {
              logger.warn(`  … und ${embedIssues.length - 5} weitere Seite(n).`);
            }
            if (options.strictEmbedConsent === true) {
              throw new Error(
                `[ai-discovery] strictEmbedConsent=true: Build abgebrochen — ${embedIssues.length} Seite(n) mit eager geladenem Buchungs-Embed.`,
              );
            }
          } else {
            logger.info('Embed-Consent-Guard: ✓ kein eager geladenes Buchungs-Embed.');
          }
        }

        // -------------------------------------------------------------------
        // Motion-Consent-Guard: ausgeliefert, aber nie angefordert
        // -------------------------------------------------------------------
        // Directory-Walk hier (walkHtml in Scope), reine Logik in
        // motion-consent-check.js — gleicher Split wie perf-check.js.
        if (options.checkMotionConsent !== false) {
          const motionDir = new URL('../../components/motion/', import.meta.url);
          let motionComponents: { name: string; source: string }[] = [];
          try {
            const dir = fileURLToPath(motionDir);
            motionComponents = readdirSync(dir)
              .filter((f) => f.endsWith('.astro'))
              .map((f) => ({
                name: f.replace(/\.astro$/, ''),
                source: readFileSync(join(dir, f), 'utf-8'),
              }));
          } catch {
            motionComponents = [];
          }

          if (motionComponents.length === 0) {
            // Vorbedingung nicht erfüllt — ohne Komponenten kann der Guard
            // nichts finden, und "nichts gefunden" sähe aus wie "alles gut".
            logger.warn(
              'Motion-Guard: übersprungen — cw-core/components/motion nicht lesbar. NICHT als "sauber" werten.',
            );
          } else if (!customerSrcDir || !existsSync(customerSrcDir)) {
            logger.warn(
              'Motion-Guard: übersprungen — srcDir nicht lesbar, Zustimmung nicht feststellbar. NICHT als "sauber" werten.',
            );
          } else {
            const markerOwners = buildMarkerOwners(motionComponents);
            const markerCounts: Record<string, number> = {};
            for (const file of walkHtml(distDir)) {
              const body = stripMotionInlineBlocks(readFileSync(file, 'utf-8'));
              for (const marker of markerOwners.keys()) {
                markerCounts[marker] = (markerCounts[marker] ?? 0) + countMarker(body, marker);
              }
            }

            const sourceTexts: string[] = [];
            const collectSources = (dir: string) => {
              for (const entry of readdirSync(dir, { withFileTypes: true })) {
                const full = join(dir, entry.name);
                if (entry.isDirectory()) {
                  if (entry.name !== 'node_modules') collectSources(full);
                } else if (/\.(astro|ts|tsx|js|mjs|jsx|md|mdx)$/.test(entry.name)) {
                  sourceTexts.push(readFileSync(full, 'utf-8'));
                }
              }
            };
            collectSources(customerSrcDir);

            const motionIssues = checkMotionConsent({
              markerCounts,
              markerOwners,
              consented: collectConsent(sourceTexts),
              acknowledged: options.acknowledgedMotion ?? [],
            });

            if (motionIssues.length > 0) {
              logger.warn(
                `Motion-Guard: ${motionIssues.length} Motion-Effekt(e) werden ausgeliefert, ohne angefordert zu sein:`,
              );
              for (const mi of motionIssues) logger.warn(`  ${mi.details}`);
            } else {
              const delivered = Object.values(markerCounts).reduce((a, b) => a + b, 0);
              logger.info(
                `Motion-Guard: ✓ ${delivered} Motion-Marker ausgeliefert, alle angefordert.`,
              );
            }
          }
        }

        // -------------------------------------------------------------------
        // Perf-Linter: Render-Blocking-CSS + tote Font-Familien (dist)
        // -------------------------------------------------------------------
        // Directory-Walk hier (walkHtml in Scope), pure Checks in perf-check.js.
        if (options.checkInlineCss !== false || options.checkFonts !== false) {
          const perfHtmlFiles = walkHtml(distDir);
          const inlineCssTexts: string[] = [];
          let renderBlockingIssues: { type: string; details: string }[] = [];
          for (const file of perfHtmlFiles) {
            const html = readFileSync(file, 'utf-8');
            const rel = file.slice(distDir.length).replace(/^\//, '') || 'index.html';
            if (options.checkInlineCss !== false) {
              renderBlockingIssues = renderBlockingIssues.concat(checkRenderBlockingCss(html, rel));
            }
            inlineCssTexts.push(...extractInlineStyles(html));
          }
          if (renderBlockingIssues.length > 0) {
            logger.warn(
              `Perf-Linter: ${renderBlockingIssues.length} Seite(n) mit render-blockendem CSS (build.inlineStylesheets: 'always' fehlt?):`,
            );
            for (const pi of renderBlockingIssues.slice(0, 5)) {
              logger.warn(`  [${pi.type}] ${pi.details}`);
            }
            if (renderBlockingIssues.length > 5) {
              logger.warn(`  … und ${renderBlockingIssues.length - 5} weitere Seite(n).`);
            }
            if (options.strictInlineCss !== false) {
              throw new Error(
                `[ai-discovery] strictInlineCss=true: Build abgebrochen wegen render-blockendem CSS auf ${renderBlockingIssues.length} Seite(n).`,
              );
            }
          } else if (options.checkInlineCss !== false) {
            logger.info('Perf-Linter: ✓ kein render-blockendes CSS.');
          }

          if (options.checkFonts !== false) {
            // Externe CSS (falls nicht inlined) mit einsammeln, damit
            // @font-face-Deklaration und Referenz in verschiedenen Dateien liegen dürfen.
            const astroDir = join(distDir, '_astro');
            const cssTexts = [...inlineCssTexts];
            if (existsSync(astroDir)) {
              for (const entry of readdirSync(astroDir)) {
                if (entry.endsWith('.css')) {
                  cssTexts.push(readFileSync(join(astroDir, entry), 'utf-8'));
                }
              }
            }
            const fontIssues = checkDeadFontFamilies(cssTexts);
            if (fontIssues.length === 0) {
              logger.info('Perf-Linter: ✓ keine toten Font-Familien.');
            } else {
              logger.warn(`Perf-Linter: ${fontIssues.length} tote Font-Familie(n):`);
              for (const fi of fontIssues) {
                logger.warn(`  [${fi.type}] ${fi.details}`);
              }
              if (options.strictFonts !== false) {
                throw new Error(
                  `[ai-discovery] strictFonts=true: Build abgebrochen wegen ${fontIssues.length} toter Font-Familie(n).`,
                );
              }
            }
          }
        }

        // -------------------------------------------------------------------
        // Perf-Budget-Guard: dist-Bilder über KB-Budget (blitzsicht-ops#541)
        // -------------------------------------------------------------------
        // Fängt das 2-MB-Hero, das durch die Cache-/CSS-/Font-Guards fällt.
        // Directory-Walk + statSync hier, reiner Größenvergleich in perf-check.js.
        // reuse walkImages → OG/Icons/Favicons ausgenommen. Soft-Warn-Start
        // (strictImageBudget opt-IN), erst nach Fleet-Lauf strict-Kandidat.
        //
        // BUDGET_EXT statt der Default-Liste: der Geotag-Pfad kennt kein AVIF
        // (exiftool taggt es nicht), das Größen-Budget muss es aber sehen —
        // sonst bleibt genau das Format ungemessen, das `<picture>` zuerst lädt
        // (blitzsicht-ops#660).
        if (options.checkImageBudget !== false) {
          const maxKb = options.maxImageKb ?? 200;
          const budgetImages = walkImages(distDir, [], BUDGET_EXT).map((p: string) => ({
            path: p.slice(distDir.length).replace(/^\//, ''),
            sizeBytes: statSync(p).size,
          }));
          const budgetIssues = checkImageBudget(budgetImages, maxKb);
          if (budgetIssues.length === 0) {
            logger.info(`Perf-Budget-Guard: ✓ alle dist-Bilder ≤ ${maxKb} KB.`);
          } else {
            logger.warn(`Perf-Budget-Guard: ${budgetIssues.length} Bild(er) über ${maxKb} KB:`);
            for (const bi of budgetIssues.slice(0, 10)) {
              logger.warn(`  [${bi.type}] ${bi.details}`);
            }
            if (budgetIssues.length > 10) {
              logger.warn(`  … und ${budgetIssues.length - 10} weitere.`);
            }
            if (options.strictImageBudget === true) {
              throw new Error(
                `[ai-discovery] strictImageBudget=true: Build abgebrochen wegen ${budgetIssues.length} Bild(ern) über ${maxKb} KB.`,
              );
            }
          }
        }

        // -------------------------------------------------------------------
        // Geo/Meta-Tagging der dist-Bilder (Post-Build Re-Tagging, zero-config)
        // -------------------------------------------------------------------
        // astro:assets (sharp) strippt EXIF beim Build → Tags auf src/assets-
        // Quellen überleben nicht. Daher hier, NACH dem Build, die fertigen
        // dist-WebP taggen (Copyright/Artist/GPS/Description aus site-data).
        // Non-fatal: bricht nie den Build.
        try {
          await geotagDist(distDir, data, logger);
        } catch (e) {
          logger.warn(
            `Geotag: unerwarteter Fehler (${e instanceof Error ? e.message : String(e)}) — übersprungen.`,
          );
        }

        // -------------------------------------------------------------------
        // Ein eigenes og:image pro Seite (Post-Build, zero-config)
        // -------------------------------------------------------------------
        // Bis 27.08.2026 trugen alle Unterseiten dasselbe Vorschaubild, weil das
        // Rendern eine optionale peerDependency (satori) brauchte, die kein Kunde
        // installiert hatte — sieben Wochen lang unbemerkt, weil der Rückfall still
        // war. satori ist jetzt echte dependency, und diese Stelle rendert je Seite
        // aus Titel, Beschreibung und Hero-Foto. Non-fatal wie der Geotag-Lauf, aber
        // mit sichtbarem Report: ein Totalausfall steht künftig im Build-Log.
        if (options.ogPerPage !== false) {
          try {
            await ogProSeite({
              dir: distDir,
              logger,
              domain: new URL(data.url).host,
              strict: options.strictOgPerPage === true,
              // KI-Offenlegung auf dem Vorschaubild — Badge in den Pixeln und Wortlaut
              // im `og:image:alt`, beides aus derselben Auflösung.
              //
              // Zero-config und nicht opt-in (v0.147.0 hatte den Callback noch offen
              // gelassen): Die erzeugte `src/data/bild-herkunft.ts` IST die freigegebene
              // Entscheidung — je Bild mit Begründung, aus einer abgezeichneten
              // Arbeitsliste erzeugt. Ein zweites Opt-in wäre die Freigabe der Freigabe,
              // und eine Pflicht, die man erst anschalten muss, ist genau die Lücke, die
              // hier geschlossen werden soll.
              //
              // Ohne Deklaration passiert weiterhin nichts: `resolveBildHerkunft` liefert
              // dann `ungeklaert`, und `istKennzeichnungspflichtig` ist dort `false`. Es
              // wird also nichts behauptet, was niemand erklärt hat.
              fotoHerkunft: (distRelativerPfad) => {
                const ergebnis = resolveBildHerkunft(data, distRelativerPfad);
                return istKennzeichnungspflichtig(ergebnis)
                  ? (ergebnis.herkunft as 'ki-erzeugt' | 'ki-veraendert')
                  : null;
              },
            });
          } catch (e) {
            if (options.strictOgPerPage === true) throw e;
            logger.warn(
              `og-pages: unerwarteter Fehler (${e instanceof Error ? e.message : String(e)}) — übersprungen.`,
            );
          }
        }
      },
    },
  };
}
