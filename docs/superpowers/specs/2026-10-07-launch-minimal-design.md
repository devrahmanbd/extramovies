# Spec: Launch-minimal (2026-10-07)

Goal: make the product deployable + verify community reviews (B) end-to-end.
Defer: C (likes/follows/feed), D (series/anime/manga), Rotten Tomatoes, extra presets.

## L1 — D1-backed sessions (deploy blocker)

Sessions live in an in-memory `Map` (`src/lib/auth/session.ts:21`) under a
cookie literally named `admin_session` (`session.ts:6`), 12h TTL. On Workers
each isolate has its own memory: logins die across requests. Fix: persist
sessions in the already-bound D1 (`env.DB`, local fallback `./data/local.db`
via `src/lib/db/adapter.ts:87-95`).

- New table `sessions(token TEXT PRIMARY KEY, email TEXT, user_id INTEGER NULL,
  role TEXT NOT NULL, csrf_token TEXT NOT NULL, created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL)` + index on `expires_at` for sweeps.
- Keep exported function names/signatures in `session.ts` where possible;
  async where the DB requires it; update call sites (`api/auth/*`,
  `api/admin/login.ts`, `lib/auth/guard.ts`, logout). Cookie name unchanged
  (renaming logs everyone out — not worth it pre-launch).
- TTL 12h preserved; validate TTL + CSRF on every guard path; expired rows
  swept lazily on read (and a `clearExpired` helper).
- Migration `migrations/0006_sessions.sql`, applied to local dev DB.
  Additive-only: no changes to existing tables. `schema.ts` may gain a
  sessions table (additive) but raw `dbExecute` like `src/lib/members/*` is
  acceptable.

## L2 — Wrangler + secrets wiring (deploy blocker)

- `wrangler.toml [assets] directory = "dist/client"` is wrong: the build
  emits `_worker.js`, `_routes.json`, `_astro/`, `brand/`, `vendor/` at
  `dist/` root. Point assets at what the adapter actually emits (verify with
  `npx wrangler deploy --dry-run`); keep `main = "dist/_worker.js"`.
- `database_id = "REPLACE_WITH_D1_ID"` cannot be resolved here: add an exact
  LAUNCH checklist (README deploy section): `wrangler d1 create movie_reviews`
  → paste id → `wrangler d1 migrations apply movie_reviews --remote
  --migrations migrations/` → `wrangler secret put` for
  TMDB_API_KEY/OMDB_API_KEY/OPENROUTER_API_KEY/ADMIN_PASSWORD (+ SESSION_SECRET
  if code reads it) → set SITE_URL → `npm run deploy`.
- No secret values in the repo, ever.

## L3 — Calmer `/reviews` on the Stream (discovery) preset

`reviews/index.astro:32-51` always renders the glam archive layout; unlike
`index.astro:39-48,95-109` it has no `isDiscovery` branch
(`movies/[tmdbId].astro:42-48` even voids the theme). Add the branch reusing
existing discovery components/tokens (same cards, same data, calmer rhythm).
Publication (glam) layout stays default. No new design tokens.

## L4 — Verification (evidence required, after L1–L3)

- `npm test` green (188 + new session tests), `npm run build` Complete.
- Browser E2E on dev: signup → login → post member review → visible on title
  page → report → admin hide → hidden publicly → profile lists it.
- `wrangler deploy --dry-run` clean. Production smoke (real D1 + secrets)
  needs owner credentials — ends as a checklist handoff if unavailable.
