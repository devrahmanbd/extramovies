# Movie+review cross-theme functional sweep — brief

## Target (per agent — see dispatch prompt for YOUR server + theme)
- `take_snapshot` requires a numeric pageId — call `list_pages` first.
- Widths: 1440 primary; spot-check 400 on `/movies/693134` only.
- Do NOT edit files. Do NOT restart servers. Do NOT run npm install.
- chrome-devtools `evaluate_script` + `take_snapshot` + `list_console_messages`
  (error+warn per page) are your tools.

## Checklist (every URL: HTTP 200, key elements present, console clean)

1. `/movies` — filter UI renders (title/genre/year/provider inputs + Apply);
   results grid with tiles; tile badges correct for theme (Reviewed-only on
   Batman/Joker tiles; note: Dune rarely in strips — report NOT-FOUND if so).
2. `/movies/693134` — hero (title/year/meta), providers block, editorial
   review teaser with working "Read the full review" link, member reviews
   section (empty-state + login prompt when anonymous), heading
   `From The Platform`, no horizontal overflow.
3. `/reviews` — archive renders (cards or tiles per theme); Dune entry carries
   the Platform Pick pill; Batman/Joker carry none; genre nav works
   (click a genre → filtered list, URL holds `?genre=`).
4. `/reviews/dune-part-two` — full review body, rating, WhereToWatch block,
   RelatedReviews strip, fact-list "Title hub" link → `/movies/693134`
   (click it, confirm lands on the movie page).
5. `/search?q=Dune` — BOTH Movies and Reviews sections with results; Dune tile
   shows exactly ONE pill (Platform Pick); review card shows its pill;
   `type=movie` and `type=review` filters each isolate correctly.
6. `/` — review/movie entry points render for YOUR theme without console errors.

## Report
Write `.superpowers/sdd/theme-func-<theme>-report.md` (full findings) and
report back under 25 lines: per-URL PASS/FAIL with observed values, every
violation with selector + expected-vs-actual, console errors verbatim, and
an overall BROKEN/OK verdict for movie+review on your theme.
