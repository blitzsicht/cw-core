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
import { formularKontrastBefunde, unterSchwelle, WEISS_AUF_WEISS, LESBAR } from './formular-kontrast.mjs';

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

    // Formularkontrast (blitzsicht-ops#1055 A2): Eingabetext und Placeholder jedes sichtbaren
    // Felds gegen den effektiven Hintergrund. axe sieht das nicht — ein leeres Feld hat keinen
    // Textknoten, der Placeholder ist ein Pseudo-Element. Soft-Start: Befund als Annotation und
    // im Log; rot erst mit STRICT_FORMULAR_KONTRAST=1 (Flottenmessung vor dem Umschalten,
    // Muster ops#1053). Messlogik und Fixtures: formular-kontrast.mjs.
    const formular = await page.evaluate(formularKontrastBefunde);
    const schlecht = unterSchwelle(formular, 4.5);
    if (schlecht.length > 0) {
      console.log(`\n[${route}] ${schlecht.length} Formularfelder unter 4,5:1:`);
      for (const b of schlecht) {
        console.log(`  ${b.feld}: Text ${b.text} = ${b.textKontrast}:1`
          + (b.placeholder ? `, Placeholder ${b.placeholder} = ${b.placeholderKontrast}:1` : '')
          + ` auf ${b.hintergrund}`);
      }
      test.info().annotations.push({
        type: 'formular-kontrast',
        description: `${route}: ${schlecht.map((b) => `${b.feld} ${b.textKontrast}/${b.placeholderKontrast ?? '-'}`).join(', ')}`,
      });
    }
    if (process.env.STRICT_FORMULAR_KONTRAST === '1') {
      expect(schlecht, `${route}: ${schlecht.length} Formularfelder unter 4,5:1: ${schlecht.map((b) => b.feld).join(', ')}`).toHaveLength(0);
    }
  });
}

// Skip-Link (cw-core #216, Bake-off 05.11.2026 F-007 an haarwerk): der erste Tab-Stop jeder Seite ist der Link
// „Zum Inhalt springen", Enter setzt den Fokus auf <main id="inhalt" tabindex="-1">. Link und main kommen aus
// BaseLayout/LandingPage/ContentPage, nicht aus der Seite — eine Seite des Builds genügt als Probe.
// Negativprobe (gemessen 05.11.2026 am haarwerk-Build): Link aus dem gebauten HTML entfernt → erster Tab-Stop ist
// das Logo, Test rot; mit Link grün.
if (PAGES.length > 0) {
  test(`skip-link ${PAGES[0]}`, async ({ page }) => {
    await page.goto(PAGES[0], { waitUntil: 'load', timeout: 15_000 });
    await page.keyboard.press('Tab');
    const erster = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      return el ? { tag: el.tagName, href: el.getAttribute('href') } : null;
    });
    expect(erster, 'erster Tab-Stop muss der Skip-Link (a[href="#inhalt"]) sein').toEqual({ tag: 'A', href: '#inhalt' });
    await page.keyboard.press('Enter');
    const ziel = await page.evaluate(() => document.activeElement?.id ?? '');
    expect(ziel, 'Enter auf dem Skip-Link muss den Fokus auf main#inhalt setzen').toBe('inhalt');
  });
}

// Gegenprobe des Messers im selben Lauf: der echte Fehlerfall muss melden, der Fix nicht.
// Ohne diese Probe wäre ein Guard, der nie rot wird, von einem Guard, der misst, nicht zu
// unterscheiden (claim-verification, Kurztest 3).
test('formular-kontrast: Fixture weiß-auf-weiß meldet, Fixture lesbar nicht', async ({ page }) => {
  await page.setContent(WEISS_AUF_WEISS);
  const kaputt = unterSchwelle(await page.evaluate(formularKontrastBefunde));
  expect(kaputt.length, 'Fehlerfall muss melden').toBe(2);
  await page.setContent(LESBAR);
  const heil = unterSchwelle(await page.evaluate(formularKontrastBefunde));
  expect(heil, 'Fix darf nichts melden').toHaveLength(0);
});
