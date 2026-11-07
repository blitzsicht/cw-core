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
import { dirname, join } from 'node:path';
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
async function lauf({ body = BEIDES, optionen = {}, weitere = {} } = {}) {
  const r = await renderer();
  const { default: aiDiscovery } = await r.laden('src/integrations/ai-discovery/index.ts');

  const projekt = mkdtempSync(join(tmpdir(), 'cw-verbotsliste-verdrahtung-'));
  tempDirs.push(projekt);
  const dist = join(projekt, 'dist');
  mkdirSync(dist, { recursive: true });
  writeFileSync(join(dist, 'index.html'), seite(body));
  // Weitere Seiten, Schlüssel = Pfad relativ zu dist (#238-Nachlese B4).
  for (const [rel, inhalt] of Object.entries(weitere)) {
    mkdirSync(dirname(join(dist, rel)), { recursive: true });
    writeFileSync(join(dist, rel), seite(inhalt));
  }

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

// ── cw-core#236: `erlaubteFormulierungen`. Die Logik-Proben (umschließen statt überlappen,
//    Ladeprüfung, Orte) stehen im Modul-Test. HIER steht, was nur am Hook zu sehen ist:
//    welche Stufe die Meldung bekommt, ob `strictVerbotsliste` noch abbricht, ob eine
//    ungenutzte Ausnahme auffällt und was mit dem veralteten `verbotslisteAusnahmen` passiert.

/** Beide Richtungen im selben Dokument: einmal verneint, einmal als Versprechen. */
const BEIDE_RICHTUNGEN =
  '<p>Ohne korrekte Inhalte keine Anfragen bringt die schönste Seite nichts.</p>' +
  '<p>Wir bauen eine Website, die Anfragen bringt.</p>';

test('#236 die Ausnahme hebt genau eine der zwei Warnungen auf', async () => {
  const e = await lauf({
    body: BEIDE_RICHTUNGEN,
    optionen: {
      verboteneFormulierungen: ['Anfragen bringt'],
      erlaubteFormulierungen: ['keine Anfragen bringt'],
    },
  });
  const treffer = e.warnungen.filter((w) => w.includes('[verbotsliste_treffer]'));
  assert.equal(treffer.length, 1, `genau das Versprechen bleibt: ${e.warnungen.join(' | ')}`);
  assert.ok(treffer[0].includes('Wir bauen eine Website'), treffer[0]);
  assert.ok(
    e.infos.some((i) => i.includes('Ausnahme „keine Anfragen bringt" greift auf index.html')),
    `was die Ausnahme zudeckt, muss im Log stehen: ${e.infos.join(' | ')}`,
  );
});

test('#236 GEGENPROBE: ohne die Ausnahme sind es zwei Warnungen', async () => {
  const e = await lauf({
    body: BEIDE_RICHTUNGEN,
    optionen: { verboteneFormulierungen: ['Anfragen bringt'] },
  });
  assert.equal(e.warnungen.filter((w) => w.includes('[verbotsliste_treffer]')).length, 2, e.warnungen.join(' | '));
  assert.ok(e.infos.every((i) => !i.includes('Ausnahme')), 'und keine Ausnahme-Zeile');
});

test('#236 strict bricht beim verbleibenden Treffer ab, beim aufgehobenen nicht', async () => {
  const beide = await lauf({
    body: BEIDE_RICHTUNGEN,
    optionen: {
      strictVerbotsliste: true,
      verboteneFormulierungen: ['Anfragen bringt'],
      erlaubteFormulierungen: ['keine Anfragen bringt'],
    },
  });
  assert.match(beide.fehler ?? '', /1 Fundstelle\(n\)/, 'der aufgehobene Treffer zählt nicht mit');

  const nurVerneint = await lauf({
    body: '<p>Ohne korrekte Inhalte keine Anfragen bringt die schönste Seite nichts.</p>',
    optionen: {
      strictVerbotsliste: true,
      verboteneFormulierungen: ['Anfragen bringt'],
      erlaubteFormulierungen: ['keine Anfragen bringt'],
    },
  });
  assert.equal(nurVerneint.fehler, null, 'ein aufgehobener Treffer allein bricht nicht ab');
});

test('#236 eine Ausnahme, die nie greift, erscheint als Warnung mit Wortlaut', async () => {
  const e = await lauf({
    body: SAUBER,
    optionen: {
      verboteneFormulierungen: ['Anfragen bringt'],
      erlaubteFormulierungen: ['keine Anfragen bringt'],
    },
  });
  const altlast = e.warnungen.find((w) => w.includes('hat auf keiner'));
  assert.ok(altlast, `Altlast-Warnung fehlt: ${e.warnungen.join(' | ')}`);
  assert.ok(altlast.includes('„keine Anfragen bringt"'), 'mit Wortlaut');
  assert.match(altlast, /1 geprüften Seite\(n\)/, 'und mit der Zahl der geprüften Seiten');
});

test('#236 Ladeprüfung am Hook: eine Phrase ohne verbotenes Muster wird gemeldet', async () => {
  const e = await lauf({
    body: SAUBER,
    optionen: { erlaubteFormulierungen: ['Wir bauen Websites für Handwerksbetriebe'] },
  });
  assert.ok(
    e.warnungen.some((w) => w.includes('kann deshalb keinen Treffer aufheben')),
    e.warnungen.join(' | '),
  );
  // GEGENPROBE: eine Phrase, die ein Flottenprädikat enthält, löst diese Meldung nicht aus.
  const gut = await lauf({ body: SAUBER, optionen: { erlaubteFormulierungen: ['an rechtssicherer Beweisführung'] } });
  assert.ok(gut.warnungen.every((w) => !w.includes('kann deshalb keinen Treffer aufheben')), gut.warnungen.join(' | '));
});

test('#236 `verbotslisteAusnahmen` warnt als veraltet und wirkt weiter', async () => {
  const e = await lauf({ optionen: { verbotslisteAusnahmen: ['index.html'] } });
  assert.ok(
    e.warnungen.some((w) => w.includes('`verbotslisteAusnahmen` ist veraltet')),
    `Verfallswarnung fehlt — ein stillschweigend ignorierter Schlüssel wäre der nächste stumme Schalter: ${e.warnungen.join(' | ')}`,
  );
  // WIRKT WEITER: der Body trägt „rechtssicher" und „100 Punkte", trotzdem ist keine Seite
  // geprüft. Hätte die Deprecation den Schlüssel abgeschaltet, stünde hier ein Treffer.
  assert.ok(e.infos.some((i) => i.includes('keine Seite geprüft')), e.infos.join(' | '));
  assert.ok(e.warnungen.every((w) => !w.includes('[verbotsliste_treffer]')), e.warnungen.join(' | '));
  // GEGENPROBE: ohne den Schlüssel keine Verfallswarnung.
  const ohne = await lauf({});
  assert.ok(ohne.warnungen.every((w) => !w.includes('veraltet')), ohne.warnungen.join(' | '));
});

test('#236 eine falsch getippte Ausnahmeliste wird gemeldet, nicht geworfen', async () => {
  const e = await lauf({
    body: BEIDE_RICHTUNGEN,
    optionen: { verboteneFormulierungen: ['Anfragen bringt'], erlaubteFormulierungen: 'keine Anfragen bringt' },
  });
  assert.equal(e.fehler, null, 'ein Kunden-astro.config ist ungetyptes JS — der Guard darf nicht sterben');
  assert.ok(
    e.warnungen.some((w) => w.includes('`erlaubteFormulierungen` muss eine Liste von Strings sein')),
    e.warnungen.join(' | '),
  );
  assert.equal(
    e.warnungen.filter((w) => w.includes('[verbotsliste_treffer]')).length,
    2,
    'und es wird kein Treffer aufgehoben',
  );
  // Die Angabe wird IGNORIERT, nicht irgendwie verwertet. Ein String ist in JS iterierbar:
  // ohne die Typprüfung liefe `normalisierteListe` zeichenweise darüber und die Ladeprüfung
  // meldete jeden Buchstaben als wirkungslose Phrase. GEMESSEN: diese eine Zeile ist der
  // Unterschied — ohne sie blieb die Probe grün, obwohl die Typprüfung ausgebaut war.
  assert.ok(
    e.warnungen.every((w) => !w.includes('kann deshalb keinen Treffer aufheben')),
    `der String darf nicht zeichenweise als Phrasenliste gelesen werden: ${e.warnungen.join(' | ')}`,
  );
});

// ── Nachlese Review cw-core#238 (07.11.2026) ────────────────────────────────────────────

const RECHTSGRUNDLAGE = '<p>Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse an rechtssicherer Beweisführung).</p>';

test('#238-Nachlese B4: steht die Phrase nur auf einer pfad-ausgenommenen Seite, sagt die Warnung das', async () => {
  // Der Umstiegsweg aus dem CHANGELOG: erst `erlaubteFormulierungen` eintragen, dann die
  // Pfad-Ausnahme streichen. Im Zwischenstand stimmen Satz und Wortlaut — die Diagnose
  // „Satz ist weg oder der Wortlaut stimmt nicht" war falsch und lud zum Streichen ein.
  const e = await lauf({
    body: SAUBER,
    weitere: { 'datenschutz/index.html': RECHTSGRUNDLAGE },
    optionen: {
      verbotslisteAusnahmen: ['datenschutz/index.html'],
      erlaubteFormulierungen: ['an rechtssicherer Beweisführung'],
    },
  });
  const w = e.warnungen.filter((x) => x.includes('„an rechtssicherer Beweisführung"'));
  assert.equal(w.length, 1, w.join(' | '));
  assert.ok(w[0].includes('datenschutz/index.html') && w[0].includes('verbotslisteAusnahmen'), w[0]);
  assert.ok(!w[0].includes('Satz ist weg'), `falsche Diagnose: ${w[0]}`);
  // GEGENPROBE: ohne Pfad-Ausnahme greift die Phrase, keine Warnung zu ihr.
  const g = await lauf({
    body: SAUBER,
    weitere: { 'datenschutz/index.html': RECHTSGRUNDLAGE },
    optionen: { erlaubteFormulierungen: ['an rechtssicherer Beweisführung'] },
  });
  assert.equal(g.warnungen.filter((x) => x.includes('„an rechtssicherer Beweisführung"')).length, 0, g.warnungen.join(' | '));
});

test('#238-Nachlese B5: eine Phrase ohne Muster wird einmal gemeldet, nicht zweimal mit zwei Ratschlägen', async () => {
  const e = await lauf({ body: SAUBER, optionen: { erlaubteFormulierungen: ['Wir bauen Websites'] } });
  const w = e.warnungen.filter((x) => x.includes('„Wir bauen Websites"'));
  assert.equal(w.length, 1, w.join(' | '));
  assert.ok(w[0].includes('kann deshalb keinen Treffer aufheben'), 'es bleibt die Meldung der Ladeprüfung');
});

test('#238-Nachlese B6: eine falsch getippte Pfad-Ausnahme löst keine Verfallswarnung aus', async () => {
  const e = await lauf({ optionen: { verbotslisteAusnahmen: 'datenschutz/' } });
  assert.ok(e.warnungen.some((w) => w.includes('`verbotslisteAusnahmen` muss eine Liste von Strings sein')), e.warnungen.join(' | '));
  assert.ok(e.warnungen.every((w) => !w.includes('ist veraltet')), `zwei Meldungen, die sich widersprechen: ${e.warnungen.join(' | ')}`);
});

// ── Nachlese Review cw-core#242 (07.11.2026) ────────────────────────────────────────────

test('#242-Nachlese B2: zwei nötige Phrasen an derselben Stelle — keine heißt „ungenutzt"', async () => {
  // Vorher trug der Befund nur eine; die andere bekam „Satz ist weg … streichen". Wer dem Rat
  // folgte, hatte danach einen offenen Treffer (Gegenprobe im Modultest).
  const e = await lauf({
    body: '<p>Das sind nicht rechtssichere Texte.</p>',
    optionen: {
      verboteneFormulierungen: ['rechtssichere Texte'],
      erlaubteFormulierungen: ['nicht rechtssicher', 'nicht rechtssichere Texte'],
    },
  });
  assert.equal(e.warnungen.filter((w) => w.includes('hat auf keiner')).length, 0, e.warnungen.join(' | '));
  assert.equal(e.warnungen.filter((w) => w.includes('[verbotsliste_treffer]')).length, 0, 'und nichts bleibt offen');
});

test('#242-Nachlese B4/B5/B8: der Umstiegsrat nennt offene Treffer, kürzt die Liste und kommt auch ohne geprüfte Seite', async () => {
  const weitere = {
    'datenschutz/index.html': `${RECHTSGRUNDLAGE}<p>Wir erreichen 100 Punkte.</p>`,
    'a/index.html': RECHTSGRUNDLAGE,
    'b/index.html': RECHTSGRUNDLAGE,
    'c/index.html': RECHTSGRUNDLAGE,
  };
  // ALLE Seiten ausgenommen, auch index.html: 0 geprüfte Seiten (B8).
  const e = await lauf({
    body: SAUBER,
    weitere,
    optionen: {
      verbotslisteAusnahmen: ['index.html', 'datenschutz/index.html', 'a/index.html', 'b/index.html', 'c/index.html'],
      erlaubteFormulierungen: ['an rechtssicherer Beweisführung'],
      verboteneFormulierungen: ['100 Punkte'],
    },
  });
  const w = e.warnungen.filter((x) => x.includes('„an rechtssicherer Beweisführung"'));
  assert.equal(w.length, 1, `B8 — Rat fehlt bei 0 geprüften Seiten: ${e.warnungen.join(' | ')}`);
  assert.ok(w[0].includes('+ 1 weitere'), `B5 — Liste ungekürzt: ${w[0]}`);
  assert.ok(w[0].includes('1 offene Fundstelle(n) aus der Kundenliste'), `B4 — offener Treffer nicht genannt: ${w[0]}`);
  // GEGENPROBE B4: ohne den offenen Satz kein „Vorsicht".
  const g = await lauf({
    body: SAUBER,
    weitere: { 'datenschutz/index.html': RECHTSGRUNDLAGE },
    optionen: { verbotslisteAusnahmen: ['datenschutz/index.html'], erlaubteFormulierungen: ['an rechtssicherer Beweisführung'] },
  });
  const gw = g.warnungen.filter((x) => x.includes('„an rechtssicherer Beweisführung"'));
  assert.equal(gw.length, 1, gw.join(' | '));
  assert.ok(!gw[0].includes('Vorsicht'), gw[0]);
});

// ── Nachlese Review cw-core#248 (07.11.2026) ────────────────────────────────────────────

/** Der Umstiegsrat zur Phrase „an rechtssicherer Beweisführung“. */
const rat = (/** @type {{warnungen: string[]}} */ e) =>
  e.warnungen.filter((x) => x.includes('„an rechtssicherer Beweisführung"') && x.includes('greift nur auf'));

test('#248-Nachlese B1: der Rat zählt offene Treffer auf ALLEN Seiten des Ausnahme-Eintrags', async () => {
  const optionen = {
    verbotslisteAusnahmen: ['rechtliches/'],
    erlaubteFormulierungen: ['an rechtssicherer Beweisführung'],
    verboteneFormulierungen: ['100 Punkte'],
    strictVerbotsliste: true,
  };
  const e = await lauf({
    body: SAUBER,
    weitere: { 'rechtliches/a/index.html': RECHTSGRUNDLAGE, 'rechtliches/b/index.html': '<p>Wir erreichen 100 Punkte.</p>' },
    optionen,
  });
  const w = rat(e);
  assert.equal(w.length, 1, e.warnungen.join(' | '));
  assert.ok(w[0].includes('1 offene Fundstelle(n)'), `Treffer auf der Nachbarseite fehlt: ${w[0]}`);
  assert.ok(w[0].includes('Build ab'), `strict nicht genannt: ${w[0]}`);
  assert.ok(w[0].includes('„rechtliches/"'), `Eintrag nicht genannt: ${w[0]}`);
  // GEGENPROBE: Nachbarseite unter einem ANDEREN Eintrag zählt nicht.
  const g = await lauf({
    body: SAUBER,
    weitere: { 'rechtliches/a/index.html': RECHTSGRUNDLAGE, 'anders/index.html': '<p>Wir erreichen 100 Punkte.</p>' },
    optionen: { ...optionen, verbotslisteAusnahmen: ['rechtliches/', 'anders/'] },
  });
  assert.ok(!rat(g)[0].includes('Vorsicht'), rat(g)[0]);
});

test('#248-Nachlese B2: ein Flottentreffer ist kein „WARN danach“', async () => {
  const e = await lauf({
    body: SAUBER,
    weitere: { 'datenschutz/index.html': `${RECHTSGRUNDLAGE}<p>Alles abmahnsicher.</p>` },
    optionen: {
      verbotslisteAusnahmen: ['datenschutz/'],
      erlaubteFormulierungen: ['an rechtssicherer Beweisführung'],
      verboteneFormulierungen: ['100 Punkte'],
      strictVerbotsliste: true,
    },
  });
  assert.equal(rat(e).length, 1, e.warnungen.join(' | '));
  assert.ok(!rat(e)[0].includes('Vorsicht'), rat(e)[0]);
});

test('#248-Nachlese B3: derselbe Satz auf fünf Seiten ist eine Fundstelle', async () => {
  const weitere = { 'r/a/index.html': RECHTSGRUNDLAGE };
  for (const s of ['b', 'c', 'd', 'e', 'f']) weitere[`r/${s}/index.html`] = '<p>Wir erreichen 100 Punkte.</p>';
  const e = await lauf({
    body: SAUBER,
    weitere,
    optionen: { verbotslisteAusnahmen: ['r/'], erlaubteFormulierungen: ['an rechtssicherer Beweisführung'], verboteneFormulierungen: ['100 Punkte'] },
  });
  assert.ok(rat(e)[0].includes('1 offene Fundstelle(n)'), rat(e)[0]);
});
