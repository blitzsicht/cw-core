/**
 * Die Seiten, auf denen der Badge-Vergleich sucht — aus einer Umgebungsvariablen,
 * nicht fest verdrahtet.
 *
 * ANLASS: Die vier Badge-Werkzeuge entstanden am 04.11.2026 im Gate-Worktree
 * v0.189.0 für ops#1051 Befund 7 und trugen `['/', '/websites/']` im Quelltext —
 * zwei Routen von blitzsicht.com. In cw-core wäre das genau der Fehler, den
 * `seiten.ts` beschreibt: ein Guard, der die Hälfte nicht ansieht. Für Kunden mit
 * anderen Routen hätte das Werkzeug stillschweigend nichts verglichen.
 *
 * Deshalb: `BADGE_SEITEN="/,/leistungen/"` setzt die Liste, und wer sie nicht
 * setzt, bekommt eine Warnung plus den übergebenen Rückfall. Die Spec reicht dort
 * die Seiten des Builds herein (`seitenAusBuild()`), die beiden Skripte gegen eine
 * beliebige URL nur `/` — dort gibt es kein dist-Verzeichnis zum Nachsehen.
 */

/**
 * @param {string[]} rueckfall Seiten, wenn BADGE_SEITEN nicht gesetzt ist.
 * @param {string} woher Quelle des Rückfalls, für die Warnung.
 * @returns {string[]} Routen mit führendem Slash.
 */
export function badgeSeiten(rueckfall = ['/'], woher = 'Vorgabe') {
  const roh = process.env.BADGE_SEITEN;
  if (roh && roh.trim()) {
    const seiten = roh.split(',').map((s) => s.trim()).filter(Boolean);
    if (seiten.length > 0) return seiten;
  }
  console.warn(
    `[badge] BADGE_SEITEN nicht gesetzt — prüfe ${rueckfall.length} Seite(n) aus ${woher}: ${rueckfall.join(', ')}`,
  );
  return rueckfall;
}
