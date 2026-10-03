// @ts-check
/**
 * Das Vorlagen-Paar site-data + page-config muss im Zielrepo typprüfen.
 *
 * Warum: `templates-syntax.test.js` prüft nur Syntax, weil `page-config` die
 * Nachbardatei `./site-data` erst im Zielrepo findet. Genau dort ist das Paar am
 * 03.10.2026 rot gewesen (Review cw-site #2): ein frisch gescaffoldetes Repo
 * bekam von `pnpm check` 4 Fehler — `seo.titleTemplate` und
 * `analytics.trackingMode` gibt es in der Vorlage nicht, und `karriere.enabled`
 * war durch `as const` das Literal `true`, gegen das `!== false` nie wahr ist.
 *
 * Dieser Test baut das Zielrepo im Speicher nach: beide Vorlagen unter ihren
 * echten Namen, strict wie `astro/tsconfigs/strict`, und ein Shim für den
 * einzigen Import, den nur Astro auflösen kann (`BaseLayout.astro`).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const TEMPLATE_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'templates');
const lies = (/** @type {string} */ f) => readFileSync(join(TEMPLATE_DIR, f), 'utf8');

const SHIM = "declare module '@cw/core/layouts/BaseLayout.astro' { export type SchemaProps = Record<string, unknown>; }\n";

/**
 * Typprüft site-data + page-config wie im Zielrepo (src/data/).
 * @param {string} siteData
 * @param {string} pageConfig
 * @returns {string[]} Befunde als "datei:zeile TSnnnn text"
 */
export function typBefunde(siteData, pageConfig) {
  /** @type {Record<string, string>} */
  const dateien = {
    '/repo/src/data/site-data.ts': siteData,
    '/repo/src/data/page-config.ts': pageConfig,
    '/repo/src/shim.d.ts': SHIM,
  };
  /** @type {ts.CompilerOptions} */
  const optionen = {
    strict: true,
    noEmit: true,
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    skipLibCheck: true,
    types: [],
    lib: ['lib.esnext.d.ts', 'lib.dom.d.ts'],
  };
  const basis = ts.createCompilerHost(optionen);
  /** @type {ts.CompilerHost} */
  const host = {
    ...basis,
    fileExists: (f) => f in dateien || basis.fileExists(f),
    directoryExists: (d) =>
      Object.keys(dateien).some((f) => f.startsWith(d + '/')) || (basis.directoryExists?.(d) ?? false),
    readFile: (f) => dateien[f] ?? basis.readFile(f),
    getSourceFile: (f, v) =>
      f in dateien ? ts.createSourceFile(f, dateien[f], v, true) : basis.getSourceFile(f, v),
  };
  const programm = ts.createProgram(Object.keys(dateien), optionen, host);
  return ts.getPreEmitDiagnostics(programm).map((d) => {
    const text = ts.flattenDiagnosticMessageText(d.messageText, ' ');
    if (!d.file || d.start === undefined) return `TS${d.code} ${text}`;
    const { line } = d.file.getLineAndCharacterOfPosition(d.start);
    return `${d.file.fileName.replace('/repo/', '')}:${line + 1} TS${d.code} ${text}`;
  });
}

test('site-data.template.ts + page-config.template.ts typprüfen im Zielrepo', () => {
  const befunde = typBefunde(lies('site-data.template.ts'), lies('page-config.template.ts'));
  assert.deepEqual(befunde, [], befunde.join('\n'));
});

test('tsconfig.template.json liefert den Pfad-Alias @/*, den die Vorlagen importieren', () => {
  // llms-endpoint importiert '@/data/site-data'. Ohne Alias: Build rot (Review cw-site #1).
  assert.match(lies('llms-endpoint.ts.template'), /from ['"]@\/data\/site-data['"]/);
  const cfg = JSON.parse(lies('tsconfig.template.json'));
  assert.deepEqual(cfg.compilerOptions?.paths?.['@/*'], ['src/*']);
  assert.equal(cfg.extends, 'astro/tsconfigs/strict');
});

test('die Typprüfung schlägt bei einem echten Typfehler wirklich an', () => {
  // Gegenprobe: genau der Fehlertyp vom 03.10. — page-config liest ein Feld,
  // das site-data nicht hat. Ein Test, der nie rot werden kann, belegt nichts.
  const kaputt = lies('page-config.template.ts') + '\nexport const x = siteData.seo.gibtEsNicht;\n';
  const befunde = typBefunde(lies('site-data.template.ts'), kaputt);
  assert.ok(
    befunde.some((b) => b.includes('TS2339') && b.includes('gibtEsNicht')),
    `erwartet TS2339 zu gibtEsNicht, bekommen: ${befunde.join(' | ') || '(nichts)'}`,
  );
});
