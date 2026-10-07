// Astro 5 — SSR-first editorial magazine.
// Deploy targets:
//   - active: cPanel / generic Node (adapter @astrojs/node, standalone)
//   - Cloudflare Workers + D1: swap back to @astrojs/cloudflare (see below)
//   - static: output: 'static' (see README notes)
import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import react from '@astrojs/react';
// For Cloudflare Workers:
//   npm i @astrojs/cloudflare
//   import cloudflare from '@astrojs/cloudflare';
//   adapter: cloudflare({ platformProxy: { enabled: true }, imageService: 'compile' }),

export default defineConfig({
  output: 'server',
  integrations: [react()],
  adapter: node({ mode: 'standalone' }),
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
