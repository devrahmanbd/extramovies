import { defineConfig } from 'vitest/config';
import path from 'node:path';
import { getViteConfig } from 'astro/config';

/**
 * Astro's own vite config (the .astro compiler + the react integration) is
 * merged in so a test can render a real Astro component through the
 * container API (astro/container). Without it a .astro import is a parse
 * error; with it, component markup is assertable in `npm test`.
 */
const astroVite = await getViteConfig({ root: __dirname })({ mode: 'test', command: 'serve' });

export default defineConfig({
  ...astroVite,
  test: {
    environment: 'node',
    globals: false,
    include: ['tests/**/*.test.ts'],
    // tests/movie-data.test.ts is a dependency-free node:test suite owned by
    // the movie-data slice (run: npx tsx --test tests/movie-data.test.ts).
    // Excluded here so `npm test` stays green for both runners.
    exclude: ['tests/movie-data.test.ts', 'node_modules/**'],
    testTimeout: 15_000,
    hookTimeout: 10_000,
    reporters: ['verbose'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
});
