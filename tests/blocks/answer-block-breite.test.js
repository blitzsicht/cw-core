// @ts-check
/**
 * AnswerBlock zentriert sich selbst, wenn er breiter steht als der Container.
 *
 * Lauf: `node --test tests/blocks/answer-block-breite.test.js`
 *
 * ANLASS (15.10.2026, v0.174.0): customer-brotzeithaeusl setzt AnswerBlock direkt in den
 * LandingPage-Slot; am Desktop lief die Karte über die volle Breite, der Text klebte am Rand.
 * Fast alle anderen Kunden umgehen das mit einem eigenen Wrapper (20 Repos). Die Regel muss in
 * Wrappern 0 px ergeben, sonst ändert sich die Flotte. Beleg im Browser (computed padding):
 * examples/answer-block (im Layout-Container) 0 px, Kunde ohne Wrapper bei 1400 px Viewport > 0.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const quelle = readFileSync(resolve(import.meta.dirname, '../../src/components/blocks/AnswerBlock.astro'), 'utf8');
const regel = (quelle.match(/\n  \.answer-block \{([^}]*)\}/) ?? [])[1] ?? '';

test('Regel steht in .answer-block: padding-inline mit max(0px, …) gegen --container-max', () => {
  assert.match(regel, /padding-inline:\s*max\(0px,\s*calc\(\(100% - var\(--container-max, 72rem\)\) \/ 2\)\)/);
});
