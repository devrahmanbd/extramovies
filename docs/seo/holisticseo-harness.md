# Holistic SEO harness for extramovies.org

A runnable audit that turns the semantic SEO method published on
holisticseo.digital into PASS/FAIL checks against this repo and the live site.
It scores architecture, not prose. The writing is already good; this harness
measures whether the site is built so a search engine can understand it.

Run it weekly. Write the result to `data/legacy/holisticseo-audit-<YYYY-MM-DD>.md`
(untracked, see `.gitignore:14`). Compare each run to the previous one, not to
an absolute ideal. For a second brand, swap `SITE_ID` and the sitemap host.

---

## 1. Methodology map

Each concept below was read on the source URL shown. Definitions are
paraphrased, not quoted.

| Concept | Working definition | Source |
|---|---|---|
| Source Context | The site's perspective, function, monetization, and existing purpose on the open web. It limits which topics the brand can credibly own, so a topical map starts here, not with a keyword list. | https://www.holisticseo.digital/seo-research-study/topical-map |
| Brand Identity | The associations a brand is expected to own. Content that contradicts them dilutes the entity the site is building. | https://www.holisticseo.digital/seo-research-study/topical-map |
| Topical Map | The planned topics plus their parent/child order, derived from source context. It separates core from outer sections so coverage is deliberate rather than accumulated. | https://www.holisticseo.digital/seo-research-study/topical-map |
| Contextual Vector | The ordered sequence of terms and headings a document follows from opening to closing purpose. A vector that jumps between subjects breaks the page's relevance signal. | https://www.holisticseo.digital/theoretical-seo/topical-authority/ |
| Contextual Hierarchy | The ranking of topics by scope, so a broad page owns broad queries and a narrow page owns narrow ones without competing with its own parent. | https://www.holisticseo.digital/theoretical-seo/topical-authority/ |
| Contextual Bridge | A phrase or concept connecting two topics and explaining why a link exists. The bridge must stay inside the same query context and candidate set, or the link reads as unrelated. | https://www.holisticseo.digital/seo-research-study/topical-map |
| Macro semantics | Whole-document optimization: coverage, section order, and whether the page answers the full intent. | https://www.holisticseo.digital/seo-research-study/lexical-semantics |
| Micro semantics | Sentence-level optimization: word choice, lexical relations, and the specificity of each claim. | https://www.holisticseo.digital/seo-research-study/lexical-semantics |
| Entity, Attribute, Value | Knowledge as entity/attribute/value triples. Which attributes a page carries decides which questions it can answer, so attribute choice is a coverage decision. | https://www.holisticseo.digital/seo-research-study/entity-attribute-value |
| Information Gain | The new, verifiable information a document adds beyond what already ranks. Restating the consensus earns nothing. | https://www.holisticseo.digital/theoretical-seo/topical-authority/ |
| Page segmentation | Search engines divide a page into functional blocks and weight terms, links, and images per block. Heavy boilerplate dilutes main-content prominence. | https://www.holisticseo.digital/theoretical-seo/topical-authority/ |
| Initial contact | The first section a visitor meets. It should carry the terms matching the dominant and sub-intents of the visit, because that section sets the page's topical promise. | https://www.holisticseo.digital/theoretical-seo/topical-authority/ |
| Search intent classes | Queries split into informational, navigational, commercial, and transactional classes, each implying a different page shape. Serving two classes on one URL splits the signal. | https://www.holisticseo.digital/theoretical-seo/search-intent/ |
| Author rank | The trust a named author accumulates from consistent bylines, credentials, and a body of work. It is not created by a schema field. | https://www.holisticseo.digital/theoretical-seo/google-author |
| Trust elements | Verifiable signals such as a corrections policy, funding disclosure, dated facts, and contact routes. They support the entity behind the content. | https://www.holisticseo.digital/marketing/trust-elements/ |

---

## 2. Audit checklist

Severity: **P0** blocks the site from competing, fix this week. **P1** caps
performance, fix this month. **P2** quality or scale issue, next cycle. **P3**
polish. Answer PASS, PARTIAL, or FAIL, and put the evidence next to the answer.
No item is PASS on inspection alone.

### 2.1 Topical map and coverage (TM, 20 points)

**TM-1. Does a written topical map exist, with core and outer sections?** `P0`
Check `ls docs/seo/` for a map artifact that names clusters, not keywords. Fail: only `keywords-extramovies.csv` exists.
**TM-2. Does every indexable URL belong to a named cluster in that map?** `P0`
Check the sitemap buckets against the map. Fail: auto-generated `/cast`, `/category`, `/director`, `/series` with no planning document behind them.
**TM-3. Does at least one supporting, non-review content type exist for the core topic?** `P0`
Check `curl -o /dev/null -w "%{http_code}" https://extramovies.org/blog` and the same for `/guides`, `/lists`, `/explainers`. Fail: 404 on all.
**TM-4. Does each core cluster hold at least five interlinked URLs?** `P1`
Check the ItemList count on each `/category/<slug>` hub. Fail: hubs with two or three reviews and no sibling links.
**TM-5. Is the covered corpus mapped to every axis it implies?** `P2`
Check sitemap counts for `/director`, `/cast`, `/category`, `/series` against seed attributes. Fail: 62 seeds carry `movie_director` but the sitemap lists one director hub.

### 2.2 Contextual relevance (CR, 15 points)

**CR-1. Does the first screen answer the query's dominant intent?** `P1`
Read the first paragraph and verdict block on three reviews. Fail: throat-clearing, plot summary, or a rating with no verdict sentence.
**CR-2. Does the heading sequence follow one contextual vector?** `P1`
Extract `^## ` from three seed bodies and compare order. Fail: an identical template applied to films of different intent.
**CR-3. Is the prose specific enough to be micro-semantically useful?** `P1`
Sample three reviews for named scenes, numbers, and cited critics. Fail: adjectives with no referent.
**CR-4. Is there a contextual bridge between a page and its parent cluster?** `P1`
Run `grep -o 'href="/category/[^"]*"'` on a live review page. Fail: zero hub links, or links to `/reviews?genre=X` instead.

### 2.3 Entity coverage (EN, 15 points)

**EN-1. Are the core entities present on every review?** `P1`
Count `^tmdb_id:`, `^movie_cast:`, `^movie_director:`, `^rating:` across `seeds/extramovies/*.md`. Fail: any field below the file count.
**EN-2. Do the attributes cover the questions the intent implies?** `P1`
List the frontmatter keys against what a film query asks: studio, release date, certification, runtime, awards, franchise. Fail: no studio, no awards, no franchise, and runtime missing on 20 of 62 seeds.
**EN-3. Do entities carry disambiguating identifiers?** `P1`
Run `grep -n "sameAs\|isBasedOn" src/lib/seo/jsonld.ts` and read the live JSON-LD. Fail: `isBasedOn` only, no `sameAs` to TMDB, IMDb, or Wikidata.
**EN-4. Are multi-value entities modeled as separate nodes?** `P2`
Read the `director` node on a co-directed film. Fail: `{"@type":"Person","name":"Anthony Russo, Joe Russo"}`.
**EN-5. Do entity pages exist for the people and organizations covered?** `P2`
Count sitemap URLs under `/cast`, `/director`, `/studio`, `/award`, `/franchise`. Fail: cast only.

### 2.4 Query semantics alignment (QS, 15 points)

**QS-1. Is review intent served on a canonical review URL?** `P1`
Open `/reviews/<slug>`: verdict, rating, and body present, canonical self-referencing.
**QS-2. Is where-to-watch intent served with a region and a checked date?** `P1`
Read the WhereToWatch block. Fail: provider names with no date.
**QS-3. Do secondary intents have their own URL?** `P1`
Test `/lists`, `/blog`, `/best-of-2026`, and a cast or ending query. Fail: everything resolves to the same review page.
**QS-4. Is intent split across duplicate URLs?** `P0`
Compare `<title>` and canonical on `/reviews?genre=Action` and `/category/action`. Fail: identical titles, filter canonicalized to `/reviews` rather than to the hub.
**QS-5. Does the slug match the query phrasing?** `P3`
List sitemap slugs. Fail: review slugs without `-review`, or hubs with numeric slugs such as `/series/129552`.

### 2.5 Internal linking and contextual bridges (IL, 15 points)

**IL-1. Does every indexable URL have at least one in-content inbound link?** `P0`
Build the link graph (section 4, step 3) and list sitemap URLs with in-degree zero. Fail: the whole taxonomy layer.
**IL-2. Do internal links point at canonical URLs?** `P0`
Run `grep -o 'href="/reviews/[^"]*"'` on `/reviews`, then check the canonical of the URLs it does link. Fail: the archive links `/movies/<tmdbId>` while those pages canonicalize to `/reviews/<slug>`.
**IL-3. Does anchor text name the destination topic?** `P2`
Sample anchors. Fail: "read more", "here", or a genre word pointing at a filtered archive.
**IL-4. Are related links relevance-scored rather than recency-filled?** `P2`
Read `src/lib/related.ts`. Fail: a fallback that tops the strip up with the latest reviews regardless of subject.
**IL-5. Do sibling hubs link to each other?** `P2`
Run `grep -o 'href="/category/[^"]*"'` on a cast page. Fail: zero cross-links between taxonomy axes.

### 2.6 Page segmentation and supplementary content (PS, 10 points)

**PS-1. Is main content separable from chrome in the DOM?** `P2`
Confirm `<main>`, `<article>`, and named sections on a review page.
**PS-2. Do supplementary blocks answer real questions?** `P2`
Check KeyFacts, QuickAnswer, WhereToWatch, RelatedReviews. Fail: blocks that restate the body.
**PS-3. Does boilerplate dominate the page's term weight?** `P1`
Compare `sed 's/<[^>]*>/ /g' page.html | wc -w` with the unique intro word count. Fail: 300 total words for a one-sentence intro plus cards.
**PS-4. Does the most prominent section match site purpose?** `P1`
Read the homepage `<h1>` and the first hero slide. Fail: a section label as the H1, and a hero promoting unreviewed films.

### 2.7 E-E-A-T (EE, 10 points)

**EE-1. Is a named human author visible on every review?** `P1`
Read the byline on three reviews. Fail: "By The Editor".
**EE-2. Does the author entity carry url, sameAs, and credentials?** `P1`
Parse the `Person` node from live JSON-LD. Fail: `name` only.
**EE-3. Is editorial policy published?** `P2`
Check `/about` for corrections, funding, ratings, and sourcing statements.
**EE-4. Are facts sourced and dated?** `P2`
Check `datePublished` and `dateModified` in Article, plus named sources in the body. Fail: undated claims.
**EE-5. Is the Organization entity complete?** `P2`
Read `organizationJsonLd` in `src/lib/seo/jsonld.ts` for `url`, `sameAs`, `logo`, `founder`.

---

## 3. Scoring rubric

Inside a section, every item is worth `weight / item count`. PASS = full,
PARTIAL = half, FAIL = 0. Sum the items, then round each section to the nearest
whole point. Sum the sections.

| Section | Items | Weight |
|---|---|---|
| Topical map and coverage | 5 | 20 |
| Contextual relevance | 4 | 15 |
| Entity coverage | 5 | 15 |
| Query semantics | 5 | 15 |
| Internal linking | 5 | 15 |
| Page segmentation | 4 | 10 |
| E-E-A-T | 5 | 10 |
| **Total** | **33** | **100** |

Bands: 0-39 Critical, 40-59 Weak, 60-74 Developing, 75-89 Competitive,
90-100 Strong.

**Hard fails.** Any one caps the run at Weak regardless of arithmetic, because
the score would otherwise hide a structural problem:

- HF1: no written topical map (TM-1 FAIL).
- HF2: indexable URLs with zero in-content inbound links (IL-1 FAIL).
- HF3: internal links that point at non-canonical URLs (IL-2 FAIL).
- HF4: anonymous byline with no author entity (EE-1 and EE-2 both FAIL).

Report the score as `earned/100 (band)` with every open hard fail beside it. A
run with an open P0 cannot be reported as passing.

---

## 4. Run procedure

Run from the repo root. Steps 1 to 4 need no credentials; step 5 does. Step 0:
`node -v` is 20 or newer, and for step 6 `GSC_SA_KEY` points at the
service-account JSON, or the key sits at
`~/.config/gsc-sa/extramovies-gsc-reader.json`.

**Step 1. Snapshot the URL inventory.**

```bash
D=$(date +%F)
curl -sL https://extramovies.org/sitemap.xml -o /tmp/hs-sitemap.xml
grep -o '<loc>[^<]*' /tmp/hs-sitemap.xml | sed 's|<loc>||' > /tmp/hs-urls.txt
wc -l < /tmp/hs-urls.txt
```

**Step 2. Classify URLs by bucket.**

```bash
sed 's|https://extramovies.org||' /tmp/hs-urls.txt \
  | awk -F/ '{print "/"$2}' | sort | uniq -c | sort -rn
```

**Step 3. Build the link graph and find orphans.** Writes
`data/legacy/holisticseo-links-$D.csv`.

```bash
python3 - <<'PY'
import re, urllib.request, csv, datetime, collections, os
BASE = "https://extramovies.org"
urls = [u.strip() for u in open("/tmp/hs-urls.txt") if u.strip()]
def get(u):
    r = urllib.request.Request(u, headers={"User-Agent": "holisticseo-harness/1.0"})
    return urllib.request.urlopen(r, timeout=25).read().decode("utf-8", "ignore")
inbound, rows = collections.Counter(), []
for u in urls:
    try:
        html = get(u)
    except Exception as e:
        rows.append([u, "FETCH_FAIL", 0, str(e)[:80]]); continue
    links = {BASE + m for m in re.findall(r'href="(/[^"#?]*)"', html)}
    inbound.update(links)
    rows.append([u, "OK", len(links), ""])
os.makedirs("data/legacy", exist_ok=True)
out = f"data/legacy/holisticseo-links-{datetime.date.today()}.csv"
with open(out, "w", newline="") as f:
    w = csv.writer(f); w.writerow(["url", "fetch", "outbound", "note"]); w.writerows(rows)
orphans = [u for u in urls if inbound[u] == 0]
print("urls:", len(urls), "orphans:", len(orphans), "csv:", out)
for u in orphans: print("ORPHAN", u)
PY
```

This counts links between sitemap URLs only. A page linked from a non-sitemap
page (a film hub, a member profile) is reachable but not internally supported.
Treat in-degree zero as FAIL and in-degree one as a review item.

**Step 4. Entity and EAV audit from seeds.**

```bash
cd seeds/extramovies
total=$(ls -1 *.md | wc -l | tr -d ' ')
for k in tmdb_id rating movie_cast movie_director published_at sites; do
  printf "%s: " "$k"; grep -l "^$k:" *.md | wc -l | tr -d ' '; echo "/$total"
done
grep -h '^[a-z_]*:' *.md | cut -d: -f1 | sort -u
cd ../..
```

The second command lists the key set, which shows what is missing rather than
what is present.

**Step 5. Index status.** Without this, indexed counts are UNVERIFIED.

```bash
python3 scripts/seo/gsc_index_audit.py --site sc-domain:extramovies.org --max 200
```

The CSV lands in `data/legacy/gsc-index-audit-<date>.csv`. Read
`coverage_state` and `google_canonical`. Any URL where Google picked a
different canonical is an IL-2 failure, whatever the HTML says.

**Step 6. Score and write the run.**

```bash
$EDITOR data/legacy/holisticseo-audit-$D.md
```

Three parts: the score table by section, the open FAILs with evidence, and the
diff against the previous run. Keep it under one page.

**Step 7. Compare.** Diff against the previous
`data/legacy/holisticseo-audit-*.md`. Report movement per section, not just the
total. A total that holds still while IL rises and TM falls is not progress.

---

## 5. Movie-site instantiation

| Generic concept | Film-site form | Where it lives here |
|---|---|---|
| Source Context | An independent review magazine: one editor, one rating, legal streaming links, no piracy | `/about` |
| Topical map | Genre, decade, franchise, industry/language, and director clusters, each with a hub and supporting explainers | `docs/seo/topical-map-2026-11.md`; taxonomy is derived in `src/lib/seo/taxonomy.ts` |
| Contextual vector | Verdict, then what the film is, then craft, then where to watch | review bodies, 8 `##` sections in 44 of 62 seeds |
| Contextual bridge | "This is the third Villeneuve film we have reviewed" style prose linking a review to its director hub | review pages link category, director and cast hubs; taxonomy hubs cross-link siblings |
| Entity | Film, person, studio, franchise, award, festival | film, series, person and organization; no studio, franchise or award pages |
| Attribute | Runtime, certification, release date, studio, budget, box office, awards, franchise position | partial; year, runtime (42/62), cast, director, genre, IMDb id, TMDB `sameAs` |
| Value | The specific fact, for example 94 percent from 553 critics | in body prose, absent from frontmatter |
| Query semantics | Review, where to watch, ending explained, cast, films like this, best of year | review, where-to-watch, cast, director, category and series; no lists or explainers |
| E-E-A-T | Critic methodology, viewing basis, sourcing, correction log, dated availability | `/editorial-policy`, `/author/the-editor`, dated availability; no named critic |

Three real frontmatters show what the model carries.
`seeds/extramovies/avengers-endgame-2019-review.md` has `tmdb_id: 299534`,
`rating: 8.4`, `published_at`, `managed_fields`, `movie_runtime: "181 min"`,
`movie_director: "Anthony Russo, Joe Russo"`, a ten-name `movie_cast`, and
`sites: ["extramovies"]`. `seeds/extramovies/top-gun-maverick-2022-review.md`
has `rating: 8.6`, `tmdb_id: 361743`, `imdb_id`, and a body citing 96 percent
from 476 critics and $1.49 billion worldwide, which is the information-gain
layer living only in prose. `seeds/extramovies/dhruva-2016-review.md` has
`rating: 7`, `movie_director: "Surender Reddy"`, a Telugu cast, and
`region: "US"`, showing the industry axis the sitemap has no hub for.

What the model does not carry: `studio`, `franchise` or `collection`,
`release_date`, `certification`, `country`, `language`, `awards`, `budget`,
`box_office`. Adding those is the cheapest way to raise EN-2, and it makes the
existing prose facts machine-readable.

Aim for a cluster shape of one hub plus supporting pages plus reviews, all
interlinked: `/category/science-fiction` links to `/director/denis-villeneuve`,
`/lists/best-sci-fi-of-2026`, and each review, and every review links back with
a bridge sentence. That shape satisfies TM-2, TM-4, IL-1, and IL-5 at once.

---

## 6. First-run baseline, 2026-11-02

Live site plus the `extramovies` seed set. Sitemap snapshot: 101 URLs, made up
of 53 `/reviews/<slug>` plus the archive index, 19 `/cast`, 14 `/category`,
7 `/series/<id>` plus the series index, 1 `/director`, and 5 static pages. The
crawl found 1,895 internal links between sitemap URLs.
Review pages have a median in-degree of 5; taxonomy pages have 0.

| Section | Earned | Weight |
|---|---|---|
| Topical map and coverage | 4 | 20 |
| Contextual relevance | 11 | 15 |
| Entity coverage | 6 | 15 |
| Query semantics | 8 | 15 |
| Internal linking | 3 | 15 |
| Page segmentation | 5 | 10 |
| E-E-A-T | 5 | 10 |
| **Total** | **42** | **100** |

**Score: 42/100, Weak.** Open hard fails: HF1, HF2, HF3, HF4.

| # | Item | Sev | Evidence |
|---|---|---|---|
| 1 | TM-1, TM-3 | P0 | No topical map in `docs/seo/`; `/blog`, `/guides`, `/lists`, `/explainers` all return 404, so the sitemap is reviews or auto-taxonomy only. |
| 2 | IL-1 | P0 | 35 of 101 sitemap URLs have in-degree zero: all 34 taxonomy hubs plus `/reviews/you-can-see-everything-2026-review`, which no sitemap page links to; the homepage reaches it through `/movies/1765072`, which canonicalizes to the review. |
| 3 | IL-2 | P0 | `/reviews` holds 0 `href="/reviews/<slug>"` and 53 `/movies/<tmdbId>` links; `/movies/299534` canonicalizes to `/reviews/avengers-endgame-2019-review`. |
| 4 | QS-4 | P0 | `/reviews?genre=Action` and `/category/action` share the title "Action movie reviews \| Extramovies"; the filter canonicalizes to `/reviews`, not to the hub. |
| 5 | PS-4 | P1 | Homepage `<h1>` is "Trending this week"; the hero has 10 TMDB slides and the page carries 96 unique `/movies/` links against 5 `/reviews/` links. |
| 6 | EE-1, EE-2 | P1 | Every review renders "By The Editor"; JSON-LD author is `{"@type":"Person","name":"The Editor"}` with no url or sameAs; `/author` and `/authors` return 404. |
| 7 | EN-2 | P1 | Seeds carry `tmdb_id`, `rating`, `movie_cast`, `movie_director`, `excerpt`, and `sites` at 62/62, but `movie_runtime` only at 42/62 and no studio, awards, franchise, certification, country, language, or release date; the `Movie` node has no `actor`. |
| 8 | EN-4 | P2 | A co-directed film emits `director: {"@type":"Person","name":"Anthony Russo, Joe Russo"}`, one node for two people. |
| 9 | PS-3, TM-4 | P2 | `/cast/tom-cruise` is about 300 words including chrome, with a one-sentence intro and 3 cards; 17 of 19 cast hubs hold exactly 2 reviews. |
| 10 | QS-5 | P3 | 7 series hubs use raw TMDB IDs (`/series/129552`), and 3 of 53 review slugs omit `-review` (`/reviews/dune-part-two`, `/reviews/joker`, `/reviews/the-batman`). |

### Not verified in this run

- Indexed page count and Google-selected canonicals. Verify with
  `python3 scripts/seo/gsc_index_audit.py --site sc-domain:extramovies.org --max 200`.
- Query-level impressions and clicks per cluster. Verify with
  `python3 scripts/seo/gsc_api.py query --site sc-domain:extramovies.org --dimensions query --rows 100`.
- Core Web Vitals for the hub templates. Verify with
  `node scripts/seo/cwv-baseline.mjs`.

---

## 7. Second run, 2026-11-06

Live site after the P0/P1/P2 fixes. Sitemap snapshot: 103 URLs (54 reviews,
19 cast, 14 category, 8 series, 1 director, 1 author, 1 editorial policy, and
7 static/index pages). The crawl found 3,571 internal links between sitemap
URLs, 0 orphans (was 35). URL Inspection: 103/103 inspected, 7 indexed,
42 known, 61 unknown, 0 non-self Google canonicals.

| Section | Earned | Weight |
|---|---|---|
| Topical map and coverage | 10 | 20 |
| Contextual relevance | 13 | 15 |
| Entity coverage | 11 | 15 |
| Query semantics | 11 | 15 |
| Internal linking | 15 | 15 |
| Page segmentation | 8 | 10 |
| E-E-A-T | 6 | 10 |
| **Total** | **74** | **100** |

**Score: 74/100 (Developing), up from 42/100 (Weak).** HF1, HF2 and HF3
are closed. HF4 is not formally triggered because EE-2 is PARTIAL (the
author node carries `url` and `worksFor`), but EE-1 still FAILs: the byline
is "The Editor", not a named human. The run is not a pass: TM-3 is an open
P0, and TM-4, EN-2, QS-3, PS-3 and EE-1 are open P1s (TM-4 and QS-3
PARTIAL; EN-2, PS-3 and EE-1 FAIL).

The full run, including the diff by section and the traffic/index evidence,
is in `data/legacy/holisticseo-audit-2026-11-06.md` (untracked). The open
items that need an owner decision are the named critic / `sameAs` profiles,
the supporting content type (a list, guide or explainer), and the 12 draft
seeds.

---

## 8. Change log

- 2026-11-02: first version, baseline 42/100.
- 2026-11-06: second run, 74/100 (Developing); HF1-HF3 closed, TM-3 remains
  the only open P0, EE-1 remains the only open hard-fail substance.
