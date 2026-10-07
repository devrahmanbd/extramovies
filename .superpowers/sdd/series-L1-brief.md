## Task S1 — Series hub page (read + write UI for TV)

Plan: `docs/superpowers/plans/2026-10-07-series-hubs.md` → Task S1
(spec `docs/superpowers/specs/2026-10-07-series-hubs-design.md` §S1).
Follow plan steps + global constraints exactly.

Key facts (verified, re-verify before editing):
- Mirror target: `src/pages/movies/[tmdbId].astro` (283 lines)
- Data: `getTvMetaSafe` in `src/lib/tmdb/series.ts:409` (never throws)
- Member list: `listMemberReviews(db, tmdbId, "tv", 20)` — confirm signature
- Form/list: `src/components/member/MemberReviewForm.astro` (110),
  `MemberReviewList.astro` (137)
- No editorial series rows exist — no editorial slot; no sitemap entries

Write report to `.superpowers/sdd/series-L1-report.md`; commit your work
(`series hub page (S1)`); report back under 20 lines. Do NOT push (lead pushes).
Do NOT run `npm install`. Do NOT touch `data/` or `.env`.
