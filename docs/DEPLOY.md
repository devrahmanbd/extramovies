# DEPLOY — movie-review CMS

Three supported targets. Pick one per environment. PHP-only cPanel
**cannot** run this backend (see matrix).

## Deploy matrix

| Target | Runtime | DB | Admin/AI | Search | Use when |
|---|---|---|---|---|---|
| Cloudflare Workers + D1 (default) | Workers (`dist/_worker.js`) | D1 (`movie_reviews`) | ✅ full | ✅ FTS (D1) | production default |
| Node cPanel (Passenger/PM2) | Node ≥20 (`dist/server/entry.mjs` via `@astrojs/node`) | SQLite file (`DB_FILE`) or external PG | ✅ full | ✅ FTS (SQLite) | VPS/shared Node host |
| Static (GitHub Pages / Pages / any static) | none (pure HTML/CSS) | none at runtime (prebuilt) | ❌ disabled (no server) | ⚠️ prebuilt index only | archive / preview mirror |
| PHP-only cPanel | ❌ **unsupported** | — | ❌ | — | **cannot run backend** — no Node/Workers runtime |

> PHP-only cPanel cannot run this backend. There is no PHP runtime path:
> SSR, `/api/*`, admin auth, AI generation, and D1/SQLite writes all require
> a JS runtime (Workers or Node). On PHP-only hosting, ship **static mode**
> for public pages only, and run admin/AI elsewhere.

## 1. Cloudflare (Workers + D1) — default

Config: `astro.config.mjs` (cloudflare adapter) + `wrangler.toml`.

```bash
# one-time
npm i
wrangler login
wrangler d1 create movie_reviews            # paste id into wrangler.toml
wrangler d1 migrations apply movie_reviews --local
wrangler d1 migrations apply movie_reviews --remote

# secrets (never commit)
wrangler secret put TMDB_API_KEY
wrangler secret put OMDB_API_KEY
wrangler secret put OPENROUTER_API_KEY
wrangler secret put ADMIN_PASSWORD

# deploy
npm run build
wrangler deploy
# D1 backup before risky changes:
wrangler d1 export movie_reviews --remote --output=backups/d1-$(date +%F).sql
```

Vars in `wrangler.toml [vars]`: `BRAND_PRESET`, `SITE_URL`, `SITE_NAME`,
`DEFAULT_REGION`. Local dev uses `platformProxy` — `npm run dev` needs no
`wrangler dev`.

## 2. Node cPanel (Passenger — the active deploy target)

Prerequisites: cPanel with Node.js Application Manager (Setup Node.js App),
Node ≥ 20.12 available, your custom domain's DNS pointed at the host, and
SSH (or Terminal in cPanel). The app runs as a standalone Node server;
SQLite file via `DB_FILE` (no D1, no Workers on this path).

### Step 1 — Create the application (cPanel UI)

1. cPanel → Setup Node.js App → Create Application.
2. Node version ≥ 20.12. Application mode: Production.
3. Application root: `/home/<user>/movie-review-cms` (OUTSIDE `public_html`).
4. Application URL: your custom domain (addon domain/subdomain first if new).
5. Application startup file: `dist/server/entry.mjs`.
6. Do NOT set `PORT` — Passenger injects it. Leave it unset.

### Step 2 — Upload + install (SSH on the host)

Upload everything EXCEPT `node_modules/`, `dist/`, `.env`, and
`data/*.db*` (dev database stays home; `data/reviews.json` IS uploaded —
it seeds editorial demo content until you replace it via `/admin`).

```bash
cd /home/<user>/movie-review-cms
npm ci                    # installs prod deps incl. better-sqlite3 + @astrojs/node
npm run build             # astro build → dist/server/entry.mjs + dist/client/
```

If `npm ci` fails compiling `better-sqlite3`, the host lacks build tools —
ask the host to enable them or install a prebuilt binary host-side.

### Step 3 — Production database (fresh, on the host)

```bash
mkdir -p data
export DB_FILE=/home/<user>/movie-review-cms/data/prod.sqlite
for f in migrations/*.sql; do sqlite3 "$DB_FILE" < "$f"; done
# no sqlite3 CLI? equivalent via node:
node -e "const fs=require('fs'),D=require('better-sqlite3'),db=new D(process.env.DB_FILE);for(const f of fs.readdirSync('migrations').filter(f=>f.endsWith('.sql')).sort())db.exec(fs.readFileSync('migrations/'+f,'utf8'));db.close();console.log('migrated')"
```

This creates all tables (`users`, `member_reviews`, `sessions`, moderation…).
Never upload your dev `local.db` — it contains drafts and test users.

### Step 4 — Environment variables (cPanel UI, never commit)

| Var | Value |
|---|---|
| `NODE_ENV` | `production` |
| `ADMIN_EMAIL` | your editor email |
| `ADMIN_PASSWORD_HASH` | `scrypt:…` hash (generate: `npx tsx -e "import('./src/lib/auth/password.ts').then(async m=>console.log(await m.hashPassword(process.argv[1])))" 'YOUR_PASSWORD'` — run locally, paste hash only) |
| `TMDB_API_KEY` | reuse your local key (movie data + streaming tiles) |
| `OMDB_API_KEY` / `OPENROUTER_API_KEY` | optional (metadata enrichment / AI writer; dashboard fallbacks exist) |
| `SITE_URL` | `https://your-custom-domain` |
| `SITE_THEME` | `discovery` or `publication` (deploy-time front) |
| `DB_FILE` | `/home/<user>/movie-review-cms/data/prod.sqlite` |
| `BRAND_PRESET` / `DEFAULT_REGION` | as local, or set later in `/admin/settings` |

`SESSION_SECRET` is legacy — sessions use opaque random tokens, nothing reads
it (see README note). Restart the app from the Node.js App panel after saving.

### Step 5 — Smoke test + go-live

1. Visit `/setup` once if shown (one-time wizard), then `/admin` login.
2. Homepage, a movie page, `/reviews` render; post a test member review via
   signup flow; hide it via moderation. Delete the test user after.
3. Enable AutoSSL for the domain; force HTTPS.
4. Backups (cron-friendly): `sqlite3 "$DB_FILE" ".backup ./backups/prod-$(date +%F).sqlite"`
   plus `npm run backup -- backup ./data/reviews.json ./backups`.

Troubleshooting: 503/empty page → app failed to start — check `logs/` in the
app root (Passenger stderr). `better-sqlite3` load errors → rebuild:
`npm rebuild better-sqlite3`. Wrong DB → confirm `DB_FILE` is the absolute
prod path, not the dev one.

## 3. Static mode (public only)

```bash
# astro.config.mjs: output: 'static', remove adapter
npm run build            # -> dist/ is pure HTML/CSS
# publish dist/ to GitHub Pages / Cloudflare Pages / any static host
```

Limits: no `/api/*`, no admin writes, no AI generation at runtime, no
server search. Search falls back to the prebuilt index; forms/admin are
disabled. Generate + export content from a server build first
(`npm run export`), then publish the static output.

## Scripts

| Script | Command |
|---|---|
| `dev` | `astro dev` |
| `build` | `astro build` |
| `preview` | `astro preview` |
| `test` | `vitest run` |
| `migrate` | `tsx scripts/migrate-local.ts` |
| `backup` | `tsx scripts/backup.ts` |
| `export` | `tsx scripts/export.ts` |
| `import` | `tsx scripts/import.ts` |

Health check after any deploy: public page renders, `/api/backup/status`
(admin) returns counts, streaming section hides when TMDB is down,
exported Markdown re-imports cleanly (`--dry` first).

## 4. Theme deployments (`SITE_THEME` — deploy-time only)

One engine + data, two independent frontends. The theme is chosen at
deploy time via `SITE_THEME` and never toggled at runtime — there is no
theme switcher in `/admin/settings` and no `site.theme` dashboard key.

| Deployment | `SITE_THEME` | Frontend |
|---|---|---|
| A — discovery | `discovery` | Showcase + buybox + rails as primary; streaming-first discovery surface |
| B — publication (default) | `publication` or unset | Editorial journal / magazine with streaming secondary (current behavior: journal home, magazine preset layout, reviews archive/search, review pages with showcase + buybox) |

Rules:

- Unset, empty, or unknown `SITE_THEME` falls back to `publication`.
  Publication behavior never changes when theme is `publication` or unset.
- Same backend, same data. Deploy A and B as separate environments
  (separate Workers / Node processes / static outputs) pointing at their
  own DB/file; do not share a writable SQLite file between them.
- Cloudflare: set `SITE_THEME` in `wrangler.toml [vars]` per environment
  (or `wrangler secret`/`vars` per deploy). Node: export `SITE_THEME` in
  the process env (cPanel Application Manager / `.env`, never commit).
  Static: `SITE_THEME` is baked at `npm run build` time.
- Publication crew owns the publication branch; discovery crew branches
  the top (`src/pages/index.astro`). Coordinate to avoid conflicts —
  prefer zero edits to the publication path.

## 5. Setup wizard (`/setup` — one-time, no switcher)

First boot per deployment runs a one-time setup wizard at `/setup`:

1. Visit `/setup` on a fresh deploy (no admin yet).
2. Create the admin account (email + password; hashed on first run).
3. Save API keys (TMDB, OMDb optional, OpenRouter) and site URL/name.
4. Confirm the deploy-time theme (`SITE_THEME` as deployed — displayed,
   not editable).
5. Wizard locks after the first admin exists; revisit returns 404/redirect.
   All later edits happen in `/admin/settings`. There is deliberately no
   theme toggle — re-deploy with a different `SITE_THEME` to switch fronts.

## Env reference

| Var | Where | Required | Notes |
|---|---|---|---|
| `SITE_THEME` | deploy-time frontend | No (defaults `publication`) | `discovery` \| `publication`. Dashboard never overrides |
| `TMDB_API_KEY` | server-only movie data | Yes for streaming tiles | Falls back to dashboard `tmdb.api_key`; section hides when empty/down |
| `OMDB_API_KEY` | server-only, optional | No | Dashboard `omdb.api_key` fallback |
| `OPENROUTER_API_KEY` | server-only AI writer | Yes for AI generation | Dashboard `openrouter.api_key` fallback; never expose client-side |
| `OPENROUTER_MODEL` / `OPENROUTER_CHEAP_MODEL` / `OPENROUTER_BASE_URL` | AI writer tuning | No | Defaults: `anthropic/claude-sonnet-4` / `anthropic/claude-haiku-4` / `https://openrouter.ai/api/v1` |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` (bootstrap) or `ADMIN_PASSWORD_HASH` | system bootstrap | Yes first boot | Hashed on first run; prefer `ADMIN_PASSWORD_HASH` in production; never commit real values |
| `SESSION_SECRET` | legacy, unread | No | Sessions use opaque random tokens; nothing reads it — do not set |
| `SITE_URL` / `SITE_NAME` / `BRAND_PRESET` / `DEFAULT_REGION` | first-boot seeds | No | Dashboard values win after first save (`site.url`, `site.name`, `brand.preset`, `region.default`) |
| `DB_FILE` / `REVIEWS_DB_PATH` | Node local DB | Node only | Cloudflare Workers uses the D1 binding instead |

## 6. Curated TMDB bulk import — TV series + movies (resumable)

> Honest limits: this is a **curated** bulk import (trending / popular /
> top-rated + genre discover, movies AND tv), **not** "all of TMDB".
> Importing all of TMDB (millions of titles) via the public API is
> infeasible: ~40 req/10s rate limits, discover pagination caps (~500
> pages), and ToS. The importer is rate-limited (4 req/s), paginated,
> resumable via `import_state`, and upserts so re-runs are safe.

What it is / isn't:

- IS: `series` table (TV: title, seasons/episodes, creators, cast,
  ratings, posters) + curated `movies` upserts + `import_state` cursor
  (`source` PK e.g. `movie:popular`, `page` = last completed page).
- ISN'T: a full TMDB mirror, a license to redistribute images/text at
  scale, or a bypass for rate limits — keep the 4 req/s throttle.
- `streaming_availability.movie_id` is reused for series rows as
  `tmdb:{id}` (documented reuse — table NOT altered; note a numeric
  movie/TV id collision would share that key, so prefer per-media
  queries against `movies`/`series` for canonical data).

Commands (local SQLite via `getDb({})` — `DB_FILE` or `./data/local.db`):

```bash
# apply migrations first (0003 adds series + import_state)
npm run db:migrate:local            # sqlite3 data/local.db < migrations/*.sql
# or: sqlite3 data/local.db < migrations/0003_series_import.sql

TMDB_API_KEY=… npm run import:tmdb -- --media=both --source=popular --pages=5 --limit=200 --resume
TMDB_API_KEY=… npm run import:tmdb -- --media=tv --source=trending --pages=3 --limit=60 --region=US
TMDB_API_KEY=… npm run import:tmdb -- --media=movie --source=genre:28 --pages=5 --limit=100
```

Flags: `--media=movie|tv|both` (default both),
`--source=trending|popular|top_rated|genre:ID` (default popular),
`--pages=N` (default 10, 1..500), `--region=US`,
`--limit=N` total titles cap (default 200, 1..5000),
`--resume` (continue from `import_state`, else restart at page 1).
Partial progress is always kept; exit 1 on persistent failures
(3+ fails, or any fail with zero successes) — re-run with `--resume`.

Cron suggestion (weekly curated refresh, small and polite):

```cron
0 3 * * 0  cd /home/user/movie-review && TMDB_API_KEY=$TMDB_API_KEY npm run import:tmdb -- --media=both --source=trending --pages=3 --limit=120 --resume >> ./logs/import-tmdb.log 2>&1
```

D1 note: Workers/D1 has no long-lived connection for thousands of paced
requests. Supported path: run the importer locally, `sqlite3 data/local.db
.dump` (or export rows), then `wrangler d1 execute movie_reviews --remote
--file=./backups/import.sql`. Direct D1 import from Workers is not
supported — use `wrangler d1 migrations apply movie_reviews --remote`
for schema (migrations/0003) and bulk-load data offline.
