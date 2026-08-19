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

test('der Abschnitt nennt die Abschaltung, statt sie zu verschweigen', () => {
  assert.match(src, /20\.07\.2025 eingestellt/);
});
