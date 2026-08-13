// @ts-check
/**
 * Bindet `verify-hero-title-scope.mjs` an `pnpm test`, damit der Check nicht nur läuft,
 * wenn jemand daran denkt. cw-core hat keine CI — diese Suite ist die einzige Schiene.
 *
 * Drei Zustände, nicht zwei:
 *   Exit 0 → grün
 *   Exit 1 → Abweichung, Test rot (das ist der Regressionsfall aus blitzsicht-ops#662)
 *   Exit 2 → NICHT GEPRÜFT (Playwright fehlt, Fixture fehlt, examples-Build kaputt).
 *            Wird als `skip` mit Grund gemeldet, NIE als bestanden — ein Check, der nicht
 *            laufen konnte, ist kein Nachweis.
 *
 * Laufzeit ~6 s (examples-Build + Chromium). Bewusst in Kauf genommen: der Fehler, den er
 * fängt, stand live auf blitzsicht.com und war an keiner Stelle sonst sichtbar.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(HERE, 'verify-hero-title-scope.mjs');

test('Hero-Titel ist in beiden Motion-Zweigen gestylt', { timeout: 180_000 }, (t) => {
  const run = spawnSync(process.execPath, [SCRIPT], {
    cwd: resolve(HERE, '..'),
    encoding: 'utf8',
  });
  const out = `${run.stdout ?? ''}${run.stderr ?? ''}`;

  if (run.status === 2) {
    t.skip(`NICHT GEPRÜFT — ${out.split('\n').find((l) => l.includes('NICHT GEPRÜFT')) ?? 'Umgebungsfehler'}`);
    return;
  }

  assert.equal(run.status, 0, `verify-hero-title-scope.mjs meldete Exit ${run.status}:\n${out}`);
  // Vorbedingung sichtbar: die Zahl muss im Output stehen, sonst hat nichts gemessen.
  assert.match(out, /✓ \d+ von \d+ <h1> gebunden/, `Zählwert fehlt im Output:\n${out}`);
});
