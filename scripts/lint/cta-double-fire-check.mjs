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

/** Komponenten-lokaler Listener, der auf 'click' ein track()-Event feuert. */
export function hasClickTrackListener(content) {
  return /addEventListener\(\s*['"]click['"]/.test(content) && /\btrack\s*\(/.test(content);
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
 * @returns {{path:string, clickTrack:boolean, dataCta:boolean, allowlisted:boolean, annotated:boolean, violation:boolean}}
 */
export function analyze(path, content) {
  const clickTrack = hasClickTrackListener(content);
  const dataCta = hasDataCtaAttr(content);
  const allowlisted = isAllowlisted(path);
  const annotated = content.includes(SAFE_ANNOTATION);
  const violation = clickTrack && dataCta && !allowlisted && !annotated;
  return { path, clickTrack, dataCta, allowlisted, annotated, violation };
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
  return (
    `CTA-Doppelfeuer-Risiko: ${v.path}\n` +
    `  Diese Komponente hat einen eigenen click→track-Listener UND ein data-cta-Attribut.\n` +
    `  Der globale SSOT-Listener feuert bereits "CTA Click" für [data-cta] — ein Klick\n` +
    `  kann so zwei Events auslösen (Doppelfeuer).\n` +
    `  Fix: entweder den Komponenten-Listener/das data-cta entfernen, ODER — wenn Listener\n` +
    `  und data-cta nachweislich VERSCHIEDENE Elemente treffen — eine "${SAFE_ANNOTATION}"-\n` +
    `  Kommentar-Annotation mit Begründung ergänzen. Siehe Header.astro / LeistungenSection.astro.`
  );
}
