import { strict as assert } from 'node:assert';
import test from 'node:test';

import {
  bilderAusHtml,
  zaehleLabels,
  pruefeSeiteAufKennzeichnung,
  leseHerkunftRegeln,
  checkAiLabels,
} from './ai-label-check.js';

/**
 * Regeln, wie sie eine Kundenseite deklariert.
 *
 * Die `begruendung` ist bei `deepfake: 'ja'` PFLICHT und kein Beiwerk: ohne sie erklärt
 * `resolveBildHerkunft` die Regel für ungültig und liefert `ungeklaert` — das Bild gilt
 * dann nicht als kennzeichnungspflichtig. Ein Fixture ohne Begründung würde die Tests
 * also grün machen, indem es die Pflicht wegdefiniert.
 */
const REGELN = [
  { pathPrefix: 'staedte/regensburg.webp', herkunft: 'ki-erzeugt', deepfake: 'ja', begruendung: 'Zeigt einen benannten, identifizierbaren Ort' },
  { pathPrefix: 'staedte/sinzing.webp', herkunft: 'ki-erzeugt', deepfake: 'ja', begruendung: 'Zeigt einen benannten, identifizierbaren Ort' },
  { pathPrefix: 'leistungen/glasreinigung.webp', herkunft: 'ki-erzeugt', deepfake: 'nein', begruendung: 'Illustriert eine Leistungsart ohne bestimmten Ort' },
  { pathPrefix: 'logo.webp', herkunft: 'mensch' },
];

// Wortwörtlich aus dist/gebaeudereinigung/regensburg/index.html von customer-donau-profi
// (Build vom 03.09.2026) gekürzt — nicht nachgebaut, damit der Test die echte Bauform
// prüft und nicht meine Vorstellung davon.
const HERO_MIT_LABEL = `<section class="page-hero page-hero--image" data-astro-cid-4ebidn5i>
<img class="page-hero-bg" src="/staedte/regensburg.webp" alt="Gebäudereinigung in Regensburg" loading="eager" data-astro-cid-4ebidn5i>
<div class="page-hero-overlay" aria-hidden="true" data-astro-cid-4ebidn5i></div>
<span class="ai-label-am-bild" style="position:absolute;left:1rem;bottom:0.9rem;z-index:2"><span class="ai-label ai-label--hell ai-label--deckend" style="--ai-label-symbolhoehe: clamp(22px, 4.5cqw, 34px)" data-astro-cid-m6io5zqm><img class="ai-label__icon ai-label__icon--hell" src="/_astro/ai-generated-black.C8dIL9_s.svg" alt="Mit KI erzeugt" width="48" height="24" loading="lazy"></span></span>
<div class="container page-hero-content" data-astro-cid-4ebidn5i><h1>Gebäudereinigung in Regensburg</h1></div>
</section>`;

const HERO_OHNE_LABEL = HERO_MIT_LABEL.replace(/<span class="ai-label-am-bild".*?<\/span><\/span>/s, '');

test('pflichtiges Bild ohne Label wird gemeldet', () => {
  const b = pruefeSeiteAufKennzeichnung(HERO_OHNE_LABEL, REGELN);
  assert.deepEqual(b.pflichtig, ['/staedte/regensburg.webp']);
  assert.equal(b.labels, 0);
  assert.equal(b.fehlend, 1);
});

// Die meisten Kunden binden `AiLabel` direkt ein, donau-profi den neueren
// `AiLabelAmBild`. Eine Seite kann beides mischen — gezählt wird deshalb immer der
// innere Baustein. Die erste Fassung zählte die Positionierungshülle und übersah auf
// gemischten Seiten jedes direkt eingebundene Label.
// Ein responsive Hero liefert dasselbe Motiv sechsfach: zwei Formate mal drei Breiten,
// jede mit eigenem Astro-Hash. Ungezählt gemeldet würde daraus ein Bild mit sechs
// fehlenden Kennzeichnungen — beim ersten Flottenlauf genau so passiert.
test('srcset-Varianten desselben Motivs zählen einmal', () => {
  const regeln = [{ stem: 'hero', herkunft: 'ki-erzeugt', deepfake: 'ja', begruendung: 'Titelbild, im Zweifel gekennzeichnet' }];
  const html = `<img src="/_astro/hero.CC6UVEsO_ZXkuIg.webp"
    srcset="/_astro/hero.CC6UVEsO_1ICG0w.avif 640w, /_astro/hero.CC6UVEsO_1CBftV.avif 960w, /_astro/hero.CC6UVEsO_Z14lVeQ.webp 1200w" alt="Hero">`;
  const b = pruefeSeiteAufKennzeichnung(html, regeln);
  assert.equal(b.pflichtig.length, 1, 'eine Bildfläche, nicht vier');
  assert.equal(b.fehlend, 1);
});

test('gleicher Dateiname in verschiedenen Ordnern bleibt getrennt', () => {
  const regeln = [
    { pathPrefix: 'a/hero.webp', herkunft: 'ki-erzeugt', deepfake: 'ja', begruendung: 'Zeigt einen benannten Ort' },
    { pathPrefix: 'b/hero.webp', herkunft: 'ki-erzeugt', deepfake: 'ja', begruendung: 'Zeigt einen benannten Ort' },
  ];
  const b = pruefeSeiteAufKennzeichnung('<img src="/a/hero.webp"><img src="/b/hero.webp">', regeln);
  assert.equal(b.pflichtig.length, 2, 'zwei Motive, nur der Dateiname ist gleich');
});

test('gemischte Bauformen werden vollständig gezählt', () => {
  const gemischt = `<span class="ai-label-am-bild" style="position:absolute"><span class="ai-label ai-label--hell"><img alt="Mit KI erzeugt"></span></span>
<span class="ai-label ai-label--dunkel"><img alt="Mit KI erzeugt"></span>
<span class="ai-label ai-label--dunkel"><img alt="Mit KI erzeugt"></span>`;
  assert.equal(zaehleLabels(gemischt), 3, 'eine Hülle plus zwei direkte = drei Kennzeichnungen');
});

test('pflichtiges Bild mit Label ist erfüllt', () => {
  const b = pruefeSeiteAufKennzeichnung(HERO_MIT_LABEL, REGELN);
  assert.equal(b.pflichtig.length, 1);
  assert.equal(b.labels, 1);
  assert.equal(b.fehlend, 0);
});

// Der Fehler vom 03.09.2026: Astro bündelt den CSS-Block der Komponente auf JEDE Seite,
// die sie importiert — auch dorthin, wo sie nie rendert. `grep -c 'ai-label'` meldete
// deshalb auf der Startseite einen Treffer ohne jedes Label. Ein Check, der das nicht
// trennt, kann an dieser Stelle nicht rot werden.
test('gebündeltes CSS zählt nicht als Kennzeichnung', () => {
  const nurCss = `<style>.ai-label[data-astro-cid-m6io5zqm]{display:inline-flex}
.ai-label--dunkel[data-astro-cid-m6io5zqm] .ai-label__text{color:#f5f6f7}
.ai-label[data-astro-cid-m6io5zqm] .ai-label__icon{height:var(--ai-label-symbolhoehe,1.15em)}</style>
<img src="/staedte/sinzing.webp" alt="Sinzing">`;
  assert.equal(zaehleLabels(nurCss), 0, 'CSS-Selektoren sind kein Markup');
  assert.equal(pruefeSeiteAufKennzeichnung(nurCss, REGELN).fehlend, 1);
});

// Eine Deepfake-Einordnung ohne Begründung ist laut bildherkunft.js kein Nachweis und
// wird zu `ungeklaert`. Fiele sie stillschweigend unter „nicht pflichtig", schwiege der
// Wächter genau dort, wo die Deklaration kaputt ist — und wäre nicht rot zu bekommen.
test('Regel ohne Begründung wird als ungeklärt gemeldet, nicht als unbedenklich', () => {
  const ohneBegruendung = [{ pathPrefix: 'staedte/regensburg.webp', herkunft: 'ki-erzeugt', deepfake: 'ja' }];
  const b = pruefeSeiteAufKennzeichnung(HERO_OHNE_LABEL, ohneBegruendung);
  assert.deepEqual(b.pflichtig, [], 'ungültige Regel begründet keine Pflicht');
  assert.deepEqual(b.ungeklaert, ['/staedte/regensburg.webp'], 'aber sie verschwindet nicht');
});

// Das EU-Badge und Fremdhost-Bilder erschienen im ersten Sweep als „ungeklärt" — vier
// Zeilen pro Seite, die bei jedem Lauf wiederkommen und nie zu einer Handlung führen.
// Solches Dauerrauschen macht die echten Fälle unsichtbar.
test('EU-Badge und Fremdhost-Bilder sind kein Befund', () => {
  const html = `<img src="/_astro/ai-generated-black.C8dIL9_s.svg" alt="Mit KI erzeugt">
<img src="https://status.blitzsicht.com/badge/kunde.svg" alt="Status">`;
  const b = pruefeSeiteAufKennzeichnung(html, REGELN, { eigenerHost: 'kunde.de' });
  assert.deepEqual(b.ungeklaert, []);
  // Vektorgrafiken ebenso: ein Logo ähnelt keiner wirklichen Person und erschiene nicht
  // als echte Aufnahme (Art. 3 Nr. 60). Ohne diese Grenze bestünde der Bericht aus Logos.
  assert.deepEqual(pruefeSeiteAufKennzeichnung('<img src="/logo-inverted.svg">', REGELN).ungeklaert, []);
  assert.deepEqual(b.pflichtig, []);

  // Die EIGENE Domain absolut geschrieben ist kein Fremdbild und wird weiter geprüft.
  const eigen = '<img src="https://kunde.de/staedte/regensburg.webp" alt="x">';
  assert.equal(pruefeSeiteAufKennzeichnung(eigen, REGELN, { eigenerHost: 'kunde.de' }).pflichtig.length, 1);
});

test('undeklariertes Bild gilt als ungeklärt', () => {
  const b = pruefeSeiteAufKennzeichnung('<img src="/nirgends-deklariert.webp" alt="x">', REGELN);
  assert.deepEqual(b.ungeklaert, ['/nirgends-deklariert.webp']);
});

test('nicht pflichtige Bilder erzeugen keinen Befund', () => {
  const html = '<img src="/leistungen/glasreinigung.webp" alt="Glas"><img src="/logo.webp" alt="Logo">';
  const b = pruefeSeiteAufKennzeichnung(html, REGELN);
  assert.deepEqual(b.pflichtig, []);
  assert.deepEqual(b.ungeklaert, []);
  assert.equal(b.fehlend, 0);
});

// Ein <style>-Block kann Bilder von Komponenten nennen, die auf dieser Seite gar nicht
// rendern. Die Pflicht knüpft an den Betrachter an — ein solches Bild ist keine
// Fundstelle, sonst meldete der Guard Lücken, die es nicht gibt.
test('Bilder aus gebündeltem CSS sind keine Fundstelle, aus style-Attributen schon', () => {
  const imBlock = '<style>.x{background-image:url(/staedte/regensburg.webp)}</style>';
  assert.deepEqual(bilderAusHtml(imBlock), []);

  const amElement = '<div style="background-image:url(/staedte/regensburg.webp)"></div>';
  assert.deepEqual(bilderAusHtml(amElement), ['/staedte/regensburg.webp']);
});

test('srcset, video-poster und absolute URLs werden erfasst', () => {
  const html = `<img src="/a.webp" srcset="/a-640.webp 640w, /a-960.webp 960w">
<video poster="/p.webp"></video>
<img src="https://donau-profi.de/staedte/sinzing.webp?v=2">`;
  const b = bilderAusHtml(html);
  assert.ok(b.includes('/a-960.webp'), 'srcset');
  assert.ok(b.includes('/p.webp'), 'poster');
  assert.equal(pruefeSeiteAufKennzeichnung(html, REGELN).pflichtig.length, 1, 'Host und Query abgezogen');
});

// og:image zeigt auf das generierte Vorschaubild; dessen Badge sitzt in den Pixeln.
test('og:image ist keine DOM-Fundstelle', () => {
  const html = '<meta property="og:image" content="/staedte/regensburg.webp">';
  assert.deepEqual(bilderAusHtml(html), []);
});

test('checkAiLabels meldet je fehlender Kennzeichnung eine Fundstelle mit Namen', () => {
  const treffer = checkAiLabels(
    [
      { seite: 'gebaeudereinigung/regensburg', html: HERO_OHNE_LABEL },
      { seite: 'gebaeudereinigung/sinzing', html: HERO_MIT_LABEL },
    ],
    REGELN,
  );
  assert.equal(treffer.length, 1);
  assert.equal(treffer[0].seite, 'gebaeudereinigung/regensburg');
  assert.equal(treffer[0].bild, '/staedte/regensburg.webp');
});

// --- Regel-Parser ----------------------------------------------------------

test('einzeilige Regeln (erzeugtes Format) werden gelesen', () => {
  const src = `import type { BildHerkunftRegel } from '@cw/core/utils/bildherkunft';

export const bildHerkunft: BildHerkunftRegel[] = [
  { pathPrefix: 'videos/hero-poster.webp', herkunft: 'mensch' },
  { stem: 'hero', herkunft: 'ki-erzeugt', deepfake: 'ja', begruendung: 'Titelbild — im Zweifel gekennzeichnet' },
  { pathPrefix: 'staedte/regensburg.webp', herkunft: 'ki-erzeugt', deepfake: 'ja', begruendung: 'Zeigt einen benannten Ort' },
];`;
  const { regeln, problem } = leseHerkunftRegeln(src);
  assert.equal(problem, null);
  assert.equal(regeln.length, 3);
  assert.equal(regeln.filter((r) => r.deepfake === 'ja').length, 2);

  // Struktur allein genügt nicht: geparste Regeln müssen auch eine Pflicht BEGRÜNDEN.
  // Der erste Parser las `begruendung` nicht mit — die Regeln sahen vollständig aus,
  // waren für `resolveBildHerkunft` aber ungültig, und der Sweep meldete für sechs
  // gekennzeichnete Städteseiten „0 pflichtige Bilder".
  const b = pruefeSeiteAufKennzeichnung(HERO_OHNE_LABEL, regeln);
  assert.deepEqual(b.pflichtig, ['/staedte/regensburg.webp'], 'geparste Regel begründet die Pflicht');
  assert.equal(b.fehlend, 1);
});

// Der zweite Fehler vom 03.09.2026: siluri.de schreibt die Objekte mehrzeilig, ein
// zeilenweiser Regex fand dort null Regeln — und null sah aus wie „keine Pflicht".
test('mehrzeilige Regeln (handgepflegtes Format) werden gelesen', () => {
  const src = `export const bildHerkunft: BildHerkunftRegel[] = [
  {
    pathPrefix: 'images/team/portraet.webp',
    herkunft: 'ki-veraendert',
    deepfake: 'ja',
    begruendung:
      'Porträt einer realen Person, KI-optimiert; erscheint unter Klarnamen als echte Aufnahme',
  },
  {
    pathPrefix: 'images/icons/pfeil.svg',
    herkunft: 'mensch',
  },
];`;
  const { regeln, problem } = leseHerkunftRegeln(src);
  assert.equal(problem, null);
  assert.equal(regeln.length, 2);
  assert.equal(regeln[0].deepfake, 'ja');
});

// Dritter Formatfall (customer-preshot): der Name steht zuerst in einem Kommentar, und
// der Regeltyp ist lokal in derselben Datei definiert. Ein Parser, der auf die bloße
// Erwähnung anspringt, zerlegt das Interface statt des Arrays.
test('Erwähnung im Kommentar und lokaler Typ führen nicht in die Irre', () => {
  const src = `// Komponenten in v0.110.0 kennen die Prop \`bildHerkunft\` nicht. Zwei Fundstellen auf der
// Startseite bleiben deshalb ohne Label.
type DeepfakeEinordnung = 'ja' | 'nein';
interface BildHerkunftRegel {
  pathPrefix: string;
  herkunft: 'mensch' | 'ki-erzeugt';
  deepfake?: DeepfakeEinordnung;
  begruendung?: string;
}

export const bildHerkunft: BildHerkunftRegel[] = [
  {
    pathPrefix: 'images/stick-product.webp',
    herkunft: 'ki-erzeugt',
    deepfake: 'ja',
    begruendung: 'Produktaufnahme, wird als echte Aufnahme gelesen',
  },
  {
    pathPrefix: 'images/lifestyle-tee.webp',
    herkunft: 'ki-erzeugt',
    deepfake: 'nein',
    begruendung: 'Illustriert ohne bestimmten Sachverhalt',
  },
];`;
  const { regeln, problem } = leseHerkunftRegeln(src);
  assert.equal(problem, null);
  assert.equal(regeln.length, 2, 'die zwei Regeln, nicht die vier Interface-Felder');
  const b = pruefeSeiteAufKennzeichnung('<img src="/images/stick-product.webp" alt="x">', regeln);
  assert.equal(b.pflichtig.length, 1);
});

test('unlesbares Format meldet einen Parserfehler statt einer leeren Liste', () => {
  const src = `export const bildHerkunft = [
  mkRegel("images/a.webp", "ki-erzeugt", { deepfake: "ja" }),
];`;
  const { regeln, problem } = leseHerkunftRegeln(src);
  assert.equal(regeln.length, 0);
  assert.ok(problem, 'deepfake steht drin, es fällt aber keine Regel heraus');
});

test('Datei ohne jede Deklaration ist kein Fehler', () => {
  const { regeln, problem } = leseHerkunftRegeln('export const bildHerkunft = [];');
  assert.equal(regeln.length, 0);
  assert.equal(problem, null);
});
