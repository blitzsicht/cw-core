#!/usr/bin/env node
/**
 * bildherkunft-einordnen — die Deepfake-Frage nach der Verwendung beantworten.
 *
 * Setzt `cw-legal: 04-betroffenheit/D5-art50-reichweite-und-form.md`, Punkt 1 um:
 * die als kennzeichnungspflichtig geführten Bilder nicht nach ihrem Aussehen einordnen,
 * sondern danach, was sie in ihrer Verwendung behaupten.
 *
 * D5s Trennlinie:
 *
 *   > Kennzeichnungspflichtig ist ein KI-Bild dann, wenn ein verständiger Betrachter es
 *   > als Darstellung von etwas Bestimmtem und tatsächlich Vorhandenem versteht, das mit
 *   > diesem Unternehmen zusammenhängt — seine Räume, sein Team, seine Projekte, ein
 *   > benannter Ort. Nicht kennzeichnungspflichtig ist ein Bild, das erkennbar eine
 *   > Leistungsart illustriert, ohne über einen bestimmten Sachverhalt etwas auszusagen.
 *
 * Warum ein Skript und keine Handarbeit an 92 Dateien: Die Einordnung, die heute im
 * Bestand steht, ist aus der versionierten Kette nicht reproduzierbar — weder der Export
 * noch die Vorschlagsdatei tragen ein einziges `'ja'` (gemessen 25.08.2026). Ein erneuter
 * Lauf von `bildherkunft-übernehmen.mjs` würde sie verlieren. Dieses Skript erzeugt die
 * Vorschlagsdatei vollständig, damit die Kette wieder trägt.
 *
 * Eingabe:  Ausgabe von `bildherkunft-verwendung.mjs --out …` (alle Bilder, nicht nur die
 *           pflichtigen) — sie liefert je Bild die Fundstelle als Nachweis.
 * Ausgabe:  `scripts/bildherkunft-vorschlaege.json`, vollständig für den ganzen Bestand.
 *
 * Rechtlicher Rahmen: Art. 50 Abs. 4 UAbs. 1 AI Act, Legaldefinition Art. 3 Nr. 60.
 * Volltext: cw-recht → texte/eu/ai-act/ai-act.md. Keine Rechtsberatung.
 *
 * Lauf:
 *   node scripts/bildherkunft-verwendung.mjs --out /tmp/verwendung.json
 *   node scripts/bildherkunft-einordnen.mjs --verwendung /tmp/verwendung.json
 *   node scripts/bildherkunft-einordnen.mjs --verwendung … --schreiben
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const HIER = dirname(fileURLToPath(import.meta.url));
const ZIEL = join(HIER, 'bildherkunft-vorschlaege.json');

// ---------------------------------------------------------------------------
// Begründungen. Jede zeigt auf die VERWENDUNG, nicht auf das Aussehen — das ist der
// ganze Punkt des Durchgangs. Die Begründung ist der Nachweis; sie muss die Einordnung
// tragen können, wenn jemand sie in zwei Jahren liest.
// ---------------------------------------------------------------------------
export const GRUND = {
  ort: 'Zeigt einen benannten, identifizierbaren Ort und steht auf der Seite zu genau diesem Ort — wird als echte Aufnahme dieses Ortes gelesen (Art. 3 Nr. 60, beide Merkmale erfüllt)',
  betrieb:
    'Zeigt Räume, Einrichtung oder Erzeugnisse des Unternehmens selbst — behauptet den eigenen Betrieb (Art. 3 Nr. 60, beide Merkmale erfüllt)',
  personen:
    'Zeigt Menschen im Zusammenhang mit diesem Unternehmen — wird als Darstellung realer Mitarbeiter gelesen (Art. 3 Nr. 60, beide Merkmale erfüllt)',
  projekt:
    'Steht als Referenz für ausgeführte Arbeit — behauptet ein tatsächlich durchgeführtes Projekt (Art. 3 Nr. 60, beide Merkmale erfüllt)',
  aushaengeschild:
    'Titelbild der Startseite und damit das geteilte Vorschaubild — im Zweifel gekennzeichnet, weil es das prominenteste und am weitesten weitergereichte Bild der Site ist (D5, „Im Zweifel kennzeichnen")',

  leistungsart:
    'Illustriert eine Leistungsart auf der zugehörigen Leistungs- oder Branchenseite, ohne einen bestimmten Ort, ein bestimmtes Projekt oder benannte Personen zu zeigen — sagt über keinen bestimmten Sachverhalt etwas aus (Art. 3 Nr. 60, 2. Merkmal nicht erfüllt)',
  thema:
    'Illustriert ein Thema im redaktionellen Umfeld (Blog, Ratgeber, Glossar) — dient der Veranschaulichung, behauptet keinen bestimmten Sachverhalt über das Unternehmen (Art. 3 Nr. 60, 2. Merkmal nicht erfüllt)',
  nicht_ausgeliefert:
    'Liegt in src/assets/, wird aber von keiner Seite importiert und landet deshalb nicht im Build — erreicht keinen Betrachter, weshalb die Offenlegungspflicht nach Abs. 4 nicht ausgelöst wird',
};

// ---------------------------------------------------------------------------
// Regel je Kontext. Der Kontext kommt aus der Verwendungs-Erhebung.
// ---------------------------------------------------------------------------
const NACH_KONTEXT = {
  stadtseite: ['ja', GRUND.ort],
  team: ['ja', GRUND.personen],
  referenz: ['ja', GRUND.projekt],
  leistungsseite: ['nein', GRUND.leistungsart],
  branchenseite: ['nein', GRUND.leistungsart],
  blog: ['nein', GRUND.thema],
  ungenutzt: ['nein', GRUND.nicht_ausgeliefert],
};

// ---------------------------------------------------------------------------
// Einzelfälle. Sie schlagen die Kontextregel — dort, wo die Erhebung den Sachverhalt
// nicht sehen kann. Jeder Eintrag ist eine bewusste Entscheidung, kein Sonderfall aus
// Bequemlichkeit; der Schlüssel ist `slug::wert` wie in der Vorschlagsdatei.
// ---------------------------------------------------------------------------
const EINZELFAELLE = {
  // Ortsseiten eines Sachverständigenbüros: Luftaufnahmen benannter Orte, angesehen
  // am 25.08.2026 — dieselbe Lage wie die Stadtbilder von soleno und donau-profi.
  'gottl-richter-gomeier::images/hero/donaustauf.webp': ['ja', GRUND.ort],
  'gottl-richter-gomeier::images/hero/uebersee.webp': ['ja', GRUND.ort],

  // Benannter Ort im Titelbild der Startseite (Regensburg bei Abend, angesehen).
  'blitzsicht::images/hero/regensburg-abend.webp': ['ja', GRUND.ort],

  // Eine Webdesign-Agentur bebildert ihre Branchen- und Themenseiten mit Symbolbildern
  // von Gewerken, die sie selbst nicht ausübt. D5 nennt „dachdecker" und „elektriker"
  // ausdrücklich als Beispiel für die Nicht-Pflicht.
  'blitzsicht::images/hero/b2b-dienstleister.webp': ['nein', GRUND.leistungsart],
  'blitzsicht::images/hero/handwerker-sanitaer.webp': ['nein', GRUND.leistungsart],
  'blitzsicht::images/hero/website-anforderungen.webp': ['nein', GRUND.thema],
  'blitzsicht::images/hero/website-anforderungen-datenschutz.webp': ['nein', GRUND.thema],
  'blitzsicht::images/hero/website-anforderungen-handy.webp': ['nein', GRUND.thema],
  'blitzsicht::images/hero/website-audit.webp': ['nein', GRUND.thema],
  'blitzsicht::images/hero/website-handwerker.webp': ['nein', GRUND.thema],
  'blitzsicht::images/hero/wix-alternative.webp': ['nein', GRUND.thema],
  'blitzsicht::images/hero/webdesign-regensburg.webp': ['nein', GRUND.thema],
  'blitzsicht::webdesign-regensburg': ['nein', GRUND.thema],
  'blitzsicht::craftsman-laptop': ['nein', GRUND.leistungsart],
  'blitzsicht::images/hero/originals/craftsman-laptop.webp': ['nein', GRUND.leistungsart],
  // Hero der Referenzseite: illustriert die Seite, benennt aber kein bestimmtes Projekt.
  // Die tatsächlichen Referenzen tragen Kundenlogos, nicht dieses Bild.
  'blitzsicht::images/hero/referenzen.webp': ['nein', GRUND.leistungsart],

  // Sachverständigenbüro: die Leistungsseiten zeigen anonyme Tätigkeitsszenen
  // (bauschaden.webp angesehen am 25.08.2026 — angeschnittenes Gesicht, kein Ort,
  // kein benanntes Objekt). Symbol, keine Tatsachenbehauptung.
  'gottl-richter-gomeier::images/hero/bauschaden.webp': ['nein', GRUND.leistungsart],
  'gottl-richter-gomeier::images/hero/beleihungswert.webp': ['nein', GRUND.leistungsart],
  'gottl-richter-gomeier::images/hero/beratung.webp': ['nein', GRUND.leistungsart],
  'gottl-richter-gomeier::images/hero/betriebskosten.webp': ['nein', GRUND.leistungsart],
  'gottl-richter-gomeier::images/hero/bodenrichtwerte.webp': ['nein', GRUND.leistungsart],
  'gottl-richter-gomeier::images/hero/fuer-anwaelte.webp': ['nein', GRUND.leistungsart],
  'gottl-richter-gomeier::images/hero/fuer-steuerberater.webp': ['nein', GRUND.leistungsart],
  'gottl-richter-gomeier::images/hero/honorare.webp': ['nein', GRUND.leistungsart],
  'gottl-richter-gomeier::images/hero/mieten.webp': ['nein', GRUND.leistungsart],
  'gottl-richter-gomeier::images/hero/wertermittlung.webp': ['nein', GRUND.leistungsart],

  // Bäckerei: Backstube, Filialen und Erzeugnisse behaupten durchweg den eigenen
  // Betrieb. D5 nennt „zink-baeckerei Ladenfront, Backstube" als Beispiel der Pflicht.
  'zink-baeckerei::backstube': ['ja', GRUND.betrieb],
  'zink-baeckerei::brot': ['ja', GRUND.betrieb],
  'zink-baeckerei::cafe': ['ja', GRUND.betrieb],
  'zink-baeckerei::konditorei': ['ja', GRUND.betrieb],
  'zink-baeckerei::snacks': ['ja', GRUND.betrieb],
  'zink-baeckerei::cafe-zink-donau-einkaufszentrum': ['ja', GRUND.betrieb],
  'zink-baeckerei::pfakofen-zentrale': ['ja', GRUND.betrieb],
  'zink-baeckerei::regensburg-pruefening': ['ja', GRUND.betrieb],
  'zink-baeckerei::geiselhoering': ['ja', GRUND.betrieb],
  'zink-baeckerei::koefering': ['ja', GRUND.betrieb],
  'zink-baeckerei::obertraubling': ['ja', GRUND.betrieb],
  'zink-baeckerei::schierling': ['ja', GRUND.betrieb],
  'zink-baeckerei::sinzing': ['ja', GRUND.betrieb],

  // Elektrobetrieb: Team und Montageszenen zeigen Menschen im Zusammenhang mit dem
  // Betrieb; die Gewerke-Kacheln illustrieren dagegen eine Leistungsart.
  'mika-elektrotechnik::team': ['ja', GRUND.personen],
  'mika-elektrotechnik::installation': ['ja', GRUND.personen],
  'mika-elektrotechnik::gebaeudetechnik': ['nein', GRUND.leistungsart],
  'mika-elektrotechnik::notdienst': ['nein', GRUND.leistungsart],
  'mika-elektrotechnik::photovoltaik': ['nein', GRUND.leistungsart],
  'mika-elektrotechnik::smart-home': ['nein', GRUND.leistungsart],
  'mika-elektrotechnik::wallbox': ['nein', GRUND.leistungsart],

  // Bürotechnik-Händler: Leistungs- und Glossarbilder ohne bestimmten Sachverhalt.
  'digital-direkt::dokumentmanagement': ['nein', GRUND.leistungsart],
  'digital-direkt::druck-kopierloesungen': ['nein', GRUND.leistungsart],
  'digital-direkt::drucker-leasing': ['nein', GRUND.thema],
  'digital-direkt::kuvertier-frankierkonzepte': ['nein', GRUND.thema],
  'digital-direkt::managed-print': ['nein', GRUND.thema],
  'digital-direkt::service-wartung': ['nein', GRUND.thema],

  // Sanierungsbetrieb: die Referenzbilder stehen für ausgeführte Projekte.
  'steller-sanierungen::fassadensanierung': ['ja', GRUND.projekt],
  'steller-sanierungen::komplettsanierung': ['ja', GRUND.projekt],
  'steller-sanierungen::fassadensanierung-illustration': ['ja', GRUND.projekt],
  'steller-sanierungen::innenarbeiten-illustration': ['ja', GRUND.projekt],
  'steller-sanierungen::komplettsanierung-illustration': ['ja', GRUND.projekt],

  // Übersichtskachel der Leistungsseite — Leistungsart, kein bestimmtes Objekt.
  'donau-profi::leistungen/_overview.webp': ['nein', GRUND.leistungsart],
};

// Titelbilder der Startseite: bleiben gekennzeichnet. Sie sind das og:image und damit
// das Bild, das beim Teilen den Kontext verliert — D5 („Hero, og:image, alles Teilbare").
const AUSHAENGESCHILD = new Set(['hero', 'images/hero/hero.webp', 'images/hero/hero-poster.webp']);

/**
 * Einordnung eines einzelnen Bildes.
 * @param {string} slug
 * @param {{wert: string, kontext: string, herkunft: string}} bild
 * @returns {{d: 'ja'|'nein', b: string, quelle: string}}
 */
export function ordneEin(slug, bild) {
  const key = `${slug}::${bild.wert}`;
  if (EINZELFAELLE[key]) {
    const [d, b] = EINZELFAELLE[key];
    return { d, b, quelle: 'einzelfall' };
  }
  if (AUSHAENGESCHILD.has(bild.wert)) {
    return { d: 'ja', b: GRUND.aushaengeschild, quelle: 'aushaengeschild' };
  }
  if (NACH_KONTEXT[bild.kontext]) {
    const [d, b] = NACH_KONTEXT[bild.kontext];
    return { d, b, quelle: `kontext:${bild.kontext}` };
  }
  // Kein Muster greift: die Pflicht bleibt bestehen. Eine Verneinung ohne tragende
  // Begründung wäre die teuerste Fehlerart — D5, „Im Zweifel kennzeichnen".
  return { d: 'ja', b: GRUND.aushaengeschild, quelle: 'im-zweifel' };
}

// --- Lauf -------------------------------------------------------------------
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const argWert = (n, f = null) => {
    const i = process.argv.indexOf(n);
    return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : f;
  };
  const verwendungDatei = argWert('--verwendung');
  if (!verwendungDatei || !existsSync(verwendungDatei)) {
    console.error('Fehlt: --verwendung <datei.json> (Ausgabe von bildherkunft-verwendung.mjs)');
    process.exit(1);
  }
  const exportDatei = argWert('--export');
  if (!exportDatei || !existsSync(exportDatei)) {
    console.error('Fehlt: --export <datei.json> (derselbe Export, den übernehmen.mjs liest)');
    process.exit(1);
  }

  const verwendung = JSON.parse(readFileSync(verwendungDatei, 'utf8'));

  // Der Schlüssel der Vorschlagsdatei ist `slug::datei` — und `datei` ist der volle Pfad
  // im Repo, nicht der Deklarationswert. Bei `stem`-Regeln fallen die beiden auseinander:
  // wert `backstube` gehört zu datei `src/assets/images/backstube.webp`. Wer hier den
  // Deklarationswert einsetzt, schreibt Einträge, die `übernehmen.mjs` nie findet — der
  // Lauf meldet sie dann als „offen", und die Einordnung geht still verloren.
  // Deshalb wird die Zuordnung aus demselben Export gelesen, den auch übernehmen.mjs liest.
  const exportDaten = JSON.parse(readFileSync(exportDatei, 'utf8'));
  const zuDatei = new Map();
  for (const [slug, liste] of Object.entries(exportDaten.sites)) {
    for (const b of liste) zuDatei.set(`${slug}::${b.key}::${b.wert}`, b.datei);
  }
  // Der Altbestand trägt die 127 Grafik-Verneinungen, die nicht neu bewertet werden:
  // ihnen fehlt schon Merkmal 1 (sie ähneln nichts Wirklichem).
  const alt = existsSync(ZIEL) ? JSON.parse(readFileSync(ZIEL, 'utf8')) : {};

  // Vollständig neu aufbauen statt in den Altbestand hineinzuschreiben. Grund: 70 der
  // 150 Alteinträge tragen ein `public/`-Präfix, das `übernehmen.mjs` nie nachschlägt —
  // sie sahen wie Einordnungen aus, wirkten aber nie. Ein Merge würde sie mitschleppen
  // und die Datei zur Hälfte aus Blindgängern bestehen lassen. Was noch gebraucht wird,
  // kommt unten über `quelle: 'bestand'` wieder herein, mit dem Schlüssel des Exports.
  const neu = {};

  const bilanz = { ja: 0, nein: 0, gewechselt: 0, unveraendert: 0 };
  const wechsel = [];

  // Zwei Durchgänge in einem: die pflichtig geführten Bilder werden nach der Verwendung
  // neu eingeordnet, alle übrigen mit ihrer bestehenden Einordnung übernommen. Nur so
  // trägt die Kette wieder vollständig — eine Vorschlagsdatei, die nur die Hälfte des
  // Bestands kennt, lässt den Rest beim nächsten Lauf als „offen" liegen.
  let uebernommen = 0;
  let ohneZuordnung = 0;
  for (const [slug, liste] of Object.entries(verwendung.sites)) {
    for (const b of liste) {
      const datei = zuDatei.get(`${slug}::${b.key}::${b.wert}`);
      if (!datei) {
        // Ohne Zuordnung wäre der Eintrag ein Blindgänger: er stünde in der Datei und
        // würde nie gefunden. Lieber laut fehlen als still danebenliegen.
        ohneZuordnung++;
        continue;
      }
      const key = `${slug}::${datei}`;

      if (b.deepfake_alt !== 'ja') {
        // Menschliche Fotos tragen die Einordnung bewusst nicht (sie wäre redundant) —
        // sie gehören auch nicht in die Vorschlagsdatei.
        if (b.deepfake_alt !== 'nein') continue;
        neu[key] = {
          h: b.herkunft,
          d: 'nein',
          art: alt[key]?.art ?? 'grafik',
          b: b.begruendung_alt || alt[key]?.b || GRUND.thema,
          verwendung: b.kontext,
          quelle: 'bestand',
        };
        uebernommen++;
        continue;
      }

      const e = ordneEin(slug, b);
      neu[key] = { h: b.herkunft, d: e.d, art: 'foto', b: e.b, verwendung: b.kontext, quelle: e.quelle };
      bilanz[e.d]++;
      if (e.d !== b.deepfake_alt) {
        bilanz.gewechselt++;
        wechsel.push({ slug, wert: b.wert, von: b.deepfake_alt, nach: e.d, kontext: b.kontext, quelle: e.quelle });
      } else bilanz.unveraendert++;
    }
  }
  bilanz.uebernommen = uebernommen;
  bilanz.ohneZuordnung = ohneZuordnung;

  console.log(`\nEingeordnet: ${bilanz.ja + bilanz.nein} Bilder`);
  console.log(`  bleibt Pflicht:   ${bilanz.ja}`);
  console.log(`  faellt heraus:    ${bilanz.nein}`);
  console.log(`  unveraendert:     ${bilanz.unveraendert}`);
  console.log(`  gewechselt:       ${bilanz.gewechselt}`);
  console.log(`  aus Bestand:      ${bilanz.uebernommen} (Grafik-Verneinungen, nicht neu bewertet)`);
  if (bilanz.ohneZuordnung) console.log(`  OHNE ZUORDNUNG:   ${bilanz.ohneZuordnung} — im Export nicht gefunden, PRUEFEN`);

  const jeSlug = {};
  for (const w of wechsel) jeSlug[w.slug] = (jeSlug[w.slug] || 0) + 1;
  console.log('\nWegfaelle je Site:');
  for (const [s, n] of Object.entries(jeSlug).sort((a, b) => b[1] - a[1])) console.log(`  ${s.padEnd(26)} ${n}`);

  if (process.argv.includes('--schreiben')) {
    writeFileSync(ZIEL, JSON.stringify(neu, null, 2) + '\n', 'utf8');
    console.log(`\nGeschrieben: ${ZIEL} (${Object.keys(neu).length} Eintraege)`);
  } else {
    console.log('\n(ohne --schreiben wurde nichts geaendert)');
  }
}
