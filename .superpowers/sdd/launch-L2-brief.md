## Task L2 — Wrangler + secrets wiring (deploy blocker)

Plan section: `docs/superpowers/plans/2026-10-07-launch-minimal.md` → Task L2
(spec §L2). Follow the plan steps + global constraints exactly.

Key facts (verified by survey, re-verify before editing):
- Build emits `_worker.js`, `_routes.json`, `_astro/`, `brand/`, `vendor/` at
  `dist/` root — there is NO `dist/client`, but `wrangler.toml:9` points there
- `wrangler.toml:16` D1 id is `REPLACE_WITH_D1_ID` (owner must create D1;
  do NOT invent an id — checklist points at the placeholder)
- Deploy script `package.json:24`; secrets named in `wrangler.toml:24-28`

Review protocol: snapshot baseline is `.superpowers/sdd/snap-launch-base/`.
Write report to `.superpowers/sdd/launch-L2-report.md` and report back under
20 lines: assets-dir fix, dry-run result, checklist location, anything you
could NOT verify without the owner's Cloudflare account.
