#!/usr/bin/env node
/**
 * CI-Guard: kein totes Kontaktformular ausliefern.
 *
 * Symptom-Klasse (Vorfall 2026-06-10, cluster-weit): `kontakt.astro` postet via
 * `ContactForm actionUrl="/api/contact"`, aber `src/pages/api/contact.ts` fehlt im
 * Customer-Repo → Vercel liefert 404 → Formular still tot (keine Leads, keine Exception).
 *
 * Dieser Guard scannt src/pages/ nach einem Formular, das an `/api/contact` postet,
 * und verlangt dann eine vorhandene API-Route-Datei. Fehlt sie → **exit 1** (CI rot
 * VOR Deploy). Läuft als build-check.yml-Step: `node node_modules/@cw/core/scripts/validate-form-backend.mjs`.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

const root = process.argv[2] || process.cwd();
const pagesDir = join(root, 'src', 'pages');
if (!existsSync(pagesDir)) {
  console.log('validate-form-backend: kein src/pages — skip.');
  process.exit(0);
}

/** Alle Dateien unter dir rekursiv. @param {string} dir @returns {string[]} */
function walk(dir) {
  /** @type {string[]} */
  const out = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

const SOURCE_EXT = new Set(['.astro', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.md', '.mdx']);
const files = walk(pagesDir).filter((f) => SOURCE_EXT.has(extname(f)));

// Seiten, die an /api/contact posten (ContactForm actionUrl o. form action).
const postsToApiContact = files.filter((f) => {
  const src = readFileSync(f, 'utf-8');
  return /actionUrl\s*=\s*["'`]\/api\/contact["'`]/.test(src) ||
    /action\s*=\s*["'`]\/api\/contact["'`]/.test(src);
});

if (postsToApiContact.length === 0) {
  console.log('validate-form-backend: kein Formular postet an /api/contact — skip.');
  process.exit(0);
}

// Route-Datei muss existieren. Customer-Sites sind output:'static' + Vercel Functions
// unter ROOT /api/ — daher dort prüfen; src/pages/api/ (Astro-Endpoint) als Fallback.
const routeExists = ['contact.ts', 'contact.js', 'contact.mjs'].some((f) =>
  existsSync(join(root, 'api', f)) || existsSync(join(root, 'src', 'pages', 'api', f)),
);

if (!routeExists) {
  console.error('❌ Kontaktformular postet an /api/contact, aber /api/contact.ts FEHLT.');
  console.error('   → Vercel liefert 404, das Formular ist still tot (keine Leads).');
  for (const f of postsToApiContact) console.error(`   betroffen: ${f.replace(root + '/', '')}`);
  console.error('\n   Fix: ROOT /api/contact.ts anlegen (Vercel Function), z. B.:');
  console.error("     import { createContactHandler } from '@cw/core/api/contact-handler';");
  console.error("     export default createContactHandler({ allowedOrigins: ['https://<domain>', 'https://www.<domain>'], fromName: '<Firma>', subject: '<Betreff>' });");
  console.error('   + Vercel-Env: RESEND_API_KEY, CONTACT_EMAIL (Turnstile optional).');
  process.exit(1);
}

// Origin-Drift-Guard (#1-Rule, Vorfall zink 2026-06-10): die allowedOrigins der Route
// MÜSSEN die Serving-Domain enthalten — sonst lehnt der Origin-Check echte Nutzer mit
// 403 'Forbidden origin' ab (totes Formular). zink zeigte nach Domain-Migration noch auf
// die alte Domain. www-tolerant.
function resolveSiteHost(dir) {
  for (const f of ['astro.config.ts', 'astro.config.mjs', 'astro.config.js']) {
    const p = join(dir, f);
    if (existsSync(p)) {
      const m = readFileSync(p, 'utf-8').match(/site:\s*['"]https?:\/\/([^'"/]+)/);
      if (m) return m[1].replace(/^www\./, '');
    }
  }
  const sd = join(dir, 'src/data/site-data.ts');
  if (existsSync(sd)) {
    const m = readFileSync(sd, 'utf-8').match(/url:\s*['"]https?:\/\/([^'"/]+)/);
    if (m) return m[1].replace(/^www\./, '');
  }
  return null;
}

const routeFile = ['api/contact.ts', 'api/contact.js', 'api/contact.mjs', 'src/pages/api/contact.ts']
  .map((f) => join(root, f)).find((p) => existsSync(p));
const siteHost = resolveSiteHost(root);
if (routeFile && siteHost) {
  const routeSrc = readFileSync(routeFile, 'utf-8');
  if (/allowedOrigins\s*:/.test(routeSrc)) {
    const hosts = [...routeSrc.matchAll(/https?:\/\/([^'"\s,\]]+)/g)].map((m) => m[1].replace(/^www\./, ''));
    if (!hosts.includes(siteHost)) {
      console.error(`❌ allowedOrigins in ${routeFile.replace(root + '/', '')} enthält die Serving-Domain '${siteHost}' NICHT.`);
      console.error("   → Origin-Check lehnt echte Nutzer mit 403 'Forbidden origin' ab (totes Formular).");
      console.error(`   gefundene Origins: ${hosts.join(', ') || '(keine)'}`);
      console.error(`   Fix: allowedOrigins auf ['https://${siteHost}', 'https://www.${siteHost}'] setzen.`);
      process.exit(1);
    }
  }
}

// Empfaenger-Guard (Vorfall zink-baeckerei 2026-07-17): das Formular war technisch
// intakt, aber CONTACT_EMAIL stand auf servus@blitzsicht.com — jeder Lead landete bei
// Blitzsicht statt beim Kunden, ueber einen Monat lang, ohne Fehlermeldung. Ursache war
// eine Copy-Paste-Zeile im alten Onboarding-Howto (`echo "servus@blitzsicht.com" | …`),
// die zusaetzlich einen Trailing-Newline in den Wert schrieb.
//
// CONTACT_EMAIL existiert nur im Vercel-Build — GitHub-Actions kennt die Env nicht.
// Deshalb: ohne Env lokal/in CI ueberspringen, im Production-Build ist sie Pflicht.
//
// Warum `VERCEL_ENV === 'production'` und nicht `VERCEL === '1'`: `VERCEL` ist in JEDEM
// Vercel-Build gesetzt, auch im Preview. `CONTACT_EMAIL` steht aber in vielen Projekten nur
// auf dem production-Target — mit der VERCEL-Pruefung haette dieser Guard ab sofort jeden
// PR-Preview-Build gekillt (aufgefallen im Plan-Review, bevor der Rollout das neunfach
// multipliziert hat). Im Preview bleibt es deshalb bei einer Warnung.
// Damit dieser Teil ueberhaupt greift, muss das Skript im `prebuild` der Customer-Repos
// haengen, nicht nur in build-check.yml.
const rawRecipient = process.env.CONTACT_EMAIL;
const onProdBuild = process.env.VERCEL_ENV === 'production';
const onPreviewBuild = process.env.VERCEL === '1' && !onProdBuild;

if (rawRecipient === undefined) {
  if (onProdBuild) {
    console.error('❌ CONTACT_EMAIL ist im Production-Build nicht gesetzt, obwohl ein Formular an /api/contact postet.');
    console.error('   → Jeder Lead endet in einem 500 (nur der Telegram-Alarm rettet ihn).');
    console.error("   Fix: printf '%s' 'info@<kunden-domain>' | vercel env add CONTACT_EMAIL production");
    process.exit(1);
  }
  if (onPreviewBuild) {
    // Kein Hard-Fail: ein fehlender Preview-Wert darf keinen PR blockieren. Das Formular
    // wuerde in dieser Preview aber zur Laufzeit 500 liefern — deshalb sichtbar warnen.
    console.warn('⚠️  CONTACT_EMAIL fehlt im Preview-Build — das Formular liefert in dieser Preview 500.');
    console.warn("   Fix: printf '%s' 'info@<kunden-domain>' | vercel env add CONTACT_EMAIL preview");
  } else {
    console.log('ℹ️  CONTACT_EMAIL nicht in der Env — Empfänger-Check übersprungen (greift im Production-Build).');
  }
} else {
  if (rawRecipient !== rawRecipient.trim()) {
    console.error(`❌ CONTACT_EMAIL enthält führenden/abschließenden Whitespace: ${JSON.stringify(rawRecipient)}`);
    console.error('   → Typisches `echo`-Artefakt beim Setzen der Env-Var.');
    console.error("   Fix: mit printf '%s' neu setzen (echo hängt ein \\n an).");
    process.exit(1);
  }

  const recipients = rawRecipient.split(',').map((s) => s.trim()).filter(Boolean);
  if (recipients.length === 0) {
    console.error('❌ CONTACT_EMAIL ist leer.');
    process.exit(1);
  }

  // Fremd-Empfaenger: eine Kundenseite darf ihre Leads nicht an Blitzsicht schicken.
  // Auf blitzsicht.com selbst ist genau das korrekt — der Host-Vergleich regelt das
  // ohne separate Whitelist. Ist die Domain nicht ermittelbar, fail-open.
  if (siteHost && siteHost !== 'blitzsicht.com') {
    const foreign = recipients.filter((a) => /@blitzsicht\.com$/i.test(a));
    if (foreign.length > 0) {
      console.error(`❌ CONTACT_EMAIL zeigt auf Blitzsicht (${foreign.join(', ')}), die Seite ist aber '${siteHost}'.`);
      console.error('   → Der Kunde bekommt seine Leads nie. Genau so lief der Vorfall zink-baeckerei 2026-07-17.');
      console.error(`   Fix: printf '%s' 'info@${siteHost}' | vercel env add CONTACT_EMAIL production`);
      console.error('   Blitzsicht-Mitschnitt gehört stattdessen in LEAD_BCC_EMAIL (Shared Env).');
      process.exit(1);
    }
  }
  console.log(`✓ Empfänger-Check: CONTACT_EMAIL ok (${recipients.length} Adresse[n], Domain '${siteHost || 'unbekannt'}').`);
}

console.log(`✓ validate-form-backend: /api/contact-Route + allowedOrigins ok (${postsToApiContact.length} Formular-Seite[n]).`);
