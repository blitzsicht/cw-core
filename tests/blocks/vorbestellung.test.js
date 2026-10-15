// @ts-check
/**
 * Vorbestellung + Kuechenliste (Demo-Modus): gerendertes HTML.
 *
 * Lauf: `node --test tests/blocks/vorbestellung.test.js`
 *
 * ANLASS (15.10.2026): customer-brotzeithaeusl, Modell „WhatsApp + Tagesliste“. Die Demo darf
 * nichts senden: kein <form>, keine action, kein fetch auf eine Sendeadresse. Bestellbar ist nur,
 * was einen festen Preis hat; ein „ab“-Preis bricht den Build statt still 0 € zu bestellen.
 */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderer, schliessen, normalize } from './_render-astro.js';

after(schliessen);

const VB = 'src/components/blocks/Vorbestellung.astro';
const KL = 'src/components/blocks/Kuechenliste.astro';
const GRUPPEN = [
  {
    id: 'thaikarte',
    title: 'Thaikarte',
    categories: [
      { title: 'Suppen', items: [
        { name: 'Nudelsuppe mit Hähnchenfleisch', note: 'Kennzeichnung: a', prices: [{ amount: '11,90 €' }] },
        { name: 'Thai-Suppe mit Hähnchenfleisch', prices: [{ amount: '12,90 €' }] },
      ] },
      { title: 'Beilagen', items: [{ name: 'Portion Reis', prices: [{ amount: '3,20 €' }] }] },
    ],
  },
  { id: 'brotzeit', title: 'Brotzeiten', categories: [{ title: 'Brotzeiten', items: [
    { name: 'Leberkässemmel', prices: [{ amount: '2,80 €' }] },
    { name: 'Imbiss geschlossen', prices: [] },
  ] }] },
];
const BASIS = {
  gruppen: GRUPPEN,
  tagesgerichte: [{ datum: '2026-10-15', name: 'Ente mit Gemüse süß-sauer und Reis', preis: '9,90' }],
  oeffnung: { tage: [1, 2, 3, 4, 5], von: '08:00', bis: '15:00' },
  storageKey: 'test-vorbestellung-demo',
  kuecheHref: '/vorbestellen/kueche',
};

/** @param {string} datei @param {Record<string, unknown>} props */
async function html(datei, props) {
  const r = await renderer();
  return normalize(await r.render(datei, props));
}

test('Vorbestellung: jede Position mit festem Preis wird bestellbar, Posten ohne Preis nicht', async () => {
  const h = await html(VB, BASIS);
  const zeilen = h.match(/data-vb-item/g) ?? [];
  assert.equal(zeilen.length, 4); // 2 Suppen + Reis + Leberkässemmel, nicht „Imbiss geschlossen“
  assert.ok(h.includes('data-cent="1190"'));
  assert.ok(h.includes('data-cent="280"'));
  assert.ok(!h.includes('Imbiss geschlossen'));
  assert.ok(h.includes('Kennzeichnung: a'), 'Kennzeichnung bleibt beim Gericht sichtbar');
});

test('Vorbestellung: Plus/Minus haben sprechende Bezeichnungen (Screenreader)', async () => {
  const h = await html(VB, BASIS);
  assert.ok(h.includes('aria-label="Portion Reis: eins mehr"'));
  assert.ok(h.includes('aria-label="Portion Reis: eins weniger"'));
});

test('Vorbestellung (Demo) sendet nichts: kein <form>, keine action, Demo-Hinweis sichtbar', async () => {
  const h = await html(VB, BASIS);
  assert.ok(!/<form\b/i.test(h), 'kein <form>');
  assert.ok(!/\baction=/i.test(h), 'keine action');
  assert.ok(!h.includes('wa.me/'), 'kein WhatsApp-Link in der Demo');
  assert.ok(h.includes('Demo: Es wurde nichts gesendet.'));
  assert.ok(h.includes('Bestellung absenden (Demo)'));
});

test('Vorbestellung: Tagesgerichte und Öffnung gehen als Konfiguration an das Skript', async () => {
  const h = await html(VB, BASIS);
  const m = h.match(/data-konfig="([^"]+)"/);
  assert.ok(m, 'data-konfig fehlt');
  const k = JSON.parse(m[1].replace(/&#34;|&quot;/g, '"'));
  assert.deepEqual(k.tages, [{ datum: '2026-10-15', name: 'Ente mit Gemüse süß-sauer und Reis', cent: 990 }]);
  assert.deepEqual(k.oeffnung.tage, [1, 2, 3, 4, 5]);
  assert.equal(k.vorlaufMinuten, 20);
});

test('Vorbestellung: „ab“-Preis bricht den Build (Negativtest)', async () => {
  const kaputt = [{ id: 'x', title: 'X', categories: [{ title: 'X', items: [{ name: 'Buffet', prices: [{ amount: 'ab 3,20 €' }] }] }] }];
  await assert.rejects(() => html(VB, { ...BASIS, gruppen: kaputt }), /Preis nicht lesbar/);
});

test('Vorbestellung: ohne storageKey bricht der Build', async () => {
  await assert.rejects(() => html(VB, { ...BASIS, storageKey: '' }), /storageKey/);
});

test('Kuechenliste (Demo): Container mit Schlüssel, Rückweg zur Bestellung, kein Formular', async () => {
  const h = await html(KL, { storageKey: 'test-vorbestellung-demo', bestellHref: '/vorbestellen' });
  assert.ok(h.includes('data-storage-key="test-vorbestellung-demo"'));
  assert.ok(h.includes('href="/vorbestellen"'));
  assert.ok(h.includes('Demo: Die Liste liegt nur in diesem Browser.'));
  assert.ok(!/<form\b/i.test(h));
});

test('Kuechenliste: ohne storageKey bricht der Build', async () => {
  await assert.rejects(() => html(KL, { storageKey: '' }), /storageKey/);
});

test('Vorbestellung: nur die schmale Leiste ist fixiert, das Formular nicht (Handy, v0.173.2)', async () => {
  const h = await html(VB, BASIS);
  assert.ok(/data-vb-leiste[^>]*hidden/.test(h) || /hidden[^>]*data-vb-leiste/.test(h), 'Leiste startet versteckt');
  const anker = h.match(/id="([^"]+-abschluss)"/);
  assert.ok(anker, 'Formular hat einen Anker');
  assert.ok(h.includes(`href="#${anker[1]}"`), 'Weiter springt zum Formular');
  const quelle = readFileSync(resolve(import.meta.dirname, '../../', VB), 'utf8');
  const regel = (sel) => (quelle.match(new RegExp(`\\n  \\${sel} \\{([^}]*)\\}`)) ?? [])[1] ?? '';
  assert.ok(!/sticky/.test(regel('.vb-abschluss')), '.vb-abschluss darf nicht sticky sein');
  assert.ok(/sticky/.test(regel('.vb-leiste')), '.vb-leiste ist sticky');
});
