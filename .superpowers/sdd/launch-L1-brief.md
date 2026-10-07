## Task L1 — D1-backed sessions (deploy blocker)

Plan section: `docs/superpowers/plans/2026-10-07-launch-minimal.md` → Task L1
(spec §L1). Follow the plan steps + global constraints exactly.

Key facts (verified by survey, re-verify before editing):
- `src/lib/auth/session.ts:21` in-memory `Map`, cookie `admin_session` (:6), 12h TTL
- DB pattern: `src/lib/db/adapter.ts:87-95` (`getDb`, D1 else `./data/local.db`)
- Member-route env pattern: `src/pages/api/member/reviews.ts:17-99`
- Migration naming: `migrations/0005_moderation.sql` (yours: `0006_sessions.sql`)

Review protocol: snapshot baseline is `.superpowers/sdd/snap-launch-base/`
(diff your touched files against it afterwards for your own self-check).
Write report to `.superpowers/sdd/launch-L1-report.md` and report back under
20 lines: tests added + counts, build status, call sites touched, migration
applied Y/N, no-in-memory-store grep result.
