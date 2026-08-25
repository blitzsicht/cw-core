import { test } from 'node:test';
import assert from 'node:assert/strict';
import { farbeFuerLuminanz, labelFarbeFuerBild } from '../src/utils/labelfarbe.js';

// --- die Entscheidungsregel für sich -----------------------------------------

test('farbeFuerLuminanz: dunkler Bereich bekommt das weisse Badge', () => {
  // soleno/images/hero/hero-poster.webp lag bei 0.010 — dort steht Schwarz bei 1,21:1
  assert.equal(farbeFuerLuminanz(0.01), 'weiss');
  assert.equal(farbeFuerLuminanz(0.06), 'weiss');
});

test('farbeFuerLuminanz: heller Bereich bekommt das schwarze Badge', () => {
  // soleno/staedte/neutraubling.webp lag bei 0.887
  assert.equal(farbeFuerLuminanz(0.887), 'schwarz');
  assert.equal(farbeFuerLuminanz(0.5), 'schwarz');
});

test('farbeFuerLuminanz: der Umschlagpunkt liegt dort, wo beide Kontraste gleich sind', () => {
  // Gleichstand bei L = sqrt(1.05*0.05) - 0.05 ≈ 0.1791. Knapp darunter gewinnt Weiss,
  // knapp darüber Schwarz — der Test hält die Grenze fest, damit sie nicht unbemerkt wandert.
  assert.equal(farbeFuerLuminanz(0.17), 'weiss');
  assert.equal(farbeFuerLuminanz(0.19), 'schwarz');
});

test('farbeFuerLuminanz: Unsinn fuehrt zu Schwarz, nicht zu einem Fehler', () => {
  for (const wert of [undefined, null, NaN, Infinity, 'hell', {}]) {
    assert.equal(farbeFuerLuminanz(wert), 'schwarz', `Eingabe: ${String(wert)}`);
  }
});

test('farbeFuerLuminanz: Werte ausserhalb 0..1 werden geklemmt statt verworfen', () => {
  assert.equal(farbeFuerLuminanz(-5), 'weiss');
  assert.equal(farbeFuerLuminanz(5), 'schwarz');
});

// --- der Dateiweg -------------------------------------------------------------

test('labelFarbeFuerBild: fehlende Datei liefert Schwarz statt zu werfen', async () => {
  const farbe = await labelFarbeFuerBild('/gibt/es/nicht/bild.webp');
  assert.equal(farbe, 'schwarz');
});

test('labelFarbeFuerBild: unlesbarer Inhalt liefert Schwarz', async () => {
  const farbe = await labelFarbeFuerBild(new URL(import.meta.url).pathname);
  assert.equal(farbe, 'schwarz');
});

// Die Fallback-Tests oben liefern alle „schwarz" — sie könnten also auch dann bestehen,
// wenn nie gemessen würde. Diese beiden zeigen, dass tatsächlich gemessen wird und beide
// Antworten vorkommen. Die Bilder werden erzeugt, damit der Test nicht von Kundendaten abhängt.
async function testbild(pfad, grauwert) {
  const { default: sharp } = await import('sharp');
  await sharp({
    create: { width: 200, height: 200, channels: 3, background: { r: grauwert, g: grauwert, b: grauwert } },
  })
    .webp()
    .toFile(pfad);
}

test('labelFarbeFuerBild: misst wirklich — dunkles Bild ergibt Weiss', async (t) => {
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { unlink } = await import('node:fs/promises');
  const p = join(tmpdir(), `cw-labelfarbe-dunkel-${process.pid}.webp`);
  await testbild(p, 10);
  t.after(() => unlink(p).catch(() => {}));
  assert.equal(await labelFarbeFuerBild(p), 'weiss');
});

test('labelFarbeFuerBild: misst wirklich — helles Bild ergibt Schwarz', async (t) => {
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { unlink } = await import('node:fs/promises');
  const p = join(tmpdir(), `cw-labelfarbe-hell-${process.pid}.webp`);
  await testbild(p, 245);
  t.after(() => unlink(p).catch(() => {}));
  assert.equal(await labelFarbeFuerBild(p), 'schwarz');
});

// --- Überlagerung -------------------------------------------------------------

test('ueberlagerung kippt die Entscheidung — ein dunkler Verlauf macht aus Schwarz Weiss', async (t) => {
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { unlink } = await import('node:fs/promises');
  const p = join(tmpdir(), `cw-labelfarbe-ovl-${process.pid}.webp`);
  await testbild(p, 245); // hell
  t.after(() => unlink(p).catch(() => {}));

  // Ohne Verlauf ist das Feld hell → schwarzes Badge.
  assert.equal(await labelFarbeFuerBild(p), 'schwarz');
  // Mit kräftigem dunklem Verlauf darüber ist es dunkel → weisses Badge.
  assert.equal(await labelFarbeFuerBild(p, { ueberlagerung: 0.9 }), 'weiss');
});

test('ueberlagerung: 0 und fehlende Angabe sind gleichbedeutend', async (t) => {
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { unlink } = await import('node:fs/promises');
  const p = join(tmpdir(), `cw-labelfarbe-ovl0-${process.pid}.webp`);
  await testbild(p, 120);
  t.after(() => unlink(p).catch(() => {}));
  const ohne = await labelFarbeFuerBild(p);
  assert.equal(await labelFarbeFuerBild(p, { ueberlagerung: 0 }), ohne);
});

test('ueberlagerung: Unsinn wird zu 0, nicht zu einem Fehler oder einer Verzerrung', async (t) => {
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { unlink } = await import('node:fs/promises');
  const p = join(tmpdir(), `cw-labelfarbe-ovlx-${process.pid}.webp`);
  await testbild(p, 245);
  t.after(() => unlink(p).catch(() => {}));
  for (const wert of [undefined, null, NaN, 'viel', -3]) {
    assert.equal(await labelFarbeFuerBild(p, { ueberlagerung: wert }), 'schwarz', `Eingabe: ${String(wert)}`);
  }
  // Über 1 wird geklemmt: alles verdeckt → dunkel → weiss.
  assert.equal(await labelFarbeFuerBild(p, { ueberlagerung: 5 }), 'weiss');
});
