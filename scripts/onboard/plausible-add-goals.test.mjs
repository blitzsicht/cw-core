#!/usr/bin/env node
/**
 * Tests für plausible-add-goals.mjs — SQL-Bausteine des Goal-Provisioners
 * (INSERT/DELETE-Idempotenz, Injection-Escaping, Flag-Parsing, Rollback-Symmetrie).
 *
 * Reine Logik-Tests ohne SSH/DB — die pure Funktionen sind exportiert, main()
 * läuft nur bei Direktaufruf (nicht beim Import).
 *
 * Ausführen:  node --test scripts/onboard/plausible-add-goals.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseArgs,
  parseGoalList,
  sqlEscape,
  goalInsertSql,
  goalDeleteSql,
  buildSql,
  buildRemoveSql,
} from './plausible-add-goals.mjs';

// ─── parseGoalList ───────────────────────────────────────────────────────────
test('parseGoalList: trennt Event- und Pageview-Goals per "/"-Präfix, trimmt', () => {
  const goals = parseGoalList('Form Submit, /danke ,Phone Click');
  assert.deepEqual(goals, [
    { type: 'event', value: 'Form Submit' },
    { type: 'page', value: '/danke' },
    { type: 'event', value: 'Phone Click' },
  ]);
});

test('parseGoalList: filtert leere Segmente (Trailing-Comma / Whitespace)', () => {
  assert.deepEqual(parseGoalList('A,, ,B'), [
    { type: 'event', value: 'A' },
    { type: 'event', value: 'B' },
  ]);
});

// ─── sqlEscape (Negativtest: Injection-Schutz) ───────────────────────────────
test('sqlEscape: verdoppelt einfache Quotes (verhindert String-Breakout)', () => {
  assert.equal(sqlEscape("O'Brien"), "O''Brien");
  // Der klassische Injection-Versuch darf nicht als Statement-Ende durchkommen.
  assert.equal(sqlEscape("x'); DROP TABLE goals;--"), "x''); DROP TABLE goals;--");
});

test('goalDeleteSql: Goal-Name mit Apostroph wird im DELETE sauber escaped', () => {
  const sql = goalDeleteSql('kunde.de', { type: 'event', value: "It's a Lead" });
  assert.match(sql, /event_name='It''s a Lead'/);
});

// ─── goalInsertSql ───────────────────────────────────────────────────────────
test('goalInsertSql: mit display_name-Spalte + NOT-EXISTS-Idempotenz', () => {
  const sql = goalInsertSql('kunde.de', { type: 'event', value: 'Form Submit' }, true);
  assert.match(sql, /INSERT INTO goals \(site_id, event_name, display_name, inserted_at, updated_at\)/);
  assert.match(sql, /NOT EXISTS \(SELECT 1 FROM goals g WHERE g\.site_id=s\.id AND g\.event_name='Form Submit'\)/);
  assert.match(sql, /WHERE s\.domain='kunde\.de'/);
});

test('goalInsertSql: ohne display_name + Pageview-Goal nutzt page_path', () => {
  const sql = goalInsertSql('kunde.de', { type: 'page', value: '/danke' }, false);
  assert.doesNotMatch(sql, /display_name/);
  assert.match(sql, /INSERT INTO goals \(site_id, page_path, inserted_at, updated_at\)/);
  assert.match(sql, /g\.page_path='\/danke'/);
});

// ─── goalDeleteSql (Rollback) ────────────────────────────────────────────────
test('goalDeleteSql: löscht scoped per Site-Subquery + exaktem Spaltenwert', () => {
  const sql = goalDeleteSql('kunde.de', { type: 'event', value: 'Phone Click' });
  assert.match(sql, /DELETE FROM goals/);
  assert.match(sql, /WHERE site_id IN \(SELECT id FROM sites WHERE domain='kunde\.de'\)/);
  assert.match(sql, /AND event_name='Phone Click';/);
});

// ─── Rollback-Symmetrie: DELETE ist echte Umkehr des INSERT ──────────────────
test('Symmetrie: goalInsertSql und goalDeleteSql treffen dieselbe Spalte/denselben Wert', () => {
  const goal = { type: 'page', value: '/danke' };
  const ins = goalInsertSql('kunde.de', goal, true);
  const del = goalDeleteSql('kunde.de', goal);
  // beide referenzieren page_path='/danke' — der Remove löscht exakt, was der Add anlegt
  assert.match(ins, /page_path/);
  assert.match(del, /page_path='\/danke'/);
});

// ─── buildSql / buildRemoveSql (Transaktions-Wrapper) ────────────────────────
test('buildSql/buildRemoveSql: BEGIN;…COMMIT; mit genau einem Statement pro Goal', () => {
  const goals = [
    { type: 'event', value: 'Form Submit' },
    { type: 'page', value: '/danke' },
  ];
  const ins = buildSql('kunde.de', goals, true);
  assert.ok(ins.startsWith('BEGIN;'));
  assert.ok(ins.trimEnd().endsWith('COMMIT;'));
  assert.equal((ins.match(/INSERT INTO goals/g) || []).length, 2);

  const del = buildRemoveSql('kunde.de', goals);
  assert.ok(del.startsWith('BEGIN;'));
  assert.ok(del.trimEnd().endsWith('COMMIT;'));
  assert.equal((del.match(/DELETE FROM goals/g) || []).length, 2);
});

// ─── parseArgs ───────────────────────────────────────────────────────────────
test('parseArgs: --remove + --apply werden erkannt, Defaults sind false', () => {
  const a = parseArgs(['--domain', 'kunde.de', '--remove', '--apply']);
  assert.equal(a.domain, 'kunde.de');
  assert.equal(a.remove, true);
  assert.equal(a.apply, true);

  const b = parseArgs(['--domain', 'x.de']);
  assert.equal(b.remove, false);
  assert.equal(b.apply, false);
  assert.equal(b.optional, false);
});

// ─── Default-Set nach der Erweiterung vom 28.08.2026 ────────────────────────

test('Default-Set enthält CORE + QUALITY + FUNNEL', async () => {
  const { CORE_GOALS, QUALITY_GOALS, FUNNEL_GOALS } = await import('./plausible-goals.mjs');
  const namen = [...CORE_GOALS, ...QUALITY_GOALS, ...FUNNEL_GOALS].map((g) => g.value);
  assert.ok(namen.includes('404 Error'), 'QUALITY gehört ins Default-Set');
  assert.ok(namen.includes('Form Start'), 'FUNNEL gehört ins Default-Set');
  assert.ok(namen.includes('Form Submit'), 'CORE bleibt drin');
});

test('SITE_GOALS: falzmarke führt github_klick, obwohl es noch nicht feuerte', async () => {
  const { SITE_GOALS } = await import('./plausible-goals.mjs');
  const namen = SITE_GOALS.falzmarke.map((g) => g.value);
  assert.ok(namen.includes('github_klick'),
    'sonst entstünde beim Deploy ein Event ohne Goal — genau die Lücke, die hier geschlossen wird');
  assert.ok(namen.includes('skill_download'));
});

test('SITE_GOALS: Slugs ohne eigene Events haben KEINEN leeren Eintrag', async () => {
  const { SITE_GOALS } = await import('./plausible-goals.mjs');
  assert.equal(SITE_GOALS.gympanzen, undefined, 'ein leerer Eintrag wäre irreführend');
  assert.equal(SITE_GOALS.preshot, undefined);
});

test('ENGAGEMENT_IGNORE und Goal-Gruppen überschneiden sich nicht', async () => {
  const m = await import('./plausible-goals.mjs');
  const alle = [...m.CORE_GOALS, ...m.QUALITY_GOALS, ...m.FUNNEL_GOALS, ...m.OPTIONAL_GOALS, ...m.PAID_GOALS]
    .map((g) => g.value);
  for (const e of m.ENGAGEMENT_IGNORE) {
    assert.ok(!alle.includes(e), `${e} darf nicht gleichzeitig Goal und ignoriert sein`);
  }
});

test('LEGACY_ALIASES zeigen auf Namen, die es wirklich gibt', async () => {
  const m = await import('./plausible-goals.mjs');
  const alle = [...m.CORE_GOALS, ...m.QUALITY_GOALS, ...m.FUNNEL_GOALS].map((g) => g.value);
  for (const [alt, gueltig] of Object.entries(m.LEGACY_ALIASES)) {
    assert.ok(alle.includes(gueltig), `Alias ${alt} zeigt auf ${gueltig}, das in keiner Gruppe steht`);
  }
});
