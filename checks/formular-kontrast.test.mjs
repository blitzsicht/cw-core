// @ts-check
/**
 * Abnahme für formular-kontrast.mjs: reine Rechnung gegen bekannte WCAG-Werte, Browser-Messung
 * an Fixtures (echter Fehlerfall aus customer-blitzsicht `/website-audit`, Stand 2ff4980).
 *
 * Gegenbeweis-Pflicht: die Probe WEISS_AUF_WEISS MUSS melden (1,00:1 auf Text und Placeholder),
 * sonst ist der Messer blind; LESBAR muss leer sein, sonst hat der Fix nichts repariert. Die
 * Browser-Messung wird gegen die exportierte Rechnung gehalten — zwei Wege, ein Ergebnis.
 *
 *   pnpm test:formular        (braucht Chromium: pnpm exec playwright install chromium)
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import {
  leuchtdichte, kontrastVerhaeltnis, ueberblenden, unterSchwelle,
  formularKontrastBefunde, WEISS_AUF_WEISS, LESBAR,
} from './formular-kontrast.mjs';

const WEISS = { r: 255, g: 255, b: 255, a: 1 };
const SCHWARZ = { r: 0, g: 0, b: 0, a: 1 };
const NACHTBLAU = { r: 0x1d, g: 0x1e, b: 0x3b, a: 1 };
const GRAU = { r: 0x4b, g: 0x55, b: 0x63, a: 1 };

describe('reine Rechnung', () => {
  test('Weiß auf Weiß ist 1,00 — der Fehlerfall', () => {
    assert.equal(kontrastVerhaeltnis(WEISS, WEISS).toFixed(2), '1.00');
  });
  test('Schwarz auf Weiß ist 21,00 — der Maximalwert', () => {
    assert.equal(kontrastVerhaeltnis(SCHWARZ, WEISS).toFixed(2), '21.00');
    assert.equal(leuchtdichte(WEISS).toFixed(3), '1.000');
    assert.equal(leuchtdichte(SCHWARZ), 0);
  });
  test('Blitzsicht-Töne auf Weiß: Nachtblau ≥ 14, Grau ≥ 7 (beide AA)', () => {
    assert.ok(kontrastVerhaeltnis(NACHTBLAU, WEISS) > 14);
    assert.ok(kontrastVerhaeltnis(GRAU, WEISS) > 7);
  });
  test('halbtransparentes Weiß auf Weiß bleibt Weiß; halbtransparentes Schwarz wird Mittelgrau', () => {
    assert.deepEqual(ueberblenden({ ...WEISS, a: 0.5 }, WEISS), WEISS);
    const grau = ueberblenden({ ...SCHWARZ, a: 0.5 }, WEISS);
    assert.deepEqual(grau, { r: 128, g: 128, b: 128, a: 1 });
    assert.ok(kontrastVerhaeltnis(grau, WEISS) < 4.5, 'Mittelgrau auf Weiß liegt unter AA');
  });
  test('unterSchwelle: Placeholder zählt, select ohne Placeholder zählt nicht', () => {
    const befunde = [
      { feld: '#a', text: 'x', textKontrast: 15, placeholder: 'y', placeholderKontrast: 1, hintergrund: 'z' },
      { feld: '#b', text: 'x', textKontrast: 15, placeholder: null, placeholderKontrast: null, hintergrund: 'z' },
      { feld: '#c', text: 'x', textKontrast: 4.4, placeholder: null, placeholderKontrast: null, hintergrund: 'z' },
    ];
    assert.deepEqual(unterSchwelle(befunde).map((b) => b.feld), ['#a', '#c']);
    assert.deepEqual(unterSchwelle(befunde, 1), []);
  });
});

describe('Browser-Messung an Fixtures', () => {
  /** @type {import('@playwright/test').Browser} */ let browser;
  /** @type {import('@playwright/test').Page} */ let page;
  before(async () => { browser = await chromium.launch(); page = await browser.newPage(); });
  after(async () => { await browser.close(); });

  test('WEISS_AUF_WEISS meldet beide Felder mit 1,00 auf Text UND Placeholder (Gegenprobe)', async () => {
    await page.setContent(WEISS_AUF_WEISS);
    const befunde = await page.evaluate(formularKontrastBefunde);
    assert.equal(befunde.length, 2, 'hidden und submit dürfen nicht mitzählen');
    for (const b of befunde) {
      assert.equal(b.textKontrast, 1, `${b.feld}: Text`);
      assert.equal(b.placeholderKontrast, 1, `${b.feld}: Placeholder (${b.placeholder})`);
      assert.equal(b.hintergrund, 'rgb(255, 255, 255)');
    }
    assert.equal(unterSchwelle(befunde).length, 2);
    // Placeholder kommt in Chromium als oklab(…) — ein rgb-Parser hätte hier nichts gemessen.
    assert.match(befunde[0].placeholder ?? '', /oklab|rgb/);
  });

  test('LESBAR meldet nichts; Browser-Zahl deckt sich mit der reinen Rechnung', async () => {
    await page.setContent(LESBAR);
    const befunde = await page.evaluate(formularKontrastBefunde);
    assert.equal(befunde.length, 2);
    assert.equal(unterSchwelle(befunde).length, 0);
    const erwartetText = Math.round(kontrastVerhaeltnis(NACHTBLAU, WEISS) * 100) / 100;
    const erwartetPh = Math.round(kontrastVerhaeltnis(GRAU, WEISS) * 100) / 100;
    assert.equal(befunde[0].textKontrast, erwartetText);
    assert.equal(befunde[0].placeholderKontrast, erwartetPh);
  });

  test('transparentes Feld auf dunklem Container: Hintergrund kommt aus der Elternkette', async () => {
    await page.setContent(`<div style="background:#1D1E3B;padding:1rem">
      <input id="t" style="background:transparent;color:#fff" placeholder="hell">
      <textarea id="ta" style="background:transparent;color:#1D1E3B"></textarea></div>`);
    const befunde = await page.evaluate(formularKontrastBefunde);
    const t = befunde.find((b) => b.feld === '#t'); const ta = befunde.find((b) => b.feld === '#ta');
    assert.ok(t && t.textKontrast > 14, 'weiß auf Nachtblau ist lesbar');
    assert.equal(t.hintergrund, 'rgb(29, 30, 59)');
    assert.ok(ta && ta.textKontrast === 1, 'Nachtblau auf Nachtblau ist 1,00');
    assert.equal(ta.placeholderKontrast, null, 'ohne placeholder-Attribut kein Placeholder-Wert');
  });

  test('unsichtbare Felder (display:none) werden übersprungen', async () => {
    await page.setContent(`<form style="display:none"><input id="weg" style="color:#fff;background:#fff"></form>
      <input id="da" style="color:#000;background:#fff">`);
    const befunde = await page.evaluate(formularKontrastBefunde);
    assert.deepEqual(befunde.map((b) => b.feld), ['#da']);
  });
});
