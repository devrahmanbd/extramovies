# Report: Task S2 — TV write path + search entry points

## Audit (media plumbing end-to-end)
- `POST /api/member/reviews` already accepts `tv` (validates via
  `validateReviewInput`, stores `media_type`) — verified with a new API-level
  test, not assumed.
- `MemberReviewList.astro` needs no change: it renders pre-filtered rows;
  filtering happens in `listForMovie(db, tmdbId, media)` (SQL `media_type =`).
- One real gap found: `MemberReviewForm.astro` login fallback hardcoded
  `/movies/${tmdbId}` even for `media="tv"` → now falls back to
  `/series/${tmdbId}` when `media="tv"`. Default stays `"movie"`.

## Changes
- `src/lib/tmdb/client.ts`: `searchShowsByTitle` (fail-soft `[]`, mirrors
  `searchMoviesByTitle`) + pure null-tolerant `mapShowToTile`
  (name→title, first_air_date→year). Lives in client.ts (not series.ts) to
  respect the 500-line file limit (series.ts already 452).
- `src/pages/search.astro`: Series section mirroring Movies (6 tiles +
  `<details>` expander, `MovieTile href="/series/…"`), `type=series` chip,
  counts in the status line. Assumes S1 hub URL `/series/${id}`.
- `tests/series-s2.test.ts` (new, 7 tests): tv+movie coexist on one tmdbId
  at API level + GET filters by media + 400 on bad media; helper fail-soft
  (blank input, fetch failure, no key) + success; tile mapping + nulls.

## Verify
- New: 7/7 pass. Full suite: 27 files / 230 tests green (baseline 216).
- `npm run build`: Complete.
- Browser QA deferred to lead: `/search?q=breaking+bad` → Series section.
