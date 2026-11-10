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
 * Dazu seit cw-core#267 die versteckte Kopfzeile: `---` (oder `===`) direkt unter einer
 * Textzeile ist eine Setext-Überschrift. Siehe `setextBefunde()` unten.
 *
 * Reine Logik, kein FS. Tests: scripts/lib/changelog-kopfform.test.mjs
 *
 * Die Setext-Prüfung liest mit micromark (CommonMark + GFM, devDependency). Nur
 * `lint-changelog.mjs` im cw-core-Checkout lädt dieses Modul; in Kunden-Repos fehlen die
 * devDependencies. `kunde-gate.mjs` → `changelog-kunde.mjs` darf es deshalb nicht importieren.
 */
// Der Parser ist eine devDependency. Statisch importiert, stürzte `lint-changelog.mjs` in einem
// Checkout ohne `node_modules` (frischer Release-Worktree, cw-release Schritt 4) mit
// ERR_MODULE_NOT_FOUND ab, bevor irgendeine Prüfung lief: auch Kopfform, Unreleased-Zahl und
// Tag-Vergleich, die ihn nicht brauchen (Nachlese der Reviews #283/#284). Jetzt läuft alles
// andere, und `SETEXT_NICHT_GEPRUEFT` sagt mit Namen, dass die Setext-Prüfung ausfiel.
// „Nicht geprüft" ist kein Grün: lint-changelog endet dann mit Exit 3.
/** @type {null | { fromMarkdown: Function, gfm: Function, gfmFromMarkdown: Function }} */
let parser = null;
/** @type {string | null} */
let fehltGrund = null;
try {
  const [a, b, c] = await Promise.all([
    import('mdast-util-from-markdown'),
    import('micromark-extension-gfm'),
    import('mdast-util-gfm'),
  ]);
  parser = { fromMarkdown: a.fromMarkdown, gfm: b.gfm, gfmFromMarkdown: c.gfmFromMarkdown };
} catch (e) {
  if (/** @type {any} */ (e)?.code !== 'ERR_MODULE_NOT_FOUND') throw e;
  const paket = String(/** @type {any} */ (e).message).match(/package '([^']+)'/)?.[1] ?? 'Markdown-Parser';
  fehltGrund = `Setext-Prüfung nicht gelaufen: ${paket} fehlt (pnpm install)`;
}

/** `null`, wenn die Setext-Prüfung lief; sonst der Grund, warum sie ausfiel. */
export const SETEXT_NICHT_GEPRUEFT = fehltGrund;

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

  befunde.push(...setextBefunde(String(md ?? ''), zeilen));
  return befunde.sort((a, b) => a.zeile - b.zeile);
}

/**
 * Setext-Falle (cw-core#267): `---` direkt unter einer Textzeile macht nach CommonMark den
 * ganzen Absatz darüber zur `<h2>`, und die Trennlinie fällt weg. Gemessen am 09.11.2026:
 * PR #264 schnitt beim Verschieben die Leerzeile vor dem `---` am Ende des v0.194.0-Blocks
 * mit weg — der Migrations-Hinweis wurde zur Überschrift, ausgeliefert in v0.194.1 und
 * v0.194.2. Die Kopfzeilen-Prüfung oben sah es nicht, sie liest nur `## `-Zeilen; eine
 * Setext-Überschrift ist aber genau das: eine Kopfzeile, die nicht nach einer aussieht.
 *
 * Gelesen mit einem echten CommonMark-+-GFM-Parser, nicht mit Zeilenregeln (cw-core#273).
 * Bis v0.195.0 standen hier drei Regexe, die CommonMark nachahmten; jede Lücke war eine
 * Abweichung vom Standard: `---` eingerückt in einem Listenpunkt (T4), eine einzelne `-`
 * (T5), `~~~` in einem ```-Zaun (T6), HTML-Block vor `---` als Fehlalarm (T7) und `| a | b |`
 * über `---`, das in GFM keine Tabelle ist (T8). Der Parser entscheidet das wie GitHub.
 *
 * Erkennung: eine ATX-Überschrift (`## …`) ist immer einzeilig. Jede Überschrift, die über
 * mehr als eine Zeile reicht, ist eine Setext-Überschrift; ihre letzte Zeile ist die Linie.
 *
 * @param {string} md
 * @param {string[]} zeilen
 * @returns {KopfformBefund[]}
 */
function setextBefunde(md, zeilen) {
  /** @type {KopfformBefund[]} */
  const befunde = [];
  if (!parser) return [];
  const baum = parser.fromMarkdown(md, { extensions: [parser.gfm()], mdastExtensions: [parser.gfmFromMarkdown()] });
  /** @param {any} knoten */
  const lauf = (knoten) => {
    const pos = knoten.position;
    if (knoten.type === 'heading' && pos && pos.end.line > pos.start.line) {
      const text = zeilen[pos.end.line - 1] ?? '';
      befunde.push({
        zeile: pos.end.line,
        text,
        grund: `Setext-Überschrift: \`${text.trim()}\` direkt unter Text macht den Absatz darüber zur `
          + `<h${knoten.depth}> und die Trennlinie fällt weg — Leerzeile davor setzen`,
      });
    }
    for (const kind of knoten.children ?? []) lauf(kind);
  };
  lauf(baum);
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
