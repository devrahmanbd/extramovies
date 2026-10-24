# Session report — .htaccess redirect, GSC CDP attempt #3, Bing queue (2026-10-25)

Owner instruction: "Use .htaccess for it, and submit rest of the url in GSC using chrome CDP and bing api
(use last conversation file)." Three parts, all closed out below.

## 1. .htaccess http→https redirect — shipped and verified live

- Mechanism: CI-managed server state, not a git-tracked file. `.github/workflows/deploy.yml` step 6b (both
  site jobs) prepends a marked block (`BEGIN canonical-host-redirect`) to `$APP_DIR/.htaccess`, preserving
  panel-written content, then restarts lsws. `.htaccess` is now gitignored so a panel-written file can never
  collide with the deploy. A tracked file would have aborted every subsequent `git pull` on the boxes.
- Block does three things: non-apex host → 301 to apex, `HTTPS != on` → 301 to https, and an
  `/htaccess-canary` probe → 301 to `/` (301 proves LiteSpeed reads our file; an app 404 proves it does not).
- Release `ee80672` on `main`, ff-merged to `prod-extra`, deploy run 40125260140 succeeded (extramovies job
  only, 37s; seed import idempotent: "0 created, 0 refreshed, 3 skipped").
- Verification (all live, 2026-10-25):
  - Deploy log output line: `HTACCESS canonical redirect installed (extramovies.org)` + `DEPLOY OK`.
  - `curl -I https://extramovies.org/htaccess-canary` → 301 to `https://extramovies.org/` (file read).
  - `curl -I http://extramovies.org/` → 301 https; `https://www.` → 301 apex; homepage 200 with the
    discovery-theme marker.
- `docs/DEPLOY.md` §2b documents the mechanism and the canary semantics. Baseline capture:
  `docs/seo/baseline-gsc-2026-10-24.json`.

## 2. GSC — sitemap resubmit done; CDP Request Indexing attempt #3 fails identically

- Sanctioned path first: `gsc_sitemap_submit.py` PUT on `sc-domain:extramovies.org` with the full 84-URL
  sitemap → **HTTP 204**. That is the bulk "rest of the URLs" channel that actually works.
- The owner-directed CDP attempt ran on a copied instance of the owner's active profile (Profile 6,
  Chrome 156, headed, separate user-data-dir, no automation flags). One real pitfall was found and fixed:
  a non-foregrounded tab silently drops CDP input events (`Page.bringToFront` resolves it). With the tab
  foregrounded, the full pipeline works: box accepts the URL, `/inspect` loads, REQUEST INDEXING is found
  and clicked (trusted events, verified by capture-phase counter and `elementFromPoint`).
- Outcome: the click fires `recaptcha/api.js` → `api2/anchor` → `api2/reload` (2361-char token minted) →
  `Fj3Owf` validation RPC → `api2/clr`, all HTTP 200, then the same toast: "Oops! Something went wrong.
  We had a problem submitting your indexing request." Three URLs tried (/reviews/the-batman, /movies,
  /movies/414906), all refused identically. Full record appended to
  `docs/seo/gsc-index-worklist-2026-10-22.md` ("Third attempt" paragraph).
- Conclusion: the previously open variable ("a click from the real browser") is closed. Real browser, real
  signed-in session, valid token — same refusal. The block is Google server-side on this account/property.
  No further CDP attempts; Request Indexing stays manual-only. Do not defeat the captcha.
- CDP tooling used this session lives in the scratch dir (`gsc_cdp.py`), not in the repo — nothing in the
  deployable tree depends on it.

## 3. Bing — queue gated by the daily quota, driver armed

- Empirical single-URL submit with `DailyQuota: 0` returned `HTTP 400 ErrorCode 8` and the server-side
  message "You have exceeded your daily url submission quota : 10" — the 10/day cap is enforced at Bing,
  not client-side. Manual drain today is impossible; the driver stays the sole submitter (no double-submits).
- Queue: 50 URLs pending (84 sitemap − 24 already submitted + adjustments; `/movies/414906` submitted but
  not in sitemap). Driver alive (pid 82426, 20-min cycles, MAX_CYCLES=600), log shows
  `waiting: daily=0 monthly=70 queue=50`; reset ~06:00 local (00:00 UTC). At 10/day the queue clears in
  5 days; monthly 70 covers it.
- No traffic impact: Bing zero-indexed is an off-page trust problem (adverse piracy-era domain history),
  not a submission problem. Bing Webmaster Tools UI check remains the owner-side lever.

## State and follow-ups

- Branches: `main` = `ee80672` + this session's docs commit (docs-only, paths-ignored, no deploy);
  `prod-extra` = `ee80672` (untouched since the green deploy).
- Copied Chrome instance shut down after the attempt; the profile copy in the temp dir can be deleted
  (OS cleans it on reboot).
- Follow-ups: (a) confirm the Bing driver's first accepted batch after the ~06:00 reset
  (`daily=10 … attempted 10 accepted`); (b) owner publishes the 12 draft spy seeds in /admin when ready;
  (c) http→https impressions finding is now addressed by step 6b — re-check GSC impressions origin mix in
  the next few days.
