import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
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
