// @ts-check
/**
 * E-Mail-Signatur: Kunden-Layout (`layout: 'kunde'`) und Bytegleichheit der
 * eingebauten Layouts a/b.
 *
 * Anlass: Elektrotechnik Mika GmbH will ihre Signaturen nach einer
 * Agenturvorlage. Statt Kundendesign in cw-core zu gießen, bringt das
 * Kundenrepo eine eigene Vorlage mit
 * (`email-signatures/_layout/PERSON.html.template`), die Daten kommen weiter
 * aus `src/data/site-data.ts`.
 *
 * Die Tests fahren die echten Skripte (`regenerate-all.sh`, `generate.sh`,
 * `read-customer-data.py`) gegen Fixture-Kunden in einem frischen
 * `CUSTOMER_ROOT` unter dem Temp-Verzeichnis — so, wie der Operator sie
 * aufruft. Kein Nachbau der Logik in JavaScript.
 *
 * Bytegleichheit: Die Referenzausgabe unter
 * `tests/fixtures/email-signature/golden/` wurde mit den Skripten VOR dem
 * Kunden-Layout erzeugt (Basis 41192995, per `git archive` nach /tmp geholt):
 *
 *   SIGNATUR_SKRIPTE=/tmp/…/templates/email-signature SIGNATUR_GOLDEN_SCHREIBEN=1 \
 *     node --test --test-name-pattern=Bytegleichheit tests/email-signature/signatur-kunden-layout.test.js
 *
 * Ändert jemand Layout a oder b absichtlich, wird die Referenz mit demselben
 * Aufruf ohne `SIGNATUR_SKRIPTE` neu geschrieben — und der Diff gehört in den PR.
 * Normalisiert werden nur das Erzeugungsdatum im README und der Cache-Hash von
 * install.css in der Installationsseite; alles andere wird Byte für Byte verglichen.
 * Die Logo-PNGs vergleicht der Test nicht: ImageMagick schreibt Zeitstempel hinein.
 */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  mkdtempSync, cpSync, rmSync, readFileSync, writeFileSync, existsSync, readdirSync,
  statSync, mkdirSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SKRIPTE = process.env.SIGNATUR_SKRIPTE ?? join(REPO, 'templates', 'email-signature');
const FIXTURES = join(REPO, 'tests', 'fixtures', 'email-signature');
const KUNDEN = join(FIXTURES, 'kunden');
const GOLDEN = join(FIXTURES, 'golden');
const GOLDEN_SCHREIBEN = process.env.SIGNATUR_GOLDEN_SCHREIBEN === '1';
const README = join(REPO, 'templates', 'email-signature', 'README.md');

const KUNDE = 'customer-fixture-kunde';
const KUNDE_SLUG = 'erika-fixture';
const VORLAGE_REL = join('email-signatures', '_layout', 'PERSON.html.template');

/** @type {string[]} */
const tempOrdner = [];
after(() => {
  for (const o of tempOrdner) rmSync(o, { recursive: true, force: true });
});

/** Variablen aus der Shell des Aufrufers, die einen Lauf verfälschen könnten. */
const FREMDE_VARIABLEN = [
  'CUSTOMER_ROOT', 'ONLY_CUSTOMER', 'ONLY_SLUG', 'MAIL_OUT', 'REGISTRY_PATH', 'LAYOUT',
  'OUT_DIR', 'EXPLICIT_SLUG', 'PHOTO_URL', 'PHOTO_ALT', 'TEMPLATE_HTML_KUNDE', 'ANIMATION_EFFECT',
  'LOGO_SVG_DARK', 'LOGO_URL_LIGHT', 'LOGO_URL_DARK', 'VCARD_PUBLIC_URL', 'BOOKING_URL',
  'GOOGLE_REVIEW_URL', 'TRUST_BADGES_JSON', 'CONFIDENTIALITY_NOTE', 'REPRESENTATIVES',
];

/** @param {Record<string, string>} extra */
function sauberesEnv(extra) {
  /** @type {Record<string, string>} */
  const env = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined && !FREMDE_VARIABLEN.includes(k)) env[k] = v;
  }
  return { ...env, ...extra };
}

/**
 * Legt einen frischen CUSTOMER_ROOT an und kopiert die genannten Fixture-Kunden hinein.
 * @param {string[]} kunden
 */
function kundenRoot(kunden) {
  const root = mkdtempSync(join(tmpdir(), 'cw-sig-test-'));
  tempOrdner.push(root);
  for (const k of kunden) cpSync(join(KUNDEN, k), join(root, k), { recursive: true });
  return root;
}

/**
 * Fährt regenerate-all.sh wie der Operator, aber gegen den Temp-Root.
 * @param {string} root
 * @param {string} nurKunde
 */
function regenerieren(root, nurKunde) {
  const r = spawnSync('bash', [join(SKRIPTE, 'regenerate-all.sh')], {
    encoding: 'utf8',
    env: sauberesEnv({
      CUSTOMER_ROOT: root,
      ONLY_CUSTOMER: nurKunde,
      MAIL_OUT: join(root, '_mail'),
      REGISTRY_PATH: join(root, 'keine-registry.json'),
    }),
    timeout: 120_000,
  });
  return { status: r.status, ausgabe: `${r.stdout ?? ''}${r.stderr ?? ''}`, stderr: r.stderr ?? '' };
}

/**
 * Ruft generate.sh direkt auf (ohne regenerate-all.sh), mit Fixture-Daten.
 * @param {string} kundenDir
 * @param {Record<string, string>} extra
 */
function generieren(kundenDir, extra) {
  const r = spawnSync('bash', [join(SKRIPTE, 'generate.sh')], {
    encoding: 'utf8',
    env: sauberesEnv({
      NAME: 'Erika Fixture',
      POSITION: 'Geschäftsführerin',
      EMAIL: 'erika@fixture-elektro.example',
      PHONE: '+49 151 1234567',
      WEBSITE_URL: 'fixture-elektro.example',
      COMPANY_NAME: 'Fixture Elektro',
      LEGAL_FORM: 'GmbH',
      STREET: 'Musterstraße 7',
      ZIP_CITY: '93047 Regensburg',
      LOGO_SVG: join(kundenDir, 'public', 'logo.png'),
      LOGO_URL: 'https://fixture-elektro.example/email/logo.png',
      EXPLICIT_SLUG: KUNDE_SLUG,
      OUT_DIR: join(kundenDir, 'email-signatures', KUNDE_SLUG),
      ...extra,
    }),
    timeout: 120_000,
  });
  return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

/** @param {string} dir @returns {string[]} */
function dateienUnter(dir) {
  if (!existsSync(dir)) return [];
  /** @type {string[]} */
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...dateienUnter(p));
    else out.push(p);
  }
  return out;
}

/** @param {string} pfad */
const lesen = (pfad) => readFileSync(pfad, 'utf8');

const sigDatei = (/** @type {string} */ root, /** @type {string} */ ext) =>
  join(root, KUNDE, 'email-signatures', KUNDE_SLUG, `${KUNDE_SLUG}.${ext}`);

// Ein Lauf für den Normalfall, den mehrere Tests lesen.
/** @type {{ root: string, lauf: ReturnType<typeof regenerieren> } | undefined} */
let normalfall;
function kundeNormalfall() {
  if (!normalfall) {
    const root = kundenRoot([KUNDE]);
    normalfall = { root, lauf: regenerieren(root, KUNDE) };
  }
  return normalfall;
}

test('Vorbedingung: bash, jq und python3 sind vorhanden', () => {
  // Ohne die drei läuft regenerate-all.sh nicht. Fehlen sie, wird der Test rot statt still übersprungen.
  for (const werkzeug of ['bash', 'jq', 'python3']) {
    const r = spawnSync(werkzeug, ['--version'], { encoding: 'utf8' });
    assert.equal(r.status, 0, `${werkzeug} fehlt oder startet nicht`);
  }
  assert.ok(existsSync(join(KUNDEN, KUNDE, VORLAGE_REL)), 'Fixture-Vorlage fehlt');
});

test('layout kunde: regenerate-all.sh erzeugt das HTML aus der Kundenvorlage, alle Platzhalter ersetzt', () => {
  const { root, lauf } = kundeNormalfall();
  assert.equal(lauf.status, 0, lauf.ausgabe);

  const html = lesen(sigDatei(root, 'html'));
  // Die Vorlage des Kunden wurde benutzt, nicht Layout a/b/auto.
  assert.ok(html.includes('data-vorlage="fixture-kunde"'), 'Marker der Kundenvorlage fehlt — eingebautes Layout gegriffen?');
  assert.ok(!html.includes('class="esig-name"'), 'eingebautes Layout im Ergebnis');
  assert.doesNotMatch(html, /\{\{|\}\}/, 'Platzhalter-Reste im HTML');

  const erwartet = [
    'src="https://fixture-elektro.example/email/erika.png"', // {{PHOTO_URL}}
    'alt="Erika Fixture"', // {{PHOTO_ALT}}
    '>Erika Fixture</p>', // {{NAME}}
    '>Geschäftsführerin & Meisterin</p>', // {{POSITION}}
    'href="tel:+49 151 1234567"', // {{PHONE}} (Person, nicht legal.phone)
    'href="mailto:erika@fixture-elektro.example"', // {{EMAIL}}
    'utm_campaign=erika-fixture-web', // {{WEBSITE_FULL}}
    '>fixture-elektro.example</a>', // {{WEBSITE_URL}}
    'color:#0a3d62', // {{COLOR_PRIMARY}} aus tokens.css
    'color:#f39c12', // {{COLOR_ACCENT}}
    'src="https://fixture-elektro.example/email/logo-light.png"', // {{LOGO_URL_LIGHT}}
    'dunkle Variante: https://fixture-elektro.example/email/logo-dark.png', // {{LOGO_URL_DARK}}
    'Rückfall: https://fixture-elektro.example/email/logo.png', // {{LOGO_URL}}
    'Marke: Fixture Elektro -->', // {{COMPANY_NAME}}
    'alt="Fixture Elektro"', // {{LOGO_ALT}}
    'Fixture Elektro GmbH (GmbH) · Musterstraße 7 · 93047 Regensburg<br>', // {{COMPANY_LEGAL_NAME}} {{LEGAL_FORM}} {{STREET}} {{ZIP}} {{CITY}}
    'Geschäftsführung: Erika Fixture, Max Fixture · Sitz: 93047 Regensburg', // {{REPRESENTATIVES}} {{ZIP_CITY}}
    'Registergericht: Amtsgericht Regensburg · HRB Nr. 12345 · (HRB 12345)', // {{REGISTERGERICHT}} {{REGISTER_ART}} {{REGISTER_NR}} {{HRB}}
    'USt-IdNr.: DE123456789', // {{UST_ID}}
    'Hinweis: Diese E-Mail', // {{CONFIDENTIALITY_NOTE}}
    'width="110" height="110"', // {{PHOTO_BLOCK}} (eingebauter Block, weiter verfügbar)
    'GF: Erika Fixture, Max Fixture', // {{COMPLIANCE_BLOCK}}
    'Kontakt speichern (vCard)', // {{EXTRAS_BLOCK}}
  ];
  for (const e of erwartet) assert.ok(html.includes(e), `fehlt im HTML: ${e}`);

  // Erzeugte Dateien zählen — ein Lauf ohne Ausgabe darf nicht grün sein.
  const erzeugt = [
    ...dateienUnter(join(root, KUNDE, 'email-signatures', KUNDE_SLUG)),
    ...dateienUnter(join(root, KUNDE, 'public', 'email')),
  ];
  assert.ok(erzeugt.length > 0, 'keine Dateien erzeugt');
  assert.ok(erzeugt.length >= 10, `nur ${erzeugt.length} Dateien erzeugt: ${erzeugt.join(', ')}`);

  // Keine Textdatei der Ausgabe trägt einen Platzhalter-Rest.
  for (const d of erzeugt.filter((p) => /\.(html|txt|vcf|md)$/.test(p))) {
    assert.doesNotMatch(lesen(d), /\{\{[A-Z0-9_]+\}\}/, `Platzhalter-Rest in ${relative(root, d)}`);
  }
  assert.equal(
    lesen(join(root, KUNDE, 'public', 'email', `${KUNDE_SLUG}.html`)),
    html,
    'public/email/<slug>.html weicht von der Signatur ab',
  );
});

test('layout kunde: Textfassung und vCard kommen aus den Daten, nicht aus der Vorlage', () => {
  const { root, lauf } = kundeNormalfall();
  assert.equal(lauf.status, 0, lauf.ausgabe);
  // Sonst prüfte der Test ein eingebautes Layout, dessen vCard ohnehin stimmt.
  assert.ok(lesen(sigDatei(root, 'html')).includes('data-vorlage="fixture-kunde"'), 'Kundenvorlage nicht benutzt');

  const txt = lesen(sigDatei(root, 'txt'));
  for (const e of ['Erika Fixture', 'Geschäftsführerin & Meisterin', 'Fixture Elektro', 'Amtsgericht Regensburg · HRB 12345', 'USt-IdNr.: DE123456789']) {
    assert.ok(txt.includes(e), `fehlt im TXT: ${e}`);
  }

  // Die eingebauten Layouts lesen die vCard aus den esig-*-Klassen ihres HTML.
  // Eine Kundenvorlage hat diese Klassen nicht — die vCard muss trotzdem vollständig sein.
  const vcf = lesen(sigDatei(root, 'vcf'));
  for (const e of [
    'FN:Erika Fixture',
    'ORG:Fixture Elektro',
    'TITLE:Geschäftsführerin & Meisterin',
    'TEL;TYPE=WORK,VOICE:+49 151 1234567',
    'EMAIL;TYPE=WORK:erika@fixture-elektro.example',
    'URL:https://fixture-elektro.example?utm_source=email-signature&utm_medium=email&utm_campaign=erika-fixture-web',
  ]) {
    assert.ok(vcf.includes(`${e}\n`), `fehlt in der vCard: ${e}\n---\n${vcf}`);
  }
  assert.equal(lesen(join(root, KUNDE, 'public', 'email', `${KUNDE_SLUG}.vcf`)), vcf);
});

test('layout kunde ohne Vorlage: harter Abbruch mit Exit ≠ 0, kein HTML', () => {
  const root = kundenRoot([KUNDE]);
  rmSync(join(root, KUNDE, 'email-signatures', '_layout'), { recursive: true });

  const lauf = regenerieren(root, KUNDE);
  assert.notEqual(lauf.status, 0, `regenerate-all.sh endete mit 0:\n${lauf.ausgabe}`);
  assert.match(lauf.ausgabe, /_layout\/PERSON\.html\.template/, 'Meldung nennt den Pfad der Vorlage nicht');
  assert.ok(!existsSync(sigDatei(root, 'html')), 'HTML trotz fehlender Vorlage erzeugt');

  // generate.sh direkt: dieselbe Regel, Meldung auf stderr, kein Rückfall auf ein eingebautes Layout.
  const direkt = generieren(join(root, KUNDE), { LAYOUT: 'kunde' });
  assert.notEqual(direkt.status, 0, `generate.sh endete mit 0:\n${direkt.stdout}${direkt.stderr}`);
  assert.match(direkt.stderr, /PERSON\.html\.template/);
  assert.doesNotMatch(direkt.stdout, /Layout: [AB]/, 'stiller Rückfall auf ein eingebautes Layout');
  assert.ok(!existsSync(sigDatei(root, 'html')), 'HTML trotz fehlender Vorlage erzeugt (direkt)');
});

test('layout kunde mit Lücken in site-data: Platzhalter leer ersetzt, je Lücke eine Warnung', () => {
  const root = kundenRoot([KUNDE]);
  const sd = join(root, KUNDE, 'src', 'data', 'site-data.ts');
  const ohne = lesen(sd)
    .split('\n')
    .filter((z) => !/^\s*(ustIdNr|representatives|photo):/.test(z))
    .join('\n');
  assert.notEqual(ohne, lesen(sd), 'Fixture nicht verändert — Probe wäre leer');
  writeFileSync(sd, ohne);

  const lauf = regenerieren(root, KUNDE);
  assert.equal(lauf.status, 0, lauf.ausgabe);
  const html = lesen(sigDatei(root, 'html'));
  assert.doesNotMatch(html, /\{\{|\}\}/, 'Platzhalter-Rest trotz leerem Wert');
  for (const p of ['UST_ID', 'REPRESENTATIVES', 'PHOTO_URL']) {
    assert.match(lauf.ausgabe, new RegExp(`⚠[^\\n]*\\{\\{${p}\\}\\}`), `keine Warnung für {{${p}}}:\n${lauf.ausgabe}`);
  }
  // Gegenprobe: gefüllte Platzhalter melden nichts.
  assert.doesNotMatch(lauf.ausgabe, /⚠[^\n]*\{\{REGISTER_NR\}\}/);
  assert.ok(html.includes('src="" alt="Erika Fixture"'), 'leeres PHOTO_URL nicht leer ersetzt');
  assert.match(html, /Geschäftsführung:  · Sitz:/);
  assert.match(html, /USt-IdNr\.: \n/);
});

test('layout kunde: unbekannter Platzhalter in der Vorlage bricht mit seinem Namen ab', () => {
  const root = kundenRoot([KUNDE]);
  const vorlage = join(root, KUNDE, VORLAGE_REL);
  writeFileSync(vorlage, lesen(vorlage).replace('{{REGISTER_NR}}', '{{REGISTER_NUMMER}}'));

  const lauf = regenerieren(root, KUNDE);
  assert.notEqual(lauf.status, 0, lauf.ausgabe);
  assert.match(lauf.ausgabe, /REGISTER_NUMMER/);
  assert.ok(!existsSync(sigDatei(root, 'html')), 'HTML mit unbekanntem Platzhalter erzeugt');
});

test('unbekanntes Layout: sichtbare Warnung auf stderr, der Rückfall auf auto bleibt', () => {
  const root = kundenRoot([KUNDE]);
  const kundenDir = join(root, KUNDE);

  const unbekannt = generieren(kundenDir, { LAYOUT: 'c' });
  assert.equal(unbekannt.status, 0, unbekannt.stderr);
  assert.match(unbekannt.stderr, /⚠[^\n]*Layout[^\n]*'c'/, `keine Warnung auf stderr:\n${unbekannt.stderr}`);
  assert.ok(lesen(sigDatei(root, 'html')).includes('class="esig-name"'), 'Rückfall auf ein eingebautes Layout fehlt');

  // Gegenprobe: ein bekanntes Layout warnt nicht.
  const bekannt = generieren(kundenDir, { LAYOUT: 'a' });
  assert.equal(bekannt.status, 0, bekannt.stderr);
  assert.doesNotMatch(bekannt.stderr, /Layout/, `Warnung bei bekanntem Layout:\n${bekannt.stderr}`);
});

test('CUSTOMER_ROOT-Falle: leerer Root und unbekannter ONLY_CUSTOMER enden mit Exit ≠ 0 statt „DONE — 0“', () => {
  const leer = kundenRoot([]);
  const ohneKunden = regenerieren(leer, '');
  assert.notEqual(ohneKunden.status, 0, ohneKunden.ausgabe);
  assert.match(ohneKunden.ausgabe, /Keine customer-\*-Ordner/);

  const root = kundenRoot([KUNDE]);
  const falsch = regenerieren(root, 'customer-gibt-es-nicht');
  assert.notEqual(falsch.status, 0, falsch.ausgabe);
  assert.match(falsch.ausgabe, /ONLY_CUSTOMER=customer-gibt-es-nicht nicht gefunden/);
  assert.equal(dateienUnter(join(root, KUNDE, 'public')).filter((p) => p.includes('/email/')).length, 0, 'trotzdem etwas erzeugt');
});

test('CUSTOMER_ROOT über einen Symlink-Ordner (Kundenrepo im Worktree) erzeugt die Signatur im Ziel', () => {
  // Muster aus dem README: Der Kunde liegt unter einem wt-…-Namen, ein Symlink gibt ihm den customer-Namen.
  const worktrees = mkdtempSync(join(tmpdir(), 'cw-sig-wt-'));
  tempOrdner.push(worktrees);
  const ziel = join(worktrees, 'wt-signatur');
  cpSync(join(KUNDEN, KUNDE), ziel, { recursive: true });
  const root = kundenRoot([]);
  const ln = spawnSync('ln', ['-s', ziel, join(root, KUNDE)], { encoding: 'utf8' });
  assert.equal(ln.status, 0, ln.stderr);

  const lauf = regenerieren(root, KUNDE);
  assert.equal(lauf.status, 0, lauf.ausgabe);
  const html = join(ziel, 'email-signatures', KUNDE_SLUG, `${KUNDE_SLUG}.html`);
  assert.ok(existsSync(html), 'Signatur nicht im Ziel des Symlinks');
  assert.ok(lesen(html).includes('data-vorlage="fixture-kunde"'));
  assert.ok(existsSync(join(ziel, 'public', 'email', `${KUNDE_SLUG}-install.html`)), 'public/email nicht im Ziel');
});

test('Platzhalterliste: README nennt jeden Platzhalter, die Fixture-Vorlage benutzt jeden', () => {
  const r = spawnSync('python3', [join(SKRIPTE, 'render-kunden-vorlage.py'), '--liste'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const namen = r.stdout.split('\n').map((z) => z.split('\t')[0].trim()).filter(Boolean);
  assert.ok(namen.length >= 31, `nur ${namen.length} Platzhalter: ${namen.join(', ')}`);
  for (const pflicht of [
    'PHOTO_URL', 'REGISTERGERICHT', 'REGISTER_ART', 'REGISTER_NR', 'HRB', 'REPRESENTATIVES',
    'STREET', 'ZIP', 'CITY', 'COMPANY_LEGAL_NAME', 'NAME', 'PHOTO_BLOCK', 'COMPLIANCE_BLOCK',
  ]) {
    assert.ok(namen.includes(pflicht), `Platzhalter ${pflicht} fehlt in der Liste`);
  }
  const readme = lesen(README);
  const vorlage = lesen(join(KUNDEN, KUNDE, VORLAGE_REL));
  for (const n of namen) {
    assert.ok(readme.includes(`{{${n}}}`), `README nennt {{${n}}} nicht`);
    assert.ok(vorlage.includes(`{{${n}}}`), `Fixture-Vorlage benutzt {{${n}}} nicht — Ersetzung ungeprüft`);
  }
});

/**
 * Liest die Exporte von read-customer-data.py für eine site-data.ts.
 * @param {string} siteData
 */
function kundendaten(siteData) {
  const dir = mkdtempSync(join(tmpdir(), 'cw-sig-daten-'));
  tempOrdner.push(dir);
  mkdirSync(join(dir, 'src', 'data'), { recursive: true });
  writeFileSync(join(dir, 'src', 'data', 'site-data.ts'), siteData);
  const r = spawnSync('python3', [join(SKRIPTE, 'read-customer-data.py'), dir], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  /** @type {Record<string, string>} */
  const werte = {};
  for (const z of r.stdout.split('\n')) {
    const m = z.match(/^export ([A-Z_]+)="(.*)"$/);
    if (m) werte[m[1]] = m[2].replace(/\\(["`$])/g, '$1');
  }
  return werte;
}

test('read-customer-data.py: Registerangabe getrennt, Adresse einzeln, Firmenname mit Rechtsform', () => {
  const faelle = [
    {
      name: 'englische Schreibweise mit Präfix (wie Mika)',
      legal: "form: 'GmbH', owner: 'Mika Test GmbH', zip: '92444', city: 'Rötz', registerCourt: 'Amtsgericht Regensburg', registerNumber: 'HRB 21336', register: 'hrb' as const,",
      firma: 'Mika Test',
      erwartet: { HRB: 'HRB 21336', REGISTER_ART: 'HRB', REGISTER_NR: '21336', REGISTERGERICHT: 'Amtsgericht Regensburg', ZIP: '92444', CITY: 'Rötz', COMPANY_LEGAL_NAME: 'Mika Test GmbH' },
    },
    {
      name: 'deutsche Schreibweise nur Ziffern',
      legal: "form: 'GmbH & Co. KG', register: 'hra', registerNummer: '7788', registergericht: 'Amtsgericht Regensburg',",
      firma: 'Bau Test',
      erwartet: { HRB: 'HRA 7788', REGISTER_ART: 'HRA', REGISTER_NR: '7788', COMPANY_LEGAL_NAME: 'Bau Test GmbH & Co. KG' },
    },
    {
      name: 'handelsregister mit Zusatz',
      legal: "form: 'AG', handelsregister: 'HRB 999 B',",
      firma: 'Zusatz Test AG',
      erwartet: { REGISTER_ART: 'HRB', REGISTER_NR: '999 B', COMPANY_LEGAL_NAME: 'Zusatz Test AG' },
    },
    {
      name: 'Einzelunternehmen ohne Register',
      legal: "form: 'Einzelunternehmen', owner: 'Max Muster', zip: '93047', city: 'Regensburg',",
      firma: 'Muster Bau',
      erwartet: { HRB: '', REGISTER_ART: '', REGISTER_NR: '', COMPANY_LEGAL_NAME: 'Muster Bau', ZIP: '93047', CITY: 'Regensburg' },
    },
    {
      name: 'keine Rechtsform gepflegt',
      legal: "street: 'Weg 1',",
      firma: 'Ohne Form',
      erwartet: { LEGAL_FORM: '', COMPANY_LEGAL_NAME: 'Ohne Form', ZIP: '', CITY: '' },
    },
  ];
  for (const f of faelle) {
    const werte = kundendaten(`export const siteData = {\n  name: '${f.firma}',\n  url: 'https://x.example',\n  legal: { ${f.legal} },\n};\n`);
    for (const [k, v] of Object.entries(f.erwartet)) {
      assert.equal(werte[k], v, `${f.name}: ${k}`);
    }
  }
});

// ── Bytegleichheit der eingebauten Layouts ───────────────────────────────────

/** Was verglichen wird: die Textausgaben je Person, nicht die PNGs und nicht install.css (Kopie). */
const VERGLEICH = /(^email-signatures\/[^/]+\/[^/]+\.(html|txt|vcf)$)|(^email-signatures\/[^/]+\/README\.md$)|(^public\/email\/[^/]+\.(html|vcf)$)/;

/** @param {string} rel @param {string} inhalt */
function normalisieren(rel, inhalt) {
  let t = inhalt;
  if (rel.endsWith('README.md')) t = t.replace(/^Generiert \d{4}-\d{2}-\d{2} /m, 'Generiert <DATUM> ');
  if (rel.endsWith('-install.html')) t = t.replace(/install\.css\?v=[0-9a-f]{8}/g, 'install.css?v=<HASH>');
  return t;
}

for (const kunde of ['customer-fixture-layout-a', 'customer-fixture-layout-b']) {
  test(`Bytegleichheit: ${kunde} erzeugt dieselben Dateien wie vor dem Kunden-Layout`, () => {
    const root = kundenRoot([kunde]);
    const lauf = regenerieren(root, kunde);
    assert.equal(lauf.status, 0, lauf.ausgabe);

    const kundenDir = join(root, kunde);
    const ist = dateienUnter(kundenDir)
      .map((p) => relative(kundenDir, p).split('\\').join('/'))
      .filter((rel) => VERGLEICH.test(rel))
      .sort();
    assert.ok(ist.length >= 5, `nur ${ist.length} vergleichbare Dateien: ${ist.join(', ')}`);

    const referenz = join(GOLDEN, kunde);
    if (GOLDEN_SCHREIBEN) {
      rmSync(referenz, { recursive: true, force: true });
      for (const rel of ist) {
        const ziel = join(referenz, rel);
        mkdirSync(dirname(ziel), { recursive: true });
        writeFileSync(ziel, normalisieren(rel, lesen(join(kundenDir, rel))));
      }
      return;
    }

    const soll = dateienUnter(referenz).map((p) => relative(referenz, p).split('\\').join('/')).sort();
    assert.ok(soll.length > 0, `keine Referenz unter ${referenz}`);
    assert.deepEqual(ist, soll, 'andere Dateimenge als die Referenz');
    for (const rel of ist) {
      const a = normalisieren(rel, lesen(join(kundenDir, rel)));
      const b = lesen(join(referenz, rel));
      assert.ok(a === b, `${kunde}/${rel} weicht von der Referenz ab`);
    }
  });
}
