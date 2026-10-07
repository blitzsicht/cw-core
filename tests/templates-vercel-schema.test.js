// @ts-check
/**
 * vercel.template.json gegen Vercels Konfigurations-Schema. Lauf:
 * `node --test tests/templates-vercel-schema.test.js`
 *
 * ANLASS (07.10.2026): Der erste Vercel-Deploy von customer-levia-therapiezentrum (Scaffold
 * aus v0.168.0) endete mit readyState ERROR: „`headers[0].headers[6]` should NOT have
 * additional property `_comment_csp`". Die Vorlage trug vier `_comment_*`-Schlüssel — in
 * einem Header-Objekt und auf Routen-Ebene. Vercels Schema setzt dort
 * `additionalProperties: false`; der Validator meldet nur den ersten Verstoß. Bestandskunden
 * hatten die Kommentare nie, deshalb fiel es erst beim ersten Neukunden-Scaffold auf.
 * Begründungen stehen in docs/CSP-rationale.md und docs/caching-rationale.md.
 *
 * Referenz: tests/fixtures/vercel-json-schema-auszug.json — erlaubte Schlüssel je Ebene,
 * ausgezogen aus https://openapi.vercel.sh/vercel.json (07.10.2026).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HIER = dirname(fileURLToPath(import.meta.url));
const SCHEMA = JSON.parse(readFileSync(join(HIER, 'fixtures', 'vercel-json-schema-auszug.json'), 'utf8'));
const VORLAGE = join(HIER, '..', 'src', 'templates', 'vercel.template.json');

/**
 * @param {any} cfg geparste vercel.json
 * @returns {string[]} Verstöße im Vercel-Fehlerformat
 */
export function verstoesse(cfg) {
  /** @type {string[]} */
  const out = [];
  const fremd = (/** @type {object} */ o, /** @type {string[]} */ erlaubt, /** @type {string} */ pfad) => {
    for (const k of Object.keys(o)) if (!erlaubt.includes(k)) out.push(`${pfad} should NOT have additional property \`${k}\``);
  };
  fremd(cfg, SCHEMA.wurzel, '(Wurzel)');
  for (const art of ['headers', 'redirects', 'rewrites']) {
    (cfg[art] ?? []).forEach((/** @type {any} */ e, /** @type {number} */ i) => {
      fremd(e, SCHEMA[art].erlaubt, `${art}[${i}]`);
      for (const p of SCHEMA[art].pflicht) if (!(p in e)) out.push(`${art}[${i}] fehlt \`${p}\``);
      if (art === 'headers') {
        (e.headers ?? []).forEach((/** @type {any} */ h, /** @type {number} */ j) => {
          fremd(h, SCHEMA['headers.headers'].erlaubt, `headers[${i}].headers[${j}]`);
          for (const p of SCHEMA['headers.headers'].pflicht) if (!(p in h)) out.push(`headers[${i}].headers[${j}] fehlt \`${p}\``);
        });
      }
    });
  }
  return out;
}

const vorlage = () => JSON.parse(readFileSync(VORLAGE, 'utf8'));

test('vercel.template.json hat nur Schlüssel, die Vercels Schema zulässt', () => {
  const v = verstoesse(vorlage());
  assert.deepEqual(v, [], v.join('\n'));
});

test('Gegenprobe: _comment im Header-Objekt wird gemeldet (der LeVia-Fehler)', () => {
  const cfg = vorlage();
  cfg.headers[0].headers.push({ _comment_csp: 'x', key: 'X-Test', value: '1' });
  assert.ok(verstoesse(cfg).some((m) => m.includes('_comment_csp')));
});

test('Gegenprobe: _comment auf Routen-Ebene und in der Wurzel werden gemeldet', () => {
  const cfg = vorlage();
  cfg.headers[1]._comment_cache = 'x';
  cfg._comment = 'x';
  const v = verstoesse(cfg);
  assert.ok(v.some((m) => m.startsWith('headers[1]') && m.includes('_comment_cache')), v.join('\n'));
  assert.ok(v.some((m) => m.startsWith('(Wurzel)')), v.join('\n'));
});

test('Gegenprobe: fehlendes value im Header wird gemeldet', () => {
  const cfg = vorlage();
  cfg.headers[0].headers.push({ key: 'X-Ohne-Wert' });
  assert.ok(verstoesse(cfg).some((m) => m.includes('fehlt `value`')));
});

test('Schema-Auszug ist nicht leer (sonst wäre alles erlaubt)', () => {
  assert.ok(SCHEMA.wurzel.includes('headers') && SCHEMA['headers.headers'].erlaubt.length === 2);
});
