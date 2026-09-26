// @ts-check
/**
 * EmpfehlungSection: Teilen-Links, Prämie nur auf Wunsch, kein Drittanbieter-Script.
 *
 * Lauf: `node --test tests/blocks/empfehlung-section.test.js`
 *
 * ANLASS (26.09.2026): Audit über 12 Kundenseiten, Check C8 — 11 haben keine
 * Empfehlungsseite. Der Baustein soll billig und risikoarm sein: keine Daten über
 * Dritte, keine Prämie, die der Kunde nicht selbst formuliert hat.
 *
 * Geprüft wird GERENDERTES HTML (Astro-Container, s. `_render-astro.js`).
 */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderer, schliessen, normalize } from './_render-astro.js';
import { auditHtml } from '../../scripts/verify-touchpoints.mjs';
import { OPTIONAL_GOALS, CORE_GOALS } from '../../scripts/onboard/plausible-goals.mjs';

after(schliessen);

const BLOCK = 'src/components/blocks/EmpfehlungSection.astro';
const BASIS = { shareUrl: 'https://baeckerei-mueller.de/', siteName: 'Bäckerei Müller' };

/** @param {Record<string, unknown>} props */
async function section(props = {}) {
  const r = await renderer();
  return normalize(await r.render(BLOCK, { ...BASIS, ...props }));
}

/** HTML-Entities aus Attributen/Text zurückwandeln (Astro escapt & " ' < >). @param {string} s */
function unescape(s) {
  return s
    .replace(/&#38;|&amp;/g, '&')
    .replace(/&#34;|&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

/**
 * Öffnendes Tag des Elements mit `data-referral-share="<kanal>"`.
 * @param {string} html @param {string} kanal
 */
function shareTag(html, kanal) {
  const m = new RegExp(`<(a|button)\\b[^>]*\\bdata-referral-share="${kanal}"[^>]*>`).exec(html);
  assert.ok(m, `kein Element mit data-referral-share="${kanal}"`);
  return m[0];
}

/** @param {string} tag @param {string} attr */
function attr(tag, attr) {
  const m = new RegExp(`\\s${attr}="([^"]*)"`).exec(tag);
  return m ? unescape(m[1]) : null;
}

// ---------------------------------------------------------------------------
// Prämie: nur, wenn der Kunde sie selbst formuliert
// ---------------------------------------------------------------------------

test('ohne praemie: kein Prämientext, auch nicht mit praemieBedingungen', async () => {
  const html = await section({ praemieBedingungen: 'Nur bei Auftrag über 500 €.' });
  assert.doesNotMatch(html, /empfehlung-praemie/, 'kein Prämien-Element');
  assert.doesNotMatch(html, /Prämie|Gutschein|Belohnung/i, 'kein erfundener Prämientext');
  assert.doesNotMatch(html, /Nur bei Auftrag über 500 €/, 'Bedingungen ohne Prämie ergeben keinen Sinn');
});

test('mit praemie: Text 1:1 übernommen, Bedingungen klein darunter', async () => {
  const praemie = 'Für jede Empfehlung, aus der ein Auftrag wird: 50 € Gutschein & ein Brot gratis.';
  const html = await section({ praemie, praemieBedingungen: 'Gilt ab 01.10.; keine Barauszahlung.' });
  const p = /<p class="empfehlung-praemie">([^<]*)<\/p>/.exec(html);
  assert.ok(p, 'kein <p class="empfehlung-praemie">');
  assert.equal(unescape(p[1]), praemie);
  const klein = /<p class="empfehlung-praemie-bedingungen"><small>([^<]*)<\/small><\/p>/.exec(html);
  assert.ok(klein, 'Bedingungen als <small> unter der Prämie');
  assert.equal(unescape(klein[1]), 'Gilt ab 01.10.; keine Barauszahlung.');
  assert.ok(html.indexOf('empfehlung-praemie"') < html.indexOf('empfehlung-praemie-bedingungen'), 'Bedingungen stehen darunter');
});

test('mit praemie, ohne Bedingungen: kein leeres <small>', async () => {
  const html = await section({ praemie: '20 € Rabatt.' });
  assert.match(html, /<p class="empfehlung-praemie">20 € Rabatt\.<\/p>/);
  assert.doesNotMatch(html, /empfehlung-praemie-bedingungen/);
});

// ---------------------------------------------------------------------------
// Überschrift, Intro, Schritte
// ---------------------------------------------------------------------------

test('Defaults: Überschrift und drei Schritte in der Reihenfolge', async () => {
  const html = await section();
  assert.match(html, /<h2[^>]*>Empfehlen Sie uns weiter<\/h2>/);
  const schritte = [...html.matchAll(/<li class="empfehlung-schritt">([^<]*)<\/li>/g)].map((m) => m[1]);
  assert.deepEqual(schritte, [
    'Link teilen oder uns nennen',
    'Ihr Kontakt meldet sich bei uns',
    'Wir kümmern uns um den Rest',
  ]);
  assert.match(html, /<ol class="empfehlung-schritte"/);
});

test('eigene Überschrift, Intro und Schritte ersetzen die Defaults', async () => {
  const html = await section({ heading: 'Weitersagen', intro: 'Zufrieden?', schritte: ['Eins', 'Zwei'] });
  assert.match(html, /<h2[^>]*>Weitersagen<\/h2>/);
  assert.match(html, /<p class="empfehlung-intro">Zufrieden\?<\/p>/);
  const schritte = [...html.matchAll(/<li class="empfehlung-schritt">([^<]*)<\/li>/g)].map((m) => m[1]);
  assert.deepEqual(schritte, ['Eins', 'Zwei']);
});

test('ohne intro: kein leerer Absatz', async () => {
  assert.doesNotMatch(await section(), /empfehlung-intro/);
});

// ---------------------------------------------------------------------------
// Teilen-Links: Kodierung
// ---------------------------------------------------------------------------

const SCHWIERIG = {
  siteName: 'Bäckerei Müller & Söhne',
  shareUrl: 'https://example.org/grüße?a=1&b=zwei worte',
};
const SCHWIERIG_TEXT = 'Ich kann dir Bäckerei Müller & Söhne empfehlen: https://example.org/grüße?a=1&b=zwei worte';

test('WhatsApp: https://wa.me/?text= mit URL-kodiertem Default-Text (Umlaute, &, Leerzeichen)', async () => {
  const tag = shareTag(await section(SCHWIERIG), 'whatsapp');
  assert.match(tag, /^<a\b/);
  const href = attr(tag, 'href');
  assert.equal(href, 'https://wa.me/?text=' + encodeURIComponent(SCHWIERIG_TEXT));
  const query = /** @type {string} */ (href).slice('https://wa.me/?text='.length);
  assert.doesNotMatch(query, /[\s&äöüÄÖÜß?=]/, 'kein Rohzeichen im kodierten Text');
  assert.equal(decodeURIComponent(query), SCHWIERIG_TEXT, 'rund zurück lesbar');
});

test('E-Mail: mailto:?subject=…&body=… mit %20 statt +, & im Text als %26', async () => {
  const tag = shareTag(await section(SCHWIERIG), 'mail');
  const href = /** @type {string} */ (attr(tag, 'href'));
  const m = /^mailto:\?subject=([^&]*)&body=([^&]*)$/.exec(href);
  assert.ok(m, `mailto-Aufbau falsch: ${href}`);
  assert.equal(decodeURIComponent(m[1]), 'Empfehlung: Bäckerei Müller & Söhne');
  assert.equal(decodeURIComponent(m[2]), SCHWIERIG_TEXT);
  assert.doesNotMatch(m[1] + m[2], /[\s+äöüß]/, 'Leerzeichen als %20, nicht roh und nicht als +');
});

test('shareText mit Platzhaltern {siteName} und {shareUrl}', async () => {
  const tag = shareTag(await section({ shareText: 'Schau mal bei {siteName} vorbei: {shareUrl}' }), 'whatsapp');
  assert.equal(
    decodeURIComponent(/** @type {string} */ (attr(tag, 'href')).split('?text=')[1]),
    'Schau mal bei Bäckerei Müller vorbei: https://baeckerei-mueller.de/',
  );
});

test('shareText ohne {shareUrl}: der Link wird angehängt, sonst teilt man nichts', async () => {
  const tag = shareTag(await section({ shareText: 'Sehr zu empfehlen!' }), 'whatsapp');
  assert.equal(
    decodeURIComponent(/** @type {string} */ (attr(tag, 'href')).split('?text=')[1]),
    'Sehr zu empfehlen! https://baeckerei-mueller.de/',
  );
});

// ---------------------------------------------------------------------------
// Link kopieren, a11y, Tracking-Marker
// ---------------------------------------------------------------------------

test('Link kopieren: <button type="button"> mit sichtbarem Label, Link-Feld und aria-live-Rückmeldung', async () => {
  const html = await section();
  const tag = shareTag(html, 'link');
  assert.match(tag, /^<button\b/);
  assert.match(tag, /\stype="button"/);
  assert.equal(attr(tag, 'data-share-url'), 'https://baeckerei-mueller.de/');
  assert.match(html, /<button\b[^>]*data-referral-share="link"[^>]*>\s*Link kopieren\s*<\/button>/);
  const feld = /<input\b[^>]*\bid="([^"]+)"[^>]*>/.exec(html);
  assert.ok(feld, 'Link-Feld für den Fallback (Markieren)');
  assert.match(feld[0], /\sreadonly/);
  assert.equal(attr(feld[0], 'value'), 'https://baeckerei-mueller.de/');
  assert.match(html, new RegExp(`<label\\b[^>]*for="${feld[1]}"`), 'Link-Feld hat ein Label');
  assert.match(html, /<[a-z]+\b[^>]*\baria-live="polite"[^>]*data-empfehlung-status/, 'Rückmeldung per aria-live');
});

test('alle drei Kanäle tragen data-referral-share, kein data-cta (Teilen ist keine Kontaktaufnahme)', async () => {
  const html = await section();
  const kanaele = [...html.matchAll(/data-referral-share="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(kanaele, ['whatsapp', 'mail', 'link']);
  assert.doesNotMatch(html, /data-cta=/);
});

test('WhatsApp öffnet in neuem Tab mit rel=noopener', async () => {
  const tag = shareTag(await section(), 'whatsapp');
  assert.equal(attr(tag, 'target'), '_blank');
  assert.match(/** @type {string} */ (attr(tag, 'rel')), /\bnoopener\b/);
});

test('id-Prop: eindeutige IDs für Überschrift und Link-Feld, Label/aria-labelledby passen', async () => {
  const std = await section();
  assert.match(std, /aria-labelledby="empfehlung-heading"/);
  assert.match(std, /<h2 id="empfehlung-heading"/);
  const eigen = await section({ id: 'zweite' });
  assert.match(eigen, /aria-labelledby="zweite-heading"/);
  assert.match(eigen, /<h2 id="zweite-heading"/);
  assert.match(eigen, /<label for="zweite-link">/);
  assert.match(eigen, /<input id="zweite-link"/);
});

test('kein Drittanbieter-Script', async () => {
  const html = await section();
  assert.doesNotMatch(html, /<script\b[^>]*\ssrc="https?:\/\//);
});

test('Nur Tokens: keine Hex-Farben im Style-Block, Fokus sichtbar', () => {
  const quelle = readFileSync(resolve(import.meta.dirname, '../..', BLOCK), 'utf-8');
  const style = /<style>([\s\S]*)<\/style>/.exec(quelle);
  assert.ok(style, 'Style-Block vorhanden');
  assert.doesNotMatch(style[1], /#[0-9a-fA-F]{3,8}\b/, 'Farben nur über var(--color-*)');
  assert.match(style[1], /:focus-visible/, 'Fokus sichtbar');
});

// ---------------------------------------------------------------------------
// Guards, an denen der Baustein beim Kunden vorbeimuss
// ---------------------------------------------------------------------------

test('Touchpoint-Audit (verify-touchpoints) meldet die Teilen-Links nicht', async () => {
  // Echter Referent: das gerenderte Markup, gegen den Guard, der im Kunden-CI hart prüft.
  // Ohne Ausnahme fiele `mailto:?…` als „leere mailto:" und `wa.me/?text=` als
  // „WhatsApp-Link ohne erkennbare Nummer" durch.
  const html = await section(SCHWIERIG);
  const ssot = { phones: new Set(['4994112345']), emails: new Set(['info@example.org']) };
  assert.deepEqual(auditHtml(html, ssot), []);
});

test('Goal „Referral Share“ ist als optionales Goal registriert, nicht als Kern-Goal', () => {
  assert.ok(OPTIONAL_GOALS.some((g) => g.type === 'event' && g.value === 'Referral Share'));
  assert.ok(!CORE_GOALS.some((g) => g.value === 'Referral Share'));
});

// ---------------------------------------------------------------------------
// Vorlage src/templates/empfehlen.astro.template
// ---------------------------------------------------------------------------

test('Vorlage empfehlen.astro.template: Astro-Syntax fehlerfrei, bindet Section + Formular + Tracking ein', async () => {
  const { createRequire } = await import('node:module');
  const { pathToFileURL } = await import('node:url');
  const astroReq = createRequire(createRequire(import.meta.url).resolve('astro/package.json'));
  const { transform } = await import(pathToFileURL(astroReq.resolve('@astrojs/compiler')).href);
  const datei = resolve(import.meta.dirname, '../../src/templates/empfehlen.astro.template');
  const quelle = readFileSync(datei, 'utf-8');
  const out = await transform(quelle, { filename: 'empfehlen.astro' });
  const fehler = (out.diagnostics ?? []).filter((/** @type {any} */ d) => d.severity === 1);
  assert.deepEqual(fehler.map((/** @type {any} */ d) => d.text), []);
  assert.match(quelle, /<BaseLayout\b/);
  assert.match(quelle, /<EmpfehlungSection\b[^>]*siteName=\{siteData\.name\}[^>]*shareUrl=\{siteData\.url\}/);
  assert.match(quelle, /<ContactForm\b[^>]*formType="empfehlung"/);
  assert.match(quelle, /<PlausibleEvents \/>/);
  assert.match(quelle, /allowEmpfehlung: true/, 'Hinweis auf das Opt-in im Endpoint');
  assert.doesNotMatch(quelle.replace(/\{\/\*[\s\S]*?\*\/\}/g, ''), /praemie=/, 'Prämie nur als Kommentar, nie aktiv');
});
