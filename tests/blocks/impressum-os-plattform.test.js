// @ts-check
/**
 * Der Impressum-Baustein verlinkt die eingestellte OS-Plattform nicht mehr —
 * und behaelt die VSBG-Klausel.
 *
 * Lauf: `node --test tests/blocks/impressum-os-plattform.test.js`
 *
 * ANLASS (blitzsicht-ops#702): `ImpressumBlock.astro` verlinkte im Zweig
 * `osPlatformDisclaimer` die EU-Plattform zur Online-Streitbeilegung. Die wurde am
 * 20.07.2025 durch VO (EU) 2024/3228 eingestellt; die URL liefert weiterhin HTTP 200
 * und leitet auf eine Abschiedsseite der Kommission. Kein toter Link im technischen
 * Sinn — eine Rechtsangabe, die nicht mehr stimmt. Gemessen trugen ihn 11 von 14
 * Impressen der Flotte.
 *
 * 🔴 WARUM DIESER TEST NICHT AUF DIE ZEICHENKETTE PRUEFT:
 * Genau daran ist die Messung in blitzsicht-ops#659 gescheitert — ein Substring-Zaehler
 * traf die URL auch dort, wo sie als Text im Skriptkoerper stand, und meldete die
 * behobene Seite als Befund. Hier steht die URL bewusst im Erklaer-Kommentar der
 * Komponente; ein `includes('consumers/odr')` waere deshalb IMMER rot und damit
 * nutzlos. Geprueft wird ein echtes `<a href>`-Tag — das trennt „erklaert" von
 * „verlinkt".
 *
 * Die zweite Haelfte ist die wichtigere: Der Zweig traegt ZWEI Aussagen, und nur eine
 * ist hinfaellig. Ein Test, der nur das Verschwinden des Links prueft, waere auch dann
 * gruen, wenn jemand den ganzen Abschnitt loescht — und damit die Erklaerung nach
 * § 36 VSBG. Das ist der naheliegende Fehler, nicht der ferne.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const QUELLE = resolve(import.meta.dirname, '../../src/components/blocks/ImpressumBlock.astro');
const src = readFileSync(QUELLE, 'utf-8');

/** Echte Hyperlinks auf die OS-Plattform — Tag-Attribute, nicht Fliesstext. */
const OS_LINKS = /<a\b[^>]*href=["'][^"']*(?:ec\.europa\.eu\/consumers\/odr|webgate\.ec\.europa\.eu\/odr)/gi;

test('kein <a href> auf die eingestellte OS-Plattform', () => {
  const treffer = src.match(OS_LINKS) ?? [];
  assert.deepEqual(treffer, [], 'ImpressumBlock verlinkt wieder die am 20.07.2025 eingestellte OS-Plattform');
});

test('das Suchmuster kann ueberhaupt anschlagen — sonst prueft der Test oben nichts', () => {
  // Gegenprobe im Test selbst: derselbe Ausdruck gegen den Zustand VOR dem Fix.
  // Ohne sie waere die leere Trefferliste oben auch dann gruen, wenn das Regex
  // schlicht kaputt ist (blitzsicht-ops#659, dieselbe Fehlerklasse).
  const vorher = `<p>Die Europäische Kommission stellt eine Plattform bereit:
    <a href="https://ec.europa.eu/consumers/odr/" target="_blank" rel="noopener">Link</a>.</p>`;
  assert.equal((vorher.match(OS_LINKS) ?? []).length, 1);
});

test('die URL im Erklaer-Kommentar ist KEIN Befund', () => {
  // Sie steht dort absichtlich — der Kommentar begruendet, warum der Link weg ist.
  // Ein Substring-Zaehler wuerde sie treffen und diesen Test unmoeglich machen.
  assert.ok(src.includes('consumers/odr'), 'Erklaer-Kommentar fehlt — dann ist dieser Test gegenstandslos');
  assert.deepEqual(src.match(OS_LINKS) ?? [], []);
});

test('die VSBG-Klausel steht weiterhin im Baustein', () => {
  // Der Satz nach § 36 VSBG ist von der Abschaltung der Plattform unberuehrt.
  assert.match(
    src,
    /Wir sind nicht bereit oder verpflichtet, an Streitbeilegungsverfahren vor einer\s+Verbraucherschlichtungsstelle teilzunehmen/,
    '§ 36-VSBG-Erklaerung beim Entfernen des Links mit verloren gegangen',
  );
});

/**
 * Nur der GERENDERTE Zweig, ohne Kommentare.
 *
 * 🔴 Die erste Fassung des Tests unten pruefte `src` als Ganzes — und blieb
 * beim Gegenbeweis GRUEN, weil das Datum auch im Erklaer-Kommentar der
 * Komponente steht. Der Test konnte damit „der Absatz nennt die Abschaltung"
 * nicht von „ein Kommentar erwaehnt sie" trennen. Dieselbe fehlende
 * Trennschaerfe wie in blitzsicht-ops#659, nur eine Ebene weiter innen.
 */
function gerenderterZweig() {
  const i = src.indexOf('{osPlatformDisclaimer && (');
  assert.ok(i >= 0, 'Zweig nicht gefunden — der Test hat seinen Gegenstand verloren');
  const ende = src.indexOf(')}', i);
  assert.ok(ende > i, 'Zweig-Ende nicht gefunden');
  return src.slice(i, ende).replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
}

test('der Abschnitt nennt die Abschaltung, statt sie zu verschweigen', () => {
  assert.match(gerenderterZweig(), /20\.07\.2025 eingestellt/);
});

test('der Gegenstand des Tests oben ist wirklich der gerenderte Text', () => {
  // Gegenprobe zur Abgrenzung selbst: Der Erklaer-Kommentar nennt die URL, der
  // gerenderte Zweig darf sie nicht enthalten. Faellt die Abgrenzung weg,
  // faellt auch dieser Test.
  assert.ok(src.includes('consumers/odr'), 'Erklaer-Kommentar fehlt');
  assert.ok(!gerenderterZweig().includes('consumers/odr'), 'Abgrenzung greift nicht');
});

/*
 * Die beiden folgenden ACs hatten im ersten Anlauf keinen Gegenbeweis, und das
 * Label `evidence/gegenbeweis` an ops#706 verlangt ihn fuer JEDE AC. Das
 * Verdict war formal FAIL — inhaltlich hatte der Grader alles bestaetigt.
 *
 * Statt ein Opt-out (K1/K2/K3) zu deklarieren, sind hier echte Gegenbeweise
 * moeglich. Das ist die bessere Antwort: ein Opt-out sagt "hier laesst sich
 * nichts kaputtmachen", und das stimmte in beiden Faellen nicht.
 */

test('AC 5: der Prop heisst weiterhin osPlatformDisclaimer', () => {
  /*
   * Eine Unterlassung, und trotzdem pruefbar. Sechs Repos setzen diesen Prop
   * (allstargirls, braustall, hausamlago, hausammincio, mazterplan, preshot).
   * Umbenannt fielen sie still auf den Default `true` zurueck und blendeten die
   * VSBG-Klausel wieder ein — auf sechs Live-Seiten, ohne dass ein Build bricht:
   * ein unbekannter Prop ist in Astro kein Fehler, er landet in `Astro.props`
   * und wird ignoriert. Genau deshalb faengt es sonst niemand.
   */
  assert.match(src, /osPlatformDisclaimer\?:\s*boolean/, 'Prop-Deklaration fehlt oder heisst anders');
  assert.match(src, /osPlatformDisclaimer\s*=\s*true/, 'Default-Zuweisung fehlt oder heisst anders');
  assert.match(src, /\{osPlatformDisclaimer\s*&&/, 'Verwendung im Template fehlt oder heisst anders');
});

test('AC 6: der CHANGELOG-Eintrag ist als kundenwirksam erkennbar', async () => {
  /*
   * Nicht "steht eine [kunde]-Zeile im Text", sondern: erkennt der Mechanismus
   * sie, der daran haengt? `kundenwirkung()` entscheidet im Release-Train, ob
   * ein Bump dem Kunden gemeldet wird. Eine Zeile, die der Parser nicht sieht,
   * ist so gut wie keine.
   */
  const { readFileSync } = await import('node:fs');
  const { kundenwirkung } = await import('../../scripts/lib/changelog-kunde.mjs');
  const md = readFileSync(resolve(import.meta.dirname, '../../CHANGELOG.md'), 'utf-8');

  const w = kundenwirkung(md, 'v0.124.0', 'v0.125.0');
  assert.equal(w.status, 'kundenwirksam', `erwartet kundenwirksam, bekam ${w.status}: ${w.grund}`);
});
