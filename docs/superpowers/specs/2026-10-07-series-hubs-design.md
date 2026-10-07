# Spec: Series hubs — read + write on TV (publication-first)

User directive: themes differ by features; publication users read AND write
reviews on movies AND web series. Movies already do both. Series has a full
TMDB TV data layer (`src/lib/tmdb/series.ts`: getTvMetaSafe, mapTvDetails,
providers) and a media-agnostic member backend (`media: 'movie'|'tv'`, one
review per user per tmdb+media) — but zero pages and movie-hardcoded UI.

## S1 — Series title hub (`src/pages/series/[tmdbId].astro`)

Lean mirror of `src/pages/movies/[tmdbId].astro` (283 lines, read it first):
- Data: `getTvMetaSafe(tmdbId, region)` (NEVER throws; `ok:false` → friendly
  unavailable page, indexable-safe `noindex` when !ok like the movie page).
- Sections: hero (title/year/genres/poster/backdrop), providers/watch block
  (same partials as movies page where shape-compatible), member reviews
  (`MemberReviewList` + `MemberReviewForm` with `media="tv"`).
- SEO: title `{Show} ({Year}) — reviews, verdict & where to watch`-family
  wording consistent with movie hubs; meta with verdict/rating/where-to-watch;
  JSON-LD `TVSeries` + BreadcrumbList (no AggregateRating until member data
  exists — same conditional pattern as movies).
- OUT: editorial-review slot (no series rows in content.ts), related strip,
  sitemap entries (no seed content yet — revisit when editorial covers series).

## S2 — TV write path + entry points

1. Media plumbing audit: `MemberReviewForm` (does it accept/forward a `media`
   prop? default must stay `"movie"`), `POST /api/member/reviews` (already
   accepts tv — verify with a test, don't assume), `MemberReviewList` (must
   filter by media so movie/tv reviews never mix on a page).
2. Entry points: TV results on `/search` (TMDB `/search/tv` via a
   `searchShowsByTitle`-style helper mirroring `searchMoviesByTitle`;
   MovieTile with explicit `href="/series/…"`), linking into the new hubs.
   No new tokens/CSS unless the tile grid genuinely needs it (it shouldn't).
