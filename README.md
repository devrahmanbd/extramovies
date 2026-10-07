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

## LAUNCH checklist (owner's Cloudflare account required unless noted)

> `wrangler.toml` still has `database_id = "REPLACE_WITH_D1_ID"`
> (`wrangler.toml:16`) — the owner must create the D1 first; do not invent an id.

```bash
# 1. [owner Cloudflare account] one-time login
wrangler login

# 2. [owner Cloudflare account] create D1, paste id into wrangler.toml
#    [[d1_databases]] database_id (replaces REPLACE_WITH_D1_ID)
wrangler d1 create movie_reviews

# 3. [owner Cloudflare account] apply schema remotely (migrations/ applied in order)
wrangler d1 migrations apply movie_reviews --remote --migrations migrations/

# 4. [owner Cloudflare account] secrets (never commit; never in wrangler.toml)
wrangler secret put TMDB_API_KEY
wrangler secret put OMDB_API_KEY
wrangler secret put OPENROUTER_API_KEY
wrangler secret put ADMIN_PASSWORD
# NOTE: SESSION_SECRET is NOT read by runtime code (sessions are opaque
# random tokens in src/lib/auth/session.ts); setting it is optional/harmless.
# Prefer ADMIN_PASSWORD_HASH over ADMIN_PASSWORD in production where supported.

# 5. [repo, no account needed] set vars in wrangler.toml [vars]:
#    SITE_URL (canonical origin — currently https://extramovies.org placeholder),
#    ADMIN_EMAIL (admin bootstrap seed), plus BRAND_PRESET / SITE_NAME / DEFAULT_REGION.

# 6. [owner Cloudflare account] build + deploy
npm run build && npm run deploy
# (= astro build && wrangler deploy; assets served from dist/, worker dist/_worker.js)
```

Dry-run (no account needed, config-only check):
`npx wrangler deploy --dry-run` — must be config-clean.

## SEO guarantees (built-in)

SSR HTML carries title (50–60ch), description (150–160ch), canonical,
OG/Twitter, JSON-LD Review+Movie in initial bytes (never JS-injected);
one H1/page; semantic `<article>/<header>/<footer>`; XML sitemap +
`robots.txt` (next pass) + RSS + manifest all brand-aware; LCP/CLS guarded by
minimal JS + `tokens.css` (`overflow-x: clip`, fluid type).
