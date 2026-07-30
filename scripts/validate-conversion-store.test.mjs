#!/usr/bin/env node
/**
 * Tests für validate-conversion-store.mjs
 *
 * Läuft via: node --test scripts/validate-conversion-store.test.mjs
 *
 * Kernpunkt: Der Guard muss bei jedem der drei stillen Blocker rot werden, die
 * bei digital-direkt gleichzeitig vorlagen. Ein Guard, der nie rot war, ist
 * eine Behauptung — deshalb testet jeder Fall den Exit-Code, nicht nur die Logik.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';

import { findAdsConsentPages, hasNeonDependency } from './validate-conversion-store.mjs';

const SCRIPT = resolve(import.meta.dirname, 'validate-conversion-store.mjs');

const KONTAKT_MIT_CONSENT = `---
import ContactForm from '@cw/core/components/forms/ContactForm.astro';
---
<ContactForm actionUrl="/api/contact" adsConsent={true} />
`;

const KONTAKT_OHNE_CONSENT = `---
import ContactForm from '@cw/core/components/forms/ContactForm.astro';
---
<ContactForm actionUrl="/api/contact" />
`;

/**
 * Baut ein Wegwerf-Repo und ruft den Guard darin auf.
 * @param {object} o
 * @param {string} o.page                       Inhalt von src/pages/kontakt.astro
 * @param {boolean} [o.neonDep]                 @neondatabase/serverless in dependencies?
 * @param {Record<string,string>} [o.env]
 * @returns {{ code: number, out: string }}
 */
function run({ page, neonDep = false, env = {} }) {
  const cwd = join(tmpdir(), `cwcore-cs-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(join(cwd, 'src', 'pages'), { recursive: true });
  writeFileSync(join(cwd, 'src', 'pages', 'kontakt.astro'), page);
  writeFileSync(
    join(cwd, 'package.json'),
    JSON.stringify({
      name: 'testsite',
      dependencies: neonDep ? { '@neondatabase/serverless': '^0.9.0' } : {},
    }),
  );

  // spawnSync statt execFileSync: Letzteres liefert im Erfolgsfall NUR stdout,
  // die Warnungen des Guards gehen aber über console.warn auf stderr — ein
  // Test darauf wäre sonst grundlos rot.
  const res = spawnSync(process.execPath, [SCRIPT, cwd], {
    // VERCEL_ENV/PROJECT_NAME/CW_CONVERSION_STORE_URL der echten Shell dürfen
    // nicht durchschlagen — sonst hängt das Ergebnis an der Maschine.
    env: {
      ...process.env,
      VERCEL_ENV: '',
      PROJECT_NAME: '',
      CW_CONVERSION_STORE_URL: '',
      ...env,
    },
    cwd,
    encoding: 'utf-8',
    timeout: 10000,
  });
  try {
    rmSync(cwd, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
  return { code: res.status ?? 1, out: (res.stdout ?? '') + (res.stderr ?? '') };
}

// ─── Pure Helpers ───────────────────────────────────────────────────────────

test('findAdsConsentPages: findet adsConsent, ignoriert explizites false', () => {
  const cwd = join(tmpdir(), `cwcore-cs-h-${Date.now()}`);
  mkdirSync(join(cwd, 'pages'), { recursive: true });
  writeFileSync(join(cwd, 'pages', 'a.astro'), '<ContactForm adsConsent={true} />');
  writeFileSync(join(cwd, 'pages', 'b.astro'), '<ContactForm adsConsent={false} />');
  writeFileSync(join(cwd, 'pages', 'c.astro'), '<ContactForm />');
  const found = findAdsConsentPages(join(cwd, 'pages')).map((f) => f.split('/').pop());
  assert.deepEqual(found, ['a.astro']);
  rmSync(cwd, { recursive: true, force: true });
});

test('hasNeonDependency: peerDependencies zählen NICHT', () => {
  const cwd = join(tmpdir(), `cwcore-cs-p-${Date.now()}`);
  mkdirSync(cwd, { recursive: true });
  const p = join(cwd, 'package.json');
  writeFileSync(p, JSON.stringify({ peerDependencies: { '@neondatabase/serverless': '>=0.9.0' } }));
  assert.equal(hasNeonDependency(p), false, 'optionale peerDependency wird nicht installiert');
  writeFileSync(p, JSON.stringify({ dependencies: { '@neondatabase/serverless': '^0.9.0' } }));
  assert.equal(hasNeonDependency(p), true);
  rmSync(cwd, { recursive: true, force: true });
});

// ─── Guard-Verhalten ────────────────────────────────────────────────────────

test('Nicht-Ads-Site (kein adsConsent) → skip, Exit 0', () => {
  const { code, out } = run({ page: KONTAKT_OHNE_CONSENT });
  assert.equal(code, 0);
  assert.match(out, /skip/);
});

test('BLOCKER 1: adsConsent ohne Neon-Treiber → Exit 1', () => {
  const { code, out } = run({ page: KONTAKT_MIT_CONSENT, neonDep: false });
  assert.equal(code, 1, `Guard muss rot werden, out:\n${out}`);
  assert.match(out, /@neondatabase\/serverless fehlt/);
});

test('adsConsent MIT Neon-Treiber, ohne Prod-Env → Exit 0', () => {
  const { code, out } = run({ page: KONTAKT_MIT_CONSENT, neonDep: true });
  assert.equal(code, 0, out);
  assert.match(out, /Conversion-Pfad ok/);
});

test('BLOCKER 3: Prod-Build mit Store-URL, aber ohne PROJECT_NAME → Exit 1', () => {
  const { code, out } = run({
    page: KONTAKT_MIT_CONSENT,
    neonDep: true,
    env: { VERCEL_ENV: 'production', CW_CONVERSION_STORE_URL: 'postgres://x/y' },
  });
  assert.equal(code, 1, `Slug-Mismatch muss rot werden, out:\n${out}`);
  assert.match(out, /PROJECT_NAME fehlt/);
});

test('BLOCKER 2: Prod-Build ohne Store-URL → Warnung, aber Exit 0 (kann Absicht sein)', () => {
  const { code, out } = run({
    page: KONTAKT_MIT_CONSENT,
    neonDep: true,
    env: { VERCEL_ENV: 'production' },
  });
  assert.equal(code, 0, out);
  assert.match(out, /CW_CONVERSION_STORE_URL ist im Production-Build nicht gesetzt/);
});

test('Vollständig konfigurierter Prod-Build → Exit 0', () => {
  const { code, out } = run({
    page: KONTAKT_MIT_CONSENT,
    neonDep: true,
    env: {
      VERCEL_ENV: 'production',
      CW_CONVERSION_STORE_URL: 'postgres://x/y',
      PROJECT_NAME: 'musterfirma',
    },
  });
  assert.equal(code, 0, out);
  assert.match(out, /Store konfiguriert/);
});
