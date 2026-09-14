// @ts-check
/**
 * @cw/core/integrations/ai-discovery/robots-ai-check
 *
 * Build-time-Guard für die KI-Bot-Politik in `dist/robots.txt`.
 *
 * ANLASS (14.09.2026). Die robots-Vorlage sperrte unter „Training-Only-Bots“ zwei Abrufer,
 * die eine Seite im Auftrag eines Nutzers holen (MistralAI-User, Meta-ExternalFetcher) —
 * gegen ihre eigene Strategiezeile „Zitations-Bots erlaubt“. In der Flotte standen dazu
 * fünf robots-Varianten nebeneinander, keine mit Content-Signal. Eine Seite, die einen
 * Such- oder Abruf-Bot aussperrt, taucht in dessen Antworten nicht auf — und niemand
 * merkt es, weil der Browser die Seite weiter normal zeigt.
 *
 * Geprüft wird die ausgelieferte Datei, nicht die Vorlage: Kunden-Repos pflegen
 * `public/robots.txt` von Hand.
 *
 * Auswertung nach RFC 9309:
 *   - aufeinanderfolgende `User-agent`-Zeilen bilden EINE Gruppe;
 *   - ein Bot mit eigener Gruppe liest die `*`-Gruppe nicht mehr;
 *   - bei gleich langen Treffern gewinnt Allow — `Allow: /` neben `Disallow: /` sperrt nicht.
 *
 * Fehler (error): `*` oder ein Such-/Abruf-Bot hat `Disallow: /`.
 * Hinweis (warn): eine Gruppe, die Bots zulässt, trägt keine `Content-Signal`-Zeile.
 * Trainings-Bots zu sperren ist eine legitime Kundenentscheidung und wird nicht gemeldet.
 *
 * @typedef {'wildcard_blocked'|'bot_blocked'|'content_signal_missing'} RobotsAiIssueType
 * @typedef {{ type: RobotsAiIssueType, severity: 'error'|'warn', bot?: string, detail: string }} RobotsAiIssue
 * @typedef {{ agents: string[], rules: { key: string, value: string }[] }} RobotsGruppe
 */

/**
 * Such- und Abruf-Bots: Sie holen eine Seite, um sie in einen Suchindex aufzunehmen oder
 * eine Nutzerfrage zu beantworten. Wer sie sperrt, verschwindet aus den Antworten.
 */
export const SUCH_UND_ABRUF_BOTS = [
  'Googlebot',
  'Bingbot',
  'OAI-SearchBot',
  'ChatGPT-User',
  'Claude-SearchBot',
  'Claude-User',
  'PerplexityBot',
  'Perplexity-User',
  'MistralAI-User',
  'Meta-ExternalFetcher',
  'DuckAssistBot',
];

/**
 * Zerlegt eine robots.txt in Gruppen. Namen der Bots klein, Schlüssel klein.
 * `Sitemap` ist global und gehört zu keiner Gruppe.
 * @param {string} content
 * @returns {RobotsGruppe[]}
 */
export function robotsGruppen(content) {
  /** @type {RobotsGruppe[]} */
  const gruppen = [];
  /** @type {RobotsGruppe | null} */
  let aktuell = null;
  for (const roh of content.split(/\r?\n/)) {
    const zeile = roh.replace(/#.*$/, '').trim();
    const m = /^([A-Za-z-]+)\s*:\s*(.*)$/.exec(zeile);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const value = m[2].trim();
    if (key === 'user-agent') {
      if (!aktuell || aktuell.rules.length > 0) {
        aktuell = { agents: [], rules: [] };
        gruppen.push(aktuell);
      }
      aktuell.agents.push(value.toLowerCase());
    } else if (key !== 'sitemap' && aktuell) {
      aktuell.rules.push({ key, value });
    }
  }
  return gruppen;
}

/**
 * Regeln, die für einen Bot gelten: seine eigene(n) Gruppe(n), sonst die `*`-Gruppe.
 * @param {RobotsGruppe[]} gruppen
 * @param {string} bot
 */
function regelnFuer(gruppen, bot) {
  const name = bot.toLowerCase();
  const eigene = gruppen.filter((g) => g.agents.includes(name));
  const quelle = eigene.length > 0 ? eigene : gruppen.filter((g) => g.agents.includes('*'));
  return { eigene: eigene.length > 0, rules: quelle.flatMap((g) => g.rules) };
}

/**
 * Komplett gesperrt: `Disallow: /` ohne `Allow: /` daneben.
 * @param {{ key: string, value: string }[]} rules
 */
function sperrtAlles(rules) {
  const ganz = (/** @type {string} */ v) => v === '/' || v === '/*';
  return rules.some((r) => r.key === 'disallow' && ganz(r.value))
    && !rules.some((r) => r.key === 'allow' && ganz(r.value));
}

/**
 * @param {string} content Inhalt von `dist/robots.txt`
 * @returns {RobotsAiIssue[]}
 */
export function checkRobotsAiPolicy(content) {
  const gruppen = robotsGruppen(content);
  /** @type {RobotsAiIssue[]} */
  const issues = [];

  if (sperrtAlles(regelnFuer(gruppen, '*').rules)) {
    issues.push({
      type: 'wildcard_blocked',
      severity: 'error',
      detail:
        '`User-agent: *` hat `Disallow: /` — die Seite ist für jeden Crawler ohne eigene Gruppe ' +
        'gesperrt, auch für Googlebot, Bingbot und die KI-Suchbots.',
    });
  }

  for (const bot of SUCH_UND_ABRUF_BOTS) {
    const { eigene, rules } = regelnFuer(gruppen, bot);
    // Ohne eigene Gruppe erbt der Bot von `*` — das ist oben schon bewertet.
    if (eigene && sperrtAlles(rules)) {
      issues.push({
        type: 'bot_blocked',
        severity: 'error',
        bot,
        detail:
          `${bot} hat \`Disallow: /\`. ${bot} holt Seiten für eine Suche oder eine Nutzerfrage — ` +
          'gesperrt taucht die Seite in dessen Antworten nicht auf.',
      });
    }
  }

  const offen = gruppen.filter((g) => !sperrtAlles(g.rules));
  const ohneSignal = offen.filter((g) => !g.rules.some((r) => r.key === 'content-signal'));
  if (gruppen.length === 0 || ohneSignal.length > 0) {
    const wo = ohneSignal.length > 0
      ? ohneSignal.map((g) => g.agents.slice(0, 3).join(', ') + (g.agents.length > 3 ? ', …' : '')).join(' | ')
      : 'ganze Datei';
    issues.push({
      type: 'content_signal_missing',
      severity: 'warn',
      detail:
        `Content-Signal fehlt (${wo}). Ohne die Zeile bleibt offen, ob Inhalte für Suche, ` +
        'KI-Antworten und Training genutzt werden dürfen. Ein Bot mit eigener Gruppe liest die ' +
        '`*`-Gruppe nicht — die Zeile gehört in jede offene Gruppe. Vorlage: ' +
        'cw-core/src/templates/robots.txt.template.',
    });
  }

  return issues;
}
