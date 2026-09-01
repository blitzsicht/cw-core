import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { leseSeite, kappe, markenfarbenLesen, setzeAltTags, heroFoto } from './og-pages.js';

// Die Extraktion ist der Teil, an dem die Automatik still scheitern kann: findet sie
// Titel oder Foto nicht, rendert sie das Falsche, ohne dass jemand etwas merkt.
// Deshalb liegt der Testschwerpunkt hier — inklusive der Fälle aus echtem Build-HTML.

test('Titel wird am Site-Namen gekappt', () => {
  const h = '<title>Softwareentwicklung &amp; Odoo-ERP aus Regensburg | Blitzsicht</title>';
  assert.equal(leseSeite(h).titel, 'Softwareentwicklung & Odoo-ERP aus Regensburg');
});

test('Gedankenstrich trennt genauso wie der Pipe', () => {
  assert.equal(leseSeite('<title>Referenzen – Websites für Handwerk</title>').titel, 'Referenzen');
});

test('Ein Bindestrich IM Wort trennt nicht', () => {
  // Regressionsschutz: /^\s+[|–]\s+/ verlangt Leerzeichen — "Odoo-ERP" bleibt heil.
  assert.equal(leseSeite('<title>Odoo-ERP und Software-Entwicklung</title>').titel,
    'Odoo-ERP und Software-Entwicklung');
});

test('Hero-Foto wird aus dem Inline-Style gelesen, samt Overlay davor', () => {
  const h = `<section class="page-hero" style="background: linear-gradient(rgba(29,30,59,0.85), rgba(29,30,59,0.85)), url('/images/hero/software.webp') center/cover no-repeat;" data-astro-cid-52m2oiq2>`;
  assert.equal(leseSeite(h).foto, '/images/hero/software.webp');
});

test('HTML-kodierte Anführungszeichen im Style werden aufgelöst', () => {
  // Astro schreibt url(&#39;…&#39;) — ohne Entity-Auflösung fände der Regex nichts.
  const h = `<section class="page-hero" style="background: url(&#39;/images/hero/forschung.webp&#39;) center/cover;">`;
  assert.equal(leseSeite(h).foto, '/images/hero/forschung.webp');
});

test('Seite ohne Hero-Foto liefert null — dann greift das cta-Template', () => {
  const h = '<title>Impressum</title><section class="page-hero">';
  const r = leseSeite(h);
  assert.equal(r.foto, null);
  assert.equal(r.titel, 'Impressum');
});

test('bisheriges og:image wird erkannt (Grundlage des Geteilt-Zählers)', () => {
  const h = '<meta property="og:image" content="https://blitzsicht.com/og/default.png">';
  assert.equal(leseSeite(h).ogImage, 'https://blitzsicht.com/og/default.png');
});

test('leeres HTML kippt nicht, sondern liefert leere Werte', () => {
  const r = leseSeite('');
  assert.equal(r.titel, '');
  assert.equal(r.foto, null);
  assert.equal(r.ogImage, '');
});

test('Umlaut-Entities in Titel und Beschreibung werden aufgelöst', () => {
  const h = '<title>F&amp;E bei Blitzsicht</title>'
    + '<meta name="description" content="Zwei Vorhaben wurden bescheinigt &amp; geprüft">';
  const r = leseSeite(h);
  assert.equal(r.titel, 'F&E bei Blitzsicht');
  assert.equal(r.desc, 'Zwei Vorhaben wurden bescheinigt & geprüft');
});

test('GEGENPROBE: ein externes Hero-Foto wird nicht als lokaler Pfad gelesen', () => {
  // http(s)-Quellen kann der Renderer nicht vom Dateisystem laden; die Integration
  // faellt dann bewusst auf cta zurueck statt mit ENOENT zu scheitern.
  const h = `<section class="page-hero" style="background: url('https://cdn.example/x.jpg') center/cover;">`;
  assert.equal(leseSeite(h).foto, 'https://cdn.example/x.jpg');
  assert.ok(/^https?:/i.test(leseSeite(h).foto));
});

test('Subline endet an der Wortgrenze, nicht mitten im Wort', () => {
  const lang = 'Zwei Entwicklungsvorhaben von Blitzsicht sind von der Bescheinigungsstelle Forschungszulage als Forschung bescheinigt worden';
  const k = kappe(lang, 96);
  assert.ok(k.length <= 97, `zu lang: ${k.length}`);
  assert.ok(k.endsWith('…'), 'kein Auslassungszeichen');
  assert.ok(!/\s…$/.test(k), 'Leerzeichen vor dem Auslassungszeichen');
  // Der belegte Fehlerfall: vorher endete es auf "Forschungszulage als"
  assert.ok(!k.endsWith('als…'), 'endet weiterhin auf einem angefangenen Satz');
});

test('kurzer Text bleibt unangetastet — kein Auslassungszeichen', () => {
  assert.equal(kappe('Kurz und knapp', 96), 'Kurz und knapp');
});

test('ein einzelnes ueberlanges Wort wird hart geschnitten', () => {
  const wort = 'A'.repeat(200);
  const k = kappe(wort, 20);
  assert.equal(k.length, 21);
  assert.ok(k.endsWith('…'));
});

test('og:url wird gelesen — Basis fuer die absolute Bild-URL', () => {
  const h = '<meta property="og:url" content="https://blitzsicht.com/forschung/">';
  assert.equal(leseSeite(h).ogUrl, 'https://blitzsicht.com/forschung/');
});

test('REGRESSION: die Bild-URL entsteht aus og:url, nicht aus dem alten Bildpfad', () => {
  // Der erste Anlauf schnitt "/og/…" vom bisherigen og:image ab und haengte den
  // neuen Pfad an. Das ergab nur bei Kunden mit Bild unter /og/ eine gueltige URL:
  //   /images/social.png -> https://host/images/social.png/og/seite-x.png (404)
  // Diese drei Faelle muessen alle dieselbe korrekte URL liefern.
  const ziel = 'og/seite-forschung.png';
  const faelle = [
    'https://blitzsicht.com/og/default.png',
    'https://blitzsicht.com/images/social.png',
    '',
  ];
  for (const altesBild of faelle) {
    const ogUrl = 'https://blitzsicht.com/forschung/';
    const abs = new URL('/' + ziel, ogUrl || altesBild).toString();
    assert.equal(abs, 'https://blitzsicht.com/og/seite-forschung.png',
      `falsche URL fuer altes Bild ${JSON.stringify(altesBild)}`);
  }
});

test('REGRESSION: Unterseite in einem Unterordner landet trotzdem unter /og/', () => {
  // new URL('/og/…', base) muss absolut ab Wurzel aufloesen, nicht relativ zum
  // Seitenpfad — sonst laege das Bild unter /agb/og/… und waere ein 404.
  const abs = new URL('/og/seite-agb-sla.png', 'https://blitzsicht.com/agb/sla/').toString();
  assert.equal(abs, 'https://blitzsicht.com/og/seite-agb-sla.png');
});

// ── markenfarbenLesen (cw-core#100) ─────────────────────────────────────────────
//
// ANLASS: og.hero()/og.cta() fielen ohne diese Funktion auf die Blitzsicht-
// Hausfarben zurueck — Falzmarke bekam dadurch ein blau-oranges statt sein
// eigenes Vorschaubild (28.08.2026, sichtbar auf LinkedIn).

/** Projektwurzel mit `src/styles/<name>` = `inhalt`, für die Dauer des Tests. */
function projektMitCss(dateien) {
  const wurzel = mkdtempSync(join(tmpdir(), 'og-brand-test-'));
  const stile = join(wurzel, 'src', 'styles');
  mkdirSync(stile, { recursive: true });
  for (const [name, inhalt] of Object.entries(dateien)) {
    writeFileSync(join(stile, name), inhalt, 'utf-8');
  }
  return wurzel;
}

test('beide Tokens gesetzt → beide werden übernommen', () => {
  const wurzel = projektMitCss({
    'tokens.css': ':root { --color-primary: #d90570; --color-accent: #0057ff; }',
  });
  try {
    assert.deepEqual(markenfarbenLesen(wurzel), { primary: '#d90570', accent: '#0057ff' });
  } finally {
    rmSync(wurzel, { recursive: true, force: true });
  }
});

test('nur ein Token gesetzt → nur dieser landet im Ergebnis (kein erfundener zweiter Wert)', () => {
  const wurzel = projektMitCss({ 'tokens.css': ':root { --color-primary: #d90570; }' });
  try {
    assert.deepEqual(markenfarbenLesen(wurzel), { primary: '#d90570' });
  } finally {
    rmSync(wurzel, { recursive: true, force: true });
  }
});

test('GEGENPROBE: kein Token rechenbar (color-mix) → null, nicht geraten', () => {
  const wurzel = projektMitCss({
    'tokens.css': ':root { --color-primary: color-mix(in oklab, blue, red); }',
  });
  try {
    assert.equal(markenfarbenLesen(wurzel), null);
  } finally {
    rmSync(wurzel, { recursive: true, force: true });
  }
});

test('GEGENPROBE: kein src/styles vorhanden → null, kein Absturz', () => {
  const wurzel = mkdtempSync(join(tmpdir(), 'og-brand-test-leer-'));
  try {
    assert.equal(markenfarbenLesen(wurzel), null);
  } finally {
    rmSync(wurzel, { recursive: true, force: true });
  }
});

test('mehrere CSS-Dateien: die letzte gelesene Definition gewinnt (Kaskaden-Näherung)', () => {
  const wurzel = projektMitCss({
    'a-tokens.css': ':root { --color-primary: #111111; }',
    'b-override.css': ':root { --color-primary: #222222; }',
  });
  try {
    // readdirSync liefert alphabetisch — b-override.css nach a-tokens.css, gewinnt.
    assert.equal(markenfarbenLesen(wurzel).primary, '#222222');
  } finally {
    rmSync(wurzel, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// og:image:alt — die textliche Fassung des Vorschaubilds (v0.148.0)
// ---------------------------------------------------------------------------
// Das Bild wird nach dem Build ausgetauscht; sein Alt-Text muss mitwechseln, sonst
// beschreibt er ein Bild, das unter dieser URL nicht mehr liegt. Trägt es die
// KI-Kennzeichnung, steckt die als Vektorpfad in den Pixeln und ist nicht vorlesbar —
// Art. 50 Abs. 5 AI Act verlangt aber eine barrierefreie Fassung.

const MIT_ALT =
  '<meta property="og:image" content="https://x.de/og/a.png">' +
  '<meta property="og:image:alt" content="Altes Motiv">' +
  '<meta name="twitter:image" content="https://x.de/og/a.png">' +
  '<meta name="twitter:image:alt" content="Altes Motiv">';

const OHNE_ALT =
  '<meta property="og:image" content="https://x.de/og/a.png">' +
  '<meta property="og:image:width" content="1200">' +
  '<meta name="twitter:image" content="https://x.de/og/a.png">';

test('bisheriger og:image:alt wird gelesen (Basis fuer den neuen Text)', () => {
  assert.equal(leseSeite(MIT_ALT).ogAlt, 'Altes Motiv');
});

test('fehlender og:image:alt liefert leer statt undefined', () => {
  assert.equal(leseSeite(OHNE_ALT).ogAlt, '');
});

test('vorhandene Alt-Tags werden ersetzt, nicht verdoppelt', () => {
  const out = setzeAltTags(MIT_ALT, 'Neues Motiv — Mit KI erzeugt');
  assert.equal((out.match(/property="og:image:alt"/g) || []).length, 1);
  assert.ok(out.includes('<meta property="og:image:alt" content="Neues Motiv — Mit KI erzeugt">'));
  assert.ok(out.includes('<meta name="twitter:image:alt" content="Neues Motiv — Mit KI erzeugt">'));
  assert.ok(!out.includes('Altes Motiv'), 'der alte Text steht noch da');
});

test('fehlende Alt-Tags werden hinter ihrem Bild eingefuegt', () => {
  // Kunden mit eigenem Layout bringen die Zeile nicht mit; ohne Einfuegen haette das
  // neu gerenderte Bild dort gar keine textliche Entsprechung.
  const out = setzeAltTags(OHNE_ALT, 'Beschreibung');
  assert.ok(out.includes('<meta property="og:image:alt" content="Beschreibung">'));
  assert.ok(out.includes('<meta name="twitter:image:alt" content="Beschreibung">'));
});

test('eingefuegt wird hinter og:image, nicht hinter og:image:width', () => {
  // Der Anker darf nicht auf die verwandten og:image:*-Tags danebengreifen.
  const out = setzeAltTags(OHNE_ALT, 'Beschreibung');
  const nachBild = out.indexOf('og:image:alt');
  const nachBreite = out.indexOf('og:image:width');
  assert.ok(nachBild < nachBreite, 'die Alt-Zeile steht nicht direkt hinter og:image');
});

test('GEGENPROBE: ohne twitter:image kommt auch kein twitter:image:alt dazu', () => {
  // Ein Alt-Tag ohne sein Bild ist keine Ergaenzung, sondern eine Angabe ueber nichts.
  const nurOg = '<meta property="og:image" content="https://x.de/og/a.png">';
  const out = setzeAltTags(nurOg, 'Beschreibung');
  assert.ok(out.includes('og:image:alt'));
  assert.ok(!out.includes('twitter:image:alt'));
});

test('GEGENPROBE: HTML ohne jedes Bild-Tag bleibt unveraendert', () => {
  const leer = '<html><head><title>x</title></head></html>';
  assert.equal(setzeAltTags(leer, 'Beschreibung'), leer);
});

test('Sonderzeichen werden als Entities geschrieben, nicht roh', () => {
  // Ein rohes " beendet das Attribut, ein rohes & macht die Seite ungueltig — und
  // auffallen wuerde es erst am kaputten Vorschaubild eines fremden Crawlers.
  const out = setzeAltTags(MIT_ALT, 'Bäcker "Zink" & Söhne');
  assert.ok(out.includes('content="Bäcker &quot;Zink&quot; &amp; Söhne">'));
  assert.ok(!out.includes('content="Bäcker "Zink"'), 'das Attribut ist aufgebrochen');
});

test('REGRESSION: ein $-Muster im Alt-Text wird nicht als Rueckverweis gelesen', () => {
  // String-Ersatz in .replace() liest $&, $1, $` als Rueckverweise. Bei Preisangaben
  // ("ab $99", "$&-Aktion") verstuemmelte das den Text lautlos.
  const out = setzeAltTags(MIT_ALT, 'Angebot $& ab $1');
  assert.ok(out.includes('content="Angebot $&amp; ab $1">'), out.slice(0, 200));
});

// ---------------------------------------------------------------------------
// Hero-Foto finden — die Bauformen aus echtem Build-HTML (v0.148.0)
// ---------------------------------------------------------------------------
// Alle Schnipsel unten sind WORTWOERTLICH aus gebauten Kundenseiten kopiert
// (zink-baeckerei, steller-sanierungen, 01.09.2026), nicht von Hand nachgebaut.
// Genau daran ist die alte Fassung gescheitert: sie wurde gegen handgeschriebenes
// HTML geprueft, das die Astro-Eigenheiten nicht hatte — und fand deshalb auf 98
// echten Seiten kein einziges Foto.

test('cw-cores PageHero: Hintergrund im Inline-Style', () => {
  const h = `<section class="page-hero" style="background: linear-gradient(rgba(29,30,59,0.7), rgba(29,30,59,0.7)), url('/images/hero/wertermittlung.webp') center/cover no-repeat;">`;
  assert.equal(heroFoto(h), '/images/hero/wertermittlung.webp');
});

test('REGRESSION: Astro haengt ein Leerzeichen an die Klasse an', () => {
  // `class="page-hero "` — echter Output, data-astro-cid dahinter. Das exakte
  // class="page-hero" der alten Fassung traf das nie.
  const h = '<section class="page-hero " data-astro-cid-iuttuhgu> <div class="hero-bg" aria-hidden="true">' +
    '<img src="/_astro/fassadensanierung.BAPAEQK__T85n5.webp" alt class="hero-bg-img"></div></section>';
  assert.equal(heroFoto(h), '/_astro/fassadensanierung.BAPAEQK__T85n5.webp');
});

test('REGRESSION: Zusatzklasse has-image schliesst den Hero nicht aus', () => {
  const h = '<section class="page-hero has-image" data-astro-cid-iuttuhgu> <div class="hero-bg">' +
    '<img src="/_astro/komplettsanierung.X1_Y2.webp" class="hero-bg-img"></div></section>';
  assert.equal(heroFoto(h), '/_astro/komplettsanierung.X1_Y2.webp');
});

test('REGRESSION: die Startseite rendert class="hero", nicht page-hero', () => {
  // Der wichtigste Fall: das meistgeteilte Bild jeder Site. Bis v0.147.0 nie erfasst.
  const h = '<section class="hero hero--split" data-astro-cid-o4hs6m3o> <div class="container">' +
    '<div class="hero-content"><h1 class="hero-title">Brot, das nach Heimat schmeckt.</h1></div>' +
    '<img src="/_astro/hero.BSRunHkm_13ta4C.webp" srcset="/_astro/hero.BSRunHkm_63OiM.webp 400w" ' +
    'alt="Frisch gebackenes Bauernbrot"></section>';
  assert.equal(heroFoto(h), '/_astro/hero.BSRunHkm_13ta4C.webp');
});

test('GEGENPROBE: hero-content und hero-badge gelten nicht als Hero-Anfang', () => {
  // Ohne Wortgrenze im Muster wuerde class="hero-content" den Block eroeffnen und
  // die Suche begaenne mitten im Hero — oder auf einer Seite ganz ohne Hero.
  const h = '<div class="hero-content"><img src="/bild.webp"></div>';
  assert.equal(heroFoto(h), null);
});

test('GEGENPROBE: das AiLabel-Symbol wird nicht als Motiv gelesen', () => {
  // Es steht bei gekennzeichneten Bildern direkt neben dem Foto (echter zink-Output).
  // Hier greifen ZWEI Schutzmechanismen — der Klassen-Ausschluss und der SVG-Filter.
  // Welcher davon traegt, prueft der naechste Test.
  const h = '<section class="hero"><img class="ai-label__icon ai-label__icon--dunkel" ' +
    'src="/_astro/ai-generated-white.BcUl2kKx.svg" alt="Mit KI erzeugt">' +
    '<img src="/_astro/hero.ABC.webp" alt="Motiv"></section>';
  assert.equal(heroFoto(h), '/_astro/hero.ABC.webp');
});

test('GEGENPROBE: ein Logo als Rasterbild wird nicht als Motiv gelesen', () => {
  // Der Test darueber allein prueft den Klassen-Ausschluss NICHT: das AiLabel-Symbol
  // ist ein SVG und faellt schon durch den Formatfilter. Aufgefallen ist das, weil der
  // Klassen-Ausschluss testweise entfernt wurde und trotzdem alles gruen blieb.
  // Ein Logo dagegen ist oft PNG oder WebP — dort traegt nur die Klasse.
  const h = '<section class="hero"><img class="site-logo" src="/logo.webp" alt="Logo">' +
    '<img src="/_astro/hero.ABC.webp" alt="Motiv"></section>';
  assert.equal(heroFoto(h), '/_astro/hero.ABC.webp');
});

test('GEGENPROBE: SVG und data-URI sind keine Hero-Fotos', () => {
  const h = '<section class="hero"><img src="/logo.svg"><img src="data:image/gif;base64,R0lGOD">' +
    '<img src="/echt.webp"></section>';
  assert.equal(heroFoto(h), '/echt.webp');
});

test('GEGENPROBE: Hero ohne jedes Bild liefert null — dann greift cta', () => {
  const h = '<section class="hero hero--split"><div class="container"><h1>Nur Text</h1></div></section>';
  assert.equal(heroFoto(h), null);
});

test('GEGENPROBE: ein Bild NACH dem Hero wird nicht eingesammelt', () => {
  // Der Block endet am </section>. Sonst wuerde irgendein Bild weiter unten auf der
  // Seite als Hero-Motiv ausgegeben — falsch, und niemand saehe warum.
  const h = '<section class="hero"><h1>Text</h1></section><section class="leistungen">' +
    '<img src="/spaeter.webp"></section>';
  assert.equal(heroFoto(h), null);
});

test('Hintergrund am Container schlaegt ein <img> im Block', () => {
  const h = `<section class="page-hero has-image" style="background: url('/hintergrund.webp') center/cover;">` +
    '<img src="/inhalt.webp"></section>';
  assert.equal(heroFoto(h), '/hintergrund.webp');
});

test('leseSeite reicht das gefundene Foto durch', () => {
  const h = '<title>Start</title><section class="hero"><img src="/_astro/hero.ABC.webp"></section>';
  assert.equal(leseSeite(h).foto, '/_astro/hero.ABC.webp');
});
