# Task 2 Report — Admin persistence for platformPick

**Status:** DONE
**Date:** 2026-10-07

## What I implemented

Followed `task-2-brief.md` verbatim, in TDD order:

1. **Step 2.1 — `src/pages/api/admin/_store.ts`**: added to `export interface Review`, after `region?: string;` (L37):
   ```ts
   /** Owner-curated "Platform Pick" badge shown on public title/review cards. */
   platformPick?: boolean;
   ```
2. **Step 2.2 — `src/pages/api/admin/save-draft.ts`**: added `platformPick: body.platformPick === true ? true : undefined,` after the `region:` line in **both** branches (update branch L49, new-draft branch L70). Explicit key after the spread clears the flag when unchecked/absent; `undefined` drops out of `JSON.stringify` on write. `publish.ts` untouched (per brief).
3. **Step 2.3 — `src/components/admin/ReviewEditor.tsx`**:
   - State after `region` state (L79): `const [platformPick, setPlatformPick] = React.useState(initial?.platformPick ?? false);` (mirrors existing `useState(initial?.x ?? default)` pattern)
   - `collectPayload()` after `region: region.trim(),` (L117): `platformPick: platformPick || undefined,` (checked → `true`, unchecked → key absent)
   - UI: checkbox label inside Metadata card (`aria-label="Metadata"`), after the Slug/Excerpt `.row` div, before `</section>` (L274–277), verbatim from brief.

## Type-level TDD evidence (RED → GREEN)

Command (both runs, identical flags):
```bash
npx tsc --noEmit --strict --module esnext --moduleResolution bundler --target es2022 --skipLibCheck tests/platform-pick.test.ts
```

**RED (before edits):**
```
tests/platform-pick.test.ts(41,9): error TS2353: Object literal may only specify known properties, and 'platformPick' does not exist in type 'Review'.
tests/platform-pick.test.ts(45,51): error TS2339: Property 'platformPick' does not exist on type 'Review'.
tests/platform-pick.test.ts(57,21): error TS2339: Property 'platformPick' does not exist on type 'Review'.
```

**GREEN (after edits):** no output, exit 0.

## Test evidence

Focused vitest (after edits) — 5/5 green:
```
✓ tests/platform-pick.test.ts > getTitleBadges > returns reviewed + platformPick for the flagged Dune demo row
✓ tests/platform-pick.test.ts > getTitleBadges > returns reviewed-only for reviewed but unflagged titles
✓ tests/platform-pick.test.ts > getTitleBadges > returns no badges for unknown tmdb ids
✓ tests/platform-pick.test.ts > getTitleBadges > never throws on invalid ids
✓ tests/platform-pick.test.ts > platformPick store round-trip > persists and clears platformPick through the admin store
Test Files  1 passed (1)
     Tests  5 passed (5)
```
Note: the round-trip test was behaviorally green even before edits (runtime doesn't typecheck JSON round-trips) — its failure mode was the type-level RED above, which the `Review` interface field clears. The test asserts real persist (`platformPick === true` after `upsertReview`) and real clear (`undefined` for a row saved without the key).

## Full verification

| Check | Command | Result |
|---|---|---|
| Focused test | `npx vitest run tests/platform-pick.test.ts` | 5/5 pass |
| tsc RED→GREEN | direct tsc on test (above) | 3 errors → 0, exit 0 |
| Full suite | `npm test` (with `.env` sourced) | 20 files, 188/188 pass |
| Build | `set -a; source .env; set +a; npm run build` | exit 0, "Build Complete!" (ReviewEditor chunk built) |

## Files changed

- `src/pages/api/admin/_store.ts` — `platformPick?: boolean` on `Review` (111 lines)
- `src/pages/api/admin/save-draft.ts` — both branches set/clear the flag (85 lines)
- `src/components/admin/ReviewEditor.tsx` — state, payload serialization, checkbox UI (359 lines)

Untouched per constraints: `src/lib/db/schema.ts`, `migrations/`, `src/lib/seo/content.ts`, `src/lib/badges.ts`, `tests/platform-pick.test.ts` (read-only), `publish.ts`.

## Self-review findings

- Every brief step applied; code matches brief verbatim (interface comment/field, both save-draft branches, state/collectPayload/UI).
- Checkbox sits after the Slug/Excerpt row inside the Metadata card, before `</section>`.
- No additions beyond the brief; no new docs; all files well under 500 lines.
- Test suite leaves `data/reviews.json` untouched (test redirects `REVIEWS_DB_PATH` to a temp dir and deletes it).
- No git commands run (no repo, per constraints).

**Concerns:** none.
