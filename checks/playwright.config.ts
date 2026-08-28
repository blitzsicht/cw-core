import { defineConfig, devices } from '@playwright/test';

/**
 * Konfiguration für die Flotten-Guards — a11y-audit und mobile-audit.
 *
 * Diese Datei wirft beim Laden NICHT. Das ist Absicht und teuer gelernt: in
 * cw-visual-tests stand vom 07.08. bis 08.08.2026 ein requireSnapshotDir() in
 * der Config, und weil eine Playwright-Config IMMER geladen wird, starb daran
 * jeder Test des Repos — auch die beiden hier, die gar keine Screenshots
 * vergleichen. Sie melden „Error: SNAPSHOT_DIR fehlt", obwohl sie kein
 * SNAPSHOT_DIR brauchen.
 *
 * Deshalb ist der Snapshot-Mechanismus hier gar nicht erst enthalten: Er
 * gehört zum A/B-Gate (cw-visual-tests/visual.spec.ts), das dieselbe
 * Kundenseite zweimal baut und A gegen B difft. Die Guards hier vergleichen
 * kein Bild, sondern messen den frischen Build gegen harte Kriterien.
 *
 * WICHTIG — nicht gegen Produktion messen. baseURL zeigt auf den lokalen
 * Server, den webServer über DIST_DIR startet. In a11y-audit.spec.ts stand
 * früher `https://blitzsicht.com` fest verdrahtet; der Test mass damit immer
 * die Live-Seite statt des Builds, gegen den er lief — ein PR mit neuer
 * Regression kam grün durch, einer der eine behob fiel rot durch.
 */
// Port des Wegwerf-Servers. In CI ist 4321 frei; lokal laeuft dort haeufig
// schon ein Dev-Server einer anderen Sitzung, und Playwright bricht dann mit
// "port is already used" ab. PORT setzen statt fremde Prozesse abschiessen.
const PORT = Number(process.env.PORT ?? 4321);

export default defineConfig({
  // Die Specs liegen neben dieser Datei.
  testDir: '.',
  // 49 Seiten × 2 Viewports; jede Seite lädt, bekommt Animationen abgeschaltet
  // und wird von axe durchgerechnet. 60 s je Test lässt Luft für die grossen
  // Kundenseiten, ohne einen echten Hänger ewig laufen zu lassen.
  timeout: 60_000,
  retries: 1,
  // Auf GitHub-Runnern (2 Kerne) sind mehr Worker kontraproduktiv: der lokale
  // serve-Prozess und Chromium teilen sich dieselbe CPU.
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],
  projects: [
    {
      name: 'mobile',
      use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } },
    },
    {
      name: 'tablet',
      use: { ...devices['Desktop Chrome'], viewport: { width: 768, height: 1024 } },
    },
  ],
  use: {
    baseURL: process.env.BASE_URL || `http://127.0.0.1:${PORT}`,
    locale: 'de-DE',
    timezoneId: 'Europe/Berlin',
    colorScheme: 'light',
    reducedMotion: 'reduce',
    screenshot: 'off',
  },
  webServer: {
    // DIST_DIR ist der Web-Root des frisch gebauten Kunden-Builds. Bei Repos
    // mit Vercel-Adapter ist das dist/client, sonst dist — der Workflow
    // ermittelt das und reicht es hier herein. dist/ ist beim Vercel-Adapter
    // KEIN gültiger Web-Root: absolute Asset-Pfade wie /logo.svg 404en dort.
    command: `pnpm exec serve ${process.env.DIST_DIR || 'dist'} -l ${PORT}`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
