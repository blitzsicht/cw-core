// Element-Screenshots der ProcessSteps-Badges je Seite und Breite, als PNG-Dateien.
// Herkunft: ops#1051 Befund 7, 04.11.2026 (Gate-Worktree v0.189.0).
//
// Nicht der Vergleich, sondern das Material dafür: der Vergleich steht in
// badge-diff/badge.spec.ts. Dieses Skript legt die Bilder zum Ansehen ab.
//
// Instant-Scroll statt smooth (die Seiten haben scroll-behavior: smooth), zwei rAF,
// dann zwei Shots, die byteidentisch sein müssen (sonst Wiederholung): so landet kein
// Zwischenzustand in einer Datei.
//
//   BADGE_SEITEN="/,/websites/" node badge-shots.mjs http://127.0.0.1:4399 /tmp/shots
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { badgeSeiten } from './badge-seiten.mjs';

const [base, outDir] = process.argv.slice(2);
if (!base || !outDir) {
  console.error('usage: BADGE_SEITEN="/,/…/" node badge-shots.mjs <baseUrl> <outDir>');
  process.exit(2);
}
mkdirSync(outDir, { recursive: true });

const SEITEN = badgeSeiten(['/'], 'der Vorgabe');
const BREITEN = (process.env.BADGE_BREITEN ?? '390,1400').split(',').map((b) => Number(b.trim()));
const SELEKTOR = process.env.BADGE_SELEKTOR ?? '.step-badge';
const slug = (s) => (s === '/' ? 'start' : s.replace(/^\/+|\/+$/g, '').replace(/\//g, '-'));

const browser = await chromium.launch();
let instabil = 0;
let gesamt = 0;
for (const seite of SEITEN) {
  for (const breite of BREITEN) {
    const ctx = await browser.newContext({ viewport: { width: breite, height: 900 }, deviceScaleFactor: 2, reducedMotion: 'reduce', colorScheme: 'light' });
    const page = await ctx.newPage();
    // 'load', nicht 'networkidle' — siehe badge-diff/badge.spec.ts: auf /websites/
    // von blitzsicht.com kam der Verkehr in 30 s nicht zur Ruhe und der Lauf starb.
    const resp = await page.goto(base + seite, { waitUntil: 'load' });
    if (!resp || resp.status() !== 200) {
      console.error(`HTTP ${resp && resp.status()} für ${base + seite}`);
      process.exit(1);
    }
    const badges = page.locator(SELEKTOR);
    const anzahl = await badges.count();
    if (anzahl === 0) {
      console.log(`${seite}@${breite}: kein ${SELEKTOR} — übersprungen`);
      await ctx.close();
      continue;
    }
    await badges.first().waitFor({ state: 'visible' });
    for (let i = 0; i < anzahl; i++) {
      const b = badges.nth(i);
      await b.evaluate((el) => el.scrollIntoView({ behavior: 'instant', block: 'center' }));
      const name = `${slug(seite)}-${breite}-${i}.png`;
      let letzte = null, versuche = 0, buf;
      for (;;) {
        await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
        buf = await b.screenshot({ animations: 'disabled', scale: 'device' });
        versuche += 1;
        if (letzte && buf.equals(letzte)) break;
        if (versuche >= 8) {
          console.error(`${name}: nach 8 Versuchen nicht stabil`);
          process.exit(1);
        }
        letzte = buf;
      }
      if (versuche > 2) instabil += 1;
      writeFileSync(join(outDir, name), buf);
      gesamt += 1;
      console.log(`${name} ${buf.length} B · Versuche ${versuche}`);
    }
    await ctx.close();
  }
}
await browser.close();

// Ein Lauf ohne einen einzigen Shot ist kein Erfolg: dann stimmt BADGE_SEITEN nicht
// oder der Kunde hat keine ProcessSteps. Die Vorfassung meldete hier fest „16 Shots"
// — eine Zahl, die aus dem Quelltext kam und nicht aus dem Lauf.
if (gesamt === 0) {
  console.error(`ABBRUCH: 0 Shots — kein ${SELEKTOR} auf ${SEITEN.length} Seite(n) (${SEITEN.join(', ')}).`);
  process.exit(1);
}
console.log(`fertig: ${gesamt} Shots über ${SEITEN.length} Seite(n) × ${BREITEN.length} Breite(n), davon ${instabil} erst nach Wiederholung stabil`);
