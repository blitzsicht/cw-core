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

import { writeFileSync, mkdirSync, readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import type { AstroIntegration } from 'astro';
import { checkCspCompleteness, extractCspValuesFromVercelJson } from './csp-check.js';
import { checkCacheHeaders, extractHeaderRulesFromVercelJson } from './cache-header-check.js';
import {
  checkDeadFontFamilies,
  checkRenderBlockingCss,
  extractInlineStyles,
} from './perf-check.js';
import { geotagDist } from './geotag.js';

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
    // Rechtsform-Felder (optional) — vom Impressum-Linter geprüft. Customer ohne
    // gepflegtes Rechtsform-Schema lassen sie weg → Linter überspringt sie.
    owner?: string;
    company?: string;
    rechtsform?: string;
    register?: string;
    registerNumber?: string;
    registerNummer?: string;
  };
  seo?: {
    foundingDate?: string;
    areaServed?: readonly string[];
  };
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
   * Default true. Prüft die `vercel.json` auf Cache-Control-Politik für
   * public/-Assets: fehlende Asset-/Font-Cache-Regeln, `immutable` auf
   * Nicht-/_astro-Pfaden (Stale-forever-Anti-Pattern), `no-store` auf Assets.
   * Hintergrund (Speed-Rollout 2026-07-09): kein Customer-vercel.json im
   * Cluster hatte Cache-Control → alle public/-Assets gingen mit max-age=0
   * zum Browser. Siehe docs/caching-rationale.md.
   */
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
 * Leitet die "Wichtige Seiten"-Liste für llms.txt aus den REAL gebauten
 * dist/-Routen ab (statt hardcodeter Pfade, die bei Single-Page-/Produkt-Sites
 * tote Links erzeugten). Regeln: nur Top-Level-Routen (Tiefe 1), ohne Homepage,
 * ohne noindex-Seiten. Label via Slug-Map mit Title-Case-Fallback. Alphabetisch
 * sortiert (deterministisch). Exportiert für Unit-Tests.
 */
export function resolveImportantPages(
  htmlFiles: readonly string[],
  distDir: string,
  baseUrl: string,
): Array<{ label: string; href: string }> {
  const base = distDir.replace(/\\/g, '/').replace(/\/$/, '');
  const pages: Array<{ label: string; href: string }> = [];
  for (const file of htmlFiles) {
    const rel = file.replace(/\\/g, '/').slice(base.length);
    const route = rel.replace(/index\.html$/, '').replace(/\/+$/, '');
    if (route === '') continue; // Homepage — steckt bereits in H1
    const segments = route.replace(/^\//, '').split('/').filter(Boolean);
    if (segments.length !== 1) continue; // nur Top-Level (Detailseiten stehen in "Was wir anbieten")
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
    const label =
      IMPORTANT_PAGE_LABELS[slug] ??
      slug
        .split('-')
        .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w))
        .join(' ');
    pages.push({ label, href: `${baseUrl}/${slug}/` });
  }
  pages.sort((a, b) => a.href.localeCompare(b.href));
  return pages;
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

interface SchemaIssue {
  page: string;
  type: 'duplicate_id' | 'missing_context' | 'missing_type' | 'invalid_json';
  detail: string;
}

/** Sammelt alle @id-Strings aus einem parsed JSON-LD-Objekt (Top-Level + @graph). */
function collectIds(obj: unknown, out: string[] = []): string[] {
  if (!obj || typeof obj !== 'object') return out;
  const o = obj as Record<string, unknown>;
  if (typeof o['@id'] === 'string') out.push(o['@id']);
  const graph = o['@graph'];
  if (Array.isArray(graph)) {
    for (const item of graph) collectIds(item, out);
  }
  return out;
}

interface MetaIssue {
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
  type: 'prose_literal' | 'static_asset_literal';
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
      n++;
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

  if (data.faqs) {
    data.faqs.forEach((faq, i) => {
      check(`siteData.faqs[${i}].q`, faq.q);
      check(`siteData.faqs[${i}].a`, faq.a);
    });
  }

  if (data.leistungen) {
    data.leistungen.forEach((svc, i) => {
      check(`siteData.leistungen[${i}].title`, svc.title);
      check(`siteData.leistungen[${i}].description`, svc.description);
    });
  }

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
    count++;
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

/** Extrahiert den `<title>`-Text (whitespace-normalized). Leerer String wenn fehlend. */
function extractTitle(html: string): string {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!m) return '';
  return m[1].replace(/\s+/g, ' ').trim();
}

/** Extrahiert den Inhalt von `<meta name="description" content="...">`. Leer wenn fehlend. */
function extractDescription(html: string): string {
  const m = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["'][^>]*>/i);
  if (!m) return '';
  // Astro escapt manche Chars (&amp;, &#34; etc.) — für Längen-Check decodieren wir minimal.
  return m[1]
    .replace(/&amp;/g, '&')
    .replace(/&#34;|&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Prüft Title/Description-Längen einer Page. */
function lintPageMeta(
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

/** Prüft eine einzelne dist-HTML auf Schema-Probleme. */
function lintPageSchema(htmlPath: string, distDir: string): SchemaIssue[] {
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
    const root = parsed as Record<string, unknown>;
    if (!root['@context'] && !Array.isArray(root['@graph'])) {
      issues.push({ page, type: 'missing_context', detail: `JSON-LD-Block #${i + 1} hat kein @context.` });
    }
    if (!root['@type'] && !Array.isArray(root['@graph'])) {
      issues.push({ page, type: 'missing_type', detail: `JSON-LD-Block #${i + 1} hat kein @type.` });
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

function generateLlmsTxt(
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
  const facts: string[] = [];
  if (data.seo?.foundingDate) {
    facts.push(`- Gegründet: ${data.seo.foundingDate}`);
  }
  if (data.seo?.areaServed && data.seo.areaServed.length > 0) {
    facts.push(`- Servicegebiet: ${data.seo.areaServed.join(', ')}`);
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

  // Machine-readable full text pointer
  lines.push('## Maschinenlesbarer Volltext');
  lines.push('');
  lines.push(
    `- [llms-full.txt](${data.url}/llms-full.txt) — Vollständige Service-, FAQ- und Unternehmensinformationen für KI-Agenten`,
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

function generateLlmsFullTxt(
  data: AiDiscoverySiteData,
  services: ReadonlyArray<ServiceItem> | undefined,
  faqs: ReadonlyArray<FAQItem> | undefined,
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

export default function aiDiscovery<T extends AiDiscoverySiteData>(
  options: AiDiscoveryOptions<T>,
): AstroIntegration {
  return {
    name: '@cw/core/integrations/ai-discovery',
    hooks: {
      // Domain-Guard: fängt den Fall, dass astro.config `site` und
      // site-data `url` auf verschiedene Domains zeigen. Genau dieser Drift
      // (config.site = echte Domain, site-data.url = Tippfehler-Domain) führt
      // dazu, dass canonical/Schema/Sitemap UND die hier generierte llms.txt
      // auf eine falsche/tote Domain verweisen — ein stiller SEO-Killer.
      'astro:config:done': async ({ config, logger }) => {
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
        const brandIssuesSiteData = lintBrandNameInSiteData(data, data.name);
        if (brandIssuesSiteData.length > 0) {
          const literalCount = brandIssuesSiteData.reduce((s, i) => s + i.count, 0);
          logger.warn(
            `Brand-Name-Linter: "${data.name}" kommt ${literalCount}× als Literal in ` +
            `${brandIssuesSiteData.length} siteData-Prosa-Feld(ern) vor. ` +
            `Convention: nur siteData.name, generische Formulierung in allen anderen Feldern. ` +
            `Siehe docs/brand-name-convention.md`,
          );
          for (const issue of brandIssuesSiteData) {
            logger.warn(`  [brand-name] ${issue.location}: ${issue.count}× — ${issue.detail.split('.')[0]}.`);
          }
          if (options.strictBrandName) {
            throw new Error(
              `[ai-discovery] strictBrandName=true: Build abgebrochen wegen ${literalCount} Brand-Name-Literalen in siteData.`,
            );
          }
        } else {
          logger.info(`Brand-Name-Linter (siteData): ✓ Keine Literal-Duplikate in Prosa-Feldern.`);
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
        const importantPages = resolveImportantPages(htmlFiles, distDir, data.url);

        const llmsTxt = generateLlmsTxt(data, services, importantPages);
        writeFileSync(join(outDir, 'llms.txt'), llmsTxt, 'utf-8');
        logger.info(`  → ${join(outDir, 'llms.txt')}`);

        const llmsFullTxt = generateLlmsFullTxt(data, services, faqs);
        writeFileSync(join(outDir, 'llms-full.txt'), llmsFullTxt, 'utf-8');
        logger.info(`  → ${join(outDir, 'llms-full.txt')}`);

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
        // Geo/Meta-Tagging der dist-Bilder (Post-Build Re-Tagging, zero-config)
        // -------------------------------------------------------------------
        // astro:assets (sharp) strippt EXIF beim Build → Tags auf src/assets-
        // Quellen überleben nicht. Daher hier, NACH dem Build, die fertigen
        // dist-WebP taggen (Copyright/Artist/GPS/Description aus site-data).
        // Non-fatal: bricht nie den Build.
        try {
          await geotagDist(distDir, data, logger);
        } catch (e) {
          logger.warn(`Geotag: unerwarteter Fehler (${e?.message ?? e}) — übersprungen.`);
        }
      },
    },
  };
}
