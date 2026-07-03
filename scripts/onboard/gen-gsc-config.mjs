#!/usr/bin/env node
/**
 * gen-gsc-config.mjs — erzeugt die cw-seo-system Multi-Tenant-Config für einen Kunden.
 *
 * Schreibt `cw-seo-system/configs/<slug>.py` im gelebten Format (vgl. blitzsicht.py):
 * GSC_PROPERTY + DOMAIN + BRAND_TERMS, Rest erbt aus Pipeline-Defaults/.env.
 * Das ist der automatisierbare Teil der GSC-Anbindung. Zwei Schritte bleiben
 * unvermeidlich MANUELL (das Script erinnert daran):
 *   1. GSC-Property (Domain-Typ) in der Search-Console-UI anlegen + per DNS-TXT verifizieren.
 *   2. Service-Account als "Eingeschränkter" Nutzer in GSC → Nutzer/Berechtigungen eintragen.
 *
 * Default DRY-RUN. `--apply` schreibt die Datei (nur wenn sie fehlt, außer --force).
 *
 *   node gen-gsc-config.mjs --slug kunde --domain kunde.de --brand "Kunde GmbH,kunde"
 *   node gen-gsc-config.mjs --slug kunde --domain kunde.de --apply
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
// cw-core/scripts/onboard → ../../../cw-seo-system (Schwester-Repo im CLAUDE-Container)
const DEFAULT_SEO_REPO = join(SCRIPT_DIR, '../../../cw-seo-system');
const GSC_SERVICE_ACCOUNT = 'gsc-reader@cw-marketing-seo.iam.gserviceaccount.com';

function parseArgs(argv) {
  const args = { apply: false, force: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--apply') args.apply = true;
    else if (a === '--force') args.force = true;
    else if (a === '--slug') args.slug = argv[++i];
    else if (a === '--domain') args.domain = argv[++i];
    else if (a === '--brand') args.brand = argv[++i];
    else if (a === '--seo-repo') args.seoRepo = argv[++i];
    else if (a === '--help' || a === '-h') args.help = true;
  }
  return args;
}

function die(msg) {
  console.error(`❌ ${msg}`);
  process.exit(1);
}

/** Python-Raw-Regex-Literale für BRAND_TERMS aus Markenwörtern + Domain bauen. */
function buildBrandTerms(brand, slug, domain) {
  const words = (brand ? brand.split(',') : slug.split('-'))
    .map((w) => w.trim().toLowerCase())
    .filter(Boolean);
  const uniq = [...new Set(words)];
  const domainEsc = domain.replace(/\./g, '\\.');
  const terms = uniq.map((w) => `    r"\\b${w}\\b",`);
  terms.push(`    r"${domainEsc}",`);
  return terms.join('\n');
}

function renderConfig(slug, domain, brandTerms, dateStr) {
  return `"""cw-seo-system Config für customer-${slug} (auto-generiert ${dateStr}).

Nur customer-spezifische Werte hier — GSC-Auth, DB, Pipeline-Defaults
kommen aus pipeline-Code bzw. .env.
"""
import os as _os
from pathlib import Path

GSC_PROPERTY = "sc-domain:${domain}"
DOMAIN = "${domain}"

BRAND_TERMS = [
${brandTerms}
]
BRAND_REGEX_SQL = "(" + "|".join(BRAND_TERMS) + ")"

DB_DSN = _os.environ.get(
    "DATABASE_URL",
    "postgresql://claude:claude_dev@localhost:5433/cw_marketing",
)

GSC_BACKFILL_MONTHS = 16
GSC_SEARCH_TYPES = ["web"]
GSC_DIMENSIONS = ["date", "query", "page", "country", "device"]
GSC_ROW_LIMIT = 25000
GSC_INCREMENTAL_DAYS = 3

REPORT_DIR = Path(__file__).resolve().parent.parent / "out"

SLACK_WEBHOOK_URL = ""
NOTIFY_EMAIL = ""

LOG_LEVEL = "INFO"
SLEEP_BETWEEN_CALLS_SEC = 0.2
MAX_RETRIES = 3
RETRY_BASE_DELAY_SEC = 4

CRAWL_DEPTH = 2
`;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log('Usage: gen-gsc-config.mjs --slug <slug> --domain <domain> [--brand "Name,variant"] [--seo-repo <path>] [--apply] [--force]');
    process.exit(0);
  }
  const slug = (args.slug || '').trim().toLowerCase();
  const domain = (args.domain || '').trim().toLowerCase();
  if (!slug) die('--slug <slug> ist Pflicht.');
  if (!domain) die('--domain <domain> ist Pflicht.');
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) die(`Ungültiger Slug: "${slug}".`);

  const seoRepo = args.seoRepo || DEFAULT_SEO_REPO;
  const configsDir = join(seoRepo, 'configs');
  if (!existsSync(configsDir)) die(`configs/-Verzeichnis nicht gefunden: ${configsDir} (--seo-repo setzen?).`);
  const target = join(configsDir, `${slug}.py`);

  const dateStr = new Date().toISOString().slice(0, 10);
  const brandTerms = buildBrandTerms(args.brand, slug, domain);
  const content = renderConfig(slug, domain, brandTerms, dateStr);

  console.log(`ℹ️  GSC-Config: ${target}`);
  console.log(`   GSC_PROPERTY = sc-domain:${domain}`);
  if (!args.brand) console.log('   ⚠️  --brand nicht gesetzt — BRAND_TERMS aus Slug abgeleitet, bitte prüfen.');

  if (existsSync(target) && !args.force) {
    console.log(`✓ Config existiert bereits (${slug}.py) — kein Überschreiben (--force zum Ersetzen).`);
    printManualSteps(slug, domain);
    return;
  }

  if (!args.apply) {
    console.log('\n— DRY-RUN (Datei nicht geschrieben). Mit --apply schreiben. —\n');
    console.log(content);
    printManualSteps(slug, domain);
    return;
  }

  writeFileSync(target, content);
  console.log(`✏️  Config geschrieben: configs/${slug}.py`);
  printManualSteps(slug, domain);
}

function printManualSteps(slug, domain) {
  console.log('\n📋 Manuelle Schritte (nicht automatisierbar):');
  console.log(`   1. GSC → Property "Domain" für ${domain} anlegen + DNS-TXT beim Registrar verifizieren.`);
  console.log(`   2. GSC → Einstellungen → Nutzer/Berechtigungen → "${GSC_SERVICE_ACCOUNT}" als "Eingeschränkt" hinzufügen.`);
  console.log(`   3. Backfill:  CUSTOMER_CONFIG=configs/${slug}.py python gsc_ingest.py --backfill 16m`);
}

main();
