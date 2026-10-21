# Letterboxd profile · Extramovies

**Nothing here is published. These are the exact strings to paste into the profile at
https://letterboxd.com/extramovies/ , which already exists and already belongs to us.**
The profile has 453 films logged and 45 diary entries that match our own reviews. It has
no bio, no website link and 1 follower. The bio and the link are the entire fix, and they
are the single highest-leverage action in this kit.

---

## Display name

```
Extramovies
```

One word, capital E, no `.org`, no `| Movie Reviews`. The same string is used on every
other platform. A search engine reads one name or it reads two.

**Do not change the username.** The URL stays `letterboxd.com/extramovies/`. That URL
already carries the brand string and it is already indexed. The display name is the
field that is currently blank or wrong, and it is the one the SERP snippet shows.

---

## Bio text to paste (3 sentences, paste exactly as written)

```
Extramovies is an independent film-review magazine: original criticism with our own rating, no links to piracy, streaming availability checked and dated. Every review carries one rating out of ten, set by the editor after the argument is written, and the where-to-watch block names legal services only, with the region and the date we checked. The full argument, the critic numbers and the spoiler sections are published on extramovies.org.
```

Sentence one is the same one-line description used on every other platform in this kit,
word for word. Sentences two and three add the mechanics a reader (and a model) needs to
trust the claim. Nothing in the bio is a claim the site does not already make on its own
About page: our own rating, our own criticism, no piracy links, legal streaming only,
dated availability.

**Character budget:** 508 characters, inside Letterboxd's bio limit. No em-dashes. No
marketing adjectives. No claim of size, age, rank or award.

---

## Website link to put in the profile

```
https://extramovies.org?utm_source=profile&utm_medium=parasite&utm_campaign=brand-2026
```

The website field, not a link typed into the bio. The bio already names the domain in
words, which is the entity statement; the website field is the machine-readable version.

Do not point the website field at a specific review. Point it at the root. The root is
the brand, and the brand is what we are trying to get Google to attach to a review
magazine.

The page that states the entity in full sentences is `https://extramovies.org/about`.
That page should link to this Letterboxd profile, and the profile's website field should
point at the root. The two together, both directions, is what makes the entity legible.

---

## Profile settings that matter

| Setting | Do this | Why |
|---|---|---|
| Display name | `Extramovies` | One name across every platform. See above. |
| Username | leave as `extramovies` | The URL is already indexed. Changing it breaks the link Google has. |
| Bio | the three sentences above | The durable surface. It counts for every entry, not one post. |
| Website | `https://extramovies.org?utm_source=profile&utm_medium=parasite&utm_campaign=brand-2026` | The only machine-readable link on the profile. |
| Location | leave blank | Do not invent a city. It is not a ranking factor and a false field is a false field. |
| Profile photo | set one, see below | A profile with no photo and no bio reads as abandoned. A photo plus a bio reads as a publication. |
| Films (the log) | keep all 453, do not clear, do not bulk-edit | The log is the reason the profile reads as a real film account rather than a shell. Deleting it throws away the only thing Google already trusts on this domain. |
| Diary entries | keep the existing 45, do not re-log those films, do not change their dates | They already match our reviews. Re-logging the same film produces a duplicate-entry artifact and a profile that looks automated. |
| Lists | create 3 to 5 lists | Films and Lists are different surfaces. The log says what we watched. Lists are what other people browse, and a list is the one Letterboxd surface that can bring a first-time visitor to the profile. |
| Visibility | keep the films and diary public | A private log gives a search engine nothing to read. Keep private notes on individual films private, that is the only thing that should be hidden. |
| Watchlist | leave public | It is a small extra surface with the brand name on it. |

### Profile photo guidance

- Square, 800 by 800 minimum, exported as PNG.
- The wordmark: **Extramovies** in the site's own type, centred, on a flat dark
  background. Two colors maximum.
- It must be legible at 40 pixels, because that is the size it renders at in a comment
  thread and in a list entry.
- No film poster collage. No poster, still, or logo from any of the films we review.
- No skull, no camera, no film-reel cliche, no red curtain. A review magazine does not
  need to look like a pirate site, and the visual language of the pirate mirrors is
  exactly what we are trying to read differently.
- Nothing in it should look like it belongs to extramovies.actor, extramovies.cc,
  extramovies.asia or any of the other mirror domains. If it could be mistaken for one of
  those, change it.
- Keep the file in `data/uploads/` on the server so it can be set from the admin panel
  later, and keep the same file for the YouTube and X avatars so the accounts look like
  one brand.

### Lists to create (3 to 5)

Each list gets a one-line description, and the description is where the brand can be
named without a link.

1. `Extramovies 2026: the films we reviewed`. Every film we published a review of this
   year, in the order we published them. This is the list that mirrors the review
   archive.
2. `Extramovies: best of 2026 by our ratings`. The films we scored highest, with our
   rating in the list description. The rating is ours, so the list is a ranking only we
   can publish.
3. `Extramovies: where to watch (legal only)`. The films we reviewed that have a
   checked, dated streaming entry. The description states the rule: legal services only,
   checked on a stated date, no download links.
4. Optional: `Extramovies: horror 2026` and `Extramovies: best of 2025` for genre
   reach.

Do not create a list per film. Twenty lists of one film each reads as a spam pattern and
it wastes the one surface Letterboxd actually promotes.

---

## Owner notes

**Order of operations**

1. Set the display name to `Extramovies`.
2. Paste the bio.
3. Set the website field to `https://extramovies.org?utm_source=profile&utm_medium=parasite&utm_campaign=brand-2026`.
4. Upload the profile photo.
5. Post the 20 diary entries from `letterboxd-diary-entries.md`, 10 on 2026-10-20 and
   10 on 2026-10-21.
6. Create the lists.
7. Do the reciprocal half: add `https://letterboxd.com/extramovies/` to the `sameAs`
   array in the site's JSON-LD and to the About page. That is a code change on the site
   and it is not part of this kit, but it is the step that makes the corroboration
   reciprocal, and a one-way link is weaker than a two-way one.

**Risks**

- **A bulk-posted profile reads as a spam profile.** Twenty entries in two days is the
  point of the timeline, but the 45 existing entries are already spread over time, so
  the profile as a whole does not look like a one-day dump. Do not add a 21st, a 22nd
  and a 23rd entry the same evening. After the first 20, the cadence becomes one entry
  per published review, on the day it publishes.
- **The bio is a claim and it is checked.** Every sentence in it is true of the site
  today. If the where-to-watch blocks ever change to name a non-legal service, this bio
  becomes false and the About page becomes false with it. Both are written against the
  current behaviour on purpose.
- **Do not add a link in the body of a diary entry unless the entry is one of the 20 in
  the diary sheet.** The site link belongs in the bio and the website field, where it
  counts for every entry. A link repeated in every entry reads as a link farm.
- **The star mapping.** The diary sheet uses our published rating out of ten, divided by
  two, rounded to the nearest half star, which is the same mapping the existing
  `docs/parasite/*/letterboxd.md` packages use. Before posting, look at what stars the
  existing 45 entries use. If they already follow this mapping, there is nothing to do.
  If they do not, do not mass-edit them. Use this mapping going forward and let the
  difference sit.

**What this alone will not do**

A Letterboxd bio and a link do not outrank `extramovies.actor` on the head term. The
pirate mirror is an exact-domain-match site with a decade of links. What the bio does is
change what the corroborating web says when a model reads it, and the AI Overview for
`extramovies` is assembled from exactly this kind of third-party page. Expect the
overview to change in weeks, not days, and expect it to change partially before it
changes completely. See `notes.md` for the full effect and timeframe.
