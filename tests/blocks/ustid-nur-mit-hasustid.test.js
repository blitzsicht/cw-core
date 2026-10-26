// @ts-check
/**
 * Eine USt-IdNr erscheint nur, wenn `hasUstId` sie freigibt — in BEIDEN Bausteinen.
 *
 * Lauf: `node --test tests/blocks/ustid-nur-mit-hasustid.test.js`
 *
 * ANLASS (Fund 26.10.2026): `ImpressumBlock` prüfte `hasUstId && ustIdNr`,
 * `InformationspflichtBlock` nur `ustIdNr`. Folge bei customer-blumen-schmid: das
 * Impressum verschwieg die noch unbestätigte Nummer, die Datenschutzerklärung lieferte
 * „USt-IdNr.: TODO: USt-IdNr vom Kunden bestätigen" an den Kunden aus. Ein Befund am
 * einen Baustein belegte nichts für den anderen.
 *
 * Geprüft wird gerendertes HTML, nicht der Quelltext: die Bedingung steht in beiden
 * Dateien auch im Erklär-Kommentar, ein Substring-Zähler wäre deshalb immer rot.
 * Jede Prüfung fährt ZWEI Proben mit disjunktem Ergebnis — ohne die zweite wäre ein
 * Baustein, der die Zeile nie rendert, genauso grün.
 */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { renderer, schliessen, normalize } from './_render-astro.js';

after(schliessen);

const INFO = 'src/components/blocks/InformationspflichtBlock.astro';
const DS = 'src/components/blocks/DatenschutzBlock.astro';

/** Pflichtfelder von LegalProps, bewusst knapp — die Prüfung hängt an hasUstId/ustIdNr. */
const LEGAL = {
  owner: 'Blumen Schmid GbR',
  company: 'Blumen Schmid GbR',
  form: 'GbR',
  street: 'Illerstraße 16',
  zip: '93057',
  city: 'Regensburg',
  country: 'DE',
  phone: '+49 941 41413',
  rechtsform: 'gbr',
  register: 'none',
  hasUstId: false,
  aufsichtspflichtig: false,
  kammerMitglied: false,
  vsbgPflichtig: false,
};

async function renderInfo(legal) {
  const r = await renderer();
  return normalize(
    await r.render(INFO, { legal, email: 'info@blumen-schmid-regensburg.de', companyName: 'Blumen Schmid' })
  );
}

async function renderDs(legal) {
  const r = await renderer();
  return normalize(
    await r.render(DS, {
      legal,
      email: 'info@blumen-schmid-regensburg.de',
      domain: 'blumen-schmid-regensburg.de',
      hasContactForm: true,
      hasResend: true,
      hasPlausible: false,
      hasTurnstile: false,
      hasNonEssentialCookies: false,
    })
  );
}

test('Informationspflicht: hasUstId false unterdrückt die Nummer, auch wenn ustIdNr Text trägt', async () => {
  const html = await renderInfo({ ...LEGAL, hasUstId: false, ustIdNr: 'TODO: USt-IdNr vom Kunden bestätigen' });
  assert.ok(!html.includes('USt-IdNr.:'), 'Datenschutzerklärung liefert die USt-IdNr-Zeile trotz hasUstId=false');
  assert.ok(!html.includes('TODO'), 'der Platzhaltertext steht im ausgelieferten HTML');
});

test('Informationspflicht: hasUstId true zeigt sie — sonst prüfte der Test oben nichts', async () => {
  const html = await renderInfo({ ...LEGAL, hasUstId: true, ustIdNr: 'DE123456789' });
  assert.ok(html.includes('USt-IdNr.: DE123456789'), 'die freigegebene USt-IdNr fehlt in der Datenschutzerklärung');
});

test('Informationspflicht: hasUstId true ohne Nummer zeigt keine leere Zeile', async () => {
  const html = await renderInfo({ ...LEGAL, hasUstId: true, ustIdNr: undefined });
  assert.ok(!html.includes('USt-IdNr.:'), 'leere USt-IdNr-Zeile wird gerendert');
});

test('Datenschutz: leere Rechtsform erzeugt keine Leerzeile im Verantwortlichen-Block', async () => {
  const html = await renderDs({ ...LEGAL, form: '', ustIdNr: undefined });
  const block = html.slice(html.indexOf('Verantwortlich für die Datenverarbeitung'));
  assert.ok(!/<br\s*\/?>\s*<br\s*\/?>/.test(block.slice(0, 400)), 'zwei <br> hintereinander — die Adresse hat eine Leerzeile');
});

test('Datenschutz: gesetzte Rechtsform steht weiter da — sonst prüfte der Test oben nichts', async () => {
  const html = await renderDs({ ...LEGAL, form: 'GbR', ustIdNr: undefined });
  const block = html.slice(html.indexOf('Verantwortlich für die Datenverarbeitung'));
  assert.ok(block.slice(0, 400).includes('GbR'), 'die Rechtsform fehlt im Verantwortlichen-Block');
});
