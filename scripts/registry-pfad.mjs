// @ts-check
/**
 * Wo liegt `customer-registry.json`?
 *
 * Vier Skripte in diesem Verzeichnis trugen den Pfad als Konstante:
 *
 *   /Volumes/SiluriWork/NAS-Spiegel/MEDIEN/CODE/CLAUDE/customer-websites/customer-registry.json
 *
 * Das ist der Pfad genau eines Rechners. Auf jedem anderen — und in jeder CI —
 * scheitern die Skripte mit ENOENT. Aufgefallen ist es erst, als cw-core am
 * 27.08.2026 zum ersten Mal eine CI bekam: der Test
 * `bildherkunft-arbeitsliste.test.mjs` faehrt eines der Skripte aus und starb
 * dort sofort. Lokal war er jahrelang gruen, weil das Verzeichnis existierte.
 *
 * Aufloesung in dieser Reihenfolge:
 *
 *   1. `CW_REGISTRY` — ausdruecklich gesetzt, gewinnt immer. Damit koennen
 *      Tests eine Attrappe unterschieben, ohne das echte Nachbarrepo zu brauchen.
 *   2. `<repo>/../customer-websites/customer-registry.json` — die Konvention:
 *      die Repos liegen nebeneinander. Funktioniert auf jedem Rechner, der sich
 *      daran haelt, statt nur auf einem.
 *   3. der alte absolute Pfad — damit nichts kaputtgeht, was heute laeuft.
 *
 * Findet keiner der drei eine Datei, wird der zuletzt gepruefte Pfad
 * zurueckgegeben: der Aufrufer soll mit ENOENT scheitern und den Pfad in der
 * Meldung sehen, statt still eine leere Liste zu verarbeiten.
 */
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HIER = dirname(fileURLToPath(import.meta.url));

/** Der Pfad, den die Skripte bis zum 27.08.2026 fest eingebaut hatten. */
export const ALTBESTAND_PFAD =
  '/Volumes/SiluriWork/NAS-Spiegel/MEDIEN/CODE/CLAUDE/customer-websites/customer-registry.json';

/**
 * Liefert den Pfad zur customer-registry.json.
 * @param {{env?: NodeJS.ProcessEnv}} [opt]
 * @returns {string}
 */
export function registryPfad(opt = {}) {
  const env = opt.env ?? process.env;

  if (env.CW_REGISTRY) return env.CW_REGISTRY;

  // cw-core liegt neben customer-websites; HIER ist <repo>/scripts.
  const nachbar = resolve(HIER, '..', '..', 'customer-websites', 'customer-registry.json');
  if (existsSync(nachbar)) return nachbar;

  return ALTBESTAND_PFAD;
}
