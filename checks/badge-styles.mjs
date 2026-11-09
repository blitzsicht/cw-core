// Berechnete Stile des ersten ProcessSteps-Badge-SVG je Seite und Breite — die
// Sichtprüfung neben dem Pixelvergleich (Herkunft: ops#1051 Befund 7, 04.11.2026).
//
//   BADGE_SEITEN="/,/websites/" node badge-styles.mjs http://127.0.0.1:4399
import { chromium } from '@playwright/test';
import { badgeSeiten } from './badge-seiten.mjs';

const base = process.argv[2];
if (!base) {
  console.error('usage: BADGE_SEITEN="/,/…/" node badge-styles.mjs <baseUrl>');
  process.exit(2);
}

const SEITEN = badgeSeiten(['/'], 'der Vorgabe');
const BREITEN = (process.env.BADGE_BREITEN ?? '390,1400').split(',').map((b) => Number(b.trim()));
const SELEKTOR = process.env.BADGE_SELEKTOR ?? '.step-badge';

const browser = await chromium.launch();
let gefunden = 0;
for (const seite of SEITEN) {
  for (const breite of BREITEN) {
    const ctx = await browser.newContext({ viewport: { width: breite, height: 900 }, reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    await page.goto(base + seite, { waitUntil: 'load' });
    const r = await page.evaluate((sel) => {
      const svgs = [...document.querySelectorAll(`${sel} svg`)];
      const cs = svgs.length ? getComputedStyle(svgs[0]) : null;
      return { anzahl: svgs.length, strokeWidth: cs?.strokeWidth, fill: cs?.fill, stroke: cs?.stroke, width: cs?.width, height: cs?.height, linecap: cs?.strokeLinecap, ariaHidden: svgs[0]?.getAttribute('aria-hidden'), focusable: svgs[0]?.getAttribute('focusable') };
    }, SELEKTOR);
    if (r.anzahl > 0) gefunden += 1;
    console.log(`${seite}@${breite} ${JSON.stringify(r)}`);
    await ctx.close();
  }
}
await browser.close();

// Siehe badge-shots.mjs: ein Lauf, der nirgends ein Badge gesehen hat, hat nichts
// geprüft und darf nicht mit 0 enden.
if (gefunden === 0) {
  console.error(`ABBRUCH: kein ${SELEKTOR} svg auf ${SEITEN.length} Seite(n) (${SEITEN.join(', ')}).`);
  process.exit(1);
}
console.log(`fertig: ${gefunden} von ${SEITEN.length * BREITEN.length} Messungen mit Badge`);
