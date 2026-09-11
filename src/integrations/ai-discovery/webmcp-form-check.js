// @ts-check
/**
 * @cw/core/integrations/ai-discovery/webmcp-form-check
 *
 * Build-time-Guard für Formulare, die sich per WebMCP als Agent-Werkzeug anmelden
 * (deklarative API: `toolname` + `tooldescription` am `<form>`).
 *
 * ANLASS (11.09.2026). Beim Pilot für `ContactForm agentTool` zeigte die Messung in
 * Chrome 153 (CDP `WebMCP.toolsAdded`), dass Chrome JEDES benannte Feld ins Werkzeug-
 * Schema übernimmt — ausser `type="hidden"`, `disabled`, `readonly` (nur bei Text-
 * feldern) und `<output>`. `display:none`, `aria-hidden`, `hidden` und `inert` schützen
 * NICHT. Naiv angeschaltet standen beide Honeypots (`botcheck`, `url_honey`) und die
 * Consent-Checkbox (`marketing_consent`) als Parameter im Schema. Folgen:
 *   - ein Agent füllt den Honeypot → der Server verwirft die Anfrage still als Spam,
 *     der Interessent glaubt, er habe geschrieben;
 *   - ein Agent hakt die Einwilligung an → eine Einwilligung, die kein Mensch gab.
 * Beides ist im Quelltext unsichtbar — deshalb misst der Guard am ausgelieferten HTML.
 *
 * Die Schema-Regel unten ist eine NACHBILDUNG von Chromes Verhalten, gemessen, nicht aus
 * der Spec (dort steht der Algorithmus als "TBD"). Ändert Chrome ihn, driftet sie —
 * `scripts/webmcp-probe.mjs` misst gegen den echten Browser nach.
 *
 * Zusätzlich die drei Fehlerbedingungen des Lighthouse-Audits "WebMCP schema validity":
 * toolname ohne tooldescription, tooldescription ohne toolname, Pflichtfeld ohne name.
 *
 * @typedef {'tool_without_description'|'description_without_toolname'|'required_field_without_name'
 *   |'autosubmit'|'no_submit_button'|'duplicate_toolname'|'honeypot_in_schema'|'consent_in_schema'} WebMcpIssueType
 * @typedef {{ page: string, type: WebMcpIssueType, detail: string }} WebMcpIssue
 * @typedef {{ name: string, tag: string, type: string, attrs: Map<string, string> }} SchemaFeld
 */

/** Bereiche ohne Markup — dort steht "<form" als Text, nicht als Element. */
function ohneTextBereiche(html) {
  return html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '').replace(/<!--[\s\S]*?-->/g, '');
}

/**
 * Attribute eines Start-Tags. Namen klein, boolesche Attribute mit Wert ''.
 * @param {string} roh Text zwischen Tag-Name und `>`
 * @returns {Map<string, string>}
 */
export function attribute(roh) {
  /** @type {Map<string, string>} */
  const m = new Map();
  for (const a of roh.matchAll(/([^\s"'>\/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g)) {
    const name = a[1].toLowerCase();
    if (!m.has(name)) m.set(name, a[2] ?? a[3] ?? a[4] ?? '');
  }
  return m;
}

/** Input-Typen, die nie als Parameter erscheinen. */
const KEIN_PARAMETER = new Set(['hidden', 'submit', 'button', 'reset', 'image']);
/** Input-Typen, bei denen `readonly` wirkt (HTML) — und damit auch Chromes Ausschluss. */
const READONLY_WIRKT = new Set(['text', 'search', 'url', 'tel', 'email', 'password',
  'date', 'month', 'week', 'time', 'datetime-local', 'number']);

/**
 * Felder, die Chrome 153 aus einem Formular ins Werkzeug-Schema übernimmt.
 * Gemessen am 11.09.2026 (siehe Kopf). `<output>` und Felder ausserhalb des
 * `<form>`-Elements (Attribut `form="…"`) bleiben unberücksichtigt.
 * @param {string} formInnen HTML zwischen `<form …>` und `</form>`
 * @returns {SchemaFeld[]}
 */
export function schemaFelder(formInnen) {
  // Felder in <fieldset disabled> sind disabled — Chrome lässt sie weg.
  const ohneGesperrt = formInnen.replace(
    /<fieldset\b([^>]*)>[\s\S]*?<\/fieldset\s*>/gi,
    (ganz, roh) => (attribute(roh).has('disabled') ? '' : ganz),
  );
  /** @type {SchemaFeld[]} */
  const felder = [];
  for (const m of ohneGesperrt.matchAll(/<(input|textarea|select)\b([^>]*)>/gi)) {
    const tag = m[1].toLowerCase();
    const attrs = attribute(m[2]);
    const type = tag === 'input' ? (attrs.get('type') || 'text').toLowerCase() : tag;
    if (tag === 'input' && KEIN_PARAMETER.has(type)) continue;
    if (attrs.has('disabled')) continue;
    if (attrs.has('readonly') && (tag === 'textarea' || READONLY_WIRKT.has(type))) continue;
    felder.push({ name: attrs.get('name') ?? '', tag, type, attrs });
  }
  return felder;
}

/** Für Menschen versteckt, für Agenten nicht: die Signatur eines Honeypots. */
function istHoneypot(/** @type {SchemaFeld} */ f) {
  const style = (f.attrs.get('style') ?? '').replace(/\s/g, '').toLowerCase();
  return (
    /honey|botcheck/i.test(f.name) ||
    f.attrs.get('aria-hidden') === 'true' ||
    f.attrs.get('tabindex') === '-1' ||
    style.includes('display:none') ||
    style.includes('left:-9999px')
  );
}

/** `<button>` ohne type oder mit type=submit, oder `<input type=submit|image>`. */
function hatAbsendeKnopf(/** @type {string} */ formInnen) {
  for (const m of formInnen.matchAll(/<(button|input)\b([^>]*)>/gi)) {
    const a = attribute(m[2]);
    const typ = (a.get('type') ?? (m[1].toLowerCase() === 'button' ? 'submit' : 'text')).toLowerCase();
    if (typ === 'submit' || (m[1].toLowerCase() === 'input' && typ === 'image')) return true;
  }
  return false;
}

function istEinwilligung(/** @type {SchemaFeld} */ f) {
  return /consent|einwillig/i.test(`${f.name} ${f.attrs.get('id') ?? ''}`);
}

/**
 * @param {{ page: string, html: string }[]} seiten
 * @returns {WebMcpIssue[]}
 */
export function checkWebMcpForms(seiten) {
  /** @type {WebMcpIssue[]} */
  const issues = [];
  for (const { page, html } of seiten) {
    /** @type {Map<string, number>} */
    const namen = new Map();
    for (const m of ohneTextBereiche(html).matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form\s*>/gi)) {
      const attrs = attribute(m[1]);
      const toolname = attrs.get('toolname');
      const hatBeschreibung = !!attrs.get('tooldescription');
      if (toolname === undefined) {
        if (hatBeschreibung) {
          issues.push({ page, type: 'description_without_toolname',
            detail: '<form> mit tooldescription, aber ohne toolname — Chrome meldet kein Werkzeug an.' });
        }
        continue;
      }
      const wer = `Werkzeug "${toolname}"`;
      namen.set(toolname, (namen.get(toolname) ?? 0) + 1);
      if (!hatBeschreibung) {
        issues.push({ page, type: 'tool_without_description',
          detail: `${wer}: toolname ohne tooldescription — Chrome meldet es nicht an.` });
      }
      if (attrs.has('toolautosubmit')) {
        issues.push({ page, type: 'autosubmit',
          detail: `${wer}: toolautosubmit gesetzt — der Agent schickt ohne den Menschen ab. Abschicken muss der Nutzer.` });
      } else if (!hatAbsendeKnopf(m[2])) {
        // Chrome 153 lehnt den Aufruf dann ab: "No submit button was found, but for a form
        // without `toolautosubmit`, there must be a submit button" (gemessen 11.09.2026).
        issues.push({ page, type: 'no_submit_button',
          detail: `${wer}: kein Absende-Knopf im Formular — Chrome lehnt jeden Aufruf ab.` });
      }
      for (const f of schemaFelder(m[2])) {
        if (!f.name && f.attrs.has('required')) {
          issues.push({ page, type: 'required_field_without_name',
            detail: `${wer}: Pflichtfeld <${f.tag}> ohne name — erscheint im Schema als leerer Parameter.` });
        }
        if (istHoneypot(f)) {
          issues.push({ page, type: 'honeypot_in_schema',
            detail: `${wer}: verstecktes Feld "${f.name}" steht im Schema. Füllt ein Agent es, verwirft der ` +
              'Server die Anfrage als Spam. Textfeld: readonly setzen; Checkbox: im Agent-Modus weglassen.' });
        } else if (istEinwilligung(f)) {
          issues.push({ page, type: 'consent_in_schema',
            detail: `${wer}: Einwilligung "${f.name}" steht im Schema — ein Agent könnte sie anhaken. ` +
              'readonly hilft bei Checkboxen nicht; Einwilligung und Agent-Werkzeug nicht im selben Formular.' });
        }
      }
    }
    for (const [name, n] of namen) {
      if (n > 1) {
        issues.push({ page, type: 'duplicate_toolname',
          detail: `Werkzeug "${name}" ${n}× auf derselben Seite — der Agent kann sie nicht unterscheiden.` });
      }
    }
  }
  return issues;
}
