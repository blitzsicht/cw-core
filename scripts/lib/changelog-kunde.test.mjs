// @ts-check
/**
 * Tests für das Kunden-Marker-Gate des Release-Trains.
 *
 * Der Gegenbeweis ist hier wichtiger als der Grünfall: ein Gate, das nie „bumpen" sagt,
 * hielte die Flotte still und niemand merkte es. Deshalb prüft jeder Fall BEIDE Richtungen,
 * und `unbekannt` bekommt eigene Fälle — es ist der Zustand, der am ehesten still als
 * „nur Tooling" durchrutscht und dann Kundenfixes verschluckt.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareVersions, kundenwirkung, parseChangelog, parseVersion } from './changelog-kunde.mjs';

const CL = `# Changelog

> Vorspann, kein Versions-Abschnitt.

---

## v0.115.0 (2026-08-13)

- [kunde:sichtbar] Die Überschrift erscheint wieder in voller Größe.

**Fix:** Hero-Titel.

---

## v0.114.0 (2026-08-13)

**Fix:** Guard-Logging. Reines Agentur-Tooling.

---

## v0.113.0 (2026-08-12)

**Fix:** Perf-Budget misst auch .avif.

---

## v0.112.0 (2026-08-12)

- [kunde] Der Vorab-Check prüft ab sofort auch Bilder.

**Feature:** assetRefChecks hart.

---

## v0.9.0-alpha (2026-04-20)

**Feature:** irgendwas Altes.
`;

test('1. parseVersion liest Tag-Refs, blanke Versionen und Prereleases', () => {
  assert.deepEqual(parseVersion('release/cw-core/v0.115.0')?.nums, [0, 115, 0]);
  assert.deepEqual(parseVersion('v0.9.0-alpha')?.pre, 'alpha');
  assert.equal(parseVersion('kein-tag'), null);
});

test('2. compareVersions: Release schlägt Prerelease', () => {
  assert.ok(compareVersions('v0.9.0', 'v0.9.0-alpha') > 0);
  assert.ok(compareVersions('v0.114.0', 'v0.115.0') < 0);
  assert.equal(compareVersions('v0.115.0', 'release/cw-core/v0.115.0'), 0);
  // 115 > 9 — Stringvergleich waere hier falsch herum.
  assert.ok(compareVersions('v0.115.0', 'v0.9.0') > 0);
});

test('3. parseChangelog findet alle Abschnitte und ordnet Marker richtig zu', () => {
  const e = parseChangelog(CL);
  assert.equal(e.length, 5);
  assert.equal(e[0].version, 'v0.115.0');
  assert.equal(e[0].kundenzeilen.length, 1);
  assert.equal(e[0].kundenzeilen[0].sichtbar, true);
  // Die Marker duerfen nicht in den Nachbarabschnitt rutschen.
  assert.equal(e[1].kundenzeilen.length, 0);
  assert.equal(e[3].kundenzeilen[0].sichtbar, false);
});

test('4. kundenwirksam: [kunde:sichtbar] in der Spanne → bumpen', () => {
  const r = kundenwirkung(CL, 'v0.114.0', 'v0.115.0');
  assert.equal(r.status, 'kundenwirksam');
  assert.equal(r.sichtbar, true);
  assert.equal(r.geprueft, 1);
  assert.equal(r.zeilen.length, 1);
});

test('5. GEGENBEWEIS nur-tooling: Spanne ohne jede [kunde]-Zeile → Skip', () => {
  const r = kundenwirkung(CL, 'v0.112.0', 'v0.114.0');
  assert.equal(r.status, 'nur-tooling');
  assert.equal(r.geprueft, 2, 'v0.113.0 und v0.114.0 muessen geprueft worden sein');
  assert.deepEqual(r.versionen, ['v0.114.0', 'v0.113.0']);
  assert.equal(r.zeilen.length, 0);
});

test('6. Der Startpunkt ist EXKLUSIV — die eigene Version zaehlt nicht mit', () => {
  // v0.112.0 traegt selbst eine [kunde]-Zeile. Wer schon darauf steht, hat sie bekommen.
  const r = kundenwirkung(CL, 'v0.112.0', 'v0.113.0');
  assert.equal(r.status, 'nur-tooling', 'die [kunde]-Zeile von v0.112.0 darf nicht zaehlen');
  assert.equal(r.geprueft, 1);
});

test('7. …das Ziel dagegen INKLUSIV', () => {
  const r = kundenwirkung(CL, 'v0.113.0', 'v0.115.0');
  assert.equal(r.status, 'kundenwirksam');
  assert.equal(r.geprueft, 2);
});

test('8. unbekannt: Kunden-Pin fehlt im CHANGELOG → NICHT als Tooling werten', () => {
  const r = kundenwirkung(CL, 'v0.39.0', 'v0.115.0');
  assert.equal(r.status, 'unbekannt');
  assert.match(r.grund, /fehlt im CHANGELOG/);
  assert.equal(r.geprueft, 0);
});

test('9. unbekannt: Ziel fehlt im CHANGELOG (cw-release Schritt 4 vergessen)', () => {
  const r = kundenwirkung(CL, 'v0.114.0', 'v0.116.0');
  assert.equal(r.status, 'unbekannt');
  assert.match(r.grund, /v0\.116\.0 fehlt/);
});

test('10. unbekannt: leere Spanne beweist nichts', () => {
  const r = kundenwirkung(CL, 'v0.115.0', 'v0.115.0');
  assert.equal(r.status, 'unbekannt');
  assert.match(r.grund, /0 Versionen/);
});

test('11. unbekannt: unlesbarer Pin und leeres CHANGELOG', () => {
  assert.equal(kundenwirkung(CL, 'irgendwas', 'v0.115.0').status, 'unbekannt');
  assert.equal(kundenwirkung('', 'v0.114.0', 'v0.115.0').status, 'unbekannt');
});

test('12. Am ECHTEN CHANGELOG: v0.112.0 → v0.115.0 ist kundenwirksam', async () => {
  const { readFileSync } = await import('node:fs');
  const { dirname, join } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const md = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'CHANGELOG.md'), 'utf8');

  const echt = kundenwirkung(md, 'release/cw-core/v0.112.0', 'release/cw-core/v0.115.0');
  assert.equal(echt.status, 'kundenwirksam');
  assert.equal(echt.sichtbar, true, 'v0.115.0 traegt [kunde:sichtbar]');
  assert.ok(echt.geprueft >= 3, `Vorbedingung: mindestens 3 Versionen geprueft, waren ${echt.geprueft}`);

  // Gegenprobe am selben echten Dokument: die Spanne v0.113.0 → v0.114.0 ist reines Tooling.
  const tooling = kundenwirkung(md, 'release/cw-core/v0.113.0', 'release/cw-core/v0.114.0');
  assert.equal(tooling.status, 'nur-tooling');
  assert.equal(tooling.geprueft, 1);
});
