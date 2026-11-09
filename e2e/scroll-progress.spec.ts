/**
 * ScrollProgress: beim Laden kein Lesen von `scrollHeight`, der Balken läuft trotzdem mit.
 *
 * Anlass (Lighthouse spedition-steller.de, 09.11.2026): „Erzwungener dynamischer Umbruch“ an
 * `update()` aus ScrollProgress. Erst 51 ms (synchrones Lesen beim Start), nach dem rAF-Versuch
 * in v0.194.1 noch 27 ms in 1 von 3 Läufen: ein rAF-Callback läuft vor dem Layout des Frames,
 * das Lesen erzwingt ihn trotzdem. Seitdem fährt CSS den Balken (`animation-timeline: scroll()`),
 * das Skript ist nur noch Rückfall und liest erst beim Scrollen.
 *
 * Seite: /content-page-motion/ aus examples (motion.progress). Gezählt werden nur Lesezugriffe
 * aus Inline-Skripten der Seite; `auto-events` (Analytik, Datei unter /_astro/) liest beim
 * Scrollen ebenfalls, das gehört nicht zu diesem Test.
 *
 * Der Rückfall liest einmal nach `load` (Startwert, Review zu cw-core#270): „beim Laden“
 * heißt deshalb im Rückfall „bevor `document.readyState` complete ist“. Der CSS-Weg, den
 * Chrome und damit Lighthouse nimmt, darf nie lesen.
 *
 * Gegenbeweis:
 *   - Der Rückfall MUSS beim Scrollen lesen (> 0), sonst misst der Spion nichts.
 *   - Ohne das Lesen nach `load` wird der Startwert-Test rot (Balken 0 statt voll).
 *   - Komponente und CSS aus v0.194.1 machen beide Lade-Fälle rot (gemessen 09.11.2026:
 *     2 von 3 rot mit „beim Laden gelesen“, Reduced Motion grün).
 *   - Steht ScrollProgress nicht mehr inline im HTML, scheitert der erste Test, statt mit 0 zu bestehen.
 */
import { test, expect, type Page } from '@playwright/test';

const SEITE = '/content-page-motion/';

test.use({ viewport: { width: 390, height: 800 } });

/** Getter-Spion: merkt sich die aufrufende Stelle jedes Lesens von `scrollHeight`. */
function spion() {
  const w = window as unknown as { __lesen: string[]; __vorLoad: string[] };
  w.__lesen = [];
  w.__vorLoad = [];
  const d = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollHeight')!;
  Object.defineProperty(Element.prototype, 'scrollHeight', {
    configurable: true,
    get() {
      const stelle = ((new Error().stack ?? '').split('\n')[2] ?? '').trim();
      w.__lesen.push(stelle);
      if (document.readyState !== 'complete') w.__vorLoad.push(stelle);
      return d.get!.call(this);
    },
  });
}

/** Rückfall erzwingen: der Browser „kann“ keine Scroll-Zeitleiste. */
function ohneZeitleiste() {
  const echt = CSS.supports.bind(CSS) as (...a: string[]) => boolean;
  (CSS as unknown as { supports: (...a: string[]) => boolean }).supports = (...a: string[]) =>
    a.join(':').includes('animation-timeline') ? false : echt(...a);
}

const zweiFrames = (page: Page) =>
  page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));

async function oeffnen(page: Page, o: { ohneZeitleiste?: boolean } = {}) {
  await page.addInitScript(spion);
  if (o.ohneZeitleiste) await page.addInitScript(ohneZeitleiste);
  await page.goto(SEITE, { waitUntil: 'load' });
  // v0.194.1 las im ersten rAF: ohne diese Frames sähe der Test den alten Fehler nicht.
  await zweiFrames(page);
}

/** Lesezugriffe aus Inline-Skripten der Seite, nicht aus /_astro/-Dateien. */
async function inlineLesen(page: Page, nur: '__lesen' | '__vorLoad' = '__lesen') {
  const alle = await page.evaluate((k) => (window as unknown as Record<string, string[]>)[k], nur);
  return alle.filter((s) => s.includes(SEITE) && !s.includes('/_astro/'));
}

const scaleX = (page: Page) =>
  page.evaluate(() => {
    const t = getComputedStyle(document.querySelector('[data-motion-progress]')!).transform;
    if (t === 'none') return 1;
    const m = t.match(/^matrix\(([^,]+)/);
    return m ? Number(m[1]) : NaN;
  });

test('ScrollProgress mit Scroll-Zeitleiste: kein Lesen beim Laden und Scrollen, Balken am Ende voll', async ({ page }) => {
  await oeffnen(page);
  // Sonst wäre die Herkunftsfilterung blind und jeder Fall bestünde mit 0.
  expect(await page.content()).toMatch(/<script type="module">[^<]*data-motion-progress/);
  expect(await inlineLesen(page), 'beim Laden gelesen').toEqual([]);
  expect(await scaleX(page)).toBeLessThan(0.05);
  await page.evaluate(() => window.scrollTo(0, 1e9));
  await zweiFrames(page);
  expect(await inlineLesen(page), 'beim Scrollen gelesen, obwohl CSS den Balken fährt').toEqual([]);
  expect(await scaleX(page)).toBeGreaterThan(0.95);
});

test('ScrollProgress-Rückfall ohne Zeitleiste: kein Lesen beim Laden, beim Scrollen schon, Balken folgt', async ({ page }) => {
  await oeffnen(page, { ohneZeitleiste: true });
  expect(await inlineLesen(page, '__vorLoad'), 'beim Laden gelesen').toEqual([]);
  // Die CSS-Animation würde den Inline-Wert des Skripts überdecken: hier misst nur das Skript.
  await page.addStyleTag({ content: '.motion-scroll-progress { animation: none !important; }' });
  await page.evaluate(() => window.scrollTo(0, 1e9));
  await zweiFrames(page);
  expect((await inlineLesen(page)).length, 'Rückfall liest beim Scrollen nicht: Spion misst nichts').toBeGreaterThan(0);
  expect(await scaleX(page)).toBeGreaterThan(0.9);
});

test('ScrollProgress-Rückfall: schon gescrollt, bevor der Listener hängt, Balken trotzdem voll', async ({ page }) => {
  // Ein klassisches Skript scrollt ans Ende, ein langsames zweites hält den Parser 1500 ms an.
  // Die Seite scrollt weich, die Ereignisse laufen über gut 600 ms (gemessen 09.11.2026); bei
  // 400 ms kamen die letzten erst nach dem Listener an, und der Test war ohne Fix grün.
  // In der Pause rendert der Browser und verschickt alle `scroll`-Ereignisse, bevor das
  // Modul-Skript (läuft erst nach dem Parsen) seinen Listener anhängt. So geht es auch beim
  // Sprung zu einem #Anker oder einer wiederhergestellten Position.
  await page.route('**/__langsam.js', async (r) => {
    await new Promise((f) => setTimeout(f, 1500));
    await r.fulfill({ contentType: 'text/javascript', body: '' });
  });
  await page.route(`**${SEITE}`, async (r) => {
    const antwort = await r.fetch();
    const html = (await antwort.text()).replace(
      '</body>',
      '<script>window.scrollTo(0, 1e9)</script><script src="/__langsam.js"></script></body>',
    );
    await r.fulfill({ response: antwort, body: html });
  });
  await oeffnen(page, { ohneZeitleiste: true });
  expect(await page.evaluate(() => window.scrollY), 'Vorbedingung: Seite ist gescrollt').toBeGreaterThan(0);
  expect(await inlineLesen(page, '__vorLoad'), 'beim Laden gelesen').toEqual([]);
  await page.addStyleTag({ content: '.motion-scroll-progress { animation: none !important; }' });
  // Nicht 0.9: Die Seite wächst nach `load` noch (gemessen 0.899), es zählt nur „nicht 0“.
  expect(await scaleX(page), 'Balken ohne Startwert').toBeGreaterThan(0.5);
});

test('ScrollProgress unter Reduced Motion ausgeblendet', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await oeffnen(page);
  await expect(page.locator('[data-motion-progress]')).toHaveCSS('display', 'none');
});
