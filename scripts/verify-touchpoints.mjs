#!/usr/bin/env node
/**
 * cw-core: Touchpoint-Audit — kein kaputter Kontakt-Touchpoint vor Ad-Spend.
 *
 * Prüft, dass jeder Kontaktweg der Site technisch stimmt, BEVOR bezahlter
 * Traffic darauf läuft (Anlass: digital-direkt Pre-Ads-Audit 2026-07 — der
 * Homepage-Anruf-CTA wählte `tel:+4994015395900`, Durchwahl 00 statt 0):
 *   - jede tel:-Href kanonisch (`tel:+<ziffern>`, keine Spaces/Bindestriche)
 *     UND digit-normalisiert im SSOT-Telefon-Set aus src/data/site-data.ts
 *   - jede mailto: im SSOT-E-Mail-Set (oder Allowlist, z. B. Aufsichtsbehörde)
 *   - jede wa.me-/api.whatsapp.com-Href im SSOT-Telefon-Set
 *   - (dist) interne Links + Ads-URLs als gebaute Datei oder Rewrite auflösbar,
 *     Redirect-Treffer = Hop — dieselbe Frage wie live, aber schon im PR-Gate
 *   - (live) interne Links direkt 200, null Redirect-Hops
 *   - (live) Ads-Final-URLs literal 200 ohne Redirect
 *   - (live) Plausible-Proxy-Kette (/js/script.js, /api/event) erreichbar
 *   - (live) /api/contact lebt: Honeypot-Trip-Submit → 200 {ok:true}
 *
 * Modi:
 *   node verify-touchpoints.mjs --dist dist            # gebautes HTML (CI-PR-Gate)
 *   node verify-touchpoints.mjs --url https://kunde.de  # live (Preview/Prod)
 *
 * Optionen/Env:
 *   --root <dir>        Customer-Repo-Root (Default cwd) — für site-data.ts + Config
 *   --skip-empty-post   POST-{}-Check weglassen (wenn verify-form-health im selben
 *                       Job läuft — Rate-Limit-Budget ist 3 POSTs/10min pro IP!)
 *   --origin-probe      zusätzlich Foreign-Origin-POST → erwartet 403
 *   SKIP_TOUCHPOINTS=true  ganzen Check überspringen (Repository-Variable)
 *
 * Per-Customer-Config (optional): <root>/touchpoint-audit.config.json
 *   {
 *     "extraPhones": ["+499401539590"],
 *     "extraEmails": [],
 *     "allowExternalMailto": ["poststelle@lda.bayern.de"],
 *     "adsFinalUrls": ["https://kunde.de/leistungen/x/"],
 *     "distLinkChecks": "fail",  // "fail" (Default seit v0.109.0) | "warn" | "off"
 *     "assetRefChecks": "warn"   // "warn" (Default seit v0.111.0) | "fail" | "off"
 *   }
 *
 * distLinkChecks steuert NUR die dist-Link-/Ads-Auflösung, assetRefChecks NUR die
 * Asset-Referenzen (src/srcset/CSS-url()). Der tel:/mailto:-Check bleibt davon
 * unberührt hart — er war der Anlass des Scripts und darf nicht mit abgeschaltet
 * werden, wenn ein Repo seine Altlinks noch abarbeitet.
 *
 * Rate-Limit-Budget: der contact-handler limitiert 3 POSTs/10min pro IP, und der
 * Limiter läuft VOR dem Honeypot. Dieses Script macht deshalb maximal 2 POSTs auf
 * /api/contact (Empty-Body + Honeypot-Trip; mit --skip-empty-post nur 1) und wertet
 * 429 als eigenen Status RATE_LIMITED (Warnung, kein FAIL) — sonst meldet der Test
 * am Launch-Gate „kaputt", wo nur das Budget verbraucht war. Die Foreign-Origin-
 * Probe zählt NICHT ins Budget (Origin-Check lehnt VOR dem Limiter ab).
 *
 * Live-Modus crawlt nur sitemap.xml — bewusst ausgeschlossene Seiten (z. B.
 * /masterplan/) deckt nur der dist-Modus ab; in CI laufen beide.
 *
 * Exit-Codes: 0 ok · 1 mindestens ein FAIL · 2 Konfig-Fehler
 */

import { existsSync, readdirSync, readFileSync, statSync, realpathSync } from 'node:fs';
import { join, extname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { AUFSICHTS_MAILTO_ALLOWLIST } from '../src/utils/legal/aufsichtsbehoerde.js';

// ─── Pure Helpers (exportiert für node --test) ──────────────────────────────

/**
 * Digit-Normalisierung analog phoneToTelHref (src/utils/text/tel-href.ts):
 * nationale 0 → +49, Ländercode ohne + → +, alles außer Ziffern raus.
 * @param {string} raw @returns {string} z. B. '+4994015395920'
 */
export function normalizePhone(raw) {
  if (!raw) return '';
  const d = String(raw).replace(/[^\d+]/g, '');
  if (d.startsWith('+')) return d;
  if (d.startsWith('49')) return '+' + d;
  if (d.startsWith('0')) return '+49' + d.slice(1);
  return d ? '+49' + d : '';
}

/**
 * Extrahiert SSOT-Kontaktdaten aus site-data.ts per Regex (gleiches Idiom wie
 * validate-form-backend.mjs — kein TS-Import nötig).
 * Telefone: Werte von Keys, die nach Telefon/Fax/WhatsApp aussehen.
 * E-Mails: ALLE E-Mail-förmigen String-Literale (Persons, karriere etc.).
 * @param {string} src Inhalt von site-data.ts
 * @returns {{ phones: Set<string>, emails: Set<string> }} phones digit-normalisiert, emails lowercase
 */
export function parseSsot(src) {
  const phones = new Set();
  const emails = new Set();
  // `mobile` gehört dazu, seit donau-profi darüber fiel (12.08.2026): die Nummer
  // stand als `mobile: '+49 151 18220924'` sauber in site-data.ts, der Parser las
  // sie nicht — und der Guard meldete 17-mal „Nummer nicht im SSOT" für eine
  // Nummer, die im SSOT steht. Das war der Guard, nicht der Kunde.
  for (const m of src.matchAll(/\b(?:phone|fax|tel|mobile|whatsapp)\w*\s*:\s*['"`]([^'"`]+)['"`]/gi)) {
    const n = normalizePhone(m[1]);
    if (n.length >= 8) phones.add(n);
  }
  for (const m of src.matchAll(/['"`]([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})['"`]/g)) {
    emails.add(m[1].toLowerCase());
  }
  return { phones, emails };
}

/**
 * Postet diese Seite auf `/api/contact`?
 *
 * Bewusst am `action`-Attribut und nicht an „gibt es ein <form>": Suchfelder und
 * Newsletter-Anmeldungen sind auch Formulare, führen aber nicht auf die
 * Kontakt-Route. hausamlago (Telefon-/WhatsApp-only) hat gar keine — die Route
 * dort als „tot" zu melden wäre ein Fehlalarm (12.08.2026).
 *
 * @param {string} html
 * @returns {boolean}
 */
export function postsToContactApi(html) {
  return /action=["'][^"']*\/api\/contact\b/i.test(html);
}

/**
 * Alle Href-Werte einer Sorte aus HTML ziehen (Attribut-Anführungszeichen-tolerant).
 * @param {string} html @param {'tel'|'mailto'} scheme @returns {string[]} rohe Href-Werte inkl. Schema
 */
export function extractHrefs(html, scheme) {
  // (?:^|[\s"']) verhindert Treffer auf data-href / xlink:href.
  return [...html.matchAll(new RegExp(`(?:^|[\\s"'])href=["'](${scheme}:[^"']*)["']`, 'gi'))].map(
    (m) => m[1],
  );
}

/** @param {string} html @returns {string[]} wa.me / api.whatsapp.com Hrefs */
export function extractWhatsAppHrefs(html) {
  return [
    ...html.matchAll(/(?:^|[\s"'])href=["'](https?:\/\/(?:wa\.me|api\.whatsapp\.com)\/[^"']*)["']/gi),
  ].map((m) => m[1]);
}

/**
 * Hrefs, die wie ein Kontaktweg aussehen, aber KEIN Schema tragen —
 * `<a href="+4994015395920">` statt `href="tel:+…"`, `<a href="x@y.de">` statt `mailto:`.
 * Solche Links navigieren relativ (404) statt zu wählen/mailen.
 *
 * Diese Prüfung existiert, weil eine schemenlose Href für jede tel:/mailto:-Suche
 * unsichtbar ist: der Audit hätte „keine Probleme" gemeldet, während der Anruf-Link
 * tot war. Genau so ist es beim Bau dieses Scripts passiert (phoneToTelHref liefert
 * nur die Ziffern, das `tel:` muss der Aufrufer setzen) — der Fehler blieb im
 * Selbst-Review hängen, nicht im Test.
 *
 * @param {string} html
 * @returns {{ href: string, problem: string }[]}
 */
export function findSchemelessContactHrefs(html) {
  const out = [];
  for (const m of html.matchAll(/(?:^|[\s"'])href=["']([^"']+)["']/gi)) {
    const v = m[1].trim();
    if (/^\+\d[\d\s\-()]*$/.test(v) || /^0\d[\d\s\-()]{5,}$/.test(v)) {
      out.push({ href: v, problem: 'sieht aus wie eine Telefonnummer, aber `tel:`-Schema fehlt' });
    } else if (/^[^\s@/:]+@[^\s@/:]+\.[A-Za-z]{2,}$/.test(v)) {
      out.push({ href: v, problem: 'sieht aus wie eine E-Mail-Adresse, aber `mailto:`-Schema fehlt' });
    }
  }
  return out;
}

/**
 * Prüft alle tel:/mailto:/wa.me-Hrefs einer HTML-Seite gegen die SSOT-Sets.
 * @param {string} html
 * @param {{ phones: Set<string>, emails: Set<string> }} ssot
 * @param {{ allowExternalMailto?: string[] }} [cfg]
 * @returns {{ href: string, problem: string }[]}
 */
export function auditHtml(html, ssot, cfg = {}) {
  const problems = [...findSchemelessContactHrefs(html)];
  // Die Adresse der Datenschutz-Aufsichtsbehörde steht naturgemäss NICHT im
  // E-Mail-Set des Kunden — sie gehört niemandem im Haus. cw-core schreibt sie
  // aber selbst in jede Datenschutzerklärung (Beschwerderecht Art. 77 DSGVO).
  // Ohne diesen Default meldete der Guard die eigene Ausgabe als Fremdkörper:
  // drei von vier frisch ausgerollten Repos fielen am 12.08.2026 exakt darüber
  // (blitzsicht-ops#653). Abgeleitet aus utils/legal/aufsichtsbehoerde.js,
  // damit ein Wechsel der Behörde hier nicht nachgezogen werden muss.
  const allowMail = new Set([
    ...AUFSICHTS_MAILTO_ALLOWLIST,
    ...(cfg.allowExternalMailto ?? []).map((e) => e.toLowerCase()),
  ]);

  for (const href of extractHrefs(html, 'tel')) {
    const value = href.slice(4);
    if (!/^\+\d+$/.test(value)) {
      // RFC 3966 erlaubt Bindestriche als visuelle Separatoren — wir FAILen sie
      // trotzdem: eine Form pro Cluster (Konsistenz), Spaces sind ohnehin invalid.
      problems.push({ href, problem: 'tel: nicht kanonisch (erwartet tel:+<nur Ziffern>)' });
      continue;
    }
    if (ssot.phones.size > 0 && !ssot.phones.has(normalizePhone(value))) {
      problems.push({ href, problem: 'Nummer nicht im SSOT-Telefon-Set aus site-data.ts' });
    }
  }

  for (const href of extractHrefs(html, 'mailto')) {
    const addr = href.slice(7).split('?')[0].toLowerCase();
    if (!addr) {
      problems.push({ href, problem: 'leere mailto:' });
      continue;
    }
    if (ssot.emails.size > 0 && !ssot.emails.has(addr) && !allowMail.has(addr)) {
      problems.push({ href, problem: 'Adresse weder im SSOT-E-Mail-Set noch in allowExternalMailto' });
    }
  }

  for (const href of extractWhatsAppHrefs(html)) {
    const m = href.match(/(?:wa\.me\/|phone=)\+?(\d{6,})/);
    if (!m) {
      problems.push({ href, problem: 'WhatsApp-Link ohne erkennbare Nummer' });
      continue;
    }
    if (ssot.phones.size > 0 && !ssot.phones.has(normalizePhone('+' + m[1]))) {
      problems.push({ href, problem: 'WhatsApp-Nummer nicht im SSOT-Telefon-Set' });
    }
  }

  return problems;
}

/**
 * Interne Link-Hrefs (same-site, http/relative) aus HTML — für den Redirect-Check.
 *
 * 🔴 Das Fragment wird ABGESCHNITTEN, nicht als Ausschlusskriterium benutzt. Die
 * frühere Zeichenklasse `[^"'#]+` liess den Match scheitern, statt `#…` zu
 * entfernen: `href="/kontakt#formular"` matchte GAR NICHT und blieb ungeprüft.
 * 2166 hrefs der Flotte waren so unsichtbar, gemessen 12.08.2026
 * (blitzsicht-ops#656).
 *
 * @param {string} html @param {string} origin z. B. https://kunde.de
 * @returns {string[]} absolute URLs, dedupliziert
 */
export function extractInternalLinks(html, origin) {
  const out = new Set();
  for (const m of html.matchAll(/href=["']([^"']+)["']/gi)) {
    const href = m[1].split('#')[0];
    if (!href) continue; // reiner Seitenanker (href="#kontakt") — kein eigenes Ziel
    if (/^(mailto:|tel:|javascript:|data:)/i.test(href)) continue;
    if (/^https?:\/\//i.test(href)) {
      if (href.startsWith(origin)) out.add(href);
      continue;
    }
    if (href.startsWith('/')) out.add(origin + href);
  }
  return [...out];
}

/** Tags, deren src/srcset auf eine ausgelieferte Datei zeigt. */
const ASSET_TAG_RE = /<(?:img|source|script|video|audio|track|embed|iframe)\b[^>]*>/gi;

/**
 * Asset-Referenzen (Bilder, Skripte, Schriften, CSS-Hintergründe) aus HTML.
 *
 * Getrennt von `extractInternalLinks`, weil ein fehlendes Bild ein anderer
 * Schaden ist als ein toter Seiten-Link — und weil der Geltungsbereich ein
 * anderer ist. Anlass: blitzsicht-ops#656. Der prebuild-Schritt
 * `optimize-images.mjs --delete-originals` konvertiert `public/*.png` zu `.webp`
 * und räumt das Original weg; bleibt der Verweis auf `.png` stehen, lief das bis
 * v0.110.0 bei JEDEM Build in einen 404, ohne dass ein PR rot wurde
 * (blumen-schmid `/signet-white.png`, allstargirls `url(/star.png)`).
 *
 * 🔴 CSS-`url()` wird NUR in `<style>`-Blöcken gelesen, nie über rohes HTML.
 * Über die ganze Datei trifft der Regex JavaScript statt CSS: `new URL(t.href)`
 * → `url(t.href)`. Gemessen am 12.08.2026 über 518 Seiten der Flotte waren das
 * 502 von 554 Treffern — die Eingrenzung auf `<style>` lässt exakt null davon
 * übrig. Für `.css`-Dateien des dist ruft der Aufrufer mit `cssOnly` auf.
 *
 * Origin ist optional: fast alle Asset-Refs sind root-relativ, und ohne
 * `<link rel="canonical">` fällt der Link-Check sonst komplett aus (Beleg:
 * herztoene). Das Origin dient nur dazu, absolute Same-Site-URLs aufzulösen.
 *
 * @param {string} source HTML — oder CSS, wenn `cssOnly`
 * @param {string | null} origin z. B. https://kunde.de, optional
 * @param {{cssOnly?: boolean}} [opts]
 * @returns {{refs: string[], skippedRelative: number}} Pfade ab `/`, dedupliziert
 */
export function extractAssetRefs(source, origin, opts = {}) {
  const refs = new Set();
  let skippedRelative = 0;

  const push = (raw) => {
    const u = (raw ?? '').trim();
    if (!u) return;
    // data:/blob: tragen ihren Inhalt selbst; javascript:/mailto:/tel: sind keine Dateien.
    if (/^(data:|blob:|about:|javascript:|mailto:|tel:)/i.test(u)) return;
    if (u.startsWith('#')) return;
    if (u.startsWith('//')) return; // protokoll-relativ → immer extern
    if (/^https?:\/\//i.test(u)) {
      if (origin && (u === origin || u.startsWith(origin + '/'))) {
        const p = (u.slice(origin.length) || '/').split('#')[0];
        if (p.startsWith('/')) refs.add(p);
      }
      return; // fremdes Origin — nicht unsere Datei
    }
    if (!u.startsWith('/')) {
      // Relativ zum Dokument. Auflösung bräuchte den Ort der Quelldatei; über die
      // Flotte gemessen 6 Fälle. Bewusst ungeprüft, aber gezählt statt verschwiegen.
      skippedRelative++;
      return;
    }
    // Vercel-Bildoptimierung und Astros Image-Endpoint sind Laufzeit-Routen, keine
    // gebauten Dateien. Heute 0 Vorkommen — Vorsorge, damit ein Repo, das sie
    // einschaltet, nicht auf einen Schlag jedes Bild als Befund meldet.
    if (/^\/_vercel\//.test(u) || /^\/_image(?:[?/]|$)/.test(u)) return;
    refs.add(u.split('#')[0]);
  };

  if (!opts.cssOnly) {
    for (const m of source.matchAll(ASSET_TAG_RE)) {
      const tag = m[0];
      push(tag.match(/\ssrc=["']([^"']+)["']/i)?.[1]);
      const srcset = tag.match(/\ssrcset=["']([^"']+)["']/i)?.[1];
      if (srcset && !/^\s*data:/i.test(srcset)) {
        // "/a.webp 400w, /b.webp 800w" → URL ist der erste Token je Kandidat.
        for (const cand of srcset.split(',')) push(cand.trim().split(/\s+/)[0]);
      }
    }
  }

  const cssBlocks = opts.cssOnly
    ? [source]
    : [...source.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]);
  for (const css of cssBlocks) {
    for (const m of css.matchAll(/url\(\s*([^)]*?)\s*\)/gi)) {
      push(m[1].replace(/^["']|["']$/g, ''));
    }
  }

  return { refs: [...refs], skippedRelative };
}

// ─── dist-Modus: Links gegen das gebaute Verzeichnis auflösen ───────────────
//
// Bis v0.107.x liefen Link- und Ads-URL-Check ausschliesslich live, also erst
// NACH dem Vercel-Deploy im smoke-test-Job. digital-direkt-ops#17 lag deshalb
// sechs Tage unentdeckt: eine Seite wurde in eine andere eingearbeitet, der
// Redirect gesetzt — aber die Ads-Soll-Liste zeigte weiter auf die alte URL.
// Im PR war nichts rot. Die Helfer hier holen genau diese Prüfung in den
// dist-Modus vor, ohne Netzwerk.

/**
 * Canonical-Origin aus gebautem HTML lesen — im dist-Modus gibt es kein --url,
 * `extractInternalLinks` braucht aber eins, um same-site von extern zu trennen.
 * @param {string} html @returns {string | null} z. B. https://kunde.de
 */
export function detectOriginFromHtml(html) {
  const tag = html.match(/<link\b[^>]*\brel=["']canonical["'][^>]*>/i)?.[0];
  const href = tag?.match(/\bhref=["'](https?:\/\/[^/"']+)/i)?.[1];
  return href ?? null;
}

/**
 * Wurzel des ausgelieferten HTML im dist-Verzeichnis.
 *
 * Astro MIT Adapter (blitzsicht: `output:'static'` + `adapter: vercel()`) legt
 * das Output unter `dist/client/` ab, `dist/` selbst bleibt bis auf den
 * Adapter-Kram leer. Ein naives join(dist, urlPath) findet dort KEINE einzige
 * Datei und meldet jeden Link der Site als tot — bei blitzsicht 131 Stück,
 * gemessen 12.08.2026. Darum die Fallunterscheidung statt eines festen Pfads.
 *
 * @param {string} distDir @param {string[]} entries Namen direkt unter distDir
 * @returns {string} distDir oder distDir/client
 */
export function pickDistRoot(distDir, entries) {
  const hasHtmlHere = entries.some((e) => e.toLowerCase().endsWith('.html'));
  if (!hasHtmlHere && entries.includes('client')) return join(distDir, 'client');
  return distDir;
}

/**
 * URL-Pfad für den Dateisystem-Vergleich normalisieren.
 *
 * Prozent-Encoding UND Unicode-Form zählen beide: digital-direkt verlinkt
 * dieselbe Seite als `/leistungen/druck-kopierl%C3%B6sungen/` und als
 * `/leistungen/druck-kopierlösungen`. readdir liefert auf macOS/Linux NFC —
 * ein NFD-kodierter Href wäre ohne normalize() ein Fehlalarm.
 *
 * @param {string} raw @returns {string}
 */
export function normalizeUrlPath(raw) {
  let p = raw.split('#')[0].split('?')[0];
  try {
    p = decodeURIComponent(p);
  } catch {
    // Kaputtes Encoding (einzelnes %) — roh weiterverwenden statt zu werfen.
  }
  return p.normalize('NFC');
}

/**
 * Dateipfade (dist-relativ), unter denen ein URL-Pfad liegen kann.
 * Deckt Astros `directory`-Default und das `file`-Format ab, dazu das
 * trailingSlash-Paar: DD verlinkt viele Seiten als `/agb` UND `/agb/`.
 * @param {string} urlPath @returns {string[]}
 */
export function distPathCandidates(urlPath) {
  const p = normalizeUrlPath(urlPath).replace(/^\/+/, '').replace(/\/+$/, '');
  if (p === '') return ['index.html'];
  return [`${p}/index.html`, `${p}.html`, p];
}

/**
 * Löst einen URL-Pfad gegen die Dateiliste des gebauten dist/ auf.
 * @param {string} urlPath @param {Set<string>} files dist-relative Pfade, NFC
 * @returns {boolean}
 */
export function resolveDistPath(urlPath, files) {
  return distPathCandidates(urlPath).some((c) => files.has(c));
}

/**
 * Vercel-`source` in einen Regex übersetzen — `:param` und `:rest*`.
 * Alles darüber hinaus (Regex-Gruppen wie `:id(\\d+)`, Alternativen) wird
 * bewusst NICHT geraten: null heisst „nicht auswertbar", der Aufrufer warnt
 * dann, statt einen Treffer oder ein Nicht-Treffer zu erfinden.
 * @param {string} source @returns {RegExp | null}
 */
function vercelSourceToRegex(source) {
  if (/[()[\]{}?+^$|\\]/.test(source)) return null;
  const segs = source.split('/').filter((s) => s !== '');
  let re = '^';
  segs.forEach((seg, i) => {
    const last = i === segs.length - 1;
    if (seg.startsWith(':') && seg.endsWith('*')) {
      // `/x/:path*` erfasst auch `/x` selbst → Slash davor optional.
      re += '(?:/.*)?';
    } else if (seg.startsWith(':')) {
      re += '/[^/]+';
    } else {
      re += '/' + seg.replace(/[.]/g, '\\.');
    }
    if (last) re += '/?';
  });
  if (segs.length === 0) re += '/?';
  return new RegExp(re + '$');
}

/**
 * Erfasst eine vercel.json-Route diesen Pfad?
 *
 * 🔴 `has`/`missing` MÜSSEN mitgelesen werden. 16 von 22 Kundenrepos tragen die
 * www→Apex-Kanonisierung als Catch-all:
 *   {"source":"/:path*","has":[{"type":"host","value":"www.kunde.de"}], …}
 * Ein Matcher, der die Bedingung ignoriert, hält JEDEN Pfad für einen Redirect
 * und macht damit jeden internen Link der Flotte zum Befund (~700 Stück,
 * gemessen 12.08.2026). Der dist-Check prüft immer den kanonischen Host, für
 * den eine host-konditionierte Regel per Definition nicht greift — deshalb
 * gelten bedingte Regeln hier als nicht anwendbar.
 *
 * @param {string} urlPath
 * @param {{redirects?: object[], rewrites?: object[]}} vercelJson
 * @returns {'redirect' | 'rewrite' | 'unknown' | null}
 */
export function matchVercelRoute(urlPath, vercelJson) {
  const p = normalizeUrlPath(urlPath) || '/';
  let sawUnparsable = false;
  for (const [kind, list] of [
    ['rewrite', vercelJson?.rewrites ?? []],
    ['redirect', vercelJson?.redirects ?? []],
  ]) {
    for (const rule of list) {
      if (rule?.has || rule?.missing) continue; // bedingt → nicht auf dem Canonical-Host
      const src = rule?.source;
      if (typeof src !== 'string') continue;
      const re = vercelSourceToRegex(src);
      if (!re) {
        sawUnparsable = true;
        continue;
      }
      if (re.test(p)) return /** @type {'redirect'|'rewrite'} */ (kind);
    }
  }
  return sawUnparsable ? 'unknown' : null;
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  if (process.env.SKIP_TOUCHPOINTS === 'true') {
    console.log('ℹ️  SKIP_TOUCHPOINTS=true → Touchpoint-Audit übersprungen.');
    console.log('✅ Touchpoints: skipped');
    return 0;
  }

  const args = process.argv.slice(2);
  const getFlag = (name) => {
    const i = args.indexOf(name);
    return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : null;
  };
  const distDir = getFlag('--dist');
  const liveUrl = getFlag('--url')?.replace(/\/$/, '') ?? null;
  const root = getFlag('--root') ?? process.cwd();
  const skipEmptyPost = args.includes('--skip-empty-post');
  const originProbe = args.includes('--origin-probe');

  if (!distDir && !liveUrl) {
    console.error('FATAL: --dist <dir> oder --url <https://…> angeben.');
    console.error('Beispiele:');
    console.error('  node node_modules/@cw/core/scripts/verify-touchpoints.mjs --dist dist');
    console.error('  node node_modules/@cw/core/scripts/verify-touchpoints.mjs --url https://kunde.de');
    return 2;
  }

  // SSOT laden
  const siteDataPath = join(root, 'src', 'data', 'site-data.ts');
  let ssot = { phones: new Set(), emails: new Set() };
  if (existsSync(siteDataPath)) {
    ssot = parseSsot(readFileSync(siteDataPath, 'utf-8'));
  } else {
    console.warn(`⚠️  ${siteDataPath} nicht gefunden — SSOT-Abgleich entfällt, nur Syntax-Checks.`);
  }

  // Optionale Per-Customer-Config
  /** @type {{ extraPhones?: string[], extraEmails?: string[], allowExternalMailto?: string[], adsFinalUrls?: string[], distLinkChecks?: string, assetRefChecks?: string }} */
  let cfg = {};
  const cfgPath = join(root, 'touchpoint-audit.config.json');
  if (existsSync(cfgPath)) {
    try {
      cfg = JSON.parse(readFileSync(cfgPath, 'utf-8'));
    } catch (err) {
      console.error(`FATAL: ${cfgPath} ist kein valides JSON: ${err.message}`);
      return 2;
    }
  }
  for (const p of cfg.extraPhones ?? []) ssot.phones.add(normalizePhone(p));
  for (const e of cfg.extraEmails ?? []) ssot.emails.add(e.toLowerCase());

  console.log(
    `Touchpoint-Audit: ${ssot.phones.size} SSOT-Nummer(n), ${ssot.emails.size} SSOT-Adresse(n)` +
      (distDir ? ` · dist=${distDir}` : '') +
      (liveUrl ? ` · live=${liveUrl}` : ''),
  );

  let failed = 0;
  let warned = 0;
  const fail = (msg) => {
    console.log(`✗ ${msg}`);
    failed++;
  };
  const ok = (msg) => console.log(`✓ ${msg}`);
  const warn = (msg) => {
    console.log(`⚠ ${msg}`);
    warned++;
  };

  // ── Seiten einsammeln: dist-Walk oder sitemap-Crawl ──
  /** @type {{ name: string, html: string }[]} */
  const pages = [];

  /**
   * Ausgelagerte Stylesheets des dist. Mit `inlineStylesheets:'always'` landet CSS
   * im `<style>`-Block, aber nicht restlos — der allstargirls-Fall `url(/star.png)`
   * stand in `_astro/index.*.css`. Ohne diese Liste bliebe die Klasse offen.
   * @type {{ name: string, css: string }[]}
   */
  const distCss = [];

  /** @type {Set<string>} dist-relative Pfade aller gebauten Dateien, NFC */
  const distFiles = new Set();

  if (distDir) {
    const absArg = distDir.startsWith('/') ? distDir : join(root, distDir);
    if (!existsSync(absArg)) {
      console.error(`FATAL: dist-Verzeichnis ${absArg} existiert nicht — erst bauen.`);
      return 2;
    }
    const absDist = pickDistRoot(absArg, readdirSync(absArg));
    if (absDist !== absArg) {
      console.log(`ℹ️  Adapter-Build erkannt — ausgeliefertes HTML liegt in ${relative(absArg, absDist)}/.`);
    }
    const walk = (dir) =>
      readdirSync(dir).flatMap((e) => {
        const p = join(dir, e);
        return statSync(p).isDirectory() ? walk(p) : [p];
      });
    for (const f of walk(absDist)) {
      const rel = relative(absDist, f).replace(/\\/g, '/').normalize('NFC');
      distFiles.add(rel);
      if (extname(f) === '.html') pages.push({ name: rel, html: readFileSync(f, 'utf-8') });
      else if (extname(f) === '.css') distCss.push({ name: rel, css: readFileSync(f, 'utf-8') });
    }
    if (pages.length === 0) {
      console.error(`FATAL: keine .html-Dateien unter ${absDist}.`);
      return 2;
    }
  }

  if (liveUrl) {
    const get = (u, opts = {}) =>
      fetch(u, { headers: { 'User-Agent': 'cw-core-touchpoint-audit/1.0' }, ...opts });
    let urls = [liveUrl + '/'];
    try {
      const sm = await get(`${liveUrl}/sitemap-index.xml`).then((r) => (r.ok ? r.text() : null));
      const smUrls = [];
      const collect = (xml) => [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim());
      if (sm) {
        for (const sub of collect(sm)) {
          const x = await get(sub).then((r) => (r.ok ? r.text() : ''));
          smUrls.push(...collect(x));
        }
      } else {
        const flat = await get(`${liveUrl}/sitemap.xml`).then((r) => (r.ok ? r.text() : null));
        if (flat) smUrls.push(...collect(flat).filter((u) => !u.endsWith('.xml')));
      }
      if (smUrls.length > 0) urls = [...new Set(smUrls)];
      else warn(`keine Sitemap gefunden — Live-Crawl nur über ${liveUrl}/`);
    } catch (err) {
      warn(`Sitemap-Fetch fehlgeschlagen (${err.message}) — Live-Crawl nur über ${liveUrl}/`);
    }
    for (const u of urls) {
      try {
        const r = await get(u);
        if (r.status !== 200) {
          fail(`Sitemap-Seite ${u} → ${r.status} (erwartet 200)`);
          continue;
        }
        pages.push({ name: u, html: await r.text() });
      } catch (err) {
        fail(`Sitemap-Seite ${u} unerreichbar: ${err.message}`);
      }
    }
  }

  // ── Check 1: tel:/mailto:/WhatsApp-SSOT-Abgleich pro Seite ──
  let hrefProblems = 0;
  for (const page of pages) {
    // E-Mail-Signatur-Assets (public/email/) sind Mail-Client-Markup, kein
    // Website-Touchpoint — nur warnen, nicht failen (Fix: cw-core-Template).
    const softScope = /(^|\/)email\//.test(page.name);
    for (const p of auditHtml(page.html, ssot, cfg)) {
      if (softScope) warn(`[email-signatur] ${page.name}: ${p.href} — ${p.problem}`);
      else {
        fail(`${page.name}: ${p.href} — ${p.problem}`);
        hrefProblems++;
      }
    }
  }
  if (hrefProblems === 0) ok(`tel:/mailto:/WhatsApp-Hrefs auf ${pages.length} Seite(n) kanonisch + SSOT-konform`);

  // ── dist-Checks: interne Links + Ads-URLs OHNE Netzwerk ──
  //
  // Dieselbe Frage wie Check 2/3 im Live-Modus, nur eine Deploy-Stufe früher.
  //
  // Default ist hart seit v0.109.0. Der Check startete in v0.108.0 als Warnung,
  // weil eine Messung über lokal vorhandene dist/-Stände 15 Altbefunde vermuten
  // liess. Der Rollout mit frischen CI-Builds ergab dann 543 interne Links und
  // 0 Befunde über alle 12 Live-Repos — die Altbefunde waren Artefakte wochen-
  // alter Build-Stände, genau einer war echt und wurde im selben Zug behoben.
  // Eine saubere Flotte, die nur gewarnt wird, driftet zurück.
  //
  // Repos auf sehr alten Pins (< v0.108.0, alle nicht-live) sehen beim Bump
  // ihre Altbefunde hart. Dort ist `"distLinkChecks": "warn"` in der
  // touchpoint-audit.config.json der Weg, sie erst abzuarbeiten.
  //
  // Asset-Referenzen (seit v0.111.0) hängen am eigenen Schalter `assetRefChecks`,
  // damit Links und Assets getrennt abgestuft werden können: die Link-Prüfung ist
  // seit v0.109.0 flottenweit sauber und bleibt hart, die Asset-Prüfung startet
  // als Warnung und wird nach der Flottenmessung über frische CI-Builds
  // nachgezogen — derselbe Weg wie v0.108.0 → v0.109.0.
  const distMode = cfg.distLinkChecks ?? 'fail';
  const assetMode = cfg.assetRefChecks ?? 'warn';
  if (distDir && (distMode !== 'off' || assetMode !== 'off')) {
    for (const [key, value] of [
      ['distLinkChecks', distMode],
      ['assetRefChecks', assetMode],
    ]) {
      if (!['warn', 'fail', 'off'].includes(value)) {
        console.error(`FATAL: ${key}="${value}" unbekannt — erlaubt: "warn", "fail", "off".`);
        return 2;
      }
    }
    const flag = distMode === 'fail' ? fail : warn;
    const assetFlag = assetMode === 'fail' ? fail : warn;

    /** @type {{redirects?: object[], rewrites?: object[]}} */
    let vercelJson = {};
    const vercelPath = join(root, 'vercel.json');
    if (existsSync(vercelPath)) {
      try {
        vercelJson = JSON.parse(readFileSync(vercelPath, 'utf-8'));
      } catch (err) {
        warn(`vercel.json nicht lesbar (${err.message}) — Redirect-/Rewrite-Auflösung entfällt.`);
      }
    } else {
      warn('keine vercel.json — Links, die nur per Redirect/Rewrite leben, sind hier nicht erkennbar.');
    }

    // Nur der Link-Check braucht das Origin, um same-site von extern zu trennen.
    // Asset-Referenzen sind fast alle root-relativ und laufen auch ohne.
    const origin = pages.map((p) => detectOriginFromHtml(p.html)).find(Boolean) ?? null;
    if (!origin && distMode !== 'off') {
      warn('kein <link rel="canonical"> im dist gefunden — interne Links im dist-Modus nicht prüfbar.');
    }

    /**
     * Ein Pfad ist in Ordnung, wenn er als Datei gebaut wurde oder von einem
     * Rewrite bedient wird. Ein Redirect ist ein Hop — bezahlt bei Ads, langsam
     * bei internen Links. Nicht auswertbare Route-Syntax wird nie zum Befund.
     * @returns {string | null} Befundtext oder null
     */
    const judge = (urlPath) => {
      if (resolveDistPath(urlPath, distFiles)) return null;
      switch (matchVercelRoute(urlPath, vercelJson)) {
        case 'rewrite':
          return null;
        case 'redirect':
          return 'nur per Redirect erreichbar (Hop)';
        case 'unknown':
          return null; // vercel.json nutzt Syntax, die dieser Guard nicht deutet
        default:
          return 'weder gebaute Datei noch Redirect/Rewrite (toter Link)';
      }
    };

    /** @type {Map<string, string>} Pfad → erste Fundstelle, für beide Checks */
    const linkSeen = new Map();
    if (origin && distMode !== 'off') {
      for (const page of pages) {
        if (/(^|\/)email\//.test(page.name)) continue; // Mail-Markup, s. Check 1
        for (const link of extractInternalLinks(page.html, origin)) {
          const p = link.slice(origin.length) || '/';
          if (!linkSeen.has(p)) linkSeen.set(p, page.name);
        }
      }
      let bad = 0;
      for (const [p, firstPage] of linkSeen) {
        const problem = judge(p);
        if (problem) {
          flag(`interner Link ${p} — ${problem} · zuerst in ${firstPage}`);
          bad++;
        }
      }
      if (bad === 0) ok(`${linkSeen.size} interne Links im dist: alle als Datei oder Rewrite auflösbar`);
    }

    // ── Asset-Referenzen: src/srcset/CSS-url() gegen das gebaute dist ──
    //
    // blitzsicht-ops#656: bis v0.110.0 sah die Extraktion nur `href=`. Zwei tote
    // Bildverweise liefen dadurch seit jeher live in einen 404, ohne dass je ein
    // PR rot wurde. Vormessung über die 13 Live-Seiten (= deployte frische Builds)
    // am 12.08.2026: 549 distinkte Referenzen, 549× HTTP 200, kein Redirect, kein
    // 404 — die Extraktion ist also nicht laut. Einziges per Rewrite (statt als
    // Datei) bediente Asset ist der Plausible-Proxy /js/script.js; `judge` deckt
    // das ab.
    if (assetMode !== 'off') {
      const assetSeen = new Map();
      let skippedRelative = 0;
      const collect = (refs, name) => {
        for (const u of refs) if (!assetSeen.has(u)) assetSeen.set(u, name);
      };
      for (const page of pages) {
        if (/(^|\/)email\//.test(page.name)) continue; // Mail-Markup, s. Check 1
        const r = extractAssetRefs(page.html, origin);
        collect(r.refs, page.name);
        skippedRelative += r.skippedRelative;
      }
      for (const sheet of distCss) {
        const r = extractAssetRefs(sheet.css, origin, { cssOnly: true });
        collect(r.refs, sheet.name);
        skippedRelative += r.skippedRelative;
      }

      let badAssets = 0;
      for (const [p, firstIn] of assetSeen) {
        // Schon als interner Link gemeldet (z. B. <link rel="preload" href="…">)
        // — derselbe Pfad soll nicht zweimal auftauchen.
        if (linkSeen.has(p)) continue;
        const problem = judge(p);
        if (problem) {
          assetFlag(`Asset-Referenz ${p} — ${problem} · zuerst in ${firstIn}`);
          badAssets++;
        }
      }
      if (badAssets === 0) {
        ok(`${assetSeen.size} Asset-Referenzen im dist (${distCss.length} CSS-Datei(en) mitgelesen): alle auflösbar`);
      }
      if (skippedRelative > 0) {
        // Dokument-relative Pfade bräuchten den Ort der Quelldatei. Ungeprüft —
        // aber sichtbar ungeprüft, statt still als „sauber" durchzugehen.
        console.log(`ℹ️  ${skippedRelative} dokument-relative Asset-Referenz(en) übersprungen (nicht geprüft).`);
      }
    }

    // Ads-URLs gehören zum Link-Check, nicht zu den Assets — `distLinkChecks:"off"`
    // muss sie weiterhin mit abschalten.
    for (const adsUrl of distMode === 'off' ? [] : cfg.adsFinalUrls ?? []) {
      if (origin && !adsUrl.startsWith(origin)) {
        warn(`Ads-Final-URL ${adsUrl} zeigt nicht auf ${origin} — im dist nicht prüfbar.`);
        continue;
      }
      const p = origin ? adsUrl.slice(origin.length) || '/' : new URL(adsUrl).pathname;
      const problem = judge(p);
      if (problem) flag(`Ads-Final-URL ${adsUrl} — ${problem}`);
      else ok(`Ads-Final-URL ${adsUrl} → im dist gebaut`);
    }
  }

  // ── Live-only Checks ──
  if (liveUrl) {
    const manual = (u, opts = {}) =>
      fetch(u, {
        redirect: 'manual',
        headers: { 'User-Agent': 'cw-core-touchpoint-audit/1.0' },
        ...opts,
      });

    // Check 2: interne Links direkt 200 (keine Redirect-Hops)
    const internal = new Set();
    for (const page of pages) {
      for (const l of extractInternalLinks(page.html, liveUrl)) internal.add(l);
    }
    let linkFails = 0;
    for (const link of internal) {
      try {
        const r = await manual(link);
        if (r.status !== 200) {
          fail(`interner Link ${link} → ${r.status}${r.headers.get('location') ? ` → ${r.headers.get('location')} (Redirect statt Direkttreffer)` : ''}`);
          linkFails++;
        }
      } catch (err) {
        fail(`interner Link ${link} unerreichbar: ${err.message}`);
        linkFails++;
      }
    }
    if (linkFails === 0) ok(`${internal.size} interne Links: alle direkt 200, null Redirect-Hops`);

    // Check 3: Ads-Final-URLs literal, direkt 200
    for (const adsUrl of cfg.adsFinalUrls ?? []) {
      try {
        const r = await manual(adsUrl);
        if (r.status === 200) ok(`Ads-Final-URL ${adsUrl} → 200 direkt`);
        else fail(`Ads-Final-URL ${adsUrl} → ${r.status} (Redirect-Hop kostet Geld + Google flaggt URL-Mismatch)`);
      } catch (err) {
        fail(`Ads-Final-URL ${adsUrl} unerreichbar: ${err.message}`);
      }
    }

    // Check 4: Plausible-Proxy-Kette
    try {
      const r = await manual(`${liveUrl}/js/script.js`);
      const body = r.status === 200 ? await r.text() : '';
      if (r.status === 200 && body.length > 100) ok('/js/script.js → 200 (Plausible-Script-Rewrite ok)');
      else fail(`/js/script.js → ${r.status} (vercel.json-Rewrite auf stats.* kaputt?)`);
    } catch (err) {
      fail(`/js/script.js unerreichbar: ${err.message}`);
    }
    try {
      const r = await fetch(`${liveUrl}/api/event`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'User-Agent': 'cw-core-touchpoint-audit/1.0' },
        body: JSON.stringify({ n: 'pageview', u: `${liveUrl}/touchpoint-audit-probe`, d: liveUrl.replace(/^https?:\/\//, '') }),
      });
      if (r.status === 202) ok('/api/event → 202 (Plausible-Event-Proxy ok)');
      else fail(`/api/event → ${r.status} (erwartet 202 — Event-Rewrite kaputt?)`);
    } catch (err) {
      fail(`/api/event unerreichbar: ${err.message}`);
    }

    // Check 5: /api/contact — nur wenn die Site überhaupt ein Formular hat.
    //
    // hausamlago fiel am 12.08.2026 mit „/api/contact Honeypot-Trip → 404" —
    // die Site ist bewusst Telefon-/WhatsApp-only, hat kein Formular und keine
    // API-Route. Eine Route, die es nicht geben soll, als „tot" zu melden, ist
    // ein Fehlalarm; er hätte die CI dieses Kunden dauerhaft rot gehalten.
    //
    // Erkannt am ausgelieferten HTML: irgendeine Seite muss auf /api/contact
    // posten. Das ist strenger als „gibt es ein <form>" (Suchfelder, Newsletter)
    // und kommt ohne Konfiguration aus.
    const hatKontaktFormular = pages.some((p) => postsToContactApi(p.html));
    if (!hatKontaktFormular) {
      console.log(
        `↷ /api/contact übersprungen — keine Seite postet dorthin (Site ohne Kontaktformular). ` +
          `Das ist kein Grün für die Formular-Kette, sondern deren Abwesenheit.`,
      );
    } else {
    // Rate-Limit-Budget beachten (max 2 POSTs)!
    const postContact = (body, extraHeaders = {}) =>
      fetch(`${liveUrl}/api/contact`, {
        method: 'POST',
        // Bewusst KEIN Origin-Header: der Origin-Check des contact-handlers ist
        // fail-open bei fehlendem Header — nur so erreicht die Probe die inneren
        // Layer (Rate-Limit → Honeypot), ohne von einer Browser-Origin abzuhängen.
        // Das ist Absicht, nicht ein Bug dieses Scripts.
        headers: { 'Content-Type': 'application/json', 'User-Agent': 'cw-core-touchpoint-audit/1.0', ...extraHeaders },
        body: JSON.stringify(body),
      });

    if (!skipEmptyPost) {
      try {
        const r = await postContact({});
        if (r.status === 404 || r.status >= 500) fail(`/api/contact POST {} → ${r.status} (tote Route bzw. Env/Code-Crash)`);
        else if (r.status === 429) warn('/api/contact POST {} → 429 RATE_LIMITED — Budget (3/10min) verbraucht, kein Defekt. In 10 min erneut, oder --skip-empty-post nutzen.');
        else ok(`/api/contact POST {} → ${r.status} (Route lebt, validiert)`);
      } catch (err) {
        fail(`/api/contact unerreichbar: ${err.message}`);
      }
    }

    // Honeypot-Trip: voller realistischer Payload + botcheck → Handler durchläuft
    // Methode/Rate-Limit/Body-Parse und wirft im Honeypot-Layer still 200 {ok:true}.
    // Beweist NICHT: Turnstile-Verify, Resend-Zustellung, CONTACT_EMAIL — dafür ist
    // der einmalige manuelle Launch-Gate-Submit da.
    try {
      const r = await postContact({
        name: 'Touchpoint Audit',
        email: 'audit@example.com',
        message: 'Automatischer Touchpoint-Audit — dieser Submit wird vom Honeypot verworfen.',
        botcheck: 'on',
        gclid: 'TEST_TOUCHPOINT_AUDIT',
      });
      if (r.status === 429) warn('/api/contact Honeypot-Trip → 429 RATE_LIMITED — Budget verbraucht, kein Defekt.');
      else if (r.status === 200) ok('/api/contact Honeypot-Trip → 200 (Kette bis Honeypot-Layer intakt, kein Lead erzeugt)');
      else fail(`/api/contact Honeypot-Trip → ${r.status} (erwartet 200 — Handler-Kette defekt?)`);
    } catch (err) {
      fail(`/api/contact Honeypot-Trip unerreichbar: ${err.message}`);
    }

    // Optional: Foreign-Origin → 403 (läuft VOR dem Rate-Limiter, kostet kein Budget)
    if (originProbe) {
      try {
        const r = await postContact({ name: 'x', email: 'x@example.com', message: 'origin probe' }, { Origin: 'https://evil.example' });
        if (r.status === 403) ok('/api/contact Foreign-Origin → 403 (Origin-Allowlist aktiv)');
        else fail(`/api/contact Foreign-Origin → ${r.status} (erwartet 403 — Allowlist prüfen!)`);
      } catch (err) {
        fail(`/api/contact Foreign-Origin-Probe unerreichbar: ${err.message}`);
      }
    }
    } // Ende: Site hat ein Kontaktformular
  }

  console.log('');
  if (failed > 0) {
    console.error(`❌ Touchpoint-Audit FAILED — ${failed} Problem(e)${warned ? `, ${warned} Warnung(en)` : ''}.`);
    return 1;
  }
  console.log(`✅ Touchpoint-Audit OK${warned ? ` (${warned} Warnung(en))` : ''} — ${pages.length} Seite(n) geprüft.`);
  return 0;
}

/**
 * Direkt-Aufruf erkennen — beide Seiten über realpath vergleichen.
 *
 * Naiver `import.meta.url === pathToFileURL(process.argv[1]).href` ist FALSCH,
 * sobald das Script über einen Symlink läuft: pnpm verlinkt
 * `node_modules/@cw/core` → `node_modules/.pnpm/…`, `import.meta.url` trägt den
 * aufgelösten Pfad, `process.argv[1]` den Symlink-Pfad. Der Vergleich schlug fehl,
 * `main()` lief nie, und der CI-Aufruf `node node_modules/@cw/core/scripts/…`
 * meldete still Exit 0 — ein Guard, der nie rot werden kann. Genau so beim Bau
 * dieses Scripts passiert; `scripts/verify-touchpoints.test.mjs` deckt es jetzt
 * mit einem Symlink-Aufruf ab.
 */
function isDirectRun() {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(entry);
  } catch {
    return false;
  }
}

if (isDirectRun()) {
  process.exit(await main());
}
