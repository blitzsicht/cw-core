#!/usr/bin/env node
/**
 * Guard für plausible-box.mjs — die Box wird über ihren Tailnet-Namen adressiert,
 * nie über eine IP.
 *
 * Auslöser (05.10.2026): DEFAULT_HOST war die Tailnet-IP 100.96.26.82. Die Box
 * wurde am 28.09. durch einen neuen Server ersetzt, der alte am 29.09. gelöscht.
 * Der Name ging mit, die IP nicht — der Goal-Wächter lief in einen SSH-Timeout,
 * onboard-site konnte keine Site mehr anlegen. Gemerkt hat es vier Tage niemand.
 *
 * Ausführen:  node --test scripts/onboard/plausible-box.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_HOST, PG_CONTAINER, sshOpts } from './plausible-box.mjs';

/** true, wenn das SSH-Ziel (mit oder ohne user@) eine IPv4- oder IPv6-Adresse ist. */
function hostIstIp(ziel) {
  const host = String(ziel).replace(/^[^@]*@/, '').replace(/^\[|\]$/g, '');
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return true;
  return host.includes(':') && /^[0-9a-f:.]+$/i.test(host);
}

test('DEFAULT_HOST ist ein Name, keine IP', () => {
  assert.equal(hostIstIp(DEFAULT_HOST), false, `DEFAULT_HOST ist eine IP: ${DEFAULT_HOST}`);
});

test('DEFAULT_HOST ist der volle MagicDNS-Name (der Kurzname löst auf dem Mac nicht auf)', () => {
  assert.match(DEFAULT_HOST, /^root@blitzsicht-analytics\.[a-z0-9-]+\.ts\.net$/);
});

test('hostIstIp erkennt die IP, an der der Wächter gescheitert ist (Negativprobe)', () => {
  assert.equal(hostIstIp('root@100.96.26.82'), true);
  assert.equal(hostIstIp('100.118.250.43'), true);
  assert.equal(hostIstIp('root@[fd7a:115c:a1e0::1]'), true);
  assert.equal(hostIstIp('fd7a:115c:a1e0::1'), true);
});

test('hostIstIp lässt Namen durch', () => {
  assert.equal(hostIstIp('root@blitzsicht-analytics.tailddfa18.ts.net'), false);
  assert.equal(hostIstIp('blitzsicht-analytics'), false);
  assert.equal(hostIstIp('root@host-100-96-26-82.example'), false);
});

test('Container-Name und SSH-Optionen unverändert (Coolify-Hash zog mit um)', () => {
  assert.equal(PG_CONTAINER, 'plausible_db-x12kp2izcjwfau5vq90clcnn');
  assert.deepEqual(sshOpts('/k').slice(2), ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15']);
});
