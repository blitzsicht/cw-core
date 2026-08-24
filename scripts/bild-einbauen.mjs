#!/usr/bin/env node
/**
 * bild-einbauen — ein neues Bild ablegen und im selben Zug deklarieren.
 *
 * Der tägliche Griff zu Art. 50 Abs. 4 UAbs. 1 AI Act. Ohne ihn baut sich der Altbestand
 * neu auf: Jedes Bild, das ohne Deklaration in ein Repo wandert, ist wieder ein offener
 * Punkt, und die einmalige Einordnung von 262 Bildern ist keine Übung, die man
 * vierteljährlich wiederholt.
 *
 * WARUM GENAU HIER
 * Beim Einbau ist der Herkunftsmarker noch da; beim Build ist er weg. `astro:assets`
 * (sharp) strippt EXIF beim Transform — deshalb fand die Messung am 24.08.2026 auf 54
 * Bildern der Flotte NULL Marker, und deshalb ist ein Detektor über den Altbestand
 * ausgeschlossen. Vor dem Ablegen dagegen ist er möglich: Dieses Werkzeug liest die
 * Quelldatei und belegt die Herkunftsfrage vor, wo etwas dasteht. Es rät nicht — wo
 * nichts steht, sagt es das und fragt.
 *
 * Rechtstext: cw-recht → texte/eu/ai-act/ai-act.md, "## Artikel 50".
 * Bewertung:  cw-legal → 04-betroffenheit/D1-art50-ki-kennzeichnung.md.
 * Keine amtliche Fassung, keine Rechtsberatung.
 *
 * Lauf:
 *   node scripts/bild-einbauen.mjs ~/Downloads/neu.png --repo customer-soleno --ziel images/team/
 *   node scripts/bild-einbauen.mjs bild.webp --repo /pfad/zum/repo --ziel images/ \
 *        --herkunft ki-erzeugt --deepfake ja --begruendung "Szene ohne reale Vorlage"
 *   node scripts/bild-einbauen.mjs *.webp --repo customer-soleno --ziel images/ --probelauf
 */

import { readFileSync, writeFileSync, existsSync, copyFileSync, mkdirSync } from 'node:fs';
import { join, basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { regelZeile } from './bildherkunft-arbeitsliste.mjs';
import { pruefeBildHerkunftRegeln } from '../src/utils/bildherkunft.js';
import { TAG_DENY_RE, DIGITAL_SOURCE_TYPE } from '../src/integrations/ai-discovery/geotag-core.js';

const REGISTRY = '/Volumes/SiluriWork/NAS-Spiegel/MEDIEN/CODE/CLAUDE/customer-websites/customer-registry.json';

// ---------------------------------------------------------------------------
// Reine Teile — hier liegt das Risiko, deshalb sind sie getrennt und getestet.
// ---------------------------------------------------------------------------

/**
 * Werkzeugnamen, die eine KI-Erzeugung nahelegen.
 *
 * Bewusst eng gehalten. Der teure Fehler ginge in die andere Richtung: ein echtes Foto,
 * das in Photoshop retuschiert wurde, als KI-Bild vorzubelegen — der Operator bestätigt
 * im Zweifel zu schnell, und dann trägt eine echte Aufnahme ein KI-Label. Eine falsche
 * KI-Behauptung über ein echtes Foto ist kein kleinerer Fehler als eine fehlende
 * Kennzeichnung; sie ist nur unauffälliger.
 */
const KI_WERKZEUGE = [
  /midjourney/i, /dall[·\-\s]?e/i, /stable\s?diffusion/i, /\bfirefly\b/i, /\bgemini\b/i,
  /\bimagen\b/i, /nano\s?banana/i, /\bflux\b/i, /ideogram/i, /leonardo\.ai/i,
  /\bsdxl\b/i, /comfyui/i, /automatic1111/i, /openai/i, /\bgrok\b/i, /recraft/i,
];

const DST_PRAEFIX = 'http://cv.iptc.org/newscodes/digitalsourcetype/';

/**
 * Auslesen, was die Metadaten über die Herkunft sagen.
 *
 * Drei Verlässlichkeitsstufen, und die Unterscheidung ist der Kern:
 *   sicher   — der Hersteller hat es selbst erklärt (DigitalSourceType). Vorbelegung.
 *   Hinweis  — ein Werkzeugname deutet darauf. Vorbelegung, aber der Mensch bestätigt.
 *   nichts   — dann wird gefragt, und das wird auch so gesagt.
 *
 * @param {Record<string, any>|null|undefined} tags  exiftool-Ausgabe
 * @returns {{herkunft: string|null, sicher: boolean, quelle: string}}
 */
export function deuteMarker(tags) {
  const t = tags ?? {};
  const nichts = { herkunft: null, sicher: false, quelle: '' };

  // 1. Die Herstellererklärung. Sie ist die einzige Angabe, die etwas BEHAUPTET statt
  //    etwas nahezulegen — und sie sagt auch „echte Aufnahme", nicht nur „KI".
  const dst = String(t.DigitalSourceType ?? '');
  if (dst) {
    const code = dst.startsWith(DST_PRAEFIX) ? dst.slice(DST_PRAEFIX.length) : dst;
    const abbildung = {
      trainedAlgorithmicMedia: 'ki-erzeugt',
      compositeWithTrainedAlgorithmicMedia: 'ki-veraendert',
      algorithmicallyEnhanced: 'ki-veraendert',
      digitalCapture: 'mensch',
      negativeFilm: 'mensch',
      positiveFilm: 'mensch',
      print: 'mensch',
    };
    const h = abbildung[code];
    if (h) return { herkunft: h, sicher: true, quelle: `DigitalSourceType: ${code}` };
  }

  // 2. Werkzeugnamen. Ein Hinweis, keine Erklärung.
  for (const feld of ['Software', 'CreatorTool', 'ProcessingSoftware', 'HistorySoftwareAgent']) {
    const wert = String(t[feld] ?? '');
    if (!wert.trim()) continue;
    if (KI_WERKZEUGE.some((re) => re.test(wert))) {
      return { herkunft: 'ki-erzeugt', sicher: false, quelle: `${feld}: ${wert}` };
    }
  }

  // 3. Content Credentials sagen, DASS eine Herkunftshistorie vorliegt — nicht welche.
  //    Sie als KI zu deuten wäre falsch: C2PA markiert auch echte Kameraaufnahmen.
  const c2pa = ['JUMBFTag', 'JUMBF', 'C2PAManifest'].some((k) => String(t[k] ?? '').trim());
  if (c2pa) {
    return { herkunft: null, sicher: false, quelle: 'C2PA/Content Credentials vorhanden — Inhalt ungelesen' };
  }

  return nichts;
}

/** Kopf einer neuen Deklarationsdatei. */
export const NEUE_DATEI = (slug) => `// Bild-Herkunft nach Art. 50 Abs. 4 UAbs. 1 AI Act (VO (EU) 2024/1689).
//
// Gepflegt von cw-core/scripts/bild-einbauen.mjs — neue Bilder werden beim Einbau
// deklariert, nicht später nachgetragen. Von Hand ergänzen ist erlaubt; die Form ist
// dieselbe.
//
// Die Norm verlangt eine Offenlegung nur für KI-Inhalte, die ein Deepfake SIND, und die
// Legaldefinition (Art. 3 Nr. 60) verlangt zwei Merkmale zusammen: der Inhalt ähnelt
// wirklichen Personen, Gegenständen, Orten, Einrichtungen oder Ereignissen UND würde
// fälschlicherweise als echt erscheinen. Deshalb stehen Herkunft und Einordnung getrennt,
// und die Begründung ist der Nachweis.
//
// Rechtstext: cw-recht → texte/eu/ai-act/ai-act.md, "## Artikel 50".
// Keine amtliche Fassung, keine Rechtsberatung.
//
// Site: ${slug}

import type { BildHerkunftRegel } from '@cw/core/utils/bildherkunft';

export const bildHerkunft: BildHerkunftRegel[] = [
];
`;

/**
 * Eine Regelzeile vor die schließende Klammer setzen.
 *
 * Kein Suchen-und-Ersetzen im ganzen Text: Der Anker ist die LETZTE `];`-Zeile, damit ein
 * `];` innerhalb einer Begründung die Datei nicht zerreißt.
 *
 * @param {string} inhalt  bisherige Datei
 * @param {string} zeile   Ergebnis von regelZeile()
 * @returns {string}
 */
export function einfuegen(inhalt, zeile) {
  const schluessel = zeile.match(/(pathPrefix|stem): '((?:[^'\\]|\\.)*)'/);
  if (schluessel) {
    const suche = `${schluessel[1]}: '${schluessel[2]}'`;
    if (inhalt.includes(suche)) {
      throw new Error(`bereits deklariert: ${suche} — Eintrag von Hand ändern statt doppelt anzulegen.`);
    }
  }
  const idx = inhalt.lastIndexOf('\n];');
  if (idx === -1) throw new Error('Deklarationsdatei hat keine schließende Klammer — von Hand prüfen.');
  return inhalt.slice(0, idx + 1) + zeile + '\n' + inhalt.slice(idx + 1);
}

// ---------------------------------------------------------------------------
// Ab hier: I/O, Fragen, Ablegen.
// ---------------------------------------------------------------------------

function argWert(name, fallback = null) {
  const i = process.argv.indexOf(name);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const hatFlag = (n) => process.argv.includes(n);

/** exiftool-Werte lesen. Fehlt das Werkzeug, ist das ein eigener Zustand, kein leeres Ergebnis. */
function leseMarker(datei) {
  try {
    const roh = execFileSync('exiftool', [
      '-json', '-DigitalSourceType', '-Software', '-CreatorTool', '-ProcessingSoftware',
      '-HistorySoftwareAgent', '-JUMBFTag', '-JUMBF', '-C2PAManifest', datei,
    ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return { tags: JSON.parse(roh)[0] ?? {}, verfuegbar: true };
  } catch {
    return { tags: {}, verfuegbar: false };
  }
}

function repoAufloesen(wert) {
  if (!wert) return null;
  if (existsSync(wert)) return resolve(wert);
  try {
    const reg = JSON.parse(readFileSync(REGISTRY, 'utf8')).customers;
    const c = reg.find((x) => x.slug === wert || `customer-${x.slug}` === wert);
    if (c?.repo_path && existsSync(c.repo_path)) return c.repo_path;
  } catch { /* Registry fehlt — dann zaehlt nur der Pfad */ }
  return null;
}

async function main() {
  const dateien = process.argv.slice(2).filter((a) => !a.startsWith('--') &&
    !['--repo', '--ziel', '--herkunft', '--deepfake', '--begruendung'].includes(process.argv[process.argv.indexOf(a) - 1]));
  const repo = repoAufloesen(argWert('--repo'));
  const ziel = argWert('--ziel', 'images/');
  const probelauf = hatFlag('--probelauf');

  if (!dateien.length || !repo) {
    console.error('Aufruf: bild-einbauen.mjs <datei…> --repo <slug|pfad> [--ziel images/unterordner/]');
    console.error('        [--herkunft mensch|ki-erzeugt|ki-veraendert] [--deepfake ja|nein] [--begruendung "…"]');
    console.error('        [--probelauf]');
    process.exit(1);
  }

  const deklDatei = join(repo, 'src/data/bild-herkunft.ts');
  const slug = basename(repo).replace(/^customer-/, '');
  let inhalt = existsSync(deklDatei) ? readFileSync(deklDatei, 'utf8') : NEUE_DATEI(slug);

  const rl = createInterface({ input: stdin, output: stdout });
  const frage = async (text, vorgabe) => {
    const a = (await rl.question(text)).trim();
    return a || vorgabe;
  };

  const getan = [];
  try {
    for (const quelle of dateien) {
      if (!existsSync(quelle)) { console.error(`  ! ${quelle}: existiert nicht`); continue; }

      const name = basename(quelle);
      const relPfad = (ziel.replace(/^\/+|\/+$/g, '') + '/' + name).replace(/^\/+/, '');

      if (TAG_DENY_RE.test(relPfad)) {
        console.log(`  – ${name}: og-/Icon-/Newsletter-Pfad — kein Inhaltsbild, keine Deklaration nötig.`);
        continue;
      }

      console.log(`\n── ${name} ──`);
      const { tags, verfuegbar } = leseMarker(quelle);
      const m = deuteMarker(tags);

      if (!verfuegbar) {
        console.log('  exiftool nicht gefunden — die Metadaten wurden NICHT GEPRÜFT (nicht: sie sind leer).');
      } else if (m.herkunft && m.sicher) {
        console.log(`  Marker gefunden: ${m.quelle}`);
        console.log(`  → Der Hersteller erklärt die Herkunft selbst: ${m.herkunft}`);
      } else if (m.herkunft) {
        console.log(`  Hinweis gefunden: ${m.quelle} → vermutlich ${m.herkunft}`);
      } else if (m.quelle) {
        console.log(`  ${m.quelle}`);
      } else {
        console.log('  Keine Herkunftsspur in den Metadaten.');
      }

      let herkunft = argWert('--herkunft') || m.herkunft;
      if (!argWert('--herkunft')) {
        const vorgabe = herkunft ?? 'mensch';
        herkunft = await frage(
          `  Herkunft [mensch | ki-erzeugt | ki-veraendert] (${vorgabe}): `, vorgabe);
      }

      let deepfake = argWert('--deepfake');
      let begruendung = argWert('--begruendung');
      const istKi = herkunft === 'ki-erzeugt' || herkunft === 'ki-veraendert';

      if (istKi && !deepfake) {
        console.log('  Wuerde jemand dieses Bild für eine echte Aufnahme halten?');
        console.log('  (Erkennbares Rendering, Illustration, Logo → nein. Fotorealistische Szene → ja.)');
        deepfake = await frage('  [ja | nein] (ja): ', 'ja');
      }
      if (istKi && !begruendung) {
        begruendung = await frage('  Begründung (Nachweis, Pflicht): ', '');
        if (!begruendung.trim()) {
          console.error('  ! Ohne Begründung wird nicht deklariert — sie ist der Nachweis. Uebersprungen.');
          continue;
        }
      }

      const e = { h: herkunft, d: istKi ? deepfake : undefined, b: istKi ? begruendung : undefined };
      const zeile = regelZeile('pathPrefix', relPfad, e);

      // Gegenprobe vor dem Schreiben: der eigene Regelprüfer muss die Zeile durchwinken.
      const probe = new Function('return [' + zeile + '];')();
      const befunde = pruefeBildHerkunftRegeln({ bildHerkunft: probe });
      if (befunde.length) {
        console.error(`  ! Regel abgewiesen: ${befunde[0].detail}`);
        continue;
      }

      // Eine Dublette ist ein Bedienfehler, kein Programmabsturz: Sie darf die anderen
      // Dateien desselben Aufrufs nicht mitreißen und braucht keinen Stacktrace.
      try {
        inhalt = einfuegen(inhalt, zeile);
      } catch (e) {
        console.error(`  ! ${e.message}`);
        continue;
      }
      getan.push({ quelle, relPfad, herkunft, deepfake, name });
      console.log(`  ✓ deklariert als ${herkunft}${istKi ? ` / deepfake=${deepfake}` : ''}`);
    }
  } finally {
    rl.close();
  }

  if (!getan.length) { console.log('\nNichts zu tun.'); return; }

  if (probelauf) {
    console.log('\nProbelauf — nichts geschrieben. Es entstuenden:');
    for (const g of getan) console.log(`  ${g.relPfad}`);
    return;
  }

  for (const g of getan) {
    const zielDatei = join(repo, 'public', g.relPfad);
    mkdirSync(dirname(zielDatei), { recursive: true });
    copyFileSync(g.quelle, zielDatei);

    // Den Marker auf die abgelegte Datei schreiben, solange sie noch unangetastet ist.
    // Nicht unsere Pflicht (Abs. 2 bindet den Anbieter), aber die Antwort auf die
    // EU-Forderung, dass eine Kennzeichnung das Herunterladen überlebt — und der
    // Post-Build-Hook läuft nicht in jedem Repo.
    const wert = g.herkunft === 'ki-erzeugt' ? DIGITAL_SOURCE_TYPE.erzeugt
      : g.herkunft === 'ki-veraendert' ? DIGITAL_SOURCE_TYPE.veraendert : null;
    if (wert) {
      try {
        execFileSync('exiftool', ['-overwrite_original',
          `-XMP-iptcExt:DigitalSourceType=${wert}`, zielDatei], { stdio: 'ignore' });
      } catch {
        console.error(`  ! ${g.name}: DigitalSourceType konnte nicht geschrieben werden (exiftool?).`);
      }
    }
  }

  writeFileSync(deklDatei, inhalt, 'utf8');
  console.log(`\n${getan.length} Bild(er) abgelegt, Deklaration in ${deklDatei}`);
  if (!readFileSync(join(repo, 'src/data/site-data.ts'), 'utf8').includes("from './bild-herkunft'")) {
    console.log("\nNoch zu verdrahten in site-data.ts:");
    console.log("  import { bildHerkunft } from './bild-herkunft';   … und im Objekt:  bildHerkunft,");
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  await main();
}
