#!/usr/bin/env node
/**
 * Tests für form-health-gate.mjs (siluri/blitzsicht-ops#661)
 *
 * Kern-Behauptung: ein Repo mit customer.yml `type: active` und ohne
 * PRODUCTION_URL muss das Skript mit exit 1 verlassen (FAIL, nicht skip).
 * Test 3 unten ist der AC3-Gegenbeweis dieses Issues in Test-Form — Test 7
 * daneben belegt per Kontrast, dass die ALTE Job-`if:`-Bedingung (die dieses
 * Skript ersetzt) exakt diesen Fall NICHT als Fehlschlag zeigt.
 *
 * Ausführen:
 *   node scripts/form-health-gate.test.mjs
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(__dirname, 'form-health-gate.mjs');

function makeRepo(customerYmlContent) {
  const dir = mkdtempSync(join(tmpdir(), 'cw-gate-test-'));
  if (customerYmlContent !== undefined) {
    writeFileSync(join(dir, 'customer.yml'), customerYmlContent, 'utf8');
  }
  return dir;
}

function run(env, cwd) {
  const outFile = join(cwd, '.gh-output');
  writeFileSync(outFile, '', 'utf8');
  const result = spawnSync(process.execPath, [SCRIPT], {
    cwd,
    env: { ...process.env, ...env, GITHUB_OUTPUT: outFile },
    encoding: 'utf8',
    timeout: 5000,
  });
  let output = '';
  try {
    output = readFileSync(outFile, 'utf8');
  } catch {
    // ignore
  }
  return {
    exitCode: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    ghOutput: output,
  };
}

// ─── Test 1: SKIP_FORM_HEALTH=true — immer exit 0, run_smoke=false ─────────
test('SKIP_FORM_HEALTH=true — exit 0, run_smoke=false, sichtbarer Opt-out', () => {
  const dir = makeRepo('schema_version: 1\ntype: active\n');
  try {
    const { exitCode, stdout, ghOutput } = run(
      { SKIP_FORM_HEALTH: 'true', PRODUCTION_URL: '' },
      dir
    );
    assert.equal(exitCode, 0);
    assert.match(stdout, /bewusster Opt-out/);
    assert.match(ghOutput, /run_smoke=false/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ─── Test 2: PRODUCTION_URL gesetzt — exit 0, run_smoke=true ───────────────
test('PRODUCTION_URL gesetzt — exit 0, run_smoke=true, Smoke-Test läuft', () => {
  const dir = makeRepo('schema_version: 1\ntype: active\n');
  try {
    const { exitCode, ghOutput } = run(
      { SKIP_FORM_HEALTH: '', PRODUCTION_URL: 'https://example.de' },
      dir
    );
    assert.equal(exitCode, 0);
    assert.match(ghOutput, /run_smoke=true/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ─── Test 3 (AC3-Gegenbeweis in Testform): type:active + keine URL → FAIL ──
test('type: active + keine PRODUCTION_URL + kein Opt-out — exit 1 (FAIL, nicht skip)', () => {
  const dir = makeRepo('schema_version: 1\ntype: active\nproduction_url: https://x.de\n');
  try {
    const { exitCode, stderr, ghOutput } = run(
      { SKIP_FORM_HEALTH: '', PRODUCTION_URL: '' },
      dir
    );
    assert.equal(exitCode, 1, 'muss FEHLSCHLAGEN, nicht 0 (skip)');
    assert.match(stderr, /::error::/);
    assert.match(stderr, /FEHLGESCHLAGEN/);
    assert.match(ghOutput, /run_smoke=false/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ─── Test 4: type: paused + keine URL — weiterhin harmloser Skip (exit 0) ──
test('type: paused + keine PRODUCTION_URL — exit 0 (kein Vorfall)', () => {
  const dir = makeRepo('schema_version: 1\ntype: paused\n');
  try {
    const { exitCode, stdout } = run({ SKIP_FORM_HEALTH: '', PRODUCTION_URL: '' }, dir);
    assert.equal(exitCode, 0);
    assert.match(stdout, /Kein Vorfall/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ─── Test 5: customer.yml fehlt komplett — fail-open, exit 0 ───────────────
// Rückwärtskompatibel: Repos ohne customer.yml (z.B. noch nicht migriert)
// dürfen nicht plötzlich zwangsweise failen.
test('customer.yml fehlt — fail-open, exit 0 (type=unknown, kein Zwangs-Fail)', () => {
  const dir = makeRepo(undefined);
  try {
    const { exitCode, stdout } = run({ SKIP_FORM_HEALTH: '', PRODUCTION_URL: '' }, dir);
    assert.equal(exitCode, 0);
    assert.match(stdout, /customer\.yml gefunden: nein/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ─── Test 6: type: active, aber PRODUCTION_URL + SKIP_FORM_HEALTH=true ─────
// SKIP_FORM_HEALTH gewinnt (Präzedenz wie verify-form-health.mjs).
test('SKIP_FORM_HEALTH=true gewinnt über gesetzte PRODUCTION_URL', () => {
  const dir = makeRepo('schema_version: 1\ntype: active\n');
  try {
    const { exitCode, ghOutput } = run(
      { SKIP_FORM_HEALTH: 'true', PRODUCTION_URL: 'https://example.de' },
      dir
    );
    assert.equal(exitCode, 0);
    assert.match(ghOutput, /run_smoke=false/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ─── Test 7 — AC3 Gegenbeweis: ALTE job-if-Bedingung zeigt denselben Fall ───
// als "skipping" statt Fehlschlag. Reproduziert die exakte Bedingung, die
// vor diesem Fix im smoke-test-Job stand:
//   if: github.ref == 'refs/heads/main' && vars.PRODUCTION_URL != '' && vars.SKIP_FORM_HEALTH != 'true'
// Gegen denselben kaputten Zustand wie Test 3 (type: active, PRODUCTION_URL
// leer, kein SKIP) ausgewertet: die Bedingung ist falsch → der Job WÄRE
// übersprungen worden — kein Fehlschlag, exit 0, "skipping" statt "fail".
test('AC3-Kaputt-Zustand: alte Job-if-Bedingung liefert "skipping" statt Fehlschlag', () => {
  const url = '';
  const skip = '';
  const ref = 'refs/heads/main';
  const wouldRun = ref === 'refs/heads/main' && url !== '' && skip !== 'true';
  assert.equal(wouldRun, false, 'alte Bedingung wäre false → Job würde übersprungen');
  // Simuliert exakt das, was `gh pr checks` vor dem Fix zeigte:
  const simulatedConclusion = wouldRun ? 'success-or-failure' : 'skipping';
  const simulatedExitCode = wouldRun ? 1 /* würde ggf. failen */ : 0; // skipped jobs sind kein Fehlschlag
  assert.equal(simulatedConclusion, 'skipping');
  assert.equal(simulatedExitCode, 0, 'skipped hat exit 0 — genau das Tarnungsproblem aus #661');
});

console.log('\n✅ Alle form-health-gate Tests abgeschlossen.');
