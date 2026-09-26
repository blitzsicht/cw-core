#!/usr/bin/env node
// Blog-Standard-Guard als CLI für den prebuild: bricht vor Astro ab, wenn ein Beitrag kein
// „Kurz gesagt“ hat, zu wenige Bilder oder ein Bild ohne Herkunft. Regeln: src/blog-standard/blog-check.js.
//
//   node node_modules/@cw/core/scripts/check-blog-standard.mjs [verzeichnis] [optionen]
//
//   verzeichnis                Default src/content/blog
//   --herkunft <modul>         eigener Resolver: Modul exportiert `herkunft(pfad)` (siluri.de)
//   --ohne-herkunft            Herkunftsprüfung aus (nur für Repos ohne Bild-Register)
//   --ohne-ki-unterschrift     KI-Bilder brauchen keinen Titel — die Site kennzeichnet selbst
//   --deepfake-label           die Site labelt Deepfakes im Markdown selbst (rehype-Plugin)
//   --warnen                   Bildmangel nur als Hinweis (Übergang beim Nachrüsten)
//
// Ohne --herkunft liest es src/data/bild-herkunft.ts (Export `bildHerkunft`, erzeugt von
// scripts/bildherkunft-uebernehmen.mjs) und löst über @cw/core/utils/bildherkunft auf.
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { pruefeVerzeichnis } from '../src/blog-standard/blog-check.js';
import { resolveBildHerkunft } from '../src/utils/bildherkunft.js';

const args = process.argv.slice(2);
const wert = (n) => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : undefined;
};
const hat = (n) => args.includes(n);
const optWerte = new Set([wert('--herkunft')]);
const dir = args.find((a) => !a.startsWith('--') && !optWerte.has(a)) ?? 'src/content/blog';

if (!existsSync(dir)) {
  console.error(`✗ Blog-Standard: Verzeichnis ${dir} fehlt`);
  process.exit(1);
}

let herkunft;
if (wert('--herkunft')) {
  const m = await import(pathToFileURL(resolve(wert('--herkunft'))).href);
  herkunft = m.herkunft ?? m.default;
  if (typeof herkunft !== 'function') {
    console.error(`✗ Blog-Standard: ${wert('--herkunft')} exportiert keine Funktion herkunft(pfad)`);
    process.exit(1);
  }
} else if (!hat('--ohne-herkunft')) {
  const datei = join(process.cwd(), 'src/data/bild-herkunft.ts');
  if (!existsSync(datei)) {
    console.error('✗ Blog-Standard: src/data/bild-herkunft.ts fehlt — Bild-Arbeitsliste anlegen oder --herkunft <modul> angeben');
    process.exit(1);
  }
  const { bildHerkunft } = await import(pathToFileURL(datei).href);
  if (!Array.isArray(bildHerkunft) || bildHerkunft.length === 0) {
    // Eine leere Liste sähe aus wie „alles deklariert“ — lieber laut scheitern.
    console.error('✗ Blog-Standard: src/data/bild-herkunft.ts liefert keine Regeln');
    process.exit(1);
  }
  herkunft = (p) => resolveBildHerkunft({ bildHerkunft }, p);
}

const r = await pruefeVerzeichnis(dir, {
  herkunft,
  kiUnterschrift: !hat('--ohne-ki-unterschrift'),
  deepfakeLabel: hat('--deepfake-label'),
  streng: !hat('--warnen'),
});

if (r.artikel === 0) {
  // Ein leeres Verzeichnis ist grün, aber kein Beleg — sagen, dass nichts geprüft wurde.
  console.warn(`⚠ Blog-Standard: keine Beiträge in ${dir} — nichts geprüft`);
  process.exit(0);
}
if (r.hinweise.length) {
  console.warn(`⚠ Blog-Standard: ${r.hinweise.length} Hinweis(e) (--warnen)\n  ` + r.hinweise.join('\n  '));
}
if (r.fehler.length) {
  console.error(`✗ Blog-Standard: ${r.fehler.length} Befund(e)\n  ` + r.fehler.join('\n  '));
  process.exit(1);
}
console.log(`✓ Blog-Standard: ${r.artikel} Artikel, ${r.bilder} Bilder im Text, alle mit „Kurz gesagt“${herkunft ? ' und Herkunft' : ''}`);
