import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aiLabelElement } from './ai-label.mjs';

// Der Opt-in ist der Kern der Sicherheitsgarantie: ohne `herkunft` darf niemals
// etwas gerendert werden, sonst behauptete ein blosses cw-core-Update, dass ein
// Foto KI-Inhalt trägt, ohne dass irgendjemand das erklärt hätte.
test('ohne herkunft wird nichts gerendert', () => {
  assert.equal(aiLabelElement({}), null);
  assert.equal(aiLabelElement({ herkunft: null }), null);
  assert.equal(aiLabelElement({ herkunft: undefined }), null);
});

test('mit herkunft entsteht ein positioniertes Satori-Element', () => {
  const el = aiLabelElement({ herkunft: 'ki-erzeugt' });
  assert.equal(el.type, 'div');
  assert.equal(el.props.style.position, 'absolute');
  // Default unten links, wie AiLabelAmBild.astro (dieselbe Ecke, siehe deren Kopf).
  assert.equal(el.props.style.left, 40);
  assert.equal(el.props.style.bottom, 36);
});

test('links/unten/hoehe sind überschreibbar (offer() setzt sie am Fotobereich)', () => {
  const el = aiLabelElement({ herkunft: 'ki-veraendert', links: 624, unten: 24, hoehe: 52 });
  assert.equal(el.props.style.left, 624);
  assert.equal(el.props.style.bottom, 24);
});

test('ki-erzeugt und ki-veraendert laden unterschiedliche Symbole', () => {
  const erzeugt = aiLabelElement({ herkunft: 'ki-erzeugt' });
  const veraendert = aiLabelElement({ herkunft: 'ki-veraendert' });
  const srcErzeugt = erzeugt.props.children.props.src;
  const srcVeraendert = veraendert.props.children.props.src;
  assert.notEqual(srcErzeugt, srcVeraendert);
});

test('schwarz und weiss laden unterschiedliche Symbole', () => {
  const schwarz = aiLabelElement({ herkunft: 'ki-erzeugt', farbe: 'schwarz' });
  const weiss = aiLabelElement({ herkunft: 'ki-erzeugt', farbe: 'weiss' });
  assert.notEqual(schwarz.props.children.props.src, weiss.props.children.props.src);
});

test('unbekannte Herkunft wirft, statt lautlos nichts anzuzeigen', () => {
  // Eine Pflicht, die bei einem Tippfehler im Aufrufer verschwindet, ist keine
  // Pflicht mehr — deshalb hier ein Fehler statt eines übersehbaren `null`.
  assert.throws(() => aiLabelElement({ herkunft: 'ki-irgendwas' }));
});

test('GEGENPROBE: farbe schwarz vs. weiss ist nicht dieselbe Datei wie herkunft erzeugt vs. veraendert', () => {
  // Vier Kombinationen muessen vier verschiedene src ergeben — sonst mißt einer
  // der beiden Schalter (herkunft, farbe) in Wirklichkeit gar nichts.
  const varianten = [
    aiLabelElement({ herkunft: 'ki-erzeugt', farbe: 'schwarz' }),
    aiLabelElement({ herkunft: 'ki-erzeugt', farbe: 'weiss' }),
    aiLabelElement({ herkunft: 'ki-veraendert', farbe: 'schwarz' }),
    aiLabelElement({ herkunft: 'ki-veraendert', farbe: 'weiss' }),
  ].map((el) => el.props.children.props.src);
  assert.equal(new Set(varianten).size, 4);
});
