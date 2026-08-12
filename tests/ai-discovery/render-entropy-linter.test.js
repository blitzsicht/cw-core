/**
 * Tests für `src/integrations/ai-discovery/render-entropy-check.js`.
 *
 * Der Guard trennt Build-Zeit von Laufzeit: `Math.random()` im Frontmatter ist
 * der Befund, dasselbe in einem `<script>`-Block ist völlig in Ordnung. Genau
 * diese Trennung ist das, was schiefgehen kann — die meisten Fälle unten
 * prüfen sie.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  findRenderEntropy,
  lintRenderEntropy,
  blankInlineBlocks,
  blankComments,
  ENTROPY_PATTERNS,
} from '../../src/integrations/ai-discovery/render-entropy-check.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MOTION_DIR = join(__dirname, '../../src/components/motion');

// ---------------------------------------------------------------------------
// Der Fall, der den Guard ausgelöst hat
// ---------------------------------------------------------------------------

test('findet den echten StaggerGroup-Bug im Frontmatter', () => {
  // Wörtlich die Zeile aus StaggerGroup.astro:34 (bis 11.08.2026).
  const source = [
    '---',
    "const { direction = 'up' } = Astro.props;",
    'const groupId = `stg-${Math.random().toString(36).slice(2, 9)}`;',
    '---',
    '<div id={groupId}></div>',
  ].join('\n');

  const hits = findRenderEntropy(source);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].line, 3);
  assert.equal(hits[0].pattern, 'Math.random()');
  assert.match(hits[0].snippet, /stg-/);
});

test('schweigt bei Math.random in einem <script>-Block — das ist Laufzeit', () => {
  // Der häufigste denkbare Falsch-Positiv. Client-Zufall hat mit der
  // Reproduzierbarkeit des HTML nichts zu tun.
  const source = [
    '---',
    'const x = 1;',
    '---',
    '<div></div>',
    '<script>',
    '  const jitter = Math.random() * 100;',
    '  setTimeout(() => {}, jitter);',
    '</script>',
  ].join('\n');

  assert.deepEqual(findRenderEntropy(source), []);
});

test('schweigt auch bei is:inline mit define:vars', () => {
  const source = '---\nconst a = 1;\n---\n<script is:inline define:vars={{ a }}>\nMath.random();\n</script>';
  assert.deepEqual(findRenderEntropy(source), []);
});

test('findet Zufall im Template-Ausdruck, nicht nur im Frontmatter', () => {
  // Ein Ausdruck im Markup läuft ebenfalls zur Build-Zeit.
  const source = '---\nconst a = 1;\n---\n<div id={`x-${Math.random()}`}></div>';
  const hits = findRenderEntropy(source);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].line, 4);
});

test('Zeilennummer stimmt, obwohl ein <script> davor ausgeblendet wurde', () => {
  // blankInlineBlocks ersetzt längentreu; ein ersatzloses Entfernen würde die
  // Zeilennummer um die Höhe des Blocks verschieben und auf die falsche Stelle
  // zeigen — ein Befund, den niemand wiederfindet, ist keiner.
  const source = [
    '---',
    'const a = 1;',
    '---',
    '<script>',
    '  // Zeile 5',
    '  // Zeile 6',
    '</script>',
    '<div id={Math.random()}></div>',
  ].join('\n');

  const hits = findRenderEntropy(source);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].line, 8);
});

test('blankInlineBlocks erhält Länge und Zeilenzahl', () => {
  const source = '---\nconst a=1;\n---\n<script>\nfoo();\n</script>\n<div></div>';
  const blanked = blankInlineBlocks(source);
  assert.equal(blanked.length, source.length, 'Länge verschoben');
  assert.equal(blanked.split('\n').length, source.split('\n').length, 'Zeilenzahl verschoben');
  assert.ok(!blanked.includes('foo()'), 'Script-Inhalt nicht ausgeblendet');
  assert.ok(blanked.includes('<div></div>'), 'Markup mit ausgeblendet');
});

test('erkennt crypto.randomUUID und randomBytes', () => {
  assert.equal(findRenderEntropy('---\nconst id = crypto.randomUUID();\n---').length, 1);
  assert.equal(findRenderEntropy("---\nconst b = randomBytes(8);\n---").length, 1);
});

test('ein Name mit „random" ohne Aufruf ist kein Befund', () => {
  // Sonst schlägt der Guard bei jedem Prop `randomize` oder `randomSeed` an.
  const source = '---\nconst { randomize = false } = Astro.props;\nconst randomSeed = 42;\n---';
  assert.deepEqual(findRenderEntropy(source), []);
});

test('ein Kommentar, der den Bug beschreibt, ist kein Bug', () => {
  // Gemessen am 11.08.2026: ohne dieses Ausblenden meldete der Guard die
  // Kopfkommentare der reparierten Motion-Komponenten — sie erklären den
  // Fehler und nennen Math.random() dabei wörtlich.
  const source = [
    '---',
    '/**',
    ' * Die ID kam früher aus `Math.random()`. Das ist der Grund für #650.',
    ' */',
    '// auch hier: Math.random() war der Fehler',
    'const a = 1;',
    '---',
  ].join('\n');

  assert.deepEqual(findRenderEntropy(source), []);
});

test('blankComments erhält Länge und Zeilenzahl', () => {
  const source = '---\n/* Math.random() */\nconst a = 1; // Math.random()\n---';
  const blanked = blankComments(source);
  assert.equal(blanked.length, source.length);
  assert.equal(blanked.split('\n').length, source.split('\n').length);
  assert.ok(blanked.includes('const a = 1;'), 'Code mit ausgeblendet');
});

test('eine URL in einer Zeichenkette überlebt das Kommentar-Ausblenden', () => {
  const source = "---\nconst u = 'https://blitzsicht.com';\nconst id = Math.random();\n---";
  const hits = findRenderEntropy(source);
  assert.equal(hits.length, 1, 'URL hat den Rest der Datei verschluckt');
  assert.equal(hits[0].line, 3);
});

test('Datumsfunktionen sind bewusst kein Befund', () => {
  // new Date() steht an sieben Stellen berechtigt im Paket (Copyright-Jahr,
  // datePosted). Innerhalb eines Build-Paars ist es stabil.
  const source = '---\nconst year = new Date().getFullYear();\nconst t = Date.now();\n---';
  assert.deepEqual(findRenderEntropy(source), []);
});

test('mehrere Treffer in einer Datei kommen nach Zeile sortiert', () => {
  const source = '---\nconst a = Math.random();\nconst b = 1;\nconst c = crypto.randomUUID();\n---';
  const hits = findRenderEntropy(source);
  assert.equal(hits.length, 2);
  assert.deepEqual(
    hits.map((h) => h.line),
    [2, 4],
  );
});

// ---------------------------------------------------------------------------
// Verzeichnis-Lauf
// ---------------------------------------------------------------------------

test('lintRenderEntropy zählt geprüfte Dateien und findet den Befund', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cw-entropy-'));
  mkdirSync(join(dir, 'components'), { recursive: true });
  writeFileSync(join(dir, 'sauber.astro'), '---\nconst a = 1;\n---\n<div></div>');
  writeFileSync(join(dir, 'components', 'kaputt.astro'), '---\nconst id = Math.random();\n---');
  writeFileSync(join(dir, 'egal.ts'), 'const x = Math.random();'); // keine .astro → nicht geprüft

  const { issues, checked } = lintRenderEntropy([dir]);
  assert.equal(checked, 2, 'Vorbedingung: beide .astro gelesen');
  assert.equal(issues.length, 1);
  assert.equal(issues[0].file, join('components', 'kaputt.astro'));
});

test('leeres Verzeichnis liefert checked=0 — kein grünes Ergebnis', () => {
  // Der dritte Zustand. Eine 0 bei den Befunden heisst nur dann „sauber",
  // wenn überhaupt etwas gelesen wurde.
  const dir = mkdtempSync(join(tmpdir(), 'cw-entropy-leer-'));
  const { issues, checked } = lintRenderEntropy([dir]);
  assert.equal(checked, 0);
  assert.deepEqual(issues, []);
});

test('nicht existierendes Verzeichnis wirft nicht', () => {
  const { issues, checked } = lintRenderEntropy(['/gibt/es/nicht/xyz']);
  assert.equal(checked, 0);
  assert.deepEqual(issues, []);
});

// ---------------------------------------------------------------------------
// Gegenprobe am echten Paket
// ---------------------------------------------------------------------------

test('die Motion-Komponenten dieses Pakets sind frei von Render-Zufall', () => {
  const { issues, checked } = lintRenderEntropy([MOTION_DIR]);
  assert.ok(checked > 0, 'Vorbedingung: Motion-Komponenten gelesen');
  assert.deepEqual(
    issues.map((i) => `${i.file}:${i.line}`),
    [],
    'Render-Zufall zurück in components/motion/',
  );
});

test('Gegenprobe: der reparierte StaggerGroup wird rot, sobald man den Bug einsetzt', () => {
  // Ein Check, der nie rot werden kann, ist kein Nachweis. Hier wird die echte
  // Datei gelesen und die alte Zeile wieder eingesetzt — der Guard muss anschlagen.
  const real = readFileSync(join(MOTION_DIR, 'StaggerGroup.astro'), 'utf-8');
  assert.deepEqual(findRenderEntropy(real), [], 'Vorbedingung: Datei ist sauber');

  const sabotiert = real.replace(
    '} = Astro.props;',
    '} = Astro.props;\nconst groupId = `stg-${Math.random().toString(36).slice(2, 9)}`;',
  );
  assert.notEqual(sabotiert, real, 'Vorbedingung: Sabotage hat gegriffen');
  assert.equal(findRenderEntropy(sabotiert).length, 1);
});

test('ENTROPY_PATTERNS sind global — sonst findet exec nur den ersten Treffer', () => {
  for (const { name, re } of ENTROPY_PATTERNS) {
    assert.ok(re.global, `${name} ohne /g`);
  }
});
