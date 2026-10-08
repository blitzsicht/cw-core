// @ts-check
/**
 * PriceList.astro (neu in v0.171.0) — Preisliste wie ein Aushang.
 *
 * Lauf: `node --test tests/blocks/pricelist.test.js`
 *
 * ANLASS (haarwerk-neutraubling, Kundengespräch 08.10.2026): komplette Preisliste auf die
 * Website, mit Spalten kurz/mittel/lang wie im Salon. PriceTransparency kennt nur Spannen.
 *
 * Geprüft wird, was ein Mensch und ein Screenreader davon haben: Anker je Gruppe,
 * sichtbare Spaltenköpfe (für Screenreader stumm) und je Preis ein vorlesbares
 * Spaltenlabel, Posten ohne Spalte als durchlaufende Zeile, Punktführer nur dort, wo es
 * keine Spalten gibt, Sprungleiste erst ab zwei Gruppen. Jede Behauptung hat eine
 * Gegenprobe, die beim Gegenteil anders ausfallen muss.
 */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { renderer, schliessen, normalize } from './_render-astro.js';

after(schliessen);

const PL = 'src/components/blocks/PriceList.astro';

/**
 * Die Komponente rendert Einrückung als Leerraum zwischen den Tags. Für die Prüfung
 * zählt die Struktur, nicht die Einrückung: Leerraum an Tag-Grenzen fällt weg.
 * (Ein Leerzeichen am Ende eines sr-only-Labels geht dabei mit — Screenreader setzen
 * zwischen Label und Betrag ohnehin eine Pause, der Inhalt bleibt derselbe.)
 * @param {Record<string, unknown>} props
 */
async function render(props) {
  const r = await renderer();
  return normalize(await r.render(PL, props)).replace(/\s+/g, ' ').replace(/>\s+/g, '>').replace(/\s+</g, '<');
}

const DAMEN = {
  id: 'damen',
  title: 'Damen',
  eyebrow: 'Salon Haarwerk',
  note: 'Preise je Haarlänge',
  categories: [
    {
      title: 'Schnitt',
      columns: ['kurz', 'mittel', 'lang'],
      items: [
        { name: 'Schnitt, Waschen, Föhnen', prices: [{ amount: '53,50 €', column: 'kurz' }, { amount: '57,50 €', column: 'mittel' }, { amount: '60,50 €', column: 'lang' }] },
        { name: 'Klassische Strähnen', prices: [{ amount: '45,00 €', column: 'kurz' }, { amount: '50,00 €', column: 'mittel' }] },
        { name: 'Haarschnitt', note: 'ohne Waschen', prices: [{ amount: 'ab 25,50 €' }] },
      ],
    },
    {
      title: 'Kosmetik',
      items: [{ name: 'Augenbrauen zupfen', prices: [{ amount: '9,50 €' }] }],
    },
  ],
};
const HERREN = {
  id: 'herren',
  title: 'Herren',
  categories: [{ title: 'Bart', items: [{ name: 'Bart, je nach Aufwand', prices: [{ amount: '19,50 €' }, { amount: '23,50 €' }, { amount: '29,00 €' }] }] }],
};

/** Der Ausschnitt einer Kategorie-Karte, nach Titel. @param {string} html @param {string} titel */
function karte(html, titel) {
  const start = html.indexOf(`<h3>${titel}</h3>`);
  assert.ok(start > 0, `Karte ${titel} gefunden`);
  return html.slice(html.lastIndexOf('<article', start), html.indexOf('</article>', start));
}

/** Die Zeile eines Postens, nach Name. @param {string} html @param {string} name */
function zeile(html, name) {
  const start = html.indexOf(name);
  assert.ok(start > 0, `Zeile ${name} gefunden`);
  return html.slice(html.lastIndexOf('<li', start), html.indexOf('</li>', start));
}

test('Gruppen-Anker: section#id mit Überschrift, aria-labelledby passt', async () => {
  const html = await render({ groups: [DAMEN, HERREN] });
  assert.match(html, /<section id="damen" class="pl-group" aria-labelledby="damen-title">/);
  assert.match(html, /<h2 id="damen-title">Damen<\/h2>/);
  assert.match(html, /<section id="herren" class="pl-group" aria-labelledby="herren-title">/);
  assert.match(html, /<p class="pl-eyebrow">Salon Haarwerk<\/p>/);
  assert.match(html, /<p class="pl-note">Preise je Haarlänge<\/p>/);
});

test('Spaltenköpfe: sichtbar, für Screenreader stumm; ohne Spalten keine', async () => {
  const html = await render({ groups: [DAMEN] });
  assert.match(karte(html, 'Schnitt'), /<div class="pl-colhead" aria-hidden="true"><span>kurz<\/span><span>mittel<\/span><span>lang<\/span><\/div>/);
  assert.match(karte(html, 'Schnitt'), /style="--pl-cols:3"/);
  // Gegenprobe: die Kategorie ohne Spalten hat weder Kopf noch Spaltenzahl.
  assert.doesNotMatch(karte(html, 'Kosmetik'), /pl-colhead|--pl-cols/);
});

test('je Preis ein sr-only-Spaltenlabel; fehlende Spalte als „kein Preis“', async () => {
  const html = await render({ groups: [DAMEN] });
  const voll = zeile(html, 'Schnitt, Waschen, Föhnen');
  for (const [col, betrag] of [['kurz', '53,50 €'], ['mittel', '57,50 €'], ['lang', '60,50 €']]) {
    assert.match(voll, new RegExp(`<span class="pl-price" data-col="${col}"><span class="sr-only">${col}:</span>${betrag}</span>`));
  }
  const luecke = zeile(html, 'Klassische Strähnen');
  assert.match(luecke, /data-col="lang"><span class="sr-only">lang:<\/span><span class="pl-none"><span aria-hidden="true">–<\/span><span class="sr-only">kein Preis<\/span><\/span>/);
  assert.doesNotMatch(html, /aria-label="kein Preis"/, 'kein aria-label auf einem span ohne Rolle');
});

test('Spannzeile: Posten ohne Spaltenzuordnung läuft über alle Spalten', async () => {
  const html = await render({ groups: [DAMEN] });
  const z = zeile(html, 'Haarschnitt');
  assert.match(z, /<span class="pl-price pl-price--span">ab 25,50 €<\/span>/);
  assert.doesNotMatch(z, /data-col=/, 'keine Spaltenzellen');
  assert.match(z, /<small>ohne Waschen<\/small>/);
  // Gegenprobe: die Zeile mit Spalten hat keine Spannzelle.
  assert.doesNotMatch(zeile(html, 'Schnitt, Waschen, Föhnen'), /pl-price--span/);
});

test('Punktführer: nur in Kategorien ohne Spalten; mehrere Beträge mit „ / “', async () => {
  const html = await render({ groups: [DAMEN, HERREN] });
  assert.match(zeile(html, 'Augenbrauen zupfen'), /<span class="pl-leader" aria-hidden="true"><\/span><span class="pl-price pl-price--span">9,50 €<\/span>/);
  assert.match(zeile(html, 'Bart, je nach Aufwand'), />19,50 € \/ 23,50 € \/ 29,00 €</);
  // Gegenprobe: in der Spalten-Karte steht der Führer nur an der Spannzeile, die Liste
  // trägt die Spalten-Klasse, über die CSS ihn dort ausblendet.
  assert.match(karte(html, 'Schnitt'), /<ul class="pl-rows pl-rows--cols">/);
  assert.match(karte(html, 'Kosmetik'), /<ul class="pl-rows">/);
  assert.doesNotMatch(zeile(html, 'Schnitt, Waschen, Föhnen'), /pl-leader/);
});

test('Sprungleiste erst ab zwei Gruppen', async () => {
  const zwei = await render({ groups: [DAMEN, HERREN] });
  assert.match(zwei, /<nav class="pl-switch" aria-label="Preisliste: Bereiche"><a href="#damen">Damen<\/a><a href="#herren">Herren<\/a><\/nav>/);
  // Gegenprobe: eine Gruppe → keine Leiste.
  const eine = await render({ groups: [DAMEN] });
  assert.doesNotMatch(eine, /pl-switch/);
  // Ausdrücklich abgeschaltet → keine Leiste, ausdrücklich an → auch bei einer.
  assert.doesNotMatch(await render({ groups: [DAMEN, HERREN], switcher: false }), /pl-switch/);
  assert.match(await render({ groups: [DAMEN], switcher: true }), /<nav class="pl-switch"/);
});

test('Fußnoten und Link nur, wenn gesetzt', async () => {
  const mit = await render({ groups: [HERREN], footnotes: ['Stand 01.02.2026', 'inkl. 19 % MwSt.'], footnoteLink: { label: 'Haarverlängerung nach Beratung', href: '/haarverlaengerung' } });
  assert.match(mit, /<aside class="pl-foot"><p>Stand 01\.02\.2026<\/p><p>inkl\. 19 % MwSt\.<\/p><p><a href="\/haarverlaengerung">Haarverlängerung nach Beratung<\/a><\/p><\/aside>/);
  assert.doesNotMatch(await render({ groups: [HERREN] }), /pl-foot/);
});
