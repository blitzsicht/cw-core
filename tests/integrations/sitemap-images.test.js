// @ts-check
/**
 * Tests für die dormante Image-Sitemap-serialize-Factory (sitemap-images.ts).
 *
 * Lauf: `node --test tests/integrations/sitemap-images.test.js`
 *
 * Abdeckung:
 *   1. imagesFor liefert Bilder → item.img gesetzt (nur befüllte Felder)
 *   2. imagesFor leer/undefined → item unverändert (kein leeres img)
 *   3. next-Serializer wird angewandt (priority/changefreq) + Bilder angehängt
 *   4. ogImageFor löst relativen Pfad gegen siteUrl auf
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  imageSitemapSerialize,
  ogImageFor,
} from '../../src/integrations/sitemap-images.ts';

test('1. imagesFor liefert Bilder → item.img (nur befüllte Felder)', () => {
  const serialize = imageSitemapSerialize({
    imagesFor: (url) =>
      url === 'https://x.de/'
        ? [{ url: 'https://x.de/og.png', caption: 'Firma', geoLocation: 'Regensburg' }]
        : [],
  });
  const out = serialize({ url: 'https://x.de/' });
  assert.deepEqual(out.img, [
    { url: 'https://x.de/og.png', caption: 'Firma', geoLocation: 'Regensburg' },
  ]);
});

test('2. Keine Bilder → item unverändert, kein img-Feld', () => {
  const serialize = imageSitemapSerialize({ imagesFor: () => [] });
  const out = serialize({ url: 'https://x.de/impressum/' });
  assert.equal(out.img, undefined);
  assert.equal(out.url, 'https://x.de/impressum/');
});

test('3. next-Serializer angewandt + Bilder angehängt', () => {
  const serialize = imageSitemapSerialize({
    imagesFor: () => [{ url: 'https://x.de/og.png' }],
    next: (item) => ({ ...item, changefreq: 'weekly', priority: 0.9 }),
  });
  const out = serialize({ url: 'https://x.de/' });
  assert.equal(out.changefreq, 'weekly');
  assert.equal(out.priority, 0.9);
  assert.deepEqual(out.img, [{ url: 'https://x.de/og.png' }]);
});

test('4. ogImageFor löst relativen Pfad gegen siteUrl auf', () => {
  const getter = ogImageFor('https://x.de', '/og/home.png', 'X');
  assert.deepEqual(getter(), [{ url: 'https://x.de/og/home.png', caption: 'X' }]);
  // absolute URL bleibt absolut
  assert.deepEqual(ogImageFor('https://x.de', 'https://cdn.de/a.png')(), [
    { url: 'https://cdn.de/a.png' },
  ]);
});
