#!/usr/bin/env node
/**
 * bildherkunft-verwendung — wo wird ein deklariertes Bild tatsächlich eingebunden?
 *
 * Die Einordnung nach Art. 50 hängt nicht am Bild, sondern an seiner Verwendung.
 * `cw-legal: 04-betroffenheit/D5-art50-reichweite-und-form.md` formuliert es so:
 *
 *   > Dieselbe Aufnahme eines Handwerkers ist unter „Unser Team" eine Tatsachenbehauptung
 *   > und in einer Leistungsliste ein Symbol. Die Einordnung gehört deshalb an die
 *   > Verwendung, nicht an die Datei.
 *
 * Dieses Werkzeug erhebt die Verwendung, damit die Einordnung belegt statt geraten wird.
 * Es entscheidet nichts — es sammelt Fundstellen und schlägt einen Kontext vor.
 *
 * Warum das nötig ist: Die heutige Einordnung im Bestand beruht auf dem Aussehen
 * („fotorealistische Szene"). Nach D5 fällt damit rund die Hälfte der als pflichtig
 * geführten Bilder heraus — aber nur, wenn man weiß, wo sie stehen.
 *
 * Rechtlicher Rahmen: Art. 50 Abs. 4 UAbs. 1 AI Act, Legaldefinition Art. 3 Nr. 60.
 * Volltext: cw-recht → texte/eu/ai-act/ai-act.md. Keine Rechtsberatung.
 *
 * Lauf:
 *   node scripts/bildherkunft-verwendung.mjs                    # alle Sites, nur Bericht
 *   node scripts/bildherkunft-verwendung.mjs --site blitzsicht  # eine Site
 *   node scripts/bildherkunft-verwendung.mjs --nur-pflicht      # nur deepfake:'ja'
 *   node scripts/bildherkunft-verwendung.mjs --out verwendung.json
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative, extname, basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REGISTRY =
  '/Volumes/SiluriWork/NAS-Spiegel/MEDIEN/CODE/CLAUDE/customer-websites/customer-registry.json';

function argWert(name, fallback = null) {
  const i = process.argv.indexOf(name);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const hatFlag = (n) => process.argv.includes(n);

// --- Regeln aus der erzeugten bild-herkunft.ts lesen ------------------------
// Die Datei ist erzeugt und hat deshalb ein festes Zeilenformat (regelZeile() in
// bildherkunft-arbeitsliste.mjs). Ein Parser darauf ist zulässig, weil das Format
// von genau einer Stelle erzeugt wird — nicht von Hand geschrieben.
const REGEL_RE =
  /^\s*\{\s*(pathPrefix|stem):\s*'((?:[^'\\]|\\.)*)'\s*,\s*herkunft:\s*'([^']+)'(?:\s*,\s*deepfake:\s*'([^']*)')?(?:\s*,\s*begruendung:\s*'((?:[^'\\]|\\.)*)')?/;

function leseRegeln(repo) {
  const p = join(repo, 'src/data/bild-herkunft.ts');
  if (!existsSync(p)) return [];
  const regeln = [];
  for (const zeile of readFileSync(p, 'utf8').split('\n')) {
    const m = REGEL_RE.exec(zeile);
    if (!m) continue;
    regeln.push({
      key: m[1],
      wert: m[2].replace(/\\'/g, "'").replace(/\\\\/g, '\\'),
      herkunft: m[3],
      deepfake: m[4] ?? null,
      begruendung: (m[5] ?? '').replace(/\\'/g, "'").replace(/\\n/g, '\n'),
    });
  }
  return regeln;
}

// --- Quelldateien einer Site einsammeln -------------------------------------
const QUELL_EXT = new Set(['.astro', '.ts', '.tsx', '.js', '.mjs', '.md', '.mdx', '.json']);
const UEBERSPRINGEN = new Set(['node_modules', 'dist', '.git', '.astro', '.vercel', 'public']);

function quellDateien(repo) {
  const treffer = [];
  const gehe = (dir) => {
    let eintraege;
    try {
      eintraege = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of eintraege) {
      if (e.name.startsWith('.') || UEBERSPRINGEN.has(e.name)) continue;
      const p = join(dir, e.name);
      if (e.isDirectory()) gehe(p);
      else if (QUELL_EXT.has(extname(e.name))) treffer.push(p);
    }
  };
  gehe(join(repo, 'src'));
  // astro.config und Skripte am Wurzelknoten können ebenfalls Bilder benennen
  for (const f of ['astro.config.ts', 'astro.config.mjs']) {
    const p = join(repo, f);
    if (existsSync(p)) treffer.push(p);
  }
  return treffer;
}

// --- Kontext aus dem Fundort ableiten ---------------------------------------
// Heuristik, ausdrücklich als solche gekennzeichnet. Sie ersetzt die Einordnung nicht,
// sie ordnet die Arbeit. Was sie vorschlägt, ist im Freigabedokument sichtbar.
function kontextAus(fundstellen, wert) {
  if (!fundstellen.length) return 'ungenutzt';
  const pfade = fundstellen.map((f) => f.datei.toLowerCase()).join(' ');
  const ziel = wert.toLowerCase();

  // Verzeichnis vor dem Aussehen: `staedte/` und `leistungen/` entscheiden die
  // Deepfake-Frage in entgegengesetzte Richtungen (benannter Ort vs. Leistungsart),
  // und beide werden über dieselbe dynamische Pfadkonstruktion eingebunden.
  if (/(^|\/)staedte\//.test(ziel)) return 'stadtseite';
  if (/(^|\/)leistungen\//.test(ziel)) return 'leistungsseite';

  if (/\bteam\b|mitarbeiter|ueber-uns|über-uns|about/.test(pfade + ' ' + ziel)) return 'team';
  if (/referenz|projekt|portfolio|galerie/.test(pfade + ' ' + ziel)) return 'referenz';
  if (/branchen?\//.test(pfade)) return 'branchenseite';
  if (/content\/blog|\/blog\//.test(pfade)) return 'blog';
  if (/hero-variants|\bhero\b/.test(pfade + ' ' + ziel)) return 'hero';
  if (/site-data|siteData/.test(pfade)) return 'site-data';
  return 'seite';
}

/**
 * Landet ein `src/assets`-Bild im Build?
 *
 * Für `stem`-Regeln ist das der trennscharfe Nachweis: Astro bündelt aus `src/assets/` nur,
 * was tatsächlich importiert wird — ein Bild ohne Import erscheint dort nie. Die Textsuche
 * versagt bei kurzen Stems, weil Wörter wie `hero`, `team` oder `cafe` überall im Code
 * vorkommen. Gemessen am 25.08.2026: acht Pflicht-Einträge hängen an Stems mit höchstens
 * sechs Zeichen; bei `customer-donau-profi` galt `hero` deshalb als verwendet, obwohl
 * `src/assets/images/hero/hero.png` von keiner Seite importiert wird und im Build fehlt.
 *
 * Ohne `dist/` lässt sich das nicht entscheiden. Dann wird **nicht geraten**, sondern der
 * Zustand als solcher gemeldet — `unbekannt` ist ein eigener Wert, kein stilles „verwendet".
 *
 * @returns {'ja'|'nein'|'unbekannt'}
 */
export function imBuild(repo, stem) {
  const dist = join(repo, 'dist');
  if (!existsSync(dist)) return 'unbekannt';
  const BILD_EXT = new Set(['.webp', '.avif', '.png', '.jpg', '.jpeg', '.svg', '.gif']);
  let gefunden = false;
  const gehe = (dir) => {
    if (gefunden) return;
    let eintraege;
    try {
      eintraege = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of eintraege) {
      if (gefunden) return;
      const p = join(dir, e.name);
      if (e.isDirectory()) gehe(p);
      // Astro hängt einen Content-Hash an: `hero.Bng-bGX1.webp` → Stem ist der Teil vor dem
      // ersten Punkt, dieselbe Regel wie in resolveBildHerkunft.
      else if (e.name.split('.')[0] === stem && BILD_EXT.has(extname(e.name))) gefunden = true;
    }
  };
  gehe(dist);
  return gefunden ? 'ja' : 'nein';
}

/**
 * Wird das Bild über eine zusammengebaute Pfadangabe eingebunden?
 *
 * Gemessen am 24.08.2026: `customer-donau-profi` bindet jedes Leistungsbild als
 * `tileImage: \`/leistungen/${l.slug}.webp\`` ein, `customer-soleno` jedes Stadtbild als
 * `return \`/staedte/${slug}.webp\``. Eine Textsuche nach dem Dateinamen findet davon
 * nichts — sie meldete 24 von 92 Bildern als ungenutzt, obwohl alle ausgeliefert und
 * eingebunden sind. Ein „ungenutzt", das in Wahrheit „nicht gefunden" heißt, ist genau
 * die Fehlerart, die still grün meldet.
 *
 * Der Nachweis besteht deshalb aus zwei Teilen, die beide vorliegen müssen:
 *   1. ein Template, das Verzeichnis und Endung dieses Bildes zusammensetzt, und
 *   2. der Stamm des Dateinamens als String-Wert (der Slug, der dort eingesetzt wird).
 */
function dynamischeFundstellen(inhalte, wert) {
  const teile = wert.split('/');
  if (teile.length < 2) return [];
  const verzeichnis = teile[teile.length - 2];
  const name = teile[teile.length - 1];
  const stamm = name.replace(/\.[^.]+$/, '');
  const ext = extname(name);
  if (!verzeichnis || !stamm || !ext) return [];

  const template = [];
  const slugStelle = [];
  for (const { datei, text } of inhalte) {
    if (datei.endsWith('src/data/bild-herkunft.ts')) continue;
    const zeilen = text.split('\n');
    for (let i = 0; i < zeilen.length; i++) {
      const z = zeilen[i];
      if (z.includes(`${verzeichnis}/`) && z.includes('${') && z.includes(ext)) {
        template.push({ datei, zeile: i + 1, text: z.trim().slice(0, 160), art: 'template' });
      } else if (z.includes(`'${stamm}'`) || z.includes(`"${stamm}"`)) {
        slugStelle.push({ datei, zeile: i + 1, text: z.trim().slice(0, 160), art: 'slug' });
      }
    }
  }
  // Beides oder nichts — ein Template ohne passenden Slug belegt für dieses Bild nichts.
  if (!template.length || !slugStelle.length) return [];
  return [...template.slice(0, 2), ...slugStelle.slice(0, 2)];
}

// --- Lauf -------------------------------------------------------------------
// Nur beim direkten Aufruf scannen — damit `imBuild` importiert und geprüft werden kann,
// ohne die ganze Flotte zu durchsuchen (Muster wie in bildherkunft-arbeitsliste.mjs).
const direktAufgerufen =
  process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (!direktAufgerufen) {
  // als Modul geladen: nichts weiter tun
} else {
const nurSite = argWert('--site');
const nurPflicht = hatFlag('--nur-pflicht');
const ausgabe = argWert('--out');

const kunden = JSON.parse(readFileSync(REGISTRY, 'utf8')).customers;
const ergebnis = {};
let gesamtBilder = 0;
let gesamtOhneFund = 0;

for (const k of kunden) {
  if (nurSite && k.slug !== nurSite) continue;
  const repo = k.repo_path;
  if (!repo || !existsSync(repo)) continue;

  const regeln = leseRegeln(repo);
  if (!regeln.length) continue;

  const dateien = quellDateien(repo);
  // Inhalte einmal lesen statt je Bild — bei 69 Bildern × 200 Dateien lohnt das.
  const inhalte = dateien.map((d) => ({ datei: relative(repo, d), text: readFileSync(d, 'utf8') }));

  const liste = [];
  for (const r of regeln) {
    if (nurPflicht && r.deepfake !== 'ja') continue;

    // Gesucht wird der Dateiname mit Endung — er ist eindeutig genug, um Fehltreffer
    // auf blossen Wortstamm ('elektriker' im Fliesstext) zu vermeiden.
    const name = basename(r.wert);
    const stamm = name.replace(/\.[^.]+$/, '');
    const suchbegriffe = r.key === 'stem' ? [r.wert, stamm] : [name];

    const fundstellen = [];
    for (const { datei, text } of inhalte) {
      if (datei.endsWith('src/data/bild-herkunft.ts')) continue; // die Deklaration selbst
      for (const s of suchbegriffe) {
        if (!s || !text.includes(s)) continue;
        const zeilen = text.split('\n');
        for (let i = 0; i < zeilen.length; i++) {
          if (!zeilen[i].includes(s)) continue;
          fundstellen.push({ datei, zeile: i + 1, text: zeilen[i].trim().slice(0, 160), art: 'literal' });
        }
        break; // ein Treffer je Datei genuegt fuer die Einordnung
      }
    }

    // Erst wenn die wörtliche Suche nichts findet, die zusammengebaute Einbindung prüfen.
    let bindung = fundstellen.length ? 'literal' : 'keine';
    if (!fundstellen.length) {
      const dyn = dynamischeFundstellen(inhalte, r.wert);
      if (dyn.length) {
        fundstellen.push(...dyn);
        bindung = 'dynamisch';
      }
    }

    // Bei `stem`-Regeln schlägt der Build-Befund die Textsuche: er ist trennscharf, sie
    // nicht. Ein `hero`, das die Suche findet, aber im Build fehlt, ist nicht eingebunden —
    // der Treffer stammt dann von einem gleichnamigen Wort anderswo im Code.
    let gebaut = '—';
    if (r.key === 'stem') {
      gebaut = imBuild(repo, stamm);
      if (gebaut === 'nein') {
        fundstellen.length = 0;
        bindung = 'keine';
      } else if (gebaut === 'ja' && !fundstellen.length) {
        bindung = 'nur-build';
      }
    }

    gesamtBilder++;
    if (!fundstellen.length) gesamtOhneFund++;

    liste.push({
      key: r.key,
      wert: r.wert,
      herkunft: r.herkunft,
      deepfake_alt: r.deepfake,
      begruendung_alt: r.begruendung,
      bindung,
      gebaut,
      kontext: kontextAus(fundstellen, r.wert),
      fundstellen: fundstellen.slice(0, 6),
      fundstellen_gesamt: fundstellen.length,
    });
  }

  if (liste.length) ergebnis[k.slug] = liste;
}

// --- Bericht ----------------------------------------------------------------
console.log(`${'Site'.padEnd(24)} ${'Bilder'.padStart(6)} ${'ungenutzt'.padStart(9)}  Kontexte`);
console.log('─'.repeat(78));
for (const [slug, liste] of Object.entries(ergebnis)) {
  const ohne = liste.filter((b) => b.kontext === 'ungenutzt').length;
  const kz = {};
  for (const b of liste) kz[b.kontext] = (kz[b.kontext] || 0) + 1;
  const kurz = Object.entries(kz)
    .sort((a, b) => b[1] - a[1])
    .map(([k, n]) => `${k}:${n}`)
    .join(' ');
  console.log(`${slug.padEnd(24)} ${String(liste.length).padStart(6)} ${String(ohne).padStart(9)}  ${kurz}`);
}
console.log('─'.repeat(78));
console.log(`${'GESAMT'.padEnd(24)} ${String(gesamtBilder).padStart(6)} ${String(gesamtOhneFund).padStart(9)}`);

if (ausgabe) {
  writeFileSync(ausgabe, JSON.stringify({ stand: new Date().toISOString(), sites: ergebnis }, null, 2), 'utf8');
  console.log(`\nGeschrieben: ${ausgabe}`);
}
}
