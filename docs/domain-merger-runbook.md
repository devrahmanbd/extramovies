# Domain merger runbook — satellites → one brand domain

Goal: N review/stream platforms merge into one brand site ("merging"),
keeping organic + ads traffic, then monetize (ads / membership).

## Gate 0 — Toxicity audit (decides what may redirect; no exceptions)

301 redirects transfer link equity AND penalties. Audit EVERY satellite
before it touches the brand:

1. Pull backlinks (Semrush UI export — API tokens lack entitlement):
   referring domains + anchors + toxicity flags per domain.
2. Redirect ONLY clean/neutral profiles. Pirate/download/link-farm history
   (like extramovies.org's own 2017–2019 past) must NEVER 301 to the brand —
   let those domains die quietly (no redirects, no canonicals pointing home).
3. Record the verdict per domain in the inventory table below. A single
   toxic redirect can poison the brand for months; when in doubt, leave it out.

## Phase 1 — Inventory (fill before anything moves)

| Domain | Type (review/stream) | URLs (count) | Monthly sessions | Backlink verdict (redirect/sunset) | Member accounts | Decision |
|---|---|---|---|---|---|---|
| (fill) | | | | | | redirect / sunset / keep separate |

Also list: DB files + sizes, uploaded assets, cron jobs, DNS provider + TTLs,
SSL setup, hardcoded domain strings in each codebase (`grep -ri old-domain`).

## Phase 2 — Content map (no duplicates cross the line)

1. Export all reviews/posts per property (IDs, slugs, titles, dates).
2. Dedupe rule: same content on 2+ properties → keep the BEST version
   (most complete, most engagement), redirect the rest to it. Never import
   two copies of one review.
3. URL map file (the cutover runs on this — review it line by line):
   `old_url,new_url` CSV, one row per indexed URL. Rule: page → matching
   page. Anything without a match → the closest hub (`/reviews`,
   `/movies`), never bulk-homepage (bulk redirects read as soft-404s).
4. Member content (reviews, watchlists, follows) migrates with attribution
   intact (same handles where possible — see Phase 3 collisions).

## Phase 3 — Technical merge

1. One codebase (this repo, `main`): satellites converge onto it, not the
   reverse. Property-specific bits become config (brand preset, SITE_URL),
   never forks.
2. DB merge, in order: backup every DB first. Users: merge by email
   (first-seen wins; collisions get `+importN` handles + a reset-password
   email, never silent overwrites). Member reviews/watchlists/follows
   re-keyed to surviving user IDs. Sessions: wipe all (`sessions` table
   truncated at cutover — everyone re-logs-in; announce it, don't surprise).
3. Assets: copy uploads/posters into the brand tree; keep filenames stable
   where hotlinked, else 301 each renamed file.
4. Secrets/env per host stay host-local (never in repo, never in dumps).
5. Full staging rehearsal on a scratch subdomain with production DB copies
   before touching DNS. Checklist: logins, review posting, watchlists,
   sitemap, search, admin round-trip.

## Phase 4 — Cutover ("merging" week)

1. T-48h: lower DNS TTLs to 300s on all moving domains. Freeze content
   (read-only mode or announced freeze) so the map doesn't drift.
2. T-0: deploy brand app → switch DNS → enable 301s on old hosts. On
   OpenLiteSpeed a minimal redirector vhost per old domain (rewrite map
   from the Phase-2 CSV; test with `curl -I` sampling: 20+ URLs incl.
   deep pages, images, feeds).
3. "Merging" comms (30 days before + at cutover): banner on every satellite
   ("[Property] is merging into [Brand] on [date] — your account, reviews
   and watchlist move with you. [Learn more]"), plus one email/post to
   members. No silent migrations.
4. T+7d: verify sitemap/robots on brand host, Search Console Change of
   Address per property, inspect 5 sample new URLs, watch Coverage for
   404 spikes (fix map gaps same-day). T+30d: restore TTLs, decommission
   old stacks (keep stopped snapshots 90 days).

## Phase 5 — Traffic + money

1. Update everything you control: social bios, Letterboxd/Reddit/Quora
   profiles, parasite footers, sitemap submissions (GSC + Bing), RSS
   subscribers note.
2. Ads readiness: `ads.txt` on the brand root BEFORE applying to networks;
   ad slots behind consent + performance budget (Core Web Vitals survive).
3. Membership readiness: product work, not config — pricing, entitlements
   table, payment provider, paywall UX. The users/follows/watchlist schema
   already exists; billing does not. Separate build, separate estimate.
4. Analytics continuity: keep UTM conventions (`utm_source` per ex-property
   for 90 days) so you can prove the merge kept its traffic.

## Rollback (decided in advance, not mid-crisis)

- Pre-cutover snapshots: all DBs + uploaded assets + DNS zone exports.
- Revert = restore snapshots + flip DNS back + disable 301s. RTO target:
  under 1 hour. If Coverage shows >10% valid URLs dropping after 14 days,
  pause decommissioning and re-audit the map — do not "wait it out".
