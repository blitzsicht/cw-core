// @ts-check
/**
 * Die Vorlagen in src/templates/ muessen wenigstens syntaktisch heil sein.
 *
 * Warum ueberhaupt: `page-config.template.ts` importiert `./site-data` — eine
 * Datei, die es erst im Zielrepo gibt. `astro check` kann das hier nicht
 * aufloesen und meldete bis zum 27.08.2026 einen Typfehler, der nie zu beheben
 * war. Die Datei steht deshalb jetzt in `tsconfig.json` unter `exclude`.
 *
 * Ein Ausschluss ohne Ersatz waere aber genau die Fassade, gegen die die neue
 * CI gebaut wurde: eine Vorlage mit Tippfehler faellt sonst erst beim Kunden
 * auf, weit weg von hier. Dieser Test parst jede Vorlage und bricht bei einem
 * Syntaxfehler ab. Typen prueft er bewusst nicht — das kann nur das Zielrepo,
 * wo die Nachbardateien existieren.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const TEMPLATE_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'templates');

/**
 * Parst eine TypeScript-Quelle und liefert die Syntax-Befunde.
 * Nur Syntax — keine Modulaufloesung, keine Typen.
 * @param {string} quelle
 * @param {string} name
 * @returns {string[]}
 */
export function syntaxBefunde(quelle, name) {
  const out = ts.transpileModule(quelle, {
    reportDiagnostics: true,
    fileName: name,
    compilerOptions: { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext },
  });
  return (out.diagnostics ?? []).map((d) =>
    ts.flattenDiagnosticMessageText(d.messageText, ' '),
  );
}

const vorlagen = readdirSync(TEMPLATE_DIR).filter((f) => extname(f) === '.ts');

test('Vorbedingung: es gibt ueberhaupt .ts-Vorlagen zu pruefen', () => {
  // Eine leere Menge gegen eine leere Menge zu pruefen waere gruen und belegte nichts.
  assert.ok(vorlagen.length > 0, `keine .ts-Vorlage in ${TEMPLATE_DIR} gefunden`);
});

for (const datei of vorlagen) {
  test(`${datei} parst ohne Syntaxfehler`, () => {
    const quelle = readFileSync(join(TEMPLATE_DIR, datei), 'utf8');
    const befunde = syntaxBefunde(quelle, datei);
    assert.deepEqual(befunde, [], `${datei}: ${befunde.join(' | ')}`);
  });
}

test('die Pruefung schlaegt bei einem Syntaxfehler wirklich an', () => {
  // Ein Test, der nie rot werden kann, ist kein Nachweis.
  const kaputt = 'export const x = { a: 1,,, };\nfunction (';
  assert.ok(
    syntaxBefunde(kaputt, 'kaputt.ts').length > 0,
    'syntaxBefunde meldet einen offensichtlichen Syntaxfehler nicht',
  );
});
