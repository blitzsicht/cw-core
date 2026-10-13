// @ts-check
/**
 * antwortfrist.js — die Antwortfrist an Anfragende, an EINER Stelle.
 *
 * Bis v0.171.0 versprachen drei Bausteine jedem Endkunden „Wir melden uns innerhalb von
 * 24 Stunden bei Ihnen.“ — die Erfolgsmeldung von ContactForm (formType 'contact'), der
 * Default von DankePage und die Bestätigungsmail aus buildBriefingEmail. Belegt war die
 * Frist bei keinem Kunden; gemessen zeigten sie 10 von 15 Live-Seiten (blitzsicht-ops#950,
 * Messung 13.10.2026). Eine Frist spricht im Namen des Kunden. Sie steht deshalb nur noch
 * da, wenn er sie bewusst setzt: `siteData.antwortfrist`, an alle drei Stellen gereicht.
 *
 * Text UND Erkennung liegen hier, wie bei pruefhinweis.js: der Guard `checkAntwortfrist`
 * (ai-discovery) muss genau die Sätze erkennen, die die Bausteine schreiben. Zwei leicht
 * verschiedene Fassungen liefen irgendwann auseinander.
 *
 * Format der Angabe: die Dauer, wie sie hinter „innerhalb von“ steht — `'24 Stunden'`,
 * `'2 Werktagen'`. Leer, nur Leerzeichen oder kein String gilt als „nicht gesetzt“.
 */

/** Neutrale Zeitangabe, wenn keine Frist gesetzt ist. Erfindet keine Zusage. */
export const ANTWORT_OHNE_FRIST = 'so bald wie möglich';

/** Eingangsbestätigung vor dem Antwortsatz (ContactForm 'contact', DankePage). */
export const EINGANG_BESTAETIGT = 'Ihre Anfrage ist angekommen.';

/**
 * Die gesetzte Frist, bereinigt — oder `undefined`, wenn keine gesetzt ist.
 * @param {unknown} frist
 * @returns {string | undefined}
 */
export function antwortfristAngabe(frist) {
  if (typeof frist !== 'string') return undefined;
  const s = frist.trim().replace(/\s+/g, ' ');
  return s.length > 0 ? s : undefined;
}

/**
 * „innerhalb von 24 Stunden“ mit Angabe, sonst „so bald wie möglich“.
 * @param {unknown} frist
 * @returns {string}
 */
export function antwortZeitraum(frist) {
  const f = antwortfristAngabe(frist);
  return f ? `innerhalb von ${f}` : ANTWORT_OHNE_FRIST;
}

/**
 * Der Antwortsatz: „Wir melden uns innerhalb von 24 Stunden bei Ihnen.“ bzw.
 * „Wir melden uns so bald wie möglich bei Ihnen.“
 * @param {unknown} frist
 * @returns {string}
 */
export function antwortSatz(frist) {
  return `Wir melden uns ${antwortZeitraum(frist)} bei Ihnen.`;
}

/**
 * Die vollständige Bestätigung für ContactForm und DankePage.
 * @param {unknown} frist
 * @returns {string}
 */
export function antwortBestaetigung(frist) {
  return `${EINGANG_BESTAETIGT} ${antwortSatz(frist)}`;
}

// ---------------------------------------------------------------------------
// Erkennung (für den Guard)
// ---------------------------------------------------------------------------

const A = '(?<![\\p{L}\\p{N}])';
const E = '(?![\\p{L}\\p{N}])';

/** Zahl: Ziffern oder ein ausgeschriebenes Zahlwort bis zwölf, auch „eines/einem/einer“. */
const ZAHL =
  '(?:\\d+(?:[,.]\\d+)?|eine[mnrs]?|ein|zwei|drei|vier|fünf|sechs|sieben|acht|neun|zehn|elf|zwölf|vierundzwanzig|achtundvierzig)';
/** Zeiteinheit, flektiert. „h“ und „Std.“ nur als eigenes Wort. */
const EINHEIT =
  '(?:stunden?|std\\.?|h|minuten?|min\\.?|werktage?n?s?|arbeitstage?n?s?|geschäftstage?n?s?|tage?n?s?|wochen?)';

/**
 * Frist-Phrase: „innerhalb (von) 24 Stunden“, „innerhalb eines Werktags“, „binnen 24h“.
 * Gruppe 1 = Zahl, Gruppe 2 = Einheit.
 */
const FRIST_RE = new RegExp(
  `${A}(?:innerhalb|binnen)(?:\\s+von)?\\s+(${ZAHL})\\s*(${EINHEIT})${E}`,
  'giu',
);

/**
 * Ohne ein Antwort-Verb im selben Satz ist eine Frist keine Antwortfrist: „innerhalb von
 * 7 Werktagen fertig“ ist eine Lieferzusage, kein Rückmelde-Versprechen.
 */
const ANTWORT_RE = new RegExp(
  `${A}(?:meld\\p{L}*|rückmeld\\p{L}*|antwort\\p{L}*|beantwort\\p{L}*|zurück(?:ruf|melde|schreib)\\p{L}*|(?:rufen|ruft|rufe)(?:\\s+\\p{L}+){0,3}\\s+zurück|reagier\\p{L}*|reaktion\\p{L}*|kontaktier\\p{L}*)${E}`,
  'iu',
);

/**
 * Und nur, wenn der Betrieb selbst spricht: „Wir melden uns …“, „Sie erhalten … von uns“.
 * Ein Ratgeber-Satz wie „Wer innerhalb von 5 Minuten antwortet, gewinnt den Auftrag“
 * (blitzsicht.com-Blog) verspricht nichts.
 */
const SELBST_RE = new RegExp(
  `${A}(?:wir|uns|unser\\p{L}*|ich|mich|mir|(?:erhalten|bekommen)\\s+sie|sie\\s+(?:erhalten|bekommen))${E}`,
  'iu',
);

/** Einheiten auf eine Grundform, damit „24 h“ und „24 Stunden“ gleich gelten. @param {string} e */
function einheitGrundform(e) {
  const x = e.toLowerCase().replace(/\.$/, '');
  if (/^(?:h|std|stunden?)$/.test(x)) return 'stunde';
  if (/^(?:min|minuten?)$/.test(x)) return 'minute';
  if (/^werktag/.test(x)) return 'werktag';
  if (/^arbeitstag/.test(x)) return 'arbeitstag';
  if (/^geschäftstag/.test(x)) return 'geschäftstag';
  if (/^woche/.test(x)) return 'woche';
  return 'tag';
}

/** Zahlwort auf Ziffern, damit „einem Werktag“ = „1 Werktag“. @param {string} z */
function zahlGrundform(z) {
  const x = z.toLowerCase();
  /** @type {Record<string, string>} */
  const w = {
    ein: '1', eine: '1', einem: '1', einen: '1', einer: '1', eines: '1',
    zwei: '2', drei: '3', vier: '4', fünf: '5', sechs: '6', sieben: '7', acht: '8',
    neun: '9', zehn: '10', elf: '11', zwölf: '12', vierundzwanzig: '24', achtundvierzig: '48',
  };
  return w[x] ?? x.replace(',', '.');
}

/**
 * Vergleichsschlüssel einer Frist: „24 Stunden“, „24h“, „24 Std.“ → `24 stunde`.
 * Unbekanntes Format → kleingeschrieben, Leerraum normalisiert.
 * @param {string} text
 * @returns {string}
 */
export function fristSchluessel(text) {
  const t = String(text).trim();
  const m = new RegExp(`^(?:innerhalb\\s+(?:von\\s+)?|binnen\\s+)?(${ZAHL})\\s*(${EINHEIT})$`, 'iu').exec(t);
  if (m) return `${zahlGrundform(m[1])} ${einheitGrundform(m[2])}`;
  return t.toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Findet Antwortfristen in einem Klartext (ohne HTML). Ein Treffer ist eine Frist-Phrase,
 * in deren Satz ein Antwort-Verb steht und der Betrieb selbst spricht (wir/uns/ich/
 * „erhalten Sie“).
 * @param {string} text
 * @returns {{ satz: string, frist: string, schluessel: string }[]}
 */
export function findeAntwortfristen(text) {
  /** @type {{ satz: string, frist: string, schluessel: string }[]} */
  const treffer = [];
  // Satzgrenzen: . ! ? vor Leerraum oder Textende — nicht der Punkt in „Std.“/„Min.“
  // (eine Dezimalzahl hat keinen Leerraum hinter dem Punkt) — und Zeilenumbrüche.
  const saetze = String(text).split(/(?<!\b(?:Std|Min|ca|bzw))[.!?](?=\s|$)|\n+/i);
  for (const roh of saetze) {
    const satz = roh.replace(/\s+/g, ' ').trim();
    if (!satz) continue;
    FRIST_RE.lastIndex = 0;
    let m;
    while ((m = FRIST_RE.exec(satz))) {
      if (!ANTWORT_RE.test(satz) || !SELBST_RE.test(satz)) break;
      treffer.push({
        satz,
        frist: m[0],
        schluessel: `${zahlGrundform(m[1])} ${einheitGrundform(m[2])}`,
      });
    }
  }
  return treffer;
}
