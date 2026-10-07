# Movie Review CMS — foundation

Personal movie-review CMS + publishing site. Editorial cinematic magazine
(premium independent film journal — **not** a Netflix clone). Astro 5 SSR,
minimal JS, semantic HTML, custom OKLCH tokens, multi-brand presets.

## Stack

- **Astro 5** `output: 'server'`, TypeScript strict
- **DB:** SQLite file locally (`better-sqlite3`), **D1** in production
  (Cloudflare Workers) via `src/lib/db/adapter.ts`. Schema: Drizzle +
  `migrations/0001_init.sql`. Markdown canonical (`reviews.body_markdown`),
  FTS5 `reviews_fts` for search.
- **Branding:** `src/branding/presets/*.json` + `getBrand()` — clone repo per
  domain, set `BRAND_PRESET`. All SEO/JSON-LD/sitemap/RSS/manifest read the
  active preset (see `src/lib/seo.ts`).
- **CSS:** `src/styles/tokens.css` — custom OKLCH tokens, no Tailwind look.

## Files created (this pass)

```
package.json  astro.config.mjs  tsconfig.json  .env.example
wrangler.toml  README.md
src/content.config.ts
src/styles/tokens.css
src/branding/presets/noir-cinema.json
src/branding/presets/golden-hour.json
src/branding/presets/midnight-festival.json
src/lib/branding/resolve.ts      # getBrand() + brandCssVars()
src/lib/config.ts                # getConfig(): brand + env merge
src/lib/seo.ts                   # head/JSON-LD/sitemap/RSS/manifest
src/lib/db/schema.ts             # reviews, movies, streaming_availability,
                                 # settings, admin_user, research_sources, redirects
src/lib/db/adapter.ts            # getDb() D1/SQLite + searchReviews()
migrations/0001_init.sql         # tables + FTS5 + triggers
```

## Brand resolution API

```ts
import { getBrand, getBrandFromSettings, brandCssVars, listPresets } from './lib/branding/resolve';
import { getConfig } from './lib/config';

const brand = getBrand({ BRAND_PRESET: 'golden-hour' }); // sync (build/static)
const brandDb = await getBrandFromSettings((k) => getSetting(db, k)); // honors settings.brand.preset
const css = brandCssVars(brand); // -> "--color-paper:...;..." for <html style>
const cfg = getConfig(env);      // { brand, siteUrl, siteName, defaultRegion }
```

New site clone: copy `noir-cinema.json` → `my-press.json` (update
`siteName, domain, logo, colors, fonts, social`), set
`BRAND_PRESET=my-press`. No code changes.

SEO usage: `headMeta(cfg, page)`, `jsonLdWebSite(cfg)`,
`jsonLdReview(cfg, review)`, `jsonLdBreadcrumbs(url, crumbs)`,
`sitemapXml(cfg, entries)`, `rssXml(cfg, items)`, `manifestJson(brand)`.
Wire these into `Base` layout + `sitemap.xml.ts` + `rss.xml.ts` +
`manifest.webmanifest.ts` routes (next pass).

## Run

```bash
cp .env.example .env          # fill TMDB/OMDB/OpenRouter + admin
npm install
npm run dev                   # http://localhost:4321 (D1 emulated via platformProxy)

# Local SQLite migrate (applies migrations/0001_init.sql to ./data/local.db)
npm run db:migrate:local

# Production D1
wrangler d1 create movie_reviews
# paste database_id into wrangler.toml
wrangler d1 migrations apply movie_reviews --remote --migrations migrations/
wrangler secret put TMDB_API_KEY # + OMDB_API_KEY, OPENROUTER_API_KEY, ADMIN_PASSWORD
npm run build && npm run deploy
```

Env: `BRAND_PRESET` selects `src/branding/presets/<id>.json`;
`settings.brand.preset` DB value overrides env at runtime.
`SITE_URL` must be the canonical origin (sitemap/canonical/OG depend on it).
`DEFAULT_REGION` filters `streaming_availability` (e.g. `US`).

## Deploy notes

- **Cloudflare (default):** `astro.config.mjs` uses `@astrojs/cloudflare`;
  `wrangler.toml` binds D1 (`DB`) + static assets (`ASSETS`).
- **cPanel/Node:** `npm i @astrojs/node`, swap adapter to
  `node({ mode: 'standalone' })`, build, run `node dist/server/entry.mjs`
  with `DB_FILE=/path/data.db`.
- **Static:** `output: 'static'`, drop adapter; admin/search become build-time
  only.

## SEO guarantees (built-in)

SSR HTML carries title (50–60ch), description (150–160ch), canonical,
OG/Twitter, JSON-LD Review+Movie in initial bytes (never JS-injected);
one H1/page; semantic `<article>/<header>/<footer>`; XML sitemap +
`robots.txt` (next pass) + RSS + manifest all brand-aware; LCP/CLS guarded by
minimal JS + `tokens.css` (`overflow-x: clip`, fluid type).
