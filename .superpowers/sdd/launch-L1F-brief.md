## Task L1F — Unify DB resolution to runtime env (L4-found defect)

Background: L4 report (`.superpowers/sdd/launch-L4-report.md`) — member
signup/login return 200+cookie but every member-guarded call 401s.

Root cause (lead-confirmed): `resolveDb` in `src/pages/api/auth/signup.ts:30-39`
(duplicated in `login.ts:22-23`) resolves `req.db → req.locals.db → getDb({})`
— it never checks `locals.runtime.env` (Miniflare D1 in dev via platformProxy,
real D1 in prod). Guards use `resolveSessionDb`, which DOES prefer runtime env.
Sessions get written to local SQLite and read from D1 → 401s. Same gap likely
in `resolveMemberDb` (`src/lib/members/reviews.ts:295-307`).

### Steps
1. Audit EVERY `getDb({})` fallback and every `resolve*Db` helper in `src/`
   (`grep -rn "getDb({})" src/`, `grep -rn "resolveMemberDb\|resolveSessionDb\|resolveDb" src/`
   | wc per file). List which ones are runtime-env-aware and which are not.
2. Unify the priority everywhere: injected/test db → `locals.db` →
   `locals.runtime.env.DB` → `getDb({})` local fallback. Prefer a single shared
   helper over triplicated logic (keep exported names stable; internal
   consolidation is fine).
3. Add a regression test in `tests/launch-sessions.test.ts` (or a new
   `tests/launch-db-resolution.test.ts`): create a session through the
   signup/login resolution path with a runtime-env-shaped fake
   (`{ locals: { runtime: { env: { DB: testDb } } } }`) and read it back through
   `resolveSessionDb` + `requireMemberApi`-equivalent guard path. Must FAIL
   before the fix (verify by stashing the fix mentally — or assert both
   resolvers return the same object for the same input).
4. `npm test` (expect 195+ new), `npm run build` (Complete). Do NOT run
   `npm install`. Do NOT mutate `data/reviews.json`; tests use temp DBs only.

### Then re-verify B end-to-end (same flow L4 used)
5. Restart dev (`pkill`, `source .env`, `SITE_THEME=discovery`, port 4321,
   curl-check 200s). chrome-devtools (`take_snapshot` needs numeric pageId):
   throwaway signup → login → post member review → visible on
   `/movies/[tmdbId]` → report → admin moderation hide → hidden publicly →
   `/u/[handle]` lists it. Restore dirtied dev rows. Note: `listForUser` is
   visible-only (profile lists pre-hide only) — account for that in the flow.

Write report to `.superpowers/sdd/launch-L1F-report.md`; report back under
25 lines: audit table (resolver → aware Y/N → fixed Y/N), regression test
result, suite/build status, B e2e PASS/FAIL with observed values.
