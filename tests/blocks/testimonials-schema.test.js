// @ts-check
/**
 * Testimonials.astro — Bewertungs-Markup nur noch auf ausdrücklichen Wunsch.
 *
 * Lauf: `node --test tests/blocks/testimonials-schema.test.js`
 *
 * ANLASS (26.09.2026): Der Block gab IMMER `itemscope itemtype=Product` mit
 * `aggregateRating` und Review-Microdata aus, Name per Default „${siteName}
 * Website-Service“. Das passt zu einer Agentur, die Website-Service verkauft — auf jeder
 * Kundenseite ist es falsches, selbst erteiltes Bewertungs-Markup für ein Produkt, das es
 * nicht gibt. Neu: `schema` (Default nur mit `productName` an).
 *
 * Zweiter Fund: `reviewSource="google"` rendert je Karte das Google-„G“ in den vier
 * Markenfarben. Wortnennung ist erlaubt, das Logo nicht — ersetzt durch den Text
 * „Google-Bewertung“ und automatisch den Prüfhinweis nach § 5b Abs. 3 UWG.
 *
 * Gegenprobe: Schnappschüsse, VOR der Änderung aus v0.159.1 gerendert
 * (`fixtures/testimonials-v0.159.1.json`).
 */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderer, schliessen, normalize } from './_render-astro.js';

after(schliessen);

const BLOCK = 'src/components/blocks/Testimonials.astro';
const FIXTURE = JSON.parse(readFileSync(resolve(import.meta.dirname, 'fixtures/testimonials-v0.159.1.json'), 'utf8'));
const ITEMS = [
  { stars: 5, text: 'Schnell und sauber gearbeitet.', name: 'Anna M.', role: 'Privatkundin' },
  { stars: 4, text: 'Gute Beratung, fairer Preis.', name: 'Bernd K.', role: 'Hausverwaltung' },
];
const PRUEFHINWEIS =
  'Die Bewertungen stammen von Google-Nutzern. Wir prüfen nicht, ob die Verfasser unsere Leistungen tatsächlich in Anspruch genommen haben.';

/** @param {Record<string, unknown>} props */
async function render(props) {
  const r = await renderer();
  return normalize(await r.render(BLOCK, { items: ITEMS, siteName: 'Testkunde', ...props }));
}

/**
 * Entfernt Microdata: itemscope/itemtype/itemprop-Attribute, die <meta itemprop>-Tags
 * und den leeren aggregateRating-Container. Was übrig bleibt, ist das sichtbare Markup.
 * @param {string} html
 */
function ohneMicrodata(html) {
  return html
    .replace(/<div itemprop="aggregateRating"[^>]*>(?:<meta [^>]*>)*<\/div>/g, '')
    .replace(/<meta itemprop="[^"]*" content="[^"]*">/g, '')
    .replace(/\s+itemscope(?=[\s>])/g, '')
    .replace(/\s+item(?:type|prop)="[^"]*"/g, '');
}

/** @param {string} html */
const zaehle = (html, re) => (html.match(re) ?? []).length;

test('ohne productName: 0 itemprop, 0 itemscope, 0 itemtype', async () => {
  const html = await render({});
  assert.equal(zaehle(html, /itemprop/g), 0);
  assert.equal(zaehle(html, /itemscope/g), 0);
  assert.equal(zaehle(html, /itemtype/g), 0);
});

test('ohne productName: sichtbares Markup gleich v0.159.1 minus Microdata', async () => {
  const html = await render({});
  assert.equal(html, ohneMicrodata(FIXTURE.ohneProductName));
});

test('Gegenprobe: der Schnappschuss v0.159.1 trug Microdata (sonst wäre der Vergleich oben leer)', () => {
  assert.ok(zaehle(FIXTURE.ohneProductName, /itemprop/g) > 10);
  assert.notEqual(FIXTURE.ohneProductName, ohneMicrodata(FIXTURE.ohneProductName));
});

test('mit productName: Markup Byte für Byte wie v0.159.1', async () => {
  assert.equal(await render({ productName: 'Testkunde Website-Service' }), FIXTURE.mitProductName);
});

test('schema={true} ohne productName: Markup wie v0.159.1 (Default-Name)', async () => {
  assert.equal(await render({ schema: true }), FIXTURE.ohneProductName);
});

test('schema={false} mit productName: kein Markup', async () => {
  const html = await render({ productName: 'Testkunde Website-Service', schema: false });
  assert.equal(zaehle(html, /itemprop|itemscope|itemtype/g), 0);
  assert.equal(html, ohneMicrodata(FIXTURE.mitProductName));
});

// ---------------------------------------------------------------------------
// reviewSource="google"
// ---------------------------------------------------------------------------

test('Gegenprobe: v0.159.1 renderte bei reviewSource="google" das Google-G in Markenfarben', () => {
  assert.match(FIXTURE.google, /class="gbadge-logo"/);
  assert.match(FIXTURE.google, /#EA4335/);
});

test('reviewSource="google": kein Logo, keine Google-Farben, Text „Google-Bewertung“ je Karte', async () => {
  const html = await render({ reviewSource: 'google', ratingValue: 4.8, reviewCount: 24 });
  assert.doesNotMatch(html, /<svg\b/);
  assert.doesNotMatch(html, /#(EA4335|4285F4|FBBC05|34A853)/i);
  assert.doesNotMatch(html, /aria-label="Google"/);
  // 2 Items × 2 (Marquee-Loop) = 4 Karten
  assert.equal(zaehle(html, /<span class="gbadge-text">Google-Bewertung<\/span>/g), 4);
});

test('reviewSource="google": Prüfhinweis erscheint automatisch im Block', async () => {
  const html = await render({ reviewSource: 'google' });
  const section = /<section\b[\s\S]*<\/section>/.exec(html)?.[0] ?? '';
  assert.ok(section.includes(PRUEFHINWEIS), 'Prüfhinweis fehlt im <section>');
  assert.equal(zaehle(html, /Wir prüfen nicht, ob/g), 1);
});

test('reviewSource="google": Prüfhinweis nicht doppelt, wenn subheading ihn schon enthält', async () => {
  const sub = `Aus unserem Google-Unternehmensprofil. Wir prüfen nicht, ob die Verfasser unsere Leistungen tatsächlich in Anspruch genommen haben.`;
  const html = await render({ reviewSource: 'google', subheading: sub });
  assert.equal(zaehle(html, /Wir prüfen nicht, ob/g), 1);
});

test('ohne reviewSource: kein Prüfhinweis', async () => {
  assert.doesNotMatch(await render({}), /Wir prüfen nicht/);
});
