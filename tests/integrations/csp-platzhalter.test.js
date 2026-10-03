// @ts-check
/**
 * Vorlagen-Platzhalter in der CSP (Review cw-site #6, 03.10.2026).
 *
 * `src/templates/vercel.template.json` trägt 9× `https://{{DOMAIN}}`, das
 * astro.config-Template `site: 'https://firma.de'`. Im Scaffold-Probelauf stand
 * nach zwei gen-vercel-csp-Läufen beides neben der echten Domain in der CSP —
 * und der Build meldete trotzdem „✓ vercel.json CSP vollständig“: fixCsp ergänzt
 * den Origin nur, checkCspCompleteness kannte Platzhalter nicht.
 *
 * Lauf: `node --test tests/integrations/csp-platzhalter.test.js`
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import {
  checkCspCompleteness,
  extractCspValuesFromVercelJson,
} from '../../src/integrations/ai-discovery/csp-check.js';
import { fixCsp } from '../../src/integrations/ai-discovery/csp-build.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const VERCEL_TEMPLATE = readFileSync(join(ROOT, 'src/templates/vercel.template.json'), 'utf8');
const [TEMPLATE_CSP] = extractCspValuesFromVercelJson(VERCEL_TEMPLATE);
const ORIGIN = 'https://weinkontor-sinzing.de';
const typen = (/** @type {{type:string}[]} */ i) => i.map((x) => x.type);

test('Vorbedingung: die Vorlage enthält wirklich {{DOMAIN}}', () => {
  // Sonst prüften die Tests unten eine Vorlage, die das Problem gar nicht hat.
  assert.ok(TEMPLATE_CSP && TEMPLATE_CSP.includes('https://{{DOMAIN}}'));
});

test('Vorlagen-CSP unverändert → vorlagen_platzhalter', () => {
  assert.ok(typen(checkCspCompleteness(TEMPLATE_CSP, { siteOrigin: ORIGIN })).includes('vorlagen_platzhalter'));
});

test('Vorlagen-Domain firma.de in der CSP → vorlagen_platzhalter', () => {
  const csp = TEMPLATE_CSP.replaceAll('{{DOMAIN}}', 'firma.de');
  assert.ok(typen(checkCspCompleteness(csp, { siteOrigin: ORIGIN })).includes('vorlagen_platzhalter'));
});

test('Host-genau: meinefirma.de ist KEIN Platzhalter', () => {
  const csp = TEMPLATE_CSP.replaceAll('{{DOMAIN}}', 'meinefirma.de');
  const issues = checkCspCompleteness(csp, { siteOrigin: 'https://meinefirma.de' });
  assert.ok(!typen(issues).includes('vorlagen_platzhalter'), JSON.stringify(issues));
});

test('fixCsp entfernt Platzhalter-Hosts und setzt den echten Origin → 0 Issues', () => {
  const fixed = fixCsp(TEMPLATE_CSP.replace('https://{{DOMAIN}}', 'https://firma.de'), ORIGIN);
  assert.ok(!fixed.includes('{{') && !fixed.includes('firma.de'), fixed);
  assert.ok(fixed.includes(`'self' ${ORIGIN}`), fixed);
  assert.deepEqual(checkCspCompleteness(fixed, { siteOrigin: ORIGIN }), []);
});

test('fixCsp mit Origin firma.de bleibt rot (site: nicht gesetzt)', () => {
  const fixed = fixCsp(TEMPLATE_CSP, 'https://firma.de');
  assert.ok(typen(checkCspCompleteness(fixed, { siteOrigin: 'https://firma.de' })).includes('vorlagen_platzhalter'));
});

/** @param {string} site */
function genLauf(site) {
  const dir = mkdtempSync(join(tmpdir(), 'csp-platzhalter-'));
  try {
    writeFileSync(join(dir, 'vercel.json'), VERCEL_TEMPLATE);
    writeFileSync(join(dir, 'astro.config.mjs'), `export default { site: '${site}' };\n`);
    const r = spawnSync(process.execPath, [join(ROOT, 'scripts/gen-vercel-csp.mjs'), dir], { encoding: 'utf8' });
    return { status: r.status, out: r.stdout + r.stderr, vercel: readFileSync(join(dir, 'vercel.json'), 'utf8') };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('gen-vercel-csp auf frischer Vorlage + echter site → Exit 0, keine Platzhalter', () => {
  const r = genLauf(ORIGIN);
  assert.equal(r.status, 0, r.out);
  const [csp] = extractCspValuesFromVercelJson(r.vercel);
  assert.ok(!csp.includes('{{') && !csp.includes('firma.de'), csp);
});

test('gen-vercel-csp mit site firma.de → Exit 1, nennt site:', () => {
  const r = genLauf('https://firma.de');
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /site:/);
});

// --- api/: Vorlagen-Platzhalter außerhalb der CSP --------------------------------
import { findeVorlagenPlatzhalter } from '../../src/integrations/ai-discovery/vorlagen-platzhalter-check.js';

test('api-contact-Vorlage unverändert → Platzhalter gefunden (Gegenprobe)', () => {
  const inhalt = readFileSync(join(ROOT, 'templates/api-contact.ts'), 'utf8');
  const b = findeVorlagenPlatzhalter([{ pfad: 'api/contact.ts', inhalt }]);
  assert.ok(b.some((x) => x.platzhalter === '{{DOMAIN}}') && b.some((x) => x.platzhalter === '{{LEGAL_NAME}}'), JSON.stringify(b));
});

test('api-contact nach sed → 0 Befunde; Template-Literale und Kleinschreibung zählen nicht', () => {
  const inhalt = readFileSync(join(ROOT, 'templates/api-contact.ts'), 'utf8')
    .replaceAll('{{DOMAIN}}', 'weinkontor-sinzing.de').replaceAll('{{LEGAL_NAME}}', 'Weinkontor Sinzing');
  assert.deepEqual(findeVorlagenPlatzhalter([
    { pfad: 'api/contact.ts', inhalt },
    { pfad: 'api/x.ts', inhalt: 'const a = `${b}`; const m = "{{name}}";' },
  ]), []);
});
