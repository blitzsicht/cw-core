// @ts-check
/**
 * Plausible-Meldung im ContactForm: ein Honeypot-Treffer ist `Form Bot`, keine Conversion.
 *
 * Lauf: `node --test tests/forms/submit-meldung.test.js`
 *
 * ANLASS (19.10.2026, blitzsicht-ops#968): Der contact-handler antwortet einem Bot, der
 * den Honeypot füllt, still mit `200 {ok:true}`. Das Formular meldete daraufhin
 * `Form Submit status=success` — auf blitzsicht.com waren 4 von 4 „Kontaktanfragen"
 * solche Bots (Vercel-Log `honeypot triggered`, sekundengenau). Das Plausible-Ziel
 * „Form Submit" zählt jeden Status, deshalb ein eigener Ereignisname.
 *
 * Geprüft wird mit echtem `FormData`, nicht mit einem Objekt-Ersatz: `botcheck` ist eine
 * Checkbox, die angehakt `"on"` liefert und nicht angehakt gar nicht im FormData steht.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { honeypotGefuellt, submitMeldung } from '../../src/utils/forms/submit-meldung.js';
import { GOAL_SEMANTICS_CHANGES, ENGAGEMENT_IGNORE, CORE_GOALS } from '../../scripts/onboard/plausible-goals.mjs';

/** @param {Record<string, string>} felder */
function fd(felder) {
  const f = new FormData();
  for (const [k, v] of Object.entries(felder)) f.append(k, v);
  return f;
}

const MENSCH = { name: 'Erika Muster', email: 'erika@example.org', message: 'Bitte um Rückruf', url_honey: '' };

test('#968: Bot füllt url_honey, Server antwortet ok → Form Bot, nicht Form Submit', () => {
  const bot = honeypotGefuellt(fd({ ...MENSCH, url_honey: 'https://spam.example' }));
  assert.equal(bot, true);
  assert.deepEqual(submitMeldung(true, bot), { event: 'Form Bot', status: 'success' });
});

test('Bot hakt nur botcheck an → Form Bot', () => {
  const bot = honeypotGefuellt(fd({ ...MENSCH, botcheck: 'on' }));
  assert.equal(submitMeldung(true, bot).event, 'Form Bot');
});

test('Bot, den der Server abweist (z. B. 429), bleibt Form Bot', () => {
  assert.deepEqual(submitMeldung(false, true), { event: 'Form Bot', status: 'error' });
});

test('Mensch: Honeypot leer → Form Submit success bzw. error', () => {
  const bot = honeypotGefuellt(fd(MENSCH));
  assert.equal(bot, false);
  assert.deepEqual(submitMeldung(true, bot), { event: 'Form Submit', status: 'success' });
  assert.deepEqual(submitMeldung(false, bot), { event: 'Form Submit', status: 'error' });
});

test('Agent-Modus: kein botcheck, url_honey readonly und leer → Form Submit', () => {
  const { url_honey: _, ...ohneHoney } = MENSCH;
  assert.equal(submitMeldung(true, honeypotGefuellt(fd({ ...ohneHoney, url_honey: '' }))).event, 'Form Submit');
  assert.equal(submitMeldung(true, honeypotGefuellt(fd(ohneHoney))).event, 'Form Submit');
});

test('Gleiche Bedingung wie der Server: jeder nicht-leere Wert zählt', () => {
  // contact-handler.js prüft `body.botcheck || body.url_honey` — ein Leerzeichen ist dort
  // ein Treffer (stiller Drop), also hier ebenfalls, sonst zählte genau dieser Drop als Lead.
  assert.equal(honeypotGefuellt(fd({ ...MENSCH, url_honey: ' ' })), true);
});

test('ContactForm meldet das Absende-Ergebnis nur über submitMeldung', () => {
  const quelle = readFileSync(resolve(import.meta.dirname, '../../src/components/forms/ContactForm.astro'), 'utf8');
  // Zählwert statt bloßer Abwesenheit: ohne Treffer prüfte der Test nichts.
  const aufrufe = quelle.match(/submitMeldung\((true|false), bot\)/g) ?? [];
  assert.equal(aufrufe.length, 2, `erwartet 2 submitMeldung-Aufrufe (Erfolg + Fehler), gefunden ${aufrufe.length}`);
  assert.doesNotMatch(quelle, /track\('Form Submit'/, 'fester Form-Submit-Aufruf umgeht die Bot-Prüfung');
  assert.match(quelle, /const bot = honeypotGefuellt\(new FormData\(form\)\)/);
});

test('Der Bruch ist datiert, ohne Regel B neu zu gaten', () => {
  const formSubmit = GOAL_SEMANTICS_CHANGES.filter((c) => c.event === 'Form Submit');
  // ruleSinceVersion nimmt den ersten Treffer: der muss v0.154.0 bleiben.
  assert.equal(formSubmit[0]?.version, 'v0.154.0');
  assert.ok(formSubmit.some((c) => c.version === 'v0.176.0' && c.note.includes('Form Bot')));
});

test('Form Bot ist kein Goal und gilt dem Wächter nicht als Lücke', () => {
  assert.ok(ENGAGEMENT_IGNORE.includes('Form Bot'), 'sonst meldet eventsWithoutGoal() jeden Montag ein Event ohne Goal');
  assert.ok(!CORE_GOALS.some((g) => g.value === 'Form Bot'), 'ein Bot ist keine Conversion');
});
