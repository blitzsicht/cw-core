// @ts-check
/**
 * Rendert eine cw-core-Astro-Komponente unter `node --test` zu HTML.
 *
 * Weg: Vite-Dev-Server im Middleware-Modus mit Astros eigener Vite-Konfiguration
 * (`getViteConfig`, derselbe Weg, den Astro für Vitest vorsieht) lädt die `.astro`-Datei,
 * der Container-Renderer (`astro/container`) macht daraus einen String. Kein Vitest,
 * kein Build. Dauer ca. 1 s pro Testdatei.
 *
 * `vite` ist keine direkte Abhängigkeit von cw-core (pnpm strict), deshalb wird es über
 * das installierte `astro` aufgelöst.
 *
 * `normalize()` entfernt, was sich mit JEDER Quelltextänderung verschiebt, ohne das
 * ausgelieferte Markup zu betreffen: Dev-Annotationen (`data-astro-source-file/-loc`,
 * gibt es im Build nicht) und den Scope-Hash (`data-astro-cid-…`, wandert mit dem
 * Dateiinhalt) sowie den absoluten Checkout-Pfad im Skript-`src` (sonst hinge der
 * Vergleich am Worktree). Alles andere bleibt Byte für Byte stehen.
 */
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { getViteConfig } from 'astro/config';
import { experimental_AstroContainer } from 'astro/container';

const ROOT = resolve(import.meta.dirname, '../..');

/** @type {Promise<{ render: (datei: string, props?: Record<string, unknown>) => Promise<string>, laden: (datei: string) => Promise<Record<string, any>>, close: () => Promise<void> }> | null} */
let instanz = null;

async function starten() {
  const astroReq = createRequire(createRequire(import.meta.url).resolve('astro/package.json'));
  const { createServer } = await import(pathToFileURL(astroReq.resolve('vite')).href);
  const inline = /** @type {any} */ ({ root: ROOT, logLevel: 'silent' });
  const cfg = await getViteConfig(inline, inline)({ mode: 'test', command: 'serve' });
  const server = await createServer({
    ...cfg,
    root: ROOT,
    logLevel: 'silent',
    server: { middlewareMode: true, hmr: false, watch: null },
    appType: 'custom',
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  const container = await experimental_AstroContainer.create();
  return {
    /**
     * @param {string} datei Pfad relativ zum Repo-Root, z. B. 'src/components/forms/ContactForm.astro'
     * @param {Record<string, unknown>} [props]
     */
    async render(datei, props = {}) {
      const mod = await server.ssrLoadModule(resolve(ROOT, datei));
      return container.renderToString(mod.default, { props });
    },
    /**
     * Lädt ein Modul über denselben Vite-Server — für TypeScript mit endungslosen
     * Imports (z. B. `src/utils/analytics/auto-events.ts`), das `node --test` allein
     * nicht auflösen kann.
     * @param {string} datei Pfad relativ zum Repo-Root
     */
    laden: (datei) => server.ssrLoadModule(resolve(ROOT, datei)),
    close: () => server.close(),
  };
}

/** Ein Server pro Testdatei; `close()` im `after`-Hook aufrufen. */
export function renderer() {
  instanz ??= starten();
  return instanz;
}

export async function schliessen() {
  if (!instanz) return;
  const r = await instanz;
  instanz = null;
  await r.close();
}

/** @param {string} html */
export function normalize(html) {
  return html
    .replace(/\s+data-astro-source-(?:file|loc)="[^"]*"/g, '')
    .replace(/\s+data-astro-cid-[a-z0-9]+/g, '')
    .split(ROOT).join('<ROOT>');
}
