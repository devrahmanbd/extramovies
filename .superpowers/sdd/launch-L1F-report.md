# L1F — Unify DB resolution to runtime env (2026-10-07)

## Status: PASS — B end-to-end green, suite 200/200, build Complete

## 1. Audit (every `getDb({})` fallback + `resolve*Db` in `src/`)

| Resolver | File | Runtime-env-aware pre-fix? | Fixed? |
|---|---|---|---|
| `resolveSessionDb` | `lib/auth/session.ts:82` | Y (req.db → locals.db → runtime.env/req.env → getDb) | Y (delegates to shared helper) |
| `resolveMemberDb` | `lib/members/reviews.ts:298` | **N** (req.db → locals.db → `getDb({})`) | Y (delegates; keeps DB_UNAVAILABLE) |
| `resolveRequestDb` | `lib/watchlist/store.ts:120` | **N** (same gap) | Y (delegates; keeps DB_UNAVAILABLE) |
| local `resolveDb` | `api/auth/signup.ts:31`, `api/auth/login.ts:15` | **N** (same gap — the L4 split-brain) | Y (both delegate to `resolveSessionDb`) |
| direct `getDb({})` page reads | `movies/[tmdbId].astro:91`, `u/[handle].astro:40,55,83`, `Base.astro:72`, `admin/settings.ts:47`, `tmdb/discover.ts:64`, `setup/_store.ts:41`, `admin/moderation.astro:18` | N/A (no req; unchanged, out of scope) | N (unchanged — see §2) |

## 2. Fix + one deliberate deviation from the brief's literal priority

- New single helper `resolveDbFromRequest` (`lib/db/adapter.ts`): injected → locals.db → runtime env → local fallback. All four resolvers above delegate to it (exported names stable).
- Deviation: a `DB` binding is authoritative **only when no `DB_FILE` is configured** (i.e. Workers prod). Reason (found while re-verifying): dev `platformProxy` always injects an **empty scratch Miniflare D1** (persisted shell in `.wrangler/state`, zero app tables) while `.env` declares `DB_FILE=./data/local.db` and every page reads it directly. Literal brief priority made signup/login 500 in dev (users table missing in D1 — observed `500 POST /api/auth/signup`) and would still split-brain dev (writes→D1, page reads→local.db). With the rule, every resolver computes the same DB from the same input in every environment: local.db in dev, real D1 in prod. No split possible either way.

## 3. Regression test (`tests/launch-db-resolution.test.ts`, 5 tests)

Runtime-env-shaped fakes (`{ locals: { runtime: { env: { DB_FILE: tmp } } } }`, temp DBs only): write via session path → read via member path; `requireMemberApi` guard accepts (was 401); injected db still wins; watchlist honors env; **decoy test**: fake empty D1 `DB` binding + configured `DB_FILE` → file wins (round-trip works).
Discrimination verified: original code fails the core round-trip (1 failed/3 passed); naive-unified code (no D1-vs-file rule) fails the decoy test; fixed code 5/5.

## 4. Suite / build

- `npm test`: **PASS — 22 files / 200 tests** (195 L4 baseline + 5 new; one transient single-failure seen once mid-edit, stable green on 3 reruns).
- `npm run build`: **PASS — `[build] Complete!`**. No `npm install`. `data/reviews.json` untouched.

## 5. B end-to-end (dev `:4321`, `SITE_THEME=discovery`) — PASS

curl: signup A 200+cookie → login 200 → `POST /api/member/reviews` **200 `{ok:true,id:mr_fae9…}`** (was 401 pre-fix) → visible on `/movies/693134` (grep 1) → `/u/l1fverifya` lists it pre-hide (1) → signup B → B-report ok → admin login ok → flagged lists it (reports:1) → hide `{ok:true,status:hidden}` → movie page grep 0, baseline `Desert power` still 1.
Browser (chrome-devtools): form signup `l1fverifyc` → redirect `/` → nav shows `@L1FVERIFYC` + LOG OUT (session honored) → `/movies/693134` has review form, **no** "Log in to write a member review" (L4 symptom gone) → `/u/l1fverifyc` renders. Console errors: none.
Note: `listForUser` is visible-only, so post-hide profile exclusion is expected (per brief).

## 6. Dev DB restore — PASS

`users 3 / member_reviews 1 (mr_aefc… visible) / review_reports 1 / sessions 0` — matches L4 baseline; throwaways (3 users, review, report, sessions incl. admin cookie session) deleted.
