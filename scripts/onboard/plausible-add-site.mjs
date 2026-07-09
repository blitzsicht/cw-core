#!/usr/bin/env node
/**
 * plausible-add-site.mjs — legt eine Site in der self-hosted Plausible-CE-DB an.
 *
 * Plausible CE hat KEINE Sites-API (Enterprise-only) → Anlage per DB-INSERT.
 * Schreibt in `sites` (+ `tracker_script_configuration`) auf der Analytics-Box
 * via `ssh → docker exec psql` (Box-Zugriff aus ./plausible-box.mjs). Idempotent:
 * existiert die Domain schon, wird ihre bestehende pa-ID zurückgegeben statt einer neuen.
 *
 * Default ist DRY-RUN (zeigt nur das SQL + die Befehle). Erst `--apply` schreibt
 * auf die Prod-Box.
 *
 *   node plausible-add-site.mjs --domain kunde.de            # Plan zeigen
 *   node plausible-add-site.mjs --domain kunde.de --apply    # wirklich anlegen
 *   node plausible-add-site.mjs --domain kunde.de --pa pa-XXXXXXXXXXXXXXXXXXXXX --apply
 *
 * --pa <pa-ID>: verwendet eine VORGEGEBENE pa-ID statt einer frisch gewürfelten.
 * Zwingend, wenn eine Site (neu) angelegt wird, deren Repo bereits eine pa-ID in
 * der vercel.json verdrahtet hat — sonst zeigt der deployte /js/script.js-Rewrite
 * auf eine andere pa-ID als die DB und die Events verpuffen (Reconcile-Guard nutzt das).
 *
 * Letzte stdout-Zeile bei Erfolg: `PA_ID pa-XXXXXXXXXXXXXXXXXXXXX`
 * (maschinenlesbar — der onboard-site-Skill reicht sie an wire-site-analytics weiter).
 */
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_HOST, DEFAULT_KEY, PG_CONTAINER, TIMEZONE, TEAM_ID,
  sshOpts, remoteQuery, remoteWrite,
} from './plausible-box.mjs';

const PA_ID_RE = /^pa-[A-Za-z0-9]{21}$/;

function parseArgs(argv) {
  const args = { apply: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--apply') args.apply = true;
    else if (a === '--domain') args.domain = argv[++i];
    else if (a === '--pa') args.pa = argv[++i];
    else if (a === '--host') args.host = argv[++i];
    else if (a === '--key') args.key = argv[++i];
    else if (a === '--help' || a === '-h') args.help = true;
  }
  return args;
}

/** pa-ID = "pa-" + 21 alphanumerische Zeichen (= PK von tracker_script_configuration). */
export function genPaId() {
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

/** Idempotentes Site+Tracker-INSERT (Site nur wenn neu; Tracker nur wenn die Site noch keinen hat). */
export function buildInsertSql(domain, paId) {
  return [
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
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log('Usage: plausible-add-site.mjs --domain <domain> [--pa pa-XXXX] [--apply] [--host user@ip] [--key ~/.ssh/key]');
    process.exit(0);
  }
  const domain = (args.domain || '').trim().toLowerCase();
  if (!domain) die('--domain <domain> ist Pflicht (z.B. --domain kunde.de).');
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(domain)) {
    die(`Ungültiges Domain-Format: "${domain}".`);
  }
  if (args.pa && !PA_ID_RE.test(args.pa)) {
    die(`Ungültiges --pa-Format: "${args.pa}" (erwartet pa- + 21 alphanumerische Zeichen).`);
  }
  const host = args.host || DEFAULT_HOST;
  const key = args.key || DEFAULT_KEY;
  const paId = args.pa || genPaId();

  const insertSql = buildInsertSql(domain, paId);
  const verifySql = `SELECT t.id FROM sites s JOIN tracker_script_configuration t ON t.site_id=s.id WHERE s.domain='${domain}'`;

  console.log(`ℹ️  Plausible-Site: ${domain}  (Box ${host}, Container ${PG_CONTAINER})`);

  if (!args.apply) {
    console.log('\n— DRY-RUN (nichts geschrieben). Mit --apply ausführen. —\n');
    console.log(`pa-ID (nur falls Site neu): ${paId}${args.pa ? ' [vorgegeben via --pa]' : ' [frisch gewürfelt]'}`);
    console.log('\nSQL (idempotent):\n' + insertSql);
    console.log('\nBefehl (SQL via stdin):\n  ssh ' + sshOpts(key).join(' ') + ` ${host} 'docker exec -i ${PG_CONTAINER} psql … -v ON_ERROR_STOP=1'`);
    console.log('\n→ PA_ID (geplant) ' + paId);
    return;
  }

  try {
    remoteWrite(insertSql, { host, key });
  } catch (e) {
    die(`SQL-INSERT fehlgeschlagen (SSH/psql): ${e.message}`);
  }

  let out = '';
  try {
    out = remoteQuery(verifySql, { host, key }).trim();
  } catch (e) {
    die(`Verifikations-SELECT fehlgeschlagen: ${e.message}`);
  }
  const effective = (out.match(/pa-[A-Za-z0-9]{21}/) || [])[0];
  if (!effective) die(`Keine pa-ID nach dem Insert gefunden (Output: "${out}").`);

  if (effective === paId) console.log(`✏️  Site neu angelegt: ${domain} → ${effective}`);
  else console.log(`✓ Site existierte bereits: ${domain} → ${effective} (bestehende pa-ID, kein Insert)`);
  console.log('→ PA_ID ' + effective);
}

// Nur ausführen, wenn direkt aufgerufen — nicht beim Import (Reconcile/Test).
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
