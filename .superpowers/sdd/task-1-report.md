# Task 1 Report — Data contract + `getTitleBadges` helper + unit tests (TDD)

**Status:** DONE_WITH_CONCERNS

## What I implemented

1. **`tests/platform-pick.test.ts`** (new) — test file copied verbatim from the brief (4 `getTitleBadges` unit tests + 1 store round-trip test).
2. **`src/lib/seo/content.ts`** — three brief-specified edits:
   - `PublicReview` gained `platformPick?: boolean;` with the brief's doc comment (now L60).
   - Dune demo row gained `platformPick: true,` after `featured: true` (now L164).
   - `TODO(db-owner)` block gained the `platform pick: add platform_pick BOOLEAN …` bullet (now L9).
3. **`src/lib/badges.ts`** (new) — `TitleBadges` interface + never-throws `getTitleBadges(tmdbId)`, verbatim from the brief.

## TDD evidence

### RED (before implementation)

Command: `npx vitest run tests/platform-pick.test.ts`

```
 FAIL  tests/platform-pick.test.ts [ tests/platform-pick.test.ts ]
Error: Cannot find module '../src/lib/badges' imported from '.../tests/platform-pick.test.ts'
 ❯ tests/platform-pick.test.ts:5:1
      5| import { getTitleBadges } from "../src/lib/badges";
Caused by: Error: Failed to load url ../src/lib/badges … Does the file exist?
 Test Files  1 failed (1)
      Tests  no tests
```

Expected failure reason (feature missing — `badges.ts` does not exist yet). ✔

### GREEN (after implementation)

Command: `npx vitest run tests/platform-pick.test.ts`

```
 ✓ tests/platform-pick.test.ts > getTitleBadges > returns reviewed + platformPick for the flagged Dune demo row 2ms
 ✓ tests/platform-pick.test.ts > getTitleBadges > returns reviewed-only for reviewed but unflagged titles 0ms
 ✓ tests/platform-pick.test.ts > getTitleBadges > returns no badges for unknown tmdb ids 0ms
 ✓ tests/platform-pick.test.ts > getTitleBadges > never throws on invalid ids 0ms
 ✓ tests/platform-pick.test.ts > platformPick store round-trip > persists and clears platformPick through the admin store 9ms
 Test Files  1 passed (1)
      Tests  5 passed (5)
```

## Verification results

| Command | Result |
|---|---|
| `npx vitest run tests/platform-pick.test.ts` | **5/5 passed** |
| `npm test` (full suite) | **20/20 files, 188/188 tests passed** — no regressions |
| `npm run build` | **green** — "[build] Complete!" |

## Known-fail from the brief: actual output

The brief said the store round-trip test would fail until Task 2's `Review` interface edit ("expect exactly one failing suite … full green comes at task 2").

**Actual output: the store test PASSES already in Task 1** (see GREEN output above). Root cause, verified:

- `upsertReview` in `src/pages/api/admin/_store.ts:86` persists the object as-is (`all.push(review)` → JSON round-trip), so the undeclared `platformPick` field survives at runtime.
- Vitest transpiles with esbuild and does **not** type-check, so the excess-property error never surfaces in the test run.
- The brief's predicted failure does exist at type-check level — confirmed with a direct `tsc` run on the test file:

```
tests/platform-pick.test.ts(41,9): error TS2353: Object literal may only specify known properties, and 'platformPick' does not exist in type 'Review'.
tests/platform-pick.test.ts(45,51): error TS2339: Property 'platformPick' does not exist on type 'Review'.
tests/platform-pick.test.ts(57,21): error TS2339: Property 'platformPick' does not exist on type 'Review'.
```

- These three errors will clear exactly when Task 2 adds `platformPick?: boolean` to the `Review` interface. Note: `tsconfig.json` `include` covers only `src/`, `scripts/`, `migrations/` — `tests/` is excluded, so even `astro check`/`tsc -p .` won't flag them; only a direct tsc invocation on the test file does.

The test was **not** weakened — it still asserts real runtime behavior, and the type-level failure the brief anticipated is present and verified.

## Files changed

- `tests/platform-pick.test.ts` — new (67 lines)
- `src/lib/badges.ts` — new (25 lines)
- `src/lib/seo/content.ts` — 3 edits (+4 lines, now 328 lines)

No schema/migrations touched, no git commands run, no doc files created. All files well under 500 lines.

## Self-review findings

- **Completeness:** All brief steps 1.1–1.3 done verbatim; verify commands run; full suite run as extra regression check.
- **Quality:** Code copied verbatim from brief; names/structure unchanged.
- **Discipline:** Nothing beyond the brief (no schema change, no store edit — that's Task 2, no YAGNI additions).
- **Testing:** RED → GREEN evidence captured above; tests assert real behavior (real demo data, real store round-trip, temp-dir DB isolation).

## Concerns

1. **Store test passes early (brief expected a fail until Task 2).** Explanation above — type-level failure exists, runtime test green. If Task 2's brief also expects a RED on this test, expect it to be green immediately for the same reason.
2. Pre-existing unrelated tsc errors in `src/pages/api/setup/_store.ts` (TS2352, TS2578) exist in the repo — untouched by this task, not caused by it.
