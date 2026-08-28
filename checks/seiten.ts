/**
 * Die zu prüfenden Seiten — aus der Sitemap des Builds statt aus einer Liste.
 *
 * ANLASS (2026-08-27): `/forschung` sprengte auf jedem Handy die Seite
 * (scrollWidth 634 bei 360px Viewport, 274px Überstand). Der Guard dafür — die
 * scrollWidth-Prüfung in mobile-audit.spec.ts — lief den ganzen Tag GRÜN. Nicht
 * weil er kaputt war, sondern weil seine fest verdrahtete Liste aus sieben Routen
 * bestand und `/forschung` nicht dazugehörte. Von 49 gebauten Seiten sah er sieben.
 *
 * Ein Guard, der die Hälfte nicht ansieht, ist kein Nachweis — er ist ein grünes
 * Häkchen über ungeprüftem Gebiet. Deshalb kommt die Liste jetzt aus dem Build
 * selbst: Was ausgeliefert wird, wird auch geprüft, und eine neue Seite ist
 * automatisch dabei, ohne dass jemand daran denken muss.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/** Fällt die Sitemap aus, bleibt wenigstens dieser Kern geprüft. */
const KERN = ['/', '/kontakt/'];

/**
 * Routen aus `sitemap-0.xml` des Builds. Astros Sitemap enthält absolute URLs;
 * gebraucht wird der Pfad.
 */
export function seitenAusBuild(distDir = process.env.DIST_DIR || 'dist'): string[] {
  const datei = join(distDir, 'sitemap-0.xml');
  if (!existsSync(datei)) {
    // Bewusst laut: ein stiller Rückfall auf zwei Seiten wäre genau der Fehler,
    // den diese Datei behebt.
    console.warn(`[seiten] ${datei} fehlt — prüfe nur ${KERN.join(', ')}. Läuft der Build?`);
    return KERN;
  }
  const xml = readFileSync(datei, 'utf8');
  const routen = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)]
    .map((m) => {
      try { return new URL(m[1]).pathname; } catch { return null; }
    })
    .filter((p): p is string => !!p);

  const eindeutig = [...new Set(routen)].sort();
  if (eindeutig.length === 0) {
    console.warn(`[seiten] ${datei} enthält keine <loc> — prüfe nur ${KERN.join(', ')}.`);
    return KERN;
  }
  return eindeutig;
}

/**
 * Für Läufe, die nicht jede Seite prüfen sollen (Zeit): eine begrenzte Auswahl,
 * die aber IMMER den Kern enthält und den Rest gleichmässig streut — nicht die
 * ersten N, sonst prüft man nur den Anfang des Alphabets.
 */
export function seitenAuswahl(max: number, distDir?: string): string[] {
  const alle = seitenAusBuild(distDir);
  if (alle.length <= max) return alle;
  const rest = alle.filter((p) => !KERN.includes(p));
  const schritt = rest.length / (max - KERN.length);
  const gestreut = Array.from({ length: max - KERN.length }, (_, i) => rest[Math.floor(i * schritt)]);
  return [...KERN, ...gestreut];
}
