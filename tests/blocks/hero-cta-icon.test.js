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
