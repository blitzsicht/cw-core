// @ts-check
/**
 * og-audit.mjs muss ohne installierte cw-core-Wurzel laufen.
 *
 * Der Sicht-Guard (`templates/.github/workflows/site-checks.yml`) ruft
 * `node cw-core/scripts/og-audit.mjs` im ausgecheckten cw-core auf und installiert
 * dort nur `checks/`. Jeder Paket-Import im Import-Graph von og-audit (direkt oder
 * über eine importierte Datei) scheitert dann mit ERR_MODULE_NOT_FOUND.
 * So geschehen mit v0.196.0: og-audit → verify-touchpoints → html-resources → parse5,
 * 22 von 22 Pin-PRs rot (23.11.2026).
 *
 * Geprüft wird statisch: alle relativen `import … from` / `export … from` ab
 * og-audit.mjs werden verfolgt, jeder andere Spezifizierer muss `node:` sein.
 *
 * Läuft via: node --test scripts/og-audit-imports.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const START = resolve(import.meta.dirname, 'og-audit.mjs');

// Statische Importe und Re-Exporte, auch mehrzeilig; Kommentare vorher entfernt.
const SPEC_RE = /(?:^|[\s;])(?:import|export)\s+(?:[^'"`;]*?\s+from\s+)?['"]([^'"]+)['"]/g;

/** @param {string} src */
function ohneKommentare(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/** @param {string} start @returns {{ dateien: string[], pakete: Array<{ spec: string, in: string }> }} */
export function importGraph(start) {
  const gesehen = new Set();
  const pakete = [];
  const offen = [start];
  while (offen.length) {
    const datei = /** @type {string} */ (offen.pop());
    if (gesehen.has(datei)) continue;
    gesehen.add(datei);
    const src = ohneKommentare(readFileSync(datei, 'utf8'));
    for (const m of src.matchAll(SPEC_RE)) {
      const spec = m[1];
      if (spec.startsWith('./') || spec.startsWith('../')) offen.push(resolve(dirname(datei), spec));
      else if (!spec.startsWith('node:')) pakete.push({ spec, in: datei });
    }
  }
  return { dateien: [...gesehen], pakete };
}

test('og-audit lädt im ganzen Import-Graph nur node:-Module und eigene Dateien', () => {
  const { dateien, pakete } = importGraph(START);
  // Zählwert > 0: der Graph wurde wirklich verfolgt (og-audit + bild-masse + html-attribute + dist-pfad …).
  assert.ok(dateien.length >= 4, `nur ${dateien.length} Datei(en) im Graph — Verfolgung kaputt?`);
  assert.deepEqual(
    pakete.map((p) => `${p.spec} (in ${p.in.slice(p.in.indexOf('/scripts/') >= 0 ? p.in.indexOf('/scripts/') : p.in.indexOf('/src/'))})`),
    [],
  );
});

test('Gegenprobe: der Graph von verify-touchpoints meldet parse5', () => {
  // Wird dieser Test rot, findet die Graph-Verfolgung Paket-Importe nicht mehr,
  // und der Test oben wäre wertlos.
  const { pakete } = importGraph(resolve(import.meta.dirname, 'verify-touchpoints.mjs'));
  assert.ok(pakete.some((p) => p.spec === 'parse5'), 'parse5 nicht gefunden');
});
