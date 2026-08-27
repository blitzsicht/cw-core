// @ts-check
/**
 * Rundlauf-Test für die Arbeitsliste: Einordnung → erzeugter Deklarationstext →
 * geparste Regel → Auflösung.
 *
 * Lauf: `node --test scripts/bildherkunft-arbeitsliste.test.mjs`
 *
 * Warum genau diese Kette: Der erzeugte Text wird vom Operator in eine Kunden-
 * `site-data.ts` eingesetzt. Ist er kaputt, faellt das erst beim naechsten Build dieses
 * Kunden auf — weit weg von hier, und ohne Hinweis auf die Ursache. Der teuerste Fall ist
 * dabei nicht der Syntaxfehler (der bricht wenigstens laut), sondern die Regel, die zwar
 * parst, aber etwas anderes bedeutet als eingeordnet wurde.
 *
 * Der Ausloeser stand im ersten Entwurf: die Begruendung kommt aus einem `<textarea>`,
 * und ein Zeilenumbruch darin haette den einfach gequoteten String zerrissen.
 *
 * Abdeckung:
 *   1. alsLiteral hält Apostroph, Backslash, Zeilenumbruch
 *   2. regelZeile für public/ (pathPrefix) und src/ (stem)
 *   3. Rundlauf: erzeugter Text parst und loest wieder auf, was eingeordnet wurde
 *   4. Der Rundlauf überlebt eine Begruendung mit Sonderzeichen
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, rmSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SKRIPT = join(dirname(fileURLToPath(import.meta.url)), 'bildherkunft-arbeitsliste.mjs');
import { alsLiteral, regelZeile } from './bildherkunft-arbeitsliste.mjs';
import {
  resolveBildHerkunft,
  istKennzeichnungspflichtig,
  pruefeBildHerkunftRegeln,
} from '../src/utils/bildherkunft.js';

/** Den erzeugten Text so auswerten, wie es eine `site-data.ts` täte. */
function parseRegeln(zeilen) {
  // eslint-disable-next-line no-new-func
  return new Function('return [' + zeilen.join('\n') + '];')();
}

test('1. alsLiteral hält Apostroph, Backslash und Zeilenumbruch', () => {
  assert.equal(alsLiteral("Team's Foto"), "'Team\\'s Foto'");
  assert.equal(alsLiteral('C:\\pfad'), "'C:\\\\pfad'");
  assert.equal(alsLiteral('Zeile1\nZeile2'), "'Zeile1\\nZeile2'");
  assert.equal(alsLiteral('Zeile1\r\nZeile2'), "'Zeile1\\nZeile2'");
  assert.equal(alsLiteral(undefined), "''");
  // Der springende Punkt: das Ergebnis muss ein gültiges JS-Literal sein.
  for (const roh of ["a'b", 'a\\b', 'a\nb', "misch\\'ung\nmit allem"]) {
    // eslint-disable-next-line no-new-func
    assert.equal(new Function('return ' + alsLiteral(roh))(), roh.replace(/\r\n?|\n/g, '\n'));
  }
});

test('2. regelZeile schreibt pathPrefix für public/ und stem für src/', () => {
  const ki = { h: 'ki-erzeugt', d: 'ja', b: 'Team existiert so nicht' };
  assert.match(regelZeile('pathPrefix', 'images/team/a.webp', ki), /pathPrefix: 'images\/team\/a\.webp'/);
  assert.match(regelZeile('stem', 'handwerker-hero', ki), /stem: 'handwerker-hero'/);
  // Menschliche Fotos tragen weder deepfake noch begruendung — das Feld wäre dort
  // bedeutungslos und würde vom Regelpruefer als Widerspruch zurueckgewiesen.
  const zeile = regelZeile('pathPrefix', 'images/halle.webp', { h: 'mensch' });
  assert.doesNotMatch(zeile, /deepfake|begruendung/);
});

test('2b. regelZeile schreibt die Einordnung auch bei herkunft=ungeklaert', () => {
  // Der Fehler, den dieser Test festhaelt (24.08.2026): `regelZeile` gab deepfake und
  // begruendung nur bei ki-* aus. Als das Format später „Herkunft offen, aber sicher kein
  // Deepfake" zuliess — der Fall von rund 110 Grafiken der Flotte — wurde die Funktion nicht
  // nachgezogen. Die erzeugte Regel verlor still ihre Einordnung und landete im Repo als
  // bloßes `ungeklaert`. Gefunden hat es der Regelpruefer vor dem Schreiben, nicht der Autor.
  const e = { h: 'ungeklaert', d: 'nein', b: 'Isometrische Illustration, aehnelt nichts Wirklichem' };
  const zeile = regelZeile('pathPrefix', 'images/icons/a.svg', e);
  assert.match(zeile, /deepfake: 'nein'/);
  assert.match(zeile, /begruendung: 'Isometrische/);

  // Und die erzeugte Regel muss den eigenen Pruefer passieren — sonst wandert ein Befund
  // in die Kunden-site-data.
  const data = { bildHerkunft: parseRegeln([zeile]) };
  assert.deepEqual(pruefeBildHerkunftRegeln(data), []);
  assert.equal(resolveBildHerkunft(data, 'images/icons/a.svg').problem, null);
});

test('3. Rundlauf: was eingeordnet wurde, kommt aus der Auflösung wieder heraus', () => {
  const einordnung = [
    ['pathPrefix', 'images/team/gruppe.webp', { h: 'ki-erzeugt', d: 'ja', b: 'Fotorealistisches Team, das so nie existiert hat' }],
    ['pathPrefix', 'images/render/produkt.webp', { h: 'ki-erzeugt', d: 'nein', b: 'Erkennbar illustratives Rendering' }],
    ['pathPrefix', 'images/halle/aussen.webp', { h: 'mensch' }],
    ['stem', 'handwerker-hero', { h: 'ki-erzeugt', d: 'ja', b: 'Szene ohne reale Vorlage' }],
    ['stem', 'johannes-portrait', { h: 'mensch' }],
  ];

  const data = { bildHerkunft: parseRegeln(einordnung.map(([k, w, e]) => regelZeile(k, w, e))) };

  // Der erzeugte Satz muss aus Sicht des Regelprüfers fehlerfrei sein — sonst wandert
  // ein Befund in die Kunden-site-data.
  assert.deepEqual(pruefeBildHerkunftRegeln(data), []);

  const erwartet = [
    ['images/team/gruppe.webp', true],
    ['images/render/produkt.webp', false],
    ['images/halle/aussen.webp', false],
    ['_astro/handwerker-hero.Bng-bGX1.webp', true],
    ['_astro/johannes-portrait.CfN3xWBi.webp', false],
  ];
  for (const [pfad, pflicht] of erwartet) {
    const r = resolveBildHerkunft(data, pfad);
    assert.equal(istKennzeichnungspflichtig(r), pflicht, `${pfad}`);
    assert.equal(r.problem, null, `${pfad} darf keinen Befund tragen`);
  }

  // Und die Begründung überlebt den Rundlauf — sie ist der Nachweis.
  assert.equal(
    resolveBildHerkunft(data, 'images/render/produkt.webp').begruendung,
    'Erkennbar illustratives Rendering',
  );
});

test('5. das erzeugte Seiten-Skript ist syntaktisch gültig', () => {
  // Ein Syntaxfehler IM MODUL faellt schon beim Import oben auf. Was niemand prueft, ist das
  // Skript IN der erzeugten Seite: es entsteht als String und wird nie von Node geparst.
  // Ein Tippfehler dort erzeugt eine Arbeitsliste, die sich oeffnen laesst, aber auf keinen
  // Klick reagiert — und das faellt erst dem Operator auf, mitten in der Einordnung.
  // Eigene Registry-Attrappe statt der echten aus dem Nachbarrepo: bis zum
  // 27.08.2026 trug das Skript den Pfad eines bestimmten Rechners fest
  // eingebaut. Der Test war deshalb nur dort gruen — in der ersten CI von
  // cw-core starb er sofort mit ENOENT. Ein Test, der eine Datei ausserhalb
  // des Repos braucht, prueft die Umgebung mit, nicht nur den Code.
  const reg = join(tmpdir(), 'bh-syntaxtest-registry.json');
  const repoAttrappe = mkdtempSync(join(tmpdir(), 'bh-repo-'));
  writeFileSync(
    reg,
    JSON.stringify({
      customers: [
        {
          slug: 'platzfrei',
          lifecycle: 'live',
          repo_path: repoAttrappe,
          production_url: 'https://example.invalid/',
        },
      ],
    }),
    'utf8',
  );

  const html = execFileSync(
    process.execPath,
    [SKRIPT, '--site', 'platzfrei', '--out', join(tmpdir(), 'bh-syntaxtest.html'), '--no-open'],
    { encoding: 'utf8', env: { ...process.env, CW_REGISTRY: reg } },
  ) && readFileSync(join(tmpdir(), 'bh-syntaxtest.html'), 'utf8');

  const treffer = html.match(/<script>([\s\S]*?)<\/script>/);
  assert.ok(treffer, 'die Seite muss ein Skript enthalten');
  const js = treffer[1];

  const jsDatei = join(tmpdir(), 'bh-syntaxtest.js');
  writeFileSync(jsDatei, js, 'utf8');
  // `node --check` parst, ohne auszufuehren — genau das, was der Browser beim Laden tut.
  execFileSync(process.execPath, ['--check', jsDatei]);

  // Und die beiden Helfer muessen wirklich drin stehen, nicht bloss der Aufruf: sonst
  // wäre die Seite syntaktisch heil und trotzdem funktionslos.
  assert.match(js, /function alsLiteral/);
  assert.match(js, /function regelZeile/);
  assert.doesNotMatch(js, /^export /m, 'kein durchgerutschtes export-Schluesselwort');

  rmSync(jsDatei, { force: true });
  rmSync(join(tmpdir(), 'bh-syntaxtest.html'), { force: true });
  rmSync(reg, { force: true });
  rmSync(repoAttrappe, { recursive: true, force: true });
});

test('4. der Rundlauf überlebt eine Begründung mit Sonderzeichen', () => {
  const b = "Kunde's Halle,\nBild aus dem Generator \\ ohne reale Vorlage";
  const data = {
    bildHerkunft: parseRegeln([regelZeile('pathPrefix', 'images/x.webp', { h: 'ki-erzeugt', d: 'ja', b })]),
  };
  assert.deepEqual(pruefeBildHerkunftRegeln(data), []);
  const r = resolveBildHerkunft(data, 'images/x.webp');
  assert.equal(istKennzeichnungspflichtig(r), true);
  assert.equal(r.begruendung, b);
});
