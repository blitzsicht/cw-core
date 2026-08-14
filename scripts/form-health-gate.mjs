#!/usr/bin/env node
/**
 * cw-core: Form-Health-Gate — Vorschalt-Schritt für den smoke-test-Job
 *
 * Hintergrund (siluri/blitzsicht-ops#661): der smoke-test-Job in
 * build-check.yml hatte bislang ein `if: vars.PRODUCTION_URL != ''` auf
 * Job-Ebene. Fehlte die Variable, wurde der Job komplett übersprungen —
 * conclusion=skipped, kein Fehlschlag. `gh pr checks` exitet dabei 0 und
 * "smoke-test  skipping" steht neben lauter "pass".
 *
 * Eigene Messung am 13.08.2026 über alle 24 `customer-*`-Repos
 * (scripts/audit-form-health-coverage.sh): drei Repos mit customer.yml
 * `type: active` — donau-profi, mika-elektrotechnik, zink-baeckerei — haben
 * keine PRODUCTION_URL. Ihr jeweils letzter main-Lauf steht auf workflow
 * `success` bei `smoke-test conclusion=skipped`; der Check lief dort nie,
 * ohne je rot zu werden.
 *
 * Dieses Skript läuft jetzt als ERSTER Schritt IM Job (der Job selbst hat
 * kein `if:` mehr außer dem main-Branch-Gate) und entscheidet:
 *
 *   - SKIP_FORM_HEALTH=true         → bewusster, sichtbarer Opt-out. exit 0.
 *   - PRODUCTION_URL gesetzt        → Smoke-Test läuft normal. exit 0.
 *   - PRODUCTION_URL fehlt UND
 *       customer.yml: type: active  → FEHLSCHLAG (nicht skip). exit 1.
 *   - PRODUCTION_URL fehlt, Typ
 *       != active (oder unbekannt)  → weiterhin harmloser Skip. exit 0.
 *       (Rückwärtskompatibel für Repos ohne customer.yml oder mit
 *       prospect/paused/archived — dort ist ein fehlender Form-Health-Check
 *       kein Vorfall.)
 *
 * Schreibt `run_smoke=true|false` nach $GITHUB_OUTPUT (falls gesetzt), damit
 * die nachfolgenden Steps im Workflow per `if: steps.gate.outputs.run_smoke
 * == 'true'` bedingt laufen — der JOB selbst bleibt dabei sichtbar
 * (success/failure), nur einzelne Steps werden übersprungen.
 *
 * customer.yml wird aus dem CWD gelesen (= Root des gecheckten Customer-Repos
 * in CI). Schema + Type-Semantik: siehe
 * orchestration/scripts/customer_meta.sh (prospect|active|paused|archived).
 * Fehlt die Datei oder ist `type` nicht lesbar: fail-open (type=unknown,
 * behandelt wie "nicht active") — kein neuer Zwangs-customer.yml für Repos,
 * die noch keins haben.
 *
 * Exit-Codes:
 *   0 — Gate hat entschieden (Smoke-Test läuft ODER legitimer Skip)
 *   1 — Gate blockt: type: active ohne PRODUCTION_URL und ohne Opt-out
 *
 * Usage (lokal):
 *   PRODUCTION_URL=https://x.de SKIP_FORM_HEALTH= node scripts/form-health-gate.mjs
 */

import { readFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';

function readCustomerType(cwd) {
  const path = join(cwd, 'customer.yml');
  let src;
  try {
    src = readFileSync(path, 'utf8');
  } catch {
    return { type: 'unknown', found: false };
  }
  // Bewusst simpler Top-Level-Match statt YAML-Parser (keine neue Dependency
  // nötig — dieselbe Wahl wie verify-form-health.mjs für contactForm).
  // Nur Spalte 0 matcht, damit `contacts:\n  type: ...` (falls es sowas mal
  // gäbe) nicht fälschlich als Top-Level-Typ gelesen wird.
  const m = /^type:\s*"?'?([A-Za-z_-]+)"?'?\s*(#.*)?$/m.exec(src);
  if (!m) return { type: 'unknown', found: true };
  return { type: m[1], found: true };
}

function writeOutput(key, value) {
  const outFile = process.env.GITHUB_OUTPUT;
  if (!outFile) return; // lokaler Lauf ohne CI-Kontext — kein Fehler
  try {
    appendFileSync(outFile, `${key}=${value}\n`, 'utf8');
  } catch (err) {
    console.error(`WARN: konnte $GITHUB_OUTPUT nicht schreiben: ${err.message}`);
  }
}

function main() {
  const skip = process.env.SKIP_FORM_HEALTH ?? '';
  const url = process.env.PRODUCTION_URL ?? '';
  const { type, found } = readCustomerType(process.cwd());

  console.log(`customer.yml gefunden: ${found ? 'ja' : 'nein'}`);
  console.log(`customer.yml:type = ${type}`);
  console.log(`PRODUCTION_URL gesetzt: ${url !== '' ? 'ja' : 'nein'}`);
  console.log(`SKIP_FORM_HEALTH = ${skip === '' ? '(leer)' : skip}`);
  console.log('');

  if (skip === 'true') {
    console.log('✅ Form-Health-Gate: bewusster Opt-out (SKIP_FORM_HEALTH=true).');
    console.log('   Sichtbar als success, nicht als skipped — begründet über die Variable.');
    writeOutput('run_smoke', 'false');
    process.exit(0);
  }

  if (url !== '') {
    console.log('✅ Form-Health-Gate: PRODUCTION_URL gesetzt — Smoke-Test läuft.');
    writeOutput('run_smoke', 'true');
    process.exit(0);
  }

  if (type === 'active') {
    console.error('::error::Form-Health-Gate: PRODUCTION_URL fehlt, customer.yml meldet');
    console.error('::error::type: active — der Form-Health-Check kann NICHT laufen und wird');
    console.error('::error::deshalb als FEHLGESCHLAGEN markiert (nicht mehr stillschweigend');
    console.error('::error::übersprungen, siluri/blitzsicht-ops#661). Beheben mit:');
    console.error('::error::  gh variable set PRODUCTION_URL <https://domain> -R <repo>');
    console.error('::error::Bewusstes Abschalten (mit Begründung) stattdessen über:');
    console.error('::error::  gh variable set SKIP_FORM_HEALTH true -R <repo>');
    writeOutput('run_smoke', 'false');
    process.exit(1);
  }

  console.log(`ℹ  Form-Health-Gate: PRODUCTION_URL fehlt, customer.yml:type=${type} (nicht`);
  console.log('   "active") — Check bleibt übersprungen. Kein Vorfall.');
  writeOutput('run_smoke', 'false');
  process.exit(0);
}

main();
