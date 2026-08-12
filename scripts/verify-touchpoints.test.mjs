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
  postsToContactApi,
  extractInternalLinks,
  extractAssetRefs,
  detectOriginFromHtml,
  pickDistRoot,
  normalizeUrlPath,
  distPathCandidates,
  resolveDistPath,
  matchVercelRoute,
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

test('postsToContactApi: erkennt die Kontakt-Route am action-Attribut', () => {
  assert.equal(postsToContactApi('<form action="/api/contact" method="post">'), true);
  assert.equal(postsToContactApi("<form method='post' action='/api/contact'>"), true);
});

test('postsToContactApi: ein Suchfeld ist kein Kontaktformular', () => {
  // Der Grund fuer die action-Pruefung statt „gibt es ein <form>": sonst haette
  // jede Site mit Suchfeld die /api/contact-Probe getriggert.
  assert.equal(postsToContactApi('<form action="/suche"><input name="q"></form>'), false);
  assert.equal(postsToContactApi('<div>kein Formular, nur Text über /api/contact</div>'), false);
});

test('postsToContactApi: hausamlago-Fall — Erwähnung in der Datenschutzerklärung zählt nicht', () => {
  // Genau der Fehlalarm vom 12.08.2026: die Site nennt /api/contact in der
  // Datenschutzerklärung, hat aber weder Formular noch Route.
  const html = '<p>Ihre Anfrage wird über <code>/api/contact</code> verarbeitet.</p>';
  assert.equal(postsToContactApi(html), false);
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

// ─── dist-Link-Auflösung: Pure Helpers ──────────────────────────────────────

test('detectOriginFromHtml: canonical liefert das Origin, Attribut-Reihenfolge egal', () => {
  assert.equal(
    detectOriginFromHtml('<link rel="canonical" href="https://kunde.de/agb/">'),
    'https://kunde.de',
  );
  assert.equal(
    detectOriginFromHtml('<link href="https://kunde.de/x/" rel="canonical">'),
    'https://kunde.de',
  );
  assert.equal(detectOriginFromHtml('<link rel="icon" href="https://kunde.de/f.ico">'), null);
});

test('pickDistRoot: Adapter-Build (dist/client) vs. reiner Static-Build', () => {
  // blitzsicht: output:'static' + adapter vercel() → HTML liegt in dist/client.
  // Ohne diese Weiche meldet der Guard dort JEDEN Link als tot (131 Stück).
  assert.match(pickDistRoot('/x/dist', ['client', '.vercel']), /dist\/client$/);
  // digital-direkt: HTML direkt in dist/ — 'client' darf hier nicht gewinnen.
  assert.equal(pickDistRoot('/x/dist', ['404.html', '_astro', 'agb']), '/x/dist');
  assert.equal(pickDistRoot('/x/dist', ['index.html', 'client']), '/x/dist');
});

test('normalizeUrlPath: Prozent-Encoding, Query, Fragment, NFC', () => {
  assert.equal(normalizeUrlPath('/leistungen/druck-kopierl%C3%B6sungen/'), '/leistungen/druck-kopierlösungen/');
  assert.equal(normalizeUrlPath('/suche?q=1#treffer'), '/suche');
  // NFD (o + combining diaeresis) muss zur NFC-Form werden, wie readdir sie liefert
  assert.equal(normalizeUrlPath('/öl'), '/öl');
  // kaputtes Encoding darf nicht werfen
  assert.equal(normalizeUrlPath('/50%-rabatt'), '/50%-rabatt');
});

test('distPathCandidates: directory-Format, file-Format, trailingSlash-Paar', () => {
  assert.deepEqual(distPathCandidates('/agb/'), ['agb/index.html', 'agb.html', 'agb']);
  assert.deepEqual(distPathCandidates('/agb'), ['agb/index.html', 'agb.html', 'agb']);
  assert.deepEqual(distPathCandidates('/'), ['index.html']);
});

test('resolveDistPath: Datei, Verzeichnis-Index und Asset lösen auf, Erfundenes nicht', () => {
  const files = new Set(['index.html', 'agb/index.html', '404.html', 'docs/preise.pdf']);
  assert.equal(resolveDistPath('/agb/', files), true);
  assert.equal(resolveDistPath('/agb', files), true);
  assert.equal(resolveDistPath('/404/', files), true, '.html-Fallback (Divergenz: live ist /404/ ein 404)');
  assert.equal(resolveDistPath('/docs/preise.pdf', files), true);
  assert.equal(resolveDistPath('/', files), true);
  assert.equal(resolveDistPath('/gibt-es-nicht/', files), false);
});

test('matchVercelRoute: has-konditionierter Catch-all zählt NICHT — sonst ist jeder Pfad ein Hop', () => {
  // Die www→Apex-Kanonisierung steht in 16 von 22 Kundenrepos. Wird die
  // has-Bedingung ignoriert, matcht /:path* jeden Pfad und der Guard meldet die
  // komplette Flotte als Redirect-Hop (~700 Links, gemessen 12.08.2026).
  const wwwCanonical = {
    redirects: [
      { source: '/:path*', has: [{ type: 'host', value: 'www.kunde.de' }], destination: 'https://kunde.de/:path*' },
    ],
  };
  assert.equal(matchVercelRoute('/irgendwas/', wwwCanonical), null);
  assert.equal(matchVercelRoute('/', wwwCanonical), null);
  // missing genauso
  assert.equal(
    matchVercelRoute('/x', { redirects: [{ source: '/:path*', missing: [{ type: 'cookie', key: 'a' }] }] }),
    null,
  );
});

test('matchVercelRoute: unbedingte Regeln greifen — Redirect vs. Rewrite unterschieden', () => {
  const v = {
    redirects: [{ source: '/leistungen/kopierer-leasen/', destination: '/leistungen/drucker-leasen-vs-kaufen/' }],
    rewrites: [{ source: '/masterplan/:path*', destination: 'https://cockpit.example/:path*' }],
  };
  assert.equal(matchVercelRoute('/leistungen/kopierer-leasen/', v), 'redirect');
  assert.equal(matchVercelRoute('/leistungen/kopierer-leasen', v), 'redirect', 'trailingSlash-tolerant');
  assert.equal(matchVercelRoute('/masterplan/dashboard', v), 'rewrite');
  assert.equal(matchVercelRoute('/masterplan', v), 'rewrite', ':path* erfasst auch das nackte Präfix');
  assert.equal(matchVercelRoute('/etwas-anderes/', v), null);
});

test('matchVercelRoute: :param matcht ein Segment, nicht mehrere', () => {
  const v = { redirects: [{ source: '/blog/:slug', destination: '/artikel/:slug' }] };
  assert.equal(matchVercelRoute('/blog/foo', v), 'redirect');
  assert.equal(matchVercelRoute('/blog/foo/bar', v), null);
});

test('matchVercelRoute: nicht deutbare Syntax → "unknown", nie ein geratener Treffer', () => {
  const v = { redirects: [{ source: '/produkt/:id(\\d+)', destination: '/p/:id' }] };
  assert.equal(matchVercelRoute('/produkt/42', v), 'unknown');
  assert.equal(matchVercelRoute('/ganz/woanders', v), 'unknown');
});

test('matchVercelRoute: leere/fehlende vercel.json wirft nicht', () => {
  assert.equal(matchVercelRoute('/x', {}), null);
  assert.equal(matchVercelRoute('/x', undefined), null);
});

// ─── dist-Link-Auflösung: End-to-End ────────────────────────────────────────

const PAGE = (canonical, links = []) =>
  `<!doctype html><html><head><link rel="canonical" href="${canonical}"></head>` +
  `<body>${links.map((l) => `<a href="${l}">x</a>`).join('')}</body></html>`;

/**
 * E2E-Lauf mit frei gebautem dist-Baum (statt der einen index.html von runDist).
 * @param {object} o
 * @param {Record<string,string>} o.files dist-relative Pfade → Inhalt
 * @param {object} [o.config] touchpoint-audit.config.json
 * @param {object} [o.vercel] vercel.json
 * @param {string} [o.distSub] '' oder 'client' (Adapter-Layout)
 */
function runTree({ files, config, vercel, distSub = '' }) {
  const cwd = join(tmpdir(), `cwcore-tree-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(join(cwd, 'src', 'data'), { recursive: true });
  writeFileSync(join(cwd, 'src', 'data', 'site-data.ts'), SITE_DATA);
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(cwd, 'dist', distSub, rel);
    mkdirSync(join(abs, '..'), { recursive: true });
    writeFileSync(abs, content);
  }
  if (config) writeFileSync(join(cwd, 'touchpoint-audit.config.json'), JSON.stringify(config));
  if (vercel) writeFileSync(join(cwd, 'vercel.json'), JSON.stringify(vercel));

  let code = 0;
  let out = '';
  try {
    out = execFileSync(process.execPath, [SCRIPT, '--dist', 'dist'], { cwd, encoding: 'utf-8', timeout: 10000 });
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

test('E2E Gegenbeweis digital-direkt-ops#17: Ads-URL nur per Redirect → Exit 1', () => {
  // Der reale Fall: /leistungen/kopierer-leasen/ wurde am 06.08.2026 in die
  // Vergleichsseite eingearbeitet, der Redirect gesetzt — die Ads-Soll-Liste
  // zeigte weiter auf die alte URL. Live fiel das erst nach dem Deploy auf.
  const setup = (adsUrl) => ({
    files: {
      'index.html': PAGE('https://kunde.de/'),
      'leistungen/drucker-leasen-vs-kaufen/index.html': PAGE('https://kunde.de/leistungen/drucker-leasen-vs-kaufen/'),
    },
    vercel: {
      redirects: [
        { source: '/:path*', has: [{ type: 'host', value: 'www.kunde.de' }], destination: 'https://kunde.de/:path*' },
        { source: '/leistungen/kopierer-leasen/', destination: '/leistungen/drucker-leasen-vs-kaufen/', permanent: true },
      ],
    },
    config: { distLinkChecks: 'fail', adsFinalUrls: [adsUrl] },
  });

  const rot = runTree(setup('https://kunde.de/leistungen/kopierer-leasen/'));
  assert.equal(rot.code, 1, `alte URL muss rot sein, out:\n${rot.out}`);
  assert.match(rot.out, /kopierer-leasen\/ — nur per Redirect erreichbar \(Hop\)/);

  const gruen = runTree(setup('https://kunde.de/leistungen/drucker-leasen-vs-kaufen/'));
  assert.equal(gruen.code, 0, `korrigierte URL muss grün sein, out:\n${gruen.out}`);
  assert.match(gruen.out, /drucker-leasen-vs-kaufen\/ → im dist gebaut/);
});

test('E2E: has-Catch-all allein macht keinen Link zum Hop', () => {
  const { code, out } = runTree({
    files: {
      'index.html': PAGE('https://kunde.de/', ['/agb/', '/agb', '/impressum/']),
      'agb/index.html': PAGE('https://kunde.de/agb/'),
      'impressum/index.html': PAGE('https://kunde.de/impressum/'),
    },
    vercel: {
      redirects: [
        { source: '/:path*', has: [{ type: 'host', value: 'www.kunde.de' }], destination: 'https://kunde.de/:path*' },
      ],
    },
    config: { distLinkChecks: 'fail' },
  });
  assert.equal(code, 0, `keine Befunde erwartet, out:\n${out}`);
  assert.match(out, /interne Links im dist: alle als Datei oder Rewrite auflösbar/);
});

test('E2E: has-Catch-all verfälscht die Diagnose nicht — tot bleibt tot, wird nicht zum Hop', () => {
  // Der Test darüber erreicht matchVercelRoute gar nicht: dort existieren alle
  // Dateien, judge() steigt vorher aus. Erst ein NICHT gebauter Pfad zeigt, ob
  // die has-Bedingung gelesen wird — und der Unterschied steckt allein in der
  // Meldung, nicht im Exit-Code. Ohne die doesNotMatch-Zeile wäre der Bug hier
  // unsichtbar, weil beide Varianten rot sind.
  const { code, out } = runTree({
    files: { 'index.html': PAGE('https://kunde.de/', ['/gibt-es-nicht/']) },
    vercel: {
      redirects: [
        { source: '/:path*', has: [{ type: 'host', value: 'www.kunde.de' }], destination: 'https://kunde.de/:path*' },
      ],
    },
    config: { distLinkChecks: 'fail' },
  });
  assert.equal(code, 1, `out:\n${out}`);
  assert.match(out, /gibt-es-nicht\/ — weder gebaute Datei noch Redirect\/Rewrite/);
  assert.doesNotMatch(out, /nur per Redirect erreichbar/, 'has-Bedingung wurde ignoriert — jeder Pfad wäre ein Hop');
});

test('E2E: has-Catch-all verdeckt keine echte Ads-URL-Prüfung', () => {
  // Gegenstück für Check 3: ohne has-Auswertung meldet der Guard die Ads-URL als
  // "im dist gebaut"→nein, sondern als Hop — und der Operator jagt einen Redirect,
  // den es nicht gibt.
  const { code, out } = runTree({
    files: { 'index.html': PAGE('https://kunde.de/') },
    vercel: {
      redirects: [
        { source: '/:path*', has: [{ type: 'host', value: 'www.kunde.de' }], destination: 'https://kunde.de/:path*' },
      ],
    },
    config: { distLinkChecks: 'fail', adsFinalUrls: ['https://kunde.de/kampagne/'] },
  });
  assert.equal(code, 1, `out:\n${out}`);
  assert.match(out, /Ads-Final-URL.*kampagne\/ — weder gebaute Datei noch Redirect\/Rewrite/);
});

test('E2E: toter interner Link wird gefangen, Rewrite-Ziel nicht', () => {
  const { code, out } = runTree({
    files: { 'index.html': PAGE('https://kunde.de/', ['/masterplan/dashboard', '/gibt-es-nicht/']) },
    vercel: { rewrites: [{ source: '/masterplan/:path*', destination: 'https://cockpit.example/:path*' }] },
    config: { distLinkChecks: 'fail' },
  });
  assert.equal(code, 1, `toter Link muss rot sein, out:\n${out}`);
  assert.match(out, /gibt-es-nicht\/ — weder gebaute Datei noch Redirect\/Rewrite/);
  assert.doesNotMatch(out, /masterplan/, 'externer Rewrite ist kein Befund');
});

test('E2E: Adapter-Layout dist/client wird erkannt', () => {
  const { code, out } = runTree({
    distSub: 'client',
    files: {
      'index.html': PAGE('https://kunde.de/', ['/agb/']),
      'agb/index.html': PAGE('https://kunde.de/agb/'),
    },
    config: { distLinkChecks: 'fail' },
  });
  assert.equal(code, 0, `dist/client muss gefunden werden, out:\n${out}`);
  assert.match(out, /Adapter-Build erkannt/);
});

test('E2E: Umlaut-Seite, prozent-kodiert verlinkt, ist kein Befund', () => {
  const { code, out } = runTree({
    files: {
      'index.html': PAGE('https://kunde.de/', ['/leistungen/druck-kopierl%C3%B6sungen/', '/leistungen/druck-kopierlösungen']),
      'leistungen/druck-kopierlösungen/index.html': PAGE('https://kunde.de/leistungen/druck-kopierlösungen/'),
    },
    config: { distLinkChecks: 'fail' },
  });
  assert.equal(code, 0, `beide Schreibweisen müssen auflösen, out:\n${out}`);
});

test('E2E: Default ist fail — ohne Config wird ein toter Link rot (seit v0.109.0)', () => {
  // Bis v0.108.0 war der Default 'warn'. Der Rollout zeigte 543 Links / 0
  // Befunde über die Live-Flotte, also wurde hart geflippt. Nur DD hat
  // überhaupt eine Config-Datei — ohne harten Default wäre der Check in 11 von
  // 12 Repos wirkungslos geblieben.
  const { code, out } = runTree({
    files: { 'index.html': PAGE('https://kunde.de/', ['/gibt-es-nicht/']) },
  });
  assert.equal(code, 1, `Default muss failen, out:\n${out}`);
  assert.match(out, /✗ interner Link \/gibt-es-nicht\//);
});

test('E2E: distLinkChecks="warn" gibt Repos mit Altlasten eine Schonfrist', () => {
  const { code, out } = runTree({
    files: { 'index.html': PAGE('https://kunde.de/', ['/gibt-es-nicht/']) },
    config: { distLinkChecks: 'warn' },
  });
  assert.equal(code, 0, `warn darf nicht failen, out:\n${out}`);
  assert.match(out, /⚠ interner Link \/gibt-es-nicht\//);
});

test('E2E: distLinkChecks="off" schaltet nur diese Checks ab', () => {
  const { code, out } = runTree({
    files: { 'index.html': PAGE('https://kunde.de/', ['/gibt-es-nicht/']) },
    config: { distLinkChecks: 'off' },
  });
  assert.equal(code, 0);
  assert.doesNotMatch(out, /gibt-es-nicht/);
  assert.match(out, /tel:\/mailto:\/WhatsApp-Hrefs/, 'Check 1 muss weiterlaufen');
});

test('E2E: unbekannter distLinkChecks-Wert → Exit 2, kein stiller Pass', () => {
  const { code } = runTree({
    files: { 'index.html': PAGE('https://kunde.de/') },
    config: { distLinkChecks: 'vielleicht' },
  });
  assert.equal(code, 2);
});

test('E2E: fehlende vercel.json warnt, failt aber nicht', () => {
  const { code, out } = runTree({
    files: { 'index.html': PAGE('https://kunde.de/', ['/agb/']), 'agb/index.html': PAGE('https://kunde.de/agb/') },
    config: { distLinkChecks: 'fail' },
  });
  assert.equal(code, 0, `out:\n${out}`);
  assert.match(out, /keine vercel\.json/);
});

// ─── Asset-Referenzen (blitzsicht-ops#656): Pure Helper ─────────────────────

test('extractAssetRefs: src an img/source/script/video wird erfasst', () => {
  const html = `
    <img src="/logo.webp" alt="">
    <picture><source src="/hero.avif"></picture>
    <script src="/js/nav.js"></script>
    <video src="/clip.mp4" poster="/poster.webp"></video>
    <iframe src="/eingebettet/"></iframe>`;
  const { refs } = extractAssetRefs(html, 'https://kunde.de');
  assert.deepEqual(refs.sort(), ['/clip.mp4', '/eingebettet/', '/hero.avif', '/js/nav.js', '/logo.webp']);
  // poster= ist bewusst NICHT dabei — enger Geltungsbereich, s. Doc-Kommentar.
});

test('extractAssetRefs: srcset liefert die URLs ohne Deskriptor', () => {
  const html = '<img srcset="/a.webp 400w, /b.webp 800w,/c.webp 2x" src="/a.webp">';
  const { refs } = extractAssetRefs(html, null);
  assert.deepEqual(refs.sort(), ['/a.webp', '/b.webp', '/c.webp']);
});

test('extractAssetRefs: url() im <style> zählt, new URL() im <script> NICHT', () => {
  // Die gemessene Falschpositiv-Klasse: über rohes HTML trifft der url()-Regex
  // JavaScript. 502 von 554 Treffern der Flotte waren `new URL(t.href)` &Co.
  const html = `
    <style>.hero{background:url('/bild.webp')}@font-face{src:url(/fonts/x.woff2)}</style>
    <script>const u = new URL(t.href); fetch(new URL(e, document.baseURI));</script>`;
  const { refs } = extractAssetRefs(html, null);
  assert.deepEqual(refs.sort(), ['/bild.webp', '/fonts/x.woff2']);
  assert.ok(!refs.some((r) => r.includes('href')), `JS darf nicht durchschlagen: ${refs}`);
});

test('extractAssetRefs: cssOnly liest eine ganze CSS-Datei', () => {
  const { refs } = extractAssetRefs(".stern{background:url(/star.png)}", null, { cssOnly: true });
  assert.deepEqual(refs, ['/star.png']);
});

test('extractAssetRefs: data:, protokoll-relativ und fremdes Origin fallen durch', () => {
  const html = `
    <img src="data:image/webp;base64,UklGRg==">
    <script src="//cdn.example.com/x.js"></script>
    <script src="https://challenges.cloudflare.com/turnstile/v0/api.js"></script>
    <img src="https://status.blitzsicht.com/badge.svg">
    <style>.x{background:url("data:image/svg+xml,%3Csvg%3E")}</style>`;
  const { refs } = extractAssetRefs(html, 'https://kunde.de');
  assert.deepEqual(refs, [], `nichts davon ist unsere Datei: ${refs}`);
});

test('extractAssetRefs: Laufzeit-Routen der Bildoptimierung sind keine gebauten Dateien', () => {
  const html = '<img src="/_vercel/image?url=%2F_astro%2Fx.webp&w=640&q=75"><img src="/_image?href=%2Fa.png">';
  const { refs } = extractAssetRefs(html, null);
  assert.deepEqual(refs, []);
});

test('extractAssetRefs: eigenes Origin absolut wird zum Pfad, ohne Origin bleibt root-relativ prüfbar', () => {
  const html = '<img src="https://kunde.de/logo.webp"><img src="/signet.svg">';
  assert.deepEqual(extractAssetRefs(html, 'https://kunde.de').refs.sort(), ['/logo.webp', '/signet.svg']);
  // Ohne canonical (Beleg: herztoene) fällt nur die absolute URL weg, nicht alles.
  assert.deepEqual(extractAssetRefs(html, null).refs, ['/signet.svg']);
});

test('extractAssetRefs: dokument-relative Pfade werden gezählt, nicht still geschluckt', () => {
  const { refs, skippedRelative } = extractAssetRefs('<img src="bild.webp"><img src="./x.png">', null);
  assert.deepEqual(refs, []);
  assert.equal(skippedRelative, 2);
});

test('extractAssetRefs: Fragment wird abgeschnitten', () => {
  const { refs } = extractAssetRefs('<img src="/sprite.svg#icon">', null);
  assert.deepEqual(refs, ['/sprite.svg']);
});

// ─── Asset-Referenzen: End-to-End ───────────────────────────────────────────

test('E2E Gegenbeweis blitzsicht-ops#656 (a): totes <img src> wird gefangen', () => {
  const rot = runTree({
    files: { 'index.html': PAGE('https://kunde.de/').replace('<body>', '<body><img src="/gibt-es-nicht.png">') },
    config: { assetRefChecks: 'fail' },
  });
  assert.equal(rot.code, 1, `out:\n${rot.out}`);
  assert.match(rot.out, /Asset-Referenz \/gibt-es-nicht\.png/);

  const gruen = runTree({
    files: {
      'index.html': PAGE('https://kunde.de/').replace('<body>', '<body><img src="/gibt-es.png">'),
      'gibt-es.png': 'PNG',
    },
    config: { assetRefChecks: 'fail' },
  });
  assert.equal(gruen.code, 0, `grüner Zweig muss erreichbar bleiben, out:\n${gruen.out}`);
  assert.match(gruen.out, /Asset-Referenzen im dist/);
});

test('E2E Gegenbeweis blitzsicht-ops#656 (b): allstargirls — url(/star.png) in einer CSS-Datei', () => {
  // Realer Fall: optimize-images.mjs --delete-originals macht aus star.png ein
  // star.webp, der CSS-Verweis blieb auf .png. Lief bei JEDEM Build in einen 404.
  const files = (vorhanden) => ({
    'index.html': PAGE('https://kunde.de/').replace('<head>', '<head><link rel="stylesheet" href="/_astro/index.css">'),
    '_astro/index.css': '.stern{background-image:url(/star.png)}',
    ...(vorhanden ? { 'star.png': 'PNG' } : { 'star.webp': 'WEBP' }),
  });

  const rot = runTree({ files: files(false), config: { assetRefChecks: 'fail' } });
  assert.equal(rot.code, 1, `out:\n${rot.out}`);
  assert.match(rot.out, /Asset-Referenz \/star\.png/);
  assert.match(rot.out, /_astro\/index\.css/, 'Fundstelle muss die CSS-Datei nennen');

  const gruen = runTree({ files: files(true), config: { assetRefChecks: 'fail' } });
  assert.equal(gruen.code, 0, `out:\n${gruen.out}`);
});

test('E2E Gegenbeweis blitzsicht-ops#656 (c): blumen-schmid — .png verlinkt, nur .webp gebaut', () => {
  const { code, out } = runTree({
    files: {
      'index.html': PAGE('https://kunde.de/').replace('<body>', '<body><img src="/signet-white.png" alt="Logo">'),
      'signet-white.webp': 'WEBP',
    },
    config: { assetRefChecks: 'fail' },
  });
  assert.equal(code, 1, `out:\n${out}`);
  assert.match(out, /Asset-Referenz \/signet-white\.png/);
});

test('E2E: Plausible-Proxy /js/script.js lebt per Rewrite — kein Befund', () => {
  // Das einzige per Rewrite (statt als Datei) bediente Asset der Flotte,
  // in 12 von 13 Live-Repos referenziert. Ein Befund hier wäre flottenweit.
  const { code, out } = runTree({
    files: { 'index.html': PAGE('https://kunde.de/').replace('<body>', '<body><script src="/js/script.js"></script>') },
    vercel: { rewrites: [{ source: '/js/script.js', destination: 'https://plausible.io/js/script.js' }] },
    config: { assetRefChecks: 'fail' },
  });
  assert.equal(code, 0, `out:\n${out}`);
  assert.doesNotMatch(out, /Asset-Referenz \/js\/script\.js/);
});

test('E2E: assetRefChecks — Default warn, "fail" rot, "off" still, Unsinn → Exit 2', () => {
  const files = { 'index.html': PAGE('https://kunde.de/').replace('<body>', '<body><img src="/fehlt.png">') };

  const std = runTree({ files });
  assert.equal(std.code, 0, `Default ist warn, out:\n${std.out}`);
  assert.match(std.out, /⚠ Asset-Referenz \/fehlt\.png/);

  assert.equal(runTree({ files, config: { assetRefChecks: 'fail' } }).code, 1);

  const aus = runTree({ files, config: { assetRefChecks: 'off' } });
  assert.equal(aus.code, 0);
  assert.doesNotMatch(aus.out, /fehlt\.png/);

  assert.equal(runTree({ files, config: { assetRefChecks: 'vielleicht' } }).code, 2);
});

test('E2E: assetRefChecks läuft auch, wenn distLinkChecks="off"', () => {
  const { code, out } = runTree({
    files: {
      'index.html': PAGE('https://kunde.de/', ['/toter-link/']).replace('<body>', '<body><img src="/fehlt.png">'),
    },
    config: { distLinkChecks: 'off', assetRefChecks: 'fail' },
  });
  assert.equal(code, 1, `out:\n${out}`);
  assert.match(out, /Asset-Referenz \/fehlt\.png/);
  assert.doesNotMatch(out, /interner Link \/toter-link/, 'Link-Check bleibt abgeschaltet');
});

test('E2E: Asset-Prüfung braucht kein <link rel="canonical">', () => {
  // Ohne canonical fällt der Link-Check aus (Beleg: herztoene). Die Asset-Refs
  // sind root-relativ und müssen trotzdem geprüft werden.
  const { code, out } = runTree({
    files: { 'index.html': '<!doctype html><html><body><img src="/fehlt.png"></body></html>' },
    config: { assetRefChecks: 'fail' },
  });
  assert.equal(code, 1, `out:\n${out}`);
  assert.match(out, /Asset-Referenz \/fehlt\.png/);
});

test('E2E: Zählwert steht auch dann im Log, wenn es Befunde gibt', () => {
  // Stand die Zahl nur im sauberen Fall, sähe ein Repo mit einem Befund im CI-Log
  // aus wie eines, in dem der Check gar nicht lief. „NICHT GEPRÜFT" und „geprüft,
  // was gefunden" müssen unterscheidbar bleiben — sonst ist die Flottenmessung,
  // die den Flip auf "fail" begründen soll, nicht auswertbar.
  const mitBefund = runTree({
    files: {
      'index.html': PAGE('https://kunde.de/', ['/toter-link/']).replace('<body>', '<body><img src="/fehlt.png">'),
    },
    config: { distLinkChecks: 'warn', assetRefChecks: 'warn' },
  });
  assert.match(mitBefund.out, /\d+ Asset-Referenzen im dist \(\d+ CSS-Datei\(en\) mitgelesen\) — 1 davon nicht auflösbar/);
  assert.match(mitBefund.out, /\d+ interne Links im dist geprüft — 1 davon nicht auflösbar/);

  const sauber = runTree({
    files: {
      'index.html': PAGE('https://kunde.de/', ['/da/']).replace('<body>', '<body><img src="/da.png">'),
      'da/index.html': PAGE('https://kunde.de/da/'),
      'da.png': 'PNG',
    },
    config: { distLinkChecks: 'warn', assetRefChecks: 'warn' },
  });
  assert.match(sauber.out, /Asset-Referenzen im dist .*: alle auflösbar/);
  assert.match(sauber.out, /interne Links im dist: alle als Datei oder Rewrite auflösbar/);
});

test('E2E: Fragment-Strip — /kontakt#formular wird endlich geprüft', () => {
  // Bis v0.110.0 liess `[^"'#]+` den Match scheitern: der Link blieb unsichtbar.
  const rot = runTree({
    files: { 'index.html': PAGE('https://kunde.de/', ['/kontakt#formular']) },
    config: { distLinkChecks: 'fail' },
  });
  assert.equal(rot.code, 1, `out:\n${rot.out}`);
  assert.match(rot.out, /interner Link \/kontakt /);

  const gruen = runTree({
    files: {
      'index.html': PAGE('https://kunde.de/', ['/kontakt#formular', '#nur-anker']),
      'kontakt/index.html': PAGE('https://kunde.de/kontakt/'),
    },
    config: { distLinkChecks: 'fail' },
  });
  assert.equal(gruen.code, 0, `reiner Anker darf nichts auslösen, out:\n${gruen.out}`);
});
