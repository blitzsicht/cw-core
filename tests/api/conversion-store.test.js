// @ts-check
/**
 * Tests für src/api/conversion-store.js — reine Record-Bau-/Dedupe-Logik +
 * die Doppel-Gate-Kurzschlüsse von recordConversion (ohne DB/Neon).
 *
 * Ausführen:  node --test tests/api/conversion-store.test.js
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildConversionRecord,
  computeDedupeKey,
  recordConversion,
} from '../../src/api/conversion-store.js';

const NOW = new Date('2026-07-07T12:34:56.000Z');

/** @param {Record<string,string>} attribution @param {string} [project] */
function leadWith(attribution, project = 'digital-direkt') {
  return { project, fromName: 'DD', email: 'x@y.de', attribution };
}

// ─── buildConversionRecord ───────────────────────────────────────────────────
test('buildConversionRecord: gclid → vollständiger Record, utm gemappt', () => {
  const rec = buildConversionRecord(
    leadWith({ gclid: 'ABC123', utm_source: 'google', utm_campaign: 'leasing' }),
    { now: NOW },
  );
  assert.ok(rec);
  assert.equal(rec.customer_slug, 'digital-direkt');
  assert.equal(rec.click_id, 'ABC123');
  assert.equal(rec.click_id_type, 'gclid');
  assert.equal(rec.conversion_datetime, '2026-07-07T12:34:56.000Z');
  assert.equal(rec.utm_source, 'google');
  assert.equal(rec.utm_campaign, 'leasing');
  assert.equal(rec.utm_medium, null); // nicht vorhanden → null
});

test('buildConversionRecord: gbraid ohne gclid → click_id_type gbraid', () => {
  const rec = buildConversionRecord(leadWith({ gbraid: 'GB1' }), { now: NOW });
  assert.ok(rec);
  assert.equal(rec.click_id_type, 'gbraid');
  assert.equal(rec.click_id, 'GB1');
});

test('buildConversionRecord: Priorität gclid > gbraid > wbraid', () => {
  const rec = buildConversionRecord(leadWith({ wbraid: 'WB', gbraid: 'GB', gclid: 'GC' }), { now: NOW });
  assert.ok(rec);
  assert.equal(rec.click_id_type, 'gclid');
  assert.equal(rec.click_id, 'GC');
});

test('buildConversionRecord: keine Google-Klick-ID → null (msclkid/fbclid zählen nicht)', () => {
  assert.equal(buildConversionRecord(leadWith({ msclkid: 'M', fbclid: 'F', utm_source: 'bing' }), { now: NOW }), null);
  assert.equal(buildConversionRecord(leadWith({}), { now: NOW }), null);
});

test('buildConversionRecord: kein customer_slug → null', () => {
  assert.equal(buildConversionRecord(leadWith({ gclid: 'X' }, ''), { now: NOW }), null);
});

// ─── computeDedupeKey ────────────────────────────────────────────────────────
test('computeDedupeKey: deterministisch, gleicher click_id+Minute → gleicher Key', () => {
  const a = buildConversionRecord(leadWith({ gclid: 'K' }), { now: new Date('2026-07-07T12:34:10.000Z') });
  const b = buildConversionRecord(leadWith({ gclid: 'K' }), { now: new Date('2026-07-07T12:34:59.000Z') });
  assert.ok(a && b);
  assert.equal(computeDedupeKey(a), computeDedupeKey(b)); // gleiche Minute → dedupe
  assert.match(computeDedupeKey(a), /^[a-f0-9]{64}$/);
});

test('computeDedupeKey: andere Minute ODER anderer click_id → anderer Key', () => {
  const base = buildConversionRecord(leadWith({ gclid: 'K' }), { now: new Date('2026-07-07T12:34:10.000Z') });
  const otherMinute = buildConversionRecord(leadWith({ gclid: 'K' }), { now: new Date('2026-07-07T12:35:10.000Z') });
  const otherId = buildConversionRecord(leadWith({ gclid: 'Z' }), { now: new Date('2026-07-07T12:34:10.000Z') });
  assert.ok(base && otherMinute && otherId);
  assert.notEqual(computeDedupeKey(base), computeDedupeKey(otherMinute));
  assert.notEqual(computeDedupeKey(base), computeDedupeKey(otherId));
});

// ─── recordConversion Gates (kein DB-Zugriff, kein Throw) ────────────────────
test('recordConversion: ohne CW_CONVERSION_STORE_URL = stiller No-op', async () => {
  const prev = process.env.CW_CONVERSION_STORE_URL;
  delete process.env.CW_CONVERSION_STORE_URL;
  try {
    await assert.doesNotReject(
      recordConversion(leadWith({ gclid: 'X' }), { marketingConsent: true }),
    );
  } finally {
    if (prev !== undefined) process.env.CW_CONVERSION_STORE_URL = prev;
  }
});

test('recordConversion: env gesetzt, aber marketingConsent !== true = No-op', async () => {
  const prev = process.env.CW_CONVERSION_STORE_URL;
  process.env.CW_CONVERSION_STORE_URL = 'postgres://fake';
  try {
    await assert.doesNotReject(recordConversion(leadWith({ gclid: 'X' }), {})); // consent fehlt
    await assert.doesNotReject(recordConversion(leadWith({ gclid: 'X' }), { marketingConsent: false }));
  } finally {
    if (prev !== undefined) process.env.CW_CONVERSION_STORE_URL = prev;
    else delete process.env.CW_CONVERSION_STORE_URL;
  }
});

test('recordConversion: Gates offen aber keine Klick-ID = No-op (kein Neon-Import)', async () => {
  const prev = process.env.CW_CONVERSION_STORE_URL;
  process.env.CW_CONVERSION_STORE_URL = 'postgres://fake';
  try {
    await assert.doesNotReject(recordConversion(leadWith({ utm_source: 'google' }), { marketingConsent: true }));
  } finally {
    if (prev !== undefined) process.env.CW_CONVERSION_STORE_URL = prev;
    else delete process.env.CW_CONVERSION_STORE_URL;
  }
});

test('recordConversion: Gates offen + Klick-ID, aber Neon-Dep fehlt → graceful (kein Throw)', async () => {
  const prev = process.env.CW_CONVERSION_STORE_URL;
  const prevErr = console.error;
  process.env.CW_CONVERSION_STORE_URL = 'postgres://fake';
  console.error = () => {}; // Fehler-Log unterdrücken (fehlender optionaler @neondatabase/serverless)
  try {
    await assert.doesNotReject(
      recordConversion(leadWith({ gclid: 'X' }), { marketingConsent: true }),
    );
  } finally {
    console.error = prevErr;
    if (prev !== undefined) process.env.CW_CONVERSION_STORE_URL = prev;
    else delete process.env.CW_CONVERSION_STORE_URL;
  }
});
