# Brand entity playbook · extramovies.org

**Written:** 2026-10-21 · **Scope:** the brand terms only, not the review inventory
· **Sources:** `.superpowers/sdd/brand-serp-report.md`, `.superpowers/sdd/semrush-pull-report.md`,
`.superpowers/sdd/about-page-report.md`, `.superpowers/sdd/alternate-name-report.md`,
`.superpowers/sdd/profile-kit-report.md`, `.superpowers/sdd/taxonomy-routes-report.md`,
`docs/seo/gsc-findings-2026-10-20.md`, and live reads of extramovies.org on 2026-10-21.

Status labels used throughout: **[DONE]** means shipped and verifiable in the repo.
**[OWNER]** means only the owner can do it, from an account only the owner holds.

---

## 1. The situation

Semrush's India database puts extramovies.org at position 25 for `extramovies`
(201,000 monthly searches), 23 for `extramovies com` (27,100), 28 for `extra movies`
(40,500), 24 for `extramoviez` (1,900), 36 for `www extra movie` (210), 40 for
`extramovies in download` (260), 35 for `extramovies web series` (170), 45 for
`extramovies pics` (390) and 53 for `extra movie fun` (210); the US database has
`extramovies` at position 28. A live read of the SERP on 2026-10-21 found
extramovies.org absent from the results for every one of those brand terms in both the
US and the India SERP, including for its own domain name. The mirror family
(`extramovies.actor` and its `.com`, `.com.in`, `.vin`, `.giving`, `.ist`, `.in`,
`.cc` and `.asia` siblings) holds positions 1 to 5 across the India brand SERPs:
position 1 on `extramovies`, position 1 on `extramovies com`, positions 4 and 5 on
`extramovies web series`. The AI Overview for the
brand calls Extramovies "a well-known shadow-hosting website", and for
`extramovies in download` it says "ExtraMovies is an unofficial and illegal pirated
website". The same AI Overview for the query `extramovies.org` already describes the
site correctly as "an independent film journal and movie review site offering personal
film criticism, ratings, trending lists, and curated collections". Google understands
the domain. Google does not understand the name.

### What we do not own

| Platform | Handle | State on 2026-10-21 | Whose it is |
|---|---|---|---|
| Letterboxd | `letterboxd.com/extramovies/` | **Exists, ours.** 453 films, 45 diary entries, 1 follower, no bio, no website link | Ours |
| YouTube | `@extramovies` | Taken, unrelated channel ("Ever Tone") | Not ours |
| YouTube | `@EXTRAMOVIESREVIEWS` | Live, legacy Hindi channel. Owns the `#extramovies` hashtag page that sits at position 3 in the US and position 2 in India for the head term | Legacy |
| Medium | `@extramovies` | Suspended, HTTP 410 | Legacy download site |
| Reddit | `r/Extramovies` | Banned | Legacy |
| X | `@extraMOVIES` | Live, 2012 ghost account, 0 posts, joined as "the official twitter for extraMovies" | Legacy |
| Wikipedia | `en.wikipedia.org/wiki/Extramovies` | 404, no article | Nobody |
| TMDB | search for `extramovies` | 0 results, no entity | Nobody |

Nobody on the web currently links to extramovies.org with the anchor text
"Extramovies".

---

## 2. Why rank 1 is an entity problem, not a link problem

The mirror family cannot be out-linked, and it should not be tried.

The Semrush backlink profile for extramovies.org is 685 backlinks from 321 referring
domains and 269 referring IPs. 158 of those 685 links (23 percent) carry exact-match
spam anchor text bought from one network, including anchors like "high quality
dofollow backlinks da 50 pa 40 premium pbn network service extramovies.org rank
first page google fast seo link building buy backlinks online cheap". A further 134
are nofollow links from one authority-score-0 network domain. 295 of the 687
retrieved links (43 percent of the profile) pointed at paths that no longer exist.
The profile looks large and is worth little: it is a legacy download site's link
profile, and the spam share of it is what Google has already learned to discount.

So the honest position is this: the opposition holds positions 1 to 5 with a decade
of exact-domain-match links and thousands of third-party descriptions of itself. We
cannot out-link that. What we can do is out-describe it, because the thing that is
actually sitting in position 1 is not a page, it is Google's answer.

The evidence for that is in the numbers already collected:

- Google's model of **extramovies.org** is already correct and current: the AI
  Overview for the domain describes an independent film journal with our reviews on
  it.
- Google's model of **the string "Extramovies"** is that it is a piracy brand. The
  AI Overview for `extramovies` calls it a shadow-hosting site; for
  `extramovies in download` it says unofficial and illegal, with malware and phishing
  warnings.
- The sources Google assembles that answer from are third-party pages it already
  trusts: the mirror domains, a Scribd document titled "ExtraMovies: Free Movie
  Download Hub", a similarweb traffic page for `extramovies.ist`, a legacy Instagram
  account, a YouTube hashtag page owned by the old channel, and a traffic-analyser
  page for `extramovies.asia`. Not one of them is ours.
- On five of the six brand terms there is an AI Overview and no knowledge panel, no
  video pack and no sitelinks. There is no SERP feature to occupy. The answer box is
  the whole fight, and we are not in it.

An AI Overview is assembled from the corroborating web, not from our own pages
alone. Our own pages cannot vote for themselves in a Google model. That is why the
plan below is mostly off-domain.

**What this means for the plan:**

1. More pages on extramovies.org aimed at these brand terms does nothing. The brand
   SERP is not a page problem; it is an entity problem. The one exception is the
   `extramovies web series` term, which has no AI Overview and is a content problem
   (see action 5).
2. The same brand name, the same one-line description and the same website link have
   to appear on independent platforms that Google already trusts, and the wording has
   to be identical on each of them. Inconsistency reads as two entities.
3. Our own pages have to say plainly what we are, in full sentences, so the
   description that lands on those platforms is checkable against a source we own.
   The About page does that job and it is live.
4. The end state we want is inbound links whose anchor text is "Extramovies" pointing
   at a review page, not at the bare domain. That is the one link-shaped outcome
   worth chasing, and it comes from the profiles, not from a link buy.
5. The ranking will follow the description, slowly, on Google's schedule, which we do
   not control. The referral traffic and the human readers do not wait for it.

---

## 3. The ordered action list

Ordered by leverage: free and already ours first, then our own pages, then the other
platforms, then the content that converts the entity into clicks.

### Already shipped (do not redo)

| What | Where it lives | Proof |
|---|---|---|
| `/about` and `/contact` pages | `src/pages/about.astro`, `src/pages/contact.astro` | commit `bdd16c2`, report `.superpowers/sdd/about-page-report.md` |
| Brand block on the discovery homepage, brand name in a heading | `src/components/discover/BrandNote.astro` (an `h2` with the brand name, linking to `/about`) | commit `bdd16c2` |
| `WebSite` JSON-LD carrying `alternateName: ["extramovies","extramovies.org"]` | `src/lib/seo/brand.ts`, `src/lib/seo/jsonld.ts` | commit `01325df`, test `tests/alternate-name.test.ts`, report `.superpowers/sdd/alternate-name-report.md`. Resolved per site, so cinemavilla gets its own values |
| Homepage `h1` still "Trending this week" | `src/components/discover/DiscoverHome.astro:122` | deliberate, covered by a test |
| `robots.txt` allows the site and points at the sitemap | `src/pages/robots.txt.ts` | commit `151d518`, report `.superpowers/sdd/robots-assets-report.md` |
| A real sitemap | `src/pages/sitemap.xml.ts` | 85 URLs live at `https://extramovies.org/sitemap.xml` on 2026-10-21 |
| `/llms.txt` | `src/pages/llms.txt.ts` | commit `250cfdc` |
| `http` to `https` 301 and `www` to apex 301 | `src/lib/legacy/router.ts` plus the panel rule | commit `d9bf192`, report `.superpowers/sdd/router-www-fix-report.md`. Both verified 301 to `https://extramovies.org/` on 2026-10-21 |
| Dead taxonomy paths now serve real pages (`/cast/<slug>`, `/director/<slug>`, `/category/<slug>`) | `src/lib/legacy/router.ts`, `src/lib/seo/taxonomy.ts` | commit `72ecbab`, report `.superpowers/sdd/taxonomy-routes-report.md`. 18 taxonomy URLs in the live sitemap |
| 20 published reviews retargeted at their Semrush query | `seeds/extramovies/*.md` | commit `c639ae9`, report `.superpowers/sdd/review-seo-rewrite-report.md` |
| "New movie reviews this week" module linking them | `src/components/discover/NewThisWeek.astro` | commit `e484221`, report `.superpowers/sdd/new-this-week-module-report.md` |
| The brand profile kit (Letterboxd, YouTube, Medium, Reddit, Quora, X, consistency matrix) | `docs/parasite/profile-kit/` | commit `7a402cf`, report `.superpowers/sdd/profile-kit-report.md` |
| Parasite asset package for 9 titles, drafts only, nothing published | `docs/parasite/<slug>/` | report `.superpowers/sdd/parasite-assets-report.md`. Posting is an owner action, see action 4 |

### The ordered list

#### 1. Letterboxd profile · **[OWNER]** · highest leverage

The only profile in the set that already exists and is already ours:
`https://letterboxd.com/extramovies/`, 453 films logged, 45 diary entries that match
our own reviews, 1 follower, no bio and no website link. Letterboxd is a domain
Google already trusts and already indexes; the diary on our profile is the number
one result for `site:letterboxd.com extramovies`. Today the profile says nothing
about what Extramovies is.

Copy lives in `docs/parasite/profile-kit/letterboxd-profile.md` (display name, the
three-sentence bio, the website field, the profile settings that matter, the profile
photo spec, the lists to create) and `docs/parasite/profile-kit/letterboxd-diary-entries.md`
(the 20 paste-ready entries, 10 dated 2026-10-20 and 10 dated 2026-10-21). The
ordered steps are in `docs/parasite/profile-kit/notes.md`, step 1.

Expected effect: the brand sentence and the site link land on a trusted domain, on a
profile that already has 453 films behind it, so it reads as a publication rather than
a shell. It does not move position 1 on the head term.

Honest timeframe: the fields are the same day. Google re-reads the profile in days
to two weeks. The AI Overview reacts in weeks to a couple of months, and it will
probably change partially before it changes completely.

#### 2. About page entity signals · **[DONE]** · needs a recrawl

Shipped, in the table above. The About page states in full sentences what Extramovies
is: an independent film-review magazine, one rating out of ten set by the editor
after the argument is written, where-to-watch blocks naming legal services only with
the region and the date checked, and a written rule that the site never links to
piracy or download pages. Every claim on it is checkable in the code, which the
about-page report sets out line by line.

What is left is a crawl, not a code change: Search Console, URL Inspection on
`https://extramovies.org/`, then `REQUEST INDEXING`, and the same for `/about` and
`/contact`. GSC reports the homepage's last crawl as 2026-10-09, which is before the
brand-leading title landed, so the site name Google shows is still the old one.

Expected effect: the site name in the SERP and the AI Overview read the current page
instead of a cached one.

Honest timeframe: days to weeks for the recrawl, then weeks for the overview to
reflect it.

#### 3. The other platform profiles, same wording · **[OWNER]**

YouTube, Medium, Reddit, Quora and X, each with the display name `Extramovies`, the
same one-line description, the same website link `https://extramovies.org`, and the
same profile photo file.

The description, stated once, is the sentence in
`docs/parasite/profile-kit/consistency-matrix.md`:

> Extramovies is an independent film-review magazine: original criticism with our own
> rating, no links to piracy, streaming availability checked and dated.

Copy lives in `docs/parasite/profile-kit/youtube-channel.md`,
`docs/parasite/profile-kit/medium-publication.md` and
`docs/parasite/profile-kit/reddit-quora-x.md`. The per-platform order and the
handles to try are in `docs/parasite/profile-kit/notes.md`, steps 4 to 8.

Expected effect: the same sentence in the same wording on five more independent
domains, so the corroborating web has a version of the brand that is not the mirror
family's version.

Honest timeframe: YouTube and Medium can be stood up in a day each. Reddit needs two
to three weeks of replies with no links before it will take a post. Quora is the
slowest to compound and the fastest to be penalised by a new account. X displaces
the impression left by the empty 2012 handle but does not compound on its own. A
handle cannot be assumed free: every one of these is a handle to try, checked by
public status on 2026-10-21.

#### 4. The parasite content · **[OWNER]** · drafts are ready

54 files under `docs/parasite/<slug>/`, one folder per canonical review slug, each
with `letterboxd.md`, `medium.md`, `youtube.md`, `reddit.md`, `quora.md` and
`notes.md`, for 9 titles. Every asset canonicalises to the review URL on
extramovies.org and every asset names the film and the verdict. The per-title plan
and the platform order are in `.superpowers/sdd/parasite-assets-report.md`, and the
house rules are in `docs/seo/parasite-playbook.md`.

Expected effect: the brand string attaches to review content on independent domains,
which is where the People Also Ask questions live, and the referral traffic arrives
whether or not the brand SERP ever moves.

Honest timeframe: posting is the same day per asset. A Reddit or Quora answer takes
months to compound. The referral effect is immediate. Post the assets for the titles
whose query is peaking first: Spider-Man: Brand New Day and Avengers: Endgame.

#### 5. The `extramovies web series` page · **[OWNER]** · a content task

This is the only one of the six brand terms with no AI Overview, which makes it the
only one where the piracy narrative is not already pinned over the answer box. The
SERP there is a mirror domain, a Telegram channel promoting it, a Scribd document,
and then legitimate competitors whose intent matches the query: VROTT and Fawesome.

The site has series hubs under `/series/` but no editorial series reviews and no
series index, so there is nothing for a search engine to rank and nothing for
`r/television` to discuss. `docs/seo/keywords-extramovies.csv` lists three brand
rows (`extramovies review`, `extramovies.org`, `extramovies movie reviews`, all
`active`); this term is not among them, and the profile kit already assigns it to
the Medium, Reddit, Quora and X profiles. If the brand work is happening anyway,
this is the term where the brand work converts into clicks.

Expected effect: a real page with real series reviews to rank on a term where the
answer box is empty.

Honest timeframe: months, and it needs the reviews written first. This is a content
brief, not a profile task.

#### 6. The review inventory · **[DONE]** for 20 · the rest is a content job

Commit `c639ae9` retargeted the SEO surface of 20 published reviews at the Semrush
queries that carry volume: `toy story 5 review` (3,600), `spiderman brand new day
review` (1,000), `avengers endgame review` (720), `resident evil review` (260),
`the odyssey 2026 review` (260). Commit `e484221` added the "New movie reviews this
week" module on the discovery homepage that links them.

The gap that is still open: Semrush credits extramovies.org with zero non-branded
review queries and zero review or movie pages in any database. Every one of the 19
organic keywords it can see is a brand or brand-typo query, and every ranking URL is
the homepage. The review pages are what turn the entity work into clicks.

Expected effect: the answer to "Extramovies" becomes a set of reviews rather than a
download hub.

Honest timeframe: the titles and the module are live. Indexation and ranking of
individual review pages takes weeks to months.

---

## 4. What not to do

| Do not | Why |
|---|---|
| Target `extramovies in download` | The intent is piracy. The SERP there is how-to videos and APK listings, not review sites, and the AI Overview is a malware and phishing warning. A page aimed at that query binds the brand to piracy, which is the exact association being undone. One plain sentence saying we host no downloads is the whole response |
| Recreate `r/Extramovies` | The subreddit is banned. Rebuilding it under the name we are trying to make mean "film criticism" does the opposite of the job. Use the user profile and the posts |
| Claim `@EXTRAMOVIESREVIEWS` or `@extraMOVIES` | `@EXTRAMOVIESREVIEWS` is the legacy Hindi channel and owns the `#extramovies` hashtag page that sits at position 3 in the US and position 2 in India. `@extraMOVIES` is a 2012 ghost with 0 posts that already renders as a brand page. Do not take the name and do not post into its hashtag page |
| Buy links or repeat the exact-match anchor spam | 158 of the 685 links in the current profile (23 percent) are that spam, and it is why the profile reads as low value. More of it accelerates nothing and it is the one thing in this plan that can undo the rest |
| Mass-index TMDB pages | The sitemap is review-driven by policy: every TMDB URL in it belongs to a review. Bare `/movies/<tmdbId>` pages are how thin pages get indexed, and they dilute the brand answer |
| Build a page for `extramovies com` | It is a domain-ownership query and the `.com` is not ours to own. Treat it as a corroboration term, not a content term |
| Build a page for `extra movies` | The volume is background actors, stock footage and a 2024 film called *Extra*. Targeting it dilutes a review brand |
| Try to reclaim the suspended Medium `@extramovies` | It belongs to the old download brand and a suspended account cannot be recovered |
| Post the 20 Letterboxd entries in one minute | Twenty entries in two days is the point of the timeline. Do it in two batches of ten, on two days. After that, one entry per published review, on the day it publishes |
| Write "biggest", "first", "oldest", "best", or name an award | None of it is true, and a claim that can be checked and found false is worse than no claim |
| Style anything to look like a mirror | No download language, no "free download", no "HD", no "dual audio", no mirror-domain colours or phrasing. The visual identity has to say the opposite of what the SERP says |

---

## 5. The measurement plan

### What to watch, and how often

| Number | Today | Where to read it | Cadence |
|---|---|---|---|
| Semrush brand positions, India database | `extramovies` 25, `extramovies com` 23, `extra movies` 28, `extramoviez` 24, `extramovies web series` 35, `extramovies in download` 40, `www extra movie` 36, `extramovies pics` 45, `extra movie fun` 53 | Semrush Organic Rankings, India database | Monthly |
| Semrush brand positions, US database | `extramovies` 28 | Semrush Organic Rankings, US database | Monthly |
| GSC brand query impressions and average position | `extramovies` 83 impressions at average position 48.6; homepage average 44.5 on `https` and 42.2 on `http` over 28 days. Every visible query in the property is a brand query | Search Console, Performance, filtered to the brand queries | Monthly, read on the 28-day cycle |
| The AI Overview wording for the brand | "a well-known shadow-hosting website" | Search `extramovies` in a clean browser with no login | Monthly |
| The AI Overview wording for `extramovies.org` | Correct already: "an independent film journal and movie review site" | Same search, same browser | Monthly, to catch a regression |
| Branded anchor mentions | Zero links anywhere carry the anchor text "Extramovies" | Semrush Backlink Analytics, anchor report | Monthly |
| Referring domains | 321 referring domains, 269 referring IPs, 685 backlinks | Semrush Backlink Analytics | Monthly, but read the spam share with it: 158 of 685 are exact-match spam |
| Referral sessions by source | No profile is live on any parasite platform yet, so there is no referral source to read | Analytics, referral traffic | Monthly |
| `site:letterboxd.com extramovies` | Our profile's diary is result 1 | A clean browser | Every two weeks until the snippet shows the bio |

Two of these are the real signal. The AI Overview wording is the thing being fought
over. The branded anchor count is the thing that shows the entity has landed on
other people's pages. Everything else is a position number that moves on Google's
schedule.

### What three months should look like

Plausible, not certain:

- The AI Overview for `extramovies` mentions a film-review magazine as one of the
  readings of the name, alongside the old one.
- extramovies.org appears in the US results for at least one brand term. It is
  absent from both the US and the India results for all of them today, so the first
  appearance is a real gain.
- The Letterboxd profile, the YouTube channel and the Medium publication exist, each
  carrying the same name, the same sentence and the same link.
- Search Console shows brand query impressions climbing off a near-zero base, and
  the number of queries that are not brand typos is no longer zero.
- Position for `extramovies` in the India SERP: top 10 is the realistic target, not
  position 1.

### What six months should look like

Realistic:

- A stable top 10 for `extramovies` in the India SERP, and a possible first-page
  position on `extramovies web series` if the series content gets written.
- The AI Overview no longer calls the brand a shadow-hosting website as its only
  description.
- Review pages appearing in the Semrush organic index, which today shows none.
- A real count of links using the anchor "Extramovies".

Not realistic, and not promised:

- Position 1 for `extramovies` in the India SERP. That is a multi-month project
  against a mirror family with a decade of links and thousands of third-party
  descriptions of itself.
- Any movement on `extramovies in download`, which is deliberately left alone.

**The blunt version.** The fast wins are the AI Overview wording and the Letterboxd
entity. Neither of them is the position 1 slot, and the position 1 slot is the thing
that is hard. Do the free things that make the entity legible, then judge the result
on the wording and the anchor count, not on the position.

---

## 6. The owner's one-page checklist

### The first three actions

1. **Fix the Letterboxd profile.** Display name `Extramovies`, the three-sentence
   bio, the website field set to `https://extramovies.org`, the profile photo, the
   20 diary entries in two batches of ten, and 3 to 5 lists. Copy:
   `docs/parasite/profile-kit/letterboxd-profile.md` and
   `docs/parasite/profile-kit/letterboxd-diary-entries.md`. Order of operations:
   `docs/parasite/profile-kit/notes.md`, step 1.
2. **Request indexing of the homepage, `/about` and `/contact`.** Search Console,
   URL Inspection, `REQUEST INDEXING`, one URL at a time. No copy to write; the
   pages are live. Why it matters: the homepage's last crawl was 2026-10-09, before
   the brand-leading title landed.
3. **Create the YouTube channel and the Medium publication** with the display name
   `Extramovies`, the one-line description from
   `docs/parasite/profile-kit/consistency-matrix.md`, the website link
   `https://extramovies.org` and the same photo file. Copy:
   `docs/parasite/profile-kit/youtube-channel.md` and
   `docs/parasite/profile-kit/medium-publication.md`. Handles to try:
   `docs/parasite/profile-kit/notes.md`, steps 4 and 5.

### Then, in order

4. Reddit profile `u/extramoviesmag`, then two to three weeks of replies with no
   links, then posts with the link in the first comment. Copy:
   `docs/parasite/profile-kit/reddit-quora-x.md`.
5. Quora profile, then the answer to "is extramovies a safe site". Copy:
   `docs/parasite/profile-kit/reddit-quora-x.md`.
6. X account `@extramoviesmag`, then the "what Extramovies is" statement, pinned.
   Copy: `docs/parasite/profile-kit/reddit-quora-x.md`.
7. Make the corroboration reciprocal: add `https://letterboxd.com/extramovies/` to
   the `sameAs` array in `src/lib/seo/jsonld.ts` and to the About page as a visible
   "elsewhere" line. This is a code change on the site, not a paste job.
8. Publish the parasite assets for the peaking titles first, from
   `docs/parasite/<slug>/`. Spider-Man: Brand New Day and Avengers: Endgame first.
9. Write the series reviews and the series index for `extramovies web series`.

### Where to read more

| Question | File |
|---|---|
| Why the head term is hard and what the SERP actually holds | `.superpowers/sdd/brand-serp-report.md` |
| The keyword positions, the backlink profile, the anchor spam | `.superpowers/sdd/semrush-pull-report.md` |
| The exact platform wording and the matrix | `docs/parasite/profile-kit/consistency-matrix.md` |
| The full ordered checklist and the honest effect table | `docs/parasite/profile-kit/notes.md` |
| What the About page says and where every claim is true in the code | `.superpowers/sdd/about-page-report.md` |
| What the alternateName change does and how it resolves per site | `.superpowers/sdd/alternate-name-report.md` |
| The parasite package and the platform order per title | `.superpowers/sdd/parasite-assets-report.md` |
| The legacy routes and what was recoverable | `.superpowers/sdd/taxonomy-routes-report.md` |
| The first Search Console read | `docs/seo/gsc-findings-2026-10-20.md` |

The reports under `.superpowers/sdd/` are git-ignored and live only on this machine.
They are the evidence behind everything above, and they are worth keeping somewhere
safe.
