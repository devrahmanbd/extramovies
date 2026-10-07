# Launch L3 report — Calmer `/reviews` on discovery preset

## Branch approach
Snapshot-diff workflow (repo has no git): edited working tree directly against
`.superpowers/sdd/snap-launch-base/` baseline, no commits. Mirrored the
`index.astro:39-48` theme-resolution pattern (`currentTheme()` with
publication fallback, `isDiscovery` flag); did NOT copy the
`movies/[tmdbId].astro:42-48` theme-void.

## Files touched
- `src/pages/reviews/index.astro` only (127 lines, <500). Added:
  - `currentTheme()` resolution + `isDiscovery` branch.
  - Discovery branch: slim `d-browse-head` header (crumb, `d-kicker`,
    `h1`, `d-lede` count), shared `GenreNav`, `d-results` section with
    `d-guide-grid` of `MovieTile` (`variant="compact"`, `source="ours"`,
    first tile eager). Review href prefers `/movies/{tmdbId}`, falls back to
    `/reviews/{slug}` (same rule as `DiscoverHome`). Same `reviews` data,
    same `?genre=` filter, single `h1` in both branches.
  - Publication glam layout untouched as default (still `ReviewCard`
    archive-lead/archive-cell; keeps `publication.test.ts` green).
- No new tokens (all classes pre-exist in `global.css`: `d-browse-head`,
  `d-crumb`, `d-kicker`, `d-lede`, `d-results`, `d-section-row`,
  `d-guide-grid`), no new files, no new dependencies, no `npm install`.

## Test / build status
- `npm test`: 20 files / 188 tests passed.
- `npm run build`: Complete (prerender + server built, no errors).

## Visual QA left to L4
Both themes × 1200/400 widths: `/reviews` calm vs glam, no overflow, same
data; console clean. Deferred per plan (Task L4 owns browser verification).
