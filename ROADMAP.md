# ROADMAP

## Sub-projects (from 2026-10-07 brainstorm)

Each gets its own spec → plan → build cycle before work starts.

### A. Two-badge system (done 2026-10-07)

- [x] Title cards show `Reviewed` pill; review cards show amber `Platform Pick` pill
- [x] Movie-page heading `From the journal` → `From The Platform`
- [x] Flag persists via admin editor (`data/reviews.json`), no SQL migration

### B. Community reviews (large)

Every signed-up member can submit a review on a title (movie page), not just
the site author.

- Member review form on `/movies/[tmdbId]` (and later other title types)
- Distinction: editor reviews (admin-authored, existing) vs member reviews
- Moderation workflow reusing the existing moderation queue/admin
- Profile pages list a member's reviews; review pages show member byline
- Depends on: existing auth (`members`), moderation admin

### C. Social signals (medium)

- Like / dislike on any review (editor + member)
- Follow a reviewer; following feed or "reviews from people you follow"
- Depends on: B (reviews from many authors make signals meaningful)

### D. Content types — series, manga, anime (medium → large)

- Reviews attach to things people watch *and read*:
  - **Series**: TMDB TV support — same provider, moderate frontend/data work
  - **Anime / manga**: TMDB has no manga; needs a new source (e.g. MyAnimeList
    / Jikan API) — separate provider + attribution, larger effort
- Depends on: B (review→title model must be type-agnostic first)

### Launch readiness (minimal, 2026-10-07)

- [x] D1-backed sessions (no more in-memory Map); one DB per environment
- [x] Wrangler assets dir fixed; `deploy --dry-run` clean
- [x] B verified end-to-end (signup → review → report → moderate → profile)
- [x] Calmer `/reviews` on the Stream preset
- [x] Production deploy (CyberPanel + OLS reverse proxy → PM2, live 2026-10-07)

## Original items

- [ ] Calmer `/reviews` layout on the Stream (discovery) preset
- [ ] Rotten Tomatoes API integration (needs API key)
- [ ] 2 more presets (scope to clarify)
