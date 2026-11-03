#!/usr/bin/env node
/**
 * Tests für src/components/seo/SchemaOrg.astro — alternateName / legalName /
 * additionalName (optionale Felder, nur gerendert wenn gesetzt).
 *
 * Rendert die Komponente über Astro-Container + Vite-SSR und liest die
 * JSON-LD-Blöcke aus dem HTML.
 *
 * Ausführen: node scripts/schema-org.test.mjs
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(realpathSync(join(root, 'node_modules', 'astro', 'package.json')));
const { createServer } = await import(require.resolve('vite'));
const { getViteConfig } = await import('astro/config');

let server;
let container;
let SchemaOrg;

before(async () => {
  const cfgFn = getViteConfig({}, { root });
  const cfg = await cfgFn({ command: 'serve', mode: 'development' });
  server = await createServer({
    ...cfg,
    root,
    logLevel: 'error',
    optimizeDeps: { noDiscovery: true, include: [] },
    server: { middlewareMode: true, hmr: false, watch: null },
    appType: 'custom',
  });
  const { experimental_AstroContainer } = await server.ssrLoadModule('astro/container');
  container = await experimental_AstroContainer.create();
  SchemaOrg = (await server.ssrLoadModule('/src/components/seo/SchemaOrg.astro')).default;
});

after(async () => {
  await server?.close();
});

const BASE = {
  name: 'Steller Sanierungen',
  description: 'Sanierung',
  url: 'https://example.test',
  ogImage: '/og.png',
};

async function blocks(props) {
  const html = await container.renderToString(SchemaOrg, { props });
  return [...html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/g)].map(
    (m) => JSON.parse(m[1]),
  );
}

const person = (b) => b.find((x) => x['@type'] === 'Person');
const org = (b) => b.find((x) => Array.isArray(x['@type']) && x['@type'].includes('LocalBusiness'));

test('Organization: alternateName + legalName erscheinen, wenn gesetzt', async () => {
  const b = await blocks({ ...BASE, alternateName: ['Steller'], legalName: 'Steller Sanierungen e.K.' });
  assert.deepEqual(org(b).alternateName, ['Steller']);
  assert.equal(org(b).legalName, 'Steller Sanierungen e.K.');
});

test('Founder: additionalName + alternateName erscheinen, wenn gesetzt', async () => {
  const b = await blocks({
    ...BASE,
    founder: { name: 'Frank Steller', additionalName: 'Arno', alternateName: ['Arno Steller'] },
  });
  assert.equal(person(b).additionalName, 'Arno');
  assert.deepEqual(person(b).alternateName, ['Arno Steller']);
});

test('Gegenprobe: ohne die Felder stehen sie NICHT im Output', async () => {
  const b = await blocks({ ...BASE, founder: { name: 'Frank Steller' } });
  assert.ok(person(b), 'Person-Block muss existieren (sonst Vakuum-Grün)');
  assert.ok(org(b), 'Organization-Block muss existieren');
  for (const k of ['alternateName', 'legalName']) assert.ok(!(k in org(b)), `org.${k}`);
  for (const k of ['alternateName', 'additionalName']) assert.ok(!(k in person(b)), `person.${k}`);
});

test('Leere alternateName-Arrays werden nicht gerendert', async () => {
  const b = await blocks({ ...BASE, alternateName: [], founder: { name: 'F S', alternateName: [] } });
  assert.ok(!('alternateName' in org(b)));
  assert.ok(!('alternateName' in person(b)));
});
