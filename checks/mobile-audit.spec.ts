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

    // 1. Horizontal scroll
    //
    // Warum ohne Toleranz: gemessen an einer Testseite mit exakt gesetztem
    // Ueberstand meldet der Browser ab 0,5 px scrollWidth+1, und dann verschiebt
    // scrollTo(9999, 0) die Seite tatsaechlich (scrollX = 1). Ein Pixel ist also
    // echtes seitliches Scrollen, kein Rundungsartefakt — unterhalb von 0,5 px
    // schlaegt der Guard gar nicht erst an.
    const { scrollWidth, clientWidth, taeter } = await page.evaluate(() => {
      const doc = document.documentElement;
      const cw = doc.clientWidth;
      // Wer steht ueber? NICHT einfach die aeusserste Box nehmen — die luegt,
      // sobald ein Vorfahr clippt. Belegt am 28.08.2026 an customer-herztoene:
      // gemeldet war `div.hero-blob` mit 76,8 px, der echte Ueberstand betrug
      // 23 px (scrollWidth 791 gegen clientWidth 768). Der Blob sitzt in
      // `.hero { overflow: hidden }` und scrollt gar nicht — er ragt nur
      // geometrisch hinaus. Eine Diagnose, die aufs falsche Element zeigt, ist
      // teurer als keine: sie schickt die Suche in die falsche Datei.
      //
      // Deshalb gemessen statt geschlossen: Kandidat ausblenden, scrollWidth
      // neu lesen. Was den Scroll verursacht, verkuerzt ihn beim Verschwinden.
      // Das deckt Clipping durch jeden Vorfahren ab, ohne die Regeln fuer
      // Containing Blocks nachbauen zu muessen (position, transform, filter,
      // contain — dort liegen die Sonderfaelle, die eine Heuristik verliert).
      const soll = doc.scrollWidth;
      const KAPPE = 50;
      const kandidaten = [];
      for (const el of document.querySelectorAll('*')) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0 || r.right <= cw + 0.01) continue;
        if ([...el.children].some((k) => k.getBoundingClientRect().right >= r.right - 0.01)) continue;
        kandidaten.push({ el, r });
      }
      // Jeder Kandidat kostet einen Reflow. Gekappt wird sichtbar, nie still —
      // eine unerwaehnte Obergrenze liest sich wie „alles geprueft".
      const gekappt = kandidaten.length > KAPPE;
      let bester = null;
      for (const k of kandidaten.slice(0, KAPPE)) {
        const vorher = k.el.style.getPropertyValue('display');
        const wichtig = k.el.style.getPropertyPriority('display');
        k.el.style.setProperty('display', 'none', 'important');
        const ohne = doc.scrollWidth;
        if (vorher) k.el.style.setProperty('display', vorher, wichtig);
        else k.el.style.removeProperty('display');
        const wirkung = soll - ohne;
        if (wirkung > 0 && (!bester || wirkung > bester.wirkung)) bester = { ...k, wirkung, ohne };
      }
      let taeter = '';
      if (bester) {
        const el = bester.el;
        const r = bester.r;
        const cls = typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\s+/).join('.') : '';
        // transform mit ausgeben: ein skew oder translate erklaert einen
        // Ueberstand, den die reine Breite nicht hergibt.
        const cs = getComputedStyle(el);
        const tf = cs.transform && cs.transform !== 'none' ? ` · transform ${cs.transform}` : '';
        // Bleibt nach dem Ausblenden Scroll uebrig, sind mehrere Ursachen im
        // Spiel. Ohne diesen Zusatz wird nach dem ersten Fix Vollzug gemeldet
        // und der Rest faellt beim naechsten Lauf erneut auf.
        const rest = bester.ohne > cw + 0.01
          ? ` — danach bleiben ${(bester.ohne - cw).toFixed(1)}px von anderer Stelle`
          : '';
        taeter = `${el.tagName.toLowerCase()}${cls} — rechte Kante ${r.right.toFixed(1)}px, verursacht ${bester.wirkung.toFixed(1)}px Scroll${tf}${rest}`;
      } else if (kandidaten.length) {
        // Elemente ragen hinaus, aber keines verursacht Scroll: alle geclippt.
        // Genau der herztoene-Fall — frueher wurde hier das erste gemeldet.
        taeter = `${kandidaten.length} Element(e) ragen hinaus, keines verursacht Scroll (alle geclippt) — Ursache liegt woanders`;
      }
      if (gekappt && taeter) taeter += ` [nur die ersten ${KAPPE} von ${kandidaten.length} Kandidaten geprueft]`;
      // Kein Element? Dann steht der Text ueber, nicht seine Box — so lag es bei
      // steller-sanierungen: 45 Unterstriche in einer Ausfuellzeile, fuer den
      // Browser EIN Wort. Ohne diesen Zweig bliebe die Meldung leer, und genau
      // dann braucht sie jemand.
      if (!taeter) {
        const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        let n;
        while ((n = w.nextNode())) {
          if (!n.nodeValue || !n.nodeValue.trim()) continue;
          const rg = document.createRange();
          rg.selectNodeContents(n);
          for (const r of rg.getClientRects()) {
            if (r.right > cw + 0.01) {
              const el = n.parentElement;
              const cls = el && typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\s+/).join('.') : '';
              taeter = `Text in ${el ? el.tagName.toLowerCase() : '?'}${cls} — rechte Kante ${r.right.toFixed(1)}px, ${(r.right - cw).toFixed(1)}px zu weit: "${n.nodeValue.trim().slice(0, 40)}"`;
              break;
            }
          }
          if (taeter) break;
        }
      }
      if (!taeter) taeter = '(kein Element und kein Text verursacht den Scroll — Ursache woanders, etwa eine Breitenangabe am Body)';
      return { scrollWidth: doc.scrollWidth, clientWidth: cw, taeter };
    });
    expect(
      scrollWidth,
      `${route}: horizontal scroll (scrollWidth=${scrollWidth} > clientWidth=${clientWidth})\n      Ueberstand verursacht von: ${taeter}`,
    ).toBeLessThanOrEqual(clientWidth);

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
