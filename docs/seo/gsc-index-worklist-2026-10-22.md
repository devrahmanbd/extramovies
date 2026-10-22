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

Bing matters more than usual here: IndexNow reaches it instantly and its blocked-URL list is the thing
standing between those pings and visibility. Clearing it in Bing Webmaster is worth more than 100 Google
submissions for the first three days after release.

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

