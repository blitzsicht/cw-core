// @ts-check
/**
 * Prüft die Kopfzeilen von CHANGELOG.md auf die Normform.
 *
 * ## Anlass (cw-core#222, 06.11.2026)
 *
 * cw-core#213 schrieb den Kopf als `## Unreleased` — ohne eckige Klammern. Beim Merge fiel
 * es von Hand auf, kein Werkzeug hätte es gemeldet:
 *
 * - Der Skill `cw-release` benennt `## [Unreleased]` in `## vX.Y.Z (YYYY-MM-DD)` um.
 *   `## Unreleased` bleibt stehen, die neue Version bekommt keinen Abschnitt — und die
 *   Gegenprobe des Skills (`grep -c '^## \[Unreleased\]'` = 0) ist dann trivial erfüllt.
 *   Ein Check, der nicht rot werden kann.
 * - `kunde-gate.mjs` findet die Zielversion nicht, meldet „unbekannt“ (Exit 11, fail open)
 *   und die `[kunde]`-Zeile fällt still aus dem Monatsreport.
 *
 * Dazu ein zweiter, gemessener Grund für die Reihenfolge-Regel: `parseChangelog()` in
 * `changelog-kunde.mjs` ordnet `[kunde]`-Zeilen dem LETZTEN gematchten Versionsheader zu.
 * `## [Unreleased]` matcht dort nicht (kein `v\d`). Steht der Block also NICHT oben,
 * wandern seine Zeilen in die darüberstehende, bereits veröffentlichte Version — gemessen
 * am 06.11.2026: „NOCH NICHT VERÖFFENTLICHT“ erschien unter `v0.192.0`. Das ist keine
 * Formfrage, das ist ein unveröffentlichter Satz im Kundenreport.
 *
 * ## Die Normform
 *
 * - `## [Unreleased]` — höchstens einmal, und als erster `## `-Abschnitt der Datei.
 * - `## vX.Y.Z (YYYY-MM-DD)` — Präreleasesuffix erlaubt (`v0.14.5-rc.1`), danach optional
 *   ` — <freier Text>`. Der freie Teil ist unschädlich: `kunde-gate` und `cw-release`
 *   matchen auf den Präfix, nicht auf die ganze Zeile. 34 Altzeilen aus Mai 2026 nutzen ihn.
 *
 * Rot ist also: `## Unreleased`, `## [v0.191.0]`, `## v0.191.0` ohne Datum,
 * `## v0.191.0 (06.11.2026)` (deutsches Datum), ein zweiter Unreleased-Block, ein
 * Unreleased-Block unterhalb einer Version.
 *
 * `### `-Zeilen (`### Fixed`) sind davon nicht berührt — nur `## `.
 *
 * Reine Logik, kein FS. Tests: scripts/lib/changelog-kopfform.test.mjs
 */

/** `## [Unreleased]` — genau so, ohne Zusatz. */
const UNRELEASED_RE = /^## \[Unreleased\]$/;

/** `## v0.115.0 (2026-08-13)`, `## v0.14.5-rc.1 (2026-05-24) — (release/cw-core — …)`. */
const VERSION_RE = /^## v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)? \(\d{4}-\d{2}-\d{2}\)(?: — .+)?$/;

/**
 * Zwei Kopfzeilen aus der Frühzeit, für die kein Datum existiert. Namentlich und
 * wortwörtlich, NICHT als Muster: eine Ausnahme, die man durch Umformulieren treffen kann,
 * wächst. Wer eine dritte braucht, soll diese Liste anfassen müssen.
 */
const ALTLASTEN = Object.freeze([
  '## v0.9.9 — 2025 (pre-release)',
  '## v0.1.0 — Initial (alpha)',
]);

/**
 * @typedef {{ zeile: number, text: string, grund: string }} KopfformBefund
 */

/**
 * @param {string} md Inhalt von CHANGELOG.md
 * @returns {KopfformBefund[]} leer = in Form; sonst ein Befund je Zeile, mit Zeilennummer
 */
export function pruefeChangelogKopfform(md) {
  const zeilen = String(md ?? '').split('\n');
  /** @type {KopfformBefund[]} */
  const befunde = [];
  let unreleasedZeile = 0;
  let ersterAbschnitt = 0;

  zeilen.forEach((text, i) => {
    if (!text.startsWith('## ')) return;
    const zeile = i + 1;
    if (ersterAbschnitt === 0) ersterAbschnitt = zeile;

    if (UNRELEASED_RE.test(text)) {
      if (unreleasedZeile !== 0) {
        befunde.push({ zeile, text, grund: `zweiter [Unreleased]-Block (der erste steht in Zeile ${unreleasedZeile})` });
      } else {
        unreleasedZeile = zeile;
        if (zeile !== ersterAbschnitt) {
          befunde.push({
            zeile,
            text,
            grund: `[Unreleased] steht unter einer Version (erster Abschnitt: Zeile ${ersterAbschnitt}) — `
              + 'parseChangelog() schlägt die [kunde]-Zeilen dann der veröffentlichten Version darüber zu',
          });
        }
      }
      return;
    }

    if (VERSION_RE.test(text) || ALTLASTEN.includes(text)) return;

    befunde.push({
      zeile,
      text,
      grund: /^## \[?Unreleased/i.test(text)
        ? 'nicht genau `## [Unreleased]` — cw-release benennt nur diese Form um, alles andere bleibt stehen'
        : 'nicht `## vX.Y.Z (YYYY-MM-DD)` — kunde-gate findet die Version nicht und meldet „unbekannt“ (Exit 11)',
    });
  });

  return befunde;
}

/**
 * Eine Zeile je Befund, für CLI und CI. Leer, wenn alles in Form ist.
 * @param {KopfformBefund[]} befunde
 * @param {string} [datei] Pfad für die Meldung — der Lint läuft auch gegen Kopien und
 *   historische Stände; ein hart verdrahteter Name zeigt dann auf die falsche Datei.
 * @returns {string}
 */
export function formatiereBefunde(befunde, datei = 'CHANGELOG.md') {
  return befunde.map((b) => `${datei}:${b.zeile}: ${b.grund}\n  ${b.text}`).join('\n');
}
