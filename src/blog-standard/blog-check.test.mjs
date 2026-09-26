// Tests für den Blog-Standard — node --test src/blog-standard/blog-check.test.mjs
// Die ersten 15 Fälle stammen aus customer-blitzsicht/scripts/check-blog-bilder.test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pruefe, pruefeVerzeichnis, woerter, sollBilder, befunde, feld, bilderMitTitel, BILDZAHL_STRENG } from './blog-check.js';

const KURZ = 'Das hier ist ein Kurz-gesagt-Absatz mit genug Zeichen. Er fasst den Beitrag in zwei bis vier Sätzen zusammen und steht vor dem ersten Absatz.';
const fm = (extra = '', kurz = KURZ) => `---\ntitle: T\nheroImage: "/images/blog/hero-x.webp"\n${kurz === null ? '' : `kurzGesagt: "${kurz}"\n`}${extra}---\n`;
const absatz = (n) => Array.from({ length: n }, (_, i) => `wort${i}`).join(' ');
const bild = (p) => `![Alt-Text der etwas beschreibt](${p})`;
const deklariert = (p) =>
  p.includes('nicht-deklariert')
    ? { quelle: null, deepfake: 'ungeklaert' }
    : { quelle: p, deepfake: p.includes('deepfake') ? 'ja' : 'nein' };
const dreiBilder = [absatz(300), bild('/images/blog/a.webp'), absatz(300), bild('/images/blog/b.webp'), absatz(300), bild('/images/blog/c.webp')].join('\n\n');

test('Soll-Formel: mindestens 3, sonst 1 je 400 Wörter', () => {
  assert.equal(sollBilder(100), 3);
  assert.equal(sollBilder(1200), 3);
  assert.equal(sollBilder(1201), 4);
  assert.equal(sollBilder(3231), 9);
});

test('Wortzählung ignoriert Code, Bildsyntax und Tabellen-Pipes', () => {
  const body = `Eins zwei drei.\n\n| a | b |\n|---|---|\n| vier | fünf |\n\n\`\`\`js\nconst x = nichtzaehlen;\n\`\`\`\n\n${bild('/images/blog/a.webp')}`;
  assert.equal(woerter(body), 7);
});

test('NEGATIV (Ist-Stand 26.09.): Artikel ohne Bild im Text wird gemeldet', () => {
  const r = pruefe('ohne.md', fm() + absatz(900));
  assert.equal(r.ist, 0);
  assert.equal(r.soll, 3);
  assert.ok([...r.fehler, ...r.hinweise].some((m) => m.includes('0 von 3 Bildern')));
  assert.equal(r.fehler.length, BILDZAHL_STRENG ? 1 : 0);
});

test('NEGATIV (Ist-Stand 26.09.): „## Kurz gesagt“ im Text ist ein Fehler', () => {
  const r = pruefe('kurz.md', fm() + `Einleitung.\n\n## Kurz gesagt\n\nText.\n`);
  assert.ok(r.fehler.some((f) => f.includes('als Überschrift')));
});

test('„kurz gesagt“ im Fließtext (keine Überschrift) ist erlaubt', () => {
  const r = pruefe('ok.md', fm() + `Kurz gesagt: das ist ein normaler Satz.\n`);
  assert.equal(r.fehler.filter((f) => f.includes('als Überschrift')).length, 0);
});

test('Hero doppelt im Text wird gemeldet (Altfall 11.09.)', () => {
  assert.equal(befunde('dup.md', fm() + bild('/images/blog/hero-x.webp') + '\n').length, 1);
});

test('POSITIV: genug Bilder, alle deklariert, kurzGesagt da — kein Befund', () => {
  const r = pruefe('gut.md', fm() + dreiBilder, { herkunft: deklariert });
  assert.deepEqual(r.fehler, []);
  assert.deepEqual(r.hinweise, []);
  assert.equal(r.ist, 3);
});

test('Bild ohne Herkunftsregel ist ein Fehler', () => {
  const r = pruefe('h.md', fm() + bild('/images/blog/nicht-deklariert.webp'), { herkunft: deklariert });
  assert.ok(r.fehler.some((f) => f.includes('keine Herkunftsregel')));
});

test('Deepfake-Bild im Markdown-Text ist ein Fehler (kein Label möglich)', () => {
  const r = pruefe('d.md', fm() + bild('/images/blog/deepfake-ort.webp'), { herkunft: deklariert });
  assert.ok(r.fehler.some((f) => f.includes('Deepfake')));
});

test('Externe Bild-URL ist ein Fehler', () => {
  const r = pruefe('e.md', fm() + bild('https://example.com/x.webp'), { herkunft: deklariert });
  assert.ok(r.fehler.some((f) => f.includes('extern')));
});

test('Bild im Code-Block zählt nicht', () => {
  assert.equal(pruefe('c.md', fm() + '```md\n' + bild('/images/blog/a.webp') + '\n```\n').ist, 0);
});

const kiHerkunft = (p) => ({ quelle: p, deepfake: 'nein', herkunft: p.includes('/ki-') ? 'ki-erzeugt' : 'mensch' });

test('NEGATIV: KI-Bild ohne sichtbare Unterschrift ist ein Fehler', () => {
  const r = pruefe('k.md', fm() + bild('/images/blog/x/ki-szene.webp'), { herkunft: kiHerkunft });
  assert.ok(r.fehler.some((f) => f.includes('keine sichtbare Unterschrift')));
});

test('KI-Bild mit Titel „Symbolbild, KI-generiert“ ist in Ordnung', () => {
  const t = fm() + '![Alt-Text](/images/blog/x/ki-szene.webp "Symbolbild, KI-generiert")';
  assert.equal(pruefe('k.md', t, { herkunft: kiHerkunft }).fehler.filter((f) => f.includes('Unterschrift')).length, 0);
});

test('Foto (Herkunft mensch) braucht keine KI-Unterschrift', () => {
  const r = pruefe('s.md', fm() + bild('/images/blog/x/foto.webp'), { herkunft: kiHerkunft });
  assert.equal(r.fehler.filter((f) => f.includes('Unterschrift')).length, 0);
});

test('Bildzahl ist streng geschaltet — ein Zurückdrehen muss hier auffallen', () => {
  assert.equal(BILDZAHL_STRENG, true);
});

// ── Neu mit dem Umzug nach cw-core (blitzsicht-ops #894) ──────────────────────────

test('NEGATIV (Gegenprobe): Beitrag ohne kurzGesagt ist ein Fehler', () => {
  const r = pruefe('ohne-kurz.md', fm('', null) + dreiBilder);
  assert.ok(r.fehler.some((f) => f.includes('kurzGesagt fehlt')));
  assert.equal(r.fehler.length, 1);
});

test('kurzGesagt zu kurz oder zu lang ist ein Fehler', () => {
  assert.ok(pruefe('k.md', fm('', 'Zu kurz.') + dreiBilder).fehler.some((f) => f.includes('Zeichen')));
  assert.ok(pruefe('l.md', fm('', 'x'.repeat(601)) + dreiBilder).fehler.some((f) => f.includes('601 Zeichen')));
});

test('kurzGesagt als YAML-Block (>-) mit Folgezeilen wird gelesen', () => {
  const kopf = `title: T\nkurzGesagt: >-\n  ${KURZ.slice(0, 60)}\n  ${KURZ.slice(60)}\nkategorie: x`;
  assert.equal(feld(kopf, 'kurzGesagt'), `${KURZ.slice(0, 60)} ${KURZ.slice(60)}`.replace(/\s+/g, ' '));
  assert.equal(feld(kopf, 'kategorie'), 'x');
});

test('kurzGesagt-Prüfung abschaltbar (Content-Schema erzwingt es schon)', () => {
  assert.deepEqual(pruefe('x.md', fm('', null) + dreiBilder, { kurzGesagt: false }).fehler, []);
});

test('rohes <figure><img> zählt, figcaption gilt als Unterschrift (siluri.de)', () => {
  const roh = (p, cap) => `<figure>\n  <img src="${p}" alt="a" width="800" height="450">\n  <figcaption>${cap}</figcaption>\n</figure>`;
  const body = [absatz(100), roh('/images/blog/ki-a.webp', 'Symbolbild, KI-generiert'), roh('/images/blog/b.webp', 'Foto'), bild('/images/blog/c.webp')].join('\n\n');
  const bilder = bilderMitTitel(body);
  assert.equal(bilder.length, 3);
  assert.equal(bilder.find((b) => b.src.includes('ki-a')).titel, 'Symbolbild, KI-generiert');
  const r = pruefe('roh.md', fm() + body, { herkunft: kiHerkunft });
  assert.equal(r.ist, 3);
  assert.deepEqual(r.fehler, []);
});

test('Hero über Feld `image` (siluri.de) wird auch als doppelt erkannt', () => {
  const t = `---\ntitle: T\nkurzGesagt: "${KURZ}"\nimage: /images/blog/h.webp\n---\n` + bild('/images/blog/h.webp');
  assert.ok(pruefe('i.md', t).fehler.some((f) => f.includes('Hero-Bild')));
});

test('kiUnterschrift:false — Site kennzeichnet selbst, kein Titel nötig', () => {
  const r = pruefe('k.md', fm() + bild('/images/blog/x/ki-szene.webp'), { herkunft: kiHerkunft, kiUnterschrift: false });
  assert.equal(r.fehler.filter((f) => f.includes('Unterschrift')).length, 0);
});

test('streng:false macht Bildmangel zum Hinweis, nicht zum Fehler', () => {
  const r = pruefe('w.md', fm() + absatz(900), { streng: false });
  assert.equal(r.fehler.length, 0);
  assert.equal(r.hinweise.length, 1);
});

test('Entwurf (draft: true) wird übersprungen', () => {
  assert.deepEqual(pruefe('e.md', '---\ntitle: T\ndraft: true\n---\nText').fehler, []);
});

test('pruefeVerzeichnis: zählt Artikel, meldet den schlechten, ignoriert _-Ordner', async () => {
  const d = mkdtempSync(join(tmpdir(), 'blog-'));
  writeFileSync(join(d, 'gut.md'), fm() + dreiBilder);
  writeFileSync(join(d, 'schlecht.md'), fm('', null) + absatz(50));
  mkdirSync(join(d, '_vorlagen'));
  writeFileSync(join(d, '_vorlagen', 'x.md'), 'kein frontmatter');
  const r = await pruefeVerzeichnis(d);
  assert.equal(r.artikel, 2);
  assert.equal(r.bilder, 3);
  assert.equal(r.fehler.length, 2); // kurzGesagt fehlt + 0 von 3 Bildern, beide in schlecht.md
  assert.ok(r.fehler.every((f) => f.startsWith('schlecht.md')));
});

test('deepfakeLabel:true — Site labelt selbst, Deepfake im Text erlaubt; ohne Schalter Fehler', () => {
  const t = fm() + bild('/images/blog/deepfake-ort.webp');
  assert.ok(pruefe('d.md', t, { herkunft: deklariert }).fehler.some((f) => f.includes('Deepfake')));
  assert.equal(pruefe('d.md', t, { herkunft: deklariert, deepfakeLabel: true }).fehler.filter((f) => f.includes('Deepfake')).length, 0);
});

test('deepfakeLabel:true — gelabelter KI-Deepfake braucht keine zusätzliche Unterschrift', () => {
  const her = (p) => ({ quelle: p, deepfake: 'ja', herkunft: 'ki-erzeugt' });
  const r = pruefe('d.md', fm() + bild('/images/blog/ki-szene.webp'), { herkunft: her, deepfakeLabel: true });
  assert.equal(r.fehler.filter((f) => f.includes('Unterschrift') || f.includes('Deepfake')).length, 0);
});
