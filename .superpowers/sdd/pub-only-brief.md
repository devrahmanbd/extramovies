# Publication = reviews-only magazine (discovery keeps movies UI)

Deploy truth: theme is deploy-time per site (extramovies.org = discovery,
cinemavilla.in = publication). Publication must not present movie-discovery
UI. Detail pages (`/movies/[id]`, `/series/[id]`) STAY live in both themes —
member reviews live there, review cards link there, Google indexes them.
Only entry-point/discovery surfaces change, and only under publication.

## Workstream A — OWNER: movies browse + sitemap (no other files)
1. `src/pages/movies/index.astro`: under publication theme (`currentTheme()`
   → `"publication"`), HTTP-redirect to `/reviews` (permanent — theme is
   deploy-time constant). Discovery rendering untouched.
2. `src/pages/sitemap.xml.ts`: omit the `/movies` hub entry when the
   resolved theme is publication (GET may go async; `currentTheme()` never
   throws). Detail `/movies/[id]` entries stay in both themes.
3. Tests: redirect fires only under publication (mock theme via env/DB the
   way existing theme tests do — check `tests/theme-core.test.ts` first);
   sitemap includes/excludes `/movies` per theme.

## Workstream B — OWNER: search scoping (no other files)
`src/pages/search.astro`: under publication, render ONLY the Reviews section
(no Movies/Series sections, no movie/series filter chips, counts reflect
reviews only). Discovery rendering byte-identical to today. Tests for both
branches (mock theme as above). `npm run build` must pass.

## Rules for both
- Working directory: /Users/rahman/Documents/Movie Review. No `npm install`.
- Check `tests/theme-core.test.ts` + `tests/discovery.test.ts` FIRST for the
  established theme-mocking pattern — reuse it, don't invent.
- Homepage, nav, detail pages, review archive: already correct, DO NOT TOUCH.
- Run full `npm test` + `npm run build`. Commit with the given messages
  (`pub movies redirect (A)` / `pub search reviews-only (B)`), do NOT push.
- Report back under 12 lines.
