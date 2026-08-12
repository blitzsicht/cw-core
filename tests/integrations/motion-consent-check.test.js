import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  MOTION_PROP_KEYS,
  IMPORT_ONLY_MOTION,
  NON_VISUAL_MOTION,
  stripInlineBlocks,
  stripComments,
  countMarker,
  buildMarkerOwners,
  collectConsent,
  checkMotionConsent,
} from '../../src/integrations/ai-discovery/motion-consent-check.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MOTION_DIR = join(__dirname, '../../src/components/motion');

/**
 * Alle echten Motion-Komponenten aus dem Paket.
 *
 * `NON_VISUAL_MOTION` fliegt raus: das sind Dateien in `motion/`, die kein
 * Markup rendern (Träger für das gemeinsame Laufzeitmodul). Sie können weder
 * eine Prop noch einen Marker haben — für die beiden Vollständigkeitstests
 * unten wären sie ein Dauer-Rot ohne Aussage.
 */
function realMotionComponents() {
  return readdirSync(MOTION_DIR)
    .filter((f) => f.endsWith('.astro'))
    .filter((f) => !NON_VISUAL_MOTION.includes(f.replace(/\.astro$/, '')))
    .map((f) => ({
      name: f.replace(/\.astro$/, ''),
      source: readFileSync(join(MOTION_DIR, f), 'utf-8'),
    }));
}

// ---------------------------------------------------------------------------
// Der Fall, der den Guard ausgelöst hat
// ---------------------------------------------------------------------------

test('warnt bei Marker ohne Import und ohne Prop — der digital-direkt-Fall', () => {
  // digital-direkt.com liefert 6 TiltCards aus (Hero-Collage ab zwei Bildern
  // plus PaketeSection mit tilt=true), ohne TiltCard je anzufordern.
  const html = '<div class="motion-tilt" data-motion-tilt></div>'.repeat(6);
  const markerOwners = buildMarkerOwners(realMotionComponents());
  const consented = collectConsent([
    "import Hero from '@cw/core/components/blocks/Hero.astro';",
    "import PaketeSection from '@cw/core/components/blocks/PaketeSection.astro';",
  ]);

  const issues = checkMotionConsent({
    markerCounts: { 'data-motion-tilt': countMarker(stripInlineBlocks(html), 'data-motion-tilt') },
    markerOwners,
    consented,
  });

  assert.equal(issues.length, 1);
  assert.equal(issues[0].count, 6);
  assert.equal(issues[0].component, 'TiltCard');
  assert.match(issues[0].details, /tilt=\{false\}/);
});

test('schweigt, wenn die Komponente direkt importiert wurde', () => {
  // blitzsicht importiert TiltCard und liefert 3 aus — kein Befund.
  const issues = checkMotionConsent({
    markerCounts: { 'data-motion-tilt': 3 },
    markerOwners: buildMarkerOwners(realMotionComponents()),
    consented: collectConsent([
      "import TiltCard from '@cw/core/components/motion/TiltCard.astro';",
    ]),
  });
  assert.deepEqual(issues, []);
});

test('schweigt bei Zustimmung per motion-Prop', () => {
  // blitzsicht fährt motion={{ textReveal: true, stagger: true, magnetic: true }}
  // an Hero, ohne eine Motion-Komponente zu importieren. Ohne diese Form der
  // Zustimmung würde der Guard dort dreifach falsch anschlagen.
  const issues = checkMotionConsent({
    markerCounts: {
      'data-motion-text-reveal': 1,
      'data-motion-stagger': 3,
      'data-motion-magnetic': 2,
    },
    markerOwners: buildMarkerOwners(realMotionComponents()),
    consented: collectConsent([
      '<Hero motion={{ textReveal: true, stagger: true, magnetic: true }} />',
    ]),
  });
  assert.deepEqual(issues, []);
});

test('schweigt ohne jede Motion im Markup', () => {
  const issues = checkMotionConsent({
    markerCounts: { 'data-motion-tilt': 0, 'data-motion-reveal': 0 },
    markerOwners: buildMarkerOwners(realMotionComponents()),
    consented: new Set(),
  });
  assert.deepEqual(issues, []);
});

// ---------------------------------------------------------------------------
// Falsch-Positiv-Schutz — ohne den schlägt der Guard bei JEDEM Kunden an
// ---------------------------------------------------------------------------

test('zählt Marker im Inline-CSS nicht als ausgeliefertes Markup', () => {
  // Astro inlint tokens-base.css in jede Seite. Dort steht
  // [data-motion-reveal=up]{…} — nach dem Marker folgt "=", also genau das
  // Zeichen, das countMarker als Attribut akzeptiert. Gemessen am echten HTML:
  // digital-direkt 5 Phantom-Treffer (tatsächlich 0), blitzsicht 19 statt 14.
  // Die fünf Richtungs-Varianten stehen so in tokens-base.css:191-195 und
  // erklären exakt die 5 Phantom-Treffer, die an digital-direkt.com gemessen
  // wurden. Die Form `[data-motion-reveal]` ohne Wert zählt ohnehin nicht
  // (danach folgt "]"), gefährlich sind nur die mit "=".
  const html =
    '<style>[data-motion-reveal]{opacity:0}' +
    ['up', 'down', 'left', 'right', 'zoom']
      .map((d) => `[data-motion-reveal=${d}]{transform:none}`)
      .join('') +
    '</style><main>kein Reveal im Markup</main>';
  const stripped = stripInlineBlocks(html);
  assert.equal(countMarker(html, 'data-motion-reveal'), 5);
  assert.equal(countMarker(stripped, 'data-motion-reveal'), 0);

  const issues = checkMotionConsent({
    markerCounts: { 'data-motion-reveal': countMarker(stripped, 'data-motion-reveal') },
    markerOwners: buildMarkerOwners(realMotionComponents()),
    consented: new Set(),
  });
  assert.deepEqual(issues, []);
});

test('zählt Marker im Inline-Skript nicht mit', () => {
  const html = '<div data-motion-tilt></div><script>q("[data-motion-tilt]")</script>';
  assert.equal(countMarker(stripInlineBlocks(html), 'data-motion-tilt'), 1);
});

test('verwechselt einen Präfix-Marker nicht mit dem längeren', () => {
  const html = '<span data-motion-countup="10"><b data-motion-countup-num>0</b></span>';
  assert.equal(countMarker(html, 'data-motion-countup'), 1);
  assert.equal(countMarker(html, 'data-motion-countup-num'), 1);
});

test('wertet einen Import im Kommentar nicht als Zustimmung', () => {
  const consented = collectConsent([
    "/* import TiltCard from '@cw/core/components/motion/TiltCard.astro'; */",
    "// import Hero from '@cw/core/components/blocks/Hero.astro';",
  ]);
  assert.equal(consented.has('TiltCard'), false);
  assert.equal(consented.has('Hero'), false);
});

test('wertet tilt={false} nicht als Zustimmung', () => {
  assert.equal(collectConsent(['<PaketeSection tilt={false} />']).has('TiltCard'), false);
});

// ---------------------------------------------------------------------------
// Opt-out und Mehrdeutigkeit
// ---------------------------------------------------------------------------

test('schweigt bei acknowledgedMotion — per Prop-Key wie per Komponentenname', () => {
  const base = {
    markerCounts: { 'data-motion-tilt': 6 },
    markerOwners: buildMarkerOwners(realMotionComponents()),
    consented: new Set(),
  };
  assert.deepEqual(checkMotionConsent({ ...base, acknowledged: ['tilt'] }), []);
  assert.deepEqual(checkMotionConsent({ ...base, acknowledged: ['TiltCard'] }), []);
  assert.equal(checkMotionConsent({ ...base, acknowledged: ['blob'] }).length, 1);
});

test('meldet einen mehrdeutigen Marker nicht, wenn einer seiner Besitzer zugestimmt ist', () => {
  // data-motion-reveal setzen ScrollReveal, StaggerGroup UND FullBleed.
  // Wer ScrollReveal importiert hat, kann eine Warnung über FullBleed nicht
  // auflösen — sie wäre nur Lärm.
  const markerOwners = buildMarkerOwners(realMotionComponents());
  assert.ok((markerOwners.get('data-motion-reveal') ?? []).length > 1, 'Vorbedingung: Marker ist mehrdeutig');

  const issues = checkMotionConsent({
    markerCounts: { 'data-motion-reveal': 14 },
    markerOwners,
    consented: collectConsent([
      "import ScrollReveal from '@cw/core/components/motion/ScrollReveal.astro';",
    ]),
  });
  assert.deepEqual(issues, []);
});

test('nennt bei einem mehrdeutigen Marker alle Besitzer', () => {
  const issues = checkMotionConsent({
    markerCounts: { 'data-motion-reveal': 14 },
    markerOwners: buildMarkerOwners(realMotionComponents()),
    consented: new Set(),
  });
  assert.equal(issues.length, 1);
  assert.match(issues[0].component, / oder /);
});

// ---------------------------------------------------------------------------
// Drift-Sicherung für die Tabelle
// ---------------------------------------------------------------------------

test('MOTION_PROP_KEYS deckt jede Motion-Komponente ab', () => {
  // Schlägt fehl, sobald cw-core eine Motion-Komponente bekommt, die weder in
  // der Prop-Tabelle steht noch als reine Import-Komponente deklariert ist.
  // Ohne diesen Test veraltet die Tabelle still und der Guard wird löchrig.
  const known = new Set([...Object.values(MOTION_PROP_KEYS), ...IMPORT_ONLY_MOTION]);
  const actual = realMotionComponents().map((c) => c.name);
  assert.ok(actual.length > 0, 'Vorbedingung: Motion-Komponenten gefunden');
  const missing = actual.filter((n) => !known.has(n));
  assert.deepEqual(missing, [], `Nicht abgedeckt: ${missing.join(', ')}`);
});

test('jede Motion-Komponente setzt einen erkennbaren Marker oder ist bewusst ausgenommen', () => {
  const owners = buildMarkerOwners(realMotionComponents());
  const withMarker = new Set([...owners.values()].flat());
  const without = realMotionComponents()
    .map((c) => c.name)
    .filter((n) => !withMarker.has(n));
  assert.deepEqual(without, [], `Ohne Marker, also unsichtbar für den Guard: ${without.join(', ')}`);
});

test('stripComments lässt URLs in Zeichenketten unangetastet', () => {
  assert.equal(stripComments("const u = 'https://x.de';"), "const u = 'https://x.de';");
});
