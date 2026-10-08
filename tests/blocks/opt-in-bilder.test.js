// @ts-check
/**
 * Opt-in-Erweiterungen v0.171.0: Bilder statt Symbole (ProcessSteps, USPSection),
 * Logo-Badges (TrustBadges), Lightbox (LeistungenSection), Nav-Trenner (Header).
 * Der Hero hat eine eigene Datei: `hero-backdrop.test.js`.
 *
 * Lauf: `node --test tests/blocks/opt-in-bilder.test.js`
 *
 * ANLASS (haarwerk-neutraubling, Kundengespräch 08.10.2026): „Die Icons sind hässlich, mit
 * Bildern ersetzen“, „Hairdreams-Badge mit dem Logo“, „die Cards sind alle nicht klickbar“,
 * „im Menü eine Trennung einbringen“.
 *
 * Gegenprobe: Schnappschüsse VOR der Änderung aus v0.170.0
 * (`fixtures/opt-in-bilder-v0.170.0.json`). Ohne die neuen Props: Byte für Byte gleich.
 * Mit ihnen: anders, und zwar genau an der versprochenen Stelle.
 */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderer, schliessen, normalize } from './_render-astro.js';
import { FAELLE } from './opt-in-bilder-faelle.js';

after(schliessen);

const GOLDEN = JSON.parse(readFileSync(resolve(import.meta.dirname, 'fixtures/opt-in-bilder-v0.170.0.json'), 'utf8'));
/** KI-Bild aus dem Showcase, im Bestand deklariert als Testfixture. */
const KI = [{ stem: 'ki-karte', herkunft: 'ki-erzeugt', deepfake: 'ja', begruendung: 'Testfixture' }];

/** @param {string} datei @param {Record<string, unknown>} props */
async function render(datei, props) {
  const r = await renderer();
  return normalize(await r.render(datei, props));
}

async function bild() {
  const r = await renderer();
  return (await r.laden('examples/src/assets/ki-karte.webp')).default;
}

for (const name of ['processSteps', 'uspIcons', 'uspSvgMitHeading', 'trustCards', 'trustBar', 'leistungenGemischt', 'leistungenImageStilOhneBild', 'header']) {
  test(`ohne Opt-in: ${name} Byte für Byte wie v0.170.0`, async () => {
    assert.equal(await render(FAELLE[name].datei, FAELLE[name].props), GOLDEN[name]);
  });
}

// --- ProcessSteps ---------------------------------------------------------
const PS = FAELLE.processSteps;

test('ProcessSteps: numberStyle="outline" ausdrücklich = Default', async () => {
  assert.equal(await render(PS.datei, { ...PS.props, numberStyle: 'outline' }), GOLDEN.processSteps);
});

test('ProcessSteps: numberStyle="solid" setzt nur die Klasse am Raster', async () => {
  const html = await render(PS.datei, { ...PS.props, numberStyle: 'solid' });
  assert.equal(html, GOLDEN.processSteps.replace('class="steps cols-4"', 'class="steps cols-4 nr-solid"'));
});

test('ProcessSteps: image ersetzt das Symbol, Label mit bildHerkunft', async () => {
  const img = await bild();
  const items = /** @type {any[]} */ (PS.props.items).map((s, i) => (i === 1 ? { ...s, image: img, imageAlt: 'Wartebank' } : s));
  const html = await render(PS.datei, { ...PS.props, items, bildHerkunft: KI });
  assert.equal((html.match(/class="step-image"/g) ?? []).length, 1);
  assert.equal((html.match(/class="step-icon"/g) ?? []).length, 3, 'die übrigen Schritte behalten ihr Symbol');
  assert.doesNotMatch(html, />◷</, 'das ersetzte Symbol ist weg');
  assert.match(html, /alt="Wartebank"/);
  const kachel = html.slice(html.indexOf('class="step-image"'), html.indexOf('<h3>Warten'));
  assert.match(kachel, /ai-label-am-bild/);
});

test('Gegenprobe ProcessSteps: Bild ohne bildHerkunft → kein Label', async () => {
  const img = await bild();
  const html = await render(PS.datei, { ...PS.props, items: [{ nr: 1, image: img, title: 'A', desc: 'b' }] });
  assert.match(html, /class="step-image"/);
  assert.doesNotMatch(html, /ai-label-am-bild/);
  // Astro schreibt ein leeres alt als nacktes Attribut (`alt`), gleichbedeutend mit alt="".
  assert.match(html, /class="step-image"><img [^>]*\salt(="")?[\s>]/, 'ohne imageAlt dekorativ');
});

// --- USPSection -----------------------------------------------------------
test('USPSection: image gewinnt über iconSvg und icon, Label am Bild', async () => {
  const img = await bild();
  const html = await render('src/components/blocks/USPSection.astro', {
    heading: 'Öffnungszeiten',
    bildHerkunft: KI,
    items: [
      { image: img, imageAlt: 'Wanduhr', iconSvg: '/icons/uhr.svg', icon: '◷', title: 'Salon', description: 'Mo–Sa' },
      { icon: '◎', title: 'Ohne Bild', description: 'bleibt' },
    ],
  });
  assert.equal((html.match(/class="usp-image"/g) ?? []).length, 1);
  assert.doesNotMatch(html, /\/icons\/uhr\.svg/);
  assert.match(html, /alt="Wanduhr"/);
  assert.match(html, /ai-label-am-bild/);
  assert.match(html, /<div class="usp-icon" aria-hidden="true">◎<\/div>/);
});

// --- TrustBadges ----------------------------------------------------------
const TB = FAELLE.trustCards;

test('TrustBadges: logoSrc zeigt das Logo, in cards und bar', async () => {
  const cards = await render(TB.datei, { ...TB.props, badges: [{ label: 'SILVER-Salon', description: 'Hairdreams', logoSrc: '/logos/hd.svg', logoAlt: 'Hairdreams' }] });
  assert.match(cards, /<img class="badge-logo" src="\/logos\/hd\.svg" alt="Hairdreams" loading="lazy" decoding="async">/);
  const bar = await render(TB.datei, { variant: 'bar', badges: [{ label: 'SILVER-Salon', logoSrc: '/logos/hd.svg' }] });
  assert.match(bar, /class="badge-logo"[^>]*\salt(="")?[\s>]/, 'ohne logoAlt leer, das Label sagt es');
});

test('TrustBadges: variant="logo" — eigene Reihe, Beschreibung sichtbar', async () => {
  const html = await render(TB.datei, { variant: 'logo', badges: [{ label: 'SILVER-Salon', description: 'Partnerstatus', logoSrc: '/logos/hd.svg' }, { label: '4 Methoden' }] });
  assert.match(html, /class="trust-badges-section is-logo"/);
  assert.match(html, /class="trust-badges badge-logos"/);
  assert.match(html, /<span>Partnerstatus<\/span>/);
});

// --- LeistungenSection Lightbox -------------------------------------------
const LS = 'src/components/blocks/LeistungenSection.astro';

test('Lightbox: Bildkarte ohne href wird Auslöser, Dialog mit Label', async () => {
  const img = await bild();
  const html = await render(LS, {
    heading: 'Galerie',
    cardStyle: 'image',
    lightbox: true,
    bildHerkunft: KI,
    items: [
      { title: 'Empfang', imageSrc: img, imageAlt: 'Empfangstresen' },
      { title: 'Mit Link', imageSrc: img, href: '/salon' },
    ],
  });
  assert.equal((html.match(/class="leistung-card leistung-card-lightbox"/g) ?? []).length, 1, 'nur die Karte ohne href');
  assert.match(html, /<a href="\/salon" class="leistung-card leistung-card-link"/, 'Karte mit href bleibt Link');
  assert.match(html, /<button type="button" class="leistung-lightbox-trigger" data-lightbox-src="\/_image\?[^"]*w=1600[^"]*" data-lightbox-alt="Empfangstresen" data-lightbox-titel="Empfang" data-lightbox-idx="0" aria-haspopup="dialog">/);
  assert.match(html, /<dialog class="leistung-lightbox" aria-label="Bild vergrößert: Galerie">/);
  const dialog = html.slice(html.indexOf('<dialog'), html.indexOf('</dialog>'));
  assert.match(dialog, /data-lightbox-label="0" hidden>[\s\S]*ai-label-am-bild/, 'Kennzeichnung auch am großen Bild');
  assert.match(dialog, /aria-label="Schließen"/);
});

test('Gegenprobe Lightbox: ohne lightbox kein Dialog, keine Auslöser', async () => {
  const img = await bild();
  const html = await render(LS, { cardStyle: 'image', items: [{ title: 'Empfang', imageSrc: img }] });
  assert.doesNotMatch(html, /<dialog|leistung-lightbox/);
});

test('Lightbox ohne Bildkarten: kein leerer Dialog', async () => {
  const html = await render(LS, { ...FAELLE.leistungenGemischt.props, lightbox: true });
  assert.equal(html, GOLDEN.leistungenGemischt);
});

// --- Header ---------------------------------------------------------------
const HD = FAELLE.header;

test('Header: separatorBefore setzt genau einen Trenner vor den Punkt', async () => {
  const navItems = /** @type {any[]} */ (HD.props.navItems).map((n, i) => (i === 2 ? { ...n, separatorBefore: true } : n));
  const html = await render(HD.datei, { ...HD.props, navItems });
  assert.equal((html.match(/<span class="nav-sep" aria-hidden="true"><\/span>/g) ?? []).length, 1);
  const vorExtern = html.slice(0, html.indexOf('>Extern<'));
  assert.ok(vorExtern.lastIndexOf('nav-sep') > vorExtern.lastIndexOf('>Haarwerkstatt<'), 'Trenner steht zwischen Haarwerkstatt und Extern');
  assert.equal(html.replace(/<span class="nav-sep" aria-hidden="true"><\/span>/, ''), GOLDEN.header, 'sonst unverändert');
});

// --- Alt-Text-Guard (strictAltText) ---------------------------------------
// Kundenbuilds mit strictAltText=true brechen bei jedem <img> ohne verwertbaren Alt-Text
// ab, der keinen Deko-Marker trägt. Geprüft mit dem echten Guard (`lintPageImgAlt`),
// nicht mit einer Nachbildung — gemeldet vom haarwerk-Build am 08.10.2026: der leere
// Platzhalter im Lightbox-Dialog.
test('Alt-Text-Guard: Lightbox, Schritt- und USP-Bilder ohne imageAlt bestehen', async () => {
  const { mkdtempSync, writeFileSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const r = await renderer();
  const { lintPageImgAlt } = await r.laden('src/integrations/ai-discovery/index.ts');
  const img = await bild();
  // Roh gerendert, nicht `normalize()`: dessen Platzhalter `<ROOT>` im src der
  // Label-Symbole enthielte ein `>` und zerschnitte die img-Tags für den Guard.
  const teile = [
    await r.render(LS, { cardStyle: 'image', lightbox: true, bildHerkunft: KI, items: [{ title: 'Empfang', imageSrc: img, imageAlt: 'Empfangstresen' }] }),
    await r.render(PS.datei, { ...PS.props, items: [{ nr: 1, image: img, title: 'A', desc: 'b' }] }),
    await r.render('src/components/blocks/USPSection.astro', { items: [{ image: img, title: 'A', description: 'b' }] }),
  ];
  const dir = mkdtempSync(join(tmpdir(), 'alt-guard-'));
  writeFileSync(join(dir, 'index.html'), teile.join('\n'));
  assert.deepEqual(lintPageImgAlt(join(dir, 'index.html'), dir), []);
  // Der Dialog-Platzhalter ist im statischen HTML ausdrücklich dekorativ.
  assert.match(normalize(teile[0]), /<img class="leistung-lightbox-img" alt(="")? aria-hidden="true"/);

  // Gegenprobe: derselbe Guard meldet ein leeres alt ohne Marker.
  writeFileSync(join(dir, 'index.html'), '<img src="/x.webp" alt="">');
  assert.equal(lintPageImgAlt(join(dir, 'index.html'), dir).length, 1);
});
