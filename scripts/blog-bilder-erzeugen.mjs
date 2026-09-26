#!/usr/bin/env node
// Blog-Standard: Bilder aus marketing/blog-bilder/manifest.json erzeugen und in die Beiträge
// einfügen (nach dem ersten Block unter der Überschrift `nach`). Regeln: docs/blog-standard.md.
//
//   GEMINI_API_KEY=… node node_modules/@cw/core/scripts/blog-bilder-erzeugen.mjs   # fehlende erzeugen + einfügen
//   … --nur <datei|slug>        ein Bild bzw. einen Beitrag neu
//   … --nur-einfuegen           nur Markdown, keine Erzeugung
//
// Idempotent: vorhandene Dateien werden nicht neu erzeugt (außer mit --nur), ein Bild, dessen
// Pfad schon im Beitrag steht, wird nicht doppelt eingefügt.
//
// Manifest: { stil, unterschriftScreenshot?, unterschriftFoto?, bilder: [{ slug, nach, datei,
// art: 'ki'|'screenshot'|'foto', prompt? | url? | quelle?, alt, unterschrift? }] }
//   ki          Gemini gemini-2.5-flash-image, Unterschrift „Symbolbild, KI-generiert“ (fest)
//   screenshot  eigene/öffentliche Seite über den gstack-Browser (url, optional element,
//               ausblenden, zuschnitt [x,y,b,h], breite, hoehe)
//   foto        eigenes Foto aus dem Repo (quelle = Pfad relativ zum Repo), nur verkleinert
//
// Herkunft: customer-blitzsicht/scripts (26.09.2026), nach cw-core gehoben mit blitzsicht-ops #894.
import { readFileSync, writeFileSync, existsSync, mkdirSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const UNTERSCHRIFT_KI = 'Symbolbild, KI-generiert';
const MAX_KB = 190; // Perf-Budget-Guard: ≤ 200 KB je dist-Bild
const BROWSE = join(process.env.HOME ?? '', '.claude/skills/gstack/browse/dist/browse');

export const pfad = (b) => `/images/blog/${b.slug}/${b.datei}.webp`;

export function unterschriftVon(b, m = {}) {
  if (b.art === 'ki') return UNTERSCHRIFT_KI; // nicht überschreibbar: Art. 50 AI Act
  if (b.unterschrift) return b.unterschrift;
  if (b.art === 'foto') return m.unterschriftFoto ?? '';
  return m.unterschriftScreenshot ?? '';
}

/** Bild nach dem ersten Block unter der Überschrift einfügen. */
export function einfuegen(text, b, m = {}) {
  const p = pfad(b);
  if (text.includes(p)) return text;
  const zeilen = text.split('\n');
  const h = zeilen.findIndex((z) => z.trimEnd() === b.nach);
  if (h === -1) throw new Error(`${b.slug}: Überschrift fehlt: ${b.nach}`);
  let i = h + 1;
  while (i < zeilen.length && zeilen[i].trim() === '') i++; // Leerzeilen nach der Überschrift
  while (i < zeilen.length && zeilen[i].trim() !== '') i++; // erster Block
  const u = unterschriftVon(b, m);
  const alt = b.alt.replace(/[\[\]]/g, '');
  zeilen.splice(i, 0, '', u ? `![${alt}](${p} "${u.replace(/"/g, '“')}")` : `![${alt}](${p})`);
  return zeilen.join('\n');
}

async function main() {
  const sharp = (await import('sharp')).default;
  const arg = (n) => { const i = process.argv.indexOf(n); return i > -1 ? process.argv[i + 1] : null; };
  const nur = arg('--nur');
  const nurEinfuegen = process.argv.includes('--nur-einfuegen');
  const manifest = arg('--manifest') ?? 'marketing/blog-bilder/manifest.json';
  const blogDir = arg('--blog') ?? 'src/content/blog';
  const m = JSON.parse(readFileSync(manifest, 'utf8'));

  async function alsWebp(buf, ziel) {
    for (const q of [80, 72, 64, 56]) {
      const out = await sharp(buf).rotate().resize({ width: 1200, withoutEnlargement: true }).webp({ quality: q }).toBuffer();
      if (out.length / 1024 <= MAX_KB) { writeFileSync(ziel, out); return { kb: Math.round(out.length / 1024), q }; }
    }
    throw new Error(`${ziel}: auch mit q56 über ${MAX_KB} KB`);
  }

  async function ki(b) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) throw new Error('GEMINI_API_KEY fehlt');
    const body = {
      contents: [{ parts: [{ text: `${b.prompt}. ${m.stil}` }] }],
      generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: '16:9' } },
    };
    for (let versuch = 1; versuch <= 3; versuch++) {
      const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent', {
        method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': key }, body: JSON.stringify(body),
      });
      const j = await r.json();
      const teil = j?.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
      if (teil) return Buffer.from(teil.inlineData.data, 'base64');
      console.warn(`  ${b.datei}: Versuch ${versuch} ohne Bild (${r.status} ${j?.error?.message ?? j?.candidates?.[0]?.finishReason ?? ''})`);
    }
    throw new Error(`${b.datei}: Gemini lieferte kein Bild`);
  }

  async function screenshot(b) {
    if (/\.(png|jpe?g|webp)$/i.test(b.url)) {
      const r = await fetch(b.url);
      if (!r.ok) throw new Error(`${b.url}: HTTP ${r.status}`);
      return Buffer.from(await r.arrayBuffer());
    }
    // gstack-Browser statt Chrome-CLI: Seiten mit Scroll-Animation fotografierte Chrome
    // headless als leere weiße Fläche (gemessen 26.09.2026). Der Browser scrollt wirklich.
    const dir = mkdtempSync('/private/tmp/blogshot-');
    const datei = join(dir, 'shot.png');
    const run = (...a) => execFileSync(BROWSE, a, { stdio: 'pipe' });
    run('viewport', `${b.breite ?? 1280}x${b.hoehe ?? 800}`);
    run('goto', b.url.split('#')[0]);
    run('wait', '--networkidle');
    if (b.element) run('scroll', b.element);
    if (b.ausblenden) run('js', `document.querySelectorAll(${JSON.stringify(b.ausblenden)}).forEach(e => e.style.setProperty('display','none','important'))`);
    run('js', 'new Promise(r => setTimeout(r, 2000))');
    if (b.element) run('screenshot', b.element, datei);
    else run('screenshot', '--viewport', datei);
    let buf = readFileSync(datei);
    if (b.zuschnitt) {
      const [left, top, width, height] = b.zuschnitt;
      buf = await sharp(buf).extract({ left, top, width, height }).toBuffer();
    }
    const { channels } = await sharp(buf).stats();
    if (channels.every((c) => c.stdev < 3)) throw new Error(`${b.url}: Screenshot ist einfarbig — Seite nicht gerendert`);
    return buf;
  }

  function foto(b) {
    if (!b.quelle || !existsSync(b.quelle)) throw new Error(`${b.datei}: Fotoquelle fehlt: ${b.quelle}`);
    if (/RECHTE-OFFEN/i.test(b.quelle)) throw new Error(`${b.quelle}: Bildrechte laut Dateiname ungeklärt`);
    return readFileSync(b.quelle);
  }

  const auswahl = m.bilder.filter((b) => !nur || b.datei === nur || b.slug === nur);
  if (!nurEinfuegen) {
    const offen = auswahl.filter((b) => nur || !existsSync(join('public', pfad(b))));
    console.log(`${offen.length} Bild(er) zu erzeugen`);
    const fehler = [];
    // 4 parallel — Gemini drosselt sonst mit 429.
    for (let i = 0; i < offen.length; i += 4) {
      await Promise.all(offen.slice(i, i + 4).map(async (b) => {
        try {
          mkdirSync(join('public/images/blog', b.slug), { recursive: true });
          const roh = b.art === 'ki' ? await ki(b) : b.art === 'foto' ? foto(b) : await screenshot(b);
          const r = await alsWebp(roh, join('public', pfad(b)));
          console.log(`  ✓ ${pfad(b)}  ${r.kb} KB (q${r.q})`);
        } catch (e) { fehler.push(e.message); console.error(`  ✗ ${e.message}`); }
      }));
    }
    if (fehler.length) { console.error(`${fehler.length} Fehler — Markdown bleibt unverändert`); process.exit(1); }
  }

  const proSlug = Map.groupBy(auswahl, (b) => b.slug);
  for (const [slug, bilder] of proSlug) {
    const f = [join(blogDir, `${slug}.md`), join(blogDir, `${slug}.mdx`)].find(existsSync);
    if (!f) throw new Error(`${slug}: Beitrag fehlt in ${blogDir}`);
    let t = readFileSync(f, 'utf8');
    for (const b of bilder) {
      if (!existsSync(join('public', pfad(b)))) throw new Error(`${pfad(b)} fehlt — erst erzeugen`);
      t = einfuegen(t, b, m);
    }
    writeFileSync(f, t);
  }
  console.log(`✓ ${auswahl.length} Bild(er) in ${proSlug.size} Beitrag/Beiträgen verankert`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
