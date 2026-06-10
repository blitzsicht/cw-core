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

console.log(`✓ validate-form-backend: /api/contact-Route + allowedOrigins ok (${postsToApiContact.length} Formular-Seite[n]).`);
