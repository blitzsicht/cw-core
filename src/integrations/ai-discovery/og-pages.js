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
import { join, relative, dirname } from 'node:path';
import { createRequire } from 'node:module';
// Statisch, nicht dynamisch: im astro:build:done ist Vites Module-Runner bereits
// geschlossen, jeder dynamische Import scheitert dort mit „Vite module runner has
// been closed" — auch über eine file://-URL (beides gemessen 27.08.2026).
// Gefahrlos, weil engine.mjs satori seinerseits erst beim Rendern nachlädt: das
// blosse Importieren dieser API kostet nichts und kann nicht fehlschlagen.
import * as og from '../../og/index.mjs';

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
  // Hero-Foto: das Hintergrundbild des page-hero, egal ob mit oder ohne Overlay.
  const heroBlock = (html.match(/class="page-hero"[^>]*style="([^"]*)"/) || [])[1] || '';
  const foto = (entities(heroBlock).match(/url\(['"]?([^'")]+)['"]?\)/) || [])[1] || null;
  return { titel, desc, ogImage, ogUrl, foto };
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
 * @param {object} o
 * @param {URL|string} o.dir     dist-Verzeichnis. astro:build:done liefert eine URL,
 *                              die Integration reicht einen Pfad durch — die Zeile
 *                              unten kann beides, die Signatur sagte es nur nicht.
 * @param {object} o.logger      Astro-Logger
 * @param {string} [o.logoPfad]  Logo für die Bilder, relativ zu dist. Default '/logo-inverted.svg'
 * @param {string} [o.domain]    Domain für das cta-Template
 * @param {boolean} [o.strict]   true = Befunde brechen den Build. Default false (Warnung)
 */
export async function ogProSeite({ dir, logger, logoPfad = '/logo-inverted.svg', domain, strict = false }) {
  const dist = dir.pathname ? decodeURIComponent(dir.pathname) : String(dir);
  const seiten = await seitenDateien(dist);

  let logo = null;
  try { logo = await readFile(join(dist, logoPfad.replace(/^\//, ''))); } catch { /* Logo optional */ }

  await mkdir(join(dist, 'og'), { recursive: true });

  let gerendert = 0, uebersprungen = 0, fehler = 0;
  const geteilt = new Map();
  /** Fleet-Grenze für dist-Bilder; die Engine schaltet darüber selbst auf JPEG. */
  const BUDGET = 200 * 1024;
  const ueberBudget = [];

  for (const datei of seiten) {
    const html = await readFile(datei, 'utf8');
    const { titel, desc, ogImage, ogUrl, foto } = leseSeite(html);
    const slugRoh = relative(dist, dirname(datei)).replace(/\\/g, '/');
    const slug = slugRoh === '' ? 'home' : slugRoh.replace(/\//g, '-');

    // Ohne Titel gibt es nichts zu zeigen — dann bleibt das bisherige Bild stehen.
    if (!titel) { uebersprungen++; continue; }

    geteilt.set(ogImage, (geteilt.get(ogImage) ?? 0) + 1);

    try {
      let element;
      if (foto && !/^https?:/i.test(foto)) {
        const p = join(dist, foto.replace(/^\//, ''));
        const roh = await readFile(p);
        const ext = (p.split('.').pop() || '').toLowerCase();
        const umwandeln = BRAUCHT_UMWANDLUNG.has(ext);
        const photo = umwandeln ? await alsJpeg(roh) : roh;
        const photoMime = umwandeln ? 'image/jpeg' : (MIME[ext] ?? 'image/jpeg');
        element = og.hero({ photo, photoMime, claim: titel, subline: kappe(desc, 96), logo });
      } else {
        element = og.cta({ claim: titel, domain, logo });
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
      const neu = html
        .replace(/(<meta\s+property="og:image"\s+content=")[^"]*(")/, `$1${abs}$2`)
        .replace(/(<meta\s+name="twitter:image"\s+content=")[^"]*(")/, `$1${abs}$2`);
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
