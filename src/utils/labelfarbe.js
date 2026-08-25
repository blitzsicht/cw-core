/**
 * @cw/core/utils/labelfarbe — welche Fassung des EU-Badges passt auf dieses Bild?
 *
 * Das Badge gibt es schwarz und weiß. Welche sich besser abhebt, hängt davon ab, wie hell
 * das Bild **an der Stelle** ist, wo das Badge sitzt — nicht wie hell es insgesamt ist.
 *
 * Warum das nötig ist: gemessen über die 35 kennzeichnungspflichtigen Bilder der Flotte
 * (25.08.2026) gewinnt das weiße Badge bei 25, das schwarze bei 10. Eine feste Farbe wäre
 * also bei knapp einem Drittel bis zwei Dritteln der Bilder die schlechtere. Bei
 * `soleno/images/hero/hero-poster.webp` steht Schwarz bei 1,21:1 gegen Weiß bei 17,41:1 —
 * dort verschwindet die schwarze Pille im dunklen Motiv.
 *
 * Das betrifft die **Abgrenzung der Pille vom Bild**, nicht die Lesbarkeit der Schrift:
 * Die ist bei der deckenden Fassung immer gesichert (die Pille ist der Hintergrund der
 * Schrift, 21:1 bzw. 16,88:1). Es geht um die Anforderung der Kommission, die
 * Kennzeichnung müsse „deutlich wahrnehmbar und unterscheidbar" sein.
 *
 * **Fallback ist Schwarz.** Lässt sich die Helligkeit nicht bestimmen — Datei fehlt, Format
 * unlesbar, `sharp` nicht installiert —, wird nicht geraten und nicht abgebrochen, sondern
 * die schwarze Fassung geliefert. Ein Label in suboptimaler Farbe erfüllt die Pflicht; ein
 * Build, der an der Farbwahl scheitert, liefert am Ende gar keins.
 *
 * Die Messstelle setzt voraus, dass das Badge **links unten** sitzt. Wandert es an eine
 * andere Ecke, gehört `bereich` mitgegeben — sonst misst die Funktion die falsche Stelle
 * und meldet trotzdem ein Ergebnis.
 *
 * Rechtlicher Rahmen: Art. 50 Abs. 4 UAbs. 1 AI Act; die Form ist dort nicht vorgeschrieben.
 * Volltext: cw-recht → texte/eu/ai-act/ai-act.md. Keine Rechtsberatung.
 */

/** Relative Luminanz eines sRGB-Tripels nach WCAG 2.1. */
function luminanz(r, g, b) {
  const f = (c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

/** Kontrastverhältnis zweier Luminanzen nach WCAG 2.1. */
function kontrast(l1, l2) {
  const hell = Math.max(l1, l2);
  const dunkel = Math.min(l1, l2);
  return (hell + 0.05) / (dunkel + 0.05);
}

const LUM_SCHWARZ = 0;
const LUM_WEISS = 1;

/**
 * Farbe aus einer bereits gemessenen Luminanz ableiten — ohne Dateizugriff, damit die
 * Entscheidungsregel für sich testbar bleibt.
 *
 * @param {number} luminanzDesBereichs  0 (schwarz) bis 1 (weiß)
 * @returns {'schwarz'|'weiss'}
 */
export function farbeFuerLuminanz(luminanzDesBereichs) {
  if (typeof luminanzDesBereichs !== 'number' || !Number.isFinite(luminanzDesBereichs)) {
    return 'schwarz';
  }
  const l = Math.min(1, Math.max(0, luminanzDesBereichs));
  return kontrast(LUM_SCHWARZ, l) >= kontrast(LUM_WEISS, l) ? 'schwarz' : 'weiss';
}

/**
 * Passende Badge-Fassung für eine Bilddatei bestimmen.
 *
 * **`ueberlagerung` nicht vergessen, wo eine liegt.** Heros tragen oft einen dunklen Verlauf
 * zwischen Bild und Inhalt; das Label liegt darüber. Wer nur das nackte Bild misst, misst ein
 * anderes Objekt als das, worauf das Badge tatsächlich sitzt. Bei `customer-soleno` (Verlauf
 * `rgba(0,0,0,.78)` → `.42`) kippt dadurch zwar keine der zehn Entscheidungen — die Werte
 * liegen weit von der Schwelle —, bei einem schwächeren Verlauf oder Grenzfällen aber sehr wohl.
 *
 * **Nur dunkle Überlagerungen.** Der Faktor rechnet `L × (1 − ueberlagerung)`, also den Fall
 * „Schwarz mit Deckkraft darüber". Für einen hellen Schleier wäre die Rechnung eine andere;
 * sie wird bewusst nicht unterstützt, statt still falsch zu rechnen.
 *
 * @param {string} dateipfad  absoluter Pfad zur ausgelieferten Bilddatei
 * @param {{anteilBreite?: number, anteilHoehe?: number, ueberlagerung?: number}} [bereich]
 *   `anteilBreite`/`anteilHoehe`: Ausschnitt — Standard linke untere Ecke, 34 % × 22 %.
 *   `ueberlagerung`: Deckkraft der dunklen Schicht zwischen Bild und Label, 0 (keine) bis 1.
 * @returns {Promise<'schwarz'|'weiss'>}
 */
export async function labelFarbeFuerBild(dateipfad, bereich = {}) {
  const { anteilBreite = 0.34, anteilHoehe = 0.22, ueberlagerung = 0 } = bereich;
  const daempfung = 1 - Math.min(1, Math.max(0, Number.isFinite(ueberlagerung) ? ueberlagerung : 0));
  try {
    const { default: sharp } = await import('sharp');
    const bild = sharp(dateipfad);
    const { width, height } = await bild.metadata();
    if (!width || !height) return 'schwarz';

    const breite = Math.max(1, Math.round(width * anteilBreite));
    const hoehe = Math.max(1, Math.round(height * anteilHoehe));
    const { data, info } = await bild
      .extract({ left: 0, top: height - hoehe, width: breite, height: hoehe })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const kanaele = info.channels;
    let summe = 0;
    let n = 0;
    for (let i = 0; i + kanaele - 1 < data.length; i += kanaele) {
      summe += luminanz(data[i], data[i + 1], data[i + 2]);
      n++;
    }
    if (!n) return 'schwarz';
    // Die Dämpfung gehört vor die Entscheidungsregel, nicht hinein: `farbeFuerLuminanz`
    // bleibt damit eine reine Funktion über der Luminanz und für sich testbar.
    return farbeFuerLuminanz((summe / n) * daempfung);
  } catch {
    // Kein Werfen: siehe Kopfkommentar — der Build soll ein Label liefern, nicht scheitern.
    return 'schwarz';
  }
}
