## Task L4 — Launch verification (runs after L1–L3, all reporting complete)

Plan section: `docs/superpowers/plans/2026-10-07-launch-minimal.md` → Task L4.
Follow the 5 steps + global constraints exactly.

Review context from lead (already verified by diff review, do not re-litigate):
- L1: `session.ts` DB rewrite approved (Map gone, ISO timestamps, lazy sweep,
  `resolveSessionDb` → `locals.runtime.env` → D1, local fallback). Call-site
  churn is mechanical `await` + db threading. `save-draft.ts` platformPick
  lines intact (:49,:70).
- L2: `wrangler.toml` assets `"dist"` approved; README LAUNCH checklist added.
- L3: `reviews/index.astro` only (127 lines, discovery branch mirrors index).
- Suite is 195 tests / 21 files (188 + 7 session tests).

Execution notes:
- Restart the dev server first (it predates L1–L3 edits):
  `pkill -f "astro dev"; sleep 2; set -a; source .env; export SITE_THEME=discovery;
  nohup npm run dev -- --port 4321 --host 127.0.0.1 > /tmp/astro-dev.log 2>&1 &`
  then curl-check root + `/src/styles/global.css` are 200.
- NEVER run `npm install` (tree is pinned: react 4.4.2 + lightningcss 1.33.0).
- B end-to-end uses the dev DB; restore any rows you dirty (re-hide/unflag).
  Prefer a throwaway signup user; do NOT publish/unpublish editorial rows.
- chrome-devtools `take_snapshot` requires numeric pageId (`list_pages` first).
- Production deploy needs the owner's Cloudflare account (D1 id + secrets):
  do NOT attempt a real deploy — dry-run only, hand back the checklist.

Write report to `.superpowers/sdd/launch-L4-report.md` and report back under
25 lines: test/build/dry-run status, per-check PASS/FAIL with observed values,
B end-to-end result, what (if anything) needs the owner.
