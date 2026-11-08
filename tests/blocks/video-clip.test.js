// @ts-check
/**
 * VideoClip.astro und der `src`-Modus von VideoEmbed.astro, echt gerendert.
 *
 * Lauf: `node --test tests/blocks/video-clip.test.js`
 *
 * Anlass (07.11.2026): VideoEmbed hatte `aspect-ratio: 16 / 9` und `width=1280 height=720`
 * fest, ein Hochkant-Reel (1080×1920) wäre im Rahmen beschnitten worden. Zweite Lücke
 * derselben Stelle: das Poster-Label rendert nur im YouTube-Zweig, der Art.-50-Check
 * (`ai-label-check.js`) zählt das `poster` eines `<video>` aber als Bild — bei
 * pflichtigem Poster wäre der Build rot geworden, ohne dass die Komponente es lösen konnte.
 */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { renderer, schliessen, normalize } from './_render-astro.js';
import { bilderAusHtml, zaehleLabels } from '../../src/integrations/ai-discovery/ai-label-check.js';

after(schliessen);

const CLIP = 'src/components/blocks/VideoClip.astro';
const EMBED = 'src/components/blocks/VideoEmbed.astro';
const BASIS = { src: '/videos/reel.mp4', poster: '/videos/reel-poster.webp', title: 'Reel: So prüfen wir' };
const KI = [{ stem: 'reel-poster', herkunft: 'ki-erzeugt', deepfake: 'ja', begruendung: 'Testfixture' }];
const MENSCH = [{ stem: 'reel-poster', herkunft: 'mensch', begruendung: 'Testfixture' }];

/** @param {string} datei @param {Record<string, unknown>} props */
async function html(datei, props) {
  const r = await renderer();
  return normalize(await r.render(datei, props));
}

/** Attribute des ersten `<video>`. @param {string} h */
function videoTag(h) {
  const m = h.match(/<video\b[^>]*>/);
  assert.ok(m, 'kein <video> gerendert');
  return m[0];
}

test('1. Default 16/9: 1280×720, controls, preload=none, playsinline, kein autoplay', async () => {
  const v = videoTag(await html(CLIP, BASIS));
  for (const a of ['controls', 'preload="none"', 'playsinline', 'width="1280"', 'height="720"', 'poster="/videos/reel-poster.webp"']) {
    assert.ok(v.includes(a), `fehlt: ${a} in ${v}`);
  }
  assert.doesNotMatch(v, /autoplay/);
});

test('2. 9/16: width/height hochkant, Wurzel trägt das Verhältnis', async () => {
  const h = await html(CLIP, { ...BASIS, seitenverhaeltnis: '9/16' });
  const v = videoTag(h);
  assert.ok(v.includes('width="720"') && v.includes('height="1280"'), v);
  assert.match(h, /<figure class="video-clip"[^>]*data-seitenverhaeltnis="9\/16"/);
});

test('3. title wird zum aria-label am <video>', async () => {
  assert.match(videoTag(await html(CLIP, BASIS)), /aria-label="Reel: So prüfen wir"/);
});

test('4. unbekanntes Seitenverhältnis bricht mit Liste der erlaubten ab', async () => {
  await assert.rejects(html(CLIP, { ...BASIS, seitenverhaeltnis: '21/9' }), /seitenverhaeltnis="21\/9" unbekannt — erlaubt: 16\/9, 9\/16/);
});

test('5. Poster ki-erzeugt + deepfake ja → genau ein Label, unter dem Video', async () => {
  const h = await html(CLIP, { ...BASIS, bildHerkunft: KI });
  // Der Check sieht das Poster (und, schon vor diesem Umbau, die `<source>` des Videos).
  assert.ok(bilderAusHtml(h).includes('/videos/reel-poster.webp'));
  assert.equal(zaehleLabels(h), 1);
  // unter-bild: nicht absolut über der Steuerleiste des Players
  assert.doesNotMatch(h, /class="ai-label-am-bild"[^>]*position:absolute/);
});

test('6. Gegenprobe: Poster mensch → kein Label', async () => {
  assert.equal(zaehleLabels(await html(CLIP, { ...BASIS, bildHerkunft: MENSCH })), 0);
});

test('7. webm bekommt type=video/webm, mp4 video/mp4', async () => {
  assert.match(await html(CLIP, { ...BASIS, src: '/videos/a.webm' }), /<source src="\/videos\/a\.webm" type="video\/webm"/);
  assert.match(await html(CLIP, BASIS), /<source src="\/videos\/reel\.mp4" type="video\/mp4"/);
});

test('8. VideoEmbed src-Modus: Player-Attribute wie vor dem Umbau (1280×720), jetzt über VideoClip', async () => {
  const h = await html(EMBED, { ...BASIS, heading: 'So arbeiten wir' });
  const v = videoTag(h);
  for (const a of ['controls', 'preload="none"', 'playsinline', 'width="1280"', 'height="720"', 'poster="/videos/reel-poster.webp"']) {
    assert.ok(v.includes(a), `fehlt: ${a}`);
  }
  assert.match(h, /<source src="\/videos\/reel\.mp4" type="video\/mp4"/);
  assert.match(h, /class="video-clip"/);
  assert.match(h, /<h2 class="section-heading">So arbeiten wir<\/h2>/);
});

test('9. VideoEmbed src-Modus mit KI-Poster → Label (vorher 0, Build-Rot ohne Ausweg)', async () => {
  assert.equal(zaehleLabels(await html(EMBED, { ...BASIS, bildHerkunft: KI })), 1);
});

test('10. VideoEmbed YouTube-Modus unverändert: Facade-Button, kein <video>', async () => {
  const h = await html(EMBED, { youtubeId: 'airgjR6JN0Y', title: 'Film', poster: '/videos/p.webp' });
  assert.match(h, /<button[^>]*class="video-facade"[^>]*data-youtube-id="airgjR6JN0Y"/);
  assert.doesNotMatch(h, /<video\b/);
});
