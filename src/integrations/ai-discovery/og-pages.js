/**
 * og-pages — ein eigenes og:image pro Seite, erzeugt nach dem Build.
 *
 * ANLASS (2026-08-27): Auf blitzsicht.com trugen alle Unterseiten dasselbe
 * Vorschaubild (`/og/default.png`) — /forschung, /software, /referenzen, /pakete,
 * /kontakt, /ueber-uns. Nur die Startseite hatte ein eigenes.
 *
 * Die Ursache lag tiefer: `satori` war eine OPTIONALE peerDependency, und kein
 * einziger Kunde hatte sie installiert. `render-og-home.mjs` scheiterte deshalb bei
 * jedem Build mit „'satori' fehlt", fiel fail-open zurück und liess die committete
 * home.png stehen — datiert auf den 09.07.2026, also sieben Wochen alt. Das
 * OG-System hat flottenweit NIE gerendert. Sichtbar war das nur als Warnzeile im
 * Build-Log, die niemand liest. Deshalb ist satori jetzt eine echte dependency von
 * cw-core, und deshalb gibt es unten den Report statt nur eines stillen Rückfalls.
 *
 * WARUM NACH DEM BUILD UND NICHT ALS PROP
 * Aus dem fertigen HTML stehen Titel, Beschreibung und Hero-Foto zuverlässig zur
 * Verfügung — unabhängig davon, über welches Layout oder welchen Block eine Seite
 * gebaut wurde. Ein Prop durch alle Layouts zu reichen hätte jede Seite einzeln
 * erfasst und wäre bei der nächsten neuen Seite wieder vergessen worden.
 *
 * MOTIVWAHL
 *   Seite hat ein Hero-Foto  → `hero`-Template mit genau diesem Foto
 *   sonst                    → `cta`-Template mit dem Seitentitel
 *
 * KOSTEN (gemessen 27.08.2026, Apple Silicon)
 *   hero mit Foto  853 ms (erster Lauf inkl. Fonts), cta warm 81 ms
 *   49 Seiten ≈ 4 s Build-Aufschlag.
 */

import { readFile, writeFile, mkdir, readdir, stat } from 'node:fs/promises';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { createRequire } from 'node:module';
// Statisch, nicht dynamisch: im astro:build:done ist Vites Module-Runner bereits
// geschlossen, jeder dynamische Import scheitert dort mit „Vite module runner has
// been closed" — auch über eine file://-URL (beides gemessen 27.08.2026).
// Gefahrlos, weil engine.mjs satori seinerseits erst beim Rendern nachlädt: das
// blosse Importieren dieser API kostet nichts und kann nicht fehlschlagen.
import * as og from '../../og/index.mjs';
import { BRAND } from '../../og/brand.mjs';
import { leseToken, alsHex } from './button-contrast-check.js';
import { labelFarbeFuerBild } from '../../utils/labelfarbe.js';
import { altMitOffenlegung, ohneOffenlegung } from '../../utils/og-alt.js';

/** Alle index.html unterhalb von `dir`. */
async function seitenDateien(dir, out = []) {
  for (const e of await readdir(dir)) {
    const p = join(dir, e);
    if ((await stat(p)).isDirectory()) await seitenDateien(p, out);
    else if (e === 'index.html') out.push(p);
  }
  return out;
}

const entities = (s) =>
  s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
   .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ');

/**
 * Attributwert wieder HTML-sicher machen.
 *
 * `leseSeite` dekodiert die Entities, damit mit Klartext gerechnet werden kann. Was
 * zurück ins Dokument geht, muss neu kodiert werden — eine Beschreibung mit `&` oder
 * einem Anführungszeichen zerlegte sonst das Attribut, und der Fehler fiele erst am
 * kaputten Vorschaubild eines Crawlers auf.
 */
const escapeAttr = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * `og:image:alt` und `twitter:image:alt` auf `alt` setzen.
 *
 * Ersetzen, wo der Tag steht; sonst hinter dem zugehörigen Bild-Tag einfügen. Das
 * Einfügen ist kein Sonderfall für alte Bestände: Kunden mit eigenem Layout (statt
 * `@cw/core/layouts/BaseLayout.astro`) bringen die Zeile nicht mit, und ohne sie hätte
 * das neu gerenderte Bild keine textliche Entsprechung.
 *
 * Ersetzt wird über eine **Funktion**, nicht über `$1…$2`: Ein `$&` oder `$'` im
 * Alt-Text würde in einem String-Ersatz als Rückverweis gelesen und den Text
 * verstümmeln — bei Beschreibungen mit Preisangaben keine graue Theorie.
 */
export function setzeAltTags(html, alt) {
  const wert = escapeAttr(alt);
  const paare = [
    {
      vorhanden: /(<meta\s+property="og:image:alt"\s+content=")[^"]*(")/,
      anker: /(<meta\s+property="og:image"\s+content="[^"]*"\s*\/?>)/,
      neu: `<meta property="og:image:alt" content="${wert}">`,
    },
    {
      vorhanden: /(<meta\s+name="twitter:image:alt"\s+content=")[^"]*(")/,
      anker: /(<meta\s+name="twitter:image"\s+content="[^"]*"\s*\/?>)/,
      neu: `<meta name="twitter:image:alt" content="${wert}">`,
    },
  ];

  let out = html;
  for (const p of paare) {
    if (p.vorhanden.test(out)) {
      out = out.replace(p.vorhanden, (_m, vor, nach) => vor + wert + nach);
    } else if (p.anker.test(out)) {
      // Kein twitter:image im Dokument → auch kein twitter:image:alt. Ein Alt-Tag ohne
      // sein Bild ist keine Ergänzung, sondern eine Angabe über nichts.
      out = out.replace(p.anker, (_m, tag) => tag + p.neu);
    }
  }
  return out;
}

/**
 * Öffnendes Tag eines Hero-Bereichs — `class="hero…"` oder `class="page-hero…"`.
 *
 * Die Wortgrenze ist der Kern: `class="hero-content"` und `class="hero-badge"` liegen
 * INNERHALB des Heros und dürfen nicht als dessen Anfang gelten. Deshalb muss nach
 * `hero` das Attribut enden oder ein Leerzeichen folgen — `hero-` scheidet damit aus.
 */
const HERO_TAG = /<[a-z]+[^>]*\bclass="(?:page-)?hero(?:\s[^"]*)?"[^>]*>/i;

/** Bilder, die im Hero stehen, aber nicht sein Motiv sind. */
const KEIN_MOTIV = /\bclass="[^"]*\b(?:ai-label|logo|icon)\b/i;

/**
 * Das Hero-Foto einer gebauten Seite finden.
 *
 * ANLASS (01.09.2026): Bis v0.147.0 suchte diese Stelle ausschliesslich nach
 * `class="page-hero"` mit einem INLINE-`style`, der ein `url()` enthält. Gemessen über
 * die Flotte fand sie damit **27 Hero-Fotos, von denen kein einziges
 * kennzeichnungspflichtig war** — und auf zwei frisch gebauten Kundenseiten (zink,
 * steller, zusammen 98 Seiten) fand sie **gar keines**. Jede Seite bekam deshalb das
 * `cta`-Template mit blosser Typografie, und die KI-Kennzeichnung aus v0.147.0 hatte
 * flottenweit keine Fundstelle. Sie war gebaut, aber unerreichbar.
 *
 * Drei Bauformen kamen nicht an:
 *   1. `class="page-hero "` / `class="page-hero has-image"` — Astro hängt beim Rendern
 *      ein Leerzeichen an, Kunden setzen Zusatzklassen. Das exakte `"page-hero"` traf
 *      keine davon.
 *   2. Das Motiv als `<img>` statt als Hintergrund (Kunden-Markup, z. B. steller
 *      `leistungen/[slug].astro` mit `<div class="hero-bg"><img class="hero-bg-img">`).
 *   3. `Hero.astro` — die **Startseite** jeder Site. Sie rendert `class="hero"`, nie
 *      `page-hero`. Ausgerechnet das prominenteste und am weitesten weitergereichte
 *      Bild der Site war damit strukturell ausgeschlossen; zugleich ist `stem: 'hero'`
 *      bei mehreren Kunden ausdrücklich als kennzeichnungspflichtig deklariert.
 *
 * Reihenfolge: erst der Hintergrund am Container (dort steht das Motiv, wenn es eins
 * gibt), sonst das erste echte `<img>` im Block. „Echt" heisst: kein SVG (Logos,
 * Piktogramme — und satori rendert sie im Foto-Slot ohnehin nicht sinnvoll), kein
 * `data:`-URI, und nicht das AiLabel-Symbol selbst. Letzteres steht bei gekennzeichneten
 * Bildern unmittelbar neben dem Motiv; ohne diesen Ausschluss würde das Badge als Foto
 * gelesen und das OG-Bild zeigte ein formatfüllendes EU-Symbol.
 *
 * @param {string} html
 * @returns {string|null} Bildpfad wie im Dokument, oder null
 */
export function heroFoto(html) {
  const treffer = html.match(HERO_TAG);
  if (!treffer) return null;

  // Hintergrund am Container selbst.
  const style = (treffer[0].match(/\bstyle="([^"]*)"/) || [])[1];
  if (style) {
    const url = (entities(style).match(/url\(['"]?([^'")]+)['"]?\)/) || [])[1];
    if (url) return url;
  }

  // Sonst das erste echte <img> im Block. Der Block endet am nächsten </section>;
  // fehlt es, wird abgeschnitten statt den Rest des Dokuments mitzulesen — sonst
  // fände die Suche irgendein Bild weiter unten auf der Seite und gäbe es als
  // Hero-Motiv aus.
  const ab = html.slice(treffer.index ?? 0);
  const ende = ab.indexOf('</section>');
  const block = ende === -1 ? ab.slice(0, 20000) : ab.slice(0, ende);

  for (const m of block.matchAll(/<img\b[^>]*>/gi)) {
    const tag = m[0];
    if (KEIN_MOTIV.test(tag)) continue;
    const src = (tag.match(/\bsrc="([^"]*)"/) || [])[1];
    if (!src) continue;
    const rein = entities(src);
    if (rein.startsWith('data:') || /\.svg(\?|#|$)/i.test(rein)) continue;
    return rein;
  }
  return null;
}

/**
 * Titel, Beschreibung, bisheriges og:image und Hero-Foto einer gebauten Seite.
 * Der Titel wird am ersten „|" oder „–" gekappt: der Site-Name dahinter steht im
 * OG-Bild ohnehin als Logo und würde den Claim nur verkürzen.
 */
export function leseSeite(html) {
  const t = (html.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || '';
  const titel = entities(t).split(/\s+[|–—]\s+/)[0].trim();
  const desc = entities((html.match(/<meta\s+name="description"\s+content="([^"]*)"/) || [])[1] || '').trim();
  const ogImage = (html.match(/<meta\s+property="og:image"\s+content="([^"]*)"/) || [])[1] || '';
  // og:url ist der Canonical der Seite und die einzige verlässliche Quelle für
  // die absolute Basis — siehe Begründung an der Stelle, die sie verwendet.
  const ogUrl = (html.match(/<meta\s+property="og:url"\s+content="([^"]*)"/) || [])[1] || '';
  // Hero-Foto: Hintergrund oder <img> des Hero-Bereichs — siehe heroFoto().
  const foto = heroFoto(html);
  // Bisheriger Alt-Text. Er beschreibt noch das Bild VOR diesem Lauf und wird deshalb nur
  // als Basis weiterverwendet — die Offenlegung darin gehört zum alten Bild und wird
  // abgestreift, bevor die des neuen drankommt.
  const ogAlt = entities((html.match(/<meta\s+property="og:image:alt"\s+content="([^"]*)"/) || [])[1] || '').trim();
  return { titel, desc, ogImage, ogUrl, foto, ogAlt };
}

const MIME = { webp: 'image/webp', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', avif: 'image/avif' };

// satori dekodiert WEDER WebP NOCH AVIF. Ein solches Foto rendert lautlos als
// nichts — man sieht nur den Verlauf des Templates und hält es für ein zu helles
// Motiv. Gemessen am 27.08.2026 mit demselben Bild: als WebP übergeben ergab das
// OG 8 KB (leer), nach Umwandlung in JPEG 241 KB (Foto drin). Die Fleet liefert
// ihre Hero-Bilder durchgängig als WebP aus — ohne diese Umwandlung wäre die
// gesamte Automatik ein Verlaufsgenerator gewesen.
const BRAUCHT_UMWANDLUNG = new Set(['webp', 'avif']);
const laden = createRequire(import.meta.url);

async function alsJpeg(buffer) {
  const sharp = (() => { const m = laden('sharp'); return m?.default ?? m; })();
  return sharp(buffer).jpeg({ quality: 86 }).toBuffer();
}

/**
 * Beschreibung auf Länge bringen, ohne mitten im Wort zu enden.
 * Hart auf N Zeichen zu schneiden ergab Sublines wie „… Forschungszulage als" —
 * ein angefangener Satz wirkt im Vorschaubild wie ein Fehler.
 */
// Wörter, die einen Satz eröffnen statt ihn zu schliessen. Endet die gekappte
// Zeile auf einem davon, wirkt sie abgerissen — der belegte Fall aus dem ersten
// Lauf war „… Bescheinigungsstelle Forschungszulage als". Ein Wort weiter zurück
// liest sich als bewusste Verkürzung.
const OFFENE_WOERTER = new Set([
  'und', 'oder', 'aber', 'als', 'wie', 'wenn', 'dass', 'weil', 'damit', 'ob',
  'der', 'die', 'das', 'den', 'dem', 'des', 'ein', 'eine', 'einen', 'einem', 'einer',
  'von', 'vom', 'mit', 'bei', 'im', 'in', 'an', 'am', 'auf', 'aus', 'zu', 'zum',
  'zur', 'für', 'über', 'unter', 'nach', 'vor', 'seit', 'durch', 'ohne', 'gegen',
  'ist', 'sind', 'war', 'wird', 'werden', 'hat', 'haben',
]);

export function kappe(text, max = 96) {
  const t = text.trim();
  if (t.length <= max) return t;
  const schnitt = t.slice(0, max);
  const luecke = schnitt.lastIndexOf(' ');
  // Nur an der Wortgrenze kappen, wenn dabei nicht mehr als ein Drittel verloren
  // geht — sonst (sehr lange Wörter) doch hart schneiden.
  let basis = luecke > max * 0.66 ? schnitt.slice(0, luecke) : schnitt;
  // Angefangene Konstruktionen am Ende zurücknehmen, aber höchstens zweimal —
  // sonst frisst eine Kette kurzer Wörter die halbe Zeile.
  for (let i = 0; i < 2; i++) {
    const w = basis.split(/\s+/).pop() ?? '';
    if (!OFFENE_WOERTER.has(w.toLowerCase().replace(/[^\p{L}]/gu, ''))) break;
    basis = basis.slice(0, basis.length - w.length).trimEnd();
  }
  return basis.replace(/[\s,;:.\u2013\u2014-]+$/, '') + '…';
}

/**
 * Markenfarben aus `src/styles/*.css` der Kundenseite lesen — dieselben Tokens
 * (`--color-primary`, `--color-accent`), die die Flotte laut Konvention überall
 * setzt und die `pruefeButtonKontrast` schon für den Knopf-Kontrast-Guard liest.
 *
 * ANLASS (cw-core#100, 28.08.2026): `og.hero()`/`og.cta()` fielen hier ohne
 * `brand`-Parameter auf die Blitzsicht-Hausfarben zurück — Falzmarke bekam dadurch
 * ein blau-oranges statt sein eigenes Vorschaubild, sichtbar auf LinkedIn.
 *
 * Bewusst ein EIGENER, kleiner Scan statt den `cssDateien`-Lauf des
 * Knopf-Kontrast-Guards (index.ts) mitzubenutzen: der Guard hat eine eigene,
 * bereits mehrfach nachgebesserte Drei-Zustände-Logik (siehe dessen Kopf), und
 * diese Funktion soll sie nicht mit anfassen müssen. Kosten: ein paar KB CSS
 * zusätzlich gelesen — auf der Zeitachse eines Satori-Renders nicht messbar.
 *
 * @param {string} projektWurzel  i. d. R. `process.cwd()`
 * @returns {{primary?: string, accent?: string}|null}
 *   `null`, wenn keiner der beiden Tokens rechenbar war — dann bleibt der
 *   Aufrufer beim Default-`BRAND` der Templates.
 */
export function markenfarbenLesen(projektWurzel) {
  const stilOrdner = join(projektWurzel, 'src', 'styles');
  if (!existsSync(stilOrdner)) return null;

  const cssDateien = [];
  const suche = (dir) => {
    let eintraege;
    try { eintraege = readdirSync(dir); } catch { return; }
    for (const name of eintraege) {
      const p = join(dir, name);
      let info;
      try { info = statSync(p); } catch { continue; }
      if (info.isDirectory()) suche(p);
      else if (name.endsWith('.css')) cssDateien.push(p);
    }
  };
  suche(stilOrdner);
  // `readdirSync` sortiert nicht garantiert (dateisystemabhängig) — sortiert, damit
  // „die letzte Definition gewinnt" reproduzierbar dieselbe Datei meint, nicht je
  // nach Betriebssystem eine andere.
  cssDateien.sort();

  // Alle Dateien zu einem Text zusammenfügen: `leseToken` nimmt ohnehin die
  // LETZTE Definition — in (jetzt sortierter) Lesereihenfolge verkettet entspricht
  // das näherungsweise der CSS-Kaskade, ohne eine eigene Lade-Reihenfolge
  // nachbauen zu müssen.
  let css = '';
  for (const datei of cssDateien) {
    try { css += '\n' + readFileSync(datei, 'utf-8'); } catch { /* eine unlesbare Datei aendert den Rest nicht */ }
  }
  if (!css) return null;

  const primary = alsHex(leseToken(css, 'color-primary'));
  const accent = alsHex(leseToken(css, 'color-accent'));
  if (!primary && !accent) return null;
  const brand = {};
  if (primary) brand.primary = primary;
  if (accent) brand.accent = accent;
  return brand;
}

/**
 * @param {object} o
 * @param {URL|string} o.dir     dist-Verzeichnis. astro:build:done liefert eine URL,
 *                              die Integration reicht einen Pfad durch — die Zeile
 *                              unten kann beides, die Signatur sagte es nur nicht.
 * @param {object} o.logger      Astro-Logger
 * @param {string} [o.logoPfad]  Logo für die Bilder, relativ zu dist. Default '/logo-inverted.svg'
 * @param {string} [o.domain]    Domain für das cta-Template
 * @param {boolean} [o.strict]   true = Befunde brechen den Build. Default false (Warnung)
 * @param {string} [o.projektWurzel=process.cwd()]  für `markenfarbenLesen()`
 * @param {(distRelativerPfad: string) => ('ki-erzeugt'|'ki-veraendert'|null|undefined)} [o.fotoHerkunft]
 *   Optionaler Callback: liefert die Deklaration für das Hero-Foto einer Seite
 *   (dist-relativer Pfad ohne führenden Slash, z. B. `images/team/gruppe.webp`).
 *   Ohne Callback ändert sich am gerenderten Bild nichts — dieselbe Opt-in-Logik
 *   wie bei der `bildHerkunft`-Prop der neun DOM-Komponenten (v0.135.0).
 */
export async function ogProSeite({
  dir, logger, logoPfad = '/logo-inverted.svg', domain, strict = false,
  projektWurzel = process.cwd(), fotoHerkunft,
}) {
  const dist = dir.pathname ? decodeURIComponent(dir.pathname) : String(dir);
  const seiten = await seitenDateien(dist);

  let logo = null;
  try { logo = await readFile(join(dist, logoPfad.replace(/^\//, ''))); } catch { /* Logo optional */ }

  const gelesen = markenfarbenLesen(projektWurzel);
  // Immer ein VOLLSTÄNDIGES Objekt an die Templates reichen — `markenfarbenLesen`
  // liefert bei nur einem rechenbaren Token ein partielles Ergebnis, und
  // `o.brand ?? BRAND` in den Templates ersetzt bei gesetztem `brand` NICHT die
  // fehlenden Felder (kein Merge). Ein `brand.accent === undefined` wäre in
  // Satori eine ungültige Farbe, kein sichtbarer Rückfall.
  const brand = gelesen ? { ...BRAND, ...gelesen } : null;
  if (gelesen) {
    logger.info(`og-pages: Markenfarben aus src/styles/*.css übernommen (${Object.keys(gelesen).join(', ')}).`);
  } else {
    logger.warn(
      'og-pages: --color-primary/--color-accent nicht rechenbar (kein CSS unter src/styles, oder ' +
        'Werte in color-mix()/oklch()/var() o. ä.) — Vorschaubilder fallen auf die Blitzsicht-' +
        'Hausfarben zurück. Nicht stillschweigend: siehe cw-core#100.',
    );
  }

  await mkdir(join(dist, 'og'), { recursive: true });

  let gerendert = 0, uebersprungen = 0, fehler = 0;
  const geteilt = new Map();
  /** Fleet-Grenze für dist-Bilder; die Engine schaltet darüber selbst auf JPEG. */
  const BUDGET = 200 * 1024;
  const ueberBudget = [];

  for (const datei of seiten) {
    const html = await readFile(datei, 'utf8');
    const { titel, desc, ogImage, ogUrl, foto, ogAlt } = leseSeite(html);
    const slugRoh = relative(dist, dirname(datei)).replace(/\\/g, '/');
    const slug = slugRoh === '' ? 'home' : slugRoh.replace(/\//g, '-');

    // Ohne Titel gibt es nichts zu zeigen — dann bleibt das bisherige Bild stehen.
    if (!titel) { uebersprungen++; continue; }

    geteilt.set(ogImage, (geteilt.get(ogImage) ?? 0) + 1);

    try {
      let element;
      // Ausserhalb des Zweigs deklariert, weil der Alt-Text unten dieselbe Groesse
      // braucht: Pixel-Badge und textliche Offenlegung muessen zwangslaeufig dasselbe
      // sagen. Zwei getrennte Aufloesungen derselben Rechtsfrage wuerden driften.
      let aiHerkunft = null;
      if (foto && !/^https?:/i.test(foto)) {
        const fotoPfadDist = foto.replace(/^\//, '');
        const p = join(dist, fotoPfadDist);
        const roh = await readFile(p);
        const ext = (p.split('.').pop() || '').toLowerCase();
        const umwandeln = BRAUCHT_UMWANDLUNG.has(ext);
        const photo = umwandeln ? await alsJpeg(roh) : roh;
        const photoMime = umwandeln ? 'image/jpeg' : (MIME[ext] ?? 'image/jpeg');

        // KI-Offenlegung: nur wenn die Seite es über den Callback erklärt. Ohne
        // Callback bleibt das Bild wie bisher — kein Kunde bekommt durch das
        // blosse cw-core-Update eine unbelegte Behauptung auf sein OG-Bild.
        aiHerkunft = (fotoHerkunft ? fotoHerkunft(fotoPfadDist) : null) ?? null;
        // Der Hero-Gradient reicht am unteren Rand (wo das Label sitzt) bis 0,92
        // Deckkraft — labelFarbeFuerBild() mit `ueberlagerung` gibt an, wie stark
        // der dunkle Verlauf dort schon vorwegnimmt (siehe hero.mjs-Kommentar).
        const aiFarbe = aiHerkunft
          ? (await labelFarbeFuerBild(photo, { ueberlagerung: 0.85 })) === 'weiss' ? 'weiss' : 'schwarz'
          : undefined;

        element = og.hero({ photo, photoMime, claim: titel, subline: kappe(desc, 96), logo, brand, aiHerkunft, aiFarbe });
      } else {
        element = og.cta({ claim: titel, domain, logo, brand });
      }
      // 200 KB statt der 300-KB-Vorgabe der Engine: der Perf-Budget-Guard der
      // Fleet lässt keine dist-Bilder über 200 KB zu, und er läuft VOR dieser
      // Stelle — die OG-Bilder wären sonst still an ihm vorbeigelaufen. Über der
      // Grenze schaltet die Engine selbst auf JPEG um.
      const { buffer, ext } = await og.renderOg(element, { maxBytes: BUDGET });
      // Der Perf-Budget-Guard der Fleet laeuft VOR dieser Stelle (index.ts ~2815
      // gegen ~2856) und sieht diese Bilder nie. Ohne eigene Zaehlung waere das
      // Budget hier eine Absichtserklaerung ohne Nachweis.
      if (buffer.length > BUDGET) ueberBudget.push(`${slug} ${Math.round(buffer.length / 1024)} KB`);
      const ziel = `og/seite-${slug}.${ext}`;
      await writeFile(join(dist, ziel), buffer);

      // Absolute URL aus og:url der Seite bauen, NICHT aus dem bisherigen
      // Bildpfad. Der erste Anlauf schnitt `/og/…` vom alten og:image ab und
      // hängte den neuen Pfad an — das ergibt nur dann eine gültige URL, wenn das
      // alte Bild zufällig unter /og/ lag. Gegengerechnet:
      //   /og/default.png      -> …/og/seite-x.png            richtig
      //   /images/social.png   -> …/images/social.png/og/…     kaputt
      //   (kein og:image)      -> /og/seite-x.png              relativ, unbrauchbar
      // Facebook und LinkedIn verlangen eine absolute URL; ein relativer oder
      // verschachtelter Pfad wäre ein 404 und damit schlechter als vorher.
      // og:url steht auf jeder Seite und ist der Canonical — daraus die Herkunft.
      let abs;
      try {
        abs = new URL('/' + ziel, ogUrl || ogImage).toString();
      } catch {
        fehler++;
        logger.warn(`og-pages: ${slug} — keine absolute Basis-URL (og:url fehlt), Bild bleibt unverändert.`);
        continue;
      }
      // Der Alt-Text gehört zum Bild und muss mit ihm wechseln. Bliebe er stehen,
      // beschriebe er ein Bild, das unter dieser URL nicht mehr liegt.
      //
      // Basis in dieser Reihenfolge: der bisherige Alt-Text (um die Offenlegung des
      // ALTEN Bildes bereinigt, damit ein von Hand gepflegter Text erhalten bleibt und
      // ein zweiter Lauf nicht doppelt stempelt), sonst die Beschreibung, sonst der
      // Titel. Alle drei beschreiben, was das neue Bild zeigt: `og.hero()`/`og.cta()`
      // setzen genau Titel und gekappte Beschreibung ins Motiv.
      //
      // Die Offenlegung kommt aus `aiHerkunft` — derselben Größe, die über das Badge in
      // den Pixeln entscheidet. Beim `cta`-Template ist sie null: dort steckt kein Foto
      // im Bild, sondern Typografie, und es gibt nichts offenzulegen.
      const altBasis = ohneOffenlegung(ogAlt) || desc || titel;
      const altNeu = altMitOffenlegung(
        altBasis,
        aiHerkunft ? { herkunft: aiHerkunft } : null,
        !!aiHerkunft,
      );

      const neu = setzeAltTags(
        html
          .replace(/(<meta\s+property="og:image"\s+content=")[^"]*(")/, (_m, vor, nach) => vor + abs + nach)
          .replace(/(<meta\s+name="twitter:image"\s+content=")[^"]*(")/, (_m, vor, nach) => vor + abs + nach),
        altNeu,
      );
      await writeFile(datei, neu, 'utf8');
      gerendert++;
    } catch (e) {
      fehler++;
      logger.warn(`og-pages: ${slug} — ${String(e.message).slice(0, 120)}`);
    }
  }

  // Der Report ist der eigentliche Guard: ein stiller Totalausfall wie der vom
  // 09.07.–27.08.2026 muss beim nächsten Mal in der ersten Build-Zeile stehen.
  if (gerendert === 0 && seiten.length > 0) {
    const text = `og-pages: KEINE Seite gerendert (${seiten.length} geprüft, ${fehler} Fehler) — alle Seiten teilen sich weiterhin ein Vorschaubild.`;
    if (strict) throw new Error(text);
    logger.warn(text);
  } else {
    logger.info(`og-pages: ✓ ${gerendert} Seiten mit eigenem Vorschaubild${uebersprungen ? `, ${uebersprungen} ohne Titel übersprungen` : ''}${fehler ? `, ${fehler} Fehler` : ''}.`);
    if (ueberBudget.length) {
      logger.warn(`og-pages: ${ueberBudget.length} Bild(er) über ${BUDGET / 1024} KB — ${ueberBudget.slice(0, 5).join(', ')}`);
    }
    const mehrfach = [...geteilt.entries()].filter(([, n]) => n > 1);
    if (mehrfach.length && gerendert < seiten.length - uebersprungen) {
      logger.warn(`og-pages: ${mehrfach.map(([k, n]) => `${n}× ${k || '(ohne)'}`).join(', ')} — diese Seiten hatten vorher dasselbe Bild.`);
    }
  }
  return { gerendert, uebersprungen, fehler };
}
