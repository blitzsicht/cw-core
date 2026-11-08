// @ts-check
/**
 * Laufband-Bahnen: Polster = ein Abstand, Dauer aus der Kartenzahl.
 *
 * Lauf: `node --test tests/blocks/laufband-spur.test.js`
 *
 * ANLASS (cw-core#249, 07.11.2026): Beide Bahnen trugen `padding: 1rem 2rem` bei
 * `gap: 1.5rem`. Die Bahn enthält die Stimmen doppelt, der Keyframe läuft auf -50%,
 * also muss die halbe Spurbreite genau eine Periode sein (n Karten + n Abstände).
 * Mit links UND rechts 2rem blieben 2rem − gap/2 = 20px übrig: die Bahn sprang bei
 * jedem Durchlauf sichtbar zurück. Zweiter Fund: die Dauer stand fest (45 s / 50 s),
 * eine Bahn mit zwölf Stimmen wanderte damit dreimal so schnell wie eine mit vier.
 *
 * Die Kundenkopie `customer-blitzsicht/src/components/TestimonialsMarquee.astro` hat
 * beides seit blitzsicht#252 live; hier zieht die Flotte nach.
 */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderer, schliessen, normalize } from './_render-astro.js';

after(schliessen);

const ROOT = resolve(import.meta.dirname, '../..');

const BAHNEN = [
  {
    datei: 'src/components/blocks/Testimonials.astro',
    klasse: 'track',
    variable: 'cw-testimonials-dauer',
    props: (/** @type {number} */ n) => ({
      siteName: 'Testkunde',
      items: Array.from({ length: n }, (_, i) => ({ stars: 5, text: `Stimme ${i}`, name: `A${i}` })),
    }),
  },
  {
    datei: 'src/components/blocks/KundenfeedbackSection.astro',
    klasse: 'feedback-track',
    variable: 'cw-feedback-dauer',
    props: (/** @type {number} */ n) => ({
      items: Array.from({ length: n }, (_, i) => ({ text: `Stimme ${i}` })),
    }),
  },
];

/** rem-Wert einer CSS-Länge; NaN, wenn es keine ist. @param {string} wert */
const rem = (wert) => {
  // Eine Null braucht keine Einheit (`padding: 1rem var(--cw-gap) 1rem 0`), jede andere Zahl schon.
  const m = /^([\d.]+)(rem|px)?$/.exec(wert.trim());
  if (!m) return Number.NaN;
  if (!m[2]) return Number(m[1]) === 0 ? 0 : Number.NaN;
  return m[2] === 'px' ? Number(m[1]) / 16 : Number(m[1]);
};

/**
 * Liest die Spur-Regel aus dem <style> und rechnet Polster und Abstand in rem.
 * Lokale Custom Properties derselben Regel werden aufgelöst — `gap: var(--cw-gap)`
 * mit `--cw-gap: 1.5rem` ergibt 1.5.
 * @param {string} quelle
 * @param {string} klasse
 * @returns {{ gap: number, links: number, rechts: number }}
 */
export function spurMasse(quelle, klasse) {
  const stil = (quelle.match(/<style>([\s\S]*?)<\/style>/) ?? [])[1] ?? '';
  // Erste Regel der Klasse ohne Pseudo/Media-Verschachtelung: `  .track {` am Zeilenanfang.
  const re = new RegExp(`\\n[ \\t]*\\.${klasse}\\s*\\{([^}]*)\\}`);
  const block = (stil.match(re) ?? [])[1];
  assert.ok(block, `keine Regel .${klasse} im <style> gefunden`);
  /** @type {Record<string, string>} */
  const eigene = {};
  for (const m of block.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) eigene[m[1]] = m[2].trim();
  /** @param {string} wert */
  const aufloesen = (wert) =>
    wert.replace(/var\((--[\w-]+)(?:\s*,\s*([^)]+))?\)/g, (_, name, fallback) => eigene[name] ?? fallback ?? '');
  /** @param {string} eigenschaft */
  const lies = (eigenschaft) => {
    const m = block.match(new RegExp(`(?:^|;|\\n)\\s*${eigenschaft}\\s*:\\s*([^;]+);`));
    return m ? aufloesen(m[1]).trim() : '';
  };
  // Nur die Kurzform wird gelesen. Eine Langform darunter (`padding-inline: 2rem`) brächte
  // den Sprung zurück, ohne dass die Kurzform sich ändert — deshalb verboten (Review #251, B10).
  assert.doesNotMatch(block, /padding-(?:inline|left|right)/, `.${klasse}: Polster nur als Kurzform erlaubt`);
  const padding = lies('padding').split(/\s+/).filter(Boolean);
  assert.ok(padding.length >= 1 && padding.length <= 4, `padding unlesbar in .${klasse}: ${lies('padding')}`);
  const rechts = padding[padding.length >= 2 ? 1 : 0];
  const links = padding.length === 4 ? padding[3] : rechts;
  return { gap: rem(lies('gap')), links: rem(links), rechts: rem(rechts) };
}

for (const bahn of BAHNEN) {
  const quelle = readFileSync(resolve(ROOT, bahn.datei), 'utf8');

  test(`${bahn.klasse}: Polster links + rechts = ein Abstand`, () => {
    const { gap, links, rechts } = spurMasse(quelle, bahn.klasse);
    assert.ok(gap > 0, `gap nicht lesbar: ${gap}`);
    assert.equal(links + rechts, gap, `Polster ${links} + ${rechts} rem gegen gap ${gap} rem`);
  });

  test(`${bahn.klasse}: Einzug steht in margin, nicht im Polster`, () => {
    // margin zählt nicht in `width: max-content`, padding schon — deshalb der Umzug.
    assert.match(quelle, new RegExp(`\\.${bahn.klasse}\\s*\\{[^}]*margin-inline-start:\\s*2rem`));
    // Bei reduzierter Bewegung bricht die Bahn um und mittet; der Einzug muss dann weg.
    const reduziert = (quelle.match(/@media \(prefers-reduced-motion: reduce\)([\s\S]*?)\n  \}\n/) ?? [])[1] ?? '';
    // An der Spur selbst, nicht irgendwo im Block (Review #251, B9).
    const spurReduziert = (reduziert.match(new RegExp(`\\.${bahn.klasse}\\s*\\{([^}]*)\\}`)) ?? [])[1] ?? '';
    assert.match(spurReduziert, /margin-inline-start:\s*0/, 'Einzug bleibt bei reduzierter Bewegung stehen');
  });

  test(`${bahn.klasse}: Dauer kommt aus der Kartenzahl (4 → 45 s, 8 → 90 s)`, async () => {
    const r = await renderer();
    const html4 = normalize(await r.render(bahn.datei, bahn.props(4)));
    const html8 = normalize(await r.render(bahn.datei, bahn.props(8)));
    assert.match(html4, new RegExp(`--${bahn.variable}-auto:\\s*45s`), `4 Karten: 45s fehlt`);
    assert.match(html8, new RegExp(`--${bahn.variable}-auto:\\s*90s`), `8 Karten: 90s fehlt`);
    // Der Name zum Überschreiben darf NICHT im style-Attribut stehen, sonst kommt keine
    // Kundenregel durch (Review #251, B1).
    assert.doesNotMatch(html4, new RegExp(`--${bahn.variable}:`), 'Überschreib-Name steht im style-Attribut');
    // Trennschärfe: die Dauer muss aus der Variablen kommen. Vorher stand sie als
    // fester Wert in der Kurzform (`animation: cw-…-slide 45s linear infinite`) —
    // dann greift kein style-Attribut, und diese Probe wird rot.
    const regel = (quelle.match(new RegExp(`\\n[ \\t]*\\.${bahn.klasse}\\s*\\{([^}]*)\\}`)) ?? [])[1] ?? '';
    const animation = (regel.match(/animation:\s*([^;]+);/) ?? [])[1] ?? '';
    assert.match(animation, new RegExp(`var\\(--${bahn.variable},\\s*var\\(--${bahn.variable}-auto`), `Dauer nicht aus der Variablen: ${animation}`);
  });

  test(`${bahn.klasse}: ohne Stimmen rendert die Bahn gar nicht`, async () => {
    const r = await renderer();
    const html = normalize(await r.render(bahn.datei, bahn.props(0)));
    assert.ok(!html.includes(bahn.variable), 'Dauer-Variable ohne Stimmen im HTML');
    assert.ok(!html.includes(`class="${bahn.klasse}"`), 'Bahn ohne Stimmen im HTML');
  });
}

test('Gegenprobe: padding 1rem 2rem bei gap 1.5rem wird als Sprung erkannt', () => {
  const kaputt = `<div class="track"></div>
<style>
  .track {
    display: flex;
    gap: 1.5rem;
    padding: 1rem 2rem;
  }
</style>`;
  const { gap, links, rechts } = spurMasse(kaputt, 'track');
  assert.equal(gap, 1.5);
  assert.notEqual(links + rechts, gap);
  // Der Rest, der den 20-px-Sprung erzeugt: 2rem − gap/2.
  assert.equal((rechts - gap / 2) * 16, 20);
});

test('Gegenprobe: aufgelöste Variable zählt wie ein fester Wert', () => {
  const heute = `<div></div>
<style>
  .track {
    --cw-gap: 1.5rem;
    gap: var(--cw-gap);
    padding: 1rem var(--cw-gap) 1rem 0;
  }
</style>`;
  const { gap, links, rechts } = spurMasse(heute, 'track');
  assert.equal(links + rechts, gap);
});
