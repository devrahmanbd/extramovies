# Plan: Series hubs (S1 page, S2 write path + search)

Spec: `docs/superpowers/specs/2026-10-07-series-hubs-design.md`
Build via subagent-driven development (user-approved). Repo HAS git now —
work on the current branch, commit per task, push at the end. No force-push.

## Global constraints (apply to every task)

- Baseline suite 216 tests / 25 files — keep green; add tests for new logic.
- Files under 500 lines; validate input at boundaries; no secrets in repo.
- Never mutate `data/reviews.json` or `data/local.db` in tests (temp DBs).
- Reuse existing components/tokens (MovieTile, MemberReviewList/Form,
  section/head patterns). No new CSS tokens.
- Each task writes its report to `.superpowers/sdd/series-LN-report.md` and
  reports back under 20 lines.

---

## Task S1 — Series hub page

**Files:** `src/pages/series/[tmdbId].astro` (new), `tests/series-hub.test.ts`
(new, only for pure logic you add — do not retest the lib).

### Steps

1. Read `src/pages/movies/[tmdbId].astro` fully + `series.ts` `ShowMeta`
   shape (`mapTvDetails` output) + `MemberReviewList/Form` props.
2. Build the page per spec §S1. Show titles/years/genres must tolerate nulls
   (safeShowDefaults path). Member list call: `listMemberReviews(db, tmdbId,
   "tv", 20)` — confirm the function signature accepts the media arg.
3. `npm test`, `npm run build`. Commit (`series hub page (S1)`).

### Verify Task S1

- Unit tests green; build Complete.
- Browser QA deferred to lead (dev `:4321`, e.g. `/series/1399` — verify hero,
  providers, member list+form render, `!ok` id renders the unavailable page).

---

## Task S2 — TV write path + search entry points

**Files:** `MemberReviewForm.astro` / `MemberReviewList.astro` (only if the
audit finds gaps), `src/lib/tmdb/client.ts` or `series.ts` (tv search
helper), `src/pages/search.astro` (Series section), tests.

### Steps

1. Audit media plumbing end-to-end (form prop → POST body → store
   `media_type` → list query). Fix gaps with minimal diffs; default stays
   `"movie"` everywhere it currently is.
2. Add tv-show search + a Series section on `/search` (mirrors the Movies
   section: 6 + `<details>` expander, `type=series` filter chip).
3. Tests: media plumbing (post tv + post movie on same tmdbId coexist;
   list filters by media), helper fail-soft (empty on bad input/no key).
4. `npm test`, `npm run build`. Commit (`series write path + search (S2)`).

### Verify Task S2

- New tests green; full suite green; build Complete.
- Browser QA deferred to lead (`/search?q=breaking+bad` shows Series section).
