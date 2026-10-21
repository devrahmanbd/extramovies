# Owner checklist · brand-profile kit

**Nothing in this kit is published.** These are files to read and paste from, by hand,
from accounts the owner already controls. No credentials, no cookies, no account details
appear anywhere in this folder, and nothing here posts on its own.

---

## 1. The single highest-leverage action

**Fix the Letterboxd profile: display name, bio, website link, and the 20 diary
entries.**

Files: `letterboxd-profile.md` and `letterboxd-diary-entries.md`.

Why this one and not the others:

- It is the only profile on the list that **already exists and is already ours**.
  https://letterboxd.com/extramovies/ , 453 films logged, 45 diary entries that match
  our own reviews.
- Letterboxd is a domain Google already trusts and already indexes. Our profile's
  diary is currently the number one result for `site:letterboxd.com extramovies`.
- The profile has no bio and no website link, so today it says nothing about what
  Extramovies is. After the change it says it in plain words, in a sentence that can be
  quoted.
- The other five platforms all need a handle to be claimed, a photo to be made, and
  content to be written, and each of them is a slower compounding surface than
  Letterboxd is.
- The 20 diary entries are the part that makes the profile look like a publication
  rather than a shell, and they put 20 independent copies of our own ratings on a
  trusted domain.

Time to do it: about an hour, plus the photo.

**Do the Letterboxd work first, then the others.** When Google re-crawls the profile,
it should find a bio, a link, 65 diary entries and a posting history, not a profile
that was created the same morning.

---

## 2. The ordered checklist

### Step 1 (highest leverage) · Letterboxd

- [ ] Display name to `Extramovies`.
- [ ] Paste the three-sentence bio from `letterboxd-profile.md`.
- [ ] Set the website field to `https://extramovies.org?utm_source=profile&utm_medium=parasite&utm_campaign=brand-2026`.
- [ ] Upload the profile photo (see `letterboxd-profile.md` for the spec).
- [ ] Log the 20 diary entries, 10 dated 2026-10-20 and 10 dated 2026-10-21, using
      `letterboxd-diary-entries.md`. Check the three films already on the profile and
      edit those entries instead of duplicating them.
- [ ] Create 3 lists: our 2026 reviews, our highest-rated 2026 films, and where to
      watch, legal only.
- [ ] Leave the other 453 films and the 45 existing entries alone.

### Step 2 · Make the corroboration reciprocal (code change on the site)

- [ ] Add `https://letterboxd.com/extramovies/` to the `sameAs` array in the site's
      JSON-LD, in the constant the About page work left open for it.
- [ ] Add the same URL to the About page as a visible "elsewhere" line.
- [ ] This is the only code change in this kit and it is not in these files. It belongs
      to the site's own work.

### Step 3 · Force Google to re-read the homepage

- [ ] Search Console, URL Inspection on `https://extramovies.org/`, then REQUEST
      INDEXING. The last crawl was 2026-10-09, before the brand-leading title landed,
      so the site name Google shows is stale.
- [ ] Do the same for `http://extramovies.org/` and `https://www.extramovies.org/`.
- [ ] This is not part of this kit. It is on the list because the entity work is worth
      less if the site name in the SERP is still the old one.

### Step 4 · YouTube

- [ ] Create the channel, name `Extramovies`, handle `@extramoviesmag`, with
      `@extramoviesofficial` and `@extramoviescritics` as fallbacks.
- [ ] Paste the description and the tags from `youtube-channel.md`.
- [ ] Same profile photo file.
- [ ] Upload the first five Shorts with the titles and the target queries from
      `youtube-channel.md`, reusing the scripts in `docs/parasite/<film>/youtube.md`.
- [ ] Do not use the `#extramovies` hashtag.

### Step 5 · Medium

- [ ] Create the profile on `@extramoviesreviews` with display name `Extramovies`.
- [ ] Create the publication `Extramovies` owned by that profile.
- [ ] Paste the publication description and the about paragraph from
      `medium-publication.md`.
- [ ] Publish the landing article, the one that says plainly what Extramovies is and
      does not host downloads.
- [ ] Set the canonical link on every post to the review URL on extramovies.org, and
      keep the "Originally published at" footer.
- [ ] Do not try to reclaim the suspended `@extramovies`.

### Step 6 · Reddit

- [ ] Create the profile, display name `Extramovies`, username `u/extramoviesmag` or
      `u/extramovies` if it is free, with the bio from `reddit-quora-x.md`.
- [ ] Read the full rules of r/movies, r/film, r/IndianCinema, r/IndianGaming,
      r/television and r/HorrorMovies before posting in any of them.
- [ ] Two to three weeks of replies in the target subs, no links at all.
- [ ] Then post, with the link in your own first comment and never in the body.
- [ ] Do not recreate r/Extramovies.

### Step 7 · Quora

- [ ] Create the profile, display name `Extramovies`, with the bio.
- [ ] Answer three or four unrelated questions first, no links.
- [ ] Then publish the answer to "is extramovies a safe site" from `reddit-quora-x.md`.

### Step 8 · X

- [ ] Claim `@extramoviesmag`, with the fallbacks in `reddit-quora-x.md`.
- [ ] Display name, bio, website field and avatar, in one sitting.
- [ ] Post the "what Extramovies is" statement and pin it.
- [ ] Then two or three film posts with the verdict and the canonical link.

### Step 9 · The content gap this kit cannot close

- [ ] `extramovies web series` is the one brand term with no AI Overview and therefore
      the most winnable. The site has series hubs under `/series/`, but no editorial
      series reviews and no series index, so there is nothing for a search engine to
      rank and nothing for r/television to discuss. That is a content task, a separate
      brief, and it is the term where this entity work turns into clicks.

---

## 3. What not to do

| Do not | Why |
|---|---|
| Recreate r/Extramovies | The subreddit is banned. Rebuilding it under a name we are trying to make mean "film criticism" does the opposite of the job. Use the user profile and the posts. |
| Claim `@EXTRAMOVIESREVIEWS` on YouTube | It is the legacy Hindi channel. It owns the `#extramovies` hashtag page, which is the #3 US and #2 India result for the head term. Do not take the name, and do not post into its hashtag page. |
| Use the legacy `@extraMOVIES` handle on X | A 2012 ghost account with 0 posts. It already holds the exact brand handle and renders as a brand page. Use `@extramoviesmag`. |
| Target `extramovies in download` | Pure piracy intent. The AI Overview there is a malware and phishing warning, and a page aimed at that query binds the brand to piracy for the ranking we actually want. One plain sentence, on one platform, saying we host no downloads, is the whole response. |
| Build a page for `extramovies com` | It is a domain-ownership query and it is not ours to own. It is a corroboration term, not a content term. |
| Build a page for `extra movies` | The volume is background actors, stock footage and a 2024 film called Extra. Targeting it dilutes a review brand. |
| Try to reclaim the suspended Medium `@extramovies` | It belongs to the old download brand and it will not be released. |
| Post the 20 Letterboxd entries in one minute | That is the pattern that gets a profile restricted. Two batches of ten, on two days. |
| Paste the review text into any of these platforms | Adapt it. Set the canonical. Keep the original on extramovies.org. |
| Write "biggest", "first", "oldest", "best" or name an award | None of it is true, and a claim that is not true is a claim that can be checked and found false. |
| Style anything to look like a pirate mirror | No download language, no "free download", no "HD", no "dual audio", no mirror-domain colours or phrasing anywhere in these profiles. The visual identity has to say the opposite of what the SERP says. |
| Expect a ranking change in days | See below. |

---

## 4. Expected effect and timeframe, honestly

**What is actually broken.** Google already understands extramovies.org. The AI Overview
for the domain says it is an independent film journal with our reviews on it. What is
broken is the brand string "Extramovies", which Google reads as a piracy brand because
the third-party pages it trusts for that string are pirate mirrors, an old hashtag page,
an old Instagram account, a Scribd document and a traffic-analyser page. The fix is
corroboration, not authority, and it is slow for that reason.

**What this kit can realistically do**

| Effect | Realistic timeframe | Confidence |
|---|---|---|
| The Letterboxd profile carries the brand sentence and the site link | Same day | Certain. It is a form field. |
| Google re-crawls the profile and the new bio appears in the SERP snippet | Days to two weeks | Likely. Letterboxd is crawled often. |
| The AI Overview for `extramovies` mentions a film-review magazine as one reading of the name | Weeks to a couple of months | Plausible, not certain. It depends on the model re-reading the corroborating pages, and it may read the other sources too. |
| extramovies.org appears anywhere in the US top 9 for the brand terms | Weeks to a couple of months | Plausible. Today it appears in neither the US nor the India SERP for any of the six brand terms, so the first appearance is a real gain. |
| Top 10 for `extramovies` | Months | Reasonable. The 2026-10-21 SERP audit put the realistic near-term target at top 10, not number 1. |
| Number 1 for `extramovies` | Months, and not likely | Unlikely. `extramovies.actor` is an exact-domain-match site with a decade of links and third-party descriptions. We out-describe it, we do not out-link it. |
| `extramovies in download` | Never, deliberately | The AI Overview there is a malware warning and that is the correct description of that intent. |

**The honest caveat.** The opposition is not going away. The Scribd document, the
Instagram account, the similarweb pages and the legacy YouTube videos are all still
there, and the mirror network can publish a new description of itself faster than we can
publish six of ours. This work adds a counterweight and it makes the "Extramovies"
query less one-sided. It does not delete the other reading of the name, and it will not
while the mirrors keep feeding the same sources.

**The dependencies**

- The effect depends on the third-party pages Google already trusts being re-read.
  That is not in our control and it is the reason the timeline is weeks.
- The homepage has to be re-crawled too, or the site name Google shows is still the
  pre-change one. Step 3 of the checklist.
- The corroboration has to be reciprocal. A profile that links to us while we do not
  link back is a weaker signal than two pages that link to each other. Step 2.

**What to check, and when**

| Check | When | What good looks like |
|---|---|---|
| Open the Letterboxd profile in a logged-out browser | Immediately | The bio, the name and the website link are visible to a stranger. |
| `site:letterboxd.com extramovies` | Two weeks | Our profile is result one and the snippet shows the bio. |
| Search `extramovies` in a clean US browser | Monthly | extramovies.org appears in the results at all. Today it does not. |
| Read the AI Overview for `extramovies` | Monthly | It says "film review" or "film magazine" for at least one reading of the name. |
| Search Console, brand query impressions | 28 day cycles | A line where there is currently no line. |
| Referral sessions by source | Monthly | Letterboxd, then YouTube, then the rest. |

**The part that does not depend on the ranking.** The diary entries, the profile bio and
the Medium landing page are read by people. The review archive gets the referral
traffic, and the referral traffic is worth having whether or not the brand SERP ever
moves. That part is immediate.
