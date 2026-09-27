// @ts-check
/**
 * GoogleBewertungen.astro — Google-Schnitt und -Anzahl ohne Google-Request beim Besucher.
 *
 * Lauf: `node --test tests/blocks/google-bewertungen.test.js`
 *
 * ANLASS (26.09.2026): Kundenseiten sollen Google-Bewertungen OHNE Einwilligung zeigen.
 * Deshalb kein Widget, kein Places-API-Aufruf im Browser: der Operator trägt Schnitt,
 * Anzahl und Stichtag monatlich in die Site-Config ein. Die Pflichten, die daraus folgen
 * (Stichtag, Profil-Link, § 5b Abs. 3 UWG-Prüfhinweis, kein „echte/verifizierte“ nach
 * UWG Anhang Nr. 23b, kein Google-Logo, kein AggregateRating-Markup), prüft dieser Test
 * am GERENDERTEN HTML — nicht am Quelltext.
 *
 * Veraltete Zahlen sind der Hauptfehler, den der Block abfangen muss: Wer den Monatslauf
 * vergisst, zeigte sonst still einen Schnitt, der nicht mehr stimmt. Deshalb blendet der
 * Block Zahlen mit einem Stand älter als `maxAgeDays` aus und warnt zur Build-Zeit.
 */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { renderer, schliessen, normalize } from './_render-astro.js';

after(schliessen);

const BLOCK = 'src/components/blocks/GoogleBewertungen.astro';
const PROFIL = 'https://www.google.com/maps/place/?q=place_id:ChIJTEST';
const SCHREIBEN = 'https://search.google.com/local/writereview?placeid=ChIJTEST';
const JETZT = new Date('2026-09-26T12:00:00Z');
const PRUEFHINWEIS =
  'Die Bewertungen stammen von Google-Nutzern. Wir prüfen nicht, ob die Verfasser unsere Leistungen tatsächlich in Anspruch genommen haben.';

/** Frische Zahlen: Stand 10 Tage vor JETZT. */
const FRISCH = { profileUrl: PROFIL, reviewUrl: SCHREIBEN, rating: 4.8, count: 24, stand: '2026-09-16', now: JETZT };

/**
 * Rendert und fängt console.warn ab.
 * @param {Record<string, unknown>} props
 * @returns {Promise<{ html: string, warns: string[] }>}
 */
async function render(props) {
  const r = await renderer();
  /** @type {string[]} */
  const warns = [];
  const orig = console.warn;
  console.warn = (...args) => { warns.push(args.map(String).join(' ')); };
  try {
    return { html: normalize(await r.render(BLOCK, props)), warns };
  } finally {
    console.warn = orig;
  }
}

/** Sichtbarer Text ohne Tags, Whitespace normalisiert. @param {string} html */
function text(html) {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Alle <a>-Tags mit Attributen und Text. @param {string} html */
function links(html) {
  return [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)].map(([, attrs, inner]) => ({
    attrs,
    href: /\bhref="([^"]*)"/.exec(attrs)?.[1] ?? '',
    text: text(inner),
  }));
}

// ---------------------------------------------------------------------------
// Zahlen frisch
// ---------------------------------------------------------------------------

test('frisch: Schnitt mit Komma, Anzahl und Stand im Format MM/JJJJ', async () => {
  const { html, warns } = await render(FRISCH);
  const t = text(html);
  assert.match(t, /4,8 von 5 Sternen · 24 Google-Bewertungen · Stand: 09\/2026/);
  assert.deepEqual(warns, [], 'frische Zahlen dürfen nicht warnen');
});

test('frisch: Prüfhinweis nach § 5b Abs. 3 UWG steht wörtlich darunter', async () => {
  const { html } = await render(FRISCH);
  const t = text(html);
  assert.ok(t.includes(PRUEFHINWEIS), 'Prüfhinweis fehlt');
  assert.ok(t.indexOf(PRUEFHINWEIS) > t.indexOf('Stand: 09/2026'), 'Prüfhinweis gehört unter die Zahlen');
});

test('frisch: Überschrift Default „Bewertungen auf Google“, überschreibbar', async () => {
  assert.match((await render(FRISCH)).html, /<h2[^>]*>Bewertungen auf Google<\/h2>/);
  assert.match((await render({ ...FRISCH, heading: 'Was Kunden sagen' })).html, /<h2[^>]*>Was Kunden sagen<\/h2>/);
});

test('frisch: Sterne sind ein eigenes SVG mit currentColor und aria-label, Einzelsterne aria-hidden', async () => {
  const { html } = await render(FRISCH);
  const sterne = /<[^>]*class="[^"]*gb-sterne[^"]*"[^>]*>/.exec(html);
  assert.ok(sterne, 'kein Sterne-Element');
  assert.match(sterne[0], /role="img"/);
  assert.match(sterne[0], /aria-label="4,8 von 5 Sternen"/);
  const svgs = [...html.matchAll(/<svg\b([^>]*)>([\s\S]*?)<\/svg>/g)];
  assert.ok(svgs.length > 0, 'kein SVG');
  for (const [, attrs, inner] of svgs) {
    assert.match(attrs, /aria-hidden="true"/, 'Einzelsterne sind dekorativ');
    assert.doesNotMatch(inner, /fill="#/, 'keine Hardcode-Farbe im SVG');
  }
  assert.match(html, /fill="currentColor"/);
});

test('frisch: Anteil der gefüllten Sterne entspricht dem Schnitt (4,8 → 96 %)', async () => {
  const { html } = await render(FRISCH);
  assert.match(html, /--gb-anteil:\s*96%/);
});

test('frisch: Profil- und Schreib-Link mit noopener, _blank, Screenreader-Hinweis und Tracking', async () => {
  const { html } = await render(FRISCH);
  const l = links(html);
  const profil = l.find((x) => x.href === PROFIL);
  const schreiben = l.find((x) => x.href === SCHREIBEN);
  assert.ok(profil, 'Profil-Link fehlt');
  assert.ok(schreiben, 'Schreib-Link fehlt');
  assert.match(profil.text, /^Alle Bewertungen auf Google ansehen/);
  assert.match(schreiben.text, /^Bewertung schreiben/);
  for (const x of [profil, schreiben]) {
    assert.match(x.attrs, /\btarget="_blank"/);
    assert.match(x.attrs, /\brel="noopener"/);
    assert.match(x.text, /öffnet in neuem Tab/);
    assert.match(x.attrs, /data-google-reviews="(profil|schreiben)"/, 'Tracking-Marker fehlt');
  }
  assert.match(profil.attrs, /data-google-reviews="profil"/);
  assert.match(schreiben.attrs, /data-google-reviews="schreiben"/);
});

test('Tracking: Skript feuert „Google Reviews Click“ mit Prop ziel', async () => {
  const src = (await import('node:fs')).readFileSync(
    new URL('../../src/components/blocks/GoogleBewertungen.astro', import.meta.url), 'utf8');
  assert.match(src, /track\('Google Reviews Click',\s*\{\s*ziel\b/);
});

// ---------------------------------------------------------------------------
// Zahlen veraltet oder unvollständig
// ---------------------------------------------------------------------------

test('veraltet (46 Tage): keine Zahlen, kein Prüfhinweis, Links da, console.warn mit Präfix und Stand', async () => {
  const { html, warns } = await render({ ...FRISCH, stand: '2026-08-11' });
  const t = text(html);
  assert.doesNotMatch(t, /4,8/);
  assert.doesNotMatch(t, /24 Google-Bewertungen/);
  assert.doesNotMatch(t, /Stand:/);
  assert.ok(!t.includes('Wir prüfen nicht'), 'ohne Zahlen kein Prüfhinweis');
  assert.doesNotMatch(html, /gb-sterne/);
  assert.ok(links(html).some((x) => x.href === PROFIL), 'Profil-Link muss bleiben');
  assert.ok(links(html).some((x) => x.href === SCHREIBEN), 'Schreib-Link muss bleiben');
  assert.equal(warns.length, 1, `genau eine Warnung erwartet, bekam ${warns.length}`);
  assert.match(warns[0], /^\[GoogleBewertungen\]/);
  assert.match(warns[0], /2026-08-11/);
  assert.match(warns[0], /Zahlen im Monatslauf aktualisieren/);
});

test('Grenze: genau 45 Tage alt gilt noch als frisch', async () => {
  const { html, warns } = await render({ ...FRISCH, stand: '2026-08-12' });
  assert.match(text(html), /Stand: 08\/2026/);
  assert.deepEqual(warns, []);
});

test('maxAgeDays ist überschreibbar', async () => {
  const { html, warns } = await render({ ...FRISCH, stand: '2026-08-11', maxAgeDays: 60 });
  assert.match(text(html), /4,8 von 5 Sternen/);
  assert.deepEqual(warns, []);
});

test('ohne stand: keine Zahlen, kein Prüfhinweis', async () => {
  const { html } = await render({ ...FRISCH, stand: undefined });
  const t = text(html);
  assert.doesNotMatch(t, /4,8|24 Google-Bewertungen/);
  assert.ok(!t.includes('Wir prüfen nicht'));
});

test('ohne rating oder count: keine Zahlen', async () => {
  for (const fehlt of ['rating', 'count']) {
    const { html } = await render({ ...FRISCH, [fehlt]: undefined });
    assert.doesNotMatch(text(html), /von 5 Sternen|Google-Bewertungen ·/, `${fehlt} fehlt, trotzdem Zahlen`);
  }
});

test('ungültiger stand oder rating außerhalb 1–5: keine Zahlen, Warnung', async () => {
  for (const kaputt of [{ stand: '16.09.2026' }, { rating: 5.3 }, { rating: 0 }]) {
    const { html, warns } = await render({ ...FRISCH, ...kaputt });
    assert.doesNotMatch(text(html), /von 5 Sternen/, JSON.stringify(kaputt));
    assert.equal(warns.length, 1, JSON.stringify(kaputt));
    assert.match(warns[0], /^\[GoogleBewertungen\]/);
  }
});

test('Einzahl: 1 Google-Bewertung', async () => {
  const { html } = await render({ ...FRISCH, count: 1, rating: 5 });
  assert.match(text(html), /5,0 von 5 Sternen · 1 Google-Bewertung · Stand/);
});

// ---------------------------------------------------------------------------
// Links und Recht
// ---------------------------------------------------------------------------

test('ohne reviewUrl: nur der Profil-Link', async () => {
  const { html } = await render({ ...FRISCH, reviewUrl: undefined });
  const l = links(html);
  assert.equal(l.length, 1);
  assert.equal(l[0].href, PROFIL);
});

test('kein Google-Logo, keine Google-Farben, kein <img>, kein itemprop, kein JSON-LD', async () => {
  for (const props of [FRISCH, { ...FRISCH, stand: undefined }]) {
    const { html } = await render(props);
    assert.doesNotMatch(html, /<img\b/i);
    assert.doesNotMatch(html, /#(EA4335|4285F4|FBBC05|34A853)/i, 'Google-Markenfarben');
    assert.doesNotMatch(html, /itemprop|itemscope|itemtype/);
    assert.doesNotMatch(html, /application\/ld\+json|AggregateRating/i);
    assert.doesNotMatch(html, /gbadge-logo|aria-label="Google"/);
  }
});

test('keine unzulässigen Echtheits-Aussagen (UWG Anh. Nr. 23b)', async () => {
  const t = text((await render(FRISCH)).html);
  assert.doesNotMatch(t, /\b(echte|verifizierte|geprüfte|authentische)\b/i);
});
