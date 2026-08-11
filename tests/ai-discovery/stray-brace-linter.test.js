// @ts-check
/**
 * Tests für den Stray-Brace-Guard (lintPageStrayBraces) in ai-discovery.
 *
 * Lauf: `node --test tests/ai-discovery/stray-brace-linter.test.js`
 *
 * Auslöser (blitzsicht-ops#652): der Astro-Compiler (2.13.1) beendet einen
 * Template-Ausdruck zu früh, wenn ein Regex-Literal darin Anführungszeichen in der
 * Zeichenklasse trägt — `{v.replace(/['"]/g, '')}`. Die schließende Klammer landet als Text
 * in der Seite. In customer-blitzsicht rendered jedes Schriftmuster der Brand-Guides
 * monatelang „Work Sans}" / „Inter Variable}". Kein Guard schlug an.
 *
 * Geprüft wird die allgemeine Form (Syntaxzeichen, die als Text ausgegeben werden), nicht
 * dieser eine Regex-Fall.
 *
 * Abdeckung:
 *   1. Der echte Bug ("Work Sans}") → Befund          ← Gegenprobe, ohne die wäre jedes Grün leer
 *   2. Sauberer Textknoten → kein Befund
 *   3. Balancierte Klammern in Prosa → kein Befund
 *   4. Verwaiste { (Spiegelfall) → Befund
 *   5. Unbalanciert in <pre>/<code> → KEIN Befund
 *   6. Unbalanciert in <script>/<style> → kein Befund
 *   7. Mehrere Treffer auf einer Seite → count + page stimmen
 *   8. Datei fehlt / leeres HTML → leer, kein Crash
 *   9. HTML-Entity &#125; → kein Befund
 *  10. "}{" ist zweimal verwaist, nicht ausgeglichen
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { lintPageStrayBraces } from '../../src/integrations/ai-discovery/index.ts';

/** Schreibt eine index.html in ein temp-dist und gibt {dist, file} zurück. */
function makePage(html) {
  const dist = mkdtempSync(join(tmpdir(), 'brace-lint-'));
  const dir = join(dist, 'seite');
  mkdirSync(dir, { recursive: true });
  const file = join(dir, 'index.html');
  writeFileSync(file, html);
  return { dist, file };
}

/** Führt fn mit einer temp-Seite aus und räumt danach auf. */
function withPage(html, fn) {
  const { dist, file } = makePage(html);
  try {
    return fn(lintPageStrayBraces(file, dist));
  } finally {
    rmSync(dist, { recursive: true, force: true });
  }
}

test('1. [Gegenprobe — echter Bug] "Work Sans}" im Textknoten → Befund', () => {
  // Wörtlich der Ausschnitt aus customer-blitzsicht/dist vor dem Fix (6ca738d).
  // Ohne diesen Fall wäre jedes grüne Ergebnis nur Abwesenheit, kein Nachweis.
  withPage(
    '<span class="type-font-name" style="font-family:\'Work Sans\'"> Work Sans}</span>',
    (issues) => {
      assert.equal(issues.length, 1);
      assert.equal(issues[0].type, 'stray_brace');
      assert.equal(issues[0].page, '/seite/');
      assert.match(issues[0].detail, /Work Sans\}/);
      assert.match(issues[0].detail, /verwaiste \}/);
      assert.match(issues[0].detail, /Frontmatter/);
    },
  );
});

test('2. Sauberer Textknoten → kein Befund', () => {
  withPage('<span> Work Sans </span><p>Ganz normaler Fließtext.</p>', (issues) => {
    assert.deepEqual(issues, []);
  });
});

test('3. Balancierte Klammern in Prosa → kein Befund', () => {
  // Ein Blogpost darf über JSON schreiben. Balanciert = gewollt.
  withPage('<p>Die Konfiguration sieht so aus: { "a": 1 } — mehr nicht.</p>', (issues) => {
    assert.deepEqual(issues, []);
  });
});

test('4. Verwaiste { (Spiegelfall) → Befund', () => {
  withPage('<p>Text mit einer offenen { Klammer</p>', (issues) => {
    assert.equal(issues.length, 1);
    assert.match(issues[0].detail, /verwaiste \{/);
  });
});

test('5. Unbalanciert in <pre>/<code> → KEIN Befund', () => {
  // Code-Beispiele dürfen unbalanciert sein — genau dafür sind sie da.
  // Code-Blöcke gibt es auf 17 der 22 Sites (Messung 11.08.2026).
  withPage(
    '<pre><code>if (x) {\n  doSomething();</code></pre><p>Erklärung dazu.</p>',
    (issues) => {
      assert.deepEqual(issues, [], 'Code-Beispiel darf nicht flaggen');
    },
  );
  withPage('<p>Nutze <code>}</code> zum Schließen.</p>', (issues) => {
    assert.deepEqual(issues, [], 'Inline-<code> darf nicht flaggen');
  });
});

test('6. Unbalanciert in <script>/<style> → kein Befund', () => {
  withPage(
    '<script>const f = () => { return 1; };</script><style>.a{color:red}</style><p>Text.</p>',
    (issues) => {
      assert.deepEqual(issues, []);
    },
  );
  // JSON-LD ist ebenfalls ein <script> und steckt auf jeder Seite der Fleet.
  withPage('<script type="application/ld+json">{"@type":"Organization"}</script>', (issues) => {
    assert.deepEqual(issues, []);
  });
});

test('7. Mehrere Treffer auf einer Seite → count + page stimmen', () => {
  // Der reale Fall: zwei Schriftmuster pro Brand-Guide-Seite.
  withPage('<span> Work Sans}</span><span> Inter}</span>', (issues) => {
    assert.equal(issues.length, 2);
    assert.ok(issues.every((i) => i.page === '/seite/'));
    assert.match(issues[0].detail, /Work Sans/);
    assert.match(issues[1].detail, /Inter/);
  });
});

test('8. Datei fehlt / leeres HTML → leer, kein Crash', () => {
  assert.deepEqual(lintPageStrayBraces('/pfad/gibt/es/nicht/index.html', '/pfad'), []);
  withPage('', (issues) => assert.deepEqual(issues, []));
  withPage('<html><body></body></html>', (issues) => assert.deepEqual(issues, []));
});

test('9. HTML-Entity &#125; → kein Befund', () => {
  // Eine als Entity geschriebene Klammer ist gewollter Text, kein Parser-Artefakt.
  withPage('<p>Die schließende Klammer &#125; beendet den Block.</p>', (issues) => {
    assert.deepEqual(issues, []);
  });
  withPage('<p>Auch benannt: &rbrace; und &lbrace;</p>', (issues) => {
    assert.deepEqual(issues, []);
  });
});

test('10. "}{" zählt als zweimal verwaist, nicht als ausgeglichen', () => {
  // Naives Zählen (Anzahl { == Anzahl }) würde das durchwinken. Die Reihenfolge zählt.
  withPage('<p>Kaputt: }{ mittendrin</p>', (issues) => {
    assert.equal(issues.length, 1);
    assert.match(issues[0].detail, /1× verwaiste \}/);
    assert.match(issues[0].detail, /1× verwaiste \{/);
  });
});
