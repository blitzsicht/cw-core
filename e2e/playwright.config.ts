import { defineConfig, devices } from '@playwright/test';

/**
 * E2E-Tests gegen den statischen Build von `examples/` (blitzsicht-ops#900).
 *
 * Getrennt von `checks/`, weil `checks/` über site-checks.yml in jedem Kundenrepo
 * läuft; diese Tests prüfen cw-core selbst und brauchen examples/dist.
 *
 * Vorher bauen: `pnpm examples:build` in der cw-core-Wurzel. Fehlt dist, bricht
 * `serve` mit 404 auf jeder Seite ab, und jeder Test scheitert laut, nicht still.
 */
const PORT = Number(process.env.PORT ?? 4322);

export default defineConfig({
  testDir: '.',
  timeout: 30_000,
  // Kein Retry: ein Formular, das nur beim zweiten Versuch abschickt, ist ein Befund.
  retries: 0,
  workers: 1,
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `pnpm exec serve ../examples/dist -l ${PORT} --no-clipboard`,
    url: `http://localhost:${PORT}/kontakt/`,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
