/**
 * plausible-box.mjs — geteilte Primitive für den Zugriff auf die self-hosted
 * Plausible-CE-Box (blitzsicht-analytics, Hetzner hel1, via Coolify).
 *
 * Single Source of Truth für Box-Konstanten + SSH/psql-Zugriff. Vorher trugen
 * plausible-add-site.mjs und plausible-add-goals.mjs je eine WÖRTLICHE Kopie
 * derselben Konstanten und sshOpts/execFileSync-Logik (add-goals kommentierte
 * das selbst mit „identisch zu plausible-add-site.mjs"). Driftet der Container-
 * Hash oder die IP, müsste man das an drei Stellen fixen — #1-Rule-Verstoß.
 * Dieses Modul ist die eine Stelle; add-site, add-goals und plausible-reconcile
 * importieren daraus.
 *
 * Plausible CE hat keine Sites-/Goals-API (Enterprise-only) → alle Metadaten-
 * Operationen laufen als direktes SQL gegen die Postgres `plausible_db` über
 * `ssh → docker exec psql`. Event-Rohdaten liegen separat in ClickHouse
 * (`plausible_events_db`) und werden von diesem Modul NICHT angefasst.
 */
import { execFileSync } from 'node:child_process';
import { homedir } from 'node:os';

// ─── Box-Konstanten (self-hosted Plausible auf blitzsicht-analytics) ─────────
export const DEFAULT_HOST = 'root@100.96.26.82';
export const DEFAULT_KEY = `${homedir()}/.ssh/id_ed25519`;
export const PG_CONTAINER = 'plausible_db-x12kp2izcjwfau5vq90clcnn';
export const PG_DB = 'plausible_db';
export const TIMEZONE = 'Europe/Berlin';
export const TEAM_ID = 1; // teams-only Modell; site_memberships bleibt ungenutzt

export function sshOpts(key = DEFAULT_KEY) {
  return ['-i', key, '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15'];
}

/** Postgres-String-Literal escapen (einfache Quotes verdoppeln). */
export function sqlEscape(s) {
  return String(s).replace(/'/g, "''");
}

/**
 * Read-only Query gegen plausible_db. Gibt rohen stdout zurück.
 * `psql -tAc` = tuples-only, unaligned → maschinenlesbare Zeilen (Spalten per '|').
 * Das SQL wird in doppelte Quotes gesetzt und als ein SSH-Argument übergeben
 * (identisch zum bisherigen psqlQuery-Pattern) — SQL mit doppelten Quotes darin
 * ist nicht unterstützt (bei Bezeichnern in der Regel unnötig).
 */
export function remoteQuery(sql, { host = DEFAULT_HOST, key = DEFAULT_KEY } = {}) {
  const cmd = `docker exec ${PG_CONTAINER} psql -U postgres -d ${PG_DB} -tAc "${sql}"`;
  return execFileSync('ssh', [...sshOpts(key), host, cmd], { encoding: 'utf8' });
}

/**
 * Schreib-Transaktion gegen plausible_db (SQL via stdin, ON_ERROR_STOP=1).
 * Default reicht psql-Ausgabe an die Konsole durch. Für Aufrufer, die den Output
 * einfangen wollen (Tests), `stdio: ['pipe','pipe','pipe']` übergeben.
 */
export function remoteWrite(sql, { host = DEFAULT_HOST, key = DEFAULT_KEY, stdio = ['pipe', 'inherit', 'inherit'] } = {}) {
  const cmd = `docker exec -i ${PG_CONTAINER} psql -U postgres -d ${PG_DB} -v ON_ERROR_STOP=1`;
  return execFileSync('ssh', [...sshOpts(key), host, cmd], { input: sql, encoding: 'utf8', stdio });
}
