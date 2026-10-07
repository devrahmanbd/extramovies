# Task 5 report — Full verification (2026-10-07)

## 1. Unit + build
- `npm test`: **188/188 across 20 files** (incl. 5 platform-pick tests)
- `npm run build`: **Complete** (after declaring the missing `lightningcss` dep, see §5)

## 2. Visual QA (chrome-devtools, dev server :4321, SITE_THEME=discovery)
- `/` @1200: 2 `.title-badges` (both "Reviewed": /movies/414906, /movies/475557), 0 `.platform-pick`, scrollWidth 1200==innerWidth
- `/movies/693134`: heading verbatim `From The Platform` (id `d-review-heading`), old heading absent, teaser `.d-journal-slot` → `/reviews/dune-part-two`, no overflow
- `/reviews`: Dune card 1 `.platform-pick` pill, Batman/Joker clean, no overflow
- Widths 1200/692/400 (emulate): scrollWidth===innerWidth everywhere; screenshot `.superpowers/sdd/task5-reviews-400.png`
- Console: `/movies/693134` + `/reviews` clean; `/` 504 (stale optimizer) GONE on final tree; admin page clean
- Dune dual-pill tile: NOT-FOUND on any live strip (Dune absent from TMDB rails) → covered by unit test (`getTitleBadges(693134)` = both true) + code path (MovieTile.astro:55-58), not screenshot
- Task-3 minor resolved: added `aria-hidden="true"` to `.title-badges` (matches fallback-span precedent); tests+build re-run green

## 3. Admin round-trip (full UI path, editor@example.com)
- Tick Platform Pick → Save Draft → `"platformPick": true` in `data/reviews.json` (Barbie draft)
- Untick → Save Draft → field absent (0 matches file-wide); file left restored
- NOTE: UI hydration failed on intermediate trees (`jsxDEV is not a function`, stale optimizer); PASS on final tree with zero console errors

## 4. Subagent QA passes
- Code/tests/build subagent: Tasks 1–4 PASS with file:line evidence; schema.ts + migrations/ clean; 188/188
- Browser/admin subagent: all URL/width/console checks PASS; admin API-verified PASS (UI blocked at the time by env)
- Follow-up subagent: build Complete; hydration FAIL pre-fix; round-trip API PASS; 504 persisting pre-fix
- All three env findings below confirmed by lead and fixed

## 5. Pre-existing env fixes (no source-code impact)
- `@astrojs/react@7.0.0` (Vite 8/rolldown) under astro 5.18/Vite 6 → every client asset 500 (`Missing field moduleType`). Pinned to `^4.4.2` in package.json + lockfile (user-approved).
- `lightningcss` was never a declared dep (build only passed via accidental hoist from the v7/vite-8 subtree). Declared `^1.33.0` (astro.config requires `cssMinify: 'lightningcss'`).
- `node_modules`-only patches do NOT stick (any npm install reverts per lockfile) — recorded for future sessions.

## Verdict
Task 5 **COMPLETE with evidence**. Outstanding non-blockers: none. ROADMAP sub-project A ticked.
