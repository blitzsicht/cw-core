// @ts-check
import { defineConfig } from 'astro/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  site: 'http://localhost:4322',
  output: 'static',
  vite: {
    resolve: {
      alias: {
        // BaseLayout.astro importiert fest `@/styles/tokens.css` und setzt damit
        // die Kundenstruktur voraus. Ohne diesen Alias laesst sich in examples
        // keine Seite auf einem cw-core-Layout bauen — der Build bricht mit
        // "Rollup failed to resolve import" ab. Deshalb zeigt `@` hier auf das
        // eigene src/, genau wie in jedem customer-Repo.
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
  },
});
