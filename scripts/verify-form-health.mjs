#!/usr/bin/env node
/**
 * cw-core: Post-Deploy Form-Health Smoke-Test
 *
 * Curl-basierter Live-Check für Customer-Kontaktformular. Soll catchen wenn:
 *   - die Formular-Seite (FORM_PAGE_PATH, Default /kontakt/) nicht 200 liefert
 *   - <form> nicht im HTML
 *   - Turnstile-Widget (data-sitekey) nicht gerendert  ← seit 18.08.2026 FAIL, vorher nur ℹ️
 *   - Turnstile-Script nicht geladen
 *   - /api/contact crasht (5xx) statt sauber 4xx
 *
 * Optional: FORM_PAGE_PATH — Pfad der Seite mit dem Formular (Default '/kontakt/').
 * One-Pager mit Formular auf der Startseite setzen FORM_PAGE_PATH=/ (z.B. platzfrei).
 *
 * Opt-outs (gestaffelt, s. Kommentare unten):
 *   (a) SKIP_FORM_HEALTH=true          — ganzer Check aus (Repository-Variable)
 *   (b) contactForm: false             — ganzer Check aus (Customer ohne Formular)
 *   (c) turnstile: false               — nur der Turnstile-Check aus, Rest läuft
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

// --- Opt-out (a): SKIP_FORM_HEALTH=true env-var ---
// Wird als Repository-Variable in GitHub Actions gesetzt (gh variable set SKIP_FORM_HEALTH --body true).
// Customer ohne Kontaktformular (phone-/whatsapp-only) können den ganzen Script überspringen.
if (process.env.SKIP_FORM_HEALTH === 'true') {
  console.log('ℹ️  SKIP_FORM_HEALTH=true gesetzt → Form-Health-Check übersprungen.');
  console.log('✅ Form-Health: skipped (via SKIP_FORM_HEALTH env)');
  process.exit(0);
}

// --- Opt-out (b): contactForm: false in src/data/site-data.ts ---
// Ermöglicht form-lose Customer via Code-Konfiguration statt Repository-Variable.
// Fail-open: wenn die Datei nicht existiert oder nicht lesbar ist, wird weitergemacht.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
let siteData = '';
try {
  const siteDataPath = resolve(process.cwd(), 'src/data/site-data.ts');
  siteData = readFileSync(siteDataPath, 'utf-8');
  if (/\bcontactForm\s*:\s*false\b/.test(siteData)) {
    console.log('ℹ️  contactForm: false in src/data/site-data.ts → Form-Health-Check übersprungen.');
    console.log('✅ Form-Health: skipped (via contactForm: false in site-data.ts)');
    process.exit(0);
  }
} catch {
  // Datei nicht gefunden oder nicht lesbar → fail-open, weiterprüfen (siteData bleibt '')
}

// --- Opt-out (c): turnstile: false in src/data/site-data.ts ---
// NUR für den Turnstile-Teilcheck, nicht für den ganzen Skript-Lauf. Für einen Customer,
// der bewusst ohne Bot-Schutz fährt — muss dann aber als Entscheidung IM REPO stehen,
// nicht als stilles Fehlen einer Env-Var (genau das war der Blind-Spot, s. Turnstile-Block).
//
// Verhältnis zu (a) und (b) — die drei Opt-outs sind gestaffelt, nicht konkurrierend:
//   (a) SKIP_FORM_HEALTH=true  → überspringt ALLES, greift zuerst (Repository-Variable)
//   (b) contactForm: false     → überspringt ALLES (Customer ohne Formular)
//   (c) turnstile: false       → überspringt NUR den Turnstile-Check, Rest läuft weiter
// Wer (a) oder (b) gesetzt hat, kommt hier gar nicht an — (c) ist damit konfliktfrei.
const turnstileOptOut = /\bturnstile\s*:\s*false\b/.test(siteData);

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

// Formular-Seite abrufen (Default /kontakt/; One-Pager setzen FORM_PAGE_PATH=/)
const formPagePath = process.env.FORM_PAGE_PATH || '/kontakt/';
let contact;
try {
  contact = await probe(formPagePath);
} catch (err) {
  console.error(`FATAL: ${formPagePath} unreachable:`, err.message);
  process.exit(1);
}

// Die Formular-Seite muss zumindest 200 liefern — ohne erreichbare Seite kein Form-Check sinnvoll
if (contact.status !== 200) {
  console.error(`FATAL: ${formPagePath} status=${contact.status} (erwartet 200)`);
  process.exit(1);
}

// Auto-Skip für form-lose Customer (phone-/whatsapp-only Setups):
// Wenn /kontakt/ kein <form>-Element enthält, ist die Site by-design ohne Kontaktformular.
// Beispiel-Customer: hausamlago (Markus Eule: nur Phone + WhatsApp).
// Override per SITE_URL trotzdem testen via FORCE_FORM_CHECK=1.
const hasFormElement = /<form\b/i.test(contact.body);
if (!hasFormElement && process.env.FORCE_FORM_CHECK !== '1') {
  console.log(`ℹ️  ${formPagePath} enthält kein <form>-Element auf ${url}`);
  console.log('   → Form-Health-Check übersprungen (Customer hat vermutlich phone-/whatsapp-only Setup).');
  console.log('   → Override via FORCE_FORM_CHECK=1 wenn das ein Bug ist.');
  console.log('');
  console.log('✅ Form-Health: skipped (no form on page)');
  process.exit(0);
}

checks.push({
  name: `${formPagePath} liefert 200`,
  ok: contact.status === 200,
  detail: `status=${contact.status}`,
});

checks.push({
  name: '<form> mit action="/api/contact" gerendert',
  ok: /<form[^>]*action="\/api\/contact"/.test(contact.body),
  detail: 'data-action-Attribut sichtbar?',
});

// Turnstile ist PFLICHT, sobald ein Formular gerendert wird.
//
// Bis 18.08.2026 galt hier „fehlt das Widget, ist das ein valider Zustand" — der Check
// meldete das fehlende Turnstile als ℹ️-Zeile und lief mit 5/5 statt 6/6 grün durch.
// Damit konnte er bei genau den Customern nie rot werden, bei denen der Bot-Schutz fehlte:
// gemessen am 18.08.2026 rendern elektro-mika.com und donau-profi.de 0× `cf-turnstile`,
// beide bekamen Fake-Leads über das Formular, beide Läufe waren grün (exit 0).
// Ein Check, der beim Defekt nicht rot wird, ist kein Nachweis — deshalb jetzt FAIL.
//
// Opt-out ist bewusst NUR im Repo möglich (`turnstile: false` in site-data.ts, s. oben):
// eine fehlende Env-Var soll nie wieder wie eine Entscheidung aussehen.
const hasTurnstile = /data-sitekey="0x4AAAA[A-Za-z0-9_-]+"/.test(contact.body);
if (turnstileOptOut) {
  console.log('ℹ️  turnstile: false in src/data/site-data.ts → Turnstile-Check übersprungen (bewusster Opt-out).');
} else if (hasTurnstile) {
  checks.push({
    name: 'Turnstile-Script geladen (Widget ist gerendert)',
    ok: /challenges\.cloudflare\.com\/turnstile/.test(contact.body),
    detail: 'CSP erlaubt cf-Turnstile?',
  });
} else {
  checks.push({
    name: 'Turnstile-Widget gerendert (Bot-Schutz aktiv)',
    ok: false,
    detail: 'kein data-sitekey im HTML — PUBLIC_TURNSTILE_SITE_KEY in der Vercel-Env gesetzt und neu deployt? '
      + 'Bewusst ohne Bot-Schutz: `turnstile: false` in src/data/site-data.ts eintragen.',
  });
}

checks.push({
  name: 'Submit-Button vorhanden',
  ok: /<button[^>]*type="submit"/.test(contact.body),
  detail: 'Form rendert komplett?',
});

// API-Endpoint POST {} prüfen. Ein leerer Body sollte sauber abgelehnt werden (4xx
// Validierung). KRITISCH: 404 = Route fehlt = totes Formular (der 2026-06-10-Vorfall);
// 5xx = ENV-Var-Issue/Code-Crash. Beides muss FAIL sein.
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
  name: '/api/contact existiert (kein 404 — tote Route = totes Formular)',
  ok: apiResp.status !== 404 && apiResp.status !== 0,
  detail: `status=${apiResp.status} — 404/unerreichbar bedeutet: Route src/pages/api/contact.ts fehlt`,
});

checks.push({
  name: '/api/contact POST {} → kein 5xx (Env/Code ok)',
  ok: apiResp.status > 0 && apiResp.status < 500,
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
