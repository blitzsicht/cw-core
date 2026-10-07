#!/usr/bin/env node
/**
 * cw-core: Vorschaubild-Prüfung — jedes og:image und twitter:image im gebauten dist/.
 *
 * Anlass (07.10.2026): auf gowohnen.com zeigte `og:image` auf `/logo.svg` (SVG,
 * 206 Byte). Kein Messenger zeigt SVG, also gab es beim Teilen keine Link-Vorschau
 * — und nichts hat es gemeldet:
 *   - BaseLayout schreibt `og:image:width/height` immer als 1200×630, egal welches
 *     Bild dahinter liegt. Die Angabe log.
 *   - quality-checks las nur PNG und JPEG, übersprang alles andere still und war in
 *     keinem Kundenrepo eingebunden.
 * Dieselbe Flottenmessung fand drei Repos mit falschen Maßen (falzmarke 1280×640,
 * platzfrei 1600×840, soleno 1200×675). Keiner dieser Fehler sieht man der Seite an;
 * man sieht ihn erst, wenn jemand den Link teilt.
 *
 * Rot (Exit 1), wenn für ein og:image oder twitter:image gilt:
 *   - die Datei fehlt im dist/
 *   - sie ist kein Rasterbild (SVG, HTML-Fehlerseite …) — siehe RASTER_FORMATE
 *   - ihre Maße weichen von `og:image:width/height` der Seite ab (fehlt die Angabe:
 *     1200×630, der cw-core-Standard). Für ein twitter:image mit EIGENER Datei gibt
 *     es keine Maßangabe; dort entfallen nur die Maße, der Rest gilt.
 *   - sie ist größer als 300 KB (WhatsApp lädt größere Vorschaubilder oft nicht)
 * Rot auch, wenn keine einzige Seite geprüft wurde. Ein leeres oder falsch
 * angegebenes dist/ meldete sonst „alles in Ordnung" — ein Check, der über nichts
 * grün wird, sieht aus wie einer, der bestanden hat.
 *
 * Warnung (kein Rot):
 *   - Bild auf einem fremden Host (CDN, Partner): liegt nicht im dist/, ist von hier
 *     aus nicht prüfbar. Absolute URLs der EIGENEN Site werden auf den Pfad im dist/
 *     abgebildet; als eigen gilt jeder Host aus `<link rel="canonical">` oder `og:url`
 *     irgendeiner Seite (mit und ohne `www.`), dazu `--site`.
 *   - HTML-Datei ohne og:image (Google-Verifikationsdatei, Astro-Weiterleitung). Die
 *     zählt nicht als geprüft; fehlt es auf ALLEN Seiten, greift die 0-Seiten-Regel.
 *
 * Aufruf:
 *   node node_modules/@cw/core/scripts/og-audit.mjs dist
 *   node node_modules/@cw/core/scripts/og-audit.mjs dist --site https://kunde.de
 *
 * Liegt unter dist/ kein HTML, aber ein client/ (Vercel-Adapter), wird dist/client
 * genommen — dieselbe Regel wie in verify-touchpoints.mjs.
 *
 * Exit-Codes: 0 ok · 1 mindestens ein Befund oder 0 geprüfte Seiten · 2 Aufruffehler
 *
 * Kein sharp, keine Abhängigkeit außer Node: im Site-Checks-Workflow ist von cw-core
 * nur `checks/` installiert, nicht das Paket selbst.
 */

import { existsSync, readdirSync, readFileSync, statSync, realpathSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { bildMasse } from '../src/utils/bild-masse.js';
import { pickDistRoot, normalizeUrlPath } from './verify-touchpoints.mjs';

/** Obergrenze je Vorschaubild, wie in quality-checks (`maxOgBytes`). */
export const MAX_BYTES = 300 * 1024;

/** cw-core-Standard, wenn die Seite keine Maße angibt (BaseLayout schreibt 1200×630). */
export const STANDARD_MASSE = Object.freeze({ width: 1200, height: 630 });

// ─── Reine Helfer (exportiert für node --test) ─────────────────────────────

/** Die paar Entities, die Astro in Attributwerten tatsächlich schreibt. */
function entitiesDekodieren(s) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;|&#x0*27;/gi, "'")
    .replace(/&#0*47;|&#x0*2f;/gi, '/');
}

/** Attribute eines Tags als Map (Schlüssel klein). */
function attribute(tag) {
  /** @type {Record<string, string>} */
  const out = {};
  for (const m of tag.matchAll(/([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g)) {
    const name = m[1].toLowerCase();
    if (!(name in out)) out[name] = entitiesDekodieren(m[2] ?? m[3] ?? m[4] ?? '');
  }
  return out;
}

/**
 * Vorschau-relevante Meta-Angaben einer Seite. Je Schlüssel gilt das ERSTE
 * Vorkommen — Messenger nehmen bei mehreren og:image das erste.
 *
 * `property=` und `name=` zählen beide: Twitter definiert `name="twitter:image"`,
 * viele Seiten schreiben `property=`. Attributreihenfolge ist egal.
 *
 * @param {string} html
 * @returns {{ ogImage: string|null, ogWidth: string|null, ogHeight: string|null,
 *             twitterImage: string|null, canonical: string|null, ogUrl: string|null }}
 */
export function extractOgMeta(html) {
  /** @type {Record<string, string>} */
  const meta = {};
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
    const a = attribute(m[0]);
    const key = (a.property ?? a.name ?? '').toLowerCase();
    if (key && a.content !== undefined && !(key in meta)) meta[key] = a.content.trim();
  }
  let canonical = null;
  for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
    const a = attribute(m[0]);
    if ((a.rel ?? '').toLowerCase().split(/\s+/).includes('canonical') && a.href) {
      canonical = a.href.trim();
      break;
    }
  }
  return {
    ogImage: meta['og:image'] || meta['og:image:url'] || null,
    ogWidth: meta['og:image:width'] ?? null,
    ogHeight: meta['og:image:height'] ?? null,
    twitterImage: meta['twitter:image'] || meta['twitter:image:src'] || null,
    canonical,
    ogUrl: meta['og:url'] || null,
  };
}

/**
 * dist-relativer HTML-Pfad → URL-Pfad der Seite.
 * @param {string} rel z. B. `w/abc/index.html` @returns {string} z. B. `/w/abc/`
 */
export function htmlPfadZuUrl(rel) {
  const p = rel.split(sep).join('/');
  if (p === 'index.html') return '/';
  if (p.endsWith('/index.html')) return `/${p.slice(0, -'index.html'.length)}`;
  return `/${p.replace(/\.html$/, '')}`;
}

/** Host ohne führendes `www.`, klein — `www.kunde.de` und `kunde.de` sind dieselbe Site. */
export function hostKern(host) {
  return String(host).toLowerCase().replace(/^www\./, '');
}

/** Platzhalter-Host für relative Auflösung; kann in keiner echten URL vorkommen. */
const LOKAL = 'dist.invalid';

/**
 * Einen Bildverweis gegen die Seite auflösen.
 *
 * @param {string} raw         Wert aus `content=`
 * @param {string} seitenPfad  URL-Pfad der Seite (für relative Verweise)
 * @param {Set<string>} eigeneHosts  Hosts der eigenen Site, über `hostKern` normiert
 * @returns {{ art: 'lokal', pfad: string } | { art: 'fremd', host: string } | { art: 'ungueltig' }}
 */
export function bildRefAufloesen(raw, seitenPfad, eigeneHosts) {
  let url;
  try {
    url = new URL(raw, `https://${LOKAL}${seitenPfad}`);
  } catch {
    return { art: 'ungueltig' };
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return { art: 'ungueltig' };
  const host = url.hostname.toLowerCase();
  if (host !== LOKAL && !eigeneHosts.has(hostKern(host))) return { art: 'fremd', host };
  return { art: 'lokal', pfad: normalizeUrlPath(url.pathname) };
}

/**
 * Ein Bild prüfen.
 * @param {Buffer} buf
 * @param {{ width: number, height: number } | null} soll  null → Maße nicht prüfen
 * @param {number} [maxBytes]
 * @returns {string[]} Befunde, leer = in Ordnung
 */
export function bildPruefen(buf, soll, maxBytes = MAX_BYTES) {
  const befunde = [];
  const m = bildMasse(buf);
  if (!m.raster) {
    befunde.push(`kein Rasterbild (${m.format.toUpperCase()}) — Messenger zeigen keine Vorschau`);
  } else if (soll) {
    if (m.width === null || m.height === null) {
      befunde.push(`${m.format.toUpperCase()}, Maße nicht lesbar (Datei abgeschnitten?)`);
    } else if (m.width !== soll.width || m.height !== soll.height) {
      befunde.push(`ist ${m.width}×${m.height}, die Seite gibt ${soll.width}×${soll.height} an`);
    }
  }
  if (buf.length > maxBytes) {
    befunde.push(`${Math.round(buf.length / 1024)} KB (> ${Math.round(maxBytes / 1024)} KB)`);
  }
  return befunde;
}

/** Alle HTML-Dateien unter `dir`, dist-relativ, sortiert. */
function htmlDateien(dir, basis = dir, out = []) {
  for (const name of readdirSync(dir)) {
    const voll = join(dir, name);
    const st = statSync(voll);
    if (st.isDirectory()) htmlDateien(voll, basis, out);
    else if (name.toLowerCase().endsWith('.html')) out.push(relative(basis, voll));
  }
  return out.sort();
}

/**
 * Soll-Maße aus der Seite. Fehlt die Angabe ganz: Standard. Ist sie da, aber
 * keine ganze Zahl, ist das selbst ein Befund — Messenger verwerfen sie.
 * @returns {{ soll: {width:number,height:number}, befund: string|null }}
 */
function sollMasse(meta) {
  if (meta.ogWidth === null && meta.ogHeight === null) return { soll: STANDARD_MASSE, befund: null };
  const w = Number(meta.ogWidth);
  const h = Number(meta.ogHeight);
  if (!Number.isInteger(w) || !Number.isInteger(h) || w <= 0 || h <= 0) {
    return {
      soll: STANDARD_MASSE,
      befund: `og:image:width/height unbrauchbar („${meta.ogWidth ?? '–'}" × „${meta.ogHeight ?? '–'}")`,
    };
  }
  return { soll: { width: w, height: h }, befund: null };
}

/**
 * @typedef {{ seite: string, feld: string, bild: string, text: string }} Befund
 * @typedef {{ seite: string, text: string }} Warnung
 */

/**
 * Prüft ein Web-Root.
 *
 * @param {string} root  Verzeichnis mit dem ausgelieferten HTML
 * @param {{ site?: string[] }} [opts]  zusätzliche eigene Origins/Hosts
 * @returns {{ htmlDateien: number, geprueft: number, bilder: number, probleme: Befund[], warnungen: Warnung[] }}
 */
export function auditDist(root, opts = {}) {
  const dateien = htmlDateien(root);
  const seiten = dateien.map((rel) => ({
    rel,
    pfad: htmlPfadZuUrl(rel),
    meta: extractOgMeta(readFileSync(join(root, rel), 'utf-8')),
  }));

  // Eigene Hosts aus ALLEN Seiten, nicht nur der jeweiligen: eine Seite ohne
  // canonical (z. B. eine Wohnungsseite mit noindex) gehört trotzdem zur Site.
  const eigeneHosts = new Set();
  for (const s of seiten) {
    for (const u of [s.meta.canonical, s.meta.ogUrl]) {
      try {
        if (u) eigeneHosts.add(hostKern(new URL(u).hostname));
      } catch {
        /* kein absoluter URL — trägt keinen Host bei */
      }
    }
  }
  for (const s of opts.site ?? []) {
    try {
      eigeneHosts.add(hostKern(new URL(s.includes('://') ? s : `https://${s}`).hostname));
    } catch {
      /* unbrauchbar — main() meldet Aufruffehler vorher */
    }
  }

  /** @type {Befund[]} */
  const probleme = [];
  /** @type {Warnung[]} */
  const warnungen = [];
  /** Datei → Befunde je Soll, damit 40 Seiten mit demselben Bild es nur einmal lesen. */
  const cache = new Map();
  const gepruefteBilder = new Set();
  let geprueft = 0;

  for (const s of seiten) {
    const { ogImage, twitterImage } = s.meta;
    if (!ogImage && !twitterImage) {
      warnungen.push({ seite: s.pfad, text: 'kein og:image — Seite nicht geprüft' });
      continue;
    }
    const { soll, befund: sollBefund } = sollMasse(s.meta);
    let seiteGeprueft = false;

    /** @param {'og:image'|'twitter:image'} feld @param {string} raw @param {{width:number,height:number}|null} sollFuer */
    const pruefe = (feld, raw, sollFuer) => {
      const ref = bildRefAufloesen(raw, s.pfad, eigeneHosts);
      if (ref.art === 'ungueltig') {
        probleme.push({ seite: s.pfad, feld, bild: raw, text: 'kein gültiger http(s)-Verweis' });
        seiteGeprueft = true;
        return;
      }
      if (ref.art === 'fremd') {
        warnungen.push({ seite: s.pfad, text: `${feld} auf fremdem Host ${ref.host} — nicht prüfbar: ${raw}` });
        return;
      }
      seiteGeprueft = true;
      const datei = join(root, ref.pfad.replace(/^\/+/, ''));
      if (!existsSync(datei) || !statSync(datei).isFile()) {
        probleme.push({ seite: s.pfad, feld, bild: ref.pfad, text: 'fehlt im dist/' });
        return;
      }
      gepruefteBilder.add(ref.pfad);
      const schluessel = `${ref.pfad}|${sollFuer ? `${sollFuer.width}x${sollFuer.height}` : '-'}`;
      if (!cache.has(schluessel)) cache.set(schluessel, bildPruefen(readFileSync(datei), sollFuer));
      for (const text of cache.get(schluessel)) probleme.push({ seite: s.pfad, feld, bild: ref.pfad, text });
    };

    if (ogImage) {
      if (sollBefund) probleme.push({ seite: s.pfad, feld: 'og:image', bild: ogImage, text: sollBefund });
      pruefe('og:image', ogImage, soll);
    } else {
      // twitter:image ohne og:image: Facebook, WhatsApp und LinkedIn lesen nur og:.
      probleme.push({ seite: s.pfad, feld: 'og:image', bild: '–', text: 'fehlt (nur twitter:image gesetzt)' });
      seiteGeprueft = true;
    }
    // Dieselbe URL wie og:image ist schon geprüft; nur eine eigene Datei nochmals.
    if (twitterImage && twitterImage !== ogImage) pruefe('twitter:image', twitterImage, null);

    if (seiteGeprueft) geprueft++;
  }

  return { htmlDateien: dateien.length, geprueft, bilder: gepruefteBilder.size, probleme, warnungen };
}

// ─── CLI ────────────────────────────────────────────────────────────────────

/** Gleiche Befunde (Bild + Text) zusammenfassen, Seiten aufzählen — sonst 40 Zeilen je Fehler. */
function gruppieren(probleme) {
  const gruppen = new Map();
  for (const p of probleme) {
    const k = `${p.feld} ${p.bild}: ${p.text}`;
    if (!gruppen.has(k)) gruppen.set(k, []);
    gruppen.get(k).push(p.seite);
  }
  return gruppen;
}

function main() {
  const args = process.argv.slice(2);
  const sites = [];
  const positionell = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--site') {
      if (!args[i + 1]) {
        console.error('FATAL: --site braucht einen Wert, z. B. --site https://kunde.de');
        return 2;
      }
      sites.push(args[++i]);
    } else if (args[i] === '--dist') {
      if (args[i + 1]) positionell.push(args[++i]);
    } else {
      positionell.push(args[i]);
    }
  }
  const distDir = positionell[0];
  if (!distDir) {
    console.error('FATAL: Verzeichnis des gebauten Web-Roots angeben.');
    console.error('  node node_modules/@cw/core/scripts/og-audit.mjs dist [--site https://kunde.de]');
    return 2;
  }
  if (!existsSync(distDir) || !statSync(distDir).isDirectory()) {
    console.error(`FATAL: ${distDir} ist kein Verzeichnis — erst bauen (pnpm build).`);
    return 2;
  }

  const root = pickDistRoot(distDir, readdirSync(distDir));
  console.log(`Vorschaubild-Prüfung: ${root}`);
  const r = auditDist(root, { site: sites });

  const fremd = r.warnungen.filter((w) => !w.text.startsWith('kein og:image'));
  const ohne = r.warnungen.length - fremd.length;
  for (const w of fremd) console.log(`⚠ ${w.seite} — ${w.text}`);
  if (ohne > 0) console.log(`ℹ ${ohne} HTML-Datei(en) ohne og:image (z. B. Weiterleitungen) — nicht mitgezählt.`);

  for (const [k, seiten] of gruppieren(r.probleme)) {
    const liste = seiten.slice(0, 5).join(', ') + (seiten.length > 5 ? ` … (+${seiten.length - 5})` : '');
    console.log(`✗ ${k} — ${seiten.length} Seite(n): ${liste}`);
  }

  const zahl = `${r.geprueft} Seite(n) geprüft, ${r.bilder} Bild(er), ${r.htmlDateien} HTML-Datei(en)`;
  console.log('');
  if (r.geprueft === 0) {
    console.error(`❌ Vorschaubild-Prüfung FAILED — 0 Seite(n) geprüft (${r.htmlDateien} HTML-Datei(en)). Falsches Verzeichnis, leerer Build oder kein og:image auf der Site.`);
    return 1;
  }
  if (r.probleme.length > 0) {
    const betroffen = new Set(r.probleme.map((p) => p.seite)).size;
    console.error(`❌ Vorschaubild-Prüfung FAILED — ${r.probleme.length} Befund(e) auf ${betroffen} Seite(n); ${zahl}.`);
    return 1;
  }
  console.log(`✅ Vorschaubild-Prüfung OK${fremd.length ? ` (${fremd.length} Warnung(en))` : ''} — ${zahl}.`);
  return 0;
}

/**
 * Direkt-Aufruf über realpath erkennen, nicht über den argv-String: pnpm verlinkt
 * `node_modules/@cw/core` → `node_modules/.pnpm/…`. Der naive Vergleich schlug in
 * verify-touchpoints.mjs genau dort fehl, main() lief nie, und der Check meldete
 * still Exit 0. Der Symlink-Test in og-audit.test.mjs hält das fest.
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
  process.exit(main());
}
