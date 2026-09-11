import { test, expect } from '@playwright/test';

// Seiten aus der Sitemap des Builds, wie bei mobile-audit (Begründung in seiten.ts).
import { seitenAusBuild } from './seiten';
// Messlogik liegt getrennt, damit sie auch ohne den Test-Runner prüfbar ist
// (lokal hängt der Runner unter Node 26; die Library läuft).
import { layoutBefunde, bereiteVor, KAPUTT, HEIL } from './layout-befunde.mjs';

const PAGES = seitenAusBuild();

// Positivkontrolle ZUERST und in jedem Projekt: die Prüfung muss an einer Seite mit
// beiden Fehlerformen anschlagen und an der reparierten Fassung schweigen. Ohne diese
// Kontrolle wäre ein grüner Lauf auch dann grün, wenn die Messung nie etwas findet —
// „kann nicht rot werden" ist der teuerste Fehler eines Guards (claim-verification.md).
test('layout-audit Positivkontrolle', async ({ page }) => {
  await page.setContent(KAPUTT);
  await bereiteVor(page);
  const kaputt = await page.evaluate(layoutBefunde);
  expect(kaputt.luecken.length, 'Kontrolle: einseitige Lücke nicht erkannt').toBeGreaterThan(0);
  expect(kaputt.kartenreste.length, 'Kontrolle: ungefärbter Kartenrest nicht erkannt').toBeGreaterThan(0);

  await page.setContent(HEIL);
  await bereiteVor(page);
  const heil = await page.evaluate(layoutBefunde);
  expect(heil.luecken, 'Gegenprobe: reparierte Seite meldet Lücke').toEqual([]);
  expect(heil.kartenreste, 'Gegenprobe: reparierte Seite meldet Kartenrest').toEqual([]);
});

for (const route of PAGES) {
  test(`layout-audit ${route}`, async ({ page }) => {
    await page.goto(route, { waitUntil: 'domcontentloaded' });
    await bereiteVor(page);
    const { luecken, kartenreste } = await page.evaluate(layoutBefunde);
    const breite = page.viewportSize()?.width;

    // Weißer Streifen neben einem Vollbreiten-Bild oder -Block (Anlass: haarwerk-Hero,
    // aspect-ratio + max-height ohne width → Breite schrumpft am Höhendeckel).
    expect(
      luecken,
      `${route} @ ${breite}px: bemaltes Element endet einseitig vor dem Sektionsrand, daneben ist nichts:\n` +
        luecken.map((l) => `  ${l.element} in ${l.sektion}: ${l.px} px Lücke ${l.seite} (${l.elementBreite}/${l.sektionBreite} px)`).join('\n') +
        '\n  Typische Ursache: aspect-ratio + max-height ohne width. Fix: width: 100% am Wrapper.',
    ).toEqual([]);

    // Ungefärbter Rest in einer Karte (Anlass: haarwerk-Kacheln, Farbe nur auf dem
    // inneren Block, Grid dehnt auf die Höhe der Nachbarkarte).
    expect(
      kartenreste,
      `${route} @ ${breite}px: Karte mit ungefärbtem Rest:\n` +
        kartenreste.map((k) => `  ${k.karte} in ${k.raster}: ${k.restUnten} px unten / ${k.restOben} px oben ohne Farbe (Höhe ${k.kartenHoehe} px)`).join('\n') +
        '\n  Typische Ursache: Hintergrund nur auf einem inneren Block. Fix: Farbe auf die Karte, innerer Block flex: 1.',
    ).toEqual([]);
  });
}
