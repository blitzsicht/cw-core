// @ts-check
/**
 * Tests fuer den Impressum-Rechtsform-Guard in ai-discovery (lintImpressumLegalForm).
 *
 * Lauf: `node --test tests/ai-discovery/impressum-linter.test.js`
 * Oder ueber Skript: `pnpm test`
 *
 * Ausloeser (2026-06-21): customer-gottl-richter-gomeier (eGbR) hatte owner=Privatperson
 * ('Gottl Reiner') und die Firma nur im `company`-Feld, das ImpressumBlock damals nie
 * renderte → das Impressum nannte keine Firma/Rechtsform (§5 DDG-Mangel). Zusaetzlich
 * fehlte die GnR-Nummer (eingetragene GbR ohne Registereintrag).
 *
 * Abdeckung:
 *   1. Einzelunternehmer → keine Issues
 *   2. GmbH mit firmiertem owner + registerNummer → keine Issues (wie die 8 GmbH-Customer)
 *   3. GmbH ohne company + Privatperson-owner → Issue (Firma fehlt)
 *   4. NEGATIV-TEST echter Bug: eGbR mit company aber ohne registerNumber → Register-Issue
 *   5. eGbR vollstaendig (company + registerNumber) → keine Issues
 *   6. Kein rechtsform-Feld → keine Issues (Guard inaktiv)
 *   7. GbR Privatperson-owner + register=none → nur Firma-Issue, kein Register-Issue
 *   8. registerNummer (deutsche Schreibweise) wird als gesetzt erkannt → kein false-positive
 *   9. NEGATIV-TEST echter Bug: gottl-Originalzustand (owner=Person, KEIN company) → Firma-Issue
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lintImpressumLegalForm } from '../../src/integrations/ai-discovery/index.ts';

/** Minimaler legal-Block. */
function makeLegal(overrides = {}) {
  return {
    street: 'Von-Heyden-Str. 6',
    zip: '93105',
    city: 'Tegernheim',
    ...overrides,
  };
}

test('1. Einzelunternehmer → keine Issues', () => {
  const issues = lintImpressumLegalForm(makeLegal({
    rechtsform: 'einzelunternehmer', owner: 'Max Mustermann', register: 'none',
  }));
  assert.equal(issues.length, 0);
});

test('2. GmbH mit firmiertem owner + registerNummer → keine Issues', () => {
  const issues = lintImpressumLegalForm(makeLegal({
    rechtsform: 'gmbh', owner: 'Soleno GmbH', register: 'hrb', registerNummer: '19310',
  }));
  assert.equal(issues.length, 0);
});

test('3. GmbH ohne company + Privatperson-owner → Firma-Issue', () => {
  const issues = lintImpressumLegalForm(makeLegal({
    rechtsform: 'gmbh', owner: 'Erika Beispiel', register: 'hrb', registerNummer: '123',
  }));
  assert.equal(issues.length, 1);
  assert.equal(issues[0].field, 'legal.company');
});

test('4. NEGATIV-TEST: eGbR mit company aber ohne registerNumber → Register-Issue', () => {
  const issues = lintImpressumLegalForm(makeLegal({
    rechtsform: 'egbr', owner: 'Gottl Reiner', company: 'Gottl Richter Gomeier eGbR',
    register: 'gnr', // KEINE registerNumber → der echte gottl-Mangel
  }));
  assert.equal(issues.length, 1);
  assert.equal(issues[0].field, 'legal.registerNumber');
});

test('5. eGbR vollstaendig → keine Issues', () => {
  const issues = lintImpressumLegalForm(makeLegal({
    rechtsform: 'egbr', owner: 'Gottl Reiner', company: 'Gottl Richter Gomeier eGbR',
    register: 'gnr', registerNumber: 'GnR 123',
  }));
  assert.equal(issues.length, 0);
});

test('6. Kein rechtsform-Feld → Guard inaktiv, keine Issues', () => {
  const issues = lintImpressumLegalForm(makeLegal({ owner: 'Irgendwer' }));
  assert.equal(issues.length, 0);
});

test('7. GbR Privatperson-owner + register=none → nur Firma-Issue', () => {
  const issues = lintImpressumLegalForm(makeLegal({
    rechtsform: 'gbr', owner: 'Anna und Bert', register: 'none',
  }));
  assert.equal(issues.length, 1);
  assert.equal(issues[0].field, 'legal.company');
});

test('8. registerNummer (deutsche Schreibweise) zaehlt → kein false-positive', () => {
  const issues = lintImpressumLegalForm(makeLegal({
    rechtsform: 'gmbh', company: 'X GmbH', register: 'hrb', registerNummer: 'HRB 2749',
  }));
  assert.equal(issues.length, 0);
});

test('9. NEGATIV-TEST: gottl-Originalzustand (owner=Person, KEIN company) → Firma-Issue', () => {
  // Exakt der Live-Bug vor dem Fix: owner war die Privatperson, company fehlte,
  // ImpressumBlock zeigte keine Firma. Der Guard MUSS das flaggen.
  const issues = lintImpressumLegalForm(makeLegal({
    rechtsform: 'egbr', owner: 'Gottl Reiner', register: 'gnr',
  }));
  const fields = issues.map((i) => i.field);
  assert.ok(fields.includes('legal.company'), 'Firma-Issue muss gemeldet werden');
  assert.ok(fields.includes('legal.registerNumber'), 'Register-Issue muss gemeldet werden');
  assert.equal(issues.length, 2);
});
