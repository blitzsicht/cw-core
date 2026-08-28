import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// Relativ navigieren — die Basis-URL kommt aus der Playwright-Config
// (`use.baseURL`), genau wie in mobile-audit.spec.ts. Vorher stand hier
// `https://blitzsicht.com` fest verdrahtet: der Test mass damit IMMER
// Produktion statt des Builds, gegen den er lief. Ein PR mit neuer
// Regression kam gruen durch, ein PR der eine behob fiel rot durch.
// Fuer Laeufe gegen Produktion: playwright.live.config.ts (LIVE_URL).
// Seiten kommen aus der Sitemap des Builds, nicht aus einer gepflegten Liste —
// dieselbe Lücke wie beim mobile-audit. Siehe tests/seiten.ts.
import { seitenAusBuild } from './seiten';

const PAGES = seitenAusBuild();

for (const route of PAGES) {
  test(`a11y ${route}`, async ({ page }) => {
    await page.goto(route, { waitUntil: 'domcontentloaded', timeout: 15_000 });

    await page.addStyleTag({
      // Einblendungen in ihren ENDZUSTAND zwingen, nicht nur beschleunigen.
      //
      // `transition-duration: 0s` nimmt der Einblendung das Tempo, aber nicht den
      // Startzustand: cw-core-Seiten verstecken [data-reveal] per
      // `opacity: 0; transform: translateY(30px) skewX(-2deg)`, bis ein
      // IntersectionObserver `.is-visible` setzt. Ein skewX verbreitert die
      // Bounding-Box um rund `Hoehe x tan(2deg)` — bei einer 200 px hohen Kachel
      // etwa 7 px. Ob der Observer beim Messen schon gefeuert hat, ist ein Rennen,
      // und der Guard urteilte deshalb bei gleichem Eingang unterschiedlich:
      // customer-gympanzen, derselbe Commit, drei Laeufe — gruen, gruen, rot
      // (/club/, 7,3 px), nach der Umstellung auf `load` + fonts.ready dann
      // rot, gruen, gruen.
      //
      // Gemessen wird der Zustand, den ein Besucher sieht, wenn die Seite steht —
      // und dann sind die Einblendungen durch.
      content: `
        *, *::before, *::after { animation-duration: 0s !important; transition-duration: 0s !important; }
        [data-reveal] { opacity: 1 !important; transform: none !important; }
      `,
    });

    // Auf den fertigen Zustand warten — sonst flackert der Guard.
    //
    // Bei `domcontentloaded` laufen Schriften und Bilder noch. Ob das Layout beim
    // Messen schon steht, ist damit ein Rennen, und der Guard entscheidet mal so,
    // mal so. Belegt am 28.08.2026 an customer-gympanzen: DERSELBE Commit, drei
    // Laeufe hintereinander — gruen, gruen, rot (/club/, 7,3 px ueber). Ein
    // blockierender Gate, der bei gleichem Eingang unterschiedlich urteilt, wird
    // weggeklickt; genau so ist der Vorgaenger-Guard hier gestorben (330 Laeufe
    // seit dem 26.04.2026, kein einziger gruen).
    //
    // Gemessen wird deshalb der gesetzte Zustand: das, was ein Besucher sieht,
    // wenn die Seite fertig ist. Dauerhafte Ueberstaende faengt das unveraendert
    // — nachgemessen an gottl-richter-gomeier, wo der Befund mit fonts.ready
    // bestehen blieb (797 px), weil er eben nicht vom Laden abhing.
    await page.waitForLoadState('load');
    await page.evaluate(() => document.fonts.ready);

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'])
      .analyze();

    const critical = results.violations.filter(v => v.impact === 'critical');
    const serious  = results.violations.filter(v => v.impact === 'serious');
    const moderate = results.violations.filter(v => v.impact === 'moderate');

    if (results.violations.length > 0) {
      console.log(`\n[${route}] ${results.violations.length} violations:`);
      for (const v of results.violations) {
        console.log(`  [${v.impact}] ${v.id}: ${v.description}`);
        for (const node of v.nodes.slice(0, 2)) {
          console.log(`    → ${node.target.join(', ')}`);
          if (node.failureSummary) console.log(`      ${node.failureSummary.split('\n')[0]}`);
        }
      }
    }

    expect(critical, `${route}: ${critical.length} critical a11y violations: ${critical.map(v => v.id).join(', ')}`).toHaveLength(0);
    expect(serious, `${route}: ${serious.length} serious a11y violations: ${serious.map(v => v.id).join(', ')}`).toHaveLength(0);
    // moderate + minor logged but not failing
  });
}
