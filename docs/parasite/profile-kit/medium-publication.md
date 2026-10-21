# Medium publication · Extramovies

**Nothing here is published.** These are the strings to paste when the Medium profile and
publication are created by hand, from the owner's own account. No credentials, no
account details, no automation.

---

## Read this first: two handles that are already spoken for

| Handle | State on 2026-10-21 | What to do |
|---|---|---|
| `@extramovies` | **SUSPENDED.** HTTP 410. Medium returns "account suspended: this account is under investigation or was found in violation of the Medium Rules." | Do not use it. Do not try to log into it, do not try to reclaim it, do not try to appeal it. It is almost certainly the old download site's Medium account, and a suspended account cannot be recovered by the owner. |
| `@extramoviesreviews` | 404, so it appears free | **Use this one.** |

Medium serves Cloudflare to automated requests from this host, so availability could not
be re-verified by a second method. Confirm in the browser before you commit.

## Handle to use

```
@extramoviesreviews
```

**Fallbacks, in order, if `@extramoviesreviews` is taken:**

1. `@extramoviesmag`
2. `@extramoviesmagazine`
3. `@extramoviesreviews2026`

All three are marked as handles to try. None of them is a confirmed profile URL, and
none of them is a page that exists today.

---

## Publication name to try

```
Extramovies
```

One word, capital E, no `.org`, no `Magazine` suffix in the first attempt. Medium
publication names are unique across all of Medium, so if `Extramovies` is taken, try in
this order:

1. `Extramovies Magazine`
2. `Extramovies Reviews`
3. `Extramovies Film Magazine`

Whatever name wins, it must match the display name on Letterboxd, YouTube, Reddit, Quora
and X. One name or the entity reads as several.

**How the publication is set up**

1. Create the writer profile first, on the handle above, with the display name
   `Extramovies` and the website `https://extramovies.org`.
2. Create a publication owned by that profile, named `Extramovies`.
3. Publish every post to that publication, not to a generic Medium publication. A post
   in a self-owned publication carries the publication name in the byline, which is the
   corroboration we are after. A post in somebody else's publication carries their name
   instead.

---

## Publication description (the short one, Medium's publication description field)

```
Extramovies is an independent film-review magazine: original criticism with our own rating, no links to piracy, streaming availability checked and dated. Full reviews on https://extramovies.org
```

Same first sentence as every other platform in this kit, word for word. The second
sentence is the only addition, and it is the one Medium specifically wants: what a
visitor can do next.

---

## About paragraph (the long one, on the publication's about page)

```
Extramovies publishes original film criticism with a rating out of ten that the editor
awards once the argument is written. We do not link to piracy, download pages or
unofficial streams, and the where-to-watch block on every review names legal services
only, with the region and the date we checked. Reviews, the critic numbers, the spoiler
sections and the full archive are published on extramovies.org: https://extramovies.org
```

Three sentences, every one of them a fact about the site as it behaves today. No claim
of size, age, awards, staff or readership.

---

## Writer profile bio (the short field on the profile itself)

```
Extramovies is an independent film-review magazine: original criticism with our own rating, no links to piracy, streaming availability checked and dated. Reviews and the full archive: https://extramovies.org
```

## Profile links

Set the profile's website field to `https://extramovies.org` as well. A Medium profile
with a bio and a link is a live entity statement, and it is the only Medium page that
carries the brand when no article is being read.

---

## The first article, and what makes a Medium post work

**Title:**

```
Extramovies: an independent film-review magazine, and why we do not link to downloads
```

This title is for the publication's own landing page, not for a film review. It exists
so that Medium has one page that answers the brand query in plain words. Medium indexes
publication names, so the publication itself can rank for `extramovies review`.

**Body of the landing article (paste as written):**

```
There is more than one thing called Extramovies on the internet. Most of them host
pirated films. This one does not.

Extramovies is an independent film-review magazine. Every review is criticism written
for this site, with our own rating out of ten, our own verdict, and the date we checked
where the film can be watched. We write about films and we point you at the services
that carry them. We do not host downloads, we do not link to download pages, and we do
not link to unofficial streams. Where a review names a service, that service is a legal
one, and the review says when we checked.

If you are looking for a download of a film, this is the wrong site, and we would rather
say so plainly than take a page view for it. If you want to know whether a film is worth
your evening, that is what we are here for, and the answer comes with a number attached
to it and the reasoning next to it.

The full archive is on extramovies.org: https://extramovies.org
```

**Canonical link to set on every Medium post:** the review URL on extramovies.org.
Medium's publish options have a canonical field, and it is the field that protects the
original. Set it on every article, without exception.

**Footer line to keep on every article:**

```
*Originally published at [Extramovies](https://extramovies.org).*
```

---

## Owner notes

**Why Medium is in this kit at all.** The suspended `@extramovies` account is a problem
and an opportunity. It is a problem because the brand name on Medium currently points at
a suspended account and a 410 page, and a 410 page is a worse signal than no page.
It is an opportunity because the search engine sees that the name was claimed, and a
live, correct profile on a different handle is a second independent statement of what
Extramovies is.

**Do not try to rescue the suspended account.** It is the legacy brand's account. It
will not be released. Move on.

**Every post needs the canonical link set.** Medium articles get scraped within days,
often with the paragraphs lifted intact. The canonical is what tells the search engine
which copy is the original, and the footer line is what Medium itself reads as a
distribution signal. Both are non-negotiable.

**Do not paste the review text.** Use the existing `docs/parasite/<film>/medium.md`
packages, which are written as adaptations with their own structure. They are already
correct on the canonical link, the footer line and the no-duplicate rule.

**Medium's reach is a slow burn.** A post can read a few hundred views in its first
days and far more in its third month, and Medium de-weights user-generated waves. Judge
it at ninety days, not at forty-eight hours.

**Risks**

- Creating a profile and immediately posting a link-heavy article is the pattern Medium
  down-weights. Publish two or three articles that carry the criticism properly first,
  and keep the link in the footer and the canonical, not in the first paragraph.
- The publication name is a global namespace. If `Extramovies` is taken by a stranger,
  use a fallback name and put the brand in the publication description and the about
  paragraph, which is where the entity wording lives anyway.
- A self-owned publication with one author and a small output is thin, but it is thin
  in a way a search engine can read correctly, which is the point. It does not need to
  look like a large publication.
