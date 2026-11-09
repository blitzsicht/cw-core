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
 * Gegenbeweis:
 *   - Der Rückfall MUSS beim Scrollen lesen (> 0), sonst misst der Spion nichts.
 *   - Komponente und CSS aus v0.194.1 machen beide Lade-Fälle rot (gemessen 09.11.2026:
 *     2 von 3 rot mit „beim Laden gelesen“, Reduced Motion grün).
 *   - Steht ScrollProgress nicht mehr inline im HTML, scheitert der erste Test, statt mit 0 zu bestehen.
 */
import { test, expect, type Page } from '@playwright/test';

const SEITE = '/content-page-motion/';

test.use({ viewport: { width: 390, height: 800 } });

/** Getter-Spion: merkt sich die aufrufende Stelle jedes Lesens von `scrollHeight`. */
function spion() {
  const w = window as unknown as { __lesen: string[] };
  w.__lesen = [];
  const d = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollHeight')!;
  Object.defineProperty(Element.prototype, 'scrollHeight', {
    configurable: true,
    get() {
      w.__lesen.push(((new Error().stack ?? '').split('\n')[2] ?? '').trim());
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
async function inlineLesen(page: Page) {
  const alle = await page.evaluate(() => (window as unknown as { __lesen: string[] }).__lesen);
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
  expect(await inlineLesen(page), 'beim Laden gelesen').toEqual([]);
  // Die CSS-Animation würde den Inline-Wert des Skripts überdecken: hier misst nur das Skript.
  await page.addStyleTag({ content: '.motion-scroll-progress { animation: none !important; }' });
  await page.evaluate(() => window.scrollTo(0, 1e9));
  await zweiFrames(page);
  expect((await inlineLesen(page)).length, 'Rückfall liest beim Scrollen nicht: Spion misst nichts').toBeGreaterThan(0);
  expect(await scaleX(page)).toBeGreaterThan(0.9);
});

test('ScrollProgress unter Reduced Motion ausgeblendet', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await oeffnen(page);
  await expect(page.locator('[data-motion-progress]')).toHaveCSS('display', 'none');
});
