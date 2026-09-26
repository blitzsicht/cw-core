// Blog-Standard: „Kurz gesagt“ und viele Bilder in jedem Blogbeitrag.
//
// Operator-Regel vom 26.09.2026: „mit vielen Fotos und am Anfang immer ein TL;DR — das
// gehört als Rule definiert und bei jedem Blog so.“ Entstanden in customer-blitzsicht
// (#154, #155), dort gemessen: 9 von 11 Beiträgen hatten kein Bild im Text, das TL;DR
// stand, wenn überhaupt, erst nach der Einleitung. Hierher gehoben (blitzsicht-ops #894),
// weil Zink (5 Beiträge, 0 Bilder) und siluri.de (41 von 45 ohne Bild) denselben Befund
// hatten — die Lücke ist systemisch, nicht ein Kunde.
//
// Fünf Prüfungen:
//
// 1. KURZ GESAGT FEHLT. Frontmatter-Feld `kurzGesagt`, 120–600 Zeichen. Wo das Content-
//    Schema es schon erzwingt, ist das eine zweite Sicherung; siluri.de hat bewusst kein
//    Schema, dort ist es die einzige.
// 2. „KURZ GESAGT“ IM TEXT. Die Vorlage rendert den Kasten (BlogKurzGesagt.astro) vor dem
//    ersten Absatz; eine Überschrift „## Kurz gesagt“ im Text wäre er ein zweites Mal.
// 3. HERO DOPPELT (blitzsicht, 11.09.2026): das Hero-Bild steht über dem Artikel, im Text
//    sähe der Leser es zweimal untereinander.
// 4. ZU WENIG BILDER: 1 Bild je 400 Wörter, mindestens 3. Das Hero zählt nicht mit.
// 5. BILD OHNE HERKUNFT (nur mit `herkunft`-Resolver). Markdown-Bilder bekommen kein
//    AI-Label über AiLabelAmBild: ein nicht deklariertes KI-Bild ginge ungeprüft nach
//    Art. 50 AI Act live. Ein KI-Bild braucht den sichtbaren Titel „…KI-generiert“, der
//    von rehype-blog-bilder zur Bildunterschrift wird — außer die Site kennzeichnet
//    Markdown-Bilder selbst (siluri.de: rehype-ki-kennzeichnung), dann `kiUnterschrift: false`.
//    Ein Deepfake im Text ist ein Fehler, weil Markdown-Bilder kein AI-Label bekommen — es
//    sei denn, ein rehype-Plugin der Site setzt es (`deepfakeLabel: true`, siluri.de).

import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

export const BILDZAHL_STRENG = true;
export const WOERTER_JE_BILD = 400;
export const MIN_BILDER = 3;
export const KURZ_MIN = 120;
export const KURZ_MAX = 600;

/** Pfad normalisieren: Query/Hash weg, führender Slash sicher. */
export const norm = (p) => '/' + p.trim().replace(/^["']|["']$/g, '').split(/[?#]/)[0].replace(/^\/+/, '');

/** Frontmatter und Body trennen (LF und CRLF). */
export function zerlege(text) {
  const m = text.replace(/\r\n/g, '\n').match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  return m ? { fm: m[1], body: m[2] } : null;
}

/**
 * Wert eines Frontmatter-Schlüssels als Text — ohne YAML-Parser, deshalb bewusst schmal:
 * einzeilig (mit/ohne Anführungszeichen) oder als Block `>`/`|` mit eingerückten Folgezeilen.
 * Genug für einen Absatz Prosa; ein Listenwert liefert '' und fällt damit als „fehlt“ auf.
 */
export function feld(fm, schluessel) {
  const zeilen = fm.split('\n');
  const i = zeilen.findIndex((z) => z.startsWith(`${schluessel}:`));
  if (i < 0) return null;
  const rest = zeilen[i].slice(schluessel.length + 1).trim();
  if (rest && !/^[>|][+-]?$/.test(rest)) {
    const m = rest.match(/^(["'])([\s\S]*)\1$/);
    if (!m) return rest;
    return m[1] === "'" ? m[2].replace(/''/g, "'") : m[2].replace(/\\"/g, '"');
  }
  const folge = [];
  for (const z of zeilen.slice(i + 1)) {
    if (z.trim() && !/^\s/.test(z)) break;
    folge.push(z.trim());
  }
  return rest.startsWith('|') ? folge.join('\n').trim() : folge.join(' ').replace(/\s+/g, ' ').trim();
}

/** Code-Blöcke raus — ein Bild-Beispiel im Code ist kein Bild im Artikel. */
const ohneCode = (body) => body.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '');

/**
 * Bilder im Text als { src, titel }. Markdown-Bilder und rohes <img> (auch in <figure>,
 * siluri.de bindet so ein). Der Titel wird zur sichtbaren Bildunterschrift; bei rohem HTML
 * zählt auch eine <figcaption> derselben <figure>.
 */
export function bilderMitTitel(body) {
  const b = ohneCode(body);
  const md = [...b.matchAll(/!\[[^\]]*\]\(\s*([^)\s]+)(?:\s+"([^"]*)")?\s*\)/g)].map((x) => ({ src: x[1], titel: x[2] ?? '' }));
  const figuren = [...b.matchAll(/<figure\b[\s\S]*?<\/figure>/gi)].map((x) => x[0]);
  const roh = [...b.matchAll(/<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)].map((x) => {
    const titel = (x[0].match(/\btitle=["']([^"']*)["']/i) ?? [])[1];
    const figur = figuren.find((f) => f.includes(x[0]));
    const caption = figur ? (figur.match(/<figcaption\b[^>]*>([\s\S]*?)<\/figcaption>/i) ?? [])[1] : undefined;
    return { src: x[1], titel: titel ?? caption?.replace(/<[^>]+>/g, '').trim() ?? '' };
  });
  return [...md, ...roh];
}

export function bilderImText(body) {
  return bilderMitTitel(body).map((x) => x.src);
}

/** Wörter des Fließtexts: ohne Code, Bildsyntax, HTML-Tags, Link-Ziele und Tabellen-Pipes. */
export function woerter(body) {
  const t = ohneCode(body)
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\]\([^)]*\)/g, ']')
    .replace(/[|#*_>\-\[\]]/g, ' ');
  return t.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}

export const sollBilder = (anzahlWoerter) => Math.max(MIN_BILDER, Math.ceil(anzahlWoerter / WOERTER_JE_BILD));

/**
 * @param {string} name Dateiname
 * @param {string} text Dateiinhalt
 * @param {import('./blog-check').PruefOptionen} [opt]
 * @returns {import('./blog-check').PruefErgebnis}
 */
export function pruefe(name, text, opt = {}) {
  const { herkunft, kurzGesagt = true, kiUnterschrift = true, deepfakeLabel = false, heroFelder = ['heroImage', 'image'], streng = BILDZAHL_STRENG } = opt;
  const teile = zerlege(text);
  if (!teile) return { fehler: [`${name}: kein Frontmatter gefunden — Blogbeiträge brauchen mindestens title und kurzGesagt.`], hinweise: [], ist: 0, soll: 0 };
  const { fm, body } = teile;
  if (/^draft:\s*true\s*$/m.test(fm)) return { fehler: [], hinweise: [], ist: 0, soll: 0, entwurf: true };
  const fehler = [];
  const hinweise = [];
  const bilder = bilderMitTitel(body);

  // 1. Kurz gesagt fehlt
  if (kurzGesagt) {
    const kurz = feld(fm, 'kurzGesagt');
    if (!kurz) {
      fehler.push(`${name}: Feld kurzGesagt fehlt — 2–4 Sätze (${KURZ_MIN}–${KURZ_MAX} Zeichen) ins Frontmatter, die Vorlage rendert den Kasten „Kurz gesagt“.`);
    } else if (kurz.length < KURZ_MIN || kurz.length > KURZ_MAX) {
      fehler.push(`${name}: kurzGesagt hat ${kurz.length} Zeichen, erlaubt sind ${KURZ_MIN}–${KURZ_MAX}.`);
    }
  }

  // 2. „Kurz gesagt“ als Überschrift im Text
  if (/^#{1,6}\s*kurz gesagt\b/im.test(ohneCode(body))) {
    fehler.push(`${name}: „Kurz gesagt“ steht als Überschrift im Text — es gehört ins Frontmatter-Feld kurzGesagt, die Vorlage rendert den Kasten selbst.`);
  }

  // 3. Hero doppelt
  for (const f of heroFelder) {
    const hero = feld(fm, f);
    if (!hero) continue;
    const heroPfad = norm(hero);
    for (const b of bilder) {
      if (norm(b.src) === heroPfad) {
        fehler.push(`${name}: das Hero-Bild ${heroPfad} steht im Text noch einmal — die Vorlage zeigt es schon über dem Artikel.`);
      }
    }
  }

  // 4. Bildzahl
  const soll = sollBilder(woerter(body));
  const ist = bilder.length;
  if (ist < soll) {
    const msg = `${name}: ${ist} von ${soll} Bildern im Text (1 je ${WOERTER_JE_BILD} Wörter, mindestens ${MIN_BILDER}).`;
    (streng ? fehler : hinweise).push(msg);
  }

  // 5. Herkunft
  if (herkunft) {
    for (const { src, titel } of bilder) {
      if (/^(https?:)?\/\//i.test(src)) {
        fehler.push(`${name}: ${src} liegt extern — Blogbilder gehören nach public/images/blog/, damit Herkunft und Größe prüfbar sind.`);
        continue;
      }
      const r = herkunft(norm(src));
      if (!r?.quelle) {
        fehler.push(`${name}: ${norm(src)} hat keine Herkunftsregel — in der Bild-Arbeitsliste einordnen und bild-herkunft.ts neu erzeugen.`);
      } else if (r.deepfake === 'ja') {
        // Mit deepfakeLabel setzt ein rehype-Plugin der Site das Label „Mit KI erzeugt“ ans
        // Bild — das ist die sichtbare Kennzeichnung, eine zweite Unterschrift braucht es nicht.
        if (deepfakeLabel) continue;
        fehler.push(`${name}: ${norm(src)} ist als Deepfake deklariert — im Markdown-Text gibt es kein AI-Label, solche Bilder gehören nicht in den Fließtext.`);
      } else if (kiUnterschrift && /^ki-/.test(r.herkunft ?? '') && r.herkunft !== 'ki-veraendert' && !/KI-generiert/i.test(titel)) {
        fehler.push(`${name}: ${norm(src)} ist KI-erzeugt, trägt aber keine sichtbare Unterschrift — Titel „Symbolbild, KI-generiert“ ans Markdown-Bild: ![alt](pfad "Symbolbild, KI-generiert").`);
      }
    }
  }

  return { fehler, hinweise, ist, soll };
}

/**
 * Alle Beiträge eines Verzeichnisses prüfen (.md/.mdx, nicht rekursiv in _-Ordner).
 * @param {string} dir
 * @param {import('./blog-check').PruefOptionen} [opt]
 */
export async function pruefeVerzeichnis(dir, opt = {}) {
  const dateien = [];
  const lauf = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.name.startsWith('_') || e.name.startsWith('.')) continue;
      const p = join(d, e.name);
      if (e.isDirectory()) lauf(p);
      else if (/\.mdx?$/.test(e.name)) dateien.push(p);
    }
  };
  lauf(dir);
  const ergebnisse = dateien.map((p) => pruefe(relative(dir, p), readFileSync(p, 'utf8'), opt));
  const aktiv = ergebnisse.filter((e) => !e.entwurf);
  return {
    artikel: aktiv.length,
    bilder: aktiv.reduce((s, e) => s + e.ist, 0),
    fehler: ergebnisse.flatMap((e) => e.fehler),
    hinweise: ergebnisse.flatMap((e) => e.hinweise),
  };
}

/** Rückwärtskompatibel zu customer-blitzsicht: nur die Hero-Befunde. */
export function befunde(name, text) {
  return pruefe(name, text, { kurzGesagt: false }).fehler.filter((f) => f.includes('Hero-Bild'));
}
