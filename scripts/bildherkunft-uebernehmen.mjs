#!/usr/bin/env node
/**
 * bildherkunft-übernehmen — aus der Arbeitsliste in die Kundenrepos.
 *
 * Liest den Export der Arbeitsliste (und optional eine Datei mit Deepfake-Vorschlägen),
 * schreibt je Site `src/data/bild-herkunft.ts` und verdrahtet sie auf Wunsch in
 * `site-data.ts`.
 *
 * Warum eine eigene Datei statt inline wie `imageRights`: zink-baeckerei allein hat 69
 * Bilder. Ein Block dieser Größe mitten im site-data-Objekt macht die Datei unlesbar und
 * jeden Diff daran unbrauchbar. Die erzeugte Datei trägt einen Erzeugt-Hinweis und darf
 * überschrieben werden; die zwei Zeilen in `site-data.ts` schreibt man einmal.
 *
 * Rechtlicher Rahmen: Art. 50 Abs. 4 UAbs. 1 AI Act, Legaldefinition Art. 3 Nr. 60.
 * Volltext: cw-recht → texte/eu/ai-act/ai-act.md. Keine Rechtsberatung.
 *
 * Lauf:
 *   node scripts/bildherkunft-übernehmen.mjs --export ~/Downloads/bildherkunft-export.json
 *   node scripts/bildherkunft-übernehmen.mjs --export … --deepfake vorschlaege.json
 *   node scripts/bildherkunft-übernehmen.mjs --export … --schreiben          # legt Dateien an
 *   node scripts/bildherkunft-übernehmen.mjs --export … --schreiben --verdrahten
 *
 * Ohne `--schreiben` passiert nichts — es wird nur berichtet, was passieren würde.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { alsLiteral, regelZeile } from './bildherkunft-arbeitsliste.mjs';
import { pruefeBildHerkunftRegeln } from '../src/utils/bildherkunft.js';

const REGISTRY = '/Volumes/SiluriWork/NAS-Spiegel/MEDIEN/CODE/CLAUDE/customer-websites/customer-registry.json';

function argWert(name, fallback = null) {
  const i = process.argv.indexOf(name);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const hatFlag = (n) => process.argv.includes(n);

const exportDatei = argWert('--export');
if (!exportDatei || !existsSync(exportDatei)) {
  console.error('Fehlt: --export <datei.json> (Ausgabe des Knopfs „Alles exportieren").');
  process.exit(1);
}
const daten = JSON.parse(readFileSync(exportDatei, 'utf8'));
if (daten.format !== 'bildherkunft-export-v1') {
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

const KOPF = (slug, anzahl, stand) => `// ERZEUGTE DATEI — nicht von Hand bearbeiten.
// Erzeugt von cw-core/scripts/bildherkunft-übernehmen.mjs aus der Bild-Arbeitsliste.
// Änderungen gehen beim nächsten Lauf verloren; einordnen in der Arbeitsliste.
//
// Bild-Herkunft nach Art. 50 Abs. 4 UAbs. 1 AI Act (VO (EU) 2024/1689).
// Die Norm verlangt vom Betreiber eine Offenlegung nur für KI-Inhalte, die ein Deepfake
// sind — und die Legaldefinition (Art. 3 Nr. 60) verlangt zwei Merkmale zusammen: der
// Inhalt ähnelt wirklichen Personen, Gegenständen, Orten, Einrichtungen oder Ereignissen
// UND würde fälschlicherweise als echt erscheinen. Deshalb stehen Herkunft und
// Deepfake-Einordnung getrennt, und die Begründung ist der Nachweis.
//
// Rechtstext: cw-recht → texte/eu/ai-act/ai-act.md, Abschnitt "## Artikel 50".
// Bewertung:  cw-legal → 04-betroffenheit/D1-art50-ki-kennzeichnung.md.
// Keine amtliche Fassung, keine Rechtsberatung.
//
// Site: ${slug} · ${anzahl} Bilder · Stand ${stand}

import type { BildHerkunftRegel } from '@cw/core/utils/bildherkunft';

export const bildHerkunft: BildHerkunftRegel[] = [
`;

const stand = new Date(daten.stand).toLocaleDateString('de-DE');
const bericht = [];
let gesamtPflicht = 0;

for (const [slug, liste] of Object.entries(daten.sites)) {
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
    // melden, statt eine halbe Aussage für eine ganze zu halten.
    if (brauchtEinordnung && deepfake !== 'ja' && deepfake !== 'nein') { offen++; continue; }
    if (brauchtEinordnung && !begruendung) { offen++; continue; }

    if (istKi && deepfake === 'ja') pflicht++;
    zeilen.push(regelZeile(b.key, b.wert, e));
  }

  // Gegenprobe vor dem Schreiben: der eigene Regelprüfer muss das Ergebnis durchwinken.
  // Sonst wandert ein Befund in die Kunden-site-data und fällt erst dort auf.
  const regeln = new Function('return [' + zeilen.join('\n') + '];')();
  const befunde = pruefeBildHerkunftRegeln({ bildHerkunft: regeln });

  const inhalt = KOPF(slug, zeilen.length, stand) + zeilen.join('\n') + '\n];\n';
  const ziel = join(repo, 'src/data/bild-herkunft.ts');

  bericht.push({ slug, geschrieben: zeilen.length, offen, pflicht, befunde, ziel });
  gesamtPflicht += pflicht;

  if (hatFlag('--schreiben')) {
    if (befunde.length) { console.error(`  ! ${slug}: ${befunde.length} Befunde — NICHT geschrieben`); continue; }
    writeFileSync(ziel, inhalt, 'utf8');
  }
}

console.log(`\n${'Site'.padEnd(24)} ${'Regeln'.padStart(7)} ${'offen'.padStart(6)} ${'Label'.padStart(6)}  Befunde`);
for (const b of bericht) {
  if (b.fehler) { console.log(`${b.slug.padEnd(24)} ${b.fehler}`); continue; }
  const bf = b.befunde.length ? `${b.befunde.length} ✗` : '—';
  console.log(`${b.slug.padEnd(24)} ${String(b.geschrieben).padStart(7)} ${String(b.offen).padStart(6)} ${String(b.pflicht).padStart(6)}  ${bf}`);
  for (const f of b.befunde.slice(0, 3)) console.log(`    ${f.field}: ${f.detail}`);
}
console.log(`\nKennzeichnungspflichtig insgesamt: ${gesamtPflicht}`);

if (!hatFlag('--schreiben')) {
  console.log('\nProbelauf — nichts geschrieben. Mit --schreiben ausfuehren.');
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
    if (b.fehler || b.befunde?.length) continue;
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
