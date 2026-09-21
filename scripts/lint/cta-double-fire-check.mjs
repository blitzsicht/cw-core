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
 * Die beiden globalen SSOT-Listener. Sie SOLLEN [data-cta] abfangen — das ist
 * ihr Zweck. Pfad-Suffix-Match, damit absolute Test-Pfade auch greifen.
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
 *   ctaViolation:boolean, formViolation:boolean, violation:boolean}}
 */
export function analyze(path, content) {
  const clickTrack = hasClickTrackListener(content);
  const dataCta = hasDataCtaAttr(content);
  const allowlisted = isAllowlisted(path);
  const annotated = content.includes(SAFE_ANNOTATION);
  const ctaViolation = clickTrack && dataCta && !allowlisted && !annotated;

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
    ctaViolation,
    formViolation,
    violation: ctaViolation || formViolation,
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
