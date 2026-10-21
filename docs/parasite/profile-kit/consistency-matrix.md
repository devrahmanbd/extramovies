# Consistency matrix · the Extramovies entity

**Nothing here is published.** This is the table to keep open while the profiles are
created. Its job is to make one entity readable to a search engine: the same name, the
same sentence, the same link, on independent platforms that Google already trusts.

The repetition in the description column is the point. Do not tidy it up.

---

## The one-line description, stated once

```
Extramovies is an independent film-review magazine: original criticism with our own rating, no links to piracy, streaming availability checked and dated.
```

153 characters. Paste it character for character, with no trailing period added, no
apostrophes changed, and no synonym swapped. Every clause in it is a fact about
extramovies.org as it behaves today: the criticism is ours, the rating out of ten is
ours, we do not link to piracy, and the where-to-watch block names legal services only,
with the region and the date we checked.

**What must never vary:**

| Element | Fixed value | Why |
|---|---|---|
| Display name | `Extramovies` | One word, capital E, no `.org`. A model that sees two spellings reads two entities. |
| Description | the sentence above, verbatim | The corroboration is the repetition, not the sentence. |
| Website link | `https://extramovies.org?utm_source=profile&utm_medium=parasite&utm_campaign=brand-2026` | The root, `https`, no trailing slash, no `www`. A review URL on one platform and the root on another splits the signal. |
| Anchor text on any link out | `Extramovies` or the review title | Never the query string. Never a URL as the anchor. |
| Profile photo | the same file everywhere | One file, five platforms, so the accounts look like one brand. |

---

## The matrix

| Platform | Display name | Handle | One-line description | Website link | Target query it serves | State |
|---|---|---|---|---|---|---|
| Letterboxd | `Extramovies` | `extramovies` | Extramovies is an independent film-review magazine: original criticism with our own rating, no links to piracy, streaming availability checked and dated. | https://extramovies.org?utm_source=profile&utm_medium=parasite&utm_campaign=brand-2026 | `extramovies` (brand, 2.9K US / 201K IN per Semrush), `extramovies review`, and every film review query through the 20 diary entries | **Exists, ours.** https://letterboxd.com/extramovies/ |
| YouTube | `Extramovies` | `@extramoviesmag` | Extramovies is an independent film-review magazine: original criticism with our own rating, no links to piracy, streaming availability checked and dated. | https://extramovies.org?utm_source=profile&utm_medium=parasite&utm_campaign=brand-2026 | `toy story 5 review` (3,600), `spiderman brand new day review` (1,000), `avengers endgame review` (720), `resident evil review` (260), `the odyssey 2026 review` (260) | Handle to try. No channel exists. |
| Medium | `Extramovies` | `@extramoviesreviews` | Extramovies is an independent film-review magazine: original criticism with our own rating, no links to piracy, streaming availability checked and dated. | https://extramovies.org?utm_source=profile&utm_medium=parasite&utm_campaign=brand-2026 | `extramovies review`, `extramovies movie reviews`, `extramovies web series` (170) | Handle to try. `@extramovies` is suspended (410). |
| Reddit | `Extramovies` | `u/extramoviesmag` | Extramovies is an independent film-review magazine: original criticism with our own rating, no links to piracy, streaming availability checked and dated. | https://extramovies.org?utm_source=profile&utm_medium=parasite&utm_campaign=brand-2026 | `extramovies com` (the People Also Ask block: "is extramovies a safe site", "what are some websites similar to extramovies"), `extramovies web series` | Handle to try. r/Extramovies is banned. |
| Quora | `Extramovies` | `Extramovies` | Extramovies is an independent film-review magazine: original criticism with our own rating, no links to piracy, streaming availability checked and dated. | https://extramovies.org?utm_source=profile&utm_medium=parasite&utm_campaign=brand-2026 | `is extramovies a safe site`, `extramovies web series`, `extramovies review` | Display name to try. No profile exists. |
| X | `Extramovies` | `@extramoviesmag` | Extramovies is an independent film-review magazine: original criticism with our own rating, no links to piracy, streaming availability checked and dated. | https://extramovies.org?utm_source=profile&utm_medium=parasite&utm_campaign=brand-2026 | `extramovies`, `extramovies com`, `extramovies web series` | Handle to try. `@extraMOVIES` is a 2012 ghost. |

**No profile URL appears in this table except Letterboxd's**, because no other profile
exists yet. The moment one does, write the URL into this file, and add it to the
`sameAs` array on the site, and to the About page. A URL in a matrix that no page
serves is worse than no URL.

---

## Why each platform is in the table, and what it is for

| Platform | What it gives the entity | What it does not do |
|---|---|---|
| Letterboxd | The only existing, correct, first-party statement of what Extramovies is on a domain Google already indexes. It is also a dofollow-ish profile surface with a durable link. | It does not outrank a pirate mirror on the head term. It changes what the corroborating web says, not who holds position 1. |
| YouTube | A second high-authority platform where the brand string attaches to reviews. It also serves the five largest review queries we have. | It does not rank Shorts for review queries the way Reddit and Medium do. The channel compounds over months. |
| Medium | A third platform, and a way to answer the brand query in our own words, on a domain that has historically described the pirate brand. | The `@extramovies` handle is suspended and cannot be recovered. Medium de-weights user-generated waves. |
| Reddit | The surface where the People Also Ask questions live, and where a real person asking "is this site safe" gets a real answer. | Reddit profile bios are not indexed. The value is the username and the posts, not the bio. |
| Quora | The PAA-intent match. A Quora answer can hold a position for a year, and the safety answer is the one that matters. | The slowest to compound and the fastest to be penalised by a new account. |
| X | The hashtag page for the brand currently belongs to an empty 2012 account. A correct profile with the same name displaces that impression in the index. | X posts are not a durable ranking surface on their own. |

---

## Check before you finish, every time

- [ ] Display name is `Extramovies` on all six, capital E, no `.org`.
- [ ] The description sentence is byte-identical on all six.
- [ ] The website link is `https://extramovies.org?utm_source=profile&utm_medium=parasite&utm_campaign=brand-2026` on all six, no trailing slash.
- [ ] The profile photo is the same file on all five that take one.
- [ ] The `sameAs` array on the site lists the profiles that exist.
- [ ] Nothing anywhere says "biggest", "first", "oldest", "best" or names an award.
- [ ] Nothing anywhere links to a download page, a mirror domain or a pirate site.
