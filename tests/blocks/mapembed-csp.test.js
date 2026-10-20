// @ts-check
/**
 * MapEmbed.astro, echt gerendert, gegen die CSP — schützt den Marker, an dem der
 * Output-Check das erst nach dem Klick erzeugte iframe erkennt (`data-embed-src`).
 *
 * Lauf: `node --test tests/blocks/mapembed-csp.test.js`
 *
 * Benennt jemand das Attribut um, würde der Check still blind (Messfalle „Lief nie“):
 * die Fixture in tests/integrations/csp-osm-mapembed.test.js bliebe grün. Dieser Test
 * rendert deshalb die Komponente selbst.
 */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { renderer, schliessen } from './_render-astro.js';
import { extractResources } from '../../src/integrations/ai-discovery/html-resources.js';
import { auditHtml } from '../../src/integrations/ai-discovery/csp-audit.js';
import { buildCsp } from '../../src/integrations/ai-discovery/csp-build.js';

after(schliessen);

const ORIGIN = 'https://brotzeithaeusl-regenstauf.de';
const PROPS = { lat: 49.1189, lng: 12.1336, markerLabel: 'Brotzeithäusl', address: 'Regenstauf' };

async function html() {
  const r = await renderer();
  return r.render('src/components/blocks/MapEmbed.astro', PROPS);
}

test('gerendertes MapEmbed: kein iframe im HTML, aber ein frame-src-Ziel für den Check', async () => {
  const h = await html();
  assert.doesNotMatch(h, /<iframe/i, 'Click-to-load: vor dem Klick darf kein iframe da sein');
  const frames = extractResources(h).filter((r) => r.directive === 'frame-src');
  assert.equal(frames.length, 1, 'genau ein frame-src-Ziel erwartet');
  assert.match(frames[0].url ?? '', /^https:\/\/www\.openstreetmap\.org\/export\/embed\.html\?/);
});

test('gerendertes MapEmbed: Kunden-CSP ohne OSM → blockiert; mit osm → frei', async () => {
  const h = await html();
  const ohne = auditHtml(h, buildCsp(ORIGIN, { tally: true, cal: true, youtube: true }), { siteOrigin: ORIGIN });
  assert.equal(ohne.filter((f) => !f.result.allowed && /openstreetmap/.test(f.resource.url ?? '')).length, 1);
  const mit = auditHtml(h, buildCsp(ORIGIN, { tally: true, cal: true, youtube: true, osm: true }), { siteOrigin: ORIGIN });
  assert.deepEqual(mit.filter((f) => !f.result.allowed), []);
});
