// @ts-check
/**
 * Tests für html-resources + csp-audit — die Output-Verifikation.
 *
 * Lauf: `node --test tests/integrations/csp-audit.test.js`
 *
 * Kernfrage dieser Ebene: „blockt die CSP etwas, das der Build tatsächlich
 * ausliefert?" — im Gegensatz zu csp-check, das nur den CSP-Text mit bekannten
 * Fehlermustern vergleicht.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { extractResources, extractCssUrls, parseAttrs } from '../../src/integrations/ai-discovery/html-resources.js';
import { loadavg, cpus } from 'node:os';
import { auditHtml, formatFinding } from '../../src/integrations/ai-discovery/csp-audit.js';

const ORIGIN = 'https://gympanzen.com';
const sha256 = (c) => createHash('sha256').update(c, 'utf8').digest('base64');
const hashFn = (c, a) => createHash(a).update(c, 'utf8').digest('base64');

/** gympanzens echte CSP vom 22.07.2026 — Style-Direktiven ohne Inline-Erlauber. */
const BROKEN =
  "default-src 'self' https://gympanzen.com; object-src 'none'; base-uri 'self'; " +
  "img-src 'self' https://gympanzen.com data:; font-src 'self' https://gympanzen.com; " +
  "style-src 'self' https://gympanzen.com; style-src-elem 'self' https://gympanzen.com; " +
  "script-src 'self' https://gympanzen.com; script-src-elem 'self' https://gympanzen.com; " +
  "media-src 'self' https://gympanzen.com; manifest-src 'self' https://gympanzen.com";

const FIXED = BROKEN.replace(/style-src(-elem)? '/g, (m) => m).replace(
  "style-src 'self' https://gympanzen.com; style-src-elem 'self' https://gympanzen.com;",
  "style-src 'self' https://gympanzen.com 'unsafe-inline'; style-src-elem 'self' https://gympanzen.com 'unsafe-inline';",
);

/** Verkürzter, aber strukturgleicher Astro-Output mit inlineStylesheets:'always'. */
const ASTRO_INLINE_CSS = `<!DOCTYPE html><html lang="de"><head>
<meta charset="utf-8">
<link rel="icon" href="/favicon.svg">
<style>:root{--c:#1D1E3B}body{margin:0}</style>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization"}</script>
</head><body>
<img src="/assets/logo.png" alt="Logo">
<script src="/js/nav.js"></script>
</body></html>`;

// ------------------------------------------------------------- Gegenbeweis

test('GEGENBEWEIS gympanzen: kaputte CSP blockt den Inline-<style>', () => {
  const f = auditHtml(ASTRO_INLINE_CSS, BROKEN, { siteOrigin: ORIGIN, file: 'dist/index.html' });
  const blocked = f.filter((x) => !x.result.allowed);
  assert.equal(blocked.length, 1, 'genau der <style>-Block muss blockiert sein');
  assert.equal(blocked[0].resource.type, 'inline');
  assert.equal(blocked[0].resource.directive, 'style-src-elem');
  assert.match(formatFinding(blocked[0]), /Inline-<style>-Block/);
});

test('GEGENBEWEIS gympanzen: derselbe Output ist mit gefixter CSP sauber', () => {
  assert.deepEqual(auditHtml(ASTRO_INLINE_CSS, FIXED, { siteOrigin: ORIGIN }), []);
});

test('GEGENBEWEIS: leere CSP → keine Funde (kein Crash)', () => {
  assert.deepEqual(auditHtml(ASTRO_INLINE_CSS, '', { siteOrigin: ORIGIN }), []);
});

// ------------------------------------------------- False-Positive-Fallgruben

test('FALLGRUBE: application/ld+json ist kein ausführbares Script', () => {
  const html = `<script type="application/ld+json">{"a":1}</script>`;
  const res = extractResources(html);
  assert.equal(res.length, 0, 'JSON-LD darf nie als Script gewertet werden');
  // Und im Audit mit script-strikter CSP entsprechend kein Fund:
  assert.deepEqual(auditHtml(html, "script-src-elem 'self' https://a.de", { siteOrigin: 'https://a.de' }), []);
});

test('FALLGRUBE: externes Stylesheet (inlineStylesheets:\'never\') wird gegen den Host geprüft', () => {
  const html = `<link rel="stylesheet" href="/_astro/index.CmMy.css">`;
  const ok = auditHtml(html, "style-src-elem 'self' https://a.de", { siteOrigin: 'https://a.de' });
  assert.deepEqual(ok, []);
  const bad = auditHtml(html, "style-src-elem https://cdn.fremd.de", { siteOrigin: 'https://a.de' });
  assert.equal(bad.length, 1);
  assert.equal(bad[0].result.allowed, false);
});

test('FALLGRUBE: Hash-basierte CSP wird korrekt aufgelöst', () => {
  const css = ':root{--c:#000}';
  const html = `<style>${css}</style>`;
  const csp = `style-src-elem 'self' 'sha256-${sha256(css)}'`;
  assert.deepEqual(auditHtml(html, csp, { siteOrigin: 'https://a.de', hashFn }), [], 'gelisteter Hash muss greifen');
  const wrong = `style-src-elem 'self' 'sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='`;
  assert.equal(auditHtml(html, wrong, { siteOrigin: 'https://a.de', hashFn }).length, 1);
});

test('mehrfach identische Blockade wird zusammengefasst, nicht 50× gemeldet', () => {
  const html = Array.from({ length: 50 }, () => '<img src="https://fremd.de/a.png">').join('');
  const f = auditHtml(html, "img-src 'self' https://a.de", { siteOrigin: 'https://a.de' });
  assert.equal(f.length, 1);
  assert.equal(f[0].count, 50);
  assert.match(formatFinding(f[0]), /50×/);
});

// ------------------------------------------------------- Extraktor-Abdeckung

test('Extraktor: <link>-Varianten landen in der richtigen Direktive', () => {
  const html = `
    <link rel="stylesheet" href="/a.css">
    <link rel="modulepreload" href="/a.js">
    <link rel="manifest" href="/site.webmanifest">
    <link rel="preload" as="font" href="/f.woff2">
    <link rel="preload" as="image" href="/i.avif">
    <link rel="icon" href="/favicon.svg">
    <link rel="preconnect" href="https://fonts.example">`;
  const byUrl = Object.fromEntries(extractResources(html).map((r) => [r.url, r.directive]));
  assert.equal(byUrl['/a.css'], 'style-src-elem');
  assert.equal(byUrl['/a.js'], 'script-src-elem');
  assert.equal(byUrl['/site.webmanifest'], 'manifest-src');
  assert.equal(byUrl['/f.woff2'], 'font-src');
  assert.equal(byUrl['/i.avif'], 'img-src');
  assert.equal(byUrl['/favicon.svg'], 'img-src');
  assert.equal(byUrl['https://fonts.example'], undefined, 'preconnect ist CSP-irrelevant');
});

test('Extraktor: <a href> ist keine CSP-Ressource, <link href> schon', () => {
  const res = extractResources('<a href="https://fremd.de/seite">x</a><link rel="stylesheet" href="/a.css">');
  assert.equal(res.length, 1);
  assert.equal(res[0].url, '/a.css');
});

test('Extraktor: mailto/tel/#-Anker werden ignoriert', () => {
  assert.deepEqual(extractResources('<link rel="icon" href="#x"><img src="mailto:a@b.de">'), []);
});

test('Extraktor: <source> — srcset ist Bild, src in <video> ist Medium', () => {
  const html = `<picture><source srcset="/a.avif 1x, /b.avif 2x"><img src="/c.jpg"></picture>
                <video poster="/p.jpg"><source src="/v.mp4"></video>
                <picture><source src="/d.jpg"></picture>`;
  const res = extractResources(html);
  const d = (u) => res.find((r) => r.url === u)?.directive;
  assert.equal(d('/a.avif'), 'img-src');
  assert.equal(d('/b.avif'), 'img-src');
  assert.equal(d('/v.mp4'), 'media-src');
  assert.equal(d('/p.jpg'), 'img-src');
  assert.equal(d('/d.jpg'), 'img-src', 'nach </video> darf der Medien-Kontext nicht kleben');
});

test('Extraktor: style="…" und on*="…" werden als Attribut-Ressourcen erkannt', () => {
  const res = extractResources('<div style="color:red" onclick="go()">x</div>');
  assert.ok(res.some((r) => r.type === 'attr' && r.directive === 'style-src-attr'));
  assert.ok(res.some((r) => r.type === 'attr' && r.directive === 'script-src-attr'));
});

test('Extraktor: url() in Inline-CSS — @font-face ist Font, sonst Bild', () => {
  const css = '@font-face{font-family:X;src:url(/f.woff2)}body{background:url("/bg.jpg")}';
  const res = extractCssUrls(css, 'x');
  assert.equal(res.find((r) => r.url === '/f.woff2')?.directive, 'font-src');
  assert.equal(res.find((r) => r.url === '/bg.jpg')?.directive, 'img-src');
});

test('Extraktor: <iframe> → frame-src, <form action> → form-action', () => {
  const res = extractResources('<iframe src="https://challenges.cloudflare.com/x"></iframe><form action="/api/contact"></form>');
  assert.equal(res.find((r) => r.url?.includes('cloudflare'))?.directive, 'frame-src');
  assert.equal(res.find((r) => r.url === '/api/contact')?.directive, 'form-action');
});

test('Extraktor: Fundstelle trägt die Zeilennummer', () => {
  const html = 'a\nb\n<style>x{}</style>';
  assert.equal(extractResources(html, 'dist/i.html')[0].where, 'dist/i.html:3');
});

test('parseAttrs: Quotes, unquoted, leere Attribute', () => {
  const a = parseAttrs(`rel="stylesheet" as=font defer data-x='1'`);
  assert.equal(a.rel, 'stylesheet');
  assert.equal(a.as, 'font');
  assert.equal(a.defer, '');
  assert.equal(a['data-x'], '1');
});

// ─── cw-core#260 Punkt 2: parseAttrs/srcset aus utils/html-attribute.js ─────────────────
// Ein Leser für CSP-Prüfung und verify-touchpoints. Vorher: kein Decoder, das LETZTE
// Vorkommen gewann, srcset per split(',').

test('#260 parseAttrs: dekodiert, erstes Vorkommen gewinnt, Quote im Wert bleibt', () => {
  const a = parseAttrs(` src="/a&#38;b.webp" alt="it's" src="/zweit.webp" data-x='q"z' hidden`);
  assert.equal(a.src, '/a&b.webp');
  assert.equal(a.alt, "it's");
  assert.equal(a['data-x'], 'q"z');
  assert.equal(a.hidden, '');
  // Gegenprobe: `&ampel` ohne Semikolon vor einem Buchstaben bleibt eine Query.
  assert.equal(parseAttrs(` href="/s?a=1&ampel=2"`).href, '/s?a=1&ampel=2');
});

test('#260 extractResources: srcset nach WHATWG, je Kandidat wie der Browser', () => {
  const urls = (html) => extractResources(html).filter((r) => r.type === 'url').map((r) => r.url);
  assert.deepEqual(urls('<img srcset="/a,b.webp 1x, /c.webp 2x">'), ['/a,b.webp', '/c.webp']);
  // data:-SVG mit Leerzeichen: der Browser verwirft den Kandidaten (ungültiger Deskriptor), kein
  // erfundener Host aus dem SVG-Namensraum.
  const svg = `<img srcset="data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg'%3E 1x">`;
  assert.deepEqual(urls(svg), []);
  // Nachlese der Reviews #283/#284: bis dahin war ein srcset, das mit data: begann, EINE Adresse,
  // und jeder spätere Kandidat fehlte der CSP-Prüfung (falsch grün).
  assert.deepEqual(
    urls(`<img srcset="data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg'%3E 1x, https://cdn.example.com/x.webp 2x">`),
    ['https://cdn.example.com/x.webp'],
  );
  assert.deepEqual(
    urls('<img srcset="data:image/webp;base64,UklGRg== 1w, /bilder/hero-800.webp 800w">'),
    ['data:image/webp;base64,UklGRg==', '/bilder/hero-800.webp'],
  );
});

// ─── Nachlese der Reviews #283/#284: Tags in Kommentaren und Script-Körpern ──────────────
// Bis zum Review von #289 prüfte dieser Test die Maske (`maskiere`), seitdem liest parse5 und
// es gibt keine Maske mehr. Geprüft wird dieselbe Erwartung am Ergebnis.
test('Kommentare und Script-/Style-Körper liefern keine Refs, die Elemente selbst schon; Zeilen stimmen', () => {
  const html = '<p>a</p><!-- <img src="/k.webp">\n --><script>x="<img src=/s.webp>"\n</script><style>b{}</style><img src="/a.webp">';
  const r = extractResources(html, 'x.html');
  assert.deepEqual(r.map((x) => `${x.type === 'url' ? x.url : x.directive} ${x.where}`), [
    'script-src-elem x.html:2',
    'style-src-elem x.html:3',
    '/a.webp x.html:3',
  ]);
  // Ein offener Kommentar läuft bis zum Ende; `<!--` in einem Script ist kein Kommentar.
  const urls = (h) => extractResources(h).filter((x) => x.type === 'url').map((x) => x.url);
  assert.deepEqual(urls('<p>x</p><!-- <img src=/a.webp>'), []);
  assert.deepEqual(urls('<script>s="<!--"</script><img src="/echt.webp">'), ['/echt.webp']);
});

test('extractResources: Tags in Kommentar und Script zählen nicht, echte Tags weiter', () => {
  const urls = (html) => extractResources(html).filter((r) => r.type === 'url').map((r) => r.url);
  assert.deepEqual(urls(`<script>el.innerHTML='<div style="background:url(/img/'+n+'.webp)"></div>'</script>`), []);
  assert.deepEqual(urls('<!-- <div style="background:url(/alt.png)"> <img src="/k.webp"> -->'), []);
  // Ein auskommentiertes Inline-Script ist keins.
  assert.deepEqual(extractResources('<!-- <script>alert(1)</script> -->').filter((r) => r.type === 'inline'), []);
  // GEGENPROBE: derselbe Tag außerhalb wird gelesen, mit richtiger Zeilennummer hinter einem
  // mehrzeiligen Kommentar.
  const r = extractResources('<!--\n\n-->\n<div style="background:url(/fehlt.webp)"></div>', 'x.html');
  assert.deepEqual(r.filter((x) => x.type === 'url').map((x) => `${x.url} ${x.where}`), ['/fehlt.webp x.html:4']);
});

// ─── Review von #285: Kommentar-Enden und Bereichsanfänge wie im Browser ─────────────────
// Erwartung je Fall in Chromium gemessen (10.11.2026, Playwright aus cw-audit): geladen wurden
// genau die Bilder, die hier als Ref erwartet werden. Gegen v0.195.0 gemessen: dort wurden die
// Fälle M1–M5 gemeldet, nach #285 bis zu diesem Fix nicht mehr (falsch grün).
test('Review #285: Kommentar endet bei <!-->, <!---> und --!>, nicht erst bei -->', () => {
  const urls = (html) => extractResources(html).filter((r) => r.type === 'url').map((r) => r.url);
  // M1: leerer Kommentar schließt sofort, das Bild danach und das Inline-Script zählen.
  const m1 = extractResources('<!--><img src="/a.webp"><script>alert(1)</script>');
  assert.deepEqual(m1.filter((r) => r.type === 'url').map((r) => r.url), ['/a.webp']);
  assert.equal(m1.filter((r) => r.type === 'inline' && r.directive === 'script-src-elem').length, 1);
  // M2 und M3.
  assert.deepEqual(urls('<!---><img src="/a.webp">'), ['/a.webp']);
  assert.deepEqual(urls('<!-- x --!><img src="/a.webp">'), ['/a.webp']);
  // GEGENPROBE: `-- >` ist kein Ende, ein offener Kommentar läuft bis zum Dateiende.
  assert.deepEqual(urls('<!-- x -- ><img src="/k.webp"> --><img src="/a.webp">'), ['/a.webp']);
  assert.deepEqual(urls('<img src="/a.webp"><!-- <img src="/k.webp">'), ['/a.webp']);
});

test('Review #285: <!-- und <script in einem Attributwert beginnen keinen Bereich', () => {
  const urls = (html) => extractResources(html).filter((r) => r.type === 'url').map((r) => r.url);
  // M4: der echte Kommentar danach bleibt ein Kommentar, die Bilder davor und danach zählen.
  assert.deepEqual(urls('<input pattern="<!--"><img src="/a.webp"><!-- <img src="/k.webp"> --><img src="/b.webp">'), ['/a.webp', '/b.webp']);
  assert.deepEqual(urls(`<input pattern='<!--'><img src="/a.webp">`), ['/a.webp']);
  // M5: das echte Script danach wird weiter als Inline-Script gelesen, sein Körper maskiert.
  const m5 = extractResources('<div data-tpl="<script>"></div><img src="/a.webp"><script>s="<img src=/s.webp>"</script><img src="/b.webp">');
  assert.deepEqual(m5.filter((r) => r.type === 'url').map((r) => r.url), ['/a.webp', '/b.webp']);
  assert.equal(m5.filter((r) => r.type === 'inline' && r.directive === 'script-src-elem').length, 1);
  // Ein `>` im gequoteten Wert eines Script-Tags beendet den Tag nicht.
  const q = extractResources('<script data-x="a>b">var y=1</script><img src="/a.webp">');
  assert.deepEqual(q.filter((r) => r.type === 'inline').map((r) => r.content), ['var y=1']);
});

test('#260 extractResources: url() im style-Attribut wird dekodiert gelesen', () => {
  const res = extractResources(`<section style="background:url(&quot;/h&#38;x.webp&quot;)"></section>`);
  const bild = res.filter((r) => r.type === 'url' && r.directive === 'img-src').map((r) => r.url);
  assert.deepEqual(bild, ['/h&x.webp']);
  assert.ok(res.some((r) => r.type === 'attr' && r.directive === 'style-src-attr'), 'style-src-attr bleibt gemeldet');
});

// Review #287: jede Erwartung in Chromium gemessen (Playwright, 11.11.2026), nicht angenommen.
test('Review #287: Quote zählt nur direkt nach =, sonst ist es ein Zeichen', () => {
  const urls = (html) => extractResources(html).filter((r) => r.type === 'url').map((r) => r.url);
  // Q1: `class=a'b` ist ein unquotierter Wert; das Inline-Script dazwischen läuft im Browser.
  const q1 = extractResources(`<b class=a'b>x</b><script>alert(1)</script><i class=c'd><img src="/a.webp">`);
  assert.deepEqual(q1.map((r) => r.type === 'url' ? r.url : r.directive), ['script-src-elem', '/a.webp']);
  // Q2: `>` in einem gequoteten Wert beendet den Tag nicht (vorher: src nie gelesen).
  assert.deepEqual(urls('<img alt="a>b" src="/a.webp">'), ['/a.webp']);
  // Q3: ein offener Wert läuft bis zum Dateiende, der Browser lädt nichts danach.
  assert.deepEqual(urls('<div title="x><!-- --><img src=/a.webp>'), []);
  // Q4: Attribute im End-Tag werden ebenso gelesen.
  assert.deepEqual(urls('<b>x</b title="><img src=/t.webp>"><img src="/a.webp">'), ['/a.webp']);
  // Q5: offener Wert im <script>-Tag — der Browser führt nichts aus und lädt nichts. Ohne die
  // atomare Attribut-Lesart sprang die Regex in eine Lesart mit `"` als Namenszeichen zurück.
  assert.deepEqual(extractResources('<script data-x="a>new Image().src=1</script><img src="/a.webp">'), []);
  // Q6: ein Tag, der am Dateiende ohne `>` abbricht, verwirft der Browser samt Attributen.
  assert.deepEqual(urls('<p>x</p><img src="/a.webp" alt="x'), []);
});

test('Review #287: Rohtext-Elemente — <!-- darin ist Text, Tags darin laden nicht', () => {
  const urls = (html) => extractResources(html).filter((r) => r.type === 'url').map((r) => r.url);
  // R1: `<!--` in textarea/title blendete vorher alles danach aus.
  assert.deepEqual(urls('<textarea><!--</textarea><img src="/a.webp">'), ['/a.webp']);
  assert.deepEqual(urls('<title>a <!-- b</title><img src="/a.webp">'), ['/a.webp']);
  // R2: Tags im Körper von textarea, title und iframe lädt der Browser nicht.
  assert.deepEqual(urls('<textarea><img src="/t.webp"></textarea><img src="/a.webp">'), ['/a.webp']);
  assert.deepEqual(urls('<iframe src="/f"><img src="/t.webp"></iframe>'), ['/f']);
  // R3: noscript — der Kommentar endet spätestens an </noscript>; ein Bild darin zählt weiter
  // (Sicht ohne JavaScript, wie in v0.195.0), ebenso ein Inline-Style.
  assert.deepEqual(urls('<noscript><!--</noscript><img src="/a.webp">'), ['/a.webp']);
  const r3 = extractResources('<noscript><img src="/n.webp"><style>a{}</style><!-- <img src="/k.webp"> --></noscript>');
  assert.deepEqual(r3.map((r) => r.type === 'url' ? r.url : r.directive), ['style-src-elem', '/n.webp']);
  // R4: `<style-guide>` ist kein <style>; vorher fraß der Treffer das Bild bis zum nächsten </style>.
  const r4 = extractResources('<style-guide></style-guide><img src="/a.webp"><style>b{}</style>');
  assert.deepEqual(r4.map((r) => r.type === 'url' ? r.url : r.directive), ['style-src-elem', '/a.webp']);
  // R5: Zeilennummern stimmen auch hinter mehrzeiligen textarea- und noscript-Körpern.
  const h = '<textarea>\n<img src="/t.webp">\n</textarea><noscript><!-- x\n</noscript><img src="/a.webp">';
  assert.deepEqual(extractResources(h, 'x.html').map((x) => `${x.url} ${x.where}`), ['/a.webp x.html:4']);
});

test('Review #287: Bogus Comments und leere Eingabe', () => {
  const urls = (html) => extractResources(html).filter((r) => r.type === 'url').map((r) => r.url);
  // B1: `<? … >` und `</` vor einem Nicht-Buchstaben enden am ersten `>`.
  assert.deepEqual(urls('<? <img src="/k.webp"> ?><img src="/a.webp">'), ['/a.webp']);
  assert.deepEqual(urls('</ <img src="/t.webp"> ><img src="/a.webp">'), ['/a.webp']);
  // B2: Gegenprobe — <!DOCTYPE> stört nichts, `</>` ist kein Kommentar.
  assert.deepEqual(urls('<!DOCTYPE html><img src="/a.webp"></><img src="/b.webp">'), ['/a.webp', '/b.webp']);
  // B3: keine Eingabe ist keine Ressource (seit #287 warf das einen TypeError).
  assert.deepEqual(extractResources(undefined), []);
  assert.deepEqual(extractResources(null), []);
});

// ─── Review von #289: Leser auf parse5 ────────────────────────────────────────────────────
// Jede Erwartung in Chromium gemessen (Playwright aus cw-audit, 11.11.2026), mit und ohne
// JavaScript, dazu der DOM-Inhalt. Gegen den Regex-Leser (c14c5aaf) rot, mit parse5 grün.
test('Review #289: Rohtext ohne End-Tag läuft bis zum Dateiende, <plaintext> ebenso', () => {
  const urls = (html) => extractResources(html).filter((r) => r.type === 'url').map((r) => r.url);
  assert.deepEqual(urls('<script>var a=1;<img src="/in-script.webp">'), []); // P1a
  assert.deepEqual(urls('<p>x</p><title>t<img src="/t.webp">'), []); // P1b
  assert.deepEqual(urls('<p>x</p><iframe src="/f"><img src="/i.webp">'), ['/f']); // P1c
  assert.deepEqual(urls('<p>x</p><plaintext><img src="/p.webp">'), []); // P4
});

test('Review #289: Script in <noscript> läuft in keiner Sicht, Bild darin zählt (Sicht ohne JS)', () => {
  // P2: mit JS lädt nichts, ohne JS nur /n.webp; das Script läuft in keiner Sicht.
  const r = extractResources('<noscript><script>window.__ran=1</script><script src="/n.js"></script><img src="/n.webp"></noscript>');
  assert.deepEqual(r.map((x) => (x.type === 'url' ? x.url : x.directive)), ['/n.webp']);
});

test('Review #289: Attribute nach WHATWG — NBSP trennt nicht, Quote mitten im unquotierten Wert öffnet nichts', () => {
  const urls = (html) => extractResources(html).filter((r) => r.type === 'url').map((r) => r.url);
  assert.deepEqual(urls('<img alt=a src=/nbsp.webp>'), []); // P3a
  assert.deepEqual(parseAttrs(' alt=a src=/x.webp'), { alt: 'a src=/x.webp' });
  assert.deepEqual(urls('<img data-a=b"c="d src=/q.webp>'), ['/q.webp']); // P3b, vorher falsch grün
  // Gegenprobe: gewöhnliche Attribute, Entitäten, erstes Vorkommen gewinnt.
  assert.deepEqual(parseAttrs(` SRC="/a&amp;b.webp" src='/zwei.webp' alt=x`), { src: '/a&b.webp', alt: 'x' });
});

test('Review #289: SVG/MathML-Fremdinhalt — <style>/<title> darin sind kein Rohtext', () => {
  const urls = (html) => extractResources(html).filter((r) => r.type === 'url').map((r) => r.url);
  // P5a/P5c: <img> bricht aus dem Fremdinhalt aus und lädt (vorher falsch grün).
  assert.deepEqual(urls('<svg><style><img src="/m.webp"></style></svg>'), ['/m.webp']);
  assert.deepEqual(urls('<math><style><img src="/mm.webp"></style></math>'), ['/mm.webp']);
  // P5b: `<!--` in <svg><title> ist ein echter Kommentar bis zum Dateiende. Im DOM steht kein
  // Bild; Chromiums Preload-Scanner fragt /a.webp trotzdem spekulativ an. Der Leser folgt dem DOM.
  assert.deepEqual(urls('<svg><title><!-- x</title></svg><img src="/a.webp">'), []);
});

test('Review #289: Zeilen im <noscript>-Körper, <template>-Inhalt zählt wie bisher', () => {
  // Die Sicht ohne JS liest den noscript-Körper als eigenes Fragment; die Zeile muss trotzdem
  // die im Dokument sein.
  const r = extractResources('<p>a</p>\n<noscript>\n\n<img src="/n.webp"></noscript>', 'x.html');
  assert.deepEqual(r.map((x) => `${x.url} ${x.where}`), ['/n.webp x.html:4']);
  // <template> lädt beim Parsen nichts (Chromium), aber sobald ein Script den Inhalt einsetzt.
  // Der Regex-Leser zählte ihn mit; das bleibt so (konservative Richtung).
  const urls = (html) => extractResources(html).filter((x) => x.type === 'url').map((x) => x.url);
  assert.deepEqual(urls('<img src="/g.webp"><template><img src="/tpl.webp"></template>'), ['/g.webp', '/tpl.webp']);
});

// ─── Review von #292: Baumlauf, Klone, Laufzeit ───────────────────────────────────────────
// Alle drei Fälle an eab595ba gemessen (node, parse5 7.3.0, 11.11.2026), nicht abgeleitet.

/**
 * Ist der Rechner so ausgelastet, dass eine Zeitmessung nichts mehr aussagt? Gemessen am
 * 11.11.2026 bei Load 290–440 (22 Sitzungen): selbst das beste von drei Verhältnissen n/4n lag
 * für einen belegt linearen Lauf (frischer Prozess: ×4,3) in 2 von 5 Läufen über 8. Dann wird
 * übersprungen — sichtbar als „skipped“ mit Grund, nicht still grün.
 */
const LAST_JE_KERN = loadavg()[0] / Math.max(1, cpus().length);
const UEBERLAST = LAST_JE_KERN > 2 ? `Last ${LAST_JE_KERN.toFixed(1)} je Kern — Zeitmessung nicht aussagekräftig` : false;

/**
 * Wachstum statt Wanduhr: schnellster von 5 Läufen für n und 4n, nach einem Aufwärmlauf. Linear
 * ergibt ~4, quadratisch ~16; die Schwelle 8 lässt nach beiden Seiten Faktor 2 Luft. Feste Millisekunden wären auf einem ausgelasteten Runner rot,
 * ohne dass sich am Code etwas geändert hat (Review von #292, Befund 9). Das Minimum statt des
 * Medians, weil Last und GC eine Messung nur verlängern, nie verkürzen. Gemessen bei Load 318
 * (11.11.2026): das Verhältnis n/2n streute zwischen 1,3 und 5,2 — mit 2n war kein Abstand
 * zwischen linear und quadratisch mehr übrig.
 * @param {(n: number) => unknown} f
 * @param {number} n
 * @param {number} schwelle
 * @returns {boolean} liegt mindestens einer von drei Messdurchgängen unter der Schwelle?
 */
function waechstUnter(f, n, schwelle) {
  const schnellster = (/** @type {number} */ m) => {
    let best = Infinity;
    for (let i = 0; i < 5; i++) {
      const t = performance.now();
      f(m);
      best = Math.min(best, performance.now() - t);
    }
    return best;
  };
  f(n);
  // Bis zu drei Messdurchgänge: auch ein ganzer Durchgang kann unter Last liegen. Ein
  // quadratischer Lauf liegt in allen dreien über der Schwelle — die Gegenprobe unten prüft das.
  for (let i = 0; i < 3; i++) {
    if (schnellster(4 * n) / Math.max(schnellster(n), 0.01) < schwelle) return true;
  }
  return false;
}

test('Review #292: waechstUnter() erkennt quadratische Laufzeit (Gegenprobe zum Messwerkzeug)', { skip: UEBERLAST }, () => {
  // Ein Check, der nie rot werden kann, ist keiner: dieselbe Messung an einem bewusst
  // quadratischen Stub muss über der Schwelle liegen.
  const quadratisch = (/** @type {number} */ n) => {
    const a = [];
    for (let i = 0; i < n; i++) if (!a.includes(i)) a.push(i);
  };
  // n so groß, dass schon der kleine Lauf über 10 ms liegt (sonst misst man GC-Pausen).
  assert.equal(waechstUnter(quadratisch, 5000, 8), false, 'quadratischer Stub muss rot werden');
});

test('Review #292: tiefe Verschachtelung wirft nicht (Befund 3)', () => {
  // Rekursiver Lauf warf ab ~1750 offenen <div> einen RangeError; v0.195.0 schaffte 5000.
  assert.doesNotThrow(() => extractResources('<div>'.repeat(5000) + '<img src="/tief.webp">'));
  const r = extractResources('<div>'.repeat(5000) + '<img src="/tief.webp">');
  assert.deepEqual(r.map((x) => x.url), ['/tief.webp']);
});

test('Review #292: geklonte Formatierungs-Elemente melden ihre Ressource einmal (Befund 4)', () => {
  // parse5 klont <font> beim Wiederaufbau aktiver Formatierungs-Elemente für jedes neue <p>.
  // Die Klone teilen sich das startTag-Objekt der Fundstelle — gemessen, nicht angenommen.
  const r = extractResources('<p><font style="background:url(/f.webp)">a<p>b<p>c');
  assert.deepEqual(r.map((x) => (x.type === 'url' ? x.url : x.directive)), ['style-src-attr', '/f.webp']);
  // Gegenprobe: Kinder eines Klons sind echte Elemente und zählen.
  const k = extractResources('<p><b>a<p><img src="/im-klon.webp">');
  assert.deepEqual(k.map((x) => x.url), ['/im-klon.webp']);
  // Gegenprobe: implizit erzeugte Elemente (tbody, html, body) haben keine Fundstelle und
  // werden trotzdem gelesen.
  assert.deepEqual(extractResources('<table><img src="/t.webp">').map((x) => x.url), ['/t.webp']);
});

test('Review #292: Laufzeit wächst linear (ersetzt die festen ms-Grenzen, Befund 9)', { skip: UEBERLAST }, () => {
  const viele = (/** @type {number} */ n) => extractResources('<img src="/x.webp">\n'.repeat(n));
  assert.equal(viele(30000).length, 30000);
  assert.ok(waechstUnter(viele, 7500, 8), '30k Tags');
  const offen = (/** @type {number} */ n) => extractResources('<p>x</p>' + '<title>a'.repeat(n) + 'x'.repeat(10 * n));
  // n groß genug, dass eine Messung über 100 ms liegt; darunter bestimmen GC-Pausen das Ergebnis.
  assert.ok(waechstUnter(offen, 40000, 8), 'offene <title>');
  // Die vier Bauformen aus Review #287 (exponentielles Backtracking im damaligen Regex-Leser).
  // Hier wächst parse5s Tokenizer selbst nicht ganz linear (gemessen: bis ~4× je Verdopplung bei
  // gleichnamigen Attributen, also ~16× je Vervierfachung) — das ist nicht unser Lauf. Geprüft
  // wird darum, wofür der Test stand: nicht exponentiell. Das läge um Größenordnungen höher.
  /** @type {Array<(n: number) => string>} */
  const offeneTags = [(n) => '<a b="' + 'x'.repeat(n), (n) => '<a ' + 'b '.repeat(n), (n) => '<a ' + "b' ".repeat(n), (n) => '<a ' + 'b= '.repeat(n)];
  for (const bau of offeneTags) {
    assert.ok(waechstUnter((n) => extractResources(bau(n)), 25000, 64), `offenes Tag ${bau(3)}`);
  }
});
