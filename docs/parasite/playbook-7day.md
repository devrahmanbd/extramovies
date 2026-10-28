# Parasite playbook: 7 days to indexed, DA 30, 300+ clicks

Written 2026-10-23. Everything this plan posts already exists as draft copy in this
directory: 9 title folders with 6 ready-to-post files each (`medium.md`, `reddit.md`,
`quora.md`, `youtube.md`, `letterboxd.md`, `notes.md`) plus `profile-kit/` for the
accounts themselves. Nothing here posts automatically; the owner publishes by hand
from their own accounts.

---

## 1. Read this first: what the three targets really mean

| Target | What it measures | Honest outlook for 7 days |
|---|---|---|
| **Index a URL in 24 hours** | Google and Bing have fetched the page | **Bing: yes, minutes, automatic. Google: usually yes if you run the 4-trigger protocol in section 2. No method forces Google.** |
| **DA 30 / PA 30** | Moz's link-based score | **Cannot move in 7 days at all.** Moz refreshes its index roughly monthly, so the number is physically frozen until the next refresh regardless of what you do. Real target: 60-90 days |
| **300+ clicks** | must be defined before it is chased | **300 total sessions in 7 days: reachable**, and section 5 shows the math. **300 search clicks in 7 days: not reachable**; we are at 13 search clicks per 28 days, and search compounds over weeks |

### The detail behind each row

**24-hour indexing.** The people in the community who do this stack four triggers at
once: an IndexNow ping (Bing indexes within minutes), a sitemap re-submit, one manual
Request Indexing click in Search Console, and a link posted on a domain Google crawls
constantly (Medium, Reddit, Quora, YouTube, Letterboxd). That stack gets most new URLs
into Google inside a day on any site that is otherwise clean. What nobody can do is
*force* Google: any "guaranteed indexing service" is either using the Google Indexing
API (it returns HTTP 200 for article URLs and does nothing) or selling links from
private blog networks. Both are out. Our site is clean: all 126 sitemap URLs serve
200, self-referencing canonicals, no noindex, robots.txt open.

**DA 30 in 7 days is structurally impossible, not just hard.** Three separate reasons:
(1) Moz updates its index about once a month, so no score moves between refreshes;
(2) the profiles this plan creates are almost all nofollow, so they build the entity
and send clicks but do not raise *our* DA; (3) DA is not a Google ranking factor
anyway. Section 6 gives the real DA plan. The 7-day deliverable for DA is: log today's
number, publish the corroboration, and start the two activities that add followed
referring domains.

**300 clicks.** Two numbers exist and they are not interchangeable:

- **Search clicks (GSC):** 13 clicks / 257 impressions in the last 28 days. Search
  traffic for a new domain arrives over weeks, not days.
- **Total sessions (Umami, production tag already on the site):** the number this plan
  targets. Reddit, Medium, YouTube, Bing and direct visits all count here.

"300+ clicks in 7 days" means **300 sessions in Umami**. Section 5 shows where they
come from and which two conditions are load-bearing.

---

## 2. The 24-hour indexing protocol

Run this every time a review goes live. Total owner time: about 2 minutes, plus one
60-second Search Console click.

| When | Action | Who | How |
|---|---|---|---|
| T+0 | Publish. The review is live, linked from the homepage, in the sitemap with a fresh `lastmod`, and in the RSS feed | automatic | the site does all four on publish |
| T+1 min | IndexNow ping (Bing, Yandex, Seznam) + sitemap re-submit to Search Console | one command | `python3 scripts/seo/notify_publish.py --url https://extramovies.org/reviews/<slug>-review` |
| T+2 min | **Request Indexing** on that URL, and only that URL | owner, 60 seconds | Search Console -> URL Inspection box -> paste URL -> Enter -> wait for the live test -> **Request indexing** |
| T+30 min | Publish the Medium version with the canonical link set | owner | `medium.md` of that title folder. Medium is crawled by Google every few minutes; this is the fastest external discovery trigger we have |
| T+2 h | Post the Reddit discussion where the subreddit's rules allow it | owner | `reddit.md` of that title folder. Read the sub's rules first; discussion-first, link only where permitted |
| T+4 h | Verify | agent | `python3 scripts/seo/gsc_api.py inspect --site sc-domain:extramovies.org --url <review-url>` |
| T+24 h | Verify again | agent | same command |
| Weekly, once profiles exist | Extra discovery triggers: Letterboxd diary entry, Quora answer, YouTube description | owner | `profile-kit/`, `quora.md`, `youtube.md` |

### What each trigger is actually worth

| Trigger | Who controls it | Realistic effect |
|---|---|---|
| IndexNow ping | automatic on our side | Bing and Yandex fetch within minutes. This is the only guaranteed same-day channel |
| Sitemap re-submit (API, no reCAPTCHA) | our script | Google re-reads the sitemap the same day and sees the new URL with fresh lastmod |
| Request Indexing click | owner, 1 per URL | The URL usually gets crawled within 2-24 hours. This is where most "indexed in 24h" results actually come from |
| Homepage internal link | automatic | Google discovers the URL on its next homepage crawl, which for an indexed page can be the same day |
| Medium / Reddit / Quora / Letterboxd link | owner, minutes | Googlebot discovers the URL from a domain it crawls many times a day. Raises the odds of a same-day discovery hit |
| The actual Google index decision | Google | Not controllable. The stack above maximises the odds; it does not guarantee them |

### If the URL is still not on Google at T+24h

1. Re-check the basics: live test returns 200, canonical points at itself, no
   `noindex` in meta or `x-robots-tag`. (The last full sweep was 126/126 clean, but a
   new URL must be checked on its own.)
2. Read the coverage state in URL Inspection:
   - **"Discovered - not indexed"**: Google knows the URL and chose to wait. Common on
     new domains. Add a second discovery link and give it a few days.
   - **"Crawled - not indexed"**: Google read the page and rejected it. That is a
     quality or duplication verdict, not a submission problem. Do not re-request; fix
     the page (content depth, uniqueness, entity signals) instead.
   - **"URL is not on Google" + live test passes**: click Request Indexing once more
     next day (one click per URL per day, ~10-15 per day total quota).
3. Add a second discovery link: a Quora answer, an X post, or the Letterboxd diary
   entry for that film.
4. If a week passes with repeated "Discovered - not indexed", stop spending effort on
   indexing technique. That is an authority problem; the answer is links and content,
   and no trick bypasses it.

### What the community actually does (and does not)

- **Does:** IndexNow for Bing (instant), one Request Indexing click per new URL,
  a link on a fast-crawled platform, an honest sitemap with lastmod. That is the
  whole trick, and we have all four wired.
- **Does not:** Google has no bulk or API path for article indexing. The Indexing API
  is for job postings and live events only; it answers 200 for any URL and changes
  nothing. Services advertising "instant Google indexing" through it are noise.
- **Never:** private blog networks, bought links, "indexing packages" from marketplace
  sellers. Those are the fastest way to get a new domain demoted.

---

## 3. Platform matrix: what goes where

| Priority | Platform | Asset | Content form | Link | Followed? | Effect | Removal risk | Effort |
|---|---|---|---|---|---|---|---|---|
| 1 | **Letterboxd** | `profile-kit/letterboxd-profile.md`, `letterboxd-diary-entries.md` | profile bio + dated diary entries | website field + diary links | nofollow | entity corroboration, daily crawl, referral readers | low | 1 hour once |
| 2 | **Medium** | `medium.md` per title (9 ready, canonical set) | full standalone article | canonical back to our review + footer link | canonical link | discovery trigger for Google + reach | low with canonical | 20 min per article |
| 3 | **Reddit** | `reddit.md` per title | discussion post in the matching sub | link where the sub allows it | nofollow | the biggest single click source available | medium: rules differ per sub | 15 min per post |
| 4 | **Quora** | `quora.md` per title | answer to a real question | link inside the answer where it helps | nofollow | brand queries ("is extramovies a safe site"), slow compounding | low | 15 min per answer |
| 5 | **YouTube** | `youtube.md` per title, `profile-kit/youtube-channel.md` | short video, link in description | description link | nofollow | highest reach per asset, also feeds Google Discover | none | high: recording |
| 6 | **X** | `profile-kit/reddit-quora-x.md` | short posts | link when natural | nofollow | entity signal, no meaningful clicks | low | 5 min |

Rules that apply to all six, from experience and platform policy:

- **Never identical cross-posts.** Every asset in this folder is already written
  per platform; keep it that way. Medium always gets the canonical link set, so the
  duplicate resolves to us instead of competing with us.
- **Value in the body, link in the natural place.** Posts whose only content is a link
  get removed; posts that answer something real get tolerated and upvoted.
- **One account per day when creating them**, same photo, same name, same one-line
  description from `profile-kit/consistency-matrix.md`. Bursts of same-day account
  creation across platforms get flagged.
- **Reddit warms up first:** create the account on day 1 and comment without links;
  first link post comes on day 2 at the earliest.
- **Never buy links, never PBNs, never guest-post farms, never link exchanges.**
  These are the classic ways a new domain gets penalised before it ever ranks.

---

## 4. The 7-day calendar

Owner actions are manual account work; agent actions are commands I run here.

### Day 1 - foundation (owner: about 2 hours)

- [ ] **Letterboxd profile completed** (highest leverage single action): display name,
      bio, website field with the UTM link, profile photo, the 20 diary entries, 3
      lists. Source: `profile-kit/letterboxd-profile.md` +
      `profile-kit/letterboxd-diary-entries.md`.
- [x] **Bing index block cleared** (done 2026-10-23, automated in the owner's
      Bing Webmaster session). Finding: the Block URLs list was already empty —
      the real block was a stale index verdict ("Blocked / URL cannot appear")
      left over from the pre-rebrand era, while the live test says "URL can be
      indexed by Bing" (robots.txt permissive, meta `index,follow`, no
      x-robots-tag). Actions taken: re-submitted the sitemap (Bing had only
      discovered **17 of 126** URLs from its 10/20 crawl) and spent the 10/day
      manual quota on the 9 demand-ranked reviews (list 13 -> 22). IndexNow
      verified landing: 158 URLs in 23h, source Self. Remaining owner lever:
      create the Bing Webmaster API key (`BING_API_KEY`) for 10,000 URL/day
      bulk submission — the 10/day UI quota is the bottleneck until then.
- [ ] Create the **Medium account** (`@extramoviesreviews`) per the consistency matrix.
- [ ] Create the **Reddit account** (`u/extramoviesmag`) and spend 15 minutes
      commenting in film subs, no links.
- [ ] **Log today's DA/PA**: free Moz account -> Link Explorer -> `extramovies.org`.
      Write the number into the log in section 9. (Give me a Moz API key and I track
      it automatically from week 2.)
- Agent (done in this commit): `sameAs` now lists the Letterboxd profile and the About
      page links it visibly; `scripts/seo/notify_publish.py` runs both notifications
      in one command.

### Day 2 - first posts

- [ ] **Medium article 1: Toy Story 5** (3,600 searches/month, the highest-volume
      keyword we hold a draft for). Set the canonical to our review URL as the file
      instructs.
- [ ] **Reddit post 1**: the Toy Story 5 discussion, in a sub whose rules were read
      first (`r/pixar` or `r/animation` are the candidates; confirm before posting).
- [ ] Run `notify_publish.py` for the day's URLs; one Request Indexing click on the
      newest unindexed review.

### Day 3 - second wave

- [ ] **Medium article 2: Spider-Man: Brand New Day** (1,000/month, KD 33).
- [ ] **First Quora answer**: either the film question matching our draft or the brand
      question ("is extramovies a safe site" is a real People-Also-Ask query).
- [ ] Letterboxd: 10 more diary entries + the 3 lists if not done on day 1.
- [ ] Create the **X account** and post once, naturally.

### Day 4 - video

- [ ] Create the **YouTube channel** per `profile-kit/youtube-channel.md`.
- [ ] First video from the `youtube.md` script (Toy Story 5 again, to keep one title
      concentrated across platforms in the same week).
- [ ] **Reddit post 2**, different sub (Spider-Man: `r/marvelstudios` or
      `r/spiderman`), rules read first.

### Day 5 - double down on what worked

- [ ] Read Umami (sessions by referrer) and GSC (search clicks). Whatever channel sent
      traffic yesterday gets repeated today; whatever sent none gets dropped for the
      rest of the week.
- [ ] **Medium article 3: Avengers: Endgame** (720/month at KD 21, the winnable one).

### Day 6 - entity corroboration

- [ ] Quora answers 2 and 3, more Letterboxd diary entries, one X post.
- [ ] Deliberately do **not** create any new accounts today. Distribution over days,
      not bursts.

### Day 7 - measure and decide

- [ ] Full index sweep: `python3 scripts/seo/gsc_index_audit.py --max 130 --out
      data/legacy/gsc-index-audit-$(date +%F).csv`
- [ ] Fill the log in section 9: index count, 7-day search clicks, 7-day sessions,
      DA, referring domains.
- [ ] Decide week 2 from the numbers: if Medium produced both clicks and indexed
      referrals, it gets the next 9 articles; if Reddit produced the sessions, the
      next wave is Reddit-first with Medium as canonical support.

---

## 5. Where the 300 clicks come from

Sessions in Umami, by channel, for the 7 days:

| Source | Conservative | Target | Stretch | Load-bearing condition |
|---|---|---|---|---|
| Reddit | 40 | 150 | 500 | one post lands in an allowing sub; rules respected |
| Bing organic | 20 | 70 | 200 | **blocked-URL list cleared** + IndexNow flowing |
| Medium | 10 | 40 | 100 | canonical set; publication follows the profile |
| Google organic | 2 | 8 | 25 | the section 2 protocol + time; this is not where week 1 wins |
| YouTube | 0 | 20 | 100 | channel and first video live by day 4 |
| Letterboxd, direct, brand | 15 | 40 | 90 | profile completed on day 1 |
| **Total** | **87** | **328** | **1,015** | |

Reading the table honestly:

- **The target column (328) is the plan.** Two conditions are load-bearing: the Bing
  unblock, and one Reddit post actually landing. Both are in the calendar for a reason.
- **If Reddit does not allow link posts in the candidate subs**, the target drops to
  roughly 180 in week 1 and 300 arrives in week 2. That is the biggest single variance
  in the table.
- **Google organic is deliberately not the bet.** It is included for completeness at
  honest numbers. Week 1 wins on Bing, Reddit and Medium; Google compounds from week 3.

---

## 6. What actually gets DA to 30

DA (Moz) and PA are link-based scores on a monthly index. They are lagging indicators
of one thing: **followed links from other sites**. Knowing that, the plan is short:

1. **Legacy link reclamation (already running, biggest lever we have).** 43% of our
   historic backlinks pointed at dead legacy paths. The mapped legacy URLs now 301 to
   live pages, and 36 of 44 known dead inbound links have been revived by republishing
   the content they referenced. When Google reprocesses those redirects and pages,
   links we already earned start counting again. This is DA work happening without any
   new outreach.
2. **Two editorial links per week from film sites.** Guest reviews, quote roundups,
   corrections offered to blogs that link to us, interviews. Each accepted one is a
   new followed referring domain. This is slow and it is the actual mechanism.
3. **Data stories from our own catalog.** We can generate claims nobody else has: the
   highest-rated films of 2026 by one publication that watched them all, rating
   spreads between us and the aggregates, which films we called wrong. One pickup in
   entertainment press is several followed domains at once.

**What does not move DA:** the parasite profiles in section 3 (nofollow by design),
directory spam, bought links, link exchanges.

**Timeline, honestly:** log today's number on day 1. Moz refreshes roughly monthly, so
the earliest any work can show is the next refresh. DA 30 in 60-90 days is realistic
given 321 existing referring domains plus the legacy reclamation plus ~2 new editorial
links per week. DA 30 in 7 days is not a slow plan; it is an impossible one.

---

## 7. Removal risks (short version)

| Risk | Where | Prevention |
|---|---|---|
| Post removed for promotion | Reddit, Medium | value-first body, link only where the rules allow it, rules read before posting |
| Account flagged or banned | all | one account per day, identical name/photo/bio per the consistency matrix, warm-up comments before first link post |
| Duplicate content fight | Medium vs site | canonical always set to our review URL (the asset files carry the exact URL to paste) |
| Shadowban | Reddit | no cross-post bursts, no link drops in comment threads that ban them, karma first |
| Domain-level penalty | our site | never buy links, never PBN, never guest-post farms, never exchange links |

If a parasite page ranks for a term we also target, that is a win, not cannibalisation:
it feeds the brand query and the review link underneath it.

---

## 8. Daily measurement (2 minutes)

```bash
# search clicks for the last 7 days
python3 scripts/seo/gsc_api.py query --site sc-domain:extramovies.org --dimensions query --rows 20 \
  --start-date <YYYY-MM-DD minus 7> --end-date <YYYY-MM-DD>

# is the newest review on Google yet?
python3 scripts/seo/gsc_api.py inspect --site sc-domain:extramovies.org --url <review-url>

# full sweep (rate-limited; at most once a day)
python3 scripts/seo/gsc_index_audit.py --max 130 --out data/legacy/gsc-index-audit-$(date +%F).csv
```

- **Search clicks:** the GSC command above.
- **Sessions and referrers:** the Umami dashboard (production tag, extramovies
  property). The UTM links from `profile-kit/consistency-matrix.md` arrive tagged
  `utm_source=profile&utm_medium=parasite&utm_campaign=brand-2026`, so campaign
  traffic separates from organic in the referrer and campaign views.
- **Bing:** two pages answer this. URL Submission (submitted list, quota counter)
  shows manual submissions; IndexNow page shows what the automatic pings
  delivered ("URLs submitted in last 23 hours"). Sitemaps page's "URLs
  discovered" should read the full sitemap count once the 2026-10-22 re-crawl
  finishes (was 17 before).

---

## 9. Log

Append one row per day. No row, no claim.

| Date | Indexed (of sitemap total) | Search clicks 7d | Sessions 7d | DA/PA | Referring domains | Notes |
|---|---|---|---|---|---|---|
| 2026-10-23 | 10 known (pre-week) | 13 / 28d baseline | to read | to read | 321 (Semrush) | baseline before day 1 |
| 2026-10-23 | — | — | — | — | — | Bing fixed via owner session: Block URLs already empty; real block = stale verdict, live test clean; sitemap re-submitted (17 -> 126 pending); 9 demand-ranked reviews + coyote submitted (list 13 -> 22); IndexNow 158/23h confirmed |
| 2026-10-23 | — | — | — | — | — | Semrush project live (31709043): Site Audit 98% health, 0 errors / 114 warnings; Position Tracking India-Google-Desktop, 19 active keywords gathering. On-site fixes committed: hero-dot anchor text, reviewed /movies/[tmdbId] canonicalizes to /reviews/<slug>, honest titles on unreviewed movie/series pages |
| 2026-10-23 | — | — | — | — | — | Released a5637af to prod-extra (deploy green, canonicals/titles verified live); Bing API daily quota used on next-tier demand: peddi, pati-patni-aur-woh-do, practical-magic-2, insidious, matchbox, mayday, buddy, dune-part-two, deadpool, dhruva (10/10 accepted, monthly 80/90 left) |
| 2026-10-23 | — | — | — | — | — | Semrush re-audit after release: 94% / 18 errors / 113 warnings — hero-dot anchor-text issue gone, word count 47->46; the 18 errors were the release's own canonicalization leaving reviewed film hubs in the sitemap -> film hubs dropped from sitemap (canonical URLs only), 3 tests inverted, gates 676/676 + build green |
| 2026-10-23 | — | — | — | — | — | Released cbb0f59 (sitemap = canonical URLs only): live sitemap 126 -> 84 URLs, 0 film hubs; Semrush re-crawl confirms **98% health / 0 errors**, sitemap issue gone; GSC sitemap re-submit accepted; Bing sitemap re-submitted (Processing) |
| 2026-10-27 | 7 indexed (of 84) | 15 clicks / 302 imp (Oct 1-27) | — | AS 2 (Semrush) | 330 | weekly audit: 84/84 sitemap URLs 200, 0 errors; 7 indexed / 21 discovered-not-indexed / 56 unknown = 77-URL worklist; discovery stalled (30 -> 28 known); GSC funnel 0.88 clicks/day vs Scenario C 0.45, 45 query rows still 100% brand |
| 2026-10-27 | — | — | — | — | — | IndexNow 84/84 HTTP 200 + GSC sitemap re-submit 204; Bing daily quota reset: 10 demand-ordered submitted (resident-evil-2026, practical-magic-2, insidious, coyote-vs-acme, robin-hood, matchbox, gandhi-talks, dhruva, hitler-rise-of-evil, /upcoming), 10/10 accepted, monthly 40 left |
| 2026-10-27 | — | — | — | — | 330 | backlink profile doc + measured KD applied to keywords-extramovies.csv (10 measured cells, 5 priority swaps, 2 new rows) pushed as f4924a6 (docs-only, no deploy); backlink verdict: legacy dead-end links are the reclaim lever, no disavow |
| 2026-10-28 | — | — | — | — | — | Writer batch 1 seeds committed (0585e5b, 5 P0/P1 reviews, drafts); Semrush batch 2 measured + applied (106fd4c): avengers endgame + /upcoming promoted P0, whalefall + new-movie-reviews demoted P2 (KD 70/80); Bing 10/10 accepted (fall-2, mayday, a-nice-indian-boy, animals, disclosure-day, digger, hope, the-fix, sense-and-sensibility, whalefall), monthly 30 left; quota endpoint advertised 100/400 but enforcement is 10/day - the 84-URL over-batch was rejected at zero cost; writer batch 2 landed (f808b84: premam P0 + ratsasan P1 seeds) - every active P0/P1 film page now has a seed |

---

## Appendix: decision summary

| This plan says yes to | This plan says no to |
|---|---|
| IndexNow + sitemap API + one Request Indexing click per new URL | Google Indexing API for articles (returns 200, does nothing) |
| Medium with canonical back | identical cross-posts without canonical |
| Reddit where the sub's rules allow it | link dropping in subs that ban it |
| Letterboxd as the day-1 entity anchor | buying links, PBNs, guest-post farms |
| Editorial outreach for DA | chasing DA as if it were a ranking factor |
| 300 sessions as the week-1 target | promising 300 search clicks in week 1 |
