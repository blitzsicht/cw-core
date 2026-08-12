/**
 * Tests für `src/utils/legal/aufsichtsbehoerde.js`.
 *
 * Der Wert dieses Moduls liegt darin, dass es die EINZIGE Stelle ist. Die
 * Tests prüfen deshalb weniger den Inhalt als die Einzigkeit: dass die
 * Allowlist abgeleitet und nicht abgeschrieben ist, und dass keine Komponente
 * die Adresse wieder als Literal führt (blitzsicht-ops#653).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  DEFAULT_BESCHWERDESTELLE,
  AUFSICHTS_MAILTO_ALLOWLIST,
} from '../../src/utils/legal/aufsichtsbehoerde.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC_DIR = join(__dirname, '../../src');
const MODUL = join(SRC_DIR, 'utils/legal/aufsichtsbehoerde.js');

/** @param {string} dir @param {string[]} [acc] */
function walk(dir, acc = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, acc);
    else acc.push(full);
  }
  return acc;
}

test('die Voreinstellung trägt die Felder, die beide Blöcke rendern', () => {
  for (const feld of ['name', 'address', 'url', 'emailUrl', 'phone']) {
    assert.ok(DEFAULT_BESCHWERDESTELLE[feld], `Feld fehlt: ${feld}`);
  }
  assert.match(DEFAULT_BESCHWERDESTELLE.emailUrl, /^mailto:/);
  assert.match(DEFAULT_BESCHWERDESTELLE.url, /^https:\/\//);
});

test('die Allowlist ist abgeleitet, nicht abgeschrieben', () => {
  // Der Kern des Fixes: wer die Behörde austauscht, ändert die Allowlist mit.
  // Ein zweites Literal wäre genau die Drift, die das Modul abschaffen soll.
  const erwartet = DEFAULT_BESCHWERDESTELLE.emailUrl.slice('mailto:'.length).toLowerCase();
  assert.deepEqual([...AUFSICHTS_MAILTO_ALLOWLIST], [erwartet]);
});

test('die Allowlist enthält nur blosse Adressen, kein mailto:-Präfix', () => {
  // auditHtml vergleicht gegen den Wert NACH `href.slice(7)`. Ein Präfix hier
  // würde nie treffen und der Guard bliebe still rot.
  for (const addr of AUFSICHTS_MAILTO_ALLOWLIST) {
    assert.ok(!addr.startsWith('mailto:'), `mailto:-Präfix in der Allowlist: ${addr}`);
    assert.match(addr, /^[^@\s]+@[^@\s]+$/, `keine plausible Adresse: ${addr}`);
    assert.equal(addr, addr.toLowerCase(), `nicht kleingeschrieben: ${addr}`);
  }
});

test('die Voreinstellung ist eingefroren — versehentliches Überschreiben fällt auf', () => {
  assert.ok(Object.isFrozen(DEFAULT_BESCHWERDESTELLE));
  assert.ok(Object.isFrozen(AUFSICHTS_MAILTO_ALLOWLIST));
});

test('keine Quelldatei ausser dem Modul führt die Behördenadresse als Literal', () => {
  // Der eigentliche Drift-Schutz. Vor 12.08.2026 stand die Angabe doppelt in
  // den Prop-Defaults von DatenschutzBlock und InformationspflichtBlock — und
  // war bereits auseinandergelaufen (eine Fassung ohne Telefon und mailto).
  const adresse = AUFSICHTS_MAILTO_ALLOWLIST[0];
  const domain = DEFAULT_BESCHWERDESTELLE.url.replace(/^https:\/\/(www\.)?/, '');

  const treffer = [];
  let geprueft = 0;
  for (const datei of walk(SRC_DIR)) {
    if (datei === MODUL) continue;
    if (!/\.(astro|ts|js|mjs)$/.test(datei)) continue;
    geprueft += 1;
    const inhalt = readFileSync(datei, 'utf-8');
    if (inhalt.includes(adresse) || inhalt.includes(domain)) {
      treffer.push(relative(SRC_DIR, datei));
    }
  }

  assert.ok(geprueft > 0, 'Vorbedingung: es wurden überhaupt Dateien gelesen');
  assert.deepEqual(treffer, [], `Behördenangabe wieder als Literal in: ${treffer.join(', ')}`);
});

test('beide Datenschutz-Blöcke importieren die gemeinsame Quelle', () => {
  // Gegenstück zum Test darüber: „kein Literal" wäre auch erfüllt, wenn eine
  // Komponente die Beschwerdestelle gar nicht mehr rendert.
  for (const name of ['DatenschutzBlock', 'InformationspflichtBlock']) {
    const quelle = readFileSync(join(SRC_DIR, 'components/blocks', `${name}.astro`), 'utf-8');
    assert.match(
      quelle,
      /import \{ DEFAULT_BESCHWERDESTELLE \} from '\.\.\/\.\.\/utils\/legal\/aufsichtsbehoerde\.js'/,
      `${name} importiert die gemeinsame Quelle nicht`,
    );
    assert.match(quelle, /beschwerdeStelle = DEFAULT_BESCHWERDESTELLE/, `${name} nutzt sie nicht als Default`);
  }
});
