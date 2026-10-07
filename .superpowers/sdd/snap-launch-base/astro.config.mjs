// Astro 5 — SSR-first editorial magazine.
// Deploy targets:
//   - default: Cloudflare Workers + D1  (adapter @astrojs/cloudflare)
//   - cPanel/Node: swap to @astrojs/node (see comments below)
//   - static: output: 'static' (see README notes)
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import react from '@astrojs/react';
// For cPanel / generic Node host:
//   npm i @astrojs/node
//   import node from '@astrojs/node';
//   adapter: node({ mode: 'standalone' }),

export default defineConfig({
  output: 'server',
  integrations: [react()],
  adapter: cloudflare({
    platformProxy: { enabled: true },
    imageService: 'compile'
  }),
  vite: {
    // Keep client JS near zero: only hydrate islands explicitly.
    build: { cssMinify: 'lightningcss' }
  },
  markdown: {
    shikiConfig: { theme: 'css-variables', wrap: true }
  },
  // For static export mode (no SSR, no admin writes at runtime):
  //   output: 'static',
  //   adapter: undefined,
  experimental: {
    contentIntellisense: true
  }
});
