#!/usr/bin/env node
/**
 * cw-core: Post-Deploy Form-Health Smoke-Test
 *
 * Curl-basierter Live-Check für Customer-Kontaktformular. Soll catchen wenn:
 *   - /kontakt/ nicht 200 liefert
 *   - <form> nicht im HTML
 *   - Turnstile-Widget (data-sitekey) nicht gerendert
 *   - Turnstile-Script nicht geladen
 *   - /api/contact crasht (5xx) statt sauber 4xx
 *
 * Usage (lokal):
 *   SITE_URL=https://soleno-energie.com node scripts/verify-form-health.mjs
 *
 * Usage (CI, package-installiert):
 *   SITE_URL=https://soleno-energie.com \
 *     node node_modules/@cw/core/scripts/verify-form-health.mjs
 *
 * Opt-out (bevorzugt — SSOT): contactForm: false in src/data/site-data.ts
 *   Das Skript liest dieses Feld automatisch aus dem Customer-Repo (CWD).
 *   Kein CI-Setup nötig — die Entscheidung lebt im Code, versioniert.
 *
 * Opt-out (Legacy/Override): SKIP_FORM_HEALTH=true (CI Repository-Variable)
 *   Bleibt für Repos die es bereits gesetzt haben (hausamlago, mika).
 *   In build-check.yml: smoke-test Job hat `if: vars.SKIP_FORM_HEALTH != 'true'`
 *
 * Exit-Codes:
 *   0 — alles ok (oder Opt-out via contactForm:false / SKIP_FORM_HEALTH=true)
 *   1 — mindestens ein Check failed
 *   2 — Konfig-Fehler (SITE_URL fehlt etc.)
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ─── Opt-out 1: SKIP_FORM_HEALTH=true (Legacy CI-Override) ─────────────────
// Bleibt für Repos die die gh-Variable bereits gesetzt haben.
// Feuert VOR dem SITE_URL-Check → kein Exit 2 bei fehlendem SITE_URL.
if (process.env.SKIP_FORM_HEALTH === 'true') {
  console.log('ℹ  SKIP_FORM_HEALTH=true gesetzt — Form-Health-Check übersprungen.');
  console.log('   Dieser Customer hat kein Kontaktformular (phone/whatsapp/cal-only).');
  console.log('   Bevorzugter Weg: contactForm: false in src/data/site-data.ts setzen,');
  console.log('   dann gh variable delete SKIP_FORM_HEALTH (kein CI-Setup mehr nötig).');
  console.log('');
  console.log('✅ Form-Health: skipped (SKIP_FORM_HEALTH=true)');
  process.exit(0);
}

// ─── Opt-out 2: contactForm: false in src/data/site-data.ts (SSOT) ──────────
// Liest aus dem Customer-Repo (CWD = Repo-Root wenn via CI oder lokal aufgerufen).
// Regex-Parse ist bewusst simpel: kein TypeScript-Compiler nötig, kein Netz-Zugriff.
// Fallback: wenn Datei fehlt oder Parse fehlschlägt → weiter mit HTTP-Check (fail-open).
(function checkContactFormFlag() {
  const candidates = [
    join(process.cwd(), 'src', 'data', 'site-data.ts'),
    join(process.cwd(), 'src', 'data', 'site-data.js'),
  ];
  for (const candidate of candidates) {
    let src;
    try {
      src = readFileSync(candidate, 'utf8');
    } catch {
      continue; // Datei nicht gefunden → nächste probieren
    }
    // Matcht: contactForm: false (mit optionalem Kommentar, Leerzeichen etc.)
    // Erkennt auch `contactForm : false` und `contactForm:false`.
    // Erkennt NICHT `contactForm: true` (bleibt aktiv) oder fehlendes Feld (bleibt aktiv).
    if (/\bcontactForm\s*:\s*false\b/.test(src)) {
      console.log(`ℹ  contactForm: false in ${candidate} — Form-Health-Check übersprungen.`);
      console.log('   Customer hat kein Kontaktformular (phone/whatsapp/cal-only).');
      console.log('   Feld auf true setzen oder entfernen sobald ein Formular ergänzt wird.');
      console.log('');
      console.log('✅ Form-Health: skipped (contactForm: false)');
      process.exit(0);
    }
    break; // Datei gefunden und gelesen — kein weiterer Fallback nötig
  }
})()

const url = process.env.SITE_URL;
if (!url) {
  console.error('FATAL: SITE_URL Environment-Variable fehlt');
  console.error('Beispiel: SITE_URL=https://customer.de node verify-form-health.mjs');
  process.exit(2);
}

// Vercel/CF brauchen manchmal 30-60s nach Push bis Live → optional warten
const waitMs = parseInt(process.env.WAIT_MS ?? '0', 10);
if (waitMs > 0) {
  console.log(`waiting ${waitMs}ms for deploy propagation...`);
  await new Promise((r) => setTimeout(r, waitMs));
}

const checks = [];

async function probe(path, opts = {}) {
  const r = await fetch(`${url}${path}`, {
    redirect: 'follow',
    headers: { 'User-Agent': 'cw-core-smoke-test/1.0' },
    ...opts,
  });
  const body = await r.text();
  return { status: r.status, body, headers: Object.fromEntries(r.headers) };
}

// Kontakt-Page abrufen
let contact;
try {
  contact = await probe('/kontakt/');
} catch (err) {
  console.error('FATAL: /kontakt/ unreachable:', err.message);
  process.exit(1);
}

checks.push({
  name: '/kontakt/ liefert 200',
  ok: contact.status === 200,
  detail: `status=${contact.status}`,
});

checks.push({
  name: '<form> mit action="/api/contact" gerendert',
  ok: /<form[^>]*action="\/api\/contact"/.test(contact.body),
  detail: 'data-action-Attribut sichtbar?',
});

checks.push({
  name: 'Turnstile-Widget (data-sitekey) gerendert',
  ok: /data-sitekey="0x4AAAA[A-Za-z0-9_-]+"/.test(contact.body),
  detail: 'PUBLIC_TURNSTILE_SITE_KEY zur Build-Zeit verfügbar?',
});

checks.push({
  name: 'Turnstile-Script geladen',
  ok: /challenges\.cloudflare\.com\/turnstile/.test(contact.body),
  detail: 'CSP erlaubt cf-Turnstile?',
});

checks.push({
  name: 'Submit-Button vorhanden',
  ok: /<button[^>]*type="submit"/.test(contact.body),
  detail: 'Form rendert komplett?',
});

// API-Endpoint nicht crashen lassen — leerer Body sollte sauberen 4xx liefern,
// nicht 5xx (= ENV-Var-Issue oder Code-Crash).
let apiResp;
try {
  apiResp = await probe('/api/contact', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
} catch (err) {
  apiResp = { status: 0, body: err.message };
}

checks.push({
  name: '/api/contact POST {} → 4xx (nicht 5xx)',
  ok: apiResp.status >= 400 && apiResp.status < 500,
  detail: `status=${apiResp.status} body=${apiResp.body?.slice?.(0, 80) ?? ''}`,
});

// Output
let failed = 0;
for (const c of checks) {
  console.log(`${c.ok ? '✓' : '✗'} ${c.name}`);
  if (!c.ok) {
    console.log(`    ↳ ${c.detail}`);
    failed++;
  }
}

console.log('');
console.log(`${checks.length - failed}/${checks.length} checks passed (${url})`);

if (failed > 0) {
  console.error(`\n❌ Form-Health-Check FAILED — ${failed} issue(s) on ${url}/kontakt/`);
  process.exit(1);
}
console.log('\n✅ Form-Health OK');
