## Task L3 — Calmer `/reviews` on discovery preset

Plan section: `docs/superpowers/plans/2026-10-07-launch-minimal.md` → Task L3
(spec §L3). Follow the plan steps + global constraints exactly.

Key facts (verified by survey, re-verify before editing):
- `src/pages/reviews/index.astro:32-51` always glam, no `isDiscovery` branch
- Discovery pattern: `src/pages/index.astro:39-48,95-109`
- `src/pages/movies/[tmdbId].astro:42-48` voids the theme (do not copy that)

Review protocol: snapshot baseline is `.superpowers/sdd/snap-launch-base/`.
Write report to `.superpowers/sdd/launch-L3-report.md` and report back under
20 lines: branch approach, files touched, test/build status, visual QA left
to L4.
