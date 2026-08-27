#!/usr/bin/env node
/**
 * bildherkunft-durchgang-liste — Freigabedokument zum Verwendungs-Durchgang.
 *
 * Zeigt je Bild, was sich ändert und warum: die alte Einordnung, die neue, die
 * Fundstelle als Nachweis und die Begründung im Volltext. Die Wegfälle stehen oben,
 * denn dort liegt das Risiko — ein Label, das verschwindet, ist die Entscheidung, die
 * geprüft werden muss.
 *
 * Es wird nichts geschrieben und nichts entschieden. Das Dokument ist die Grundlage
 * dafür, dass der Operator entscheidet.
 *
 * Rechtlicher Rahmen: Art. 50 Abs. 4 UAbs. 1 AI Act, Legaldefinition Art. 3 Nr. 60,
 * Auslegung in cw-legal → 04-betroffenheit/D5-art50-reichweite-und-form.md.
 * Keine amtliche Fassung, keine Rechtsberatung.
 *
 * Lauf:
 *   node scripts/bildherkunft-durchgang-liste.mjs --verwendung /tmp/verwendung.json \
 *        --export ~/Downloads/bildherkunft-export.json --out /pfad/liste.html
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ordneEin } from './bildherkunft-einordnen.mjs';
import { registryPfad } from './registry-pfad.mjs';

const REGISTRY = registryPfad();

const argWert = (n, f = null) => {
  const i = process.argv.indexOf(n);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : f;
};

const verwendungDatei = argWert('--verwendung');
const exportDatei = argWert('--export');
const ausgabe = argWert('--out', '/Volumes/SiluriWork/NAS-Spiegel/MEDIEN/CODE/CLAUDE/_review/ki-label-durchgang.html');
for (const [n, v] of [['--verwendung', verwendungDatei], ['--export', exportDatei]]) {
  if (!v || !existsSync(v)) {
    console.error(`Fehlt oder nicht lesbar: ${n}`);
    process.exit(1);
  }
}

const verwendung = JSON.parse(readFileSync(verwendungDatei, 'utf8'));
const exportDaten = JSON.parse(readFileSync(exportDatei, 'utf8'));
const repoPfad = Object.fromEntries(
  JSON.parse(readFileSync(REGISTRY, 'utf8')).customers.map((c) => [c.slug, c.repo_path]),
);

const zuDatei = new Map();
for (const [slug, liste] of Object.entries(exportDaten.sites)) {
  for (const b of liste) zuDatei.set(`${slug}::${b.key}::${b.wert}`, b.datei);
}

const esc = (s) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// --- Daten sammeln ----------------------------------------------------------
const wegfall = [];
const bleibt = [];

for (const [slug, liste] of Object.entries(verwendung.sites)) {
  for (const b of liste) {
    if (b.deepfake_alt !== 'ja') continue;
    const e = ordneEin(slug, b);
    const datei = zuDatei.get(`${slug}::${b.key}::${b.wert}`);
    const repo = repoPfad[slug];
    // Die beiden Deklarationsarten liegen verschieden im Repo, und der Export gibt sie
    // entsprechend verschieden an: `stem` trägt den vollen Pfad ab Repo-Wurzel
    // (src/assets/images/backstube.webp), `pathPrefix` dagegen den Pfad ab public/
    // (images/hero/referenzen.webp). Wer beides gleich behandelt, erzeugt ein
    // Freigabedokument voller leerer Kästchen — geprüft: 54 von 92 Vorschauen fehlten.
    const bildPfad = datei && repo ? (b.key === 'stem' ? join(repo, datei) : join(repo, 'public', datei)) : null;
    const eintrag = { slug, ...b, neu: e.d, grund: e.b, quelle: e.quelle, bildPfad };
    (e.d === 'nein' ? wegfall : bleibt).push(eintrag);
  }
}

const jeSite = (arr) => {
  const m = {};
  for (const x of arr) (m[x.slug] ??= []).push(x);
  return m;
};

// --- Karte ------------------------------------------------------------------
function karte(x, istWegfall) {
  const fund = x.fundstellen?.length
    ? x.fundstellen
        .slice(0, 2)
        .map((f) => `<code>${esc(f.datei)}:${f.zeile}</code>`)
        .join(' · ')
    : '<em>keine Fundstelle — wird nicht eingebunden</em>';
  const bindung =
    x.bindung === 'dynamisch'
      ? '<span class="marke dyn" title="Der Pfad wird im Code zusammengesetzt">zusammengesetzter Pfad</span>'
      : '';
  return `<figure class="${istWegfall ? 'weg' : 'bleibt'}">
  ${x.bildPfad ? `<img loading="lazy" src="${esc(x.bildPfad)}" alt="">` : '<div class="kein-bild">nicht ausgeliefert</div>'}
  <figcaption>
    <div class="wechsel">${istWegfall ? '<b>ja</b> → <b class="neu-nein">nein</b>' : '<b>ja</b> bleibt'}</div>
    <div class="pfad">${esc(x.wert)}</div>
    <div class="meta">${esc(x.kontext)} ${bindung}</div>
    <div class="fund">${fund}</div>
    <details><summary>Begründung</summary><p>${esc(x.grund)}</p>
      <p class="alt"><b>vorher:</b> ${esc(x.begruendung_alt || '—')}</p>
      <p class="alt"><b>Regel:</b> <code>${esc(x.quelle)}</code></p></details>
  </figcaption>
</figure>`;
}

function abschnitt(titel, gruppen, istWegfall, hinweis) {
  const teile = [`<h2>${titel} <span class="zahl">${Object.values(gruppen).flat().length} Bilder</span></h2>`];
  if (hinweis) teile.push(`<p class="hinweis-text">${hinweis}</p>`);
  for (const [slug, arr] of Object.entries(gruppen).sort((a, b) => b[1].length - a[1].length)) {
    teile.push(`<h3>${esc(slug)} <span class="zahl">${arr.length}</span></h3>`);
    teile.push(`<div class="raster">${arr.map((x) => karte(x, istWegfall)).join('\n')}</div>`);
  }
  return teile.join('\n');
}

const stand = new Date(verwendung.stand).toLocaleDateString('de-DE');
const html = `<!doctype html>
<html lang="de"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Durchgang: Einordnung nach Verwendung</title>
<style>
 :root{--fg:#1f2328;--muted:#57606a;--line:#d8dee4;--rot:#cf222e;--ok:#1a7f37;--gelb:#9a6700}
 *{box-sizing:border-box}
 body{margin:0;background:#fbfcfd;color:var(--fg);font:15px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
 header{position:sticky;top:0;z-index:10;background:#fff;border-bottom:1px solid var(--line);padding:.85rem 1.25rem}
 h1{font-size:1.05rem;margin:0 0 .3rem}
 .stand{color:var(--muted);font-size:.85rem;font-variant-numeric:tabular-nums}
 main{max-width:1400px;margin:0 auto;padding:1.25rem}
 .hinweis{background:#fff;border:1px solid var(--line);border-left:3px solid var(--gelb);
   border-radius:.375rem;padding:.9rem 1.1rem;margin-bottom:1.5rem}
 .hinweis p{margin:.45rem 0}
 .bilanz{display:flex;gap:1.5rem;flex-wrap:wrap;margin:.6rem 0 0;font-variant-numeric:tabular-nums}
 .bilanz div{font-size:.9rem}.bilanz b{font-size:1.35rem;display:block}
 h2{font-size:1rem;margin:2rem 0 .5rem;padding-bottom:.35rem;border-bottom:1px solid var(--line);
   display:flex;align-items:center;gap:.75rem}
 h3{font-size:.9rem;margin:1.25rem 0 .5rem;color:var(--muted);font-weight:600}
 .zahl{font-weight:400;color:var(--muted);font-size:.85rem}
 .hinweis-text{color:var(--muted);font-size:.9rem;max-width:70ch;margin:.3rem 0 .8rem}
 .raster{display:grid;grid-template-columns:repeat(auto-fill,minmax(255px,1fr));gap:.9rem}
 figure{margin:0;border:2px solid var(--line);border-radius:.4rem;overflow:hidden;background:#fff}
 figure.weg{border-color:var(--rot)} figure.bleibt{border-color:var(--ok)}
 figure img{display:block;width:100%;height:150px;object-fit:cover;background:#eef1f4}
 .kein-bild{height:150px;display:flex;align-items:center;justify-content:center;
   background:#f6f8fa;color:var(--muted);font-size:.85rem;font-style:italic}
 figcaption{padding:.6rem .7rem;font-size:.82rem}
 .wechsel{font-size:.9rem;margin-bottom:.25rem}
 .neu-nein{color:var(--rot)}
 .pfad{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.76rem;word-break:break-all;color:var(--fg)}
 .meta{color:var(--muted);margin:.3rem 0;font-size:.78rem}
 .marke{display:inline-block;font-size:.68rem;padding:.05rem .35rem;border-radius:.2rem;
   background:#ddf4ff;color:#0969da;border:1px solid #b6e3ff}
 .fund{margin:.3rem 0;font-size:.72rem;color:var(--muted);word-break:break-all}
 .fund code{background:#f6f8fa;padding:.05rem .25rem;border-radius:.2rem}
 details{margin-top:.4rem} summary{cursor:pointer;color:var(--muted);font-size:.78rem}
 details p{margin:.4rem 0;font-size:.79rem;max-width:60ch}
 .alt{color:var(--muted);font-size:.74rem}
 footer{max-width:1400px;margin:2rem auto;padding:0 1.25rem 2rem;color:var(--muted);font-size:.82rem}
 @media (prefers-color-scheme:dark){
   :root{--fg:#e6edf3;--muted:#8b949e;--line:#30363d}
   body{background:#0d1117} header,figure,.hinweis{background:#161b22}
   .fund code,.kein-bild{background:#21262d} .marke{background:#121d2f;border-color:#1f6feb}
 }
</style></head><body>
<header>
  <h1>Durchgang: Einordnung nach Verwendung statt Aussehen</h1>
  <div class="stand">Erhebung ${esc(stand)} · Grundlage: cw-legal D5, Punkt 1 · <b>nichts ist geschrieben</b></div>
</header>
<main>
<div class="hinweis">
  <p><b>Worum es geht.</b> Die bisherige Einordnung stufte Bilder nach ihrem Aussehen ein
  („fotorealistische Szene"). Art. 3 Nr. 60 verlangt zwei Merkmale zusammen: Ähnlichkeit mit
  Wirklichem <i>und</i> die Eignung, fälschlich als echt zu gelten. Ob das zweite Merkmal
  vorliegt, entscheidet die <b>Verwendung</b> — dasselbe Bild ist unter „Unser Team" eine
  Tatsachenbehauptung und in einer Leistungsliste ein Symbol.</p>
  <p><b>Was zu prüfen ist.</b> Die roten Karten sind die Entscheidungen: dort verschwindet
  ein Label. Jede trägt die Fundstelle, an der das Bild eingebunden ist, und die Begründung.
  Die grünen bleiben unverändert pflichtig und sind nur zur Kontrolle da.</p>
  <p><b>Grenze.</b> Es gibt zu Art. 50 keine Rechtsprechung; D5 benennt drei Stellen, an denen
  die Auslegung kippen könnte. Wo eine Pflicht verneint wird, ist das eine begründete Wette,
  keine gesicherte Auskunft.</p>
  <div class="bilanz">
    <div><b>${wegfall.length + bleibt.length}</b>geprüft</div>
    <div><b style="color:var(--rot)">${wegfall.length}</b>Label fällt weg</div>
    <div><b style="color:var(--ok)">${bleibt.length}</b>bleibt pflichtig</div>
  </div>
</div>
${abschnitt('Label fällt weg — hier liegt die Entscheidung', jeSite(wegfall), true,
  'Diese Bilder illustrieren eine Leistungsart, ein Thema oder werden gar nicht ausgeliefert. Sie behaupten nichts Bestimmtes über den jeweiligen Betrieb.')}
${abschnitt('Bleibt kennzeichnungspflichtig', jeSite(bleibt), false,
  'Benannte Orte, eigene Räume und Erzeugnisse, Personen, ausgeführte Projekte — und die Titelbilder der Startseiten, die beim Teilen ihren Kontext verlieren.')}
</main>
<footer>
  Erzeugt von <code>cw-core/scripts/bildherkunft-durchgang-liste.mjs</code>.
  Momentaufnahme — verbindlich sind die Quelldateien. Bei Änderungen neu erzeugen, nicht nachpflegen.<br>
  Rechtstext im Spiegel: <code>cw-recht → texte/eu/ai-act/ai-act.md</code>, Artikel 50.
  Keine amtliche Fassung, keine Rechtsberatung.
</footer>
</body></html>`;

writeFileSync(ausgabe, html, 'utf8');
console.log(`Geschrieben: ${ausgabe}`);
console.log(`  Wegfaelle: ${wegfall.length} · bleibt pflichtig: ${bleibt.length}`);
