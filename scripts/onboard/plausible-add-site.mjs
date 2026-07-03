#!/usr/bin/env node
/**
 * plausible-add-site.mjs — legt eine Site in der self-hosted Plausible-CE-DB an.
 *
 * Plausible CE hat KEINE Sites-API (Enterprise-only) → Anlage per DB-INSERT.
 * Schreibt in `sites` (+ `tracker_script_configuration`) auf der Analytics-Box
 * via `ssh → docker exec psql`. Idempotent: existiert die Domain schon, wird
 * ihre bestehende pa-ID zurückgegeben statt einer neuen.
 *
 * Default ist DRY-RUN (zeigt nur das SQL + die Befehle). Erst `--apply` schreibt
 * auf die Prod-Box.
 *
 *   node plausible-add-site.mjs --domain kunde.de            # Plan zeigen
 *   node plausible-add-site.mjs --domain kunde.de --apply    # wirklich anlegen
 *
 * Letzte stdout-Zeile bei Erfolg: `PA_ID pa-XXXXXXXXXXXXXXXXXXXXX`
 * (maschinenlesbar — der onboard-site-Skill reicht sie an wire-site-analytics weiter).
 */
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { homedir } from 'node:os';

// ─── Box-Konstanten (self-hosted Plausible auf blitzsicht-analytics) ─────────
const DEFAULT_HOST = 'root@100.96.26.82';
const DEFAULT_KEY = `${homedir()}/.ssh/id_ed25519`;
const PG_CONTAINER = 'plausible_db-x12kp2izcjwfau5vq90clcnn';
const PG_DB = 'plausible_db';
const TIMEZONE = 'Europe/Berlin';
const TEAM_ID = 1; // teams-only Modell; site_memberships bleibt ungenutzt

function parseArgs(argv) {
  const args = { apply: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--apply') args.apply = true;
    else if (a === '--domain') args.domain = argv[++i];
    else if (a === '--host') args.host = argv[++i];
    else if (a === '--key') args.key = argv[++i];
    else if (a === '--help' || a === '-h') args.help = true;
  }
  return args;
}

/** pa-ID = "pa-" + 21 alphanumerische Zeichen (= PK von tracker_script_configuration). */
function genPaId() {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = randomBytes(21);
  let s = '';
  for (let i = 0; i < 21; i++) s += alphabet[bytes[i] % alphabet.length];
  return `pa-${s}`;
}

function die(msg) {
  console.error(`❌ ${msg}`);
  process.exit(1);
}

function sshOpts(key) {
  return ['-i', key, '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15'];
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log('Usage: plausible-add-site.mjs --domain <domain> [--apply] [--host user@ip] [--key ~/.ssh/key]');
    process.exit(0);
  }
  const domain = (args.domain || '').trim().toLowerCase();
  if (!domain) die('--domain <domain> ist Pflicht (z.B. --domain kunde.de).');
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(domain)) {
    die(`Ungültiges Domain-Format: "${domain}".`);
  }
  const host = args.host || DEFAULT_HOST;
  const key = args.key || DEFAULT_KEY;
  const paId = genPaId();

  // Idempotentes SQL: Site nur wenn neu; Tracker nur wenn die Site noch keinen hat.
  const insertSql = [
    'BEGIN;',
    `INSERT INTO sites (domain,timezone,team_id,inserted_at,updated_at)`,
    `VALUES ('${domain}','${TIMEZONE}',${TEAM_ID},now(),now())`,
    `ON CONFLICT (domain) DO NOTHING;`,
    `INSERT INTO tracker_script_configuration`,
    ` (id,site_id,installation_type,track_404_pages,hash_based_routing,outbound_links,`,
    `  file_downloads,revenue_tracking,tagged_events,form_submissions,pageview_props,`,
    `  inserted_at,updated_at)`,
    `SELECT '${paId}',s.id,'manual',true,false,true,true,false,false,true,false,now(),now()`,
    `FROM sites s WHERE s.domain='${domain}'`,
    `  AND NOT EXISTS (SELECT 1 FROM tracker_script_configuration t WHERE t.site_id=s.id);`,
    'COMMIT;',
  ].join('\n');

  const verifySql = `SELECT t.id FROM sites s JOIN tracker_script_configuration t ON t.site_id=s.id WHERE s.domain='${domain}'`;
  const remoteInsert = `docker exec -i ${PG_CONTAINER} psql -U postgres -d ${PG_DB} -v ON_ERROR_STOP=1`;
  const remoteVerify = `docker exec ${PG_CONTAINER} psql -U postgres -d ${PG_DB} -tAc "${verifySql}"`;

  console.log(`ℹ️  Plausible-Site: ${domain}  (Box ${host}, Container ${PG_CONTAINER})`);

  if (!args.apply) {
    console.log('\n— DRY-RUN (nichts geschrieben). Mit --apply ausführen. —\n');
    console.log('geplante pa-ID (nur falls Site neu):', paId);
    console.log('\nSQL (idempotent):\n' + insertSql);
    console.log('\nBefehl 1 (SQL via stdin):\n  ssh ' + sshOpts(key).join(' ') + ` ${host} '${remoteInsert}'`);
    console.log('Befehl 2 (Verifikation):\n  ssh ' + sshOpts(key).join(' ') + ` ${host} '${remoteVerify}'`);
    console.log('\n→ PA_ID (geplant) ' + paId);
    return;
  }

  try {
    execFileSync('ssh', [...sshOpts(key), host, remoteInsert], { input: insertSql, encoding: 'utf8', stdio: ['pipe', 'inherit', 'inherit'] });
  } catch (e) {
    die(`SQL-INSERT fehlgeschlagen (SSH/psql): ${e.message}`);
  }

  let out = '';
  try {
    out = execFileSync('ssh', [...sshOpts(key), host, remoteVerify], { encoding: 'utf8' }).trim();
  } catch (e) {
    die(`Verifikations-SELECT fehlgeschlagen: ${e.message}`);
  }
  const effective = (out.match(/pa-[A-Za-z0-9]{21}/) || [])[0];
  if (!effective) die(`Keine pa-ID nach dem Insert gefunden (Output: "${out}").`);

  if (effective === paId) console.log(`✏️  Site neu angelegt: ${domain} → ${effective}`);
  else console.log(`✓ Site existierte bereits: ${domain} → ${effective} (bestehende pa-ID, kein Insert)`);
  console.log('→ PA_ID ' + effective);
}

main();
