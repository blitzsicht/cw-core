// @ts-check
/**
 * Keine Vorlage darf etwas anlegen, das der Build als „gehört gelöscht" meldet.
 * Lauf: `node --test tests/templates-obsolet.test.js`
 *
 * ANLASS (07.10.2026, Scaffold levia-therapiezentrum): Der Scaffold kopierte
 * src/templates/llms-endpoint.ts.template nach src/pages/llms.txt.ts — und der erste Build
 * warnte, genau diese Route sei seit der ai-discovery-Integration überflüssig und gehöre
 * gelöscht (blitzsicht-ops#648). Vorlage und Integration widersprachen sich; jeder Neukunde
 * hätte die Warnung geerbt. Die Vorlage ist entfernt, templates/customer-CLAUDE.md sagt jetzt
 * „nichts anlegen".
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const AI = readFileSync(join(ROOT, 'src/integrations/ai-discovery/index.ts'), 'utf8');

/** @param {string} dir @returns {string[]} */
function dateien(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? dateien(p) : [p];
  });
}
const VORLAGEN = [...dateien(join(ROOT, 'src/templates')), ...dateien(join(ROOT, 'templates'))];

/** Was ai-discovery als überflüssig meldet. Anker: steht das nicht mehr dort, Test anpassen. */
const OBSOLET = ['llms.txt.ts', 'llms.txt.js', 'llms.txt.mjs'];

/**
 * @param {{ pfad: string, text: string }[]} vorlagen
 * @returns {string[]}
 */
export function befunde(vorlagen) {
  /** @type {string[]} */
  const out = [];
  for (const { pfad, text } of vorlagen) {
    if (/llms[-.].*(endpoint|route)|llms\.txt\.(ts|js|mjs)/i.test(pfad.split('/').pop() ?? '')) {
      out.push(`${pfad}: Vorlage für eine llms.txt-Route`);
    }
    if (/(kopieren|kopiert|anlegen)[^\n]{0,40}\n?[^\n]{0,40}src\/pages\/llms\.txt\./i.test(text)) {
      out.push(`${pfad}: weist an, src/pages/llms.txt.* anzulegen`);
    }
    if (/export\s+(const|async function)\s+GET[\s\S]{0,400}llms/i.test(text)) {
      out.push(`${pfad}: enthält einen llms-GET-Endpoint`);
    }
  }
  return out;
}

test('Anker: ai-discovery meldet llms.txt-Routen weiterhin als überflüssig', () => {
  for (const f of OBSOLET) assert.ok(AI.includes(`'${f}'`), `${f} nicht mehr in ai-discovery — Guard prüfen`);
  assert.match(AI, /gehört gelöscht/);
});

test('keine Vorlage legt eine llms.txt-Route an', () => {
  const b = befunde(VORLAGEN.map((p) => ({ pfad: relative(ROOT, p), text: readFileSync(p, 'utf8') })));
  assert.deepEqual(b, [], b.join('\n'));
});

test('Gegenprobe: die alte Vorlage (v0.168.0) wäre gemeldet worden', () => {
  const alt = {
    pfad: 'src/templates/llms-endpoint.ts.template',
    text: "//   1. Diese Datei nach src/pages/llms.txt.ts in jedem Customer-Repo kopieren\nexport const GET: APIRoute = () => new Response(llms)",
  };
  const altDoku = {
    pfad: 'templates/customer-CLAUDE.md',
    text: 'Template: `cw-core/src/templates/llms-endpoint.ts.template` → kopieren nach\n`src/pages/llms.txt.ts`.',
  };
  assert.ok(befunde([alt]).length >= 2, befunde([alt]).join('\n'));
  assert.equal(befunde([altDoku]).length, 1);
});
