// @ts-check
/**
 * @cw/core/integrations/ai-discovery/motion-consent-check
 *
 * Build-time-Guard gegen die Default-an-Falle: warnt, wenn eine Seite eine
 * Motion-Komponente ausliefert, die der Kunde nie angefordert hat.
 *
 * Reine String-Logik pro Datei-Inhalt — der Directory-Walk passiert im
 * Aufrufer (index.ts, dort ist `walkHtml` in Scope). Gleicher Split wie
 * `perf-check.js` und `csp-check.js`.
 *
 * ## Auslöser (09.08.2026)
 *
 * `PaketeSection.astro:100` hat `tilt = true` als Voreinstellung und wickelt
 * bei `:196` jede Karte in eine `TiltCard`. `Hero.astro:165` setzt `hasImages`
 * ab **zwei** Bildern, `:304-320` rendert daraufhin `TiltCard` ungated.
 * Gemessen am ausgelieferten HTML: digital-direkt.com liefert **6 TiltCards**
 * aus, ohne `TiltCard` je zu importieren oder `tilt` zu setzen. Niemand hat
 * das bestellt, niemand hat es bemerkt.
 *
 * Ein Import-Grep sieht davon nichts — die öffentliche API ist hier eine Prop,
 * kein Import. Deshalb misst dieser Guard am gebauten `dist/` und vergleicht
 * mit dem, was der Kunde in seinem `src/` tatsächlich angefordert hat.
 *
 * ## Warum <style>/<script> zwingend rausmüssen
 *
 * Astro inlint `tokens-base.css` in jede Seite, und dort stehen Selektoren der
 * Form `[data-motion-reveal=up]{…}`. Ohne Filter zählt das als ausgeliefertes
 * Markup — gemessen: digital-direkt 5 Phantom-Reveals (echt: 0), blitzsicht 19
 * statt 14. Der Guard würde dann bei JEDEM Kunden anschlagen und wäre wertlos.
 *
 * @typedef {'motion_without_consent'} MotionIssueType
 * @typedef {{ type: MotionIssueType, marker: string, component: string, count: number, details: string }} MotionIssue
 */

/**
 * Motion-Vokabular der Props → Komponente, die daraufhin gerendert wird.
 *
 * Bewusst eine explizite Tabelle statt einer Ableitung: die Aktivierungen
 * stehen in `Hero.astro` und `LandingPage.astro` in vier verschiedenen
 * Schreibweisen (`&&`, Ternär, mehrzeilig), eine Regex darüber wäre stiller
 * als sie aussieht. Gegen Drift schützt der Test
 * `deckt jede Motion-Komponente ab`, der fehlschlägt, sobald cw-core eine
 * Motion-Komponente bekommt, die hier fehlt.
 *
 * Quellen: `Hero.astro:52-63` (HeroMotionConfig),
 * `LandingPage.astro:54-61` (MotionLayerConfig), `PaketeSection.astro:88-100`.
 */
export const MOTION_PROP_KEYS = Object.freeze({
  blob: 'AnimatedBlob',
  textReveal: 'TextReveal',
  stagger: 'StaggerGroup',
  parallax: 'ParallaxImage',
  magnetic: 'MagneticButton',
  smoothScroll: 'SmoothScroll',
  progress: 'ScrollProgress',
  cursor: 'CustomCursor',
  tilt: 'TiltCard',
});

/**
 * Motion-Komponenten, die ausschliesslich per direktem Import kommen — es gibt
 * keine Prop, die sie einschaltet. Sie brauchen deshalb keinen Tabelleneintrag.
 */
export const IMPORT_ONLY_MOTION = Object.freeze(['ScrollReveal', 'CountUp', 'FullBleed']);

/**
 * Dateien in `components/motion/`, die keine Motion-Komponente sind und
 * deshalb weder eine Prop noch einen Marker haben können.
 *
 * `MotionRuntime.astro` rendert kein Markup — sie trägt ausschliesslich den
 * `<script>`-Block, über den Astro das gemeinsame Laufzeitmodul einmal pro
 * Seite ausliefert (blitzsicht-ops#650). Sie schaltet nichts ein, was der
 * Kunde nicht schon bestellt hätte: sie kommt nur mit, wenn eine echte
 * Motion-Komponente sie rendert.
 *
 * Diese Liste ist bewusst kurz zu halten. Wer hier etwas einträgt, nimmt es
 * dem Consent-Guard aus dem Blick.
 */
export const NON_VISUAL_MOTION = Object.freeze(['MotionRuntime']);

/**
 * Entfernt `<style>`- und `<script>`-Blöcke samt Inhalt.
 * Selbstschliessende Tags zuerst, sonst frisst die Paar-Regel alles bis zum
 * nächsten Schluss-Tag.
 *
 * @param {string} html
 * @returns {string}
 */
export function stripInlineBlocks(html) {
  return html
    .replace(/<(?:style|script)\b[^>]*\/>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '');
}

/**
 * Entfernt Block- und Zeilenkommentare, damit Doku nicht als Nutzung zählt.
 * `://` bleibt unangetastet (URLs in Zeichenketten).
 *
 * @param {string} code
 * @returns {string}
 */
export function stripComments(code) {
  return code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

/**
 * Zählt einen Marker im bereits bereinigten HTML.
 *
 * Nach dem Marker muss ein Attribut-Ende folgen (`=`, Leerraum, `>`, `/`),
 * sonst zählt `data-motion-countup` jedes `data-motion-countup-num` mit.
 *
 * @param {string} strippedHtml
 * @param {string} marker
 * @returns {number}
 */
export function countMarker(strippedHtml, marker) {
  let count = 0;
  let idx = 0;
  for (;;) {
    idx = strippedHtml.indexOf(marker, idx);
    if (idx === -1) break;
    const next = strippedHtml[idx + marker.length];
    if (next === undefined || /[=\s>/]/.test(next)) count += 1;
    idx += marker.length;
  }
  return count;
}

/**
 * Ordnet jedem `data-motion-*`-Marker die Komponente(n) zu, die ihn setzen.
 *
 * @param {Array<{name: string, source: string}>} motionComponents
 * @returns {Map<string, string[]>}
 */
export function buildMarkerOwners(motionComponents) {
  /** @type {Map<string, string[]>} */
  const owners = new Map();
  for (const { name, source } of motionComponents) {
    const markers = new Set(source.match(/data-motion-[a-z0-9]+(?:-[a-z0-9]+)*/g) ?? []);
    for (const marker of markers) {
      if (!owners.has(marker)) owners.set(marker, []);
      const list = owners.get(marker);
      if (list && !list.includes(name)) list.push(name);
    }
  }
  for (const list of owners.values()) list.sort();
  return owners;
}

/**
 * Sammelt, welchen Motion-Komponenten der Kunde zugestimmt hat.
 *
 * Zwei gültige Formen der Zustimmung, beide werden anerkannt:
 *   1. Direkter Import  — `import TiltCard from '@cw/core/components/motion/TiltCard.astro'`
 *   2. Explizite Prop   — `motion={{ textReveal: true }}`, `tilt={true}`
 *      (blitzsicht fährt Form 2; ohne sie würde der Guard dort dreifach
 *      falsch anschlagen)
 *
 * @param {string[]} sourceTexts Inhalte der Kunden-Quelldateien
 * @returns {Set<string>} Komponenten-Namen
 */
export function collectConsent(sourceTexts) {
  /** @type {Set<string>} */
  const consented = new Set();
  for (const raw of sourceTexts) {
    const code = stripComments(raw);

    for (const m of code.matchAll(
      /\bimport\s+(?!type\b)[^;\n]*?from\s*['"][^'"]*\/([A-Z][A-Za-z0-9]*)\.astro['"]/g,
    )) {
      consented.add(m[1]);
    }

    for (const [key, component] of Object.entries(MOTION_PROP_KEYS)) {
      // `textReveal: true` innerhalb motion={{…}} oder `tilt={true}` / `tilt`
      const re = new RegExp(`\\b${key}\\s*(?::\\s*(?:true|\\{)|=\\s*\\{\\s*true)`);
      if (re.test(code)) consented.add(component);
    }
  }
  return consented;
}

/**
 * Der eigentliche Check.
 *
 * Meldet jeden Marker, der ausgeliefert wird, obwohl weder ein Import noch
 * eine Prop ihn angefordert hat. Mehrdeutige Marker (`data-motion-reveal`
 * setzen `ScrollReveal`, `StaggerGroup` UND `FullBleed`) werden nur gemeldet,
 * wenn KEINE ihrer Besitzer-Komponenten zugestimmt ist — sonst entstünde eine
 * Warnung, die niemand auflösen kann.
 *
 * @param {{
 *   markerCounts: Record<string, number>,
 *   markerOwners: Map<string, string[]>,
 *   consented: Set<string>,
 *   acknowledged?: readonly string[],
 * }} input
 * @returns {MotionIssue[]}
 */
export function checkMotionConsent({ markerCounts, markerOwners, consented, acknowledged = [] }) {
  const ack = new Set();
  for (const entry of acknowledged) {
    ack.add(entry);
    const mapped = /** @type {Record<string, string>} */ (MOTION_PROP_KEYS)[entry];
    if (mapped) ack.add(mapped);
  }

  /** @type {MotionIssue[]} */
  const issues = [];
  for (const [marker, count] of Object.entries(markerCounts)) {
    if (count === 0) continue;
    const owners = markerOwners.get(marker) ?? [];
    if (owners.length === 0) continue;
    if (owners.some((o) => consented.has(o) || ack.has(o))) continue;

    const component = owners.join(' oder ');
    const optOut = Object.entries(MOTION_PROP_KEYS).find(([, c]) => owners.includes(c));
    const hint = optOut
      ? `Gewollt? Dann \`acknowledgedMotion: ['${optOut[0]}']\` setzen. ` +
        `Nicht gewollt? Dann \`${optOut[0]}={false}\` an der Komponente.`
      : `Gewollt? Dann \`acknowledgedMotion: ['${owners[0]}']\` setzen.`;
    issues.push({
      type: 'motion_without_consent',
      marker,
      component,
      count,
      details:
        `${count}× \`${marker}\` ausgeliefert (${component}), aber weder importiert ` +
        `noch per Prop angefordert. ${hint}`,
    });
  }
  return issues.sort((a, b) => b.count - a.count || a.marker.localeCompare(b.marker));
}
