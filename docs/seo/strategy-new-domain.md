# SEO strategy — extramovies.org, brand-new domain (2026-10-07)

Skills applied: seo-plan (publisher template), seo-cluster (intent-based;
full SERP-overlap deferred until Search Console has data), seo-programmatic
(quality gates), seo-schema (June-2026 type status), seo-drift (baseline),
seo-sxo/geo (quotable facts, dates, headings).

## The honest constraint

New domain, zero authority. High-difficulty heads (`movie reviews`,
`where to watch {film}`, `best movies 2026`) are month-6+ targets — expect
nothing early. Months 1–3 belong to Low-difficulty long-tails (see
`new_priority` P0 in `keywords-extramovies.csv`): brand queries, `{film}
ending meaning`, versus angles, parents guides, service-availability copy,
community/feature intents, obscure-title reviews.

## Cluster map (hub-and-spoke)

- Pillar: `/reviews` — CollectionPage + ItemList (implemented).
- Cluster A (title hubs): `/movies/{tmdbId}` ↔ `/reviews/{slug}` bidirectional
  (teaser + new title-hub fact link; RelatedReviews cross-links; breadcrumb
  both ways). Reviews carry Review + Movie + Article schema; hubs carry
  Movie + AggregateRating (member data only, never fabricated).
- Cluster B (genre archives): `/reviews?genre=` + `/movies` filters —
  canonicalize to base URLs (already done for reviews; NO query URLs in
  sitemap, per programmatic index-bloat rules).
- Cluster C (streaming/browse): `/movies` + `?list=` hubs, WatchAction data
  where providers exist.
- Cluster D (community): `/u/{handle}` with Person + ProfilePage (implemented);
  member reviews feed AggregateRating on hubs.
- Link rules: keyword (never "click here") anchors in body content; every
  review links its title hub; hubs link back via teaser + fact link.

## Explicitly NOT doing (skill-backed)

- FAQPage/HowTo schema: FAQ rich results retired for ALL sites (May 2026);
  HowTo deprecated 2023. PAA-shaped copy stays visible-only.
- Hidden markup, keyword stuffing, doorway/query-param URLs in sitemap,
  fabricated ratings (AggregateRating only from real member rows).
- AI Overviews will answer many verdict queries with zero clicks (publisher
  template KPI shift): track Search Console impressions + indexation count +
  signups, not sessions, for months 1–6.

## E-E-A-T gaps (backlog, not launch-blocking)

- About/editorial-policy page (publisher template wants one; no route yet).
- Author bios beyond the single-critic byline (member Person pages cover this
  as the community grows).
- `sameAs` social links are placeholder handles in noir-cinema.json.

## Baseline

`docs/seo/baseline-2026-10-07.json` — title/meta/canonical/robots/h1/schema
per key URL, captured pre-launch on this branch. Re-capture post-deploy and
diff before claiming any change is safe (seo-drift method).
