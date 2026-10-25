// @ts-check
/**
 * Opt-in-Erweiterungen v0.181.0: `LinkGrid` mit Bild, `AnswerBlock` ohne Kasten.
 *
 * Lauf: `node --test tests/blocks/wegweiser-bild-antwort-schlicht.test.js`
 *
 * ANLASS (spedition-steller, Operator-Durchsicht 25.10.2026), beide woertlich:
 *   - „Zwei Wege zu uns. Transportanfrage und Fahrer gesucht haben wieder kein Bild.
 *      Das ist auch nicht schoen und nicht sprechend."
 *   - Zum AnswerBlock: „der Hinweistext, wenn irgendwie ein Fehler auf der Website
 *      waere ... das ist hier voellig fehl am Platz."
 *
 * Der zweite Befund ist der interessantere: `.answer-card` war ein grauer Kasten mit
 * 4 px farbiger Kante links — in jeder UI-Konvention die Form einer Hinweis- oder
 * Fehlermeldung. Bei einem Kunden mit gelbem Akzent liest sie sich als Warnung. Der
 * Block trug damit die wichtigste Aussage der Seite in der Optik einer Stoerung.
 *
 * GEGENPROBE in jedem Fall MIT gegen OHNE Schalter im selben Lauf: Ohne die neuen
 * Props muss das Markup unveraendert sein, mit ihnen genau an der versprochenen
 * Stelle anders. Ein Test, der nur „enthaelt <img>" prueft, wuerde auch gruen, wenn
 * das Bild immer da waere.
 */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { renderer, schliessen, normalize } from './_render-astro.js';

after(schliessen);

const LINKGRID = 'src/components/blocks/LinkGrid.astro';
const ANSWER = 'src/components/blocks/AnswerBlock.astro';

/** @param {string} datei @param {Record<string, unknown>} props */
async function render(datei, props) {
  const r = await renderer();
  return normalize(await r.render(datei, props));
}

async function bild() {
  const r = await renderer();
  return (await r.laden('examples/src/assets/ki-karte.webp')).default;
}

/** KI-Bild, im Bestand als Testfixture deklariert. */
const KI = [{ stem: 'ki-karte', herkunft: 'ki-erzeugt', deepfake: 'ja', begruendung: 'Testfixture' }];

const WEGE = {
  heading: 'Zwei Wege zu uns',
  items: [
    { title: 'Transport anfragen', description: 'Strecke, Ladung und Wunschtermin.', href: '/transportanfrage' },
    { title: 'Fahrer gesucht', description: 'Kurzbewerbung in unter einer Minute.', href: '/fahrer' },
  ],
};

// ─── LinkGrid ──────────────────────────────────────────────────────────────

// 1 — der Zustand VOR der Erweiterung: keine Bild-Spuren im Markup.
test('LinkGrid ohne image: kein <img>, keine has-image-Klasse', async () => {
  const html = await render(LINKGRID, WEGE);
  assert.ok(html.includes('class="link-card"'), 'Karte wird gerendert');
  assert.ok(!html.includes('<img'), 'kein Bild');
  assert.ok(!html.includes('has-image'), 'keine Bild-Klasse');
  assert.ok(!html.includes('link-card-image'), 'kein Bild-Container');
});

// 2 — mit image: genau an der versprochenen Stelle anders.
test('LinkGrid mit image: Bild oben in der Karte, Klasse gesetzt', async () => {
  const img = await bild();
  const items = WEGE.items.map((c) => ({ ...c, image: img, imageAlt: 'Sattelzug am Hof' }));
  const html = await render(LINKGRID, { ...WEGE, items });
  assert.ok(html.includes('has-image'), 'Bild-Klasse gesetzt');
  assert.ok(html.includes('link-card-image'), 'Bild-Container da');
  assert.equal((html.match(/<img/g) ?? []).length, 2, 'je Karte genau ein Bild');
  assert.ok(html.includes('alt="Sattelzug am Hof"'), 'Alt-Text uebernommen');
});

// 3 — ohne imageAlt gilt das Bild als dekorativ (a11y: kein leeres alt ohne role).
test('LinkGrid: image ohne imageAlt wird als dekorativ markiert', async () => {
  const img = await bild();
  const html = await render(LINKGRID, { ...WEGE, items: [{ ...WEGE.items[0], image: img }] });
  // Astro schreibt den leeren Alt-Text als Attribut OHNE Wert (`alt role=...`),
  // nicht als `alt=""` — gemessen am gerenderten Markup, nicht angenommen.
  assert.ok(/\salt\srole="presentation"/.test(html), 'leerer Alt + als dekorativ markiert');
  const mitAlt = await render(LINKGRID, { ...WEGE, items: [{ ...WEGE.items[0], image: img, imageAlt: 'Motiv' }] });
  assert.ok(mitAlt.includes('alt="Motiv"'), 'Gegenprobe: mit imageAlt steht der Text da');
  assert.ok(!mitAlt.includes('role="presentation"'), 'und dann ist es nicht mehr dekorativ');
});

// 4 — KI-Kennzeichnung nach Art. 50 AI Act haengt am Bild, nicht am Block.
test('LinkGrid: KI-Bild bekommt mit bildHerkunft ein Label, ohne nicht', async () => {
  const img = await bild();
  const items = [{ ...WEGE.items[0], image: img, imageAlt: 'Motiv' }];
  const mit = await render(LINKGRID, { ...WEGE, items, bildHerkunft: KI });
  const ohne = await render(LINKGRID, { ...WEGE, items });
  assert.ok(mit.includes('Mit KI erzeugt'), 'mit bildHerkunft: Label steht da');
  assert.ok(!ohne.includes('Mit KI erzeugt'), 'ohne bildHerkunft: kein Label');
  assert.notEqual(mit, ohne, 'die beiden Laeufe unterscheiden sich wirklich');
});

// 5 — Rueckwaertskompatibilitaet: der alte icon-Weg bleibt, image schlaegt ihn.
test('LinkGrid: icon bleibt ohne image, image verdraengt icon', async () => {
  const img = await bild();
  const nurIcon = await render(LINKGRID, { ...WEGE, items: [{ ...WEGE.items[0], icon: '→' }] });
  assert.ok(nurIcon.includes('link-card-icon'), 'Symbol wird weiter gerendert');
  const beides = await render(LINKGRID, { ...WEGE, items: [{ ...WEGE.items[0], icon: '→', image: img }] });
  assert.ok(!beides.includes('link-card-icon'), 'bei image kein Symbol mehr');
  assert.ok(beides.includes('<img'), 'stattdessen das Bild');
});

// ─── AnswerBlock ───────────────────────────────────────────────────────────

const ANTWORT = {
  question: 'Wer transportiert Stahl und Betonteile im Raum Langquaid?',
  directAnswer: 'Eine Spedition mit Sitz in Langquaid im Landkreis Kelheim.',
  details: 'Was im Einzelfall moeglich ist, haengt von Ladung, Strecke und Termin ab.',
};

// 6 — Default unveraendert: die Flotte bekommt weiter den Kasten.
test('AnswerBlock: Default ist der Kasten, keine is-plain-Klasse', async () => {
  const html = await render(ANSWER, ANTWORT);
  assert.ok(html.includes('class="answer-card"'), 'Kasten-Klasse allein');
  assert.ok(!html.includes('is-plain'), 'keine schlichte Variante');
});

// 7 — ausdrueckliches callout = Default (ein Schalter, der nichts tut, waere ein Fehler).
test('AnswerBlock: variant="callout" ist Byte fuer Byte der Default', async () => {
  assert.equal(await render(ANSWER, { ...ANTWORT, variant: 'callout' }), await render(ANSWER, ANTWORT));
});

// 8 — plain nimmt NUR die Kasten-Klasse weg.
test('AnswerBlock: variant="plain" setzt is-plain und sonst nichts', async () => {
  const schlicht = await render(ANSWER, { ...ANTWORT, variant: 'plain' });
  const kasten = await render(ANSWER, ANTWORT);
  assert.ok(schlicht.includes('is-plain'), 'Klasse gesetzt');
  assert.equal(schlicht.replace('answer-card is-plain', 'answer-card'), kasten,
    'ausser der Klasse ist das Markup identisch');
});

// 9 — der eigentliche Zweck des Blocks darf nicht an der Optik haengen.
test('AnswerBlock: plain aendert Text und Question-JSON-LD nicht', async () => {
  const html = await render(ANSWER, { ...ANTWORT, variant: 'plain' });
  assert.ok(html.includes(ANTWORT.question), 'Frage steht im Text');
  assert.ok(html.includes('"@type":"Question"'), 'Question-Schema bleibt');
  assert.ok(html.includes('acceptedAnswer'), 'Antwort-Schema bleibt');
});

// 10 — Sabotage-Anker: ohne den Fixture-Import koennte Fall 4 nie melden.
test('das KI-Testfixture ist wirklich ein KI-Bild', () => {
  assert.equal(KI[0].herkunft, 'ki-erzeugt');
  assert.equal(KI[0].stem, 'ki-karte');
});
