import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

/**
 * Wächter über das `exports`-Feld.
 *
 * Anlass (25.08.2026, v0.130.0): `src/utils/labelfarbe.js` wurde ausgeliefert, war aber
 * nicht exportiert — der Sammel-Eintrag `./utils/*` zeigt auf `./src/utils/*.ts` und trifft
 * JavaScript nicht. Die Datei lag im Tarball, der Import brach trotzdem:
 * `Rollup failed to resolve import "@cw/core/utils/labelfarbe"`.
 *
 * Auffallen konnte das erst im Kundenrepo — cw-core selbst importiert über relative Pfade,
 * und `examples/` bindet die Bibliothek als `link:..` ein, wo Node die exports-Map ebenfalls
 * großzügiger behandelt. Ein Release ohne Consumer-Build hätte den Fehler nicht gezeigt.
 * Dieser Test ersetzt den fehlenden Consumer-Build.
 */

const HIER = dirname(fileURLToPath(import.meta.url));
const WURZEL = join(HIER, '..');
const pkg = JSON.parse(readFileSync(join(WURZEL, 'package.json'), 'utf8'));

/** Wird dieser Unterpfad von der exports-Map aufgelöst? */
function istExportiert(unterpfad) {
  const ex = pkg.exports ?? {};
  if (ex[unterpfad]) return true;
  // Sammel-Einträge: './utils/*' → './src/utils/*.ts'
  for (const [muster, ziel] of Object.entries(ex)) {
    if (!muster.includes('*')) continue;
    const [pre, post] = muster.split('*');
    if (!unterpfad.startsWith(pre) || !unterpfad.endsWith(post)) continue;
    const rest = unterpfad.slice(pre.length, unterpfad.length - post.length);
    const zielPfad = typeof ziel === 'string' ? ziel : ziel?.default;
    if (typeof zielPfad !== 'string') continue;
    // Das Ziel muss auf eine existierende Datei zeigen — sonst greift der Eintrag nur scheinbar.
    const aufgeloest = zielPfad.replace('*', rest);
    try {
      readFileSync(join(WURZEL, aufgeloest));
      return true;
    } catch {
      /* Muster passt, Datei nicht — weiter suchen */
    }
  }
  return false;
}

test('jede .js in src/utils/ ist über die exports-Map erreichbar', () => {
  const dir = join(WURZEL, 'src/utils');
  const dateien = readdirSync(dir).filter((f) => f.endsWith('.js') && !f.endsWith('.test.js'));

  assert.ok(dateien.length > 0, 'Vorbedingung: es muss .js-Dateien in src/utils/ geben');

  const fehlend = dateien
    .map((f) => `./utils/${f.replace(/\.js$/, '')}`)
    .filter((p) => !istExportiert(p));

  assert.deepEqual(
    fehlend,
    [],
    `Nicht exportiert: ${fehlend.join(', ')}\n` +
      'Der Sammel-Eintrag "./utils/*" zeigt auf "*.ts" und trifft JavaScript nicht — ' +
      'solche Module brauchen einen eigenen Eintrag mit types+default (Vorbild: ./utils/bildherkunft).',
  );
});

test('der Wächter erkennt eine fehlende Zuordnung — Gegenprobe', () => {
  // Ohne diesen Test wüsste man nur, dass er nicht meckert, nicht dass er meckern KANN.
  assert.equal(istExportiert('./utils/gibt-es-nicht-xyz'), false);
  assert.equal(istExportiert('./utils/labelfarbe'), true);
});

test('die explizit eingetragenen utils zeigen auf existierende Dateien', () => {
  const explizit = Object.entries(pkg.exports ?? {}).filter(
    ([k, v]) => k.startsWith('./utils/') && !k.includes('*') && typeof v === 'object',
  );
  assert.ok(explizit.length >= 2, 'Vorbedingung: mindestens zwei explizite utils-Einträge');

  for (const [name, ziel] of explizit) {
    for (const schluessel of ['types', 'default']) {
      const rel = ziel[schluessel];
      if (!rel) continue;
      assert.doesNotThrow(
        () => readFileSync(join(WURZEL, rel)),
        `${name} → ${schluessel}: ${rel} existiert nicht`,
      );
    }
  }
});
