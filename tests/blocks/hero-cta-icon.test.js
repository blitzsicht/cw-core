// @ts-check
/**
 * Hero.astro — Primär-CTA trägt bei tel: das Telefon-, sonst das Umschlag-Symbol.
 * Lauf: `node --test tests/blocks/hero-cta-icon.test.js`
 *
 * Anlass (07.10.2026): „Anrufen: 09405 / 95 74 38" mit Briefumschlag im LeVia-Entwurf;
 * dasselbe bei haarwerk-neutraubling (index, haarwerk-salon, kontakt). Der Umschlag für
 * Nicht-tel-Links bleibt Byte für Byte (hero-badge.test.js vergleicht gegen v0.160.0).
 */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { renderer, schliessen, normalize } from './_render-astro.js';
import { TELEFON_PFAD, BRIEF_PFAD } from '../../src/utils/cta-icon.js';

after(schliessen);

const HERO = 'src/components/blocks/Hero.astro';
const H = { headline: 'Ergotherapie für alle', siteName: 'Testkunde' };

/** Nur der Primär-Knopf (btn-accent), damit andere Symbole nicht mitzählen. */
async function primaerKnopf(/** @type {Record<string, unknown>} */ props) {
  const html = normalize(await (await renderer()).render(HERO, { ...H, ...props }));
  const m = html.match(/<a [^>]*class="btn-accent"[^>]*>[\s\S]*?<\/a>/);
  assert.ok(m, 'Primär-CTA nicht gefunden');
  return m[0];
}

test('tel: → Telefon-Pfad, kein Umschlag', async () => {
  const a = await primaerKnopf({ ctaPrimary: { label: 'Anrufen: 09405 / 95 74 38', href: 'tel:+499405957438' } });
  assert.ok(a.includes(TELEFON_PFAD), 'Telefon-Pfad fehlt');
  assert.ok(!a.includes(BRIEF_PFAD), 'Umschlag bei tel: (der Fehler vom 07.10.2026)');
  assert.doesNotMatch(a, /<polyline/);
});

test('tel: mit magnetic-Motion → ebenfalls Telefon (zweiter Render-Zweig)', async () => {
  const a = await primaerKnopf({
    ctaPrimary: { label: 'Anrufen', href: 'tel:+499405957438' },
    motion: { magnetic: true },
  });
  assert.ok(a.includes(TELEFON_PFAD));
  assert.ok(!a.includes(BRIEF_PFAD));
});

test('mailto: → Umschlag', async () => {
  const a = await primaerKnopf({ ctaPrimary: { label: 'Schreiben', href: 'mailto:a@b.de' } });
  assert.ok(a.includes(BRIEF_PFAD));
  assert.ok(!a.includes(TELEFON_PFAD));
});

test('/kontakt → Umschlag wie bisher', async () => {
  const a = await primaerKnopf({ ctaPrimary: { label: 'Kontakt', href: '/kontakt' } });
  assert.ok(a.includes(BRIEF_PFAD));
  assert.match(a, /<polyline points="22,6 12,13 2,6"/);
});

test('ohne ctaPrimary (Default /kontakt) → Umschlag', async () => {
  const a = await primaerKnopf({});
  assert.ok(a.includes(BRIEF_PFAD));
});

// --- ctaPrimary.icon (opt-in, v0.171.0) -----------------------------------
// Anlass haarwerk 08.10.2026: „Route planen“ (OpenStreetMap-Link) trug den Brief.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PFEIL_LINIEN, PIN_PFADE, BRIEF_LINIE } from '../../src/utils/cta-icon.js';
import { FAELLE } from './opt-in-bilder-faelle.js';

const GOLDEN = JSON.parse(readFileSync(resolve(import.meta.dirname, 'fixtures/opt-in-bilder-v0.170.0.json'), 'utf8'));
const ROUTE = { label: 'Route planen', href: 'https://www.openstreetmap.org/directions?to=49.0%2C12.2', target: '_blank', rel: 'noopener noreferrer' };

test("icon='auto' ausdrücklich: Byte für Byte wie v0.170.0", async () => {
  const p = FAELLE.heroOhneBild.props;
  const html = normalize(await (await renderer()).render(HERO, { ...p, ctaPrimary: { label: 'Kostenlose Beratung anfragen', href: '/kontakt', icon: 'auto' } }));
  assert.equal(html, GOLDEN.heroOhneBild);
});

test("icon='pin': Standort-Pin statt Brief", async () => {
  const a = await primaerKnopf({ ctaPrimary: { ...ROUTE, icon: 'pin' } });
  for (const d of PIN_PFADE) assert.ok(a.includes(`d="${d}"`), 'Pin-Pfad fehlt');
  assert.ok(!a.includes(BRIEF_PFAD), 'kein Umschlag');
  // Gegenprobe: derselbe Link ohne icon trägt (wie bisher) den Umschlag.
  assert.ok((await primaerKnopf({ ctaPrimary: ROUTE })).includes(BRIEF_PFAD));
});

test("icon='arrow': Pfeil, icon='mail' bei tel:: Umschlag, icon='phone' bei /kontakt: Telefon", async () => {
  const pfeil = await primaerKnopf({ ctaPrimary: { ...ROUTE, icon: 'arrow' } });
  for (const pts of PFEIL_LINIEN) assert.ok(pfeil.includes(`points="${pts}"`));
  assert.ok(!pfeil.includes(BRIEF_LINIE));
  assert.ok((await primaerKnopf({ ctaPrimary: { label: 'Anrufen', href: 'tel:+4994011637', icon: 'mail' } })).includes(BRIEF_PFAD));
  assert.ok((await primaerKnopf({ ctaPrimary: { label: 'Termin', href: '/kontakt', icon: 'phone' } })).includes(TELEFON_PFAD));
});

test("icon='none': kein svg, Label bleibt", async () => {
  const a = await primaerKnopf({ ctaPrimary: { ...ROUTE, icon: 'none' } });
  assert.doesNotMatch(a, /<svg/);
  assert.match(a, />\s*Route planen\s*<\/a>/);
});
