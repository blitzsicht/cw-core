/**
 * changelog-kunde.mjs — steht zwischen zwei cw-core-Versionen etwas, das den Kunden betrifft?
 *
 * ## Anlass (13.08.2026)
 *
 * Der Release-Train zog stumpf den neuesten Tag und bumpte damit jeden Kunden bei jedem
 * Release. Gemessen: **40 Releases in 13 Tagen**, davon 26 allein in KW33, und **550
 * Bump-Commits über die Flotte in 90 Tagen** — je Live-Repo etwa jeden zweiten Tag ein
 * Production-Deploy. Gleichzeitig tragen **155 von 204** CHANGELOG-Einträgen gar keine
 * `[kunde]`-Zeile: es ist Agentur-Tooling, an der ausgelieferten Seite ändert sich nichts.
 * Beleg aus der Praxis: gympanzens Sprung v0.95.0 → v0.110.0 ergab über 82 Dateien und
 * 18 Seiten **null** Byte Unterschied.
 *
 * Der `cw-release`-Skill verlangt bei jedem kundenwirksamen Release ohnehin eine
 * `[kunde]`- bzw. `[kunde:sichtbar]`-Zeile. Diese Klassifikation existierte also längst —
 * der Train las sie nur nicht.
 *
 * ## Was das hier NICHT tut
 *
 * Es entscheidet **nur über den Pin-Bump**, nicht über das Messen. Ein alter Pin versteckt
 * Guards, statt sie zu entschärfen — wer nicht bumpt, muss trotzdem messen
 * (`upgrade-cw-core-mass.sh --build-only` baut im Worktree und schreibt nichts ins Repo).
 * Sonst tauscht man Deploy-Lärm gegen blinde Flecken.
 *
 * Reine Logik, kein FS. Tests: scripts/lib/changelog-kunde.test.mjs
 */

/** Ein Versions-Abschnitt aus dem CHANGELOG. */
export const KUNDE_RE = /^- \[kunde(:sichtbar)?\]\s*(.*)$/;

/** `## v0.115.0 (2026-08-13)` — Suffixe wie `-alpha` sind erlaubt. */
const HEADER_RE = /^## (v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)/;

/**
 * Zerlegt einen Versions-String in etwas Vergleichbares.
 * @param {string} v z.B. "v0.115.0" oder "release/cw-core/v0.115.0" oder "0.115.0-alpha"
 * @returns {{nums: number[], pre: string} | null} null, wenn unlesbar
 */
export function parseVersion(v) {
  if (!v) return null;
  const m = /(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?/.exec(String(v));
  if (!m) return null;
  return { nums: [Number(m[1]), Number(m[2]), Number(m[3])], pre: m[4] ?? '' };
}

/**
 * Semver-artiger Vergleich. Ein Prerelease (`-alpha`) rangiert VOR dem gleichnamigen
 * Release — sonst gälte v0.9.0-alpha als neuer als v0.9.0.
 * @returns {number} <0, 0 oder >0
 */
export function compareVersions(a, b) {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  if (!pa || !pb) return NaN;
  for (let i = 0; i < 3; i++) {
    if (pa.nums[i] !== pb.nums[i]) return pa.nums[i] - pb.nums[i];
  }
  if (pa.pre === pb.pre) return 0;
  if (!pa.pre) return 1; // Release schlägt Prerelease
  if (!pb.pre) return -1;
  return pa.pre < pb.pre ? -1 : 1;
}

/**
 * Alle Versions-Abschnitte, in Dateireihenfolge (neueste zuerst).
 * @param {string} md CHANGELOG-Inhalt
 * @returns {{version: string, kundenzeilen: {sichtbar: boolean, text: string}[]}[]}
 */
export function parseChangelog(md) {
  const lines = String(md ?? '').split('\n');
  /** @type {{version: string, kundenzeilen: {sichtbar: boolean, text: string}[]}[]} */
  const out = [];
  let aktuell = null;
  for (const line of lines) {
    const h = HEADER_RE.exec(line);
    if (h) {
      aktuell = { version: h[1], kundenzeilen: [] };
      out.push(aktuell);
      continue;
    }
    if (!aktuell) continue;
    const k = KUNDE_RE.exec(line);
    if (k) aktuell.kundenzeilen.push({ sichtbar: Boolean(k[1]), text: k[2].trim() });
  }
  return out;
}

/**
 * Entscheidet, ob ein Bump von `von` auf `bis` den Kunden betrifft.
 *
 * Drei Zustände, nicht zwei — `unbekannt` ist der wichtige:
 *   `kundenwirksam` — mindestens eine `[kunde]`-Zeile in der Spanne. Bumpen.
 *   `nur-tooling`   — Versionen geprüft, keine einzige Kundenzeile. Überspringen.
 *   `unbekannt`     — die Spanne ließ sich nicht bestimmen (Version fehlt im CHANGELOG,
 *                     unlesbarer Pin, oder 0 Versionen in der Spanne). NICHT als
 *                     „nur Tooling" werten: eine leere Menge beweist nichts. Fail open,
 *                     also bumpen und den Grund melden.
 *
 * Die Spanne ist `von` EXKLUSIV bis `bis` INKLUSIV — was im Pin des Kunden schon drin ist,
 * zählt nicht noch einmal.
 *
 * @param {string} md CHANGELOG-Inhalt
 * @param {string} von aktueller Pin des Kunden (Tag-Ref oder blanke Version)
 * @param {string} bis Ziel-Version
 * @returns {{status: 'kundenwirksam'|'nur-tooling'|'unbekannt', grund: string,
 *            geprueft: number, versionen: string[], sichtbar: boolean,
 *            zeilen: {version: string, sichtbar: boolean, text: string}[]}}
 */
export function kundenwirkung(md, von, bis) {
  const leer = { geprueft: 0, versionen: [], sichtbar: false, zeilen: [] };
  const pv = parseVersion(von);
  const pb = parseVersion(bis);
  if (!pv) return { status: 'unbekannt', grund: `Pin '${von}' ist keine lesbare Version`, ...leer };
  if (!pb) return { status: 'unbekannt', grund: `Ziel '${bis}' ist keine lesbare Version`, ...leer };

  const alle = parseChangelog(md);
  if (alle.length === 0) {
    return { status: 'unbekannt', grund: 'CHANGELOG enthält keinen Versions-Abschnitt', ...leer };
  }

  const kennt = (v) => alle.some((e) => compareVersions(e.version, v) === 0);
  if (!kennt(bis)) {
    return { status: 'unbekannt', grund: `${bis} fehlt im CHANGELOG (cw-release Schritt 4?)`, ...leer };
  }
  if (!kennt(von)) {
    // Häufig bei sehr alten Pins. Ohne Startpunkt ist die Spanne nicht bestimmbar.
    return { status: 'unbekannt', grund: `Kunden-Pin ${von} fehlt im CHANGELOG — Spanne nicht bestimmbar`, ...leer };
  }

  const inSpanne = alle.filter(
    (e) => compareVersions(e.version, von) > 0 && compareVersions(e.version, bis) <= 0,
  );
  if (inSpanne.length === 0) {
    return {
      status: 'unbekannt',
      grund: `0 Versionen zwischen ${von} und ${bis} — nichts geprüft`,
      ...leer,
    };
  }

  const zeilen = inSpanne.flatMap((e) =>
    e.kundenzeilen.map((k) => ({ version: e.version, sichtbar: k.sichtbar, text: k.text })),
  );
  const versionen = inSpanne.map((e) => e.version);

  if (zeilen.length === 0) {
    return {
      status: 'nur-tooling',
      grund: `${inSpanne.length} Version(en) geprüft, keine [kunde]-Zeile`,
      geprueft: inSpanne.length,
      versionen,
      sichtbar: false,
      zeilen: [],
    };
  }

  return {
    status: 'kundenwirksam',
    grund: `${zeilen.length} Kundenzeile(n) in ${inSpanne.length} geprüfter Version(en)`,
    geprueft: inSpanne.length,
    versionen,
    sichtbar: zeilen.some((z) => z.sichtbar),
    zeilen,
  };
}
