import { defineConfig, devices } from '@playwright/test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Pixelvergleich der ProcessSteps-Badges: Baseline-Build gegen PR-Build
 * (Herkunft: ops#1051 Befund 7, 04.11.2026).
 *
 * Liegt in checks/, damit `@playwright/test` aus `checks/node_modules` aufgelöst
 * wird — dasselbe Paket und dieselbe Version wie die drei Flotten-Guards.
 *
 * Diese Datei wirft beim Laden NICHT, aus demselben Grund wie
 * `playwright.config.ts`: eine Config wird immer geladen, und ein `throw` darin
 * reißt jeden Test des Verzeichnisses mit. Fehlt das Snapshot-Verzeichnis,
 * meldet das Playwright selbst beim ersten Vergleich.
 *
 * Das Snapshot-Verzeichnis liegt NICHT im Repo: es hält zwei Bauzustände
 * derselben Seite auseinander und ist nach dem Vergleich wertlos. Vorgabe
 * überschreibbar, weil `/tmp` von parallelen Sitzungen geteilt wird.
 */
const SNAPSHOT_DIR = process.env.BADGE_SNAPSHOT_DIR || join(tmpdir(), 'badge-diff-snapshots');

/**
 * Der Server wird NICHT von dieser Config gestartet — der Vergleich braucht zwei
 * Bauzustaende, die der Aufrufer nacheinander serviert. Nur die Adresse kommt von
 * hier, und der Port ist einstellbar: am 09.11.2026 hielt ein Node-Prozess einer
 * fremden Sitzung die fest verdrahtete 4399 und antwortete auf jede Seite mit 404.
 * Der Lauf meldete daraufhin „kein .step-badge" — richtig gemessen, falsche Seite.
 * Dieselbe Falle steht in playwright.config.ts beschrieben.
 */
const PORT = Number(process.env.BADGE_PORT ?? 4399);

export default defineConfig({
  testDir: './badge-diff',
  snapshotDir: SNAPSHOT_DIR,
  snapshotPathTemplate: '{snapshotDir}/{arg}{ext}',
  fullyParallel: false,
  // Ein Worker, eine Seite: der Lauf scrollt die Badges der Reihe nach ins Bild
  // und zählt am Ende, wie viele er verglichen hat.
  workers: 1,
  retries: 0,
  timeout: 60_000,
  reporter: 'list',
  use: {
    baseURL: process.env.BADGE_BASE_URL || `http://127.0.0.1:${PORT}`,
    locale: 'de-DE',
    timezoneId: 'Europe/Berlin',
    reducedMotion: 'reduce',
    colorScheme: 'light',
    deviceScaleFactor: 2,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], deviceScaleFactor: 2 } }],
});
