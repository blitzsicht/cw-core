// @ts-check
/**
 * Verdrahtung des Verbotslisten-Guards im echten `astro:build:done`-Hook.
 *
 * Lauf: `node --test tests/ai-discovery/verbotsliste-verdrahtung.test.js`
 *
 * Die Logik-Proben (Entities, Trennstellen, Meta-Formen, Positionen) stehen in
 * `src/integrations/ai-discovery/verbotsliste-check.test.mjs`. HIER steht nur, was man
 * ausschließlich am Hook sehen kann — und das sind genau die vier Befunde aus cw-core#230,
 * die nicht im Modul liegen:
 *
 *   Befund 3  Die Kundenliste ERGÄNZT den Flottendefault, sie ersetzt ihn nicht mehr.
 *             Vorher (`eigene ?? GARANTIE_PRAEDIKATE`) schaltete jede eigene Liste die
 *             drei Prädikate still ab — die Regression, gegen die der Guard gebaut wurde.
 *   Befund 6  Der Hinweistext richtet sich nach der Liste, aus der der Treffer kommt.
 *             „Garantie-Prädikat" passt zu `rechtssicher`, nicht zu `100 Punkte`.
 *   Befund 7  Die ✓-Zeile nennt die Zahl, die wirklich geprüft wird (entdoppelt).
 *   strict    `strictVerbotsliste` eskaliert die KUNDENLISTE. Auf den Flottendefault
 *             angewandt bräche es jede Seite ab, die den Schalter ohne eigene Liste setzt.
 *
 * GEGENPROBE, gemessen in einem zweiten Worktree auf `origin/release/cw-core` (`b8f04a8e`)
 * mit genau dieser Datei: **7 von 9 rot.** Grün blieben zwei, und nur eine davon aus dem
 * erwarteten Grund:
 *
 *   `checkVerbotsliste: false` — berührt die Änderung nicht, soll grün bleiben.
 *   „steht ein Prädikat in BEIDEN Listen" — grün, aber aus dem GEGENTEILIGEN Grund: am
 *     alten Stand ersetzte die Kundenliste den Default, also war `rechtssicher` ohnehin nur
 *     Kundeneintrag und damit WARN. Dieselbe Beobachtung bei beiderlei Semantik. Die Probe
 *     belegt den Fix deshalb NICHT — sie hält die Reihenfolge-Entscheidung fest (Kundenliste
 *     zuerst in `normalisierteListe`), damit ein künftiger Umbau sie nicht still umdreht.
 *     Ohne diesen Satz hier würde man sie als Beleg lesen; sie ist ein Regressionsnetz.
 */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { renderer, schliessen } from '../blocks/_render-astro.js';

/** @type {string[]} */
const tempDirs = [];
const start = process.cwd();
after(async () => {
  process.chdir(start);
  for (const d of tempDirs) rmSync(d, { recursive: true, force: true });
  await schliessen();
});

/** @param {string} body */
const seite = (body) =>
  '<!DOCTYPE html><html lang="de"><head><meta charset="utf-8"><title>Test</title>' +
  '<meta name="description" content="Eine Seite zum Prüfen."></head>' +
  `<body><main>${body}</main><footer><a href="tel:+49941123">0941 123</a></footer></body></html>`;

/** Trägt BEIDES: ein Flottenprädikat und einen typischen Kundeneintrag. */
const BEIDES = '<p>Wir bauen rechtssicher und erreichen 100 Punkte.</p>';
const SAUBER = '<p>Wir bauen Websites für Handwerksbetriebe in Regensburg.</p>';

const SITE_DATA = {
  name: 'Test',
  url: 'https://t.de',
  description: 'Test',
  tagline: 'T',
  leistungen: [],
  faqs: [],
  legal: { owner: 'Max Test', form: 'Einzelunternehmen', street: 'Str. 1', zip: '93047', city: 'Regensburg', country: 'DE', email: 'a@t.de', phone: '+49941123' },
  contact: { email: 'a@t.de', phone: '+49941123' },
  seo: { knowsAbout: [] },
  nav: { main: [] },
};

/**
 * @param {{ body?: string, optionen?: Record<string, unknown> }} fall
 * @returns {Promise<{ warnungen: string[], infos: string[], fehler: string | null }>}
 */
async function lauf({ body = BEIDES, optionen = {} } = {}) {
  const r = await renderer();
  const { default: aiDiscovery } = await r.laden('src/integrations/ai-discovery/index.ts');

  const projekt = mkdtempSync(join(tmpdir(), 'cw-verbotsliste-verdrahtung-'));
  tempDirs.push(projekt);
  const dist = join(projekt, 'dist');
  mkdirSync(dist, { recursive: true });
  writeFileSync(join(dist, 'index.html'), seite(body));

  /** @type {string[]} */
  const warnungen = [];
  /** @type {string[]} */
  const infos = [];
  /** @type {any} */
  const logger = {
    debug() {},
    info: (/** @type {unknown} */ m) => infos.push(String(m)),
    warn: (/** @type {unknown} */ m) => warnungen.push(String(m)),
    error: (/** @type {unknown} */ m) => warnungen.push(String(m)),
  };
  logger.fork = () => logger;

  const integ = aiDiscovery({ siteData: async () => SITE_DATA, ...optionen });
  let fehler = null;
  process.chdir(projekt);
  try {
    await integ.hooks['astro:build:done']({ dir: pathToFileURL(`${dist}/`), logger, pages: [], routes: [] });
  } catch (e) {
    fehler = /** @type {Error} */ (e).message;
  } finally {
    process.chdir(start);
  }
  const nur = (/** @type {string[]} */ xs) =>
    xs.filter((x) => x.startsWith('Verbotslisten-Guard:') || x.includes('[verbotsliste_treffer]') || x.includes('Garantie-Prädikat') || x.includes('Verbotsliste dieses Kunden') || x.includes('auf die Verbotsliste gesetzt'));
  return { warnungen: nur(warnungen), infos: nur(infos), fehler };
}

test('Befund 3: eine eigene Liste schaltet die Flottenprädikate nicht mehr ab', async () => {
  const e = await lauf({ optionen: { verboteneFormulierungen: ['100 Punkte'] } });
  // Der Kundeneintrag ist WARN …
  assert.equal(e.warnungen.filter((w) => w.includes('[verbotsliste_treffer]')).length, 1, e.warnungen.join(' | '));
  assert.ok(e.warnungen.some((w) => w.includes('100 Punkte')), 'Kundeneintrag als Warnung');
  // … und „rechtssicher" wird trotzdem gesehen, als Hinweis. Genau das fiel vorher aus.
  assert.ok(e.infos.some((i) => i.includes('rechtssicher')), `Flottenprädikat fehlt: ${e.infos.join(' | ')}`);
  // Geprüft wird die FORMULIERUNGSANGABE (`← „…"`), nicht der ganze Satz: der Kontext um
  // „100 Punkte" zitiert denselben Satz und enthält deshalb auch das Wort „rechtssicher".
  assert.ok(
    e.warnungen.every((w) => !w.includes('← „rechtssicher"')),
    `das Flottenprädikat darf keine Warnung sein, sonst blockt es den Rollout (cw-core#196): ${e.warnungen.join(' | ')}`,
  );
  assert.ok(e.infos.some((i) => i.includes('← „rechtssicher"')), 'und es muss als Hinweis dastehen');
});

test('Befund 3: steht ein Prädikat in BEIDEN Listen, gilt die Kundenfassung — also WARN', async () => {
  const e = await lauf({ optionen: { verboteneFormulierungen: ['rechtssicher'] } });
  assert.ok(e.warnungen.some((w) => w.includes('rechtssicher')), e.warnungen.join(' | '));
  assert.ok(
    e.infos.every((i) => !i.includes('← „rechtssicher"')),
    `nicht zusätzlich als Hinweis — sonst stünde derselbe Satz zweimal im Protokoll: ${e.infos.join(' | ')}`,
  );
});

test('Befund 6: der Hinweis zum Kundeneintrag nennt kein „Garantie-Prädikat“', async () => {
  const e = await lauf({ optionen: { verboteneFormulierungen: ['100 Punkte'] } });
  const kundenHinweis = e.warnungen.find((w) => w.includes('auf die Verbotsliste gesetzt'));
  assert.ok(kundenHinweis, `Kundenhinweis fehlt: ${e.warnungen.join(' | ')}`);
  assert.ok(
    e.warnungen.every((w) => !w.includes('Garantie-Prädikat')),
    '„Garantie-Prädikat" passt zu rechtssicher, nicht zu 100 Punkte',
  );
  // GEGENPROBE: beim Flottentreffer steht der Satz weiter da, er ist nicht verschwunden.
  assert.ok(e.infos.some((i) => i.includes('Garantie-Prädikat')), e.infos.join(' | '));
});

test('Befund 7: die ✓-Zeile nennt die entdoppelte Zahl und woher die Liste kommt', async () => {
  const e = await lauf({ body: SAUBER, optionen: { verboteneFormulierungen: ['rechtssicher', 'Rechtssicher'] } });
  const ok = e.infos.find((i) => i.includes('✓'));
  assert.ok(ok, e.infos.join(' | '));
  // 'rechtssicher' + 'Rechtssicher' sind EIN Eintrag; dazu abmahnsicher und anwaltlich
  // geprüft aus dem Flottendefault = 3. Vorher stand hier „2 Formulierung(en)".
  assert.match(ok, /3 Formulierung\(en\) \(Kundenliste \+ Flottendefault\)/);
});

test('ohne eigene Liste: ✓-Zeile nennt den Flottendefault und seine drei Einträge', async () => {
  const e = await lauf({ body: SAUBER });
  const ok = e.infos.find((i) => i.includes('✓'));
  assert.ok(ok, e.infos.join(' | '));
  assert.match(ok, /3 Formulierung\(en\) \(Flottendefault\)/);
});

test('strict: ein Flottentreffer allein bricht den Build NICHT ab', async () => {
  const e = await lauf({ optionen: { strictVerbotsliste: true } });
  assert.equal(e.fehler, null, 'strict ist die Eskalation einer Kundenliste, nicht des Defaults');
  assert.ok(e.infos.some((i) => i.includes('rechtssicher')), 'gemeldet wird er trotzdem');
});

test('strict: ein Treffer auf die Kundenliste bricht den Build ab', async () => {
  const e = await lauf({ optionen: { strictVerbotsliste: true, verboteneFormulierungen: ['100 Punkte'] } });
  assert.match(e.fehler ?? '', /strictVerbotsliste=true/);
  assert.match(e.fehler ?? '', /Kundenliste/);
});

test('checkVerbotsliste: false schaltet den Guard ab — auch die Hinweise', async () => {
  const e = await lauf({ optionen: { checkVerbotsliste: false } });
  assert.deepEqual(e.warnungen, []);
  assert.deepEqual(e.infos, []);
});

test('eine leere Kundenliste schaltet den Guard nicht mehr ab — der Flottendefault läuft', async () => {
  // Vorher: `eigene ?? GARANTIE_PRAEDIKATE` ergab bei `[]` die leere Liste, `anzahl` 0 und
  // damit „nicht konfiguriert (0 Einträge)" — der Guard sah die Seite nie an. Mit der
  // Vereinigung bleibt der Default stehen. Und die ✓-Zeile darf keine Kundenliste behaupten,
  // die es nicht gibt.
  const e = await lauf({ optionen: { verboteneFormulierungen: [] } });
  assert.ok(e.infos.some((i) => i.includes('← „rechtssicher"')), e.infos.join(' | '));
  assert.equal(e.warnungen.length, 0, 'leere Kundenliste erzeugt keine Warnung');
  const sauber = await lauf({ body: SAUBER, optionen: { verboteneFormulierungen: ['   '] } });
  const ok = sauber.infos.find((i) => i.includes('✓'));
  assert.ok(ok, sauber.infos.join(' | '));
  assert.match(ok, /\(Flottendefault\)/, 'nicht „Kundenliste + Flottendefault" — die Liste ist leer');
});
