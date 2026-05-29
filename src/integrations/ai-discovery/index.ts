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

import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import type { AstroIntegration } from 'astro';

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

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

function generateLlmsTxt(
  data: AiDiscoverySiteData,
  services: ReadonlyArray<ServiceItem> | undefined,
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

  // Important pages
  lines.push('## Wichtige Seiten');
  lines.push('');
  lines.push(`- [Alle Leistungen](${data.url}/leistungen/)`);
  lines.push(`- [FAQ](${data.url}/faq/)`);
  lines.push(`- [Über uns](${data.url}/ueber-uns/)`);
  lines.push(`- [Kontakt](${data.url}/kontakt/)`);
  lines.push('');

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

        const llmsTxt = generateLlmsTxt(data, services);
        writeFileSync(join(outDir, 'llms.txt'), llmsTxt, 'utf-8');
        logger.info(`  → ${join(outDir, 'llms.txt')}`);

        const llmsFullTxt = generateLlmsFullTxt(data, services, faqs);
        writeFileSync(join(outDir, 'llms-full.txt'), llmsFullTxt, 'utf-8');
        logger.info(`  → ${join(outDir, 'llms-full.txt')}`);
      },
    },
  };
}
