// @ts-check
/**
 * Tests für die Bild-Herkunfts-Auflösung (Art. 50 Abs. 4 UAbs. 1 AI Act).
 *
 * Lauf: `node --test tests/utils/bildherkunft.test.js`
 * Oder über Skript: `pnpm test`
 *
 * Anlass (2026-08-24): Auf den Kundenseiten sind KI-erzeugte Bilder im Einsatz.
 * Art. 50 gilt seit dem 02.08.2026 (Art. 113 nimmt Kapitel IV in keiner Ausnahme
 * aus). Betreiber müssen offenlegen, wenn ein KI-Bild ein Deepfake ist. Dem Bild
 * sieht der Code seine Herkunft nicht an — gemessen am 24.08.2026 trägt kein
 * einziges Bild der Flotte einen Herkunftsmarker, weil sharp beim Transform alles
 * strippt. Die Herkunft muss deshalb deklariert werden.
 *
 * Der wichtigste Test ist der ERSTE: ohne passende Regel ist das Ergebnis
 * `ungeklaert`, NICHT `mensch`. Ein stiller Fallback auf „menschliches Foto"
 * würde jedes undeklarierte Bild grün melden und die Pflicht dauerhaft verdecken —
 * genau der Fehler, den die Roadmap für A1 benennt.
 *
 * Abdeckung:
 *   1. Ohne Regelwerk → ungeklaert (Negativ-Guard gegen stillen Default)
 *   2. Site-Default als Regel greift
 *   3. Längster Präfix gewinnt (Ausnahme innerhalb eines Ordners)
 *   4. Pfad-Normalisierung (führende Slashes, Backslashes)
 *   5. Kennzeichnungspflicht nur bei ki-* UND deepfake='ja'
 *   6. deepfake='nein' bei KI-Bild → keine Pflicht
 *   7. Widerspruch mensch+deepfake='ja' → Regel ungültig, ungeklaert
 *   8. deepfake gesetzt ohne begruendung → Regel ungültig, ungeklaert
 *   9. Unbekannter herkunft-Wert → Regel ungültig, ungeklaert
 *  10. ki-* ohne deepfake-Angabe → deepfake ungeklaert, keine Pflicht, Befund
 *  11. pruefeBildHerkunftRegeln meldet kaputte Regeln unabhängig vom Bild
 *  12. TODO-Platzhalter aus der Vorlage zählen nicht als Deklaration
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveBildHerkunft,
  istKennzeichnungspflichtig,
  pruefeBildHerkunftRegeln,
  HERKUNFT_WERTE,
  DEEPFAKE_WERTE,
} from '../../src/utils/bildherkunft.js';

test('1. ohne Regelwerk ist das Ergebnis ungeklaert, nicht mensch', () => {
  for (const data of [{}, { bildHerkunft: [] }, { bildHerkunft: null }, null]) {
    const r = resolveBildHerkunft(data, 'images/team/chef.webp');
    assert.equal(r.herkunft, 'ungeklaert', 'kein stiller Fallback auf mensch');
    assert.equal(istKennzeichnungspflichtig(r), false);
    assert.equal(r.quelle, null, 'keine Regel hat gegriffen');
    // Die tragende Invariante: `problem === null` heißt „nichts zu tun". Ein undeklariertes
    // Bild darf diesen Zustand nicht erreichen, sonst liest sich die Lücke als Unbedenklichkeit.
    assert.notEqual(r.problem, null, 'fehlende Deklaration ist selbst ein Befund');
    assert.match(r.problem, /Deklaration/i);
  }
});

test('1b. Regelwerk vorhanden, aber kein Präfix passt → ungeklaert mit Befund', () => {
  const data = { bildHerkunft: [{ pathPrefix: 'images/produkte/', herkunft: 'mensch' }] };
  const r = resolveBildHerkunft(data, 'images/team/chef.webp');
  assert.equal(r.herkunft, 'ungeklaert');
  assert.equal(r.quelle, null);
  assert.match(r.problem, /Deklaration/i);
});

test('1c. Invariante: problem === null nur dort, wo wirklich nichts zu tun ist', () => {
  const data = {
    bildHerkunft: [
      { pathPrefix: 'images/', herkunft: 'mensch' },
      { pathPrefix: 'images/team/', herkunft: 'ki-erzeugt', deepfake: 'ja', begruendung: 'Team existiert so nicht' },
      { pathPrefix: 'images/render/', herkunft: 'ki-erzeugt', deepfake: 'nein', begruendung: 'Erkennbar Rendering' },
      { pathPrefix: 'images/offen/', herkunft: 'ki-erzeugt' }, // Einordnung fehlt
    ],
  };
  const sauber = ['images/halle.webp', 'images/team/x.webp', 'images/render/y.webp'];
  for (const p of sauber) {
    assert.equal(resolveBildHerkunft(data, p).problem, null, `${p} sollte befundfrei sein`);
  }
  for (const p of ['images/offen/z.webp', 'ganz/woanders.webp']) {
    assert.notEqual(resolveBildHerkunft(data, p).problem, null, `${p} braucht einen Befund`);
  }
});

test('2. Site-Default als Regel greift', () => {
  const data = { bildHerkunft: [{ pathPrefix: 'images/', herkunft: 'mensch' }] };
  const r = resolveBildHerkunft(data, 'images/team/chef.webp');
  assert.equal(r.herkunft, 'mensch');
  assert.equal(r.quelle, 'images/');
  assert.equal(istKennzeichnungspflichtig(r), false);
});

test('3. längster Präfix gewinnt — Ausnahme innerhalb eines Ordners', () => {
  const data = {
    bildHerkunft: [
      { pathPrefix: 'images/', herkunft: 'mensch' },
      {
        pathPrefix: 'images/team/',
        herkunft: 'ki-erzeugt',
        deepfake: 'ja',
        begruendung: 'Fotorealistisches Team, das so nie existiert hat',
      },
      {
        pathPrefix: 'images/team/logo-',
        herkunft: 'mensch',
      },
    ],
  };
  const team = resolveBildHerkunft(data, 'images/team/gruppe.webp');
  assert.equal(team.herkunft, 'ki-erzeugt');
  assert.equal(team.quelle, 'images/team/');
  assert.equal(istKennzeichnungspflichtig(team), true);

  // Die längere Ausnahme sticht die Ordnerregel.
  const logo = resolveBildHerkunft(data, 'images/team/logo-partner.webp');
  assert.equal(logo.herkunft, 'mensch');
  assert.equal(logo.quelle, 'images/team/logo-');
  assert.equal(istKennzeichnungspflichtig(logo), false);
});

test('4. Pfade werden normalisiert (führender Slash, Backslashes)', () => {
  const data = { bildHerkunft: [{ pathPrefix: '/images/', herkunft: 'mensch' }] };
  for (const p of ['images/a.webp', '/images/a.webp', 'images\\a.webp', '//images/a.webp']) {
    assert.equal(resolveBildHerkunft(data, p).herkunft, 'mensch', `Pfad ${p}`);
  }
});

test('5. Kennzeichnungspflicht nur bei ki-* UND deepfake=ja', () => {
  const mit = (herkunft, deepfake) =>
    resolveBildHerkunft(
      {
        bildHerkunft: [
          { pathPrefix: 'i/', herkunft, deepfake, begruendung: deepfake ? 'Begruendung' : undefined },
        ],
      },
      'i/x.webp',
    );

  assert.equal(istKennzeichnungspflichtig(mit('ki-erzeugt', 'ja')), true);
  assert.equal(istKennzeichnungspflichtig(mit('ki-veraendert', 'ja')), true);
  assert.equal(istKennzeichnungspflichtig(mit('ki-erzeugt', 'nein')), false);
  assert.equal(istKennzeichnungspflichtig(mit('mensch', undefined)), false);
});

test('6. KI-Bild mit deepfake=nein löst keine Pflicht aus', () => {
  const data = {
    bildHerkunft: [
      {
        pathPrefix: 'images/render/',
        herkunft: 'ki-erzeugt',
        deepfake: 'nein',
        begruendung: 'Erkennbar illustratives Rendering, wirkt nicht als Aufnahme',
      },
    ],
  };
  const r = resolveBildHerkunft(data, 'images/render/produkt.webp');
  assert.equal(r.herkunft, 'ki-erzeugt');
  assert.equal(r.deepfake, 'nein');
  assert.equal(istKennzeichnungspflichtig(r), false);
  assert.equal(r.problem, null);
  // Der Nachweis muss trotzdem dastehen — die Verneinung ist die begründungspflichtige Aussage.
  assert.match(r.begruendung, /Rendering/);
});

test('7. Widerspruch mensch + deepfake=ja ist ein Regelfehler, kein Ergebnis', () => {
  const data = {
    bildHerkunft: [
      { pathPrefix: 'i/', herkunft: 'mensch', deepfake: 'ja', begruendung: 'irgendwas' },
    ],
  };
  const r = resolveBildHerkunft(data, 'i/x.webp');
  assert.equal(r.herkunft, 'ungeklaert', 'widersprüchliche Regel darf nicht still gewinnen');
  assert.notEqual(r.problem, null);
  assert.match(r.problem, /mensch|Widerspruch|ohne KI/i);
});

test('8. deepfake gesetzt ohne begruendung → Regel ungültig', () => {
  for (const deepfake of ['ja', 'nein']) {
    const data = { bildHerkunft: [{ pathPrefix: 'i/', herkunft: 'ki-erzeugt', deepfake }] };
    const r = resolveBildHerkunft(data, 'i/x.webp');
    assert.equal(r.herkunft, 'ungeklaert', `deepfake=${deepfake} ohne Begründung`);
    assert.match(r.problem, /begruendung/i);
    assert.equal(istKennzeichnungspflichtig(r), false);
  }
});

test('9. unbekannter herkunft-Wert → Regel ungültig', () => {
  const data = { bildHerkunft: [{ pathPrefix: 'i/', herkunft: 'vielleicht-ki' }] };
  const r = resolveBildHerkunft(data, 'i/x.webp');
  assert.equal(r.herkunft, 'ungeklaert');
  assert.match(r.problem, /herkunft/i);
});

test('10. KI-Bild ohne deepfake-Angabe: keine Pflicht, aber Befund', () => {
  const data = { bildHerkunft: [{ pathPrefix: 'i/', herkunft: 'ki-erzeugt' }] };
  const r = resolveBildHerkunft(data, 'i/x.webp');
  assert.equal(r.herkunft, 'ki-erzeugt');
  assert.equal(r.deepfake, 'ungeklaert');
  assert.equal(istKennzeichnungspflichtig(r), false, 'ungeklaert ist keine Pflicht …');
  assert.notEqual(r.problem, null, '… aber auch nicht grün');
  assert.match(r.problem, /deepfake|Einordnung/i);
});

test('11. pruefeBildHerkunftRegeln meldet kaputte Regeln unabhängig vom Bild', () => {
  const data = {
    bildHerkunft: [
      { pathPrefix: 'images/', herkunft: 'mensch' }, // ok
      { pathPrefix: 'images/a/', herkunft: 'ki-erzeugt', deepfake: 'ja' }, // begruendung fehlt
      { pathPrefix: 'images/b/', herkunft: 'quatsch' }, // Wert unbekannt
      { herkunft: 'mensch' }, // pathPrefix fehlt
      { pathPrefix: 'images/c/', herkunft: 'mensch', deepfake: 'ja', begruendung: 'x' }, // Widerspruch
    ],
  };
  const probleme = pruefeBildHerkunftRegeln(data);
  assert.equal(probleme.length, 4, `erwartet 4 Befunde, bekommen: ${JSON.stringify(probleme)}`);
  for (const p of probleme) {
    assert.equal(typeof p.field, 'string');
    assert.equal(typeof p.detail, 'string');
  }
  // Die gültige Regel darf nicht gemeldet werden.
  assert.equal(probleme.some((p) => p.field.includes('[0]')), false);
});

test('11b. gültiges Regelwerk erzeugt keine Befunde', () => {
  const data = {
    bildHerkunft: [
      { pathPrefix: 'images/', herkunft: 'mensch' },
      { pathPrefix: 'images/team/', herkunft: 'ki-erzeugt', deepfake: 'ja', begruendung: 'Team existiert so nicht' },
    ],
  };
  assert.deepEqual(pruefeBildHerkunftRegeln(data), []);
});

test('12. TODO-Platzhalter zählt nicht als Deklaration', () => {
  const data = {
    bildHerkunft: [
      { pathPrefix: 'images/', herkunft: 'ki-erzeugt', deepfake: 'ja', begruendung: 'TODO: einordnen' },
    ],
  };
  const r = resolveBildHerkunft(data, 'images/x.webp');
  assert.equal(r.herkunft, 'ungeklaert');
  assert.match(r.problem, /begruendung|Platzhalter/i);
});

test('13. die Wertelisten sind exportiert und vollständig', () => {
  assert.deepEqual(HERKUNFT_WERTE, ['mensch', 'ki-erzeugt', 'ki-veraendert', 'ungeklaert']);
  assert.deepEqual(DEEPFAKE_WERTE, ['ja', 'nein', 'ungeklaert']);
});

/*
 * Bilder unter `src/assets/` laufen durch die Astro-Assetpipeline und landen im dist als
 * `_astro/<name>.<hash>.webp`. Ein Pfad-Präfix trifft sie deshalb nie — und genau dort
 * liegen bei mehreren Sites die heikelsten Motive (`handwerker-hero`, `craftsman-laptop`,
 * Portraits). Die Pipeline löst das seit jeher über den Stem (`descForFile` in
 * geotag-core.js schneidet mit `split('.')[0]` den Hash ab); dieselbe Mechanik gilt hier.
 */

test('14. stem-Regel greift auf den gehashten dist-Namen', () => {
  const data = {
    bildHerkunft: [
      {
        stem: 'handwerker-hero',
        herkunft: 'ki-erzeugt',
        deepfake: 'ja',
        begruendung: 'Fotorealistische Szene, die es so nie gab',
      },
    ],
  };
  for (const p of ['_astro/handwerker-hero.Bng-bGX1.webp', '_astro/handwerker-hero.webp', 'handwerker-hero.webp']) {
    const r = resolveBildHerkunft(data, p);
    assert.equal(r.herkunft, 'ki-erzeugt', `Pfad ${p}`);
    assert.equal(istKennzeichnungspflichtig(r), true);
    assert.equal(r.quelle, 'stem:handwerker-hero');
  }
});

test('14b. stem trifft nur den ganzen Namen, nicht einen Namensteil', () => {
  const data = { bildHerkunft: [{ stem: 'hero', herkunft: 'mensch' }] };
  assert.equal(resolveBildHerkunft(data, '_astro/hero.abc123.webp').herkunft, 'mensch');
  // „hero-gross" ist ein anderes Bild und darf nicht mitgefangen werden.
  assert.equal(resolveBildHerkunft(data, '_astro/hero-gross.abc123.webp').herkunft, 'ungeklaert');
});

test('15. pathPrefix schlägt stem — in BEIDEN Reihenfolgen', () => {
  const stemRegel = { stem: 'hero', herkunft: 'ki-erzeugt', deepfake: 'ja', begruendung: 'aus dem Generator' };
  const pfadRegel = { pathPrefix: 'images/hero.webp', herkunft: 'mensch' };

  // Die Reihenfolge im Array darf das Ergebnis nicht ändern. Mit nur einer der beiden
  // Reihenfolgen wäre der Test blind: der Vorrang wird in der Schleife an zwei Stellen
  // durchgesetzt, und jede greift nur bei einer der Anordnungen.
  for (const [name, regeln] of [
    ['stem zuerst', [stemRegel, pfadRegel]],
    ['pathPrefix zuerst', [pfadRegel, stemRegel]],
  ]) {
    const r = resolveBildHerkunft({ bildHerkunft: regeln }, 'images/hero.webp');
    assert.equal(r.herkunft, 'mensch', `${name}: der konkrete Pfad ist spezifischer als der bloße Name`);
    assert.equal(r.quelle, 'images/hero.webp', name);
    assert.equal(istKennzeichnungspflichtig(r), false, name);
  }
});

test('16. Regel ohne pathPrefix und ohne stem ist ungültig', () => {
  const befunde = pruefeBildHerkunftRegeln({ bildHerkunft: [{ herkunft: 'mensch' }] });
  assert.equal(befunde.length, 1);
  assert.match(befunde[0].detail, /pathPrefix|stem/i);
});

test('17. doppelte stems im Regelwerk sind ein Befund', () => {
  const data = {
    bildHerkunft: [
      { stem: 'hero', herkunft: 'mensch' },
      { stem: 'hero', herkunft: 'ki-erzeugt', deepfake: 'ja', begruendung: 'generiert' },
    ],
  };
  const befunde = pruefeBildHerkunftRegeln(data);
  assert.equal(befunde.length, 1, `erwartet 1 Befund, bekommen: ${JSON.stringify(befunde)}`);
  assert.match(befunde[0].detail, /doppelt|mehrfach|eindeutig/i);
});

/*
 * Rund 110 der 262 Flottenbilder sind Logos, isometrische Illustrationen, Textkarten oder
 * freigestellte Produktaufnahmen. Bei denen ist die Herkunft für Art. 50 Abs. 4 UAbs. 1
 * ohne Belang: Die Norm greift nur, wenn der Inhalt ein Deepfake IST — und ein Piktogramm
 * eines Druckers aehnelt nichts Wirklichem, egal womit es gezeichnet wurde.
 *
 * Die erste Fassung zwang trotzdem zu einer Herkunftsangabe. Das ist schlechter als es
 * aussieht: Wer die Herkunft nicht kennt, muesste raten, und geraten würde reihenweise
 * „mensch" — eine Behauptung ueber die Entstehung, die niemand belegen kann, mitten in
 * einem Dokument, das gerade als Nachweis dienen soll.
 */

test('19. Herkunft offen, Deepfake-Frage aber verneinbar — das ist vollständig', () => {
  const data = {
    bildHerkunft: [
      {
        pathPrefix: 'images/icons/drucker.svg',
        herkunft: 'ungeklaert',
        deepfake: 'nein',
        begruendung: 'Isometrische Illustration — ähnelt nichts Wirklichem, kann kein Deepfake sein',
      },
    ],
  };
  const r = resolveBildHerkunft(data, 'images/icons/drucker.svg');
  assert.equal(r.herkunft, 'ungeklaert');
  assert.equal(r.deepfake, 'nein');
  assert.equal(istKennzeichnungspflichtig(r), false);
  assert.equal(r.problem, null, 'das ist eine fertige Aussage, kein offener Punkt');
  assert.deepEqual(pruefeBildHerkunftRegeln(data), []);
});

test('19b. Herkunft offen + deepfake=ja bleibt ein Widerspruch', () => {
  // Wer weiss, dass es ein Deepfake ist, weiss auch, dass KI im Spiel war — die Definition
  // setzt KI-Erzeugung oder -Manipulation voraus. „Herkunft unbekannt, aber Deepfake" ist
  // deshalb keine moegliche Aussage, sondern ein Denkfehler.
  const data = {
    bildHerkunft: [
      { pathPrefix: 'i/', herkunft: 'ungeklaert', deepfake: 'ja', begruendung: 'wirkt echt' },
    ],
  };
  assert.equal(pruefeBildHerkunftRegeln(data).length, 1);
  assert.match(pruefeBildHerkunftRegeln(data)[0].detail, /Widerspruch|KI/i);
  assert.equal(resolveBildHerkunft(data, 'i/x.webp').herkunft, 'ungeklaert');
  assert.equal(istKennzeichnungspflichtig(resolveBildHerkunft(data, 'i/x.webp')), false);
});

test('19c. mensch + deepfake bleibt ein Fehler — die Angabe ist dort redundant', () => {
  for (const d of ['ja', 'nein']) {
    const data = { bildHerkunft: [{ pathPrefix: 'i/', herkunft: 'mensch', deepfake: d, begruendung: 'x' }] };
    assert.equal(pruefeBildHerkunftRegeln(data).length, 1, `mensch + deepfake=${d}`);
  }
});

test('19d. auch hier ist die Begründung Pflicht', () => {
  const data = { bildHerkunft: [{ pathPrefix: 'i/', herkunft: 'ungeklaert', deepfake: 'nein' }] };
  assert.equal(pruefeBildHerkunftRegeln(data).length, 1);
  assert.match(pruefeBildHerkunftRegeln(data)[0].detail, /begruendung/i);
});

test('19e. bloßes ungeklaert ohne jede Einordnung bleibt ein Befund', () => {
  const data = { bildHerkunft: [{ pathPrefix: 'i/', herkunft: 'ungeklaert' }] };
  const r = resolveBildHerkunft(data, 'i/x.webp');
  assert.notEqual(r.problem, null, 'ohne Deepfake-Aussage ist nichts entschieden');
  assert.equal(pruefeBildHerkunftRegeln(data).length, 1);
});

test('18. Deklaration per stem ohne Einordnung bleibt ebenfalls nicht grün', () => {
  const data = { bildHerkunft: [{ stem: 'portrait', herkunft: 'ki-veraendert' }] };
  const r = resolveBildHerkunft(data, '_astro/portrait.xyz.webp');
  assert.equal(r.deepfake, 'ungeklaert');
  assert.equal(istKennzeichnungspflichtig(r), false);
  assert.notEqual(r.problem, null);
});
