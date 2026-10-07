## Task S2 — TV write path + search entry points

Plan: `docs/superpowers/plans/2026-10-07-series-hubs.md` → Task S2
(spec §S2). Follow plan steps + global constraints exactly.

Key facts (verified, re-verify before editing):
- Backend already media-agnostic: `ReviewMedia = 'movie'|'tv'`
  (`src/lib/members/reviews.ts:18`), validation `:91-92`
- UI hardcodes: `movies/[tmdbId].astro:92` (`"movie"` list arg),
  `:274` (`media="movie"` form prop)
- Movie search helper to mirror: `searchMoviesByTitle`
  (`src/lib/tmdb/client.ts:152`); search page: `src/pages/search.astro`
  (Movies section + `type` chips + `<details>` expander pattern)

Write report to `.superpowers/sdd/series-L2-report.md`; commit your work
(`series write path + search (S2)`); report back under 20 lines.
Do NOT push (lead pushes). Do NOT run `npm install`. Do NOT touch `data/`
or `.env`. If S1's `series/[tmdbId].astro` doesn't exist yet (parallel
run), hardcode/assume its URL shape `/series/${id}` for tile hrefs.
