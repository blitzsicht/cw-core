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
 * jeden Diff daran unbrauchbar. Die zwei Zeilen in `site-data.ts` schreibt man einmal.
 *
 * **Die Zieldatei darf NICHT blind überschrieben werden.** Sie hat einen zweiten Schreiber:
 * `bild-einbauen.mjs` ergänzt sie bei jedem eingebauten Bild. Gemessen am 05.11.2026 trug
 * `customer-blitzsicht` 108 Regeln, von denen dieses Skript 38 kannte — ein Lauf mit
 * `--schreiben` hätte 72 Rechtsaussagen gelöscht, ohne ein Wort zu sagen. Seitdem vergleicht
 * `lib/bildherkunft-verlust.mjs` vor dem Schreiben mit dem Bestand, der Lauf bricht bei
 * Verlust ab (Exit 2) und `--verlust-ok` ist der ausdrückliche Ausweg.
 *
 * Rechtlicher Rahmen: Art. 50 Abs. 4 UAbs. 1 AI Act, Legaldefinition Art. 3 Nr. 60.
 * Volltext: cw-recht → texte/eu/ai-act/ai-act.md. Keine Rechtsberatung.
 *
 * Lauf:
 *   node scripts/bildherkunft-übernehmen.mjs --export ~/Downloads/bildherkunft-export.json
 *   node scripts/bildherkunft-übernehmen.mjs --export … --deepfake vorschlaege.json
 *   node scripts/bildherkunft-übernehmen.mjs --export … --schreiben          # legt Dateien an
 *   node scripts/bildherkunft-übernehmen.mjs --export … --schreiben --verdrahten
 *   node scripts/bildherkunft-übernehmen.mjs --export … --schreiben --verlust-ok
 *       # überschreibt auch dann, wenn bestehende Deklarationen dabei wegfallen
 *
 * Ohne `--schreiben` passiert nichts — es wird nur berichtet, was passieren würde,
 * einschließlich der Deklarationen, die ein Schreiblauf verwerfen würde.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { alsLiteral, regelZeile } from './bildherkunft-arbeitsliste.mjs';
import { verlustVergleich } from './lib/bildherkunft-verlust.mjs';
import { pruefeBildHerkunftRegeln } from '../src/utils/bildherkunft.js';
import { registryPfad } from './registry-pfad.mjs';

const REGISTRY = registryPfad();

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

// Die Registry zeigt auf den Haupt-Checkout. Arbeitet dort gerade eine andere Session,
// darf dieser Lauf ihn nicht anfassen — dann wird in einen Worktree geschrieben.
// `--nur <slug>` grenzt auf eine Site ein, `--repo <pfad>` verlegt deren Ziel.
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

const KOPF = (slug, anzahl, stand) => `// Angelegt von cw-core/scripts/bildherkunft-übernehmen.mjs aus der Bild-Arbeitsliste,
// seitdem ergänzt von cw-core/scripts/bild-einbauen.mjs bei jedem weiteren Bild.
// Beide Wege sind vorgesehen, und Änderungen von Hand sind erlaubt: der Generator
// überschreibt eine ergänzte Datei nicht mehr, sondern bricht ab und nennt, welche
// Deklarationen fehlen würden (nur \`--verlust-ok\` überstimmt das). Neue Einordnungen
// gehören trotzdem auch in die Arbeitsliste, sonst kennt sie der nächste Lauf nicht.
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
let gesamtVerlust = 0;

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

  // Zweite Gegenprobe, diesmal gegen den Bestand: was steht schon in der Zieldatei, das
  // dieser Lauf nicht kennt? Ohne sie wäre `writeFileSync` ein stiller Totalverlust — in
  // blitzsicht gemessen 72 von 108 Regeln, darunter sechs Art.-50-Einstufungen. Die Datei
  // hat zwei Schreiber (bild-einbauen.mjs ergänzt sie), und nur dieser wusste nichts davon.
  let verlust;
  try {
    verlust = verlustVergleich(existsSync(ziel) ? readFileSync(ziel, 'utf8') : '', zeilen);
  } catch (e) {
    // Unbekannte Zeilenform in der Zieldatei. Nicht schreiben: ohne verlässliche Lesung
    // ist über den Bestand nichts ausgesagt, und „nichts ausgesagt" ist nicht „nichts da".
    bericht.push({ slug, fehler: `Zieldatei nicht lesbar — ${e.message.split('\n')[0]}` });
    continue;
  }

  bericht.push({ slug, geschrieben: zeilen.length, offen, pflicht, befunde, ziel, verlust });
  gesamtPflicht += pflicht;
  gesamtVerlust += verlust.verloren.length;

  if (hatFlag('--schreiben')) {
    if (befunde.length) { console.error(`  ! ${slug}: ${befunde.length} Befunde — NICHT geschrieben`); continue; }
    if (verlust.verloren.length && !hatFlag('--verlust-ok')) {
      console.error(`  ! ${slug}: ${verlust.verloren.length} bestehende Deklarationen gingen verloren — NICHT geschrieben`);
      continue;
    }
    writeFileSync(ziel, inhalt, 'utf8');
  }
}

console.log(`\n${'Site'.padEnd(24)} ${'Regeln'.padStart(7)} ${'offen'.padStart(6)} ${'Label'.padStart(6)} ${'Verlust'.padStart(8)}  Befunde`);
for (const b of bericht) {
  if (b.fehler) { console.log(`${b.slug.padEnd(24)} ${b.fehler}`); continue; }
  const bf = b.befunde.length ? `${b.befunde.length} ✗` : '—';
  const vl = b.verlust.verloren.length ? `${b.verlust.verloren.length} ✗` : '—';
  console.log(`${b.slug.padEnd(24)} ${String(b.geschrieben).padStart(7)} ${String(b.offen).padStart(6)} ${String(b.pflicht).padStart(6)} ${vl.padStart(8)}  ${bf}`);
  for (const f of b.befunde.slice(0, 3)) console.log(`    ${f.field}: ${f.detail}`);
  // Der Probelauf ist die Stelle, an der ein Verlust auffallen soll — nicht erst der
  // Schreiblauf. Deshalb steht er hier und nicht im `--schreiben`-Zweig.
  for (const p of b.verlust.verloren.slice(0, 5)) console.log(`    verliert: ${p}`);
  if (b.verlust.verloren.length > 5) console.log(`    … und ${b.verlust.verloren.length - 5} weitere`);
  // Eine Adresse, die nur die Quelle kennt, ist nicht automatisch falsch — bei einem
  // gelöschten Bild ist sie es aber: dann legt der Lauf eine Regel für eine Datei an,
  // die es nicht mehr gibt (blitzsicht 05.11.2026: jimdo-alternative.webp, pakete.webp).
  for (const p of b.verlust.neuAngelegt.slice(0, 5)) console.log(`    neu: ${p}`);
}
console.log(`\nKennzeichnungspflichtig insgesamt: ${gesamtPflicht}`);
if (gesamtVerlust) {
  console.log(`Bestehende Deklarationen, die dieser Lauf verwirft: ${gesamtVerlust}`);
  console.log('  → in die Arbeitsliste aufnehmen und neu exportieren, oder --verlust-ok setzen.');
}

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

// Eigene Codes für „nichts geschrieben, und zwar aus einem Grund", unterscheidbar von 1
// (Nutzungsfehler, etwa fehlendes --export). Exit 0 hieße hier: der Lauf schreibt nichts,
// meldet aber Erfolg — ein Aufrufer, der nur den Code liest, hielte die Datei für aktuell.
//
// Gemessen am 05.11.2026: ohne Code 3 endete ein Lauf gegen eine unlesbare Zieldatei mit
// Exit 0 und der Meldung mitten in einer Tabelle. Dasselbe galt schon vorher für
// „repo_path fehlt" — eine Site stillschweigend zu überspringen ist kein Erfolg.
const uebersprungen = bericht.filter((b) => b.fehler).length;
if (uebersprungen) process.exit(3);
if (gesamtVerlust && !hatFlag('--verlust-ok')) process.exit(2);
