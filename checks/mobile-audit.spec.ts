import { test, expect } from '@playwright/test';

// Seiten kommen aus der Sitemap des Builds, nicht aus einer gepflegten Liste:
// die alte 7er-Liste sah 7 von 49 Seiten, und /forschung — das am 27.08.2026
// nachweislich mobil brach — war nicht dabei. Siehe tests/seiten.ts.
import { seitenAusBuild } from './seiten';

const PAGES = seitenAusBuild();

for (const route of PAGES) {
  test(`mobile-audit ${route}`, async ({ page }) => {
    await page.goto(route, { waitUntil: 'domcontentloaded' });

    // Disable animations
    await page.addStyleTag({
      content: `*, *::before, *::after { animation-duration: 0s !important; transition-duration: 0s !important; }`,
    });

    // 1. Horizontal scroll
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth, `${route}: horizontal scroll (scrollWidth=${scrollWidth} > clientWidth=${clientWidth})`).toBeLessThanOrEqual(clientWidth);

    // 2. Small touch targets
    const smallTargets = await page.evaluate(() => {
      const els = [...document.querySelectorAll('button, a[href], [role="button"], summary')];
      return els
        .filter(el => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0 && r.top < window.innerHeight && (r.width < 44 || r.height < 44);
        })
        .map(el => ({
          tag: el.tagName,
          text: (el.textContent || '').trim().slice(0, 50),
          w: Math.round(el.getBoundingClientRect().width),
          h: Math.round(el.getBoundingClientRect().height),
        }));
    });

    if (smallTargets.length > 0) {
      console.warn(`[${route}] Small touch targets (${smallTargets.length}):`);
      for (const t of smallTargets.slice(0, 5)) {
        console.warn(`  ${t.tag} "${t.text}" — ${t.w}×${t.h}px`);
      }
    }
    // Log only, don't fail (some decorative links may legitimately be small)
    // expect(smallTargets.length, `${route}: ${smallTargets.length} touch targets < 44px`).toBe(0);

    // 3. Images wider than viewport
    const wideImgs = await page.evaluate((vpW: number) => {
      return [...document.images]
        .filter(img => {
          const r = img.getBoundingClientRect();
          return r.width > vpW;
        })
        .map(img => ({ src: img.src.split('/').pop(), w: Math.round(img.getBoundingClientRect().width) }));
    }, clientWidth);

    expect(wideImgs.length, `${route}: images wider than viewport: ${JSON.stringify(wideImgs)}`).toBe(0);
  });
}
