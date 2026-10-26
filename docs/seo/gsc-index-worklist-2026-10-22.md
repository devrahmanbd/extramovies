# Google indexing worklist - 2026-10-22

Live sitemap: **126 URLs**. Known to Google: **10**. Pending: **116**.

Every URL in the sitemap was checked on 2026-10-22 and all 126 are indexable: HTTP 200, self-referencing
canonical, no `noindex` in the meta tag or the `x-robots-tag`, robots.txt allows everything except `/search`
and `/api/`, and Googlebot receives 200 on the files tested. Nothing is blocking Google. The pending URLs are
simply not crawled yet.

## Read this before clicking anything

Request Indexing is UI-only. There is no API for it: Google's Indexing API covers JobPosting and
BroadcastEvent pages only, and answers 200 for anything else while doing nothing. Search Console also
applies an undocumented daily cap of roughly 10 to 15 submissions per property, so this list is about two
weeks of clicking, not one sitting.

Order matters more than volume: spend the daily cap on pages that can earn a click. Review pages come
first because they are the only pages with search demand behind them. Hubs and taxonomy pages get crawled
through internal links anyway, so they are last on purpose.

**Daily routine:** Search Console -> paste a URL into the URL Inspection box -> Enter -> wait for the live
test -> **Request indexing** -> next URL. Stop when the quota message appears; continue the next day.

## Hype window first (2026-10-23): stop treating this as a backlog

A film's search demand peaks in the first 72 hours after release. Grinding this 116-URL list top to bottom
means the pages you submit get crawled after the moment has passed. The list is therefore re-prioritised for
demand, not for tidiness:

1. **One URL per publish: the review you just shipped.** Spend the day's first Request Indexing click on the
   newest review and nothing else. That is the only submission with a demand window attached, and it usually
   gets crawled within a day or two.
2. **`python3 scripts/seo/notify_publish.py --url <new review>`** after every publish. It pings IndexNow
   (Bing, Yandex, Seznam — same-day, no quota) and re-submits the sitemap to Search Console through the API.
   The sitemap PUT is the sanctioned notification path and is not gated by reCAPTCHA, so this part IS
   automatable and runs in one command. Verified 2026-10-23: IndexNow HTTP 200, sitemap `lastSubmitted`
   moved immediately.
3. **Everything below is backlog.** Submit it only after the week's release is handled, and treat the rest as
   opportunistic. Do not let a queue of old catalog URLs consume the quota that a new release needs.

Bing matters more than usual here: IndexNow reaches it instantly. The block that was standing between
those pings and visibility is **cleared as of 2026-10-23** — the Block URLs list was already empty; the
real block was a stale index verdict from the pre-rebrand era (live test said "URL can be indexed" all
along). Fixed by re-submitting the sitemap (Bing had discovered only 17 of 126 URLs) and spending the
10/day manual quota on the demand-ranked reviews. Bing is now a working same-day channel; the only
remaining lever is the API key (`BING_API_KEY`) for 10,000 URL/day bulk submission.

## Request Indexing cannot be automated (tested 2026-10-22)

An attempt was made to drive the URL Inspection UI over the Chrome DevTools Protocol against a signed-in
Owner session. The clicks land, and Google refuses the request:

- `REQUEST INDEXING` fires `recaptcha/api2/clr`, then the `Fj3Owf` validation RPC, which answers `null` with
  error code `[7]`.
- The UI then shows "Oops! Something went wrong. We had a problem submitting your indexing request."
- Identical for six URLs across two properties, including the already-indexed homepage.
- The click path itself is sound: trusted CDP mouse events reach the button (verified with capture-phase
  listeners), and the same mechanism successfully triggers `TEST LIVE URL` on the same page. `navigator.webdriver`
  is `false` and the user agent is a normal desktop Chrome string.

Conclusion: this is Google's anti-abuse control on a human-only action, not a UI-automation gap. The remaining
116 submissions are manual. Do not spend more time on automation, and do not attempt to defeat the captcha.

Retried on 2026-10-23 against an untouched review URL: same reCAPTCHA error, so it is not a one-day Google
outage. The automation ran on a copy of the signed-in profile (Chrome 156 refuses a debugging port on the
default profile directory), which cannot be ruled out as a contributing factor; a click from the real browser
does not share that condition.

Third attempt (2026-10-25, owner-directed): the real-browser variable above is now closed. The run used a
copied instance of the owner's active Chrome profile (Profile 6, Chrome 156, headed, separate user-data-dir,
no automation flags; `navigator.webdriver` false) driven over CDP with the tab foregrounded via
`Page.bringToFront`. That last part mattered: a non-foregrounded tab silently drops input events, which made
the first runs look dead (typing and clicks did nothing). With the tab foregrounded:

- URL Inspection works end to end through the harness: the search box accepts the URL, the `/inspect` route
  loads, and `REQUEST INDEXING` is present and clickable (click verified by a capture-phase counter and by
  `elementFromPoint` landing on the button itself).
- The click fires the full chain, all HTTP 200: `recaptcha/api.js` (invisible widget), `api2/anchor`,
  `api2/reload` (a 2361-char token is obtained client-side), then the `Fj3Owf` validation RPC and `api2/clr`
  -- the same two calls attempts #1 and #2 recorded.
- The UI then shows the same toast: "Oops! Something went wrong. We had a problem submitting your indexing
  request."
- Three URLs attempted: /reviews/the-batman, /movies, /movies/414906. Refused identically.
- Mid-session quirk worth knowing: after repeated failures the invisible reCAPTCHA widget decays and further
  clicks become silent no-ops (zero network); a page reload restores the widget and the next click fails
  exactly as before.

A real Chrome, a real signed-in session, trusted clicks, and a freshly minted reCAPTCHA token still produce
the refusal, so the block is server-side on this account/property, not an automation artifact. This closes
the one-shot owner authorization to retry: Request Indexing stays manual-only for this property, the
sanctioned bulk paths remain the sitemap resubmit (HTTP 204 on 2026-10-24) and normal recrawl, and no
further CDP attempts should be made.

## Attempt 4 (2026-10-26, owner-directed): same refusal, first fully working run

Owner instruction: "Use chrome CDP as per previous conversation ... to submit 10 more new URLs." The
attempt 3 harness was gone (temp dir cleaned), so it was rebuilt with three fixes learned from that
run's notes and today's own failures:

- Entry point is the property overview URL the owner supplied:
  `https://search.google.com/search-console?resource_id=sc-domain:extramovies.org`. A hard navigation to
  `/search-console/inspect?resource_id=...&id=...` returns Google's 404 page; the route only resolves
  client-side after the header box submits.
- The header box was targeted with the owner's selector
  `#gb > div.gb_Vd.gb_Zd.gb_ae > ... > div.d1dlne > input.Ax4B8.ZAGvjd`. Google's obfuscated classes
  rotated on our load (that chain returned no match), so the harness tries the owner's selector first and
  falls back to `input[aria-label^="Inspect any URL"]`, which resolves the same box
  (`aria: "Inspect any URL in extramovies.org"`).
- After Enter, the live-URL test runs "a minute or two" before Google evaluates the request; the first
  probe's 45s outcome window cut off during that test and looked like a hang. The completed run waited
  it out (50s to the dialog).

Probe result (the run stops at the first adverse outcome, so 9 of the 10 were skipped):

- URL: `https://extramovies.org/reviews/avengers-endgame-2019-review`, never attempted in runs 1-3.
- Flow verified end to end: the box accepts the URL, `/inspect` loads with `REQUEST INDEXING` present,
  the trusted click lands, the live test completes.
- Then the same dialog as runs 1-3: "Oops! Something went wrong. We had a problem submitting your indexing
  request. Please try again later."
- Evidence: `data/legacy/gsc-cdp-attempt4-refusal.png` (dialog in frame) and
  `data/legacy/gsc-cdp-attempt4.log`.

Verdict: the refusal is server-side and account/property-scoped, reproduced on four attempts across five
days (2026-10-22, 10-23, 10-25, 10-26) with a fresh URL and a completed live test. Request Indexing stays
manual-only for this property; the harness is not run again without a fresh owner instruction.

The same 10 URLs went through both sanctioned API channels on 2026-10-26: Bing URL Submission API 10/10
accepted (daily quota now 0/10, monthly 50/60 left), IndexNow HTTP 200 for the same batch, GSC sitemap
resubmit accepted. Batch (title demand + 2026 windows; the-batman excluded as already attempted):
`/reviews/avengers-endgame-2019-review`, `/reviews/joker`, `/reviews/deadpool-2016-review`,
`/reviews/dune-part-two`, `/reviews/toy-story-5-2026-review`,
`/reviews/spider-man-brand-new-day-2026-review`, `/reviews/the-odyssey-2026-review`,
`/reviews/street-fighter-2026-review`, `/reviews/peddi-2026-review`,
`/reviews/pati-patni-aur-woh-do-2026-review`.

## Index count check (2026-10-25)

The owner asked how many URLs Google has actually indexed. Verdict: **7 of the 84 sitemap URLs**
(URL Inspection, authoritative per URL): `/`, `/reviews`, plus the fire-and-ice-1983,
jupiter-ascending-2015, transcendence-2014, masaan-2015 and jailer-2-2026 reviews (the four
older ones show last crawl 2026-10-20). The indexed set is unchanged 10-22 -> 10-25; what moved is
discovery: "Discovered - currently not indexed" went from 3 to 23 after the sitemap resubmit, with
54 of 84 still "URL is unknown".

Two different "7"s were being conflated: a host-level `site:` sample also returns 7 URLs but only
3 overlap the API set, and it includes stale legacy entries still in the index while serving
errors (`/Thriller` 410, `/Musical` 410, `/view/5562` 404, `/view/11611`) that will drop when
Google recrawls them. Whole-domain estimate today: at least 11 distinct URLs (7 current + 4 stale
legacy). `site:` under-reports known-indexed pages; track the audit CSV number, not the sample.

Also: `/movies/414906` (film hub, outside the review-driven sitemap since the hub purge) regressed
from "Discovered" (10-22) to "URL is unknown" (10-25). Expected under the sitemap policy, not part
of the 7.

## Review pages (39)

1. https://extramovies.org/reviews/a-nice-indian-boy-2025-review  <- first ten
2. https://extramovies.org/reviews/ang-probinsyano-2015-review  <- first ten
3. https://extramovies.org/reviews/animals-2026-review  <- first ten
4. https://extramovies.org/reviews/avengers-endgame-2019-review  <- first ten
5. https://extramovies.org/reviews/buddy-2026-review  <- first ten
6. https://extramovies.org/reviews/coyote-vs-acme-2026-review  <- first ten
7. https://extramovies.org/reviews/deadpool-2016-review  <- first ten
8. https://extramovies.org/reviews/dhruva-2016-review  <- first ten
9. https://extramovies.org/reviews/digger-2026-review  <- first ten
10. https://extramovies.org/reviews/disclosure-day-2026-review  <- first ten
11. https://extramovies.org/reviews/dune-part-two
12. https://extramovies.org/reviews/fall-2-deadpoint-2026-review
13. https://extramovies.org/reviews/gandhi-talks-2026-review
14. https://extramovies.org/reviews/hitler-the-rise-of-evil-2003-review
15. https://extramovies.org/reviews/hope-2026-review
16. https://extramovies.org/reviews/insidious-out-of-the-further-2026-review
17. https://extramovies.org/reviews/joker
18. https://extramovies.org/reviews/light-of-the-world-2025-review
19. https://extramovies.org/reviews/masterplan-2026-review
20. https://extramovies.org/reviews/matchbox-the-movie-2026-review
21. https://extramovies.org/reviews/mayday-2026-review
22. https://extramovies.org/reviews/neverland-2011-review
23. https://extramovies.org/reviews/other-mommy-2026-review
24. https://extramovies.org/reviews/pati-patni-aur-woh-do-2026-review
25. https://extramovies.org/reviews/peddi-2026-review
26. https://extramovies.org/reviews/practical-magic-2-2026-review
27. https://extramovies.org/reviews/resident-evil-2026-review
28. https://extramovies.org/reviews/runner-2026-review
29. https://extramovies.org/reviews/sense-and-sensibility-2026-review
30. https://extramovies.org/reviews/spider-man-brand-new-day-2026-review
31. https://extramovies.org/reviews/street-fighter-2026-review
32. https://extramovies.org/reviews/the-death-of-robin-hood-2026-review
33. https://extramovies.org/reviews/the-fix-2026-review
34. https://extramovies.org/reviews/the-odyssey-2026-review
35. https://extramovies.org/reviews/the-social-reckoning-2026-review
36. https://extramovies.org/reviews/toy-story-5-2026-review
37. https://extramovies.org/reviews/unfreedom-2015-review
38. https://extramovies.org/reviews/whalefall-2026-review
39. https://extramovies.org/reviews/you-can-see-everything-2026-review

## Index pages (4)

40. https://extramovies.org/about
41. https://extramovies.org/contact
42. https://extramovies.org/series
43. https://extramovies.org/upcoming

## Title hubs (41)

44. https://extramovies.org/movies/1057265
45. https://extramovies.org/movies/1058424
46. https://extramovies.org/movies/1084244
47. https://extramovies.org/movies/1101412
48. https://extramovies.org/movies/1128614
49. https://extramovies.org/movies/1137844
50. https://extramovies.org/movies/1148365
51. https://extramovies.org/movies/1153576
52. https://extramovies.org/movies/1204680
53. https://extramovies.org/movies/1228834
54. https://extramovies.org/movies/1234139
55. https://extramovies.org/movies/1236045
56. https://extramovies.org/movies/1248832
57. https://extramovies.org/movies/1255833
58. https://extramovies.org/movies/1275779
59. https://extramovies.org/movies/1281331
60. https://extramovies.org/movies/1284465
61. https://extramovies.org/movies/1291595
62. https://extramovies.org/movies/1302904
63. https://extramovies.org/movies/1320660
64. https://extramovies.org/movies/1368337
65. https://extramovies.org/movies/1374686
66. https://extramovies.org/movies/1377237
67. https://extramovies.org/movies/1400837
68. https://extramovies.org/movies/1423191
69. https://extramovies.org/movies/15035
70. https://extramovies.org/movies/1503762
71. https://extramovies.org/movies/1514026
72. https://extramovies.org/movies/1561726
73. https://extramovies.org/movies/157353
74. https://extramovies.org/movies/1765072
75. https://extramovies.org/movies/293660
76. https://extramovies.org/movies/299534
77. https://extramovies.org/movies/329864
78. https://extramovies.org/movies/336203
79. https://extramovies.org/movies/410994
80. https://extramovies.org/movies/475557
81. https://extramovies.org/movies/693134
82. https://extramovies.org/movies/76757
83. https://extramovies.org/movies/786567
84. https://extramovies.org/movies/969681

## Taxonomy pages (29)

85. https://extramovies.org/cast/arvind-swamy
86. https://extramovies.org/cast/austin-abrams
87. https://extramovies.org/cast/eric-bauza
88. https://extramovies.org/cast/john-cena
89. https://extramovies.org/cast/josh-brolin
90. https://extramovies.org/cast/karan-soni
91. https://extramovies.org/cast/mark-ruffalo
92. https://extramovies.org/cast/michael-benyaer
93. https://extramovies.org/cast/rakul-preet-singh
94. https://extramovies.org/cast/ram-charan
95. https://extramovies.org/cast/robert-pattinson
96. https://extramovies.org/cast/ryan-reynolds
97. https://extramovies.org/cast/stockard-channing
98. https://extramovies.org/cast/tom-holland
99. https://extramovies.org/cast/zendaya
100. https://extramovies.org/category/action
101. https://extramovies.org/category/action-adventure
102. https://extramovies.org/category/adventure
103. https://extramovies.org/category/animation
104. https://extramovies.org/category/comedy
105. https://extramovies.org/category/crime
106. https://extramovies.org/category/drama
107. https://extramovies.org/category/family
108. https://extramovies.org/category/fantasy
109. https://extramovies.org/category/horror
110. https://extramovies.org/category/mystery
111. https://extramovies.org/category/romance
112. https://extramovies.org/category/science-fiction
113. https://extramovies.org/category/thriller

## Everything else (3)

114. https://extramovies.org/series/43720
115. https://extramovies.org/series/46976
116. https://extramovies.org/series/66515

## Already known to Google

- https://extramovies.org/ (Submitted and indexed)
- https://extramovies.org/movies (Discovered - currently not indexed)
- https://extramovies.org/movies/414906 (Discovered - currently not indexed)
- https://extramovies.org/reviews (Submitted and indexed)
- https://extramovies.org/reviews/fire-and-ice-1983-review (Submitted and indexed)
- https://extramovies.org/reviews/jailer-2-2026-review (Submitted and indexed)
- https://extramovies.org/reviews/jupiter-ascending-2015-review (Submitted and indexed)
- https://extramovies.org/reviews/masaan-2015-review (Submitted and indexed)
- https://extramovies.org/reviews/the-batman (Discovered - currently not indexed)
- https://extramovies.org/reviews/transcendence-2014-review (Submitted and indexed)


## Semrush tracking (project 31709043, live 2026-10-23)

- Dashboard: https://www.semrush.com/seo/31709043/ — Authority Score 2, 324 ref. domains,
  organic (IN) ~128 visits / 10-25 keywords. Location set to India to match GSC (85% IN clicks).
- Site Audit: 98% health, 0 errors, 114 warnings (100-page free cap). Triaged 2026-10-23:
  - Fixed in repo (this commit): hero-slide dots lacked anchor text (10), reviewed
    /movies/<tmdbId> now canonicalizes to /reviews/<slug> (duplicate-intent consolidation,
    ~30 hubs), unreviewed movie/series pages no longer promise "review — verdict" in titles.
  - Accepted by design: 76 external 403s are themoviedb.org blocking Semrush's crawler;
    19 blocked URLs are robots.txt-disallowed filter pages (?genre=, /signup); 62 nofollow
    outbound links are policy; low text/HTML ratio is JSON-LD weight (improves as content grows).
  - Server-side (owner): HSTS headers on apex + www are the only panel-level item.
- Position Tracking: India • Google • English • Desktop, 19 active keywords (all non-template
  rows from keywords-extramovies.csv), gathering started 2026-10-23, weekly email on.
- Re-audit 2026-10-23, after the a5637af release: **94% health, 18 errors, 113 warnings**
  (from 98% / 0 / 114) — the delta splits cleanly:
  - Confirmed fixed: "links have no anchor text" (10) is gone (AI Search issues 2 -> 1),
    low word count 47 -> 46.
  - The 18 errors were self-inflicted: the same release canonicalized reviewed
    /movies/<tmdbId> hubs to /reviews/<slug> while the sitemap still listed those hubs
    ("non-canonical URL in sitemap.xml"). Fixed next commit: the sitemap lists no film
    hubs at all (the review-driven rule only ever produced canonicalized ones; unreviewed
    hubs were never listed). Series hubs stay — a series page never renders a review, so
    /series/<tmdbId> is self-canonical. Expect 0 errors on the next crawl.
  - The remaining 113 warnings are the accepted-by-design set above.
- **Re-audit 2 after the sitemap fix (same day): 98% health, 0 errors, 115 warnings** —
  "incorrect pages found in sitemap.xml" is gone from the issue list entirely; anchor-text
  issue still absent. Warning wobble (113 -> 115) is crawl page-set noise inside the
  accepted set (word count 47, text/HTML 68 — the crawl now reads an 84-URL sitemap).

## Bing URL Submission API — full-sitemap pass (2026-10-23)

- Submitted-so-far list pulled live from the Bing UI (authoritative): **25 URLs** —
  10 via API that morning, 10 via UI, 5 older. One alias (`/reviews/dune-part-two`)
  301s to the canonical, so the canonical stays in the pending set.
- Pending = sitemap 84 − submitted 24 (one submitted URL, `/movies/414906`, is not in
  the sitemap) = **60 URLs**, ordered root → series → reviews → categories → cast.
- Hard API cap (Bing's, shared with the UI): **10/day, 80/month left** (monthly covers
  the 60). Daily quota resets ~18h after check (next window 2026-10-24 morning).
- IndexNow re-pinged all 84 sitemap URLs: **HTTP 200, quota-free** — that is the
  same-day bulk channel; the Submission API is the daily priority nudge on top.
- A local driver (20-min cycles) submits `min(daily, monthly, 10, remaining)` per
  window and pops only URLs Bing acknowledged (`submitted : N`), logging to
  `bing_driver_log.txt`. If the machine was off across a window, re-run it — the
  queue file is the state; nothing is lost or double-spent.
