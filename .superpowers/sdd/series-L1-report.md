# Report: Task S1 — Series hub page

## Done
- New `src/pages/series/[tmdbId].astro` (~230 lines): lean mirror of
  `src/pages/movies/[tmdbId].astro` per spec §S1.
- New `tests/series-hub.test.ts`: 7 static contract tests (page composition only).

## Wiring (all verified in test)
- Data: `getTvMetaSafe(tmdbId, region)`; `!ok` → 404 + noindex unavailable page.
- Providers: `getTvProvidersRaw` → `normalizeWatchProviders` (TV endpoint);
  never `getStreamingAvailability` (movie endpoint). Same `WhereToWatch` partial.
- Members: `listMemberReviews(db, tmdbId, "tv", 20)` — signature confirmed
  `(db, tmdbId, media='movie', limit)`; form `media="tv"`.
- SEO: `TVSeries` + `BreadcrumbList`; `aggregateRating` only when member
  ratings exist. No editorial slot, no related strip, no sitemap entries.
- Null-tolerant: title/year/genres/poster/backdrop all conditional
  (safeShowDefaults path); numeric-id 404 guard.

## Verify
- `npm test`: 26 files / 223 passed (baseline 216 + 7 new), green.
- `npm run build`: Complete.
- Commit `series hub page (S1)` on main. NOT pushed (lead pushes).

## Notes for lead (browser QA deferred)
- Try dev `:4321` `/series/1399`: hero, providers, member list+form; `!ok`
  id renders the unavailable page.
- Breadcrumb middle links `/series` (no index page yet — S1 scope is hub only).
  Unavailable-page back link goes `/` (no series browse page exists).
