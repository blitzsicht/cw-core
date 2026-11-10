// @ts-check
/**
 * Prüft, ob jeder Versionsblock in CHANGELOG.md noch so dasteht, wie ihn sein Tag ausgeliefert hat.
 *
 * ## Anlass (cw-core#267, 09.11.2026)
 *
 * Drei PRs in Folge (#262, #245, #263) haben ihren Eintrag unter `## v0.194.0` geschrieben, als
 * v0.194.0 schon getaggt war. Der Changelog behauptete damit Inhalte für eine Version, die sie
 * nie enthielt. #264 hat sie von Hand zurück unter `[Unreleased]` geschoben, dabei die Leerzeile
 * vor einem `---` mitgenommen (Setext-H2, siehe changelog-kopfform.mjs) und einen umformulierten
 * Satz im v0.194.0-Block stehen lassen. Kein Werkzeug hat irgendetwas davon gemeldet.
 *
 * ## Die Regel
 *
 * Für jeden Tag `release/cw-core/vX.Y.Z`, dessen eigener CHANGELOG einen Block `## vX.Y.Z …`
 * enthält, muss derselbe Block im aktuellen CHANGELOG **byte-gleich** sein. Ein Block reicht von
 * seiner Kopfzeile bis vor die nächste `## `-Zeile. Neue Einträge gehören unter `## [Unreleased]`.
 *
 * ## Altlasten
 *
 * Am 09.11.2026 wichen 14 alte Blöcke von ihrem Tag ab (nachträgliche Korrekturen aus
 * v0.94–v0.190). Sie stehen unten namentlich, je mit dem sha256 ihres HEUTIGEN Wortlauts:
 * eingefroren, nicht freigegeben. Wer einen davon noch einmal ändert, wird rot — eine Ausnahme,
 * die nur am Namen hängt, würde jede weitere Änderung durchwinken. Wird ein Altfall wieder gleich
 * seinem Tag, ist das ebenfalls rot: dann soll er aus der Liste. Die Liste kann nur schrumpfen.
 *
 * Reine Logik, kein FS, kein git. Den git-Teil trägt changelog-tag-quelle.mjs.
 * Tests: scripts/lib/changelog-tag-gleich.test.mjs
 */
import { createHash } from 'node:crypto';
import { compareVersions, parseVersion } from './changelog-kunde.mjs';

/**
 * Version → sha256 (erste 12 Hex) des heutigen Blocks. Gemessen am 09.11.2026 auf
 * release/cw-core (4eb518de, v0.194.2) nach der Reparatur des v0.194.0-Blocks.
 * Nachstellen: `node scripts/lib/changelog-tag-quelle.mjs --altlasten`
 */
export const ALTLASTEN = Object.freeze({
  'v0.190.0': 'c15274282499',
  'v0.163.0': 'a78e30591cdf',
  'v0.126.0': '35721eef8c04',
  'v0.120.0': '8a5b011b09b6',
  'v0.108.0': 'b8c98ae3d693',
  'v0.107.0': 'b710bb11b25a',
  'v0.101.0': 'aa867b3d0e7d',
  'v0.99.1': '8a065655312a',
  'v0.99.0': '8b8376cb83b6',
  'v0.97.3': '9feb3956ba32',
  'v0.97.1': '004ba14c409c',
  'v0.97.0': '615f00316e16',
  'v0.95.0': 'f218efccb55b',
  'v0.94.0': 'c978094fa1ac',
});

/**
 * Unter dieser Zahl verglichener Tags gilt der Vergleich als „lief nie“: meist ein Checkout
 * ohne Tags (actions/checkout holt per Default keine). 176 am 09.11.2026.
 */
export const MINDESTENS_TAGS = 170;

/**
 * Bis hierhin lebte der Changelog in customer-websites oder hatte keine Versionsblöcke:
 * 161 Tags bis einschließlich v0.62.0 haben in ihrem CHANGELOG keinen eigenen Block (gemessen
 * 09.11.2026). Jeder spätere Tag ohne eigenen Block ist ein Release, das seinen Eintrag
 * vergessen hat, und wird rot.
 */
export const LETZTER_TAG_OHNE_BLOCK = 'v0.62.0';

/**
 * Alle Versionsblöcke eines CHANGELOG in EINEM Durchgang: Version → Block. Je Version zählt die
 * erste Kopfzeile `## <version> …`. Ein Block reicht bis vor die nächste `## `-Zeile.
 *
 * Bis cw-core#273 (T10) zerlegte `versionsBlock` den ganzen CHANGELOG (~9 600 Zeilen) je Aufruf
 * neu; `pruefeTagGleichheit` rief es einmal je Tag auf, 176-mal je Lauf.
 *
 * @param {string} md
 * @returns {Map<string, { start: number, text: string }>}
 */
export function versionsBloecke(md) {
  const zeilen = String(md ?? '').split('\n');
  /** @type {Map<string, { start: number, text: string }>} */
  const bloecke = new Map();
  /** @type {{ version: string, a: number } | null} */
  let offen = null;
  const schliessen = (/** @type {number} */ e) => {
    if (offen && !bloecke.has(offen.version)) bloecke.set(offen.version, { start: offen.a + 1, text: zeilen.slice(offen.a, e).join('\n') });
  };
  zeilen.forEach((t, i) => {
    if (!t.startsWith('## ')) return;
    schliessen(i);
    // Wie bisher: die Version endet am ersten Leerzeichen, und danach MUSS eines stehen.
    const leer = t.indexOf(' ', 3);
    offen = leer > 3 ? { version: t.slice(3, leer), a: i } : null;
  });
  schliessen(zeilen.length);
  return bloecke;
}

/**
 * @param {string} md
 * @param {string} version z. B. `v0.194.0`
 * @returns {{ start: number, text: string } | null} start = Zeilennummer der Kopfzeile (ab 1)
 */
export function versionsBlock(md, version) {
  return versionsBloecke(md).get(version) ?? null;
}

/** @param {string} text */
export function blockHash(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex').slice(0, 12);
}

/**
 * @typedef {{ version: string, zeile: number, grund: string }} TagBefund
 * @typedef {{ befunde: TagBefund[], geprueft: number, altlasten: number }} TagErgebnis
 */

/**
 * @param {string} md aktueller CHANGELOG
 * @param {Map<string, string>} tagBloecke Version → Block aus dem CHANGELOG ihres Tags
 * @param {Readonly<Record<string, string>>} [altlasten]
 * @param {string[]} [ohneBlock] Versionen, deren Tag keinen eigenen Block trägt
 * @returns {TagErgebnis}
 */
export function pruefeTagGleichheit(md, tagBloecke, altlasten = ALTLASTEN, ohneBlock = []) {
  /** @type {TagBefund[]} */
  const befunde = [];
  let altGezaehlt = 0;
  const heute = versionsBloecke(md);

  for (const [version, tagText] of tagBloecke) {
    const jetzt = heute.get(version) ?? null;
    if (!jetzt) {
      befunde.push({ version, zeile: 0, grund: `Block \`## ${version} …\` fehlt, sein Tag hat ihn` });
      continue;
    }
    const gleich = jetzt.text === tagText;
    if (Object.hasOwn(altlasten, version)) {
      if (gleich) {
        befunde.push({ version, zeile: jetzt.start, grund: 'Altlast ist wieder gleich ihrem Tag — aus ALTLASTEN streichen' });
      } else if (blockHash(jetzt.text) !== altlasten[version]) {
        befunde.push({
          version,
          zeile: jetzt.start,
          grund: `Altlast geändert: Hash ${blockHash(jetzt.text)} statt eingefroren ${altlasten[version] || '(leer)'}. `
            + `Nach dem Tag gehört nichts mehr in diesen Block. ${ersteAbweichung(jetzt, tagText)}`,
        });
      } else {
        altGezaehlt += 1;
      }
      continue;
    }
    if (!gleich) {
      befunde.push({
        version,
        zeile: jetzt.start,
        grund: `weicht vom Tag release/cw-core/${version} ab — neue Einträge gehören unter \`## [Unreleased]\`. `
          + ersteAbweichung(jetzt, tagText),
      });
    }
  }

  for (const version of Object.keys(altlasten)) {
    if (!tagBloecke.has(version)) {
      befunde.push({ version, zeile: 0, grund: 'steht in ALTLASTEN, aber kein Tag mit diesem Block wurde verglichen' });
    }
  }

  for (const version of ohneBlock) {
    // Präreleasetags (`v0.195.0-rc.1`) brauchen keinen eigenen Block; trägt einer einen, wird er
    // oben verglichen. Bis cw-core#273 (T1) galt ein rc-Tag ohne Block als „Release hat seinen
    // Eintrag vergessen“, und pnpm test blieb rot, solange der Tag stand.
    if (parseVersion(version)?.pre) continue;
    if (compareVersions(version, LETZTER_TAG_OHNE_BLOCK) > 0) {
      befunde.push({
        version,
        zeile: 0,
        grund: `Tag release/cw-core/${version} hat in seinem CHANGELOG keinen Block \`## ${version} …\` — `
          + 'das Release hat seinen Eintrag vergessen (oder die Kopfzeile ist nicht in Normform)',
      });
    }
  }

  return { befunde, geprueft: tagBloecke.size, altlasten: altGezaehlt };
}

/**
 * @param {{ start: number, text: string }} jetzt
 * @param {string} tagText
 */
function ersteAbweichung(jetzt, tagText) {
  const a = jetzt.text.split('\n');
  const b = tagText.split('\n');
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i += 1;
  const kurz = (/** @type {string|undefined} */ s) => (s === undefined ? '(Blockende)' : JSON.stringify(s.length > 90 ? `${s.slice(0, 90)}…` : s));
  return `Erste Abweichung in Zeile ${jetzt.start + i}: jetzt ${kurz(a[i])}, im Tag ${kurz(b[i])}.`;
}

/**
 * @param {TagErgebnis} ergebnis
 * @param {string} [datei]
 * @returns {string}
 */
export function formatiereTagBefunde(ergebnis, datei = 'CHANGELOG.md') {
  return ergebnis.befunde.map((b) => `${datei}:${b.zeile}: ${b.version}: ${b.grund}`).join('\n');
}

/** @param {TagErgebnis} ergebnis */
export function zaehlzeile(ergebnis) {
  return `${ergebnis.geprueft} Blöcke gegen ihren Tag geprüft, ${ergebnis.altlasten} Altlasten, `
    + `${ergebnis.befunde.length} Abweichungen`;
}
