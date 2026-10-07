# Plan: Launch-minimal (sub-project: launch)

Spec: `docs/superpowers/specs/2026-10-07-launch-minimal-design.md`
Build via subagent-driven development (user-approved). Repo has **no git** —
reviews use snapshot diffs against `.superpowers/sdd/snap-launch-base/`, no commits.

## Global constraints (apply to every task)

- Baseline suite is 188 tests / 20 files — keep green; add tests for new logic.
- Files under 500 lines; validate input at system boundaries; no secrets in repo.
- `npm install` is now SAFE (manifest pinned: react ^4.4.2, lightningcss ^1.33.0)
  but unnecessary — do not run it unless adding a declared dep.
- Never mutate `data/reviews.json` or `data/local.db` content in tests — use
  temp DBs/files (`mkdtemp`, `REVIEWS_DB_PATH` pattern). Dev-server browser QA
  may use the dev DB; restore rows it dirties.
- CSS: reuse existing tokens only (OKLCH where colors are added).
- Each task writes its report to `.superpowers/sdd/launch-LN-report.md` and
  reports back under 20 lines.

---

## Task L1 — D1-backed sessions

**Files:** `src/lib/auth/session.ts` (rewrite storage), `migrations/0006_sessions.sql`
(new), `tests/launch-sessions.test.ts` (new), call sites in
`src/pages/api/auth/*`, `src/pages/api/admin/login.ts`, `src/lib/auth/guard.ts`,
`src/pages/api/auth/logout.ts` (signature follow-ups only).

### Steps

1. Map every importer of `session.ts` (`grep -rn "auth/session"`): record each
   call site + whether it can go async (Astro endpoints can).
2. Create `migrations/0006_sessions.sql`: `sessions` table per spec + index on
   `expires_at`. Apply to local dev DB only:
   `sqlite3 data/local.db < migrations/0006_sessions.sql`.
3. Rewrite storage in `session.ts`: same exports, D1/local via
   `getDb(env)` adapter pattern from `src/lib/db/adapter.ts:87-95` (mirror how
   `src/lib/members/*` resolves the DB). Endpoints receive `env` via
   `Astro.locals.runtime.env` (cloudflare adapter) — follow the existing
   member-reviews route pattern. Keep cookie name `admin_session`, 12h TTL,
   CSRF check in guards, lazy sweep of expired rows on read.
4. Add `tests/launch-sessions.test.ts` (temp DB file, never `data/local.db`):
   create → validate (role + csrf) → wrong-token rejected → expired rejected →
   logout destroys → clearExpired purges. Fast, no network.

### Verify Task L1

```bash
npm test                    # 188 + new session tests, all green
npm run build               # Complete
grep -rn "new Map\|store\.set(token" src/lib/auth/   # no in-memory session store left
```

---

## Task L2 — Wrangler + secrets wiring

**Files:** `wrangler.toml` (assets dir), `README.md` (LAUNCH checklist in deploy
section — read it first, append a checklist, don't restructure).

### Steps

1. Confirm what the adapter emits: `ls dist/` after a fresh `npm run build`
   (`_worker.js`, `_routes.json`, static dirs at root — no `dist/client`).
2. Fix `[assets] directory` to match (expected `"dist"`); confirm `main`
   still `dist/_worker.js`. Run `npx wrangler deploy --dry-run` — must be
   config-clean (auth not required for dry-run).
3. README deploy section: append exact LAUNCH checklist — `wrangler d1 create`,
   paste `database_id`, `wrangler d1 migrations apply --remote`, `wrangler
   secret put` list (TMDB_API_KEY, OMDB_API_KEY, OPENROUTER_API_KEY,
   ADMIN_PASSWORD, SESSION_SECRET if read), set SITE_URL + ADMIN_EMAIL,
   `npm run deploy`. Mark which steps need the owner's Cloudflare account.

### Verify Task L2

```bash
npm run build && npx wrangler deploy --dry-run   # config-clean
grep -n "REPLACE_WITH_D1_ID" wrangler.toml       # still placeholder + checklist points at it
```

---

## Task L3 — Calmer `/reviews` on discovery preset

**Files:** `src/pages/reviews/index.astro` (add `isDiscovery` branch).

### Steps

1. Read `reviews/index.astro` fully + the discovery branch pattern in
   `index.astro:39-48,95-109` (which components/tokens the calm layout uses).
2. Add the `isDiscovery` branch rendering the same review data with the
   discovery components; publication glam layout untouched as default.
3. No new tokens, no new files unless a tiny partial is clearly cleaner (still
   <500 lines total).

### Verify Task L3

```bash
npm test && npm run build   # green
```

Visual QA deferred to L4 (both themes × 1200/400, no overflow, same data).

---

## Task L4 — Verification (runs AFTER L1–L3 report back)

1. `npm test` (188 + new), `npm run build` (Complete).
2. Visual QA (chrome-devtools, dev `:4321`, both `SITE_THEME=discovery` and
   `publication`): `/reviews` calm vs glam, same data; widths 1200/400 no
   overflow; console clean.
3. B end-to-end (browser): signup → login → post member review → visible on
   `/movies/[tmdbId]` → report it → admin moderation hide → hidden publicly →
   `/u/[handle]` lists it. Restore any dirtied dev rows.
4. `npx wrangler deploy --dry-run` clean. Production smoke needs owner
   credentials (D1 id + secrets + domain) — if unavailable, hand back an exact
   checklist instead of deploying.
5. Tick ROADMAP launch items; write `.superpowers/sdd/launch-L4-report.md`.
