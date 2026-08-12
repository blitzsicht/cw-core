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
 *     "adsFinalUrls": ["https://kunde.de/leistungen/x/"]
 *   }
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
 * @param {string} html @param {string} origin z. B. https://kunde.de
 * @returns {string[]} absolute URLs, dedupliziert
 */
export function extractInternalLinks(html, origin) {
  const out = new Set();
  for (const m of html.matchAll(/href=["']([^"'#]+)["']/gi)) {
    const href = m[1];
    if (/^(mailto:|tel:|javascript:|data:)/i.test(href)) continue;
    if (/^https?:\/\//i.test(href)) {
      if (href.startsWith(origin)) out.add(href.split('#')[0]);
      continue;
    }
    if (href.startsWith('/')) out.add(origin + href.split('#')[0]);
  }
  return [...out];
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
  /** @type {{ extraPhones?: string[], extraEmails?: string[], allowExternalMailto?: string[], adsFinalUrls?: string[] }} */
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

  if (distDir) {
    const absDist = distDir.startsWith('/') ? distDir : join(root, distDir);
    if (!existsSync(absDist)) {
      console.error(`FATAL: dist-Verzeichnis ${absDist} existiert nicht — erst bauen.`);
      return 2;
    }
    const walk = (dir) =>
      readdirSync(dir).flatMap((e) => {
        const p = join(dir, e);
        return statSync(p).isDirectory() ? walk(p) : extname(p) === '.html' ? [p] : [];
      });
    for (const f of walk(absDist)) {
      pages.push({ name: relative(absDist, f), html: readFileSync(f, 'utf-8') });
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

    // Check 5: /api/contact — Rate-Limit-Budget beachten (max 2 POSTs)!
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
