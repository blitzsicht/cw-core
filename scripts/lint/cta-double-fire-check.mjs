/**
 * cta-double-fire-check.mjs — Cluster-Guard gegen CTA-Click-Doppelfeuer.
 *
 * Warum diese Datei existiert (Root-Cause-Fix, #1-Rule):
 * Der globale SSOT-Listener (BaseLayout im inline-Modus, <PlausibleEvents> im
 * full-Modus) feuert das CORE-Goal "CTA Click" für JEDES Element mit
 * [data-cta]. Wenn eine Komponente ZUSÄTZLICH einen eigenen click→track-Listener
 * auf demselben (oder einem umschliessenden) data-cta-Element hat, feuert EIN
 * Klick zwei Events — das Goal-Event "CTA Click" plus ein redundantes
 * Komponenten-Event. Beweise (Live-Audit 2026-07-10):
 *   - Hero.astro    → "Hero CTA Click" + "CTA Click" (hero-primary:)
 *   - Header.astro  → "Nav Click"      + "CTA Click" (nav:)
 *   - LeistungenSection → "Service Click" + "CTA Click" (leistung-card:)
 * Alle drei Komponenten-Events waren KEINE konfigurierten Goals (plausible-
 * goals.mjs) → totes Volumen auf denselben Klick.
 *
 * Dieser Guard scannt cw-core-Komponenten und schlägt an, wenn eine Datei
 * BEIDES enthält: einen click→track-Listener UND ein data-cta-Attribut — ohne
 * Allowlist-Eintrag und ohne "cw-tracking-safe"-Annotation. Die Annotation
 * zwingt jede Grenzfall-Komponente zu einer expliziten, dokumentierten
 * Begründung, warum Listener und data-cta sich NICHT überlappen.
 *
 * Rein (keine fs-Abhängigkeit): nimmt [{path, content}], gibt Violations.
 * Der Verzeichnis-Walk liegt im Test / im Aufrufer.
 */

/**
 * Die beiden Einstiegspunkte des SSOT-Listeners. Sie SOLLEN [data-cta] abfangen —
 * das ist ihr Zweck. Pfad-Suffix-Match, damit absolute Test-Pfade auch greifen.
 *
 * Seit v0.155.0 steht der Event-Code selbst nicht mehr in diesen beiden Dateien,
 * sondern in `src/utils/analytics/auto-events.ts`; sie rufen ihn nur noch auf.
 * Die Einträge bleiben trotzdem stehen: Der Guard scannt `.astro`-Dateien, und
 * beide würden bei einem Rückfall in Inline-Code sofort wieder darunterfallen.
 *
 * Die Prüflogik selbst ist von der Verschiebung nicht betroffen — sie sucht
 * Komponenten, die ZUSÄTZLICH zum SSOT-Listener selbst zählen, und das sind
 * weiterhin `.astro`-Dateien.
 */
export const ALLOWLIST = [
  'src/layouts/BaseLayout.astro',
  'src/components/analytics/PlausibleEvents.astro',
];

/** Marker-String, mit dem eine Komponente einen geprüften Nicht-Overlap belegt. */
export const SAFE_ANNOTATION = 'cw-tracking-safe';

/**
 * Markup-Marker, mit dem ein <form> dem globalen SSOT-Listener signalisiert:
 * "ich zähle 'Form Submit' selbst, halte dich raus".
 *
 * Warum ein Attribut und nicht stopPropagation(): BaseLayout registriert seinen
 * submit-Listener am `document` mit useCapture = true und läuft damit VOR jedem
 * Handler am Formular selbst. Kein Form-Handler kann ihn per Propagation
 * erreichen — der Marker ist der einzige Weg, der funktioniert.
 */
export const FORM_TRACKED_MARKER = 'data-cw-form-tracked';

/**
 * Feuert die Datei ein Plausible-Event? Deckt alle drei im Cluster benutzten
 * Schreibweisen ab:
 *   track(…) / trackPlausible(…)  — der Helper aus utils/analytics/track
 *   window.plausible(…) / w.plausible(…)  — Direktaufruf (MapEmbed, CalEmbed,
 *     StickyContact, VideoEmbed nutzen diese Form)
 *
 * Die alte Fassung prüfte nur `track(` und war deshalb blind für die
 * Direktaufrufe — MapEmbed feuerte seit jeher `Map Load` UND `CTA Click` auf
 * demselben Button, ohne dass der Guard etwas sah.
 */
export function hasTrackCall(content) {
  return /\b(track|trackPlausible)\s*\(/.test(content) || /(^|[\s.(])plausible\s*\(/m.test(content);
}

/**
 * Komponenten-lokaler Listener für `eventType`, der ein Plausible-Event feuert.
 * @param {string} content
 * @param {'click'|'submit'} eventType
 */
export function hasTrackListener(content, eventType) {
  const re = new RegExp(`addEventListener\\(\\s*['"]${eventType}['"]`);
  return re.test(content) && hasTrackCall(content);
}

/** Komponenten-lokaler Listener, der auf 'click' ein track()-Event feuert. */
export function hasClickTrackListener(content) {
  return hasTrackListener(content, 'click');
}

/** Komponenten-lokaler Listener, der auf 'submit' ein track()-Event feuert. */
export function hasSubmitTrackListener(content) {
  return hasTrackListener(content, 'submit');
}

/** Enthält die Datei ein eigenes <form>-Element im Markup? */
export function hasFormElement(content) {
  return /<form[\s>]/.test(content);
}

/** Trägt das Markup den Marker, der den globalen Form-Listener zurücktreten lässt? */
export function hasFormTrackedMarker(content) {
  return content.includes(FORM_TRACKED_MARKER);
}

/**
 * Kommentare entfernen, bevor im Markup gesucht wird.
 *
 * Ohne diesen Schritt schlug der Guard auf seine eigene Dokumentation an:
 * LeistungenSection.astro erklaert in einem Kommentar, welches Element frueher
 * `<a data-cta="leistung-card:">` trug — ein Zitat, kein Code. Dieselbe Falle hat
 * im Repo schon einmal zugeschlagen, als eine Regex ausgerechnet die Commits
 * loeschte, die eine Regel zitierten.
 *
 * Erfasst `//`-Zeilen, Block- und HTML-Kommentare. Bewusst grob: Ein
 * uebersehener Kommentar erzeugt hoechstens einen Fehlalarm, den ein Mensch
 * sofort erkennt — waehrend eine zu scharfe Entfernung echten Code verstecken
 * wuerde.
 */
export function ohneKommentare(content) {
  return content
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '');
}

/**
 * Literal ins Markup geschriebenes `data-cta=` / `data-nav-click=`.
 *
 * NICHT gemeint ist `data-nav=` ohne Suffix — Header.astro nutzt das als
 * CSS-Zustandsattribut fuer den kompakten Modus, es hat mit Tracking nichts zu tun.
 *
 * Seit v0.156.0 vergibt `utils/analytics/cta-kind.js` diese Attribute über
 * `ctaAttrs(href, name)` — genau EINES je Element, abgeleitet aus dem Ziel des
 * Links. Wer es von Hand schreibt, umgeht diese Entscheidung und trifft sie
 * implizit selbst: meist zugunsten von `data-cta`, weil das die vertraute Form
 * ist. Genau so ist das Goal ursprünglich verwässert worden.
 *
 * Bewusst eine Struktur-Regel statt einer Präfix-Allowlist: Eine Liste erlaubter
 * Namen altert still, sobald jemand ein neues Präfix erfindet (`filialen-karte:`,
 * `sortiment:hero-filialen`). Diese Regel bleibt gültig, egal wie die Werte heißen.
 *
 * `data-cta-type` ist NICHT gemeint — das ist ein semantischer Anker für
 * Browser-Agents mit eigenem Wertebereich, kein Tracking-Attribut.
 */
export function hasLiteralCtaAttr(content) {
  const code = ohneKommentare(content).replace(/\bdata-cta-type\s*=/g, '');
  return /\bdata-(cta|nav-click)\s*=/.test(code);
}

/** Nutzt die Datei den vorgesehenen Weg? */
export function usesCtaAttrs(content) {
  return /\bctaAttrs\s*\(/.test(content);
}

/**
 * Ein Element mit BEIDEN Attributen — ein Klick zählte dann als Conversion und
 * als Navigation. `ctaAttrs` kann das nicht erzeugen; von Hand schon.
 *
 * Grob, aber in die sichere Richtung: geprüft wird je öffnendem Tag.
 */
export function hasBothCtaAndNav(content) {
  for (const tag of ohneKommentare(content).match(/<[a-zA-Z][^>]*>/g) ?? []) {
    const ohneTyp = tag.replace(/\bdata-cta-type\s*=/g, '');
    if (/\bdata-cta\s*=/.test(ohneTyp) && /\bdata-nav-click\s*=/.test(ohneTyp)) return true;
  }
  return false;
}

/**
 * Echter Kontaktweg im öffnenden Tag: `tel:`, `mailto:` MIT Adresse, `wa.me/<nummer>`,
 * `api.whatsapp.com/send?…phone=`. Teilen-Links (`mailto:?…`, `wa.me/?text=`) sind es nicht.
 * @param {string} tag
 */
function istKontaktLink(tag) {
  const href = /\shref\s*=\s*["']([^"']*)["']/i.exec(tag)?.[1]?.trim() ?? '';
  return (
    /^tel:/i.test(href) ||
    /^mailto:[^?\s]/i.test(href) ||
    /^https?:\/\/wa\.me\/\+?\d/i.test(href) ||
    /^https?:\/\/api\.whatsapp\.com\/send\?(?:[^"']*&(?:amp;|#38;)?)?phone=/i.test(href)
  );
}

/** Zählender Tag: data-cta / data-nav-click (ohne data-cta-type) oder ctaAttrs-Spread. @param {string} tag */
function istZaehlend(tag) {
  const ohneTyp = tag.replace(/\bdata-cta-type\s*=/g, '');
  return /\bdata-(cta|nav-click)\s*=/.test(ohneTyp) || /\{\s*\.\.\.\s*ctaAttrs\s*\(/.test(tag);
}

/** HTML-Elemente ohne schließendes Tag. */
const VOID_TAGS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);

/**
 * `data-referral-share` schluckt einen echten Kontakt-Klick.
 *
 * auto-events.ts sucht per `closest('[data-referral-share]')` und kehrt danach zurück
 * (exklusiver Zweig, damit Teilen nicht als WhatsApp/Email Click zählt). Liegt der
 * Marker auf demselben Element, einem Vorfahren oder einem Nachfahren eines echten
 * Kontaktwegs (`tel:`, `mailto:` mit Adresse, `wa.me/<nummer>`,
 * `api.whatsapp.com/send?phone=`) oder eines zählenden Elements (`data-cta`,
 * `data-nav-click`, `ctaAttrs`-Spread), verschwindet dieser Klick still aus der Messung.
 *
 * Nachfahre zählt mit: Ein Klick auf ein Kind mit Marker innerhalb eines tel:-Links
 * findet zuerst das Kind — der Anruf würde nie gezählt.
 *
 * Grob wie `hasBothCtaAndNav`, aber mit Verschachtelung: Stapel über die öffnenden
 * und schließenden Tags. Frontmatter, `<script>` und `<style>` werden vorher entfernt
 * (TypeScript-Generics wie `querySelector<HTMLElement>` sähen sonst wie Tags aus).
 * Läuft auf `.astro`-Quelltext und auf gerendertem HTML.
 *
 * @param {string} content
 * @returns {boolean}
 */
export function hasReferralShareConflict(content) {
  const markup = ohneKommentare(content.replace(/^---[\s\S]*?\n---/, ''))
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[\s\S]*?<\/style>/gi, '');
  if (!/\bdata-referral-share\b/.test(markup)) return false;
  /** @type {{name: string, marker: boolean, kontakt: boolean}[]} */
  const stapel = [];
  // Öffnende Tags dürfen {…}-Ausdrücke mit `>` enthalten (Arrow-Functions in Astro).
  const TAG = /<\/([a-zA-Z][\w-]*)\s*>|<([a-zA-Z][\w-]*)((?:[^>{}]|\{(?:[^{}]|\{[^{}]*\})*\})*)>/g;
  for (const m of markup.matchAll(TAG)) {
    if (m[1]) {
      const name = m[1].toLowerCase();
      const i = stapel.map((e) => e.name).lastIndexOf(name);
      if (i >= 0) stapel.length = i;
      continue;
    }
    const name = m[2].toLowerCase();
    const tag = m[0];
    const marker = /\sdata-referral-share\b/.test(tag);
    const kontakt = istKontaktLink(tag) || istZaehlend(tag);
    if (marker && (kontakt || stapel.some((e) => e.kontakt))) return true;
    if (kontakt && stapel.some((e) => e.marker)) return true;
    if (!VOID_TAGS.has(name) && !/\/\s*>$/.test(tag)) stapel.push({ name, marker, kontakt });
  }
  return false;
}

/** data-cta-Attribut-Nutzung in der Template-Markup (data-cta=...). */
export function hasDataCtaAttr(content) {
  return /data-cta\s*=/.test(content);
}

/** SSOT-Global-Listener — dürfen [data-cta] abfangen. */
export function isAllowlisted(path) {
  const norm = path.replace(/\\/g, '/');
  return ALLOWLIST.some((a) => norm.endsWith(a));
}

/**
 * Analysiert eine einzelne .astro-Datei.
 *
 * Zwei unabhängige Befunde:
 *   ctaViolation  — eigener click→track-Listener auf einem [data-cta]-Element
 *   formViolation — eigenes <form> mit submit→track, aber ohne Marker, sodass
 *                   der globale SSOT-Listener dasselbe Ereignis mitzählt
 *
 * @returns {{path:string, clickTrack:boolean, dataCta:boolean, allowlisted:boolean,
 *   annotated:boolean, submitTrack:boolean, formEl:boolean, formMarker:boolean,
 *   ctaViolation:boolean, formViolation:boolean, literalCta:boolean, bothAttrs:boolean,
 *   literalViolation:boolean, exclusivityViolation:boolean, shareConflict:boolean, violation:boolean}}
 */
export function analyze(path, content) {
  const clickTrack = hasClickTrackListener(content);
  const dataCta = hasDataCtaAttr(content);
  const allowlisted = isAllowlisted(path);
  const annotated = content.includes(SAFE_ANNOTATION);
  const ctaViolation = clickTrack && dataCta && !allowlisted && !annotated;

  const literalCta = hasLiteralCtaAttr(content);
  const bothAttrs = hasBothCtaAndNav(content);
  // Die SSOT-Listener und die Util selbst duerfen die Attribute nennen.
  const literalViolation = literalCta && !allowlisted;
  const exclusivityViolation = bothAttrs;
  const shareConflict = hasReferralShareConflict(content);

  const submitTrack = hasSubmitTrackListener(content);
  const formEl = hasFormElement(content);
  const formMarker = hasFormTrackedMarker(content);
  // Die SSOT-Listener selbst dürfen den generischen submit-Listener haben —
  // sie besitzen kein eigenes <form>, fallen also ohnehin nicht in die Regel.
  const formViolation = submitTrack && formEl && !formMarker && !allowlisted;

  return {
    path,
    clickTrack,
    dataCta,
    allowlisted,
    annotated,
    submitTrack,
    formEl,
    formMarker,
    literalCta,
    bothAttrs,
    ctaViolation,
    formViolation,
    literalViolation,
    exclusivityViolation,
    shareConflict,
    violation: ctaViolation || formViolation || literalViolation || exclusivityViolation || shareConflict,
  };
}

/**
 * @param {{path:string, content:string}[]} files
 * @returns {ReturnType<typeof analyze>[]} nur die Violations
 */
export function findViolations(files) {
  return files.map((f) => analyze(f.path, f.content)).filter((r) => r.violation);
}

/** Menschenlesbare Fehlermeldung für eine Violation (graceful degradation). */
export function formatViolation(v) {
  if (v.shareConflict) {
    return (
      `data-referral-share an einem Kontaktweg: ${v.path}\n` +
      `  Der Marker sitzt auf, über oder unter einem tel:/mailto:/wa.me-Link oder einem\n` +
      `  data-cta/data-nav-click-Element. auto-events.ts zählt dann nur "Referral Share"\n` +
      `  und der echte Kontakt-Klick fehlt still in Phone/Email/WhatsApp/CTA Click.\n` +
      `  Fix: Marker nur an reine Teilen-Elemente (mailto:? ohne Adresse, wa.me/?text=,\n` +
      `  Kopier-Button) — nie in deren Verschachtelung mit einem Kontaktweg.`
    );
  }
  if (v.exclusivityViolation) {
    return (
      `data-cta UND data-nav-click am selben Element: ${v.path}\n` +
      `  Ein Klick zaehlte dort als Conversion UND als Navigation.\n` +
      `  Fix: ctaAttrs(href, name) verwenden — es vergibt immer genau eines.`
    );
  }
  if (v.literalViolation) {
    return (
      `Literales data-cta/data-nav-click im Markup: ${v.path}\n` +
      `  Seit v0.156.0 vergibt ctaAttrs(href, name) diese Attribute anhand des\n` +
      `  Link-Ziels. Von Hand geschrieben wird die Entscheidung implizit selbst\n` +
      `  getroffen — meist zugunsten von data-cta, und genau so ist das Goal\n` +
      `  "CTA Click" ueber Monate zu vier Fuenfteln Navigation geworden.\n` +
      `  Fix: {...ctaAttrs(href, \`praefix:\${label}\`)} statt data-cta={…}.\n` +
      `  Ist die Heuristik im Einzelfall falsch: ctaAttrs(href, name, 'conversion').`
    );
  }
  if (v.formViolation && !v.ctaViolation) {
    return (
      `Form-Submit-Doppelfeuer: ${v.path}\n` +
      `  Diese Komponente hat ein eigenes <form> mit submit→track-Listener, aber das\n` +
      `  Markup trägt kein "${FORM_TRACKED_MARKER}". Der globale SSOT-Listener zählt\n` +
      `  "Form Submit" deshalb ein zweites Mal — jede Absendung erscheint doppelt.\n` +
      `  Fix: ${FORM_TRACKED_MARKER} ans <form>-Tag schreiben (statisch ins Markup,\n` +
      `  NICHT per JS — der globale Listener läuft in der Capture-Phase und damit vor\n` +
      `  jeder Hydration). Siehe ContactForm.astro.`
    );
  }
  const kopf =
    `CTA-Doppelfeuer-Risiko: ${v.path}\n` +
    `  Diese Komponente hat einen eigenen click→track-Listener UND ein data-cta-Attribut.\n` +
    `  Der globale SSOT-Listener feuert bereits "CTA Click" für [data-cta] — ein Klick\n` +
    `  kann so zwei Events auslösen (Doppelfeuer).\n` +
    `  Fix: entweder den Komponenten-Listener/das data-cta entfernen, ODER — wenn Listener\n` +
    `  und data-cta nachweislich VERSCHIEDENE Elemente treffen — eine "${SAFE_ANNOTATION}"-\n` +
    `  Kommentar-Annotation mit Begründung ergänzen. Siehe Header.astro / LeistungenSection.astro.`;
  return v.formViolation ? `${kopf}\n  Zusätzlich: Form-Submit-Doppelfeuer (Marker fehlt).` : kopf;
}
