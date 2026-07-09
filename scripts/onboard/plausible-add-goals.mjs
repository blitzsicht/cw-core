#!/usr/bin/env node
/**
 * plausible-add-goals.mjs — legt Conversion-Goals in der self-hosted Plausible-CE-DB
 * an (oder entfernt sie idempotent wieder mit --remove).
 *
 * Plausible CE hat KEINE Goals-API (Enterprise-only) → Anlage/Löschung per DB-INSERT/
 * DELETE, exakt wie `plausible-add-site.mjs` die Site anlegt (ssh → docker exec psql).
 * Goals sind rückwirkend: bereits gesammelte Custom-Events erscheinen sofort als
 * Conversion, sobald das Goal existiert.
 *
 * Idempotent in beide Richtungen: --apply legt jedes Goal nur an, wenn es noch nicht
 * existiert (WHERE NOT EXISTS auf site_id + event_name/page_path); --remove löscht nur
 * vorhandene (DELETE trifft 0 Zeilen, wenn nichts da ist). Mehrfach-Ausführung ist
 * gefahrlos. Default DRY-RUN — erst `--apply` schreibt auf die Prod-Box.
 *
 *   node plausible-add-goals.mjs --domain kunde.de              # Plan zeigen (Kern-Goals)
 *   node plausible-add-goals.mjs --domain kunde.de --apply      # Kern-Goals anlegen
 *   node plausible-add-goals.mjs --domain kunde.de --optional   # + optionale Goals
 *   node plausible-add-goals.mjs --domain kunde.de --goals "Form Submit,/danke"  # Custom-Liste
 *   node plausible-add-goals.mjs --domain kunde.de --remove --apply   # Rollback: Kern-Goals löschen
 *
 * Quelle der Standard-Goals: ./plausible-goals.mjs (SSOT). Ein '/'-Präfix im
 * --goals-Wert markiert ein Pageview-Goal, sonst Custom-Event-Goal.
 *
 * --remove ist der symmetrische Rollback zum INSERT (#1-Rule: kein irreversibler
 * Prod-Schreibvorgang ohne Rückweg). Er entfernt exakt dieselben Goals, die derselbe
 * Aufruf ohne --remove angelegt hätte — nicht mehr.
 */
import { fileURLToPath } from 'node:url';
import { CORE_GOALS, OPTIONAL_GOALS } from './plausible-goals.mjs';
import {
  DEFAULT_HOST, DEFAULT_KEY, PG_CONTAINER, sqlEscape, remoteQuery, remoteWrite,
} from './plausible-box.mjs';

// sqlEscape kommt aus plausible-box.mjs (SSOT) — hier re-exportiert, damit
// bestehende Importe (Test) unverändert weiterlaufen.
export { sqlEscape };

export function parseArgs(argv) {
  const args = { apply: false, optional: false, remove: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--apply') args.apply = true;
    else if (a === '--optional') args.optional = true;
    else if (a === '--remove') args.remove = true;
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

/** --goals-CSV in Goal-Objekte parsen ('/'-Präfix = Pageview-Goal). */
export function parseGoalList(csv) {
  return csv.split(',').map((raw) => {
    const value = raw.trim();
    return { type: value.startsWith('/') ? 'page' : 'event', value };
  }).filter((g) => g.value);
}

/** Spaltenname für den Goal-Typ (page → page_path, sonst event_name). */
function goalColumn(goal) {
  return goal.type === 'page' ? 'page_path' : 'event_name';
}

/**
 * Idempotentes INSERT für ein einzelnes Goal.
 * @param {string} domain
 * @param {{type:'event'|'page', value:string}} goal
 * @param {boolean} hasDisplayName – ob die goals-Tabelle eine display_name-Spalte hat
 */
export function goalInsertSql(domain, goal, hasDisplayName) {
  const col = goalColumn(goal);
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

/**
 * Idempotentes DELETE für ein einzelnes Goal (symmetrischer Rollback zu goalInsertSql).
 * Löscht nur das exakt benannte Goal dieser Site — trifft 0 Zeilen, wenn es fehlt.
 * @param {string} domain
 * @param {{type:'event'|'page', value:string}} goal
 */
export function goalDeleteSql(domain, goal) {
  const col = goalColumn(goal);
  const val = sqlEscape(goal.value);
  const d = sqlEscape(domain);
  return [
    `DELETE FROM goals`,
    `WHERE site_id IN (SELECT id FROM sites WHERE domain='${d}')`,
    `  AND ${col}='${val}';`,
  ].join('\n');
}

export function buildSql(domain, goals, hasDisplayName) {
  return ['BEGIN;', ...goals.map((g) => goalInsertSql(domain, g, hasDisplayName)), 'COMMIT;'].join('\n');
}

export function buildRemoveSql(domain, goals) {
  return ['BEGIN;', ...goals.map((g) => goalDeleteSql(domain, g)), 'COMMIT;'].join('\n');
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log('Usage: plausible-add-goals.mjs --domain <domain> [--apply] [--remove] [--optional] [--goals "a,b,/pfad"] [--host user@ip] [--key ~/.ssh/key]');
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
  if (!goals.length) die(`Keine Goals zu ${args.remove ? 'entfernen' : 'provisionieren'}.`);

  console.log(`ℹ️  Plausible-Goals ${args.remove ? 'ENTFERNEN aus' : 'für'} ${domain}  (Box ${host}, Container ${PG_CONTAINER})`);
  console.log(`    ${goals.length} Goal(s): ${goals.map((g) => (g.type === 'page' ? `page:${g.value}` : g.value)).join(', ')}`);

  if (!args.apply) {
    console.log('\n— DRY-RUN (nichts geschrieben). Mit --apply ausführen. —\n');
    if (args.remove) {
      console.log('SQL (idempotent — löscht nur vorhandene Goals):\n');
      console.log(buildRemoveSql(domain, goals));
    } else {
      console.log('SQL (idempotent, modernes CE-Schema mit display_name angenommen):\n');
      console.log(buildSql(domain, goals, true));
      console.log('\nℹ️  Bei --apply wird ZUERST geprüft, ob die Site existiert und ob die');
      console.log('    goals-Tabelle eine display_name-Spalte hat — die Spaltenliste passt sich an.');
    }
    return;
  }

  // 1. Site muss existieren (sonst leerer Schreibvorgang, aber wir wollen laut scheitern).
  let siteId = '';
  try {
    siteId = remoteQuery(`SELECT id FROM sites WHERE domain='${sqlEscape(domain)}'`, { host, key }).trim();
  } catch (e) {
    die(`Site-Abfrage fehlgeschlagen (SSH/psql): ${e.message}`);
  }
  if (!siteId) die(`Site '${domain}' existiert nicht in Plausible — erst plausible-add-site.mjs --apply ausführen.`);

  // 2. SQL bauen. INSERT braucht Schema-Introspektion (display_name?), DELETE nicht.
  let sql;
  let hasDisplayName = false;
  if (args.remove) {
    sql = buildRemoveSql(domain, goals);
  } else {
    try {
      const cols = remoteQuery(`SELECT column_name FROM information_schema.columns WHERE table_name='goals'`, { host, key });
      hasDisplayName = cols.split('\n').map((s) => s.trim()).includes('display_name');
    } catch (e) {
      die(`Schema-Introspektion fehlgeschlagen: ${e.message}`);
    }
    sql = buildSql(domain, goals, hasDisplayName);
  }

  // 3. Idempotentes INSERT/DELETE ausführen.
  try {
    remoteWrite(sql, { host, key });
  } catch (e) {
    die(`Goal-${args.remove ? 'DELETE' : 'INSERT'} fehlgeschlagen: ${e.message}`);
  }

  // 4. Verifikation.
  let count = '?';
  try {
    count = remoteQuery(`SELECT count(*) FROM goals g JOIN sites s ON g.site_id=s.id WHERE s.domain='${sqlEscape(domain)}'`, { host, key }).trim();
  } catch { /* Verifikation optional */ }
  if (args.remove) {
    console.log(`✓ Goals entfernt aus ${domain}. Verbleibende Goals gesamt: ${count}`);
  } else {
    console.log(`✓ Goals provisioniert für ${domain} (display_name-Spalte: ${hasDisplayName ? 'ja' : 'nein'}). Goals gesamt: ${count}`);
    console.log('→ In Plausible sind Goals rückwirkend — historische Events erscheinen sofort als Conversion.');
  }
}

// Nur ausführen, wenn direkt aufgerufen — nicht beim Import aus dem Test.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
