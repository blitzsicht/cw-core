#!/usr/bin/env node
/**
 * Tests für verify-form-health.mjs Opt-out-Logik
 *
 * Läuft via: node --test scripts/verify-form-health.test.mjs
 *
 * Testet:
 *   (a) SKIP_FORM_HEALTH=true → Exit 0, kein Netzwerk-Call
 *   (b) contactForm: false in site-data.ts → Exit 0, kein Netzwerk-Call
 *   (c) Negativ: Customer MIT Form, kein Opt-out → SITE_URL-FATAL (prüft normal)
 *   (d) Fail-open: site-data.ts fehlt → kein Crash, weiter bis SITE_URL-Check
 *   (e) contactForm: true (kein Opt-out) → weiter bis SITE_URL-Check
 *   (f) FORM_PAGE_PATH steuert die geprüfte Seite (One-Pager)
 *   (g) Formular MIT Turnstile-Widget → Exit 0
 *   (h) Formular OHNE Turnstile-Widget → Exit 1   ← neu 18.08.2026, vorher Exit 0
 *   (i) Formular ohne Widget + turnstile: false → Exit 0 (Opt-out im Repo)
 *
 * Gegenprobe zu (h)/(i), gefahren am 18.08.2026: dieselbe Testdatei gegen den
 * Skriptstand v0.121.2 ergibt 7 pass / 2 fail — genau (h) und (i) fallen um.
 * (g) bleibt in beiden Ständen grün, prüft also unverändertes Verhalten.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';

const SCRIPT = resolve(import.meta.dirname, 'verify-form-health.mjs');

/**
 * Führt das Script in einem isolierten Temp-Dir aus.
 * @param {object} opts
 * @param {Record<string,string>} [opts.env]    Extra-Envs (merged mit process.env)
 * @param {string|null} [opts.siteDataContent]   Inhalt von src/data/site-data.ts (null = Datei fehlt)
 * @returns {{ code: number, stdout: string, stderr: string }}
 */
function runScript({ env = {}, siteDataContent = null } = {}) {
  // Eigenes cwd erstellen damit site-data.ts isoliert liegt
  const cwd = join(tmpdir(), `cwcore-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(join(cwd, 'src', 'data'), { recursive: true });

  if (siteDataContent !== null) {
    writeFileSync(join(cwd, 'src', 'data', 'site-data.ts'), siteDataContent, 'utf-8');
  }

  let code = 0;
  let stdout = '';
  let stderr = '';

  try {
    const result = execFileSync(process.execPath, [SCRIPT], {
      env: { ...process.env, ...env },
      cwd,
      encoding: 'utf-8',
      timeout: 5000,
    });
    stdout = result;
  } catch (err) {
    code = err.status ?? 1;
    stdout = err.stdout ?? '';
    stderr = err.stderr ?? '';
  } finally {
    // Cleanup
    try { rmSync(cwd, { recursive: true, force: true }); } catch { /* ignore */ }
  }

  return { code, stdout, stderr };
}

// --- Test (a): SKIP_FORM_HEALTH=true ---
test('SKIP_FORM_HEALTH=true → Exit 0, skipped-Meldung', () => {
  const { code, stdout } = runScript({
    env: { SKIP_FORM_HEALTH: 'true', SITE_URL: '' },
    siteDataContent: null,
  });
  assert.equal(code, 0, 'Exit-Code muss 0 sein');
  assert.ok(stdout.includes('SKIP_FORM_HEALTH'), 'stdout muss SKIP_FORM_HEALTH erwähnen');
  assert.ok(stdout.includes('skipped'), 'stdout muss "skipped" enthalten');
});

// --- Test (b): contactForm: false in site-data.ts ---
test('contactForm: false in site-data.ts → Exit 0, skipped-Meldung', () => {
  const siteData = `
export const siteData = {
  name: 'Test Customer',
  contactForm: false,
  contact: { phone: '+49 123 456' },
};
`;
  const { code, stdout } = runScript({
    env: { SKIP_FORM_HEALTH: '', SITE_URL: '' },
    siteDataContent: siteData,
  });
  assert.equal(code, 0, 'Exit-Code muss 0 sein');
  assert.ok(stdout.includes('contactForm: false'), 'stdout muss contactForm erwähnen');
  assert.ok(stdout.includes('skipped'), 'stdout muss "skipped" enthalten');
});

// --- Test (c): Negativ — Customer MIT Form, kein Opt-out → prüft normal (SITE_URL fehlt → Exit 2) ---
test('Kein Opt-out + SITE_URL fehlt → Exit 2 (normaler Check-Pfad)', () => {
  const siteData = `
export const siteData = {
  name: 'Normal Customer',
  contactForm: true,
};
`;
  const { code, stderr } = runScript({
    env: { SKIP_FORM_HEALTH: '', SITE_URL: '' },
    siteDataContent: siteData,
  });
  // Ohne SITE_URL muss das Script mit Exit 2 enden (Konfig-Fehler)
  assert.equal(code, 2, 'Exit-Code muss 2 sein (SITE_URL fehlt)');
  assert.ok(stderr.includes('SITE_URL'), 'stderr muss SITE_URL-Fehler zeigen');
});

// --- Test (d): Fail-open — site-data.ts fehlt → kein Crash, weiter bis SITE_URL-Check (Exit 2) ---
test('site-data.ts fehlt → fail-open, kein Crash, Exit 2 (SITE_URL fehlt)', () => {
  const { code, stderr } = runScript({
    env: { SKIP_FORM_HEALTH: '', SITE_URL: '' },
    siteDataContent: null, // Datei wird nicht erstellt
  });
  // Soll nicht mit einem Node-Fehler crashen, sondern sauber weiter bis SITE_URL-Check
  assert.notEqual(code, undefined, 'Exit-Code muss definiert sein');
  assert.equal(code, 2, 'Exit-Code muss 2 sein (SITE_URL fehlt) — fail-open hat funktioniert');
});

// --- Test (e): contactForm: true → kein Opt-out, normaler Pfad (SITE_URL fehlt → Exit 2) ---
test('contactForm: true → kein Opt-out, Exit 2 (SITE_URL fehlt)', () => {
  const siteData = `
export const siteData = {
  name: 'Customer With Form',
  contactForm: true,
};
`;
  const { code } = runScript({
    env: { SKIP_FORM_HEALTH: '', SITE_URL: '' },
    siteDataContent: siteData,
  });
  assert.equal(code, 2, 'contactForm: true darf kein Skip auslösen, Exit 2 erwartet');
});

// --- Test (f): FORM_PAGE_PATH — One-Pager prüfen die Startseite statt /kontakt/ ---
// WICHTIG: async + execFile (nicht execFileSync) — der Test-Server läuft im selben
// Prozess; ein synchroner Child-Aufruf würde den Event-Loop blockieren und der
// Server könnte nie antworten (Deadlock bis Timeout).
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const execFileAsync = promisify(execFile);

/** Wie runScript, aber asynchron (für Tests mit lokalem HTTP-Server). */
async function runScriptAsync({ env = {}, siteDataContent = null } = {}) {
  const cwd = join(tmpdir(), `cwcore-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(join(cwd, 'src', 'data'), { recursive: true });
  if (siteDataContent !== null) {
    writeFileSync(join(cwd, 'src', 'data', 'site-data.ts'), siteDataContent, 'utf-8');
  }
  try {
    const { stdout } = await execFileAsync(process.execPath, [SCRIPT], {
      env: { ...process.env, ...env },
      cwd,
      encoding: 'utf-8',
      timeout: 10000,
    });
    return { code: 0, stdout, stderr: '' };
  } catch (err) {
    return { code: err.code ?? 1, stdout: err.stdout ?? '', stderr: err.stderr ?? '' };
  } finally {
    try { rmSync(cwd, { recursive: true, force: true }); } catch { /* ignore */ }
  }
}

test('FORM_PAGE_PATH steuert die geprüfte Seite (One-Pager-Support)', async () => {
  // Server: / liefert 200 ohne <form>, alles andere 404.
  const server = createServer((req, res) => {
    if (req.url === '/') {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end('<html><body><h1>One-Pager ohne Formular</h1></body></html>');
    } else {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('not found');
    }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = /** @type {import('node:net').AddressInfo} */ (server.address()).port;
  const SITE_URL = `http://127.0.0.1:${port}`;

  try {
    // Default (/kontakt/ → 404) → FATAL Exit 1, Meldung nennt /kontakt/
    const def = await runScriptAsync({ env: { SITE_URL, SKIP_FORM_HEALTH: '', FORM_PAGE_PATH: '' } });
    assert.equal(def.code, 1, 'ohne FORM_PAGE_PATH muss /kontakt/ geprüft werden (hier 404 → Exit 1)');
    assert.ok(def.stderr.includes('/kontakt/'), 'FATAL-Meldung muss /kontakt/ nennen');

    // FORM_PAGE_PATH=/ → Startseite 200, kein <form> → Auto-Skip Exit 0
    const rooted = await runScriptAsync({ env: { SITE_URL, SKIP_FORM_HEALTH: '', FORM_PAGE_PATH: '/' } });
    assert.equal(rooted.code, 0, 'FORM_PAGE_PATH=/ muss die Startseite prüfen (200, kein Form → Skip)');
    assert.ok(rooted.stdout.includes('skipped (no form on page)'), 'Auto-Skip-Meldung erwartet');
  } finally {
    await new Promise((r) => server.close(r));
  }
});

// --- Test (g/h/i): Turnstile ist Pflicht, sobald ein Formular gerendert wird ---
// Hintergrund: bis 18.08.2026 war ein fehlendes Turnstile-Widget ein ℹ️-Hinweis und der
// Lauf blieb grün (5/5 statt 6/6). Gemessen am 18.08.2026 lieferten elektro-mika.com und
// donau-profi.de — beide ohne Bot-Schutz, beide mit Fake-Leads — exit 0. Der Check konnte
// beim Defekt nicht rot werden. Diese drei Tests halten das Gegenteil fest.

/** Baut einen Test-Server, der /kontakt/ mit oder ohne Turnstile-Widget ausliefert. */
function formServer({ withTurnstile }) {
  const widget = withTurnstile
    ? '<div class="cf-turnstile" data-sitekey="0x4AAAAAADKJWXjyXwAEwXtd"></div>'
      + '<script src="https://challenges.cloudflare.com/turnstile/v0/api.js"></script>'
    : '';
  return createServer((req, res) => {
    const path = (req.url || '').split('?')[0];
    if (path === '/kontakt/' || path === '/kontakt') {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end(`<html><body><form action="/api/contact" method="post">${widget}`
        + '<button type="submit">Senden</button></form></body></html>');
    } else if (path === '/api/contact') {
      // Existiert (kein 404) und crasht nicht (kein 5xx) — 400 ist der saubere Fall.
      res.writeHead(400, { 'content-type': 'application/json' });
      res.end('{"ok":false}');
    } else {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('not found');
    }
  });
}

/** Startet den Server, ruft fn(SITE_URL) auf, schließt ihn zuverlässig wieder. */
async function withFormServer({ withTurnstile }, fn) {
  const server = formServer({ withTurnstile });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = /** @type {import('node:net').AddressInfo} */ (server.address()).port;
  try {
    return await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((r) => server.close(r));
  }
}

test('Formular MIT Turnstile-Widget → Exit 0 (Positivfall bleibt grün)', async () => {
  await withFormServer({ withTurnstile: true }, async (SITE_URL) => {
    const r = await runScriptAsync({ env: { SITE_URL, SKIP_FORM_HEALTH: '', FORM_PAGE_PATH: '' } });
    assert.equal(r.code, 0, 'mit gerendertem Widget muss der Check grün sein');
    assert.ok(r.stdout.includes('Turnstile-Script geladen'), 'Turnstile-Check muss gelaufen sein');
  });
});

test('Formular OHNE Turnstile-Widget → Exit 1 (der Fall, der vorher grün war)', async () => {
  await withFormServer({ withTurnstile: false }, async (SITE_URL) => {
    const r = await runScriptAsync({ env: { SITE_URL, SKIP_FORM_HEALTH: '', FORM_PAGE_PATH: '' } });
    assert.equal(r.code, 1, 'fehlendes Turnstile-Widget MUSS fehlschlagen (vorher: Exit 0)');
    assert.ok(
      r.stdout.includes('Turnstile-Widget gerendert'),
      'der fehlgeschlagene Check muss namentlich in der Ausgabe stehen',
    );
    assert.ok(
      r.stdout.includes('PUBLIC_TURNSTILE_SITE_KEY'),
      'die Meldung muss die fehlende Env-Var nennen, sonst ist sie nicht handlungsfähig',
    );
  });
});

test('Formular ohne Widget + turnstile: false → Exit 0 (bewusster Opt-out im Repo)', async () => {
  await withFormServer({ withTurnstile: false }, async (SITE_URL) => {
    const r = await runScriptAsync({
      env: { SITE_URL, SKIP_FORM_HEALTH: '', FORM_PAGE_PATH: '' },
      siteDataContent: 'export const siteData = {\n  contactForm: true,\n  turnstile: false,\n};\n',
    });
    assert.equal(r.code, 0, 'expliziter Opt-out im Repo muss den Turnstile-Check abschalten');
    assert.ok(r.stdout.includes('bewusster Opt-out'), 'Opt-out muss sichtbar geloggt werden');
    // Gegenprobe: der Rest des Checks läuft weiter, es ist kein Voll-Skip.
    assert.ok(r.stdout.includes('Submit-Button vorhanden'), 'übrige Checks müssen weiterlaufen');
    assert.ok(!r.stdout.includes('skipped (no form on page)'), 'kein Voll-Skip erwartet');
  });
});
