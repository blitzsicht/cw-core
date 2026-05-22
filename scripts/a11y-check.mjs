#!/usr/bin/env node
/**
 * @cw/core – A11y Checker (pa11y-ci)
 *
 * Startet einen lokalen http-server gegen dist/, ruft pa11y-ci gegen
 * .pa11yci.json auf, bricht den Server am Ende ab.
 *
 * Customer-Usage in package.json:
 *   "scripts": { "a11y": "node node_modules/@cw/core/scripts/a11y-check.mjs" }
 *
 * Voraussetzungen:
 *   - dist/ existiert (vorher `pnpm build` ausführen)
 *   - .pa11yci.json (oder .pa11yci) im Customer-Repo-Root mit URLs gegen http://localhost:8080
 *   - pa11y-ci + http-server als devDependencies installiert
 *
 * Exit-Codes:
 *   0  — alle Pages WCAG-2-AA-konform
 *   1+ — Errors gefunden (pa11y-ci-Exit-Code durchgereicht)
 *
 * Flags:
 *   --warn       — Errors als Warnings behandeln, Exit-Code immer 0
 *   --port=N     — Port (Default 8080)
 *   --config=p   — Pa11y-Config-Pfad (Default .pa11yci.json)
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
const warnMode = args.includes('--warn');
const port = Number(args.find((a) => a.startsWith('--port='))?.split('=')[1] ?? 8080);
const configPath = args.find((a) => a.startsWith('--config='))?.split('=')[1] ?? '.pa11yci.json';

const cwd = process.cwd();
const distDir = resolve(cwd, 'dist');
const configFile = resolve(cwd, configPath);

if (!existsSync(distDir)) {
  console.error(`[a11y] dist/ nicht gefunden — bitte vorher \`pnpm build\` ausführen.`);
  process.exit(2);
}
if (!existsSync(configFile)) {
  console.error(`[a11y] ${configPath} nicht gefunden im Repo-Root.`);
  process.exit(2);
}

console.log(`[a11y] Starte http-server gegen dist/ auf Port ${port} …`);

// http-server starten als Background-Process
const server = spawn(
  'npx',
  ['--yes', 'http-server', 'dist', '-p', String(port), '-s', '--silent'],
  { cwd, stdio: ['ignore', 'ignore', 'pipe'] },
);

let serverFailed = false;
server.stderr?.on('data', (data) => {
  const msg = data.toString();
  if (msg.toLowerCase().includes('error')) {
    console.error(`[a11y] http-server: ${msg}`);
    serverFailed = true;
  }
});

// Kurz warten bis Server bereit ist
await new Promise((r) => setTimeout(r, 1500));

if (serverFailed) {
  console.error(`[a11y] http-server failed to start.`);
  server.kill('SIGTERM');
  process.exit(2);
}

console.log(`[a11y] pa11y-ci läuft gegen ${configPath} …`);

// pa11y-ci ausführen — Output an stdout/stderr durchreichen
const pa11y = spawn(
  'npx',
  ['--yes', 'pa11y-ci', '--config', configPath],
  { cwd, stdio: 'inherit' },
);

pa11y.on('exit', (code) => {
  console.log(`\n[a11y] pa11y-ci beendet mit Exit-Code ${code}`);
  server.kill('SIGTERM');
  if (warnMode && code !== 0) {
    console.warn(`[a11y] Errors gefunden, aber --warn aktiv → Exit 0`);
    process.exit(0);
  }
  process.exit(code ?? 0);
});
