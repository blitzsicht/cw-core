// @ts-check
/**
 * auto-events: Teilen-Klicks der EmpfehlungSection zählen als `Referral Share`,
 * NICHT als `WhatsApp Click` / `Email Click`.
 *
 * Lauf: `node --test tests/blocks/auto-events-referral-share.test.js`
 *
 * Warum das nötig ist: der zentrale Klick-Listener (auto-events.ts) zählt JEDEN
 * `wa.me`-Link als `WhatsApp Click` und JEDEN `mailto:` als `Email Click` — beides
 * CORE-Goals für Kontaktaufnahme. Ein Teilen-Link (`wa.me/?text=…`, `mailto:?…`) ist
 * keine Kontaktaufnahme mit dem Kunden; ohne Ausnahme stiege seine Kontakt-Quote
 * mit jeder geteilten Empfehlung. Dasselbe Messproblem wie beim `CTA Click` vor
 * v0.156.0 (Navigation als Conversion).
 *
 * Die Module laufen im Vite-SSR-Kontext (s. `_render-astro.js`, `laden`); DOM und
 * `window.plausible` sind von Hand gebaut — genau so viel, wie `initAutoEvents` anfasst.
 */
import { test, after, before } from 'node:test';
import assert from 'node:assert/strict';
import { renderer, schliessen } from './_render-astro.js';

after(schliessen);

/** Minimales Element: Attribute, Eltern, `closest` für `[attr]` und Tag-Namen. */
class El {
  /** @param {string} tagName @param {Record<string, string>} [attrs] @param {El|null} [parent] */
  constructor(tagName, attrs = {}, parent = null) {
    this.tagName = tagName.toUpperCase();
    this.attrs = attrs;
    this.parentElement = parent;
    this.dataset = {};
    this.textContent = attrs._text ?? '';
  }
  /** @param {string} n */
  getAttribute(n) { return n in this.attrs ? this.attrs[n] : null; }
  /** @param {string} n */
  hasAttribute(n) { return n in this.attrs; }
  /** @param {string} sel */
  matches(sel) {
    const a = /^\[([\w-]+)\]$/.exec(sel);
    if (a) return a[1] in this.attrs;
    return this.tagName === sel.toUpperCase();
  }
  /** @param {string} sel @returns {El|null} */
  closest(sel) {
    /** @type {El|null} */
    let el = this;
    while (el) {
      if (el.matches(sel)) return el;
      el = el.parentElement;
    }
    return null;
  }
}

/** @type {Array<[string, any]>} */
const events = [];
/** @type {((e: any) => void) | null} */
let klick = null;

before(async () => {
  const g = /** @type {any} */ (globalThis);
  g.window = {
    location: { search: '', hostname: 'kunde.example' },
    innerHeight: 800,
    scrollY: 0,
    addEventListener() {},
    plausible: (/** @type {string} */ name, /** @type {any} */ opts) => events.push([name, opts?.props]),
  };
  g.sessionStorage = { getItem: () => null, setItem() {} };
  g.document = {
    querySelectorAll: () => [],
    documentElement: { scrollHeight: 2000 },
    addEventListener(/** @type {string} */ typ, /** @type {any} */ fn) { if (typ === 'click') klick = fn; },
  };
  // initTimeOnPage plant Timer für 30 s bis 5 min — die sollen den Testlauf nicht offen halten.
  const echt = g.setTimeout;
  g.setTimeout = () => 0;
  try {
    const r = await renderer();
    const mod = await r.laden('src/utils/analytics/auto-events.ts');
    mod.initAutoEvents();
  } finally {
    g.setTimeout = echt;
  }
  assert.ok(klick, 'Klick-Listener registriert');
});

/** @param {El} target */
function klicke(target) {
  events.length = 0;
  /** @type {(e: any) => void} */ (klick)({ target });
  return [...events];
}

const sektion = new El('section', { 'data-section': 'empfehlung' });

test('WhatsApp-Teilen → genau ein „Referral Share“ mit kanal=whatsapp, kein „WhatsApp Click“', () => {
  const a = new El('a', { href: 'https://wa.me/?text=Hallo%20Welt', 'data-referral-share': 'whatsapp' }, sektion);
  assert.deepEqual(klicke(a), [['Referral Share', { kanal: 'whatsapp' }]]);
});

test('Klick auf ein Kind-Element (Icon im Link) zählt ebenso', () => {
  const a = new El('a', { href: 'https://wa.me/?text=x', 'data-referral-share': 'whatsapp' }, sektion);
  const icon = new El('svg', {}, a);
  assert.deepEqual(klicke(icon), [['Referral Share', { kanal: 'whatsapp' }]]);
});

test('Mail-Teilen → „Referral Share“ mit kanal=mail, kein „Email Click“', () => {
  const a = new El('a', { href: 'mailto:?subject=a&body=b', 'data-referral-share': 'mail' }, sektion);
  assert.deepEqual(klicke(a), [['Referral Share', { kanal: 'mail' }]]);
});

test('Link-kopieren-Button → „Referral Share“ mit kanal=link', () => {
  const b = new El('button', { type: 'button', 'data-referral-share': 'link' }, sektion);
  assert.deepEqual(klicke(b), [['Referral Share', { kanal: 'link' }]]);
});

test('unbekannter Kanal wird nicht durchgereicht', () => {
  const b = new El('button', { 'data-referral-share': '<script>' }, sektion);
  assert.deepEqual(klicke(b), [['Referral Share', { kanal: 'unbekannt' }]]);
});

test('Gegenprobe: normaler WhatsApp-Kontaktlink zählt weiter als „WhatsApp Click“', () => {
  const a = new El('a', { href: 'https://wa.me/4994112345' }, sektion);
  assert.deepEqual(klicke(a), [['WhatsApp Click', { location: 'empfehlung', number: '4994112345' }]]);
});

test('Gegenprobe: normaler mailto zählt weiter als „Email Click“', () => {
  const a = new El('a', { href: 'mailto:info@kunde.example' }, sektion);
  assert.deepEqual(klicke(a), [['Email Click', { location: 'empfehlung', address: 'info@kunde.example' }]]);
});
