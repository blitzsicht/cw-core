#!/usr/bin/env node
/**
 * Tests für verify-touchpoints.mjs (Pure-Helpers + dist-Modus End-to-End).
 *
 * Läuft via: node --test scripts/verify-touchpoints.test.mjs
 *
 * Wichtigster Test: der Guard-goes-red-Beweis — das Broken-Fixture enthält die
 * drei realen Bug-Klassen aus dem digital-direkt-Audit 2026-07 (falsche Ziffer,
 * Bindestrich, Spaces) und MUSS den Audit auf Exit 1 bringen. Ein Check, der
 * nie rot war, ist eine Behauptung.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync, rmSync, readFileSync, copyFileSync, symlinkSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  normalizePhone,
  parseSsot,
  extractHrefs,
  extractWhatsAppHrefs,
  findSchemelessContactHrefs,
  auditHtml,
  extractInternalLinks,
} from './verify-touchpoints.mjs';

const SCRIPT = resolve(import.meta.dirname, 'verify-touchpoints.mjs');
const FIXTURES = resolve(import.meta.dirname, 'fixtures');

const SITE_DATA = `
export const siteData = {
  contact: { email: 'vertrieb@digital-direkt.com', phone: '+49 9401 53959-20' },
  legal: { email: 'vertrieb@digital-direkt.com', phone: '+49 9401 53959-20', fax: '+49 9401 53959-99' },
  persons: [
    { email: 'markus.steller@digital-direkt.com', phone: '+49 9401 53959-20' },
    { email: 'melanie.steller@digital-direkt.com', phone: '+49 9401 53959-44' },
  ],
  karriere: { kontaktEmail: 'l.steller@digital-direkt.com' },
};
`;

// ─── Pure-Helper-Tests ──────────────────────────────────────────────────────

test('normalizePhone: nationale 0, +49, Ländercode ohne +, Separatoren', () => {
  assert.equal(normalizePhone('09401 53959-0'), '+499401539590');
  assert.equal(normalizePhone('+49 9401 53959-20'), '+4994015395920');
  assert.equal(normalizePhone('49 9401 5395920'), '+4994015395920');
  assert.equal(normalizePhone(''), '');
});

test('parseSsot: Telefone aus phone/fax-Keys, alle E-Mail-Literale', () => {
  const { phones, emails } = parseSsot(SITE_DATA);
  assert.ok(phones.has('+4994015395920'));
  assert.ok(phones.has('+4994015395944'));
  assert.ok(phones.has('+4994015395999')); // fax
  assert.ok(emails.has('vertrieb@digital-direkt.com'));
  assert.ok(emails.has('l.steller@digital-direkt.com'));
  assert.equal(emails.size, 4);
});

test('extractHrefs: tel + mailto, single/double quotes', () => {
  const html = `<a href="tel:+491">a</a> <a href='mailto:x@y.de?subject=Hi'>b</a>`;
  assert.deepEqual(extractHrefs(html, 'tel'), ['tel:+491']);
  assert.deepEqual(extractHrefs(html, 'mailto'), ['mailto:x@y.de?subject=Hi']);
});

test('extractWhatsAppHrefs: wa.me und api.whatsapp.com', () => {
  const html = `<a href="https://wa.me/4916012345">w</a><a href="https://api.whatsapp.com/send?phone=4916012345">x</a>`;
  assert.equal(extractWhatsAppHrefs(html).length, 2);
});

test('findSchemelessContactHrefs: fehlendes tel:/mailto:-Schema, ohne Fehlalarm auf Pfaden', () => {
  const found = findSchemelessContactHrefs(`
    <a href="+4994015395920">tel fehlt</a>
    <a href="09401 53959-20">tel fehlt (national)</a>
    <a href="vertrieb@x.de">mailto fehlt</a>
    <a href="/leistungen/2026/07/">Pfad — kein Treffer</a>
    <a href="tel:+4994015395920">korrekt</a>
    <a href="mailto:vertrieb@x.de">korrekt</a>
    <span data-href="+49999999">data-Attribut — kein Treffer</span>`);
  assert.deepEqual(
    found.map((f) => f.href).sort(),
    ['+4994015395920', '09401 53959-20', 'vertrieb@x.de'],
  );
});

test('auditHtml: Broken-Fixture liefert exakt die 7 gepflanzten Probleme', () => {
  const html = readFileSync(join(FIXTURES, 'touchpoints-broken.html'), 'utf-8');
  const problems = auditHtml(html, parseSsot(SITE_DATA), {
    allowExternalMailto: ['poststelle@lda.bayern.de'],
  });
  const hrefs = problems.map((p) => p.href);
  assert.ok(hrefs.includes('tel:+4994015395900'), 'falsche Ziffer (Durchwahl 00) muss auffallen');
  assert.ok(hrefs.includes('tel:+49940153959-20'), 'Bindestrich muss auffallen');
  assert.ok(hrefs.includes('tel:+49 9401 53959-44'), 'Spaces müssen auffallen');
  assert.ok(hrefs.includes('mailto:vertireb@digital-direkt.com'), 'mailto-Tippfehler muss auffallen');
  assert.ok(hrefs.includes('https://wa.me/4917612345678'), 'fremde WhatsApp-Nummer muss auffallen');
  assert.ok(hrefs.includes('+4994015395920'), 'fehlendes tel:-Schema muss auffallen');
  assert.ok(hrefs.includes('vertrieb@digital-direkt.com'), 'fehlendes mailto:-Schema muss auffallen');
  assert.equal(problems.length, 7, 'OK-Referenzen und data-href dürfen NICHT anschlagen');
});

test('auditHtml: OK-Fixture ist sauber (inkl. ?subject und Allowlist)', () => {
  const html = readFileSync(join(FIXTURES, 'touchpoints-ok.html'), 'utf-8');
  const problems = auditHtml(html, parseSsot(SITE_DATA), {
    allowExternalMailto: ['poststelle@lda.bayern.de'],
  });
  assert.deepEqual(problems, []);
});

test('parseSsot: mobile-Key zählt mit — donau-profi fiel 17-mal über eine Nummer, die im SSOT stand', () => {
  const src = `
    contact: { phone: '+49 941 63082470' },
    kontakt: { mobile: '+49 151 18220924' },
  `;
  const { phones } = parseSsot(src);
  assert.ok(phones.has(normalizePhone('+4915118220924')), 'mobile fehlt im SSOT-Set');
  assert.ok(phones.has(normalizePhone('+4994163082470')), 'phone fehlt im SSOT-Set');
});

test('parseSsot: ein beliebiger Key wird NICHT zur Telefonquelle', () => {
  // Gegenprobe zur Erweiterung oben: die Liste ist eine Liste, kein „alles was
  // nach Nummer aussieht". Sonst wuerde jede Hausnummer zur gueltigen Rufnummer.
  const { phones } = parseSsot(`umsatzsteuerId: '+49 151 18220924',`);
  assert.equal(phones.size, 0);
});

test('auditHtml: Aufsichtsbehörde ist OHNE Config erlaubt — cw-core liefert sie selbst aus', () => {
  // blitzsicht-ops#653: die Adresse steht in keinem Kunden-Repo, sondern in
  // InformationspflichtBlock.astro. Der Guard meldete damit die eigene Ausgabe
  // als Fremdkörper — drei von vier frisch ausgerollten Repos fielen darüber.
  const html = `<a href="mailto:poststelle@lda.bayern.de">Beschwerde</a>`;
  assert.deepEqual(auditHtml(html, parseSsot(SITE_DATA)), []);
});

test('auditHtml: eine fremde Adresse bleibt ein Befund — die Allowlist ist kein Freibrief', () => {
  // Gegenprobe. Ohne sie belegt der Test darüber nur, dass es still ist.
  const html = `<a href="mailto:fremd@example.com">x</a>`;
  const problems = auditHtml(html, parseSsot(SITE_DATA));
  assert.equal(problems.length, 1);
  assert.match(problems[0].problem, /weder im SSOT-E-Mail-Set noch in allowExternalMailto/);
});

test('auditHtml: allowExternalMailto gilt zusätzlich, nicht statt', () => {
  // Kunden ausserhalb Bayerns setzen ihre eigene Behörde — beide müssen durch.
  const html =
    `<a href="mailto:poststelle@lda.bayern.de">bayern</a>` +
    `<a href="mailto:poststelle@datenschutz-berlin.de">berlin</a>`;
  assert.deepEqual(
    auditHtml(html, parseSsot(SITE_DATA), {
      allowExternalMailto: ['poststelle@datenschutz-berlin.de'],
    }),
    [],
  );
});

test('auditHtml: ohne SSOT (leere Sets) nur Syntax-Checks', () => {
  const problems = auditHtml(
    `<a href="tel:+4999999">x</a><a href="tel:+49 1 2">y</a>`,
    { phones: new Set(), emails: new Set() },
  );
  assert.equal(problems.length, 1); // nur die Space-Variante, unbekannte Nummer ok ohne SSOT
});

test('extractInternalLinks: same-site absolut + relativ, extern/anker raus', () => {
  const html = `
    <a href="/kontakt/">k</a>
    <a href="https://kunde.de/leistungen/">l</a>
    <a href="https://extern.example/x">e</a>
    <a href="#anker">a</a>
    <a href="tel:+491">t</a>`;
  const links = extractInternalLinks(html, 'https://kunde.de');
  assert.deepEqual(links.sort(), ['https://kunde.de/kontakt/', 'https://kunde.de/leistungen/']);
});

// ─── End-to-End: dist-Modus via Subprozess ──────────────────────────────────

/**
 * @param {object} opts
 * @param {string} opts.fixture Fixture-Dateiname der als dist/index.html landet
 * @param {string|null} [opts.config] Inhalt von touchpoint-audit.config.json
 * @param {Record<string,string>} [opts.env]
 * @returns {{ code: number, out: string }}
 */
function runDist({ fixture, config = null, env = {} }) {
  const cwd = join(tmpdir(), `cwcore-tp-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(join(cwd, 'src', 'data'), { recursive: true });
  mkdirSync(join(cwd, 'dist'), { recursive: true });
  writeFileSync(join(cwd, 'src', 'data', 'site-data.ts'), SITE_DATA);
  copyFileSync(join(FIXTURES, fixture), join(cwd, 'dist', 'index.html'));
  if (config !== null) writeFileSync(join(cwd, 'touchpoint-audit.config.json'), config);

  let code = 0;
  let out = '';
  try {
    out = execFileSync(process.execPath, [SCRIPT, '--dist', 'dist'], {
      env: { ...process.env, ...env },
      cwd,
      encoding: 'utf-8',
      timeout: 10000,
    });
  } catch (err) {
    code = err.status ?? 1;
    out = (err.stdout ?? '') + (err.stderr ?? '');
  } finally {
    try {
      rmSync(cwd, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
  return { code, out };
}

test('E2E: Broken-Fixture → Exit 1 (Guard-goes-red-Beweis)', () => {
  const { code, out } = runDist({ fixture: 'touchpoints-broken.html' });
  assert.equal(code, 1, `erwartet Exit 1, out:\n${out}`);
  assert.match(out, /tel:\+4994015395900/);
});

test('E2E: OK-Fixture + Allowlist-Config → Exit 0', () => {
  const { code, out } = runDist({
    fixture: 'touchpoints-ok.html',
    config: JSON.stringify({ allowExternalMailto: ['poststelle@lda.bayern.de'] }),
  });
  assert.equal(code, 0, `erwartet Exit 0, out:\n${out}`);
  assert.match(out, /Touchpoint-Audit OK/);
});

test('E2E: SKIP_TOUCHPOINTS=true → Exit 0 ohne Prüfung', () => {
  const { code, out } = runDist({
    fixture: 'touchpoints-broken.html',
    env: { SKIP_TOUCHPOINTS: 'true' },
  });
  assert.equal(code, 0);
  assert.match(out, /skipped/);
});

test('E2E: kaputte Config-JSON → Exit 2 (Konfig-Fehler, kein stiller Pass)', () => {
  const { code } = runDist({ fixture: 'touchpoints-ok.html', config: '{nicht json' });
  assert.equal(code, 2);
});

test('E2E: Aufruf über Symlink führt main() aus (kein stiller Exit 0)', () => {
  // Regression: pnpm verlinkt node_modules/@cw/core → node_modules/.pnpm/…, d. h. der
  // CI-Aufruf `node node_modules/@cw/core/scripts/verify-touchpoints.mjs` läuft IMMER
  // über einen Symlink. Mit dem naiven argv-Vergleich lief main() dort nie und der
  // Check meldete Exit 0 ohne eine einzige Prüfung. Dieser Test bricht ohne den
  // realpath-Vergleich in isDirectRun().
  const cwd = join(tmpdir(), `cwcore-tp-link-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(join(cwd, 'src', 'data'), { recursive: true });
  mkdirSync(join(cwd, 'dist'), { recursive: true });
  mkdirSync(join(cwd, 'link'), { recursive: true });
  writeFileSync(join(cwd, 'src', 'data', 'site-data.ts'), SITE_DATA);
  copyFileSync(join(FIXTURES, 'touchpoints-broken.html'), join(cwd, 'dist', 'index.html'));
  const linked = join(cwd, 'link', 'verify-touchpoints.mjs');
  symlinkSync(SCRIPT, linked);

  let code = 0;
  let out = '';
  try {
    out = execFileSync(process.execPath, [linked, '--dist', 'dist'], {
      cwd,
      encoding: 'utf-8',
      timeout: 10000,
    });
  } catch (err) {
    code = err.status ?? 1;
    out = (err.stdout ?? '') + (err.stderr ?? '');
  } finally {
    try {
      rmSync(cwd, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
  assert.equal(code, 1, `main() muss über den Symlink laufen und rot werden, out:\n${out}`);
  assert.match(out, /Touchpoint-Audit/, 'Ausgabe muss vom Audit stammen, nicht leer sein');
});

test('E2E: ohne --dist/--url → Exit 2 mit Usage', () => {
  let code = 0;
  try {
    execFileSync(process.execPath, [SCRIPT], { encoding: 'utf-8', timeout: 10000 });
  } catch (err) {
    code = err.status;
  }
  assert.equal(code, 2);
});
