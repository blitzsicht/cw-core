import { test } from 'node:test';
import assert from 'node:assert/strict';
import { einfuegen, unterschriftVon, UNTERSCHRIFT_KI } from './blog-bilder-erzeugen.mjs';

const text = '---\ntitle: T\n---\nIntro.\n\n## Teil A\n\nErster Absatz\nzweite Zeile.\n\nZweiter Absatz.\n';
const b = { slug: 's', nach: '## Teil A', datei: 'x', art: 'foto', alt: 'Brot [frisch]' };

test('fügt nach dem ersten Block unter der Überschrift ein, mit Foto-Unterschrift', () => {
  const t = einfuegen(text, b, { unterschriftFoto: 'Foto: Bäckerei' });
  assert.match(t, /zweite Zeile\.\n\n!\[Brot frisch\]\(\/images\/blog\/s\/x\.webp "Foto: Bäckerei"\)\n\nZweiter Absatz/);
});

test('idempotent: zweimal einfügen ändert nichts', () => {
  const t = einfuegen(text, b);
  assert.equal(einfuegen(t, b), t);
});

test('KI-Bild bekommt immer die KI-Unterschrift, auch mit eigener', () => {
  assert.equal(unterschriftVon({ art: 'ki', unterschrift: 'Foto' }), UNTERSCHRIFT_KI);
});

test('fehlende Überschrift wirft', () => {
  assert.throws(() => einfuegen(text, { ...b, nach: '## Gibt es nicht' }), /Überschrift fehlt/);
});
