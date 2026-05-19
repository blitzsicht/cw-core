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
 * Exit-Codes:
 *   0 — alles ok
 *   1 — mindestens ein Check failed
 *   2 — Konfig-Fehler (SITE_URL fehlt etc.)
 */

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
