#!/usr/bin/env node
/**
 * glitchtip-add-project.mjs — legt ein GlitchTip-Projekt + DSN + Telegram-Alert an.
 *
 * Für BACKEND-SERVICES (Odoo, MCPs, Node/Python-Dienste) — NICHT für statische
 * Customer-Astro-Sites (die posten keine Server-Errors; siehe onboard-site-Skill).
 * Nutzt die Sentry-kompatible GlitchTip-REST-API (`/api/0/`). Org + Team `blitzsicht`
 * und der Telegram-Relay-Container existieren bereits — die Alert-Regel des neuen
 * Projekts zeigt auf dieselbe laufende Relay-URL (aus einem bestehenden Projekt gelesen).
 *
 * Idempotent: existiert das Projekt schon, wird sein DSN zurückgegeben; ein Alert
 * auf die Relay-URL wird nur angelegt, wenn noch keiner existiert.
 *
 * Default DRY-RUN. `--apply` schreibt.
 *
 *   node glitchtip-add-project.mjs --name siluri-mcp --platform python
 *   node glitchtip-add-project.mjs --name siluri-mcp --platform python --apply
 *
 * Letzte stdout-Zeile bei Erfolg: `DSN https://…@errors.blitzsicht.com/N`
 */
import { execFileSync } from 'node:child_process';

const BASE = 'https://errors.blitzsicht.com/api/0';
const ORG = 'blitzsicht';
const TEAM = 'blitzsicht';
const OP_ITEM = process.env.GLITCHTIP_OP_ITEM || 'glitchtip-blitischt-API'; // 1Password item, vault claude
const OP_VAULT = 'claude';
const DEFAULT_RELAY_FROM = 'siluri-de'; // bestehendes Projekt, dessen Alert-Relay-URL wir wiederverwenden
const ALERT_NAME = 'Telegram (Blitzsicht_bot)';

function parseArgs(argv) {
  const args = { apply: false, platform: 'python', relayFrom: DEFAULT_RELAY_FROM };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--apply') args.apply = true;
    else if (a === '--name') args.name = argv[++i];
    else if (a === '--platform') args.platform = argv[++i];
    else if (a === '--relay-from') args.relayFrom = argv[++i];
    else if (a === '--help' || a === '-h') args.help = true;
  }
  return args;
}

function die(msg) {
  console.error(`❌ ${msg}`);
  process.exit(1);
}

function getToken() {
  for (const field of ['credential', 'password']) {
    try {
      const v = execFileSync('op', ['item', 'get', OP_ITEM, '--vault', OP_VAULT, '--fields', field, '--reveal'], {
        encoding: 'utf8',
      }).trim();
      if (v) return v;
    } catch {
      /* nächstes Feld probieren */
    }
  }
  die(`GlitchTip-API-Token nicht lesbar (op item ${OP_ITEM}, vault ${OP_VAULT}).`);
}

async function api(token, method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { status: res.status, ok: res.ok, json };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log('Usage: glitchtip-add-project.mjs --name <slug> [--platform python|node|javascript-astro] [--relay-from <project>] [--apply]');
    process.exit(0);
  }
  const name = (args.name || '').trim();
  if (!name) die('--name <slug> ist Pflicht (Projektname, z.B. --name siluri-mcp).');
  if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) die(`Ungültiger Projekt-Slug: "${name}" (nur a-z0-9-).`);

  console.log(`ℹ️  GlitchTip-Projekt: ${name}  (org ${ORG}, platform ${args.platform})`);

  if (!args.apply) {
    console.log('\n— DRY-RUN (kein API-Call, nichts geschrieben). Mit --apply ausführen. —\n');
    console.log('geplante Calls:');
    console.log(`  1. GET  /projects/${ORG}/${args.relayFrom}/alerts/          → Relay-URL lesen`);
    console.log(`  2. GET  /projects/${ORG}/${name}/                           → existiert schon?`);
    console.log(`  3. POST /teams/${ORG}/${TEAM}/projects/  {name:"${name}",platform:"${args.platform}"}`);
    console.log(`  4. GET  /projects/${ORG}/${name}/keys/                      → DSN`);
    console.log(`  5. POST /projects/${ORG}/${name}/alerts/  {webhook → Relay}`);
    console.log('\n→ DSN (wird bei --apply ausgegeben)');
    return;
  }

  const token = getToken();

  // 1. Relay-URL aus einem bestehenden Projekt-Alert
  const relay = await api(token, 'GET', `/projects/${ORG}/${args.relayFrom}/alerts/`);
  if (!relay.ok) die(`Relay-Quelle nicht lesbar (GET alerts von ${args.relayFrom}): HTTP ${relay.status}`);
  const relayUrl = relay.json?.[0]?.alertRecipients?.find((r) => r.recipientType === 'webhook')?.url;
  if (!relayUrl) die(`Keine Webhook-Relay-URL im Projekt ${args.relayFrom} gefunden.`);

  // 2. Existiert das Projekt schon?
  const exists = await api(token, 'GET', `/projects/${ORG}/${name}/`);
  let projectSlug = name;
  if (exists.ok) {
    projectSlug = exists.json?.slug || name;
    console.log(`✓ Projekt existiert bereits: ${projectSlug}`);
  } else if (exists.status === 404) {
    const created = await api(token, 'POST', `/teams/${ORG}/${TEAM}/projects/`, { name, platform: args.platform });
    if (!created.ok) die(`Projekt anlegen fehlgeschlagen: HTTP ${created.status} ${JSON.stringify(created.json)}`);
    projectSlug = created.json?.slug || name;
    console.log(`✏️  Projekt angelegt: ${projectSlug}`);
  } else {
    die(`Unerwarteter Status bei Projekt-Check: HTTP ${exists.status}`);
  }

  // 3. DSN
  const keys = await api(token, 'GET', `/projects/${ORG}/${projectSlug}/keys/`);
  if (!keys.ok) die(`DSN-Keys nicht lesbar: HTTP ${keys.status}`);
  const dsn = keys.json?.[0]?.dsn?.public;
  if (!dsn) die('Kein DSN im keys-Response gefunden.');

  // 4. Alert-Regel (idempotent — nur wenn keiner auf die Relay-URL zeigt)
  const alerts = await api(token, 'GET', `/projects/${ORG}/${projectSlug}/alerts/`);
  const hasRelayAlert =
    alerts.ok && (alerts.json || []).some((al) => (al.alertRecipients || []).some((r) => r.url === relayUrl));
  if (hasRelayAlert) {
    console.log('✓ Telegram-Alert existiert bereits — kein Duplikat angelegt.');
  } else {
    const alert = await api(token, 'POST', `/projects/${ORG}/${projectSlug}/alerts/`, {
      name: ALERT_NAME,
      timespanMinutes: null,
      quantity: 1,
      uptime: false,
      alertRecipients: [{ recipientType: 'webhook', url: relayUrl, config: {}, tagsToAdd: [] }],
    });
    if (!alert.ok) die(`Alert-Regel anlegen fehlgeschlagen: HTTP ${alert.status} ${JSON.stringify(alert.json)}`);
    console.log('✏️  Telegram-Alert → Relay angelegt.');
  }

  console.log(`\nWiring: sentry_sdk.init(dsn="${dsn}", …)  bzw. Sentry.init({ dsn:"${dsn}" })`);
  console.log('→ DSN ' + dsn);
}

main().catch((e) => die(e.message));
