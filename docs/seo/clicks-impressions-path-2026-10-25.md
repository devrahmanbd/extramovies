# Clicks and impressions without page 1: measured funnel + forecast (2026-10-25)

Owner goal is **clicks and impressions, not page 1**. Every measurement below was re-pulled first-hand today
with `scripts/seo/gsc_api.py query --site sc-domain:extramovies.org --start-date 2026-07-27 --end-date
2026-10-25` (91 days inclusive), three pulls (`--dimensions query --rows 500`, `--dimensions page --rows
100`, `--dimensions country --rows 20`, plus a `country --rows 100` control). Anything that is not a
measurement is labelled **estimate**. No absolute search volume exists here: the Semrush token has no
entitlement (`ERROR 120`) and Google Trends is relative-only.

## 1. Today's funnel, measured

| Dimension | Rows | Clicks | Impressions | Imp/day | Clicks/day |
|---|---|---|---|---|---|
| page | 8 | 15 | 354 | 3.9 | 0.16 |
| country (rows=20) | 20 | 15 | 284 | 3.1 | 0.16 |
| query | 45 | 9 | 249 | 2.7 | 0.10 |

The three dimensions do not reconcile (section 7). The **page** dimension is the most complete
and anchors every figure below. Baseline pace: **~117 impressions/month, ~5 clicks/month.**

**By page (measured):**

| Page | Clicks | Impr | Avg pos | CTR |
|---|---|---|---|---|
| https://extramovies.org/ | 12 | 264 | 45.2 | 4.5% |
| http://extramovies.org/ | 3 | 60 | 41.6 | 5.0% |
| /reviews (hub) | 0 | 5 | 2.0 | 0% |
| /reviews/jupiter-ascending-2015-review | 0 | 6 | 5.3 | 0% |
| /reviews/transcendence-2014-review | 0 | 5 | 2.6 | 0% |
| /reviews/jailer-2-2026-review | 0 | 5 | 5.4 | 0% |
| /reviews/fire-and-ice-1983-review | 0 | 5 | 6.0 | 0% |
| /reviews/masaan-2015-review | 0 | 4 | 4.0 | 0% |

**Top query rows (measured):** `extramovies` 9 clicks / 148 imp / pos 50.8 / CTR 6.1%;
`extramovies cc` 0/6/38.2; `extra movie in` 0/5/43.6; `extramovies com` 0/5/25.8;
`moremovies` 0/5/76.8; `extra movie` 0/4/70.0; `extramovi` 0/4/32.0; `extramovie` 0/4/62.0.
All 45 rows are brand, typo, or domain shaped; the only two outside that family (`extra geography film reviews`, `extra mile movie`) carry 1 impression each. **Zero film-title queries.**

**Top countries (measured, rows=100 control):** ind 13 clicks / 221 imp / pos 49.2; usa 0/36/28.4; pak
2/15/39.8 (CTR 13.3%); nld 0/13/40.4; bgd 0/10/21.9; are 0/6/39.0; sau 0/4/75.3; gbr 0/3/24.7; 325 impressions total across 23 countries.

### The three hard facts

- **(a) All impressions come from brand queries plus the homepage.** 324 of 354 impressions (91.5%)
  and 15 of 15 clicks (100%) sit on the two homepage URLs; the other 30 sit on review pages, earned
  from anonymized micro-queries (see b). The listed queries are brand, typo, or domain variants
  (`extramovies`, `extra movie`, `extramovi`, `moremovies`, `movies.org`, ...); not one film title appears.
- **(b) Six review-family pages already sit at positions 2.0 to 6.0** with 4 to 6 impressions
  each and zero clicks. Per-page query filters show those impressions come only from anonymized
  micro-queries: the `jupiter-ascending` page's single listed query is `extramovies` (1 imp, pos 5)
  and `jailer-2` returns no query rows at all. Page-one position, no query volume behind it.
- **(c) The brand term converts 6.1% CTR at position 50.8** (navigational intent: users find the
  domain anyway), while genuine page-one rows exist at 1 to 2 impressions each
  (`extramovies org` pos 3, `movies.org` pos 4, `exteramovie` pos 7.5). Position is not the
  constraint. Query volume is.

## 2. The reframe

**Bottleneck = indexed pages x query volume, not rank ceiling.**

We already prove the rank ceiling: page-1 positions (2.0 to 6.0) on review pages with no authority behind
them. What we cannot prove yet is demand, because only **7 of 84 sitemap URLs are indexed**
(`data/legacy/gsc-index-audit-2026-10-25.csv`) and those pages cover queries nobody types.

- **Impressions scale with indexed page count.** Impressions are recorded at any position (1 to 100),
  so every newly indexed page is new impression surface immediately, before any ranking work.
- **Clicks = indexed AND top-10 AND a query somebody actually searches.** We hold the first two
  conditions today on 6 pages; the third fails.

## 3. Three levers, ordered by time-to-click

1. **Brand / navigational queries (fastest: already converting).** Pos 41 to 51, 4.5 to 6.1% CTR,
   0.16 clicks/day today. No new content needed; grows with any awareness and with a larger,
   better-crawled index.
2. **Indexing the remaining 77 sitemap URLs (impression surface, no new content).** Pending set
   from the audit CSV: 40 review + 29 taxonomy + 6 hub + 2 site pages. Adds impression slots in
   weeks; clicks come only from the subset with real title demand.
3. **The 10-film long-tail targets (compounding, slowest).** `docs/seo/rankable-10-2026-10-25.md`
   (Tumbbad, Premam, Grave of the Fireflies, Kaithi, Eega, 777 Charlie, Ratsasan, Kumbalangi Nights,
   The Lunchbox, Magadheera; all primary queries validated against the Google Autocomplete demand floor).
   Requires content published first, then indexing, then weeks-to-months
   of ranking. This is the only lever that creates non-brand query impressions.

## 4. Scenario forecast (all figures are estimates)

**CTR bands assumed (standard desktop Google, stated as assumptions, not measurements):**
pos 1-3 = 15-25%; pos 4-10 = 2-5%; pos 11-20 = 0.3-1%; pos 21-50 = 0.1-0.5%; pos 51+ = 0-0.1%.
**Observed navigational exception (measured):** 4.5-6.1% at pos 41-51 on the homepage, applied to
the brand block only. No absolute keyword volume exists, so impression ranges are built from our own
measured base rate: **0.055 impressions per indexed review page per day** (25 impressions / 5 indexed
review pages / 91 days).

| Block | A: status quo (7 indexed) | B: 84 indexed, same content | C: B + 10 film reviews |
|---|---|---|---|
| N brand/homepage | 3-6 imp, 0.12-0.25 clk | 3-6 imp, 0.12-0.25 clk | 3-6 imp, 0.12-0.25 clk |
| R 45 sitemap reviews | 5 indexed: 0.3 imp, 0 clk | 1-8 imp, 0.02-0.10 clk | 1-8 imp, 0.02-0.10 clk |
| T taxonomy/hub/site (38 pages) | 1 indexed: ~0 imp, 0 clk | 0.5-4 imp, 0-0.02 clk | 0.5-4 imp, 0-0.02 clk |
| N10 the 10 new reviews | 0 | 0 (not written) | 2-12 imp, 0.05-0.45 clk |

| Scenario | Indexed | Imp/day (est) | Clicks/day (est) | Reasoning |
|---|---|---|---|---|
| **A status quo** | 7 of 84 | **3 to 5** (measured 3.9) | **0.10 to 0.20** (measured 0.16) | Only block N moves, and only with brand awareness. ~5 clicks/month. |
| **B 84 indexed, current content** | 84 | **5 to 18** | **0.15 to 0.40** | R scales at 0.055 imp/page/day x 45 pages = 2.5 imp/day base, with an uplift range because 40 pending reviews carry real title demand (`avengers-endgame`, `deadpool`, `joker`, `toy-story-5`, ...) while the 5 indexed ones do not. Most new pages land pos 11-40 first, so CTR stays 0.1-1%. T pages rank deep (pos 20-100) for entity queries. |
| **C B + 10 film reviews published + indexed** | 94 | **7 to 30** | **0.15 to 0.80** | Adds N10: relative Trends demand on winnable SERPs, with every primary query clearing the Google Autocomplete demand floor (see `rankable-10` validation section). Assume each new page reaches pos 4-20 within 4-12 weeks; half at 2-5% CTR, half at 0.3-1%. Also extends block N as non-brand impressions start appearing. |

**Scenario C midpoint (chosen): ~18 impressions/day and ~0.45 clicks/day**, i.e. ~540 impressions/month
(4.6x today's 117) and ~14 clicks/month (about 3x today's 5). It is the arithmetic midpoint of the block
ranges above, held toward the low end of what a mid-size review site would do, because no absolute volume
exists for any target keyword and ranking lag is weeks-to-months. A page reaching pos 1-3 on a real query
would double this on its own, and nothing here assumes that.

## 5. Actions with owners

| Owner | Action | Cadence |
|---|---|---|
| **Owner** | Manual Request Indexing, ~10 URLs/day, demand-ordered (newest review first, then title-demand reviews), stop at the quota message | Daily, ~2 weeks for the 77 |
| **Owner** | Publish the drafts once the writer hands them over; review each before it goes live | Per piece |
| **Writer** | Publish the 10 reviews from `docs/seo/rankable-10-2026-10-25.md` with a real "Ending explained" section, verdict-first voice, ratings left as owner placeholders, no invented facts (TMDB for facts) | Per piece, target all 10 |
| **Writer / owner** | Internal links from `/reviews` and a category hub into each new review, then sitemap | On each publish |
| **Agent / CI** | `python3 scripts/seo/gsc_index_audit.py` rerun, fresh CSV, report indexed count + coverage states | Weekly |
| **Agent / CI** | Re-pull the three GSC funnels (query/page/country), recompute imp/day and clicks/day against section 4 | Monthly |
| **Agent / CI** | `python3 scripts/seo/notify_publish.py --url <new review>` after every publish (IndexNow + sitemap resubmit, no quota) | Per publish |

## 6. Leading indicators to watch

1. **Impressions/day first (moves in weeks).** Page-dim total from 3.9 today. After indexing waves
   it should clear ~6/day within 2 to 4 weeks. Impressions do not need rankings, only indexation.
2. **Clicks/day second (moves in months).** 0.16 today. Do not expect a visible change for 1 to 3
   months; call Scenario C real only above ~0.30/day (~9/month).
3. **Pages earning >= 1 impression:** today 8 of 84 URLs (9.5%); should track the indexed count, not the click count.
4. **Anonymized-vs-listed query ratio (the health signal).** Today the query rows explain 249/354
   impressions (70%) and 9/15 clicks (60%); 30% of impressions are anonymized/grouped. Also
   `extramovies` alone is 148/249 = 59% of listed impressions. Healthy = a listed non-brand row (a
   film query) appearing at all, then brand share falling below ~50% while the total rises. Unhealthy
   = totals rising with brand share at 100%, which means only block N moved.

## 7. Data inconsistencies found on this pull (reported, not smoothed)

- **Same window, different numbers.** The earlier pull of this identical window reported query 8 clicks /
  246 imp and page 14 / 337; today it returns 9 / 249 and 15 / 354, and homepage https moved from
  11 clicks / 259 imp to 12 / 264. GSC restates closed windows, so re-pull before quoting any figure.
- **Position band drift:** fire-and-ice moved from pos 5.3 to 6.0, so the six-page band is now
  **2.0 to 6.0**, not the 2.0 to 5.5 recorded in the brief.
- **Dimensions disagree:** page 354 > country 325 (rows=100) > query 249. Never mix dimensions in one
  sentence; page is the anchor. The 105-impression / 6-click gap to query is the anonymized bucket.
- **India share depends on the row cap:** with `--rows 20` the country rows sum to 284 and India is
  78% of impressions; with `--rows 100` they sum to 325 and India is 68%. The brief's "~83%" matches
  neither. Clicks share (13/15 = 87%) does match the brief's ~86%.
- **Row-count drift:** `rankable-10` cites 46 query rows; today's pull returns 45.
- **Sitemap size moved 126 (worklist 10-22) to 84 (audit 10-25)** after the hub purge. Current 84:
  45 review + 29 taxonomy + 7 hub + 3 site; the 77 pending = 40 review + 29 taxonomy + 6 hub + 2 site.
