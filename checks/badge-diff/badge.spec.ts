/**
 * Pixelvergleich der ProcessSteps-Badges: Baseline-Build gegen PR-Build.
 *
 * Ablauf: erst gegen den Baseline-Server aufnehmen (`--update-snapshots`), dann
 * denselben Lauf gegen den PR-Server. `maxDiffPixels: 0` — es geht um die Frage, ob
 * eine CSS-Änderung die Badges anfasst, nicht um Toleranz.
 *
 * Herkunft: ops#1051 Befund 7, gebaut am 04.11.2026 im Gate-Worktree v0.189.0.
 *
 * Ein Lauf pro Breite statt pro Seite und Breite: die Zahl der Badges steht nicht
 * fest (die Vorfassung verlangte genau vier und brach bei jeder anderen Zahl ab),
 * und am Ende eines Laufs muss jemand prüfen, dass überhaupt etwas verglichen wurde.
 * Ein Test, der über null Badges läuft, ist grün — und belegt nichts
 * (HANDBOOK §2.6, „kann nicht rot werden").
 */
import { test, expect } from '@playwright/test';
import { seitenAusBuild } from '../seiten';
import { badgeSeiten } from '../badge-seiten.mjs';

const SEITEN = badgeSeiten(seitenAusBuild(), 'der Sitemap des Builds');
const BREITEN = (process.env.BADGE_BREITEN ?? '390,1400').split(',').map((b) => Number(b.trim()));
const SELEKTOR = process.env.BADGE_SELEKTOR ?? '.step-badge';

const slug = (s: string) => (s === '/' ? 'start' : s.replace(/^\/+|\/+$/g, '').replace(/\//g, '-'));

for (const breite of BREITEN) {
  test(`badges @${breite}`, async ({ page }) => {
    await page.setViewportSize({ width: breite, height: 900 });
    let gesamt = 0;
    const gefunden: string[] = [];

    for (const seite of SEITEN) {
      // 'load', nicht 'networkidle': auf /websites/ von blitzsicht.com kam der
      // Netzverkehr am 09.11.2026 in 30 s nicht zur Ruhe, und der Lauf starb am
      // Timeout statt am Bildvergleich. Playwright rät von 'networkidle' selbst ab.
      // Der Rest wartet über die Locator-Automatik, nicht über die Uhr.
      const resp = await page.goto(seite, { waitUntil: 'load' });
      expect(resp?.status(), `HTTP-Status von ${seite}`).toBe(200);
      const badges = page.locator(SELEKTOR);
      const anzahl = await badges.count();
      if (anzahl === 0) continue;
      await badges.first().waitFor({ state: 'visible' });
      gefunden.push(`${seite} ${anzahl}`);
      for (let i = 0; i < anzahl; i++) {
        await badges.nth(i).scrollIntoViewIfNeeded();
        await expect(badges.nth(i)).toHaveScreenshot(`${slug(seite)}-${breite}-${i}.png`, {
          maxDiffPixels: 0,
          animations: 'disabled',
        });
      }
      gesamt += anzahl;
    }

    console.log(`[badge] @${breite}: ${gesamt} Badges auf ${gefunden.length} von ${SEITEN.length} Seiten (${gefunden.join(' · ') || 'keine'})`);
    expect(
      gesamt,
      `kein Element "${SELEKTOR}" auf ${SEITEN.length} geprüften Seiten — dieser Lauf hat NICHTS verglichen. Entweder stimmt BADGE_SEITEN nicht, oder der Kunde hat keine ProcessSteps.`,
    ).toBeGreaterThan(0);
  });
}
