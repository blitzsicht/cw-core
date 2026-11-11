#!/usr/bin/env node
// @ts-check
/**
 * leser-vergleich — mehrere cw-core-Stände lesen denselben Korpus echter Seiten; was weicht ab?
 *
 * Für jeden Stand und jede Seite: CSP-Ressourcen (`extractResources`), Bilder für die
 * KI-Kennzeichnung (`bilderAusHtml`), das Kennzeichnungs-Urteil mit den **echten** Regeln der
 * Site (`pruefeSeiteAufKennzeichnung`, Regeln aus `origin` des Kundenrepos) und die
 * Embed-Consent-Befunde (`checkEmbedConsent`). Der erste Stand ist die Referenz; jeder weitere
 * wird Seite für Seite gegen sie gehalten.
 *
 * **Warum drei Stände statt zwei.** Ein Fix gegen eine Regression wird gegen den Stand gehalten,
 * den die Flotte heute ausliefert (den letzten Tag), nicht nur gegen den kaputten Kopf. Sonst
 * belegt „gleich bis auf die Regression“ nur, dass der Fix sich vom Fehler unterscheidet.
 *
 * **Kann nicht rot werden?** Ohne Regeln wäre jedes Bild „ungeklärt“ und `pflichtig` überall 0 —
 * ein Vergleich, der immer gleich ausgeht. Deshalb steht in der Zusammenfassung je Stand die
 * Zahl der Seiten mit `pflichtig > 0`; ist sie 0, endet der Lauf mit Exit 2 („lief nie“).
 *
 * Lauf:
 *   node scripts/ab/leser-vergleich.mjs --html /tmp/ab-korpus --out /tmp/ab-ergebnis.json \
 *     v0195=/tmp/stand-v0195 kopf=/tmp/stand-kopf neu=$PWD
 * Jeder Stand ist ein Verzeichnis mit `src/` (z. B. `git archive <ref> | tar -x -C <dir>`) und
 * erreichbarem `parse5` (Symlink auf ein node_modules genügt).
 *
 * Exit: 0 gelaufen · 2 lief nie (keine Seite, oder keine Seite mit pflichtigem Bild) · 64 Aufruf.
 */
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { registryPfad } from '../registry-pfad.mjs';

const args = process.argv.slice(2);
const arg = (/** @type {string} */ n) => {
  const i = args.indexOf(n);
  return i > -1 ? args[i + 1] : null;
};
const HTML = arg('--html');
const OUT = arg('--out');
const staende = args.filter((a) => /^[\w.-]+=/.test(a)).map((a) => {
  const [name, ...rest] = a.split('=');
  return { name, pfad: rest.join('=') };
});
if (!HTML || staende.length < 2) {
  console.error('Aufruf: leser-vergleich.mjs --html <korpus> [--out <json>] ref=<pfad> stand=<pfad> …');
  process.exit(64);
}

/** @param {string} pfad */
async function lade(pfad) {
  const imp = (/** @type {string} */ f) => import(`${pfad}/src/integrations/ai-discovery/${f}`);
  const [res, kz, emb] = await Promise.all([imp('html-resources.js'), imp('ai-label-check.js'), imp('embed-consent-check.js')]);
  return {
    extractResources: res.extractResources,
    bilderAusHtml: kz.bilderAusHtml,
    pruefe: kz.pruefeSeiteAufKennzeichnung,
    leseRegeln: kz.leseHerkunftRegeln,
    embed: emb.checkEmbedConsent,
  };
}
const geladen = [];
for (const s of staende) geladen.push({ ...s, f: await lade(s.pfad) });

// Regeln je Site vom Remote des Kundenrepos — nie aus dem lokalen Klon (siehe kennzeichnung-live).
const kunden = JSON.parse(readFileSync(registryPfad(), 'utf8')).customers ?? [];
/** @type {Map<string, any[]>} */
const regelnJe = new Map();
/** @param {string} slug */
function regeln(slug) {
  if (regelnJe.has(slug)) return /** @type {any[]} */ (regelnJe.get(slug));
  const k = kunden.find((/** @type {any} */ c) => c.slug === slug);
  let r = [];
  if (k?.repo_path && existsSync(k.repo_path)) {
    try {
      const git = (/** @type {string[]} */ a) => execFileSync('git', ['-C', k.repo_path, ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
      git(['fetch', '--quiet', 'origin']);
      r = geladen[0].f.leseRegeln(git(['show', 'origin/main:src/data/bild-herkunft.ts'])).regeln;
    } catch {}
  }
  regelnJe.set(slug, r);
  return r;
}

const key = (/** @type {any} */ r) => `${r.type}|${r.directive}|${r.url ?? ''}|${r.type === 'inline' ? (r.content ?? '').length : ''}`;
const nur = (/** @type {string[]} */ a, /** @type {string[]} */ b) => a.filter((x) => !b.includes(x));

/** @type {Record<string, any>} */
const summe = Object.fromEntries(staende.map((s) => [s.name, { seiten: 0, ressourcen: 0, bilder: 0, pflichtig: 0, fehlend: 0, ungeklaert: 0, seitenMitPflicht: 0, embed: 0, fehler: 0 }]));
/** @type {any[]} */
const abweichungen = [];

for (const slug of readdirSync(HTML).sort()) {
  const r = regeln(slug);
  for (const datei of readdirSync(`${HTML}/${slug}`)) {
    const { url, html } = JSON.parse(readFileSync(`${HTML}/${slug}/${datei}`, 'utf8'));
    const host = new URL(url).host;
    const je = geladen.map(({ name, f }) => {
      try {
        const res = f.extractResources(html, url).map(key).sort();
        const bilder = f.bilderAusHtml(html);
        const kz = f.pruefe(html, r, { eigenerHost: host });
        const embed = f.embed(html, url).length;
        const s = summe[name];
        s.seiten++; s.ressourcen += res.length; s.bilder += bilder.length; s.pflichtig += kz.pflichtig.length;
        s.fehlend += kz.fehlend; s.ungeklaert += kz.ungeklaert.length; s.embed += embed;
        if (kz.pflichtig.length) s.seitenMitPflicht++;
        return { name, res, bilder, pflichtig: kz.pflichtig, fehlend: kz.fehlend, ungeklaert: kz.ungeklaert, embed };
      } catch (e) {
        summe[name].fehler++;
        return { name, fehler: /** @type {Error} */ (e).message };
      }
    });
    const ref = je[0];
    for (const st of je.slice(1)) {
      if (ref.fehler || st.fehler) {
        if (ref.fehler !== st.fehler) abweichungen.push({ url, stand: st.name, fehlerRef: ref.fehler ?? null, fehler: st.fehler ?? null });
        continue;
      }
      const d = {
        url, stand: st.name,
        bilderNurRef: nur(ref.bilder, st.bilder), bilderNurStand: nur(st.bilder, ref.bilder),
        resNurRef: nur(ref.res, st.res), resNurStand: nur(st.res, ref.res),
        pflichtig: [ref.pflichtig.length, st.pflichtig.length], fehlend: [ref.fehlend, st.fehlend],
        ungeklaert: [ref.ungeklaert.length, st.ungeklaert.length], embed: [ref.embed, st.embed],
      };
      const gleich = !d.bilderNurRef.length && !d.bilderNurStand.length && !d.resNurRef.length && !d.resNurStand.length
        && d.pflichtig[0] === d.pflichtig[1] && d.fehlend[0] === d.fehlend[1] && d.ungeklaert[0] === d.ungeklaert[1] && d.embed[0] === d.embed[1];
      if (!gleich) abweichungen.push(d);
    }
  }
}

console.log('Stand'.padEnd(8), 'Seiten Ressourcen Bilder pflichtig fehlend ungeklärt SeitenMitPflicht Embed Fehler');
for (const s of staende) {
  const z = summe[s.name];
  console.log(s.name.padEnd(8), [z.seiten, z.ressourcen, z.bilder, z.pflichtig, z.fehlend, z.ungeklaert, z.seitenMitPflicht, z.embed, z.fehler].join(' '));
}
for (const s of staende.slice(1)) {
  const a = abweichungen.filter((x) => x.stand === s.name);
  console.log(`\n${staende[0].name} → ${s.name}: ${a.length} abweichende Seite(n)`);
  for (const d of a.slice(0, 20)) {
    if (d.fehler !== undefined) { console.log(`  ${d.url}  Fehler: ref=${d.fehlerRef} stand=${d.fehler}`); continue; }
    const teile = [];
    if (d.bilderNurRef.length) teile.push(`Bilder nur ${staende[0].name}: ${d.bilderNurRef.join(', ')}`);
    if (d.bilderNurStand.length) teile.push(`Bilder nur ${s.name}: ${d.bilderNurStand.join(', ')}`);
    if (d.resNurRef.length || d.resNurStand.length) teile.push(`CSP −${d.resNurRef.length}/+${d.resNurStand.length}`);
    for (const k of ['pflichtig', 'fehlend', 'ungeklaert', 'embed']) if (d[k][0] !== d[k][1]) teile.push(`${k} ${d[k][0]}→${d[k][1]}`);
    console.log(`  ${d.url}  ${teile.join(' · ')}`);
  }
}
if (OUT) writeFileSync(OUT, JSON.stringify({ summe, abweichungen }, null, 1));
const ref = summe[staende[0].name];
process.exit(ref.seiten === 0 || ref.seitenMitPflicht === 0 ? 2 : 0);
