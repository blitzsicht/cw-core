#!/usr/bin/env node
/**
 * plausible-add-goals.mjs — legt Conversion-Goals in der self-hosted Plausible-CE-DB an.
 *
 * Plausible CE hat KEINE Goals-API (Enterprise-only) → Anlage per DB-INSERT,
 * exakt wie `plausible-add-site.mjs` die Site anlegt (ssh → docker exec psql).
 * Goals sind rückwirkend: bereits gesammelte Custom-Events erscheinen sofort
 * als Conversion, sobald das Goal existiert.
 *
 * Idempotent: jedes Goal wird nur angelegt, wenn es noch nicht existiert
 * (WHERE NOT EXISTS auf site_id + event_name/page_path). Mehrfach-Ausführung
 * ist gefahrlos. Default DRY-RUN — erst `--apply` schreibt auf die Prod-Box.
 *
 *   node plausible-add-goals.mjs --domain kunde.de              # Plan zeigen (Kern-Goals)
 *   node plausible-add-goals.mjs --domain kunde.de --apply      # Kern-Goals anlegen
 *   node plausible-add-goals.mjs --domain kunde.de --optional   # + optionale Goals
 *   node plausible-add-goals.mjs --domain kunde.de --goals "Form Submit,/danke"  # Custom-Liste
 *
 * Quelle der Standard-Goals: ./plausible-goals.mjs (SSOT). Ein '/'-Präfix im
 * --goals-Wert markiert ein Pageview-Goal, sonst Custom-Event-Goal.
 */
import { execFileSync } from 'node:child_process';
import { homedir } from 'node:os';
import { CORE_GOALS, OPTIONAL_GOALS } from './plausible-goals.mjs';

// ─── Box-Konstanten (identisch zu plausible-add-site.mjs) ────────────────────
const DEFAULT_HOST = 'root@100.96.26.82';
const DEFAULT_KEY = `${homedir()}/.ssh/id_ed25519`;
const PG_CONTAINER = 'plausible_db-x12kp2izcjwfau5vq90clcnn';
const PG_DB = 'plausible_db';

function parseArgs(argv) {
  const args = { apply: false, optional: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--apply') args.apply = true;
    else if (a === '--optional') args.optional = true;
    else if (a === '--domain') args.domain = argv[++i];
    else if (a === '--goals') args.goals = argv[++i];
    else if (a === '--host') args.host = argv[++i];
    else if (a === '--key') args.key = argv[++i];
    else if (a === '--help' || a === '-h') args.help = true;
  }
  return args;
}

function die(msg) {
  console.error(`❌ ${msg}`);
  process.exit(1);
}

function sshOpts(key) {
  return ['-i', key, '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15'];
}

/** Postgres-String-Literal escapen (einfache Quotes verdoppeln). */
function sqlEscape(s) {
  return String(s).replace(/'/g, "''");
}

/** --goals-CSV in Goal-Objekte parsen ('/'-Präfix = Pageview-Goal). */
function parseGoalList(csv) {
  return csv.split(',').map((raw) => {
    const value = raw.trim();
    return { type: value.startsWith('/') ? 'page' : 'event', value };
  }).filter((g) => g.value);
}

/**
 * Idempotentes INSERT für ein einzelnes Goal.
 * @param {string} domain
 * @param {{type:'event'|'page', value:string}} goal
 * @param {boolean} hasDisplayName – ob die goals-Tabelle eine display_name-Spalte hat
 */
function goalInsertSql(domain, goal, hasDisplayName) {
  const col = goal.type === 'page' ? 'page_path' : 'event_name';
  const val = sqlEscape(goal.value);
  const d = sqlEscape(domain);
  const cols = hasDisplayName
    ? `site_id, ${col}, display_name, inserted_at, updated_at`
    : `site_id, ${col}, inserted_at, updated_at`;
  const vals = hasDisplayName
    ? `s.id, '${val}', '${val}', now(), now()`
    : `s.id, '${val}', now(), now()`;
  return [
    `INSERT INTO goals (${cols})`,
    `SELECT ${vals} FROM sites s`,
    `WHERE s.domain='${d}'`,
    `  AND NOT EXISTS (SELECT 1 FROM goals g WHERE g.site_id=s.id AND g.${col}='${val}');`,
  ].join('\n');
}

function buildSql(domain, goals, hasDisplayName) {
  return ['BEGIN;', ...goals.map((g) => goalInsertSql(domain, g, hasDisplayName)), 'COMMIT;'].join('\n');
}

function remoteExec(host, key, remoteCmd, input) {
  const opts = input !== undefined
    ? { input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
    : { encoding: 'utf8' };
  return execFileSync('ssh', [...sshOpts(key), host, remoteCmd], opts);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log('Usage: plausible-add-goals.mjs --domain <domain> [--apply] [--optional] [--goals "a,b,/pfad"] [--host user@ip] [--key ~/.ssh/key]');
    process.exit(0);
  }
  const domain = (args.domain || '').trim().toLowerCase();
  if (!domain) die('--domain <domain> ist Pflicht (z.B. --domain kunde.de).');
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(domain)) {
    die(`Ungültiges Domain-Format: "${domain}".`);
  }
  const host = args.host || DEFAULT_HOST;
  const key = args.key || DEFAULT_KEY;

  const goals = args.goals
    ? parseGoalList(args.goals)
    : (args.optional ? [...CORE_GOALS, ...OPTIONAL_GOALS] : CORE_GOALS);
  if (!goals.length) die('Keine Goals zu provisionieren.');

  const psqlWrite = `docker exec -i ${PG_CONTAINER} psql -U postgres -d ${PG_DB} -v ON_ERROR_STOP=1`;
  const psqlQuery = (sql) => `docker exec ${PG_CONTAINER} psql -U postgres -d ${PG_DB} -tAc "${sql}"`;

  console.log(`ℹ️  Plausible-Goals für ${domain}  (Box ${host}, Container ${PG_CONTAINER})`);
  console.log(`    ${goals.length} Goal(s): ${goals.map((g) => (g.type === 'page' ? `page:${g.value}` : g.value)).join(', ')}`);

  if (!args.apply) {
    console.log('\n— DRY-RUN (nichts geschrieben). Mit --apply ausführen. —\n');
    console.log('SQL (idempotent, modernes CE-Schema mit display_name angenommen):\n');
    console.log(buildSql(domain, goals, true));
    console.log('\nℹ️  Bei --apply wird ZUERST geprüft, ob die Site existiert und ob die');
    console.log('    goals-Tabelle eine display_name-Spalte hat — die Spaltenliste passt sich an.');
    return;
  }

  // 1. Site muss existieren (sonst leerer INSERT, aber wir wollen laut scheitern).
  let siteId = '';
  try {
    siteId = remoteExec(host, key, psqlQuery(`SELECT id FROM sites WHERE domain='${sqlEscape(domain)}'`)).trim();
  } catch (e) {
    die(`Site-Abfrage fehlgeschlagen (SSH/psql): ${e.message}`);
  }
  if (!siteId) die(`Site '${domain}' existiert nicht in Plausible — erst plausible-add-site.mjs --apply ausführen.`);

  // 2. Schema introspektieren: hat goals eine display_name-Spalte? (nicht raten)
  let hasDisplayName = false;
  try {
    const cols = remoteExec(host, key, psqlQuery(`SELECT column_name FROM information_schema.columns WHERE table_name='goals'`));
    hasDisplayName = cols.split('\n').map((s) => s.trim()).includes('display_name');
  } catch (e) {
    die(`Schema-Introspektion fehlgeschlagen: ${e.message}`);
  }

  // 3. Idempotentes INSERT ausführen.
  const sql = buildSql(domain, goals, hasDisplayName);
  try {
    remoteExec(host, key, psqlWrite, sql);
  } catch (e) {
    die(`Goal-INSERT fehlgeschlagen: ${e.message}`);
  }

  // 4. Verifikation.
  let count = '?';
  try {
    count = remoteExec(host, key, psqlQuery(`SELECT count(*) FROM goals g JOIN sites s ON g.site_id=s.id WHERE s.domain='${sqlEscape(domain)}'`)).trim();
  } catch { /* Verifikation optional */ }
  console.log(`✓ Goals provisioniert für ${domain} (display_name-Spalte: ${hasDisplayName ? 'ja' : 'nein'}). Goals gesamt: ${count}`);
  console.log('→ In Plausible sind Goals rückwirkend — historische Events erscheinen sofort als Conversion.');
}

main();
