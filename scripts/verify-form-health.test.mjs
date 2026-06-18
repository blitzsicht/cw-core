#!/usr/bin/env node
/**
 * Tests für verify-form-health.mjs — Opt-out-Logik
 *
 * Testet das Exit-Verhalten via Subprocess-Invoke (node:child_process).
 * Die Hauptlogik des Skripts greift auf das Netz zu, daher testen wir
 * nur die Opt-out-Pfade und Konfig-Fehler-Pfade ohne echte HTTP-Calls.
 *
 * Opt-out-Mechanismen (in Prioritäts-Reihenfolge):
 *   1. SKIP_FORM_HEALTH=true (Legacy CI-Override — bleibt für Bestandsrepos)
 *   2. contactForm: false in src/data/site-data.ts (SSOT — bevorzugter Weg)
 *
 * Ausführen:
 *   node scripts/verify-form-health.test.mjs
 *
 * Exit-Code:
 *   0 — alle Tests bestanden
 *   1 — mindestens ein Test fehlgeschlagen
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(__dirname, 'verify-form-health.mjs');

/**
 * Führt das Skript als Subprocess aus und gibt Exit-Code + Stdout + Stderr zurück.
 * cwd: optionales Arbeitsverzeichnis (für site-data-Tests)
 */
function run(env = {}, cwd = undefined) {
  const result = spawnSync(process.execPath, [SCRIPT], {
    cwd,
    env: { ...process.env, ...env },
    encoding: 'utf8',
    timeout: 5000,
  });
  return {
    exitCode: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

/**
 * Erstellt ein temporäres Fake-Repo-Verzeichnis mit src/data/site-data.ts.
 * Gibt den Pfad zurück. Aufrufer ist verantwortlich für cleanup().
 */
function makeFakeRepo(siteDataContent) {
  const dir = mkdtempSync(join(tmpdir(), 'cw-test-'));
  mkdirSync(join(dir, 'src', 'data'), { recursive: true });
  writeFileSync(join(dir, 'src', 'data', 'site-data.ts'), siteDataContent, 'utf8');
  return dir;
}

// ─── GRUPPE A: SKIP_FORM_HEALTH=true (Legacy CI-Override) ──────────────────

// ─── Test 1: SKIP_FORM_HEALTH=true → exit 0, keine HTTP-Calls ──────────────
test('SKIP_FORM_HEALTH=true — exit 0 ohne SITE_URL', () => {
  const { exitCode, stdout } = run({ SKIP_FORM_HEALTH: 'true', SITE_URL: '' });
  assert.equal(exitCode, 0, 'Exit-Code muss 0 sein wenn SKIP_FORM_HEALTH=true');
  assert.match(stdout, /SKIP_FORM_HEALTH=true/, 'Stdout muss Opt-out-Grund nennen');
  assert.match(stdout, /skipped/, 'Stdout muss "skipped" enthalten');
});

// ─── Test 2: SKIP_FORM_HEALTH=true trumpft fehlende SITE_URL ───────────────
test('SKIP_FORM_HEALTH=true — auch ohne SITE_URL erfolgreich (kein exit 2)', () => {
  const { exitCode, stderr } = run({ SKIP_FORM_HEALTH: 'true', SITE_URL: undefined });
  assert.equal(exitCode, 0, 'Opt-out muss vor SITE_URL-Check feuern');
  assert.doesNotMatch(stderr, /FATAL: SITE_URL/, 'Kein SITE_URL-Fehler bei Opt-out');
});

// ─── Test 3: SKIP_FORM_HEALTH nicht gesetzt → exit 2 wenn SITE_URL fehlt ───
test('kein Opt-out + fehlende SITE_URL → exit 2 (Konfig-Fehler)', () => {
  const { exitCode, stderr } = run({ SKIP_FORM_HEALTH: '', SITE_URL: '' });
  assert.equal(exitCode, 2, 'Exit-Code muss 2 sein wenn SITE_URL fehlt');
  assert.match(stderr, /SITE_URL/, 'Stderr muss SITE_URL-Fehler enthalten');
});

// ─── Test 4: SKIP_FORM_HEALTH=false → normaler Pfad (exit 2 wegen SITE_URL) ─
test('SKIP_FORM_HEALTH=false — Opt-out inaktiv, normaler Pfad läuft', () => {
  const { exitCode } = run({ SKIP_FORM_HEALTH: 'false', SITE_URL: '' });
  assert.equal(exitCode, 2, 'SKIP_FORM_HEALTH=false darf Opt-out nicht triggern');
});

// ─── Test 5: SKIP_FORM_HEALTH=TRUE (Großbuchstaben) → kein Opt-out ─────────
// Env vars sind case-sensitive; nur exakt "true" ist gültig.
test('SKIP_FORM_HEALTH=TRUE (Großbuchstaben) — kein Opt-out (case-sensitive)', () => {
  const { exitCode } = run({ SKIP_FORM_HEALTH: 'TRUE', SITE_URL: '' });
  assert.equal(exitCode, 2, 'Opt-out gilt nur für exakt lowercase "true"');
});

// ─── Test 6: SKIP_FORM_HEALTH=1 → kein Opt-out ─────────────────────────────
test('SKIP_FORM_HEALTH=1 — kein Opt-out (nur "true" ist gültig)', () => {
  const { exitCode } = run({ SKIP_FORM_HEALTH: '1', SITE_URL: '' });
  assert.equal(exitCode, 2, 'Numerischer Wert "1" löst Opt-out nicht aus');
});

// ─── Test 7: Negativ — Mit Formular-Customer (kein Opt-out, SITE_URL gesetzt) ─
// Wir können nicht live testen, aber wir prüfen dass das Skript versucht
// das Netz zu erreichen (exit 1 = fetch-Fehler, NICHT exit 0 skip)
test('kein Opt-out + ungültige SITE_URL → exit 1 (versucht Netz-Check)', () => {
  const { exitCode } = run({
    SKIP_FORM_HEALTH: '',
    SITE_URL: 'http://localhost:0',  // Port 0 = Connection refused
  });
  // fetch() schlägt fehl → exit 1 (nicht exit 0 skip, nicht exit 2 Konfig)
  assert.equal(exitCode, 1, 'Ohne Opt-out muss bei erreichbarer URL ein Netz-Check starten');
});

// ─── GRUPPE B: contactForm: false in site-data.ts (SSOT) ───────────────────

// ─── Test 8: contactForm: false → exit 0 (SSOT-Opt-out) ────────────────────
test('contactForm: false in site-data.ts — exit 0 (SSOT Skip)', () => {
  const dir = makeFakeRepo(`export const siteData = {\n  name: 'Test',\n  contactForm: false,\n};\n`);
  try {
    const { exitCode, stdout } = run({ SKIP_FORM_HEALTH: '', SITE_URL: '' }, dir);
    assert.equal(exitCode, 0, 'contactForm: false muss Exit 0 liefern');
    assert.match(stdout, /contactForm.*false/, 'Stdout muss contactForm: false erwähnen');
    assert.match(stdout, /skipped/, 'Stdout muss "skipped" enthalten');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ─── Test 9: contactForm: true → normaler Pfad (exit 2 wegen SITE_URL) ──────
test('contactForm: true in site-data.ts — kein Skip, normaler Pfad', () => {
  const dir = makeFakeRepo(`export const siteData = {\n  name: 'Test',\n  contactForm: true,\n};\n`);
  try {
    const { exitCode } = run({ SKIP_FORM_HEALTH: '', SITE_URL: '' }, dir);
    assert.equal(exitCode, 2, 'contactForm: true darf Opt-out nicht triggern');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ─── Test 10: contactForm fehlt → normaler Pfad (exit 2 wegen SITE_URL) ─────
test('kein contactForm-Feld in site-data.ts — kein Skip (Default aktiv)', () => {
  const dir = makeFakeRepo(`export const siteData = {\n  name: 'Test',\n  contact: { email: 'info@test.de' },\n};\n`);
  try {
    const { exitCode } = run({ SKIP_FORM_HEALTH: '', SITE_URL: '' }, dir);
    assert.equal(exitCode, 2, 'Fehlendes contactForm-Feld darf Opt-out nicht triggern');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ─── Test 11: contactForm: false mit Whitespace-Varianten ───────────────────
test('contactForm : false (extra Leerzeichen) — wird erkannt', () => {
  const dir = makeFakeRepo(`export const siteData = {\n  name: 'Test',\n  contactForm : false, // phone-only\n};\n`);
  try {
    const { exitCode, stdout } = run({ SKIP_FORM_HEALTH: '', SITE_URL: '' }, dir);
    assert.equal(exitCode, 0, 'contactForm : false mit Leerzeichen vor Doppelpunkt muss erkannt werden');
    assert.match(stdout, /skipped/, 'Muss geskippt werden');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ─── Test 12: site-data.ts fehlt → fail-open (exit 2 wegen SITE_URL) ────────
// Wenn keine site-data.ts vorhanden → Skript läuft normal weiter (fail-open).
// Schützt gegen false-positive-Skips bei fehlerhafter CWD.
test('site-data.ts fehlt — fail-open: normaler Pfad (exit 2 wegen SITE_URL)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cw-test-empty-'));
  try {
    const { exitCode } = run({ SKIP_FORM_HEALTH: '', SITE_URL: '' }, dir);
    assert.equal(exitCode, 2, 'Fehlendes site-data.ts muss fail-open → normaler Pfad');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ─── Test 13: SKIP_FORM_HEALTH=true gewinnt über contactForm:false ──────────
// Präzedenz: SKIP_FORM_HEALTH=true feuert zuerst (für Kompatibilität)
test('SKIP_FORM_HEALTH=true + contactForm:false — SKIP_FORM_HEALTH gewinnt (kein Unterschied im Exit)', () => {
  const dir = makeFakeRepo(`export const siteData = {\n  name: 'Test',\n  contactForm: false,\n};\n`);
  try {
    const { exitCode, stdout } = run({ SKIP_FORM_HEALTH: 'true', SITE_URL: '' }, dir);
    assert.equal(exitCode, 0, 'Bei beiden Opt-outs muss exit 0 kommen');
    assert.match(stdout, /SKIP_FORM_HEALTH=true/, 'SKIP_FORM_HEALTH=true Meldung zuerst');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

console.log('\n✅ Alle verify-form-health Tests abgeschlossen.');
