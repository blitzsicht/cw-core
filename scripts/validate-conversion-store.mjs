#!/usr/bin/env node
/**
 * CI-Guard: keine Ads-Site ausliefern, die ihre Conversions still verliert.
 *
 * Symptom-Klasse (digital-direkt 2026-07-30): `recordConversion()` in
 * `src/api/conversion-store.js` ist bewusst fail-open — es importiert den
 * Neon-Treiber dynamisch und schluckt jeden Fehler im try/catch, damit ein
 * Store-Ausfall nie die Formular-Antwort blockiert. Für Nicht-Ads-Sites ist das
 * richtig. Auf einer Ads-Site heißt es: **kein Eintrag, keine Fehlermeldung,
 * kein roter Build** — die Conversions kommen einfach nie an, und das fällt
 * erst auf, wenn jemand fragt, warum Google keine Erfolge meldet.
 *
 * Drei Bedingungen, die alle einzeln still scheitern (alle drei lagen bei
 * digital-direkt gleichzeitig vor):
 *   1. `@neondatabase/serverless` fehlt → dynamischer Import wirft, catch schluckt
 *   2. `CW_CONVERSION_STORE_URL` fehlt → Gate 1, sofortiges return
 *   3. `PROJECT_NAME` fehlt → `lead.project` fällt auf VERCEL_GIT_REPO_SLUG zurück
 *      ("customer-digital-direkt"), cw-ads sucht aber den Registry-Slug
 *      ("digital-direkt"). Die Zeilen landen in der Queue und werden nie geholt.
 *
 * Erkennung: Eine Site sammelt Conversions, wenn sie `adsConsent` an die
 * ContactForm übergibt (die Consent-Checkbox ist die Voraussetzung dafür, dass
 * `recordConversion` überhaupt schreiben darf).
 *
 * Läuft im `prebuild` der Customer-Repos, neben validate-form-backend.mjs.
 *
 * Exit-Codes: 0 ok/nicht zutreffend · 1 Guard schlägt an
 */
import { existsSync, readdirSync, readFileSync, statSync, realpathSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

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

const SOURCE_EXT = new Set(['.astro', '.ts', '.tsx', '.js', '.jsx', '.mjs']);

/**
 * Seiten, die `adsConsent` an eine ContactForm übergeben.
 * Erlaubt `adsConsent`, `adsConsent={true}` und `adsConsent="..."` — nicht aber
 * das explizite Abschalten via `adsConsent={false}`.
 * @param {string} dir
 * @returns {string[]}
 */
export function findAdsConsentPages(dir) {
  if (!existsSync(dir)) return [];
  return walk(dir)
    .filter((f) => SOURCE_EXT.has(extname(f)))
    .filter((f) => {
      const src = readFileSync(f, 'utf-8');
      if (/adsConsent\s*=\s*\{\s*false\s*\}/.test(src)) return false;
      return /\badsConsent\b/.test(src);
    });
}

/**
 * Ist der Neon-Treiber als Dependency deklariert? peerDependencies zählen NICHT —
 * in cw-core ist er eine *optionale* peerDependency, die pnpm nicht installiert.
 * @param {string} pkgJsonPath
 * @returns {boolean}
 */
export function hasNeonDependency(pkgJsonPath) {
  if (!existsSync(pkgJsonPath)) return false;
  try {
    const pkg = JSON.parse(readFileSync(pkgJsonPath, 'utf-8'));
    return Boolean(
      pkg.dependencies?.['@neondatabase/serverless'] ||
        pkg.devDependencies?.['@neondatabase/serverless'],
    );
  } catch {
    return false;
  }
}

/**
 * @param {string} root Repo-Wurzel
 * @returns {number} Exit-Code
 */
export function main(root) {
  const adsPages = findAdsConsentPages(join(root, 'src', 'pages'));

  if (adsPages.length === 0) {
    console.log('validate-conversion-store: keine Seite mit adsConsent — skip.');
    return 0;
  }

  const rel = (f) => f.replace(root + '/', '');
  let failed = false;

  // ── 1. Neon-Treiber ──────────────────────────────────────────────────────
  // Statisch prüfbar, unabhängig von der Umgebung — greift also auch im PR-Build.
  if (!hasNeonDependency(join(root, 'package.json'))) {
    console.error('❌ Die Seite sammelt Conversions (adsConsent), aber @neondatabase/serverless fehlt in package.json.');
    console.error('   → recordConversion() scheitert am dynamischen Import; der try/catch schluckt es.');
    console.error('     Kein Eintrag in conversion_queue, keine Fehlermeldung, grüner Build.');
    for (const f of adsPages) console.error(`   betroffen: ${rel(f)}`);
    console.error('\n   Fix: pnpm add @neondatabase/serverless');
    console.error('   (In cw-core ist das Paket nur eine OPTIONALE peerDependency — pnpm installiert es nicht mit.)');
    failed = true;
  }

  // ── 2./3. Env-abhängige Checks ───────────────────────────────────────────
  // CW_CONVERSION_STORE_URL und PROJECT_NAME existieren nur im Vercel-Build.
  // Lokal/CI wird übersprungen statt fälschlich rot zu werden.
  const onProdBuild = process.env.VERCEL_ENV === 'production';
  const storeUrl = process.env.CW_CONVERSION_STORE_URL;

  if (onProdBuild) {
    if (!storeUrl) {
      // Kein Hard-Fail: Eine Ads-Site darf vor dem Kampagnenstart bewusst noch
      // ohne Store laufen. Aber sichtbar machen — sonst wundert sich später jemand.
      console.warn('⚠️  adsConsent ist aktiv, aber CW_CONVERSION_STORE_URL ist im Production-Build nicht gesetzt.');
      console.warn('   → Es wird KEINE Conversion gespeichert (Gate 1 in conversion-store.js).');
      console.warn('   Fix, sobald die Kampagne startet: vercel env add CW_CONVERSION_STORE_URL production');
    } else if (!process.env.PROJECT_NAME) {
      // Das ist der teure Fall: geschrieben wird, geholt wird nie.
      console.error('❌ CW_CONVERSION_STORE_URL ist gesetzt, aber PROJECT_NAME fehlt.');
      console.error('   → lead.project fällt auf VERCEL_GIT_REPO_SLUG zurück (z. B. "customer-musterfirma"),');
      console.error('     cw-ads sucht aber den Registry-Slug ("musterfirma"). Die Conversions landen in der');
      console.error('     Queue und werden NIE hochgeladen — fetch_pending findet sie nicht.');
      console.error("\n   Fix: printf '%s' '<registry-slug>' | vercel env add PROJECT_NAME production");
      failed = true;
    }
  }

  if (failed) return 1;

  console.log(
    `✓ validate-conversion-store: Conversion-Pfad ok (${adsPages.length} Seite[n] mit adsConsent` +
      (onProdBuild ? `, Store ${storeUrl ? 'konfiguriert' : 'noch ohne DSN'}` : '') +
      ').',
  );
  return 0;
}

/**
 * Direkt-Aufruf erkennen — beide Seiten über realpath, weil das Skript im
 * Customer-Repo über den pnpm-Symlink `node_modules/@cw/core` läuft. Ein naiver
 * argv-Vergleich schlägt dort fehl (siehe verify-touchpoints.mjs).
 *
 * Ohne diesen Guard lief der Top-Level-Code beim `import` der Testdatei mit —
 * das `process.exit(0)` des Skip-Pfads beendete den Testprozess, bevor ein
 * einziger Test lief, und `node --test` meldete „pass 1". Ein stiller False-PASS
 * im Test für einen Guard gegen stille Fehler.
 */
function isDirectRun() {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(entry);
  } catch {
    return false;
  }
}

if (isDirectRun()) {
  process.exit(main(process.argv[2] || process.cwd()));
}
