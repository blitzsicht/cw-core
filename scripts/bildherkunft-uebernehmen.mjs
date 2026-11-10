#!/usr/bin/env node
/**
 * bildherkunft-übernehmen — aus der Arbeitsliste in die Kundenrepos.
 *
 * Liest den Export der Arbeitsliste (und optional eine Datei mit Deepfake-Vorschlägen),
 * mischt ihn je Site in `src/data/bild-herkunft.ts` und verdrahtet die Datei auf Wunsch in
 * `site-data.ts`.
 *
 * Warum eine eigene Datei statt inline wie `imageRights`: zink-baeckerei allein hat 69
 * Bilder. Ein Block dieser Größe mitten im site-data-Objekt macht die Datei unlesbar und
 * jeden Diff daran unbrauchbar. Die zwei Zeilen in `site-data.ts` schreibt man einmal.
 *
 * **Die Zieldatei hat zwei Schreiber, und der Bestand ist die Grundlage.** `bild-einbauen.mjs`
 * ergänzt sie bei jedem eingebauten Bild, die Arbeitsliste erfährt davon nie. Bis zu
 * dieser Änderung hat das Skript die Datei neu geschrieben und ist deshalb (seit dem Verlust-Guard vom
 * 05.11.2026) bei jeder ergänzten Datei mit Exit 2 abgebrochen — gemessen am 09.11.2026 bei
 * blitzsicht: 125 Regeln im Bestand, 38 in der Arbeitsliste. Seitdem gilt
 * (`mischeRegeln` in lib/bildherkunft-verlust.mjs):
 *
 * - Regeln, die der Export nicht kennt, bleiben, samt Kommentaren und Reihenfolge.
 * - Für ein Bild, das er kennt, gilt seine Einordnung, an der Stelle der alten Zeile.
 * - Neue Bilder kommen ans Ende.
 * - Abgebrochen wird (Exit 2) nur, wenn dabei für ein Bild eine Kennzeichnung nach
 *   Art. 50 Abs. 4 wegfiele. `--kennzeichnung-weg-ok` ist der ausdrückliche Ausweg.
 *
 * Rechtlicher Rahmen: Art. 50 Abs. 4 UAbs. 1 AI Act, Legaldefinition Art. 3 Nr. 60.
 * Volltext: cw-recht → texte/eu/ai-act/ai-act.md. Keine Rechtsberatung.
 *
 * Lauf:
 *   node scripts/bildherkunft-uebernehmen.mjs --export ~/Downloads/bildherkunft-export.json
 *   node scripts/bildherkunft-uebernehmen.mjs --export … --deepfake vorschlaege.json
 *   node scripts/bildherkunft-uebernehmen.mjs --export … --schreiben          # mischt ein
 *   node scripts/bildherkunft-uebernehmen.mjs --export … --schreiben --verdrahten
 *   node scripts/bildherkunft-uebernehmen.mjs --export … --schreiben --kennzeichnung-weg-ok
 *   node scripts/bildherkunft-uebernehmen.mjs --kopf [--schreiben]
 *       # nur den Kopf erzeugter Dateien neu schreiben (Regelzahl und Text), ohne Export
 *
 *   --nur <slug> grenzt auf eine Site ein, --repo <pfad> verlegt deren Ziel (Worktree).
 *
 * Ohne `--schreiben` passiert nichts — es wird nur berichtet, was passieren würde.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { regelZeile } from './bildherkunft-arbeitsliste.mjs';
import {
  verlustVergleich, mischeRegeln, kopfErsetzen, KOPF_ZEILEN, teileDatei, regelZahl, hatErzeugtenKopf,
} from './lib/bildherkunft-verlust.mjs';
import { pruefeBildHerkunftRegeln } from '../src/utils/bildherkunft.js';
import { registryPfad } from './registry-pfad.mjs';

const REGISTRY = registryPfad();

function argWert(name, fallback = null) {
  const i = process.argv.indexOf(name);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const hatFlag = (n) => process.argv.includes(n);

// Der alte Ausweg hieß `--verlust-ok` und überstimmte einen Totalverlust. Den gibt es nicht
// mehr; ein Aufruf mit dem alten Namen soll nicht still etwas anderes bedeuten.
if (hatFlag('--verlust-ok')) {
  console.error('--verlust-ok gibt es nicht mehr: der Lauf mischt und verliert keine Regel.');
  console.error('Fällt eine Kennzeichnung weg, ist der Ausweg --kennzeichnung-weg-ok.');
  process.exit(1);
}

const nurKopf = hatFlag('--kopf');
const exportDatei = argWert('--export');
if (nurKopf && exportDatei) {
  console.error('--kopf und --export schließen sich aus: ein Exportlauf schreibt den Kopf ohnehin neu.');
  process.exit(1);
}
if (!nurKopf && (!exportDatei || !existsSync(exportDatei))) {
  console.error('Fehlt: --export <datei.json> (Ausgabe des Knopfs „Alles exportieren"), oder --kopf.');
  process.exit(1);
}
const daten = nurKopf ? null : JSON.parse(readFileSync(exportDatei, 'utf8'));
if (daten && daten.format !== 'bildherkunft-export-v1') {
  console.error(`Unbekanntes Format: ${daten.format}. Erwartet: bildherkunft-export-v1.`);
  process.exit(1);
}

// Deepfake-Vorschläge ergänzen nur, was der Operator offen gelassen hat. Eine eigene
// Entscheidung von ihm wird nie überschrieben — sie beruht auf dem Bild, der Vorschlag
// auf einer Kachel.
const vorschlaege = (() => {
  const d = argWert('--deepfake');
  if (!d) return {};
  if (!existsSync(d)) { console.error(`--deepfake: ${d} existiert nicht.`); process.exit(1); }
  return JSON.parse(readFileSync(d, 'utf8'));
})();

const repoPfad = Object.fromEntries(
  JSON.parse(readFileSync(REGISTRY, 'utf8')).customers.map((c) => [c.slug, c.repo_path]),
);

// Die Registry zeigt auf den Haupt-Checkout. Arbeitet dort gerade eine andere Session,
// darf dieser Lauf ihn nicht anfassen — dann wird in einen Worktree geschrieben.
// Ohne `--nur` ist `--repo` sinnlos und wird abgelehnt, statt still auf alle Sites zu wirken.
const nurSlug = argWert('--nur');
const repoOverride = argWert('--repo');
if (repoOverride && !nurSlug) {
  console.error('--repo ist nur zusammen mit --nur <slug> zulässig.');
  process.exit(1);
}
if (repoOverride) {
  if (!existsSync(repoOverride)) {
    console.error(`--repo: ${repoOverride} existiert nicht.`);
    process.exit(1);
  }
  repoPfad[nurSlug] = repoOverride;
}

const KOPF = (slug, anzahl, stand) => `${KOPF_ZEILEN.join('\n')}
// Site: ${slug} · ${anzahl} Regeln · Stand ${stand}
`;
const NEUE_DATEI = (slug, zeilen, stand) => KOPF(slug, zeilen.length, stand)
  + "\nimport type { BildHerkunftRegel } from '@cw/core/utils/bildherkunft';\n\n"
  + 'export const bildHerkunft: BildHerkunftRegel[] = [\n' + zeilen.join('\n') + '\n];\n';

const heute = new Date().toLocaleDateString('de-DE');
const ZIEL = (slug) => join(repoPfad[slug], 'src/data/bild-herkunft.ts');

/**
 * Kopf neu, ohne dass das Datum allein eine Änderung auslöst: ist die Regelzahl dieselbe,
 * bleibt der Stand stehen. Sonst änderte jeder `--kopf`-Lauf jede Datei, jeden Tag.
 */
function neuerVorspann(slug, t, stand) {
  const alterStand = t.vorspann.find((z) => z.startsWith('// Site: '))?.match(/Stand (\S+)\s*$/)?.[1];
  const mitAltem = alterStand ? kopfErsetzen(t.vorspann, KOPF(slug, regelZahl(t.rumpf), alterStand)) : null;
  if (mitAltem?.ersetzt && mitAltem.vorspann.join('\n') === t.vorspann.join('\n')) return mitAltem;
  return kopfErsetzen(t.vorspann, KOPF(slug, regelZahl(t.rumpf), stand));
}

const bericht = [];

// --- Nur der Kopf -------------------------------------------------------------------
if (nurKopf) {
  for (const slug of Object.keys(repoPfad)) {
    if (nurSlug && slug !== nurSlug) continue;
    if (!repoPfad[slug] || !existsSync(ZIEL(slug))) continue;
    const alt = readFileSync(ZIEL(slug), 'utf8');
    // Erst der Kopf, dann das Lesen: eine Datei mit eigenem Kopf fasst dieser Modus nicht an,
    // also darf ihn auch eine Form, die der Leser nicht kennt, nicht aufhalten (siluri.de:
    // mehrzeilige Regeln; notar-huber: `= [];`). Gemessen im ersten Flottenprobelauf 09.11.
    if (!hatErzeugtenKopf(alt)) { bericht.push({ slug, regeln: '–', status: 'eigener Kopf, unberührt' }); continue; }
    let t;
    try { t = teileDatei(alt); } catch (e) { bericht.push({ slug, fehler: e.message }); continue; }
    let k;
    try { k = neuerVorspann(slug, t, heute); } catch (e) { bericht.push({ slug, fehler: e.message }); continue; }
    const neu = [...k.vorspann, ...t.rumpf, ...t.schluss].join('\n');
    const status = !k.ersetzt ? 'eigener Kopf, unberührt' : neu === alt ? 'aktuell' : 'neu';
    bericht.push({ slug, regeln: regelZahl(t.rumpf), status });
    if (hatFlag('--schreiben') && neu !== alt) writeFileSync(ZIEL(slug), neu, 'utf8');
  }
  console.log(`\n${'Site'.padEnd(24)} ${'Regeln'.padStart(7)}  Kopf`);
  for (const b of bericht) {
    console.log(b.fehler ? `${b.slug.padEnd(24)} ${b.fehler}` : `${b.slug.padEnd(24)} ${String(b.regeln).padStart(7)}  ${b.status}`);
  }
  const zuSchreiben = bericht.filter((b) => b.status === 'neu').length;
  console.log(hatFlag('--schreiben')
    ? `\n${zuSchreiben} Köpfe geschrieben.`
    : `\nProbelauf — ${zuSchreiben} Köpfe würden neu geschrieben. Mit --schreiben ausführen.`);
  process.exit(bericht.some((b) => b.fehler) ? 3 : 0);
}

// --- Export einmischen --------------------------------------------------------------
const stand = new Date(daten.stand).toLocaleDateString('de-DE');
let gesamtPflicht = 0;
let gesamtWeg = 0;

for (const [slug, liste] of Object.entries(daten.sites)) {
  if (nurSlug && slug !== nurSlug) continue;
  if (!liste.length) continue;
  const repo = repoPfad[slug];
  if (!repo || !existsSync(repo)) { bericht.push({ slug, fehler: 'repo_path fehlt' }); continue; }

  const zeilen = [];
  let offen = 0;
  let pflicht = 0;

  for (const b of liste) {
    const v = vorschlaege[`${slug}::${b.datei}`];
    const deepfake = b.deepfake ?? v?.d ?? null;
    const begruendung = (b.begruendung && b.begruendung.trim()) ? b.begruendung : (v?.b ?? null);

    const e = { h: b.herkunft, d: deepfake ?? undefined, b: begruendung ?? undefined };
    const istKi = b.herkunft === 'ki-erzeugt' || b.herkunft === 'ki-veraendert';
    const brauchtEinordnung = istKi || b.herkunft === 'ungeklaert';

    // Unfertiges wird NICHT eingesetzt. Eine Regel ohne Einordnung wäre im Repo eine
    // Behauptung, die nichts entscheidet — der Guard soll das Bild als undeklariert
    // melden, statt eine halbe Aussage für eine ganze zu halten. Steht für das Bild schon
    // eine Regel im Bestand, bleibt sie.
    if (brauchtEinordnung && deepfake !== 'ja' && deepfake !== 'nein') { offen++; continue; }
    if (brauchtEinordnung && !begruendung) { offen++; continue; }

    if (istKi && deepfake === 'ja') pflicht++;
    zeilen.push(regelZeile(b.key, b.wert, e));
  }

  const ziel = ZIEL(slug);
  let inhalt;
  let m;
  try {
    if (existsSync(ziel)) {
      const alt = readFileSync(ziel, 'utf8');
      const t = teileDatei(alt);
      m = mischeRegeln(t.rumpf, zeilen);
      // Gegenprobe mit dem alten Guard: nach dem Mischen darf er nichts finden. Findet er
      // doch etwas, ist das Mischen falsch und nicht der Bestand — dann gar nicht schreiben.
      const rest = verlustVergleich(t.rumpf.join('\n'), m.zeilen).verloren;
      if (rest.length) throw new Error(`Mischen verlöre ${rest.length} Regeln (${rest[0]} …) — Fehler im Generator`);
      const k = neuerVorspann(slug, { vorspann: t.vorspann, rumpf: m.zeilen }, stand);
      inhalt = [...k.vorspann, ...m.zeilen, ...t.schluss].join('\n');
    } else {
      m = mischeRegeln([], zeilen);
      inhalt = NEUE_DATEI(slug, zeilen, stand);
    }
  } catch (e) {
    // Unbekannte Zeilenform oder Datei ohne Rahmen. Nicht schreiben: ohne verlässliche
    // Lesung ist über den Bestand nichts ausgesagt, und „nichts ausgesagt" ist nicht „nichts da".
    bericht.push({ slug, fehler: `Zieldatei nicht lesbar — ${e.message.split('\n')[0]}` });
    continue;
  }

  // Gegenprobe vor dem Schreiben: der eigene Regelprüfer muss das Ergebnis durchwinken,
  // und zwar das gemischte, nicht nur den Export.
  let befunde;
  try {
    const regeln = new Function('return [' + m.zeilen.join('\n') + '];')();
    befunde = pruefeBildHerkunftRegeln({ bildHerkunft: regeln });
  } catch (e) {
    bericht.push({ slug, fehler: `gemischte Regeln nicht auswertbar — ${e.message.split('\n')[0]}` });
    continue;
  }

  bericht.push({ slug, regeln: regelZahl(m.zeilen), offen, pflicht, befunde, m });
  gesamtPflicht += pflicht;
  gesamtWeg += m.kennzeichnungWeg.length;

  if (hatFlag('--schreiben')) {
    // `zurueckgehalten` markiert die Site auch für die Verdrahtung unten (Nachlese #277): vorher
    // übersprang die nur `fehler`/`befunde`, eine wegen wegfallender Kennzeichnung nicht
    // geschriebene Site bekam trotzdem den Import in site-data.ts — halb angewandt.
    if (befunde.length) {
      console.error(`  ! ${slug}: ${befunde.length} Befunde — NICHT geschrieben`);
      bericht.at(-1).zurueckgehalten = true;
      continue;
    }
    if (m.kennzeichnungWeg.length && !hatFlag('--kennzeichnung-weg-ok')) {
      console.error(`  ! ${slug}: ${m.kennzeichnungWeg.length} Kennzeichnungen fielen weg — NICHT geschrieben`);
      bericht.at(-1).zurueckgehalten = true;
      continue;
    }
    writeFileSync(ziel, inhalt, 'utf8');
  }
}

console.log(`\n${'Site'.padEnd(24)} ${'Regeln'.padStart(7)} ${'neu'.padStart(5)} ${'geänd.'.padStart(7)} ${'offen'.padStart(6)} ${'Label'.padStart(6)} ${'weg'.padStart(5)}  Befunde`);
for (const b of bericht) {
  if (b.fehler) { console.log(`${b.slug.padEnd(24)} ${b.fehler}`); continue; }
  const bf = b.befunde.length ? `${b.befunde.length} ✗` : '—';
  const weg = b.m.kennzeichnungWeg.length ? `${b.m.kennzeichnungWeg.length} ✗` : '—';
  console.log(`${b.slug.padEnd(24)} ${String(b.regeln).padStart(7)} ${String(b.m.neu.length).padStart(5)} ${String(b.m.geaendert.length).padStart(7)} ${String(b.offen).padStart(6)} ${String(b.pflicht).padStart(6)} ${weg.padStart(5)}  ${bf}`);
  for (const f of b.befunde.slice(0, 3)) console.log(`    ${f.field}: ${f.detail}`);
  // Der Probelauf ist die Stelle, an der es auffallen soll — nicht erst der Schreiblauf.
  for (const p of b.m.kennzeichnungWeg) console.log(`    Kennzeichnung fiele weg: ${p}`);
  for (const p of b.m.geaendert.slice(0, 5)) console.log(`    geändert: ${p}`);
  // Eine Adresse, die nur die Arbeitsliste kennt, ist nicht automatisch richtig — bei einem
  // gelöschten Bild legt der Lauf eine Regel für eine Datei an, die es nicht mehr gibt
  // (blitzsicht 05.11.2026: jimdo-alternative.webp, pakete.webp).
  for (const p of b.m.neu.slice(0, 5)) console.log(`    neu: ${p}`);
}
console.log(`\nKennzeichnungspflichtig laut Arbeitsliste: ${gesamtPflicht}`);
if (gesamtWeg) {
  console.log(`Kennzeichnungen, die dieser Lauf entfernen würde: ${gesamtWeg}`);
  console.log('  → Einordnung in der Arbeitsliste prüfen und neu exportieren, oder --kennzeichnung-weg-ok setzen.');
}

if (!hatFlag('--schreiben')) {
  console.log('\nProbelauf — nichts geschrieben. Mit --schreiben ausführen.');
} else {
  console.log('\nGeschrieben. Noch zu verdrahten in jeder site-data.ts:');
  console.log("  import { bildHerkunft } from './bild-herkunft';");
  console.log('  … und im data-Objekt:  bildHerkunft,');
  console.log('(--verdrahten setzt beides automatisch)');
}

// --- Verdrahtung ------------------------------------------------------------------
if (hatFlag('--schreiben') && hatFlag('--verdrahten')) {
  console.log('\nVerdrahtung:');
  for (const b of bericht) {
    if (b.fehler || b.befunde?.length || b.zurueckgehalten) continue;
    const sd = join(repoPfad[b.slug], 'src/data/site-data.ts');
    if (!existsSync(sd)) { console.log(`  ! ${b.slug}: site-data.ts nicht gefunden`); continue; }
    let s = readFileSync(sd, 'utf8');
    if (s.includes("from './bild-herkunft'")) { console.log(`  = ${b.slug}: schon verdrahtet`); continue; }

    // Anker ist die Objektoeffnung, nicht eine Zeilennummer. Die Flotte kennt zwei
    // Schreibweisen — `const data = {` und `export const siteData = {` (gemessen 24.08.2026:
    // 5 vs. 7 Repos). Beide müssen getroffen werden, sonst bleibt die Haelfte der Flotte
    // unverdrahtet und der Guard meldet dort dauerhaft undeklarierte Bilder.
    const ANKER = /^(?:export )?const (?:data|siteData)\s*(?::[^=]+)?=\s*\{$/m;
    const anker = s.match(ANKER);
    if (!anker) { console.log(`  ! ${b.slug}: keine Objektoeffnung gefunden — von Hand`); continue; }

    // Den Import direkt vor die Objektoeffnung setzen, nicht an den Dateianfang: dort
    // stuende er über dem Kopfkommentar der Datei und truennte es von seiner Datei ab.
    s = s.replace(ANKER, (m) => "import { bildHerkunft } from './bild-herkunft';\n\n" + m + '\n  bildHerkunft,');
    writeFileSync(sd, s, 'utf8');
    console.log(`  ✓ ${b.slug}`);
  }
}

// Eigene Codes für „nichts geschrieben, und zwar aus einem Grund", unterscheidbar von 1
// (Nutzungsfehler, etwa fehlendes --export). Exit 0 hieße hier: der Lauf schreibt nichts,
// meldet aber Erfolg — ein Aufrufer, der nur den Code liest, hielte die Datei für aktuell.
//
// Gemessen am 05.11.2026: ohne Code 3 endete ein Lauf gegen eine unlesbare Zieldatei mit
// Exit 0 und der Meldung mitten in einer Tabelle. Dasselbe galt schon vorher für
// „repo_path fehlt" — eine Site stillschweigend zu überspringen ist kein Erfolg.
//
// Nachlese #277 (09.11.2026): Befunde des eigenen Regelprüfers am gemischten Ergebnis zählen
// ebenso. Vorher meldete ein `--schreiben`-Lauf „NICHT geschrieben" und endete mit 0. Seit dem
// Mischen prüft der Lauf auch den Bestand, ein Altfehler darin hält also jeden Schreiblauf an.
const uebersprungen = bericht.filter((b) => b.fehler || b.befunde?.length).length;
if (uebersprungen) process.exit(3);
if (gesamtWeg && !hatFlag('--kennzeichnung-weg-ok')) process.exit(2);
