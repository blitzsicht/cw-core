#!/usr/bin/env node
/**
 * bildherkunft-arbeitsliste — Kontaktbogen zum Einordnen des Bildbestands.
 *
 * Erzeugt EINE HTML-Datei, in der die Bilder der Flotte nach Risiko sortiert stehen,
 * mit Vorschau. Wer sie durchklickt, bekommt je Site die fertige `bildHerkunft`-Erklärung
 * zum Einsetzen in `site-data.ts`.
 *
 * Warum von Hand und nicht automatisch: Einem Bild sieht der Code seine Herkunft nicht an.
 * Gemessen am 24.08.2026 trägt kein einziges Bild der Live-Flotte einen KI-Herkunftsmarker
 * (0 von 54 Stichproben) — `astro:assets` (sharp) strippt EXIF beim Transform. Ein Detektor
 * über metadatenfreie Bilder würde raten und dabei grün melden. Die Herkunft kommt von dem,
 * der die Bilder beauftragt hat; dieses Werkzeug macht das Eintragen erträglich.
 *
 * Rechtlicher Rahmen: Art. 50 Abs. 4 UAbs. 1 AI Act, Legaldefinition Art. 3 Nr. 60.
 * Volltext: `cw-recht: texte/eu/ai-act/ai-act.md`. Keine amtliche Fassung, keine Rechtsberatung.
 *
 * Lauf:
 *   node scripts/bildherkunft-arbeitsliste.mjs                     # alle live-Sites
 *   node scripts/bildherkunft-arbeitsliste.mjs --site soleno       # eine Site
 *   node scripts/bildherkunft-arbeitsliste.mjs --lifecycle internal
 *   node scripts/bildherkunft-arbeitsliste.mjs --out /pfad/liste.html --no-open
 */

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, dirname, basename, sep, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { TAG_DENY_RE } from '../src/integrations/ai-discovery/geotag-core.js';
import { registryPfad } from './registry-pfad.mjs';

const REGISTRY = registryPfad();
const BILD_EXT = /\.(webp|png|jpe?g|avif|gif)$/i;
const REVIEW_DIR = '/Volumes/SiluriWork/NAS-Spiegel/MEDIEN/CODE/CLAUDE/_review';

/**
 * Vorbefund aus dem Sichtdurchgang vom 24.08.2026 (14 Kontaktbögen über alle 262 Bilder).
 *
 * Zweck: nicht 262 Entscheidungen vorlegen, wo 111 genügen. Zwei Klassen sind ohne
 * Rückfrage bestimmbar —
 *   grafik: Logo, Piktogramm, Textkarte, Diagramm, Screenshot, freigestellter Produktschuss.
 *           Aehnelt nichts Wirklichem, kann also kein Deepfake sein; die Herkunft ist für
 *           Art. 50 Abs. 4 UAbs. 1 dort ohne Belang.
 *   foto:   wirkt wie eine echte Aufnahme realer Personen oder Orte.
 *
 * Der Unterschied in der Verbindlichkeit ist Absicht: „grafik" folgt aus dem, was zu sehen
 * ist. „foto" ist eine Vermutung über die Entstehung — und liegt sie falsch, fehlt am Ende
 * eine Kennzeichnung. Deshalb wird sie in der Seite als bestaetigungsbeduerftig ausgewiesen
 * und nie stillschweigend uebernommen.
 */
const VORSCHLAEGE = (() => {
  const datei = join(dirname(fileURLToPath(import.meta.url)), 'bildherkunft-vorschlaege.json');
  try { return JSON.parse(readFileSync(datei, 'utf8')); }
  catch { return {}; }
})();

/**
 * Ordner, in denen das Merkmal „ähnelt wirklichen Personen/Orten/Ereignissen und würde
 * fälschlich als echt erscheinen" (Art. 3 Nr. 60) am ehesten greift. Die Reihenfolge ist
 * eine Arbeitshilfe, keine Rechtsaussage — sie entscheidet nur, was zuerst auf dem Tisch
 * liegt, damit die Einordnung dort anfängt, wo sie am meisten wert ist.
 */
const RISIKO = [
  [/team|mitarbeit|person|portrait|portr|über-uns|about|crew|mensch|kunde|referenz/i, 0],
  [/hero|header|banner|start|titel/i, 1],
  [/projekt|galerie|gallery|arbeit|vorher|nachher|objekt|standort|filiale|laden/i, 2],
  [/produkt|leistung|service|detail/i, 3],
];

function risiko(pfad) {
  for (const [re, rang] of RISIKO) if (re.test(pfad)) return rang;
  return 4;
}

const RISIKO_TEXT = [
  'Personen — hier greift die Deepfake-Frage am ehesten',
  'Hero/Header — großflächig, wirkt als Aufnahme',
  'Projekte/Objekte — zeigt vermeintlich Reales',
  'Produkt/Leistung — oft illustrativ',
  'Sonstige',
];

function argWert(name, fallback = null) {
  const i = process.argv.indexOf(name);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const hatFlag = (n) => process.argv.includes(n);

/** Bilder unter einem Verzeichnis einsammeln, Nicht-Inhalt ausgeschlossen. */
function sammleBilder(wurzel, unterordner) {
  const treffer = [];
  const start = join(wurzel, unterordner);
  if (!existsSync(start)) return treffer;

  const lauf = (dir) => {
    for (const eintrag of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, eintrag.name);
      if (eintrag.isDirectory()) {
        if (eintrag.name === 'node_modules' || eintrag.name.startsWith('.')) continue;
        lauf(p);
        continue;
      }
      if (!BILD_EXT.test(eintrag.name)) continue;
      // Zwei Adressierungen, je nach Herkunftsordner:
      //   public/  → dist-relativer Pfad (`public/images/a.webp` wird zu `images/a.webp`)
      //   src/     → Stem, weil die Astro-Assetpipeline einen Content-Hash anhaengt
      //              (`hero.webp` → `_astro/hero.Bng-bGX1.webp`); ein Pfad-Präfix traefe
      //              das nie. Genau dort liegen die heikelsten Motive.
      const relZumOrdner = relative(start, p).split(sep).join('/');
      const distRel = unterordner === 'public' ? relZumOrdner : null;
      const stem = unterordner === 'public' ? null : basename(p).split('.')[0];
      // Dieselbe Ausschlussliste wie die Tag-Pipeline: og-Karten, Icons, Favicons,
      // Newsletter- und Social-Assets tragen keinen fotografischen Inhalt.
      if (distRel && TAG_DENY_RE.test(distRel)) continue;
      if (!distRel && TAG_DENY_RE.test(relZumOrdner)) continue;
      treffer.push({
        datei: p,
        distRel,
        stem,
        anzeige: `${unterordner}/${relZumOrdner}`,
        ordner: dirname(relZumOrdner).split(sep).join('/'),
        groesse: statSync(p).size,
      });
    }
  };
  lauf(start);
  return treffer;
}

/**
 * Die Sites, deren Bildbestand erhoben werden soll.
 *
 * ## Warum hier gefiltert wird, und wonach
 *
 * Ein Bild in einem Repo ist keine Fundstelle. Die Pflicht aus Art. 50 Abs. 4 trifft den,
 * der den Inhalt **ausliefert** — liegt das Bild in einem Repo, das nirgends deployt ist,
 * entsteht sie nicht. Ohne diese Unterscheidung meldet das Werkzeug Arbeit, die es nicht
 * gibt, und die Zahl wandert von Bericht zu Bericht weiter.
 *
 * Gemessen am 28.08.2026: `--lifecycle archived` meldete **44 Bilder auf 7 Sites** —
 * keine einzige davon lief auf unserem Stack. `weinkontor-sinzing.de` liefert Magento,
 * `itk-regensburg.de` den One.com-Editor, `herztoene-ev.de` Joomla, `braustall.de`
 * scheitert am Zertifikat, `allstargirls.de` antwortet 503. Die Vercel-Projekte aller
 * sieben wurden am 13./14.08.2026 geloescht; die Repos sind Archive.
 *
 * Zwei Filter, bewusst unterschiedlich scharf:
 *
 * 1. **`active === false` uebergeht die Site.** Das ist eine Entscheidung, die in der
 *    Registry schon getroffen wurde — sie hier zu ignorieren hiesse, sie zu unterlaufen.
 * 2. **`lifecycle: 'archived'` warnt nur.** Wer sie ausdruecklich anfordert, soll sie
 *    bekommen; nicht jede archivierte Site ist fremdbetrieben, und ein stilles
 *    Ueberspringen waere derselbe Fehler mit umgekehrtem Vorzeichen.
 *
 * Die Stack-Pruefung selbst steht absichtlich **nicht** hier drin: sie braucht je Site
 * einen Netzabruf und macht ein Erhebungswerkzeug langsam und flaky. Die Warnung nennt
 * stattdessen den Einzeiler, der sie beantwortet.
 */
function ladeSites() {
  const reg = JSON.parse(readFileSync(REGISTRY, 'utf8'));
  const lifecycle = argWert('--lifecycle', 'live');
  const nurSite = argWert('--site');
  const gewaehlt = reg.customers
    .filter((c) => c.lifecycle === lifecycle)
    .filter((c) => !nurSite || c.slug === nurSite);

  const sites = gewaehlt
    .filter((c) => {
      if (c.active !== false) return true;
      const grund = ersterSatz(c.lifecycle_note) || 'in der Registry auf active: false gesetzt';
      console.warn(`  ! ${c.slug}: nicht aktiv — übersprungen (${grund})`);
      return false;
    })
    .map((c) => ({ slug: c.slug, pfad: c.repo_path, url: c.production_url }))
    .filter((c) => {
      if (c.pfad && existsSync(c.pfad)) return true;
      console.warn(`  ! ${c.slug}: repo_path fehlt oder existiert nicht — übersprungen`);
      return false;
    });

  if (lifecycle === 'archived' && sites.length) {
    console.warn(
      `\n  ACHTUNG: ${sites.length} archivierte Site(s). Archiviert heisst nicht ausgeliefert —\n` +
        '  am 28.08.2026 lief keine der archivierten Sites auf unserem Stack. Ohne Auslieferung\n' +
        '  entsteht keine Pflicht aus Art. 50 Abs. 4. Vor dem Einordnen je Site pruefen:\n' +
        '    curl -sL <production_url> | grep -c "_astro/"   # 0 = nicht unser Build\n',
    );
  }
  return sites;
}

/**
 * Der erste Satz einer Registry-Notiz — als Grund fuer eine Uebersprungen-Meldung.
 * Die Notizen sind mehrere Zeilen lang; ungekuerzt waere die Meldung unlesbar.
 * @param {unknown} text
 * @returns {string}
 */
function ersterSatz(text) {
  if (typeof text !== 'string') return '';
  const satz = text.replace(/\s+/g, ' ').trim().split(/(?<=\.)\s/)[0] ?? '';
  return satz.length > 120 ? satz.slice(0, 117) + '…' : satz;
}

/**
 * Einen String als einfach gequotetes JS-Literal ausgeben.
 *
 * Die Begründung kommt aus einem `<textarea>`: sie kann Zeilenumbrüche, Apostrophe und
 * Backslashes enthalten. Ein naives `'` + text + `'` erzeugt daraus eine `site-data.ts`,
 * die nicht mehr parst — und das fällt erst beim Build des Kunden auf, nicht beim
 * Einsetzen. Zeilenumbrueche werden zu `\n`, nicht zu echten Umbruechen.
 */
export function alsLiteral(text) {
  return "'" + String(text ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\r\n?|\n/g, '\\n') + "'";
}

/**
 * Eine Deklarationszeile aus einer Einordnung bauen.
 * @param {'pathPrefix'|'stem'} key
 * @param {string} wert
 * @param {{h: string, d?: string, b?: string}} e  Einordnung aus der Arbeitsliste
 */
export function regelZeile(key, wert, e) {
  // Die Einordnung gehört an jede Regel, deren Herkunft die Deepfake-Frage offen lässt —
  // also bei ki-* UND bei ungeklaert. Der zweite Fall ist der haeufige: Logos, Piktogramme
  // und Produktfreisteller, bei denen die Herkunft unbekannt bleibt, die Frage aber
  // trotzdem verneint werden kann. Nur `mensch` trägt sie nicht, dort wäre sie redundant.
  const brauchtEinordnung = e.h === 'ki-erzeugt' || e.h === 'ki-veraendert' || e.h === 'ungeklaert';
  const teile = [key + ': ' + alsLiteral(wert), 'herkunft: ' + alsLiteral(e.h)];
  if (brauchtEinordnung) {
    teile.push('deepfake: ' + alsLiteral(e.d));
    teile.push('begruendung: ' + alsLiteral(e.b));
  }
  return '  { ' + teile.join(', ') + ' },';
}

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ---------------------------------------------------------------------------

// Nur beim direkten Aufruf laufen — damit die reinen Helfer (alsLiteral, regelZeile)
// importiert und getestet werden können, ohne dass die Flotte gescannt wird.
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const sites = ladeSites();
  if (!sites.length) {
    console.error('Keine Sites gefunden. --site/--lifecycle prüfen.');
    process.exit(1);
  }

  const daten = [];
  let gesamt = 0;
  let ohneStabil = 0;

  for (const s of sites) {
    const bilder = [...sammleBilder(s.pfad, 'public'), ...sammleBilder(s.pfad, 'src')];
    bilder.sort((a, b) => risiko(a.anzeige) - risiko(b.anzeige) || a.anzeige.localeCompare(b.anzeige));
    gesamt += bilder.length;
    ohneStabil += bilder.filter((b) => !b.distRel && !b.stem).length;
    daten.push({ ...s, bilder });
    console.log(`  ${s.slug.padEnd(24)} ${String(bilder.length).padStart(4)} Bilder`);
  }

  console.log(`\n  Summe: ${gesamt} Bilder auf ${daten.length} Sites` +
    (ohneStabil ? ` (${ohneStabil} ohne stabilen Bezug — bitte prüfen)` : ''));

  // Ein Stem adressiert ein Bild über den blossen Dateinamen. Kommt er innerhalb einer Site
  // zweimal vor, haengt die Auflösung von der Reihenfolge im Array ab — das fällt später
  // niemandem auf, deshalb hier melden, wo es noch billig zu beheben ist.
  for (const s of daten) {
    const zaehler = new Map();
    for (const b of s.bilder) if (b.stem) zaehler.set(b.stem, (zaehler.get(b.stem) ?? 0) + 1);
    const doppelt = [...zaehler].filter(([, n]) => n > 1).map(([k]) => k);
    if (doppelt.length) console.warn(`  ! ${s.slug}: mehrdeutige Stems — ${doppelt.join(', ')}`);
  }

  const stand = execFileSync('date', ['+%d.%m.%Y %H:%M']).toString().trim();
  // Nicht ins aktuelle Verzeichnis: das ist beim Aufruf aus dem Repo heraus der Repo-Baum,
  // und ein 80-KB-Arbeitsdokument mit absoluten Bildpfaden gehört dort nicht hin. `_review/`
  // ist der eingerichtete Ort für Operator-Lesedokumente. Ein fester Name statt eines
  // datierten: die Seite hält den Zwischenstand im localStorage, und der haengt am Pfad —
  // ein neuer Dateiname am nächsten Tag würde die halbe Einordnung unsichtbar machen.
  const ziel = argWert('--out', join(REVIEW_DIR, 'bildherkunft-arbeitsliste.html'));

  const nutzdaten = daten.map((s) => ({
    slug: s.slug,
    url: s.url,
    bilder: s.bilder.map((b) => ({
      datei: b.datei,
    vorschlag: VORSCHLAEGE[s.slug + '::' + b.anzeige] || null,
      distRel: b.distRel,
      stem: b.stem,
      anzeige: b.anzeige,
      ordner: b.ordner,
      rang: risiko(b.anzeige),
    })),
  }));

  writeFileSync(ziel, seite(nutzdaten, stand, gesamt), 'utf8');
  console.log(`\n  → ${ziel}`);

  if (!hatFlag('--no-open')) {
    try {
      execFileSync('open', [ziel]);
    } catch {
      console.log('  (konnte nicht automatisch geöffnet werden)');
    }
  }
}

// ---------------------------------------------------------------------------

function seite(sites, stand, gesamt) {
  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Bild-Herkunft einordnen — ${gesamt} Bilder</title>
<style>
  :root { --bg:#fbfcfd; --fg:#1f2328; --muted:#57606a; --line:#d8dee4; --akzent:#0969da;
          --ki:#8250df; --pflicht:#cf222e; --ok:#1a7f37; }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--fg); font:15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }
  header { position:sticky; top:0; z-index:10; background:#fff; border-bottom:1px solid var(--line);
           padding:.85rem 1.25rem; display:flex; gap:1.25rem; align-items:center; flex-wrap:wrap; }
  h1 { font-size:1.05rem; margin:0; }
  .fortschritt { font-variant-numeric:tabular-nums; color:var(--muted); }
  .fortschritt b { color:var(--fg); }
  main { padding:1.25rem; max-width:1400px; margin:0 auto; }
  .hinweis { background:#fff; border:1px solid var(--line); border-left:3px solid var(--akzent);
             border-radius:.375rem; padding:.85rem 1rem; margin-bottom:1.5rem; }
  .hinweis p { margin:.4rem 0; }
  .hinweis code { background:#eef1f4; padding:.1em .35em; border-radius:.2em; font-size:.9em; }
  section.site { background:#fff; border:1px solid var(--line); border-radius:.5rem; margin-bottom:1.25rem; overflow:hidden; }
  .site-kopf { display:flex; align-items:center; gap:.75rem; padding:.75rem 1rem; border-bottom:1px solid var(--line);
               background:#f6f8fa; cursor:pointer; }
  .site-kopf h2 { font-size:1rem; margin:0; flex:1; }
  .site-kopf .zahl { color:var(--muted); font-size:.85rem; font-variant-numeric:tabular-nums; }
  .ordner { border-bottom:1px solid #eef1f4; padding:.75rem 1rem; }
  .ordner:last-child { border-bottom:0; }
  .ordner-kopf { display:flex; align-items:center; gap:.6rem; flex-wrap:wrap; margin-bottom:.6rem; }
  .ordner-kopf strong { font-size:.9rem; }
  .rang { font-size:.72rem; padding:.1rem .45rem; border-radius:1rem; background:#eef1f4; color:var(--muted); }
  .rang[data-r="0"] { background:#ffebe9; color:var(--pflicht); }
  .rang[data-r="1"] { background:#fff4e6; color:#9a6700; }
  .raster { display:grid; grid-template-columns:repeat(auto-fill,minmax(160px,1fr)); gap:.75rem; }
  figure { margin:0; border:1px solid var(--line); border-radius:.375rem; overflow:hidden; background:#fff; }
  figure.gesetzt { border-color:var(--ok); }
  figure.pflicht { border-color:var(--pflicht); box-shadow:0 0 0 1px var(--pflicht); }
  figure img { display:block; width:100%; height:110px; object-fit:cover; background:#eef1f4; }
  figcaption { padding:.4rem .5rem; font-size:.72rem; color:var(--muted); word-break:break-all; }
  .wahl { display:flex; gap:.2rem; padding:0 .5rem .5rem; }
  .wahl button { flex:1; font:inherit; font-size:.7rem; padding:.25rem .1rem; border:1px solid var(--line);
                 background:#fff; border-radius:.25rem; cursor:pointer; }
  .wahl button[aria-pressed="true"] { background:var(--fg); color:#fff; border-color:var(--fg); }
  .wahl button[data-w^="ki"][aria-pressed="true"] { background:var(--ki); border-color:var(--ki); }
  .df { padding:0 .5rem .5rem; display:none; }
  figure[data-ki="1"] .df { display:block; }
  .df p { margin:0 0 .3rem; font-size:.68rem; color:var(--muted); }
  .df-wahl { display:flex; gap:.2rem; margin-bottom:.3rem; }
  .df-wahl button { flex:1; font:inherit; font-size:.7rem; padding:.2rem; border:1px solid var(--line);
                    background:#fff; border-radius:.25rem; cursor:pointer; }
  .df-wahl button[aria-pressed="true"][data-d="ja"] { background:var(--pflicht); color:#fff; border-color:var(--pflicht); }
  .df-wahl button[aria-pressed="true"][data-d="nein"] { background:var(--ok); color:#fff; border-color:var(--ok); }
  .df textarea { width:100%; font:inherit; font-size:.7rem; border:1px solid var(--line); border-radius:.25rem;
                 padding:.25rem; resize:vertical; min-height:2.4rem; }
  .df textarea.fehlt { border-color:var(--pflicht); background:#fff8f8; }
  .vs { margin:0 .5rem .35rem; font-size:.66rem; padding:.15rem .4rem; border-radius:.2rem;
        border:1px dashed var(--line); color:var(--muted); text-align:center; }
  .vs--grafik { border-color:#8250df55; color:#8250df; }
  .vs--foto { border-color:#1a7f3755; color:#1a7f37; }
  figure.gesetzt .vs, figure.pflicht .vs { display:none; }
  .sammel { display:flex; gap:.3rem; flex-wrap:wrap; }
  .sammel button { font:inherit; font-size:.72rem; padding:.2rem .5rem; border:1px solid var(--line);
                   background:#fff; border-radius:.25rem; cursor:pointer; }
  .sammel button:hover { background:#f6f8fa; }
  .ausgabe { padding:1rem; background:#f6f8fa; border-top:1px solid var(--line); }
  .ausgabe button { font:inherit; padding:.4rem .8rem; border:1px solid var(--line); background:#fff;
                    border-radius:.3rem; cursor:pointer; font-weight:600; }
  .ausgabe pre { margin:.6rem 0 0; background:#fff; border:1px solid var(--line); border-radius:.3rem;
                 padding:.7rem; font-size:.75rem; overflow:auto; max-height:22rem; white-space:pre; }
  .zu .ordner, .zu .ausgabe { display:none; }
  .filter { margin-left:auto; display:flex; gap:.75rem; align-items:center; font-size:.85rem; }
  .filter button { font:inherit; font-size:.85rem; font-weight:600; padding:.3rem .7rem;
                   border:1px solid var(--fg); background:var(--fg); color:#fff;
                   border-radius:.3rem; cursor:pointer; }
  .filter button:disabled { opacity:.4; cursor:default; }
</style>
</head>
<body>
<header>
  <h1>Bild-Herkunft einordnen</h1>
  <span class="fortschritt"><b id="fz">0</b> / ${gesamt} eingeordnet · <b id="fp">0</b> kennzeichnungspflichtig · <b id="fo">0</b> offen</span>
  <span class="filter">
    <label><input type="checkbox" id="nurOffen"> nur Offene zeigen</label>
    <button id="vorschlaege" title="Setzt den Sichtbefund vom 24.08. — nur auf Bilder, die du noch nicht selbst eingeordnet hast. Deine Eintraege bleiben unangetastet.">Vorschläge setzen</button>
    <button id="export" title="Speichert die gesamte Einordnung als JSON — daraus schreibt das Übernahme-Skript die Deklarationen in die Kundenrepos.">Alles exportieren</button>
  </span>
</header>
<main>
  <div class="hinweis">
    <p><strong>Was hier entschieden wird.</strong> Art. 50 Abs. 4 UAbs. 1 AI Act verlangt eine Offenlegung
    nur für KI-Bilder, die ein <em>Deepfake</em> sind. Die Legaldefinition (Art. 3 Nr. 60) verlangt
    <strong>zwei Merkmale zusammen</strong>: der Inhalt ähnelt wirklichen Personen, Gegenständen, Orten,
    Einrichtungen oder Ereignissen — <strong>und</strong> er würde einer Person fälschlicherweise als echt
    oder wahrheitsgemäß erscheinen.</p>
    <p>Ein erkennbar illustratives Rendering erfüllt das nicht. Ein fotorealistisches „Team in der Werkstatt“
    ohne echtes Team erfüllt es. Ein KI-hochskaliertes Foto einer echten Szene ebenfalls nicht — es zeigt ja,
    was war.</p>
    <p><strong>Die Begründung ist der Nachweis</strong>, gerade beim „Nein“: darauf beruht der Verzicht auf
    die Kennzeichnung. Sie wandert mit in die Deklaration.</p>
    <p>Die Einordnung wird im Browser gespeichert (localStorage) — du kannst zwischendurch aufhören.
    Am Ende je Site <code>Deklaration kopieren</code> und in <code>src/data/site-data.ts</code> einsetzen.</p>
    <p style="color:var(--muted);font-size:.85rem">Stand ${esc(stand)} · Momentaufnahme des Dateibestands.
    Keine amtliche Fassung, keine Rechtsberatung.</p>
  </div>
  <div id="sites"></div>
</main>
<script>
${alsLiteral.toString().replace(/^export /, '')}
${regelZeile.toString().replace(/^export /, '')}
const SITES = ${JSON.stringify(sites)};
const RISIKO_TEXT = ${JSON.stringify(RISIKO_TEXT)};
const KEY = 'bildherkunft-v1';
const state = JSON.parse(localStorage.getItem(KEY) || '{}');

const sichern = () => localStorage.setItem(KEY, JSON.stringify(state));
const eintrag = (slug, p) => state[slug + '::' + p] || null;
const setzen = (slug, p, wert) => {
  const k = slug + '::' + p;
  if (!wert) delete state[k]; else state[k] = { ...(state[k]||{}), ...wert };
  sichern();
};

function istKi(e) { return e && (e.h === 'ki-erzeugt' || e.h === 'ki-veraendert'); }
function istFertig(e) {
  if (!e || !e.h) return false;
  if (!istKi(e)) return true;
  if (e.d !== 'ja' && e.d !== 'nein') return false;
  return !!(e.b && e.b.trim());
}
function istPflicht(e) { return istKi(e) && e.d === 'ja'; }

function bauen() {
  const wurzel = document.getElementById('sites');
  wurzel.innerHTML = '';
  for (const s of SITES) {
    const sec = document.createElement('section');
    sec.className = 'site';
    const ordner = {};
    for (const b of s.bilder) (ordner[b.ordner] ||= []).push(b);

    let html = '<div class="site-kopf"><h2>' + s.slug + '</h2>' +
      '<span class="zahl" data-zahl="' + s.slug + '"></span></div>';

    for (const [name, bilder] of Object.entries(ordner).sort((a,b) => a[1][0].rang - b[1][0].rang)) {
      const rang = bilder[0].rang;
      html += '<div class="ordner" data-ordner="' + name + '">' +
        '<div class="ordner-kopf"><strong>' + (name === '.' ? '(Wurzel)' : name) + '</strong>' +
        '<span class="rang" data-r="' + rang + '">' + RISIKO_TEXT[rang] + '</span>' +
        '<span class="sammel">' +
          '<button data-sammel="mensch">alle: Foto</button>' +
          '<button data-sammel="ki-erzeugt">alle: KI erzeugt</button>' +
          '<button data-sammel="ki-veraendert">alle: KI bearbeitet</button>' +
        '</span></div><div class="raster">';
      for (const b of bilder) {
        const p = b.distRel || b.anzeige;
        html += '<figure data-slug="' + s.slug + '" data-p="' + p.replace(/"/g,'&quot;') + '"' +
          ' data-key="' + (b.distRel ? 'pathPrefix' : 'stem') + '"' +
          ' data-wert="' + (b.distRel || b.stem || '').replace(/"/g,'&quot;') + '"' +
          (b.vorschlag ? ' data-vorschlag="' + JSON.stringify(b.vorschlag).replace(/"/g,'&quot;') + '"' : '') + '>' +
          '<img loading="lazy" src="' + b.datei.replace(/"/g,'&quot;') + '" alt="">' +
          '<figcaption>' + b.anzeige.split('/').pop() +
            (b.distRel ? '' : ' <em>(über Stem)</em>') + '</figcaption>' +
          '<div class="wahl">' +
            '<button data-w="mensch">Foto</button>' +
            '<button data-w="ki-erzeugt">KI</button>' +
            '<button data-w="ki-veraendert">KI bearb.</button>' +
          '</div>' +
          (b.vorschlag ? '<div class="vs vs--' + b.vorschlag.art + '">' +
             (b.vorschlag.art === 'grafik' ? 'Grafik — keine Pflicht' : 'wirkt wie echtes Foto') +
             '</div>' : '') +
          '<div class="df"><p>Wirkt es fälschlich als echte Aufnahme?</p>' +
            '<div class="df-wahl"><button data-d="ja">Ja → kennzeichnen</button>' +
            '<button data-d="nein">Nein</button></div>' +
            '<textarea placeholder="Begründung (Pflicht) …"></textarea></div>' +
          '</figure>';
      }
      html += '</div></div>';
    }
    html += '<div class="ausgabe"><button data-kopieren="' + s.slug + '">Deklaration kopieren</button>' +
      '<pre data-pre="' + s.slug + '" hidden></pre></div>';
    sec.innerHTML = html;
    wurzel.appendChild(sec);
  }
  alleZeichnen();
}

function figZeichnen(fig) {
  const slug = fig.dataset.slug, p = fig.dataset.p;
  const e = eintrag(slug, p);
  fig.querySelectorAll('.wahl button').forEach(b =>
    b.setAttribute('aria-pressed', String(!!e && e.h === b.dataset.w)));
  fig.dataset.ki = istKi(e) ? '1' : '0';
  fig.querySelectorAll('.df-wahl button').forEach(b =>
    b.setAttribute('aria-pressed', String(!!e && e.d === b.dataset.d)));
  const ta = fig.querySelector('textarea');
  if (document.activeElement !== ta) ta.value = (e && e.b) || '';
  ta.classList.toggle('fehlt', istKi(e) && (e.d === 'ja' || e.d === 'nein') && !ta.value.trim());
  fig.classList.toggle('gesetzt', istFertig(e));
  fig.classList.toggle('pflicht', istPflicht(e));
}

function alleZeichnen() {
  let fertig = 0, pflicht = 0, gesamt = 0;
  const jeSite = {};
  document.querySelectorAll('figure').forEach(fig => {
    figZeichnen(fig);
    const e = eintrag(fig.dataset.slug, fig.dataset.p);
    gesamt++;
    jeSite[fig.dataset.slug] ||= { f: 0, g: 0 };
    jeSite[fig.dataset.slug].g++;
    if (istFertig(e)) { fertig++; jeSite[fig.dataset.slug].f++; }
    if (istPflicht(e)) pflicht++;
  });
  document.getElementById('fz').textContent = fertig;
  document.getElementById('fp').textContent = pflicht;
  document.getElementById('fo').textContent = gesamt - fertig;
  for (const [slug, z] of Object.entries(jeSite)) {
    const el = document.querySelector('[data-zahl="' + slug + '"]');
    if (el) el.textContent = z.f + ' / ' + z.g + ' eingeordnet';
  }
  filtern();
}

function filtern() {
  const nur = document.getElementById('nurOffen').checked;
  document.querySelectorAll('figure').forEach(fig => {
    const e = eintrag(fig.dataset.slug, fig.dataset.p);
    fig.style.display = (nur && istFertig(e)) ? 'none' : '';
  });
  document.querySelectorAll('.ordner').forEach(o => {
    const sichtbar = [...o.querySelectorAll('figure')].some(f => f.style.display !== 'none');
    o.style.display = sichtbar ? '' : 'none';
  });
}

function deklaration(slug) {
  const zeilen = [];
  let offen = 0;
  document.querySelectorAll('figure[data-slug="' + slug + '"]').forEach(fig => {
    const p = fig.dataset.p;
    const e = eintrag(slug, p);
    if (!istFertig(e)) { offen++; return; }
    const wert = fig.dataset.wert;
    if (!wert) return; // kein stabiler Bezug — wäre eine Regel, die nie greift
    zeilen.push(regelZeile(fig.dataset.key, wert, e));
  });
  const kopf = [
    '// Bild-Herkunft nach Art. 50 Abs. 4 UAbs. 1 AI Act — eingeordnet am ' +
      new Date().toLocaleDateString('de-DE') + '.',
    '// Regeln sind PRO BILD, nicht pro Ordner: ein neu hinzugefuegtes Bild wird dadurch',
    '// ungeklaert und fällt dem Guard auf, statt still unter eine Ordnerregel zu rutschen.',
    '// pathPrefix = Bild aus public/ (dist-relativer Pfad).',
    '// stem       = Bild aus src/assets/ (Astro haengt einen Content-Hash an).',
  ];
  if (offen) kopf.push('// ACHTUNG: ' + offen + ' Bild(er) dieser Site sind noch nicht eingeordnet.');
  return kopf.join('\\n') + '\\nbildHerkunft: [\\n' + zeilen.join('\\n') + '\\n],';
}

document.addEventListener('click', (ev) => {
  const w = ev.target.closest('.wahl button');
  if (w) {
    const fig = w.closest('figure');
    const e = eintrag(fig.dataset.slug, fig.dataset.p);
    const neu = (e && e.h === w.dataset.w) ? null : { h: w.dataset.w };
    setzen(fig.dataset.slug, fig.dataset.p, neu);
    return alleZeichnen();
  }
  const d = ev.target.closest('.df-wahl button');
  if (d) {
    const fig = d.closest('figure');
    setzen(fig.dataset.slug, fig.dataset.p, { d: d.dataset.d });
    return alleZeichnen();
  }
  const s = ev.target.closest('[data-sammel]');
  if (s) {
    const ordner = s.closest('.ordner');
    ordner.querySelectorAll('figure').forEach(fig =>
      setzen(fig.dataset.slug, fig.dataset.p, { h: s.dataset.sammel }));
    return alleZeichnen();
  }
  const k = ev.target.closest('[data-kopieren]');
  if (k) {
    const txt = deklaration(k.dataset.kopieren);
    const pre = document.querySelector('[data-pre="' + k.dataset.kopieren + '"]');
    pre.textContent = txt; pre.hidden = false;
    navigator.clipboard.writeText(txt).then(
      () => { k.textContent = 'kopiert ✓'; setTimeout(() => k.textContent = 'Deklaration kopieren', 1600); },
      () => { k.textContent = 'unten markieren und kopieren'; });
    return;
  }
  const kopf = ev.target.closest('.site-kopf');
  if (kopf) kopf.parentElement.classList.toggle('zu');
});

document.addEventListener('input', (ev) => {
  if (ev.target.tagName !== 'TEXTAREA') return;
  const fig = ev.target.closest('figure');
  setzen(fig.dataset.slug, fig.dataset.p, { b: ev.target.value });
  const e = eintrag(fig.dataset.slug, fig.dataset.p);
  fig.classList.toggle('gesetzt', istFertig(e));
  ev.target.classList.toggle('fehlt', istKi(e) && (e.d==='ja'||e.d==='nein') && !ev.target.value.trim());
});

/**
 * Die gesamte Einordnung als JSON sichern.
 *
 * Der Zwischenstand liegt im localStorage und haengt am Dateipfad — er überlebt keinen
 * Rechnerwechsel, kein geleertes Browserprofil und kein privates Fenster. Er ist ein
 * Arbeitsspeicher, kein Ablageort. Was hier herauskommt, ist die Uebergabe an
 * bildherkunft-übernehmen.mjs, das daraus die Deklarationen in die Kundenrepos schreibt.
 *
 * Bewusst wird ALLES exportiert, auch Unfertiges: eine halb eingeordnete Site soll man
 * wegsichern können. Das Übernahme-Skript entscheidet, was davon einsetzbar ist.
 */
function exportieren() {
  const sites = {}, offen = {};
  for (const s of SITES) { sites[s.slug] = []; offen[s.slug] = 0; }
  document.querySelectorAll('figure').forEach(fig => {
    const slug = fig.dataset.slug;
    const e = eintrag(slug, fig.dataset.p);
    if (!e || !e.h) { offen[slug]++; return; }
    if (!istFertig(e)) { offen[slug]++; }
    sites[slug].push({
      key: fig.dataset.key, wert: fig.dataset.wert,
      herkunft: e.h, deepfake: e.d || null, begruendung: e.b || null,
      fertig: istFertig(e), datei: fig.dataset.p,
    });
  });
  return { format: 'bildherkunft-export-v1', stand: new Date().toISOString(), sites, offen };
}

document.getElementById('export').addEventListener('click', () => {
  const daten = exportieren();
  const blob = new Blob([JSON.stringify(daten, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'bildherkunft-export.json';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  const n = Object.values(daten.sites).reduce((s, l) => s + l.length, 0);
  const b = document.getElementById('export');
  b.textContent = n + ' gesichert ✓';
  setTimeout(() => b.textContent = 'Alles exportieren', 2500);
});

/**
 * Den Sichtbefund übernehmen — ausschliesslich auf Bilder ohne eigene Einordnung.
 *
 * Nie überschreiben: Was der Operator selbst gesetzt hat, hat er gesehen; ein Vorschlag ist
 * aus einer 190-Pixel-Kachel abgeleitet. Bei Gleichstand gewinnt der Mensch.
 *
 * Die „foto"-Vorschläge werden bewusst OHNE Begründung gesetzt: mensch braucht keine,
 * und eine erfundene Begründung wäre eine Behauptung über die Entstehung, die niemand
 * geprüft hat. Die „grafik"-Vorschläge bringen ihre Begründung mit, weil sie aus dem
 * Bildinhalt folgt und nicht aus einer Vermutung.
 */
document.getElementById('vorschlaege').addEventListener('click', () => {
  let gesetzt = 0, übersprungen = 0;
  document.querySelectorAll('figure[data-vorschlag]').forEach(fig => {
    if (eintrag(fig.dataset.slug, fig.dataset.p)) { übersprungen++; return; }
    const v = JSON.parse(fig.dataset.vorschlag);
    setzen(fig.dataset.slug, fig.dataset.p, { h: v.h, d: v.d || undefined, b: v.b || undefined });
    gesetzt++;
  });
  alleZeichnen();
  const b = document.getElementById('vorschlaege');
  b.textContent = gesetzt + ' gesetzt' + (übersprungen ? ', ' + übersprungen + ' deine behalten' : '') + ' ✓';
  setTimeout(() => b.textContent = 'Vorschläge setzen', 3000);
});

document.getElementById('nurOffen').addEventListener('change', filtern);
bauen();
</script>
</body>
</html>`;
}
