# GSC findings — extramovies.org, first read (2026-10-20)

First read of the live Search Console property
(`sc-domain:extramovies.org`, service account `siteFullUser`), 28-day
window 2026-09-22 → 2026-10-20. Raw artifact:
`docs/seo/baseline-gsc-2026-10-20.json` (regenerate with
`python3 scripts/seo/gsc_snapshot.py --site sc-domain:extramovies.org --days 28`).

## Where we actually stand

| Metric | Value |
|---|---|
| Clicks (28d) | 8 |
| Impressions (28d) | 195 |
| Pages with any impression | 4 |
| Distinct queries | 36 |
| Legacy URLs with impressions | 0 |
| Avg position on the homepage | 44.5 (https) / 42.2 (http) |

## Finding A — a third of all traffic lands on the http:// copy (highest leverage)

GSC reports the homepage twice: `https://extramovies.org/` (134
impressions) and `http://extramovies.org/` (59 impressions, 3 of the 8
clicks). Both hosts serve 200 with identical content; there is no
http → https redirect. Google is splitting crawl and equity across two
copies of the same site.

The app cannot fix this by itself: the panel proxy terminates TLS, so Node
sees `http` even for https requests (the same reason
`security.checkOrigin` is disabled in `astro.config.mjs`), and the
response carries no `x-forwarded-proto`. The redirect has to be made by
LiteSpeed, in the panel: for the extramovies.org vhost, add an external
redirect `http://extramovies.org/*` → `https://extramovies.org/$1` with
301 (CyberPanel: vhost → SSL → "Force HTTPS", or Web → External
Redirects). Same for cinemavilla.in.

## Finding B — the SERP for our own brand name is not ours

Every visible query is a brand query, and we are not in the results:

| Query | Impressions | Position |
|---|---|---|
| extramovies | 83 | 48.6 |
| extramovies cc | 4 | 39.2 |
| extramovies.com 2022 | 3 | 27.3 |
| extramovies 2019 | 2 | 52.0 |
| extra movie cc | 2 | 42.0 |

Position 26 to 76 for our own name means the SERP is still the legacy
pirate corpus. This is exactly the P0 brand row in
`docs/seo/keywords-extramovies.csv` (brand SERP is 100% piracy-intent
contaminated, flagged there as CAUTION). The legitimate defences, in
order of speed:
1. The homepage title and meta description must LEAD with the brand
   ("Extramovies — movie reviews"), not end with it. Those are per-site
   `homepage.*` dashboard settings, so this is an owner change in
   `/admin` (no code change).
2. Off-site brand footprint: the parasite package (Letterboxd, Reddit,
   Medium, YouTube) makes the brand entity real, which is what pushes
   the brand SERP off the pirate sites.
3. A single canonical "what is extramovies" answer on our own domain
   (the homepage does this job if the copy leads with the brand).

## Finding C — no title-level demand yet, so content volume is the real limit

Not one film-title query appears in the visible set. The only title-level
impressions are 1 each for `/reviews` and `/reviews/jailer-2-2026-review`.
The sitemap reports 11 submitted and 0 indexed (that counter lags; URL
Inspection says the homepage is "Submitted and indexed", verdict PASS).
The limit is not technical, it is inventory: 6 review pages cannot rank
for 3,500 mapped titles. The demand-ranked hub queue (spec B4) turns the
legacy corpus into that inventory.

## Finding D — three stale sitemaps are still registered

GSC holds four sitemaps for the property:

| Path | Submitted | Errors | Warnings |
|---|---|---|---|
| https://extramovies.org/sitemap.xml | 2026-10-17 | 0 | 0 |
| https://extramovies.org/sitemap_index.xml | 2017-07-08 | 2 | 8 |
| http://extramovies.org/sitemap_index.xml | 2017-06-18 | 2 | 3 |
| http://extramovies.org/sitemap.xml | 2017-04-28 | 1 | 2 |

The three 2017-2019 entries are artefacts of the old site and they are
the http:// copies from Finding A. The sitemaps.delete API returns 403
for this credential, so they have to be removed in the GSC UI: Settings
→ Sitemaps → remove the three stale entries.

## Finding E — robots.txt was blocked (fixed and deployed 2026-10-20)

`https://extramovies.org/robots.txt` returned 410, because the legacy
archive's unresolved set contains a robots.txt and a favicon.ico and the
app-level router answered 410 for them. GSC logged "robots.txt — Not
Fetched — Not found (404)". Fixed: the router now exempts root-level
asset files and asset namespaces from the legacy map, and a real
`robots.txt` endpoint serves `User-agent: *`, `Allow: /`,
`Disallow: /search`, `Disallow: /api/` and the per-domain
`Sitemap:` line. Live now. The GSC error clears on the next crawl.

Also live: 0 legacy paths with impressions, and `/9xplay.php` still
returns 410, so the redirect policy is intact.

## Action list

| # | Action | Owner | Why |
|---|---|---|---|
| 1 | 301 http → https for both brands in LiteSpeed | owner (panel) | 30% of impressions on a duplicate host |
| 2 | Remove the 3 stale sitemaps in the GSC UI | owner (1 min) | GSC errors on every crawl |
| 3 | Lead the homepage title/meta with the brand | owner (`/admin` settings) | we are not ranking for our own name |
| 4 | Fire the parasite launch package (Ramayana, T-1 = Nov 5) | owner (accounts) | brand SERP + referral traffic |
| 5 | Build hubs from the demand-ranked queue (spec B4) | code (after this release) | 0 title-level impressions today |
| 6 | Re-run the monthly snapshot and diff | code | regression gate on clicks/impressions |
