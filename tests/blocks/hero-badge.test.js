// @ts-check
/**
 * Hero.astro — kein Badge mehr ohne ausdrückliche Angabe.
 *
 * Lauf: `node --test tests/blocks/hero-badge.test.js`
 *
 * ANLASS (Lead-Rakete-Audit 26.09.2026): Der Default war
 * `badge = 'Fertig in 7 Tagen – garantiert'` — ein Blitzsicht-Versprechen. Jede Kundenseite,
 * die `badge` weglässt oder `badge={siteData.hero.badge}` ohne Eintrag übergibt, hätte es
 * als eigene Garantie ausgespielt (irreführende Werbung, § 5 UWG). Flotten-Scan
 * 27.09.2026 (`git grep origin/main`): alle 18 Hero-Aufrufe übergeben einen gesetzten Text,
 * niemand nutzt den Default — die Änderung ist für die Flotte unsichtbar.
 *
 * Gegenprobe: Schnappschüsse VOR der Änderung (Stand 5d95ce58, v0.160.0),
 * `fixtures/hero-badge-v0.160.0.json`.
 */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderer, schliessen, normalize } from './_render-astro.js';

after(schliessen);

const HERO = 'src/components/blocks/Hero.astro';
const FIXTURE = JSON.parse(readFileSync(resolve(import.meta.dirname, 'fixtures/hero-badge-v0.160.0.json'), 'utf8'));
const H = { headline: 'Brot, das nach Heimat schmeckt.', subtext: 'Seit 1898.', siteName: 'Testkunde' };

/** @param {Record<string, unknown>} props */
async function render(props) {
  const r = await renderer();
  return normalize(await r.render(HERO, props));
}

test('ohne badge: kein .hero-badge, kein „Fertig in 7 Tagen“', async () => {
  const html = await render({ ...H });
  assert.doesNotMatch(html, /hero-badge/);
  assert.doesNotMatch(html, /Fertig in 7 Tagen/);
});

test('badge={undefined} (siteData.hero.badge ohne Eintrag): kein .hero-badge', async () => {
  const html = await render({ ...H, badge: undefined });
  assert.doesNotMatch(html, /hero-badge/);
});

test('ohne badge: sonst gleich v0.160.0 minus das Badge-Element', async () => {
  const html = await render({ ...H });
  // Nur das Element fällt weg; die Leerzeichen drumherum bleiben (Whitespace zwischen
  // Block-Elementen, im Browser ohne Wirkung).
  const ohneBadge = FIXTURE.ohneBadge.replace(/<div class="hero-badge">[\s\S]*?<\/div>/, '');
  assert.notEqual(ohneBadge, FIXTURE.ohneBadge, 'Vorbedingung: Badge im Schnappschuss gefunden');
  assert.equal(html, ohneBadge);
});

test('Gegenprobe: der Schnappschuss v0.160.0 trug das Default-Badge', () => {
  assert.match(FIXTURE.ohneBadge, /<div class="hero-badge">[\s\S]*Fertig in 7 Tagen – garantiert/);
});

test('mit badge: Byte für Byte wie v0.160.0', async () => {
  assert.equal(await render({ ...H, badge: 'Familienbäckerei · Pfakofen seit 1898' }), FIXTURE.mitBadge);
  assert.equal(
    await render({
      ...H,
      badge: 'Meisterbetrieb',
      usps: [{ icon: '⚡', title: 'Schnell' }],
      ctaSecondary: { label: 'Mehr', href: '/mehr' },
    }),
    FIXTURE.mitBadgeUsps,
  );
});
