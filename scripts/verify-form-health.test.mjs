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
