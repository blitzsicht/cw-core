#!/usr/bin/env node
/**
 * registry-add-customer.mjs — fügt einen Customer-Block in customer-registry.json ein.
 *
 * Schema v7 (customer-websites/customer-registry.json). Legt einen schlanken
 * dev-Eintrag an (Pflichtfelder + sinnvolle Defaults); pricing_snapshot/reference/
 * report_* kommen später bei Vertrag bzw. promote-customer-to-live.sh dazu.
 *
 * Schreibt NUR die Datei — KEIN git commit/push. Der Push triggert zwei GitHub-
 * Actions (Ops-Issue-Bootstrap + cw-uptime-Sync); den löst der Operator bewusst aus.
 *
 * Default DRY-RUN. `--apply` schreibt.
 *
 *   node registry-add-customer.mjs --slug kunde --domain kunde.de --tier starter
 *   node registry-add-customer.mjs --slug kunde --domain kunde.de --tier starter --apply
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const DEFAULT_REGISTRY = join(SCRIPT_DIR, '../../../customer-websites/customer-registry.json');
const EXPECTED_SCHEMA = 7;

const VALID_TIERS = ['starter', 'business', 'enterprise', 'ehrensache'];
const VALID_LIFECYCLE = ['live', 'dev', 'preview', 'archived', 'internal'];
const VALID_SIGNATURE = ['v1', 'v4'];

function parseArgs(argv) {
  const args = { apply: false, tier: 'starter', lifecycle: 'dev', signatureVersion: 'v4', businessType: 'professional-service' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--apply') args.apply = true;
    else if (a === '--slug') args.slug = argv[++i];
    else if (a === '--domain') args.domain = argv[++i];
    else if (a === '--tier') args.tier = argv[++i];
    else if (a === '--lifecycle') args.lifecycle = argv[++i];
    else if (a === '--business-type') args.businessType = argv[++i];
    else if (a === '--signature-version') args.signatureVersion = argv[++i];
    else if (a === '--repo-path') args.repoPath = argv[++i];
    else if (a === '--registry') args.registry = argv[++i];
    else if (a === '--help' || a === '-h') args.help = true;
  }
  return args;
}

function die(msg) {
  console.error(`❌ ${msg}`);
  process.exit(1);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log('Usage: registry-add-customer.mjs --slug <slug> --domain <domain> [--tier starter|business|enterprise|ehrensache] [--lifecycle dev|live|preview] [--business-type <t>] [--signature-version v1|v4] [--apply]');
    process.exit(0);
  }
  const slug = (args.slug || '').trim().toLowerCase();
  const domain = (args.domain || '').trim().toLowerCase();
  if (!slug) die('--slug <slug> ist Pflicht.');
  if (!domain) die('--domain <domain> ist Pflicht.');
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) die(`Ungültiger Slug: "${slug}".`);
  if (!VALID_TIERS.includes(args.tier)) die(`Ungültiger tier: ${args.tier} (${VALID_TIERS.join('|')}).`);
  if (!VALID_LIFECYCLE.includes(args.lifecycle)) die(`Ungültiges lifecycle: ${args.lifecycle} (${VALID_LIFECYCLE.join('|')}).`);
  if (!VALID_SIGNATURE.includes(args.signatureVersion)) die(`Ungültige signature_version: ${args.signatureVersion} (${VALID_SIGNATURE.join('|')}).`);

  const registryPath = args.registry || DEFAULT_REGISTRY;
  if (!existsSync(registryPath)) die(`Registry nicht gefunden: ${registryPath} (--registry setzen?).`);

  const raw = readFileSync(registryPath, 'utf8');
  let reg;
  try {
    reg = JSON.parse(raw);
  } catch (e) {
    die(`Registry ist kein valides JSON: ${e.message}`);
  }
  if (reg.schema_version !== EXPECTED_SCHEMA) {
    console.log(`⚠️  Registry schema_version=${reg.schema_version}, erwartet ${EXPECTED_SCHEMA} — Feldsatz ggf. prüfen.`);
  }
  if (!Array.isArray(reg.customers)) die('Registry hat kein customers[]-Array.');

  if (reg.customers.some((c) => c.slug === slug)) {
    console.log(`✓ Slug "${slug}" existiert bereits in der Registry — kein Duplikat angelegt.`);
    return;
  }

  const claudeRoot = dirname(dirname(registryPath)); // …/customer-websites/registry.json → …/CLAUDE
  const repoPath = args.repoPath || join(claudeRoot, `customer-${slug}`);
  const dateStr = new Date().toISOString().slice(0, 10);

  const block = {
    slug,
    repo_path: repoPath,
    memory_file: 'MEMORY.md',
    active: true,
    tags: ['astro-sites'],
    business_type: args.businessType,
    lifecycle: args.lifecycle,
    tier: args.tier,
    signature_version: args.signatureVersion,
    addons: [],
    booked_at: dateStr,
    production_url: `https://${domain}`,
  };

  reg.customers.push(block);
  const out = JSON.stringify(reg, null, 2) + '\n';
  const normalizes = JSON.stringify(JSON.parse(raw), null, 2) + '\n' !== raw;

  console.log(`ℹ️  Registry-Eintrag für "${slug}" (${args.lifecycle}, ${args.tier}) → ${registryPath}`);
  console.log('\nBlock:\n' + JSON.stringify(block, null, 2));

  if (!args.apply) {
    console.log('\n— DRY-RUN (Registry nicht geschrieben). Mit --apply schreiben. —');
    if (normalizes) console.log('ℹ️  Hinweis: Datei wird beim Schreiben auf 2-Space-JSON normalisiert (prüfe git diff).');
    return;
  }

  writeFileSync(registryPath, out);
  console.log(`✏️  Registry aktualisiert (+1 Customer: ${slug}).`);
  console.log('   ↳ NICHT auto-gepusht. Der Push (git commit + push origin main) triggert:');
  console.log('     • customer-side-effects.yml → Ops-Issue + Memory-Stub + Telegram');
  console.log('     • cw-uptime-sync.yml → cw-uptime Redeploy mit neuer Customer-Liste');
  console.log('   Bewusst auslösen, wenn der Kunde wirklich in die Monitoring-/Sync-Pipeline soll.');
}

main();
