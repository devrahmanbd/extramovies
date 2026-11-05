# Traffic diagnosis: extramovies.org, 2026-11-02

Status: no traffic collapse. The Semrush dashboard is reading a US database for a
site whose visibility is in India. The real constraint is that a review site
relaunched in October 2026 on a domain with 2016-2025 piracy history has almost
no search trust yet.

## 1. Bottom line

- GSC shows a small but steady trickle: 15 clicks and 354 impressions in the 28
  days to November 1, with impressions still arriving on October 28-30 (5 to 11
  per day). Nothing collapsed.
- Semrush reports 0 organic traffic and 1 keyword because its domain overview
  defaults to the US database. GSC country data puts 235 of 270 attributable
  impressions in India and effectively none in the US. A near-zero baseline
  rounding to one keyword produces the -96.67% figure.
- Google has the sitemap: last downloaded November 1, 0 errors, 101 URLs
  submitted. It indexes roughly 7 of those 101. This is a trust and quality
  decision, not a discovery failure.
- Every query row is a brand or typo variant. Zero film-title queries rank.
  "extramovies" itself sits at position 50.8 (150 impressions, 9 clicks) because
  the legacy piracy brand owns that query, not this site.
- The Holistic SEO harness scores the site 42/100 (Weak) with four hard fails:
  no topical map, 35 orphan URLs, internal links to non-canonical URLs, and an
  anonymous byline.

## 2. What each source says

| Source | Window | Reading |
|---|---|---|
| Semrush (owner's panel) | current | 0 organic traffic, 1 keyword (-96.67%), 701 backlinks (+14.92%), AI visibility n/a, 0 mentions |
| GSC pages | Oct 5 to Nov 1 | 15 clicks, 354 impressions; home 12 clicks / 289 impressions, http home 3 / 62, review pages 0 clicks each |
| GSC queries | same | 55 rows: 45 brand rows (9 clicks, 251 impressions), 10 non-brand rows (0 clicks, 19 impressions) |
| GSC countries | same | India 235 impressions / 13 clicks, Pakistan 16 / 2, Netherlands 13 / 0, US not in the top rows |
| GSC sitemap | Nov 1 | 101 submitted, 0 indexed (GSC field), 0 errors, lastDownloaded 2026-11-01 |
| GSC URL Inspection | Nov 2 sample | home, /reviews, fire-and-ice: PASS indexed. sicario: discovered, not indexed. the-odyssey, dune-part-two: unknown to Google |
| Last full index audit | Oct 27 | 7 of 84 sitemap URLs indexed |

The single non-brand query with any position worth noting is "movies.org" at
position 4, which is a different site's brand. The best film queries are
"transcendence review" and "jupiter ascending reviews", both at position 96.

## 3. Site health checks (all pass)

- `/`, `/robots.txt`, `/sitemap.xml` return 200.
- robots.txt allows all except `/search` and `/api/`, and declares the sitemap.
- `http://` and `www.` both 301 to `https://extramovies.org`.
- Review canonicals are self-referencing. `/movies/<tmdbId>` gateway pages
  canonicalize to `/reviews/<slug>` and link onward to the review.
- Organization, WebSite, Breadcrumb, Review, Article, Movie and Rating JSON-LD
  are present.
- Review bodies run 1,300 to 2,100 visible words. Content depth is not the
  problem.

## 4. What is actually broken

### 4.1 Indexation and trust (P0)

Google downloaded the sitemap yesterday and still indexes about 7 percent of it.
The site is a new review entity on a domain that served piracy content from
2016 to 2025. Crawl access is fine; trust in the domain as a review publisher is
the binding constraint. That also explains the brand query result: for
"extramovies", Google still prefers the legacy brand surfaces over this site.

### 4.2 Internal architecture (P0/P1, from the harness)

- 35 of 101 sitemap URLs have zero inbound links: all 34 taxonomy hubs plus one
  review. The hubs exist but nothing links to them.
- `/reviews` links 53 `/movies/<tmdbId>` gateway pages and zero
  `/reviews/<slug>` URLs. The sitemap lists the reviews, so discovery is a
  two-hop path through pages that canonicalize away.
- Duplicate genre surfaces: `/reviews?genre=Action` and `/category/action` share
  the title "Action movie reviews | Extramovies", and the filter canonicalizes
  to `/reviews` rather than the hub. The hub gets no consolidation signal.
- The homepage H1 is "Trending this week", with 96 unique `/movies/` links
  against 5 `/reviews/` links. The most prominent page promotes TMDB gateway
  pages, not the site's own criticism.

### 4.3 Entity and E-E-A-T (P1)

- Every review is bylined "The Editor". The Person node carries a name only, no
  url, no sameAs, and there is no author page.
- The Organization node has one sameAs (Letterboxd). Its description uses an
  em-dash and differs from the title tag.
- No editorial policy page: no corrections, funding, ratings method, or sourcing
  statement.
- No written topical map, and no supporting content type. `/blog`, `/guides`,
  `/lists` and `/explainers` all return 404, so the sitemap is reviews plus
  auto-generated taxonomy.

### 4.4 Measurement (P1)

The owner is reading Semrush's US database as the health signal. For this site
that database is the wrong market. GSC (India) and Bing are the truth for
indexing and traffic; Semrush stays useful for keyword and competitor research.

## 5. Skill-by-skill read

| Skill | Verdict |
|---|---|
| seo | Technical layer is clean. The blocker is trust, indexation, and on-page architecture, not tags or speed. |
| seo-monitoring | Set the four metrics (indexing, traffic, keywords, backlinks) on GSC and Bing. Record today as the baseline. Semrush is not the health dashboard for this site. |
| seo-strategy | Order holds: technical is done, so on-page and architecture come before content scale and off-page. Do not add pages at volume yet. |
| entity-seo | The strategic unlock. Brand and author entities are thin, and the brand query belongs to the piracy-era entity. Organization sameAs, a named critic, and a Wikidata item are the concrete moves. |
| local-seo | Not applicable. A global film-review magazine has no service area, no GBP, and no NAP. Skip it; only brand consistency transfers, which entity-seo covers. |
| parasite-seo | Useful for near-term distribution while the domain earns trust. Continue the 7-day playbook with canonical attribution and platform-appropriate copy. |
| programmatic-seo | Premature. Adding template pages while 93 percent of existing URLs are unindexed multiplies the problem. Revisit after at least half the current pages are indexed. |

## 6. Plan

### P0 this week, owner

1. Open GSC, check Manual actions and Security issues. Thirty seconds, and it
   rules out a penalty. The API does not expose either.
2. Request Indexing manually for 10 URLs per day: home, /reviews, /about, and
   the six strongest reviews. The CDP harness stays retired; five refusals across
   eight days is enough.
3. Release `main` to `prod-extra` and publish the 8 draft seeds in `/admin`.
   Tenzing rev1 is committed (`fd97ccf`) but no new review is live yet.

### P0 this week, dev

4. Give `/reviews` a crawlable path to canonical review URLs. Either switch the
   tile hrefs to `/reviews/<slug>` or add a text index block below the grid that
   links every review. Keep the gateway pages for users; stop making them the
   only crawl path.
5. Fix the genre duplicate: canonicalize `/reviews?genre=X` to
   `/category/<slug>`, or `noindex` the filter, and give the hub its own title.
6. Link the 34 orphan hubs. Every review should link to its category, director,
   and top cast hubs; hubs should cross-link on shared films.
7. Make the homepage H1 and hero represent the review brand, not "Trending this
   week" TMDB slides.

### P1, two to four weeks

8. Name the critic. Add a bio page, a Person node with url and sameAs, and a
   real byline. Publish an editorial policy: ratings method, sourcing, viewing
   basis, corrections, funding.
9. Expand the Organization entity: more sameAs profiles, a consistent
   description, and a Wikidata item. Decide whether "Extramovies" can be
   reclaimed from the piracy association or needs a distinct masthead.
10. Write the topical map: director, decade, industry and language, franchise
    clusters, each with one hub, supporting pages, and interlinked reviews. Use
    the harness TM and IL checks as the acceptance test.
11. Add supporting content types (lists, explainers, where-to-watch guides) in
    moderation. The AI slop policy still applies: no scaled content abuse.

### P2, next cycle

12. Audit the 701 backlinks. Export referring domains from Semrush and run
    `scripts/seo/backlink_rescue.py`. Most are likely piracy-era links. Disavow
    only if a manual action appears; otherwise pursue 5 to 10 real links from
    film blogs, critics, and Letterboxd.
13. Keep the parasite playbook cadence for distribution.
14. Revisit programmatic hubs once at least half of the current URLs are
    indexed. Real data per page, selective indexation, no thin templates.

## 7. Baseline to carry forward

| Metric | 2026-11-02 | 2026-11-06 |
|---|---|---|
| GSC clicks, 28 days | 15 | 21 |
| GSC impressions, 28 days | 354 | 472 |
| Brand query position | 50.8 for "extramovies" | not re-pulled |
| Non-brand clicks | 0 | not re-pulled |
| Indexed URLs | about 7 of 101 | 7 of 103 |
| Harness score | 42/100, Weak, HF1 to HF4 open | 74/100, Developing, TM-3 open P0 |

Weekly: `python3 scripts/seo/gsc_index_audit.py`. Monthly: the four-metric
report from GSC and Bing. Compare like with like; do not mix Semrush US numbers
with GSC India numbers.

## 7a. Post-fix verification, 2026-11-06

The P0/P1/P2 items that were agent-doable shipped to `prod-extra` in four
deploys (`063a507`, `5696f14`, `f773a46`, `5178e9a`). Production checks:

- `/reviews` links canonical `/reviews/<slug>` URLs; `?genre=` 301s to the
  matching `/category/<slug>`.
- Review pages link category, director and cast hubs; taxonomy hubs cross-link
  relevant siblings (capped at 4 categories, 3 directors, 3 cast names).
- Series hubs surface "Our review"; series reviews show "Series guide" and
  TMDB `/tv/` links. The film hub for a colliding TMDB id keeps the film.
- Homepage H1 is "Movie reviews, argued from the viewing"; the hero CTA points
  at the review, not a TMDB gateway.
- `/author/the-editor` and `/editorial-policy` are live, in the sitemap, and
  linked from the byline, footer and About page.
- Movie/TVSeries JSON-LD carries `sameAs` to TMDB; co-directors are separate
  Person nodes; related links are relevance-only (no latest-review top-up).
- Sitemap: 103 URLs. Link graph: 3,571 internal links, 0 orphans.
- URL Inspection: 103/103 inspected; 7 indexed, 42 known, 61 unknown; 0
  non-self Google canonicals. The 12 draft seeds remain 404.
- GSC 28d: 21 clicks / 472 impressions (up from 15 / 354). The last three days
  with data are 2026-11-01 (1 click / 21 impressions), 2026-11-02 (4 / 25)
  and 2026-11-03 (0 / 19). The "72 hours zero" was click noise at roughly
  0.5 clicks/day, not a new collapse.
- Harness: 74/100, Developing (up from 42/100, Weak). HF1-HF3 closed; TM-3
  (supporting content type) is the only open P0; EE-1 (named human critic)
  remains an owner decision.

The remaining work is owner-gated or content-gated: publish the 12 drafts,
add a supporting content type, decide the named critic / `sameAs` profiles,
request indexing manually, and provide a Semrush referring-domain export for
the backlink rescue.

## 8. What not to do

- Do not chase the Semrush zero or buy links to fix a number that is a database
  artifact.
- Do not mass-publish programmatic pages or AI-scaled reviews while most
  existing pages are unindexed.
- Do not do local SEO work for a global review magazine.
- Do not re-run the GSC CDP indexing harness without a fresh owner instruction.

## Appendix: commands used

```bash
python3 scripts/seo/gsc_api.py query --site sc-domain:extramovies.org \
  --dimensions date --rows 100 --start-date 2026-08-04 --end-date 2026-11-01
python3 scripts/seo/gsc_api.py query --site sc-domain:extramovies.org \
  --dimensions page --rows 30 --start-date 2026-10-05 --end-date 2026-11-01
python3 scripts/seo/gsc_api.py query --site sc-domain:extramovies.org \
  --dimensions query --rows 60 --start-date 2026-10-05 --end-date 2026-11-01
python3 scripts/seo/gsc_api.py query --site sc-domain:extramovies.org \
  --dimensions country --rows 20 --start-date 2026-10-05 --end-date 2026-11-01
python3 scripts/seo/gsc_api.py inspect --site sc-domain:extramovies.org \
  --url https://extramovies.org/ --url https://extramovies.org/reviews
```

Harness: `docs/seo/holisticseo-harness.md` (baseline 42/100).
