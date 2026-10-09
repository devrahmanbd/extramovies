# Brand-override diagnosis (lead verified code is wired; behavior differs by host)

## Workstream A — OWNER: local end-to-end proof (dev server :4321)
Dev server RUNNING at http://127.0.0.1:4321 (do NOT restart it, no npm install).
1. Save brand overrides through the REAL stack (not direct DB writes):
   login as editor@example.com / preview1234 via browser, open
   /admin/settings, set Site name to `BrandProbe` and Logo path to
   `/brand/noir-cinema/icon.svg`, Save Draft/Save.
2. Verify on ALL of: `/` (header wordmark, `<title>`, logo img src),
   `/reviews`, `/movies/693134` (JSON-LD Organization name), `/u/rakib`,
   `/rss.xml` (channel title). Record exact observed strings.
3. Revert both fields via the same UI, re-verify defaults restored.
4. Report back under 15 lines: per-surface PASS/FAIL with observed values.
   If ANY step fails (login/save/no-change), capture the exact error + console
   messages and report BLOCKED with the step number.

## Workstream B — OWNER: remote build-age fingerprint (NO auth, NO writes)
For BOTH https://extramovies.org and https://cinemavilla.in (plain curl only):
1. `/search?q=breaking+bad` → note: Series section present? (added late Oct)
2. `/reviews/dune-part-two` → "Title hub" fact link present? (added late Oct)
3. `/sitemap.xml` → hub `<lastmod>` entries present?
4. `/movies/693134` → heading text `From The Platform`? + `.title-badges` CSS?
5. `/login` → `<title>` says Extramovies (not Movie Review)?
6. `/` → footer/header brand name string.
Report a table per site: feature present/absent (proof snippet each). Verdict
which site runs STALE code (= missing late-October features) and roughly how
old (which newest-present feature). Under 15 lines. If a site is down,
say so with the HTTP code — do not retry more than twice.
