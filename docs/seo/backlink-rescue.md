# Backlink rescue playbook

What to do with the links other sites still point at our old URLs, and what to never do with them.

**Tool:** `scripts/seo/backlink_rescue.py` (Python 3, standard library only)
**Input:** `data/legacy/semrush-referring-domains-2026-10-21.csv` (321 referring domains, 687 backlinks)
**Outputs:** `data/legacy/backlink_rescue.csv` and `data/legacy/backlink_outreach_drafts.csv` (both gitignored)

---

## 1. What was found

Most of the profile was never broken. 260 of the 321 referring domains point at the live home page
and need nothing. Another 55 point at a URL that answers 301 to the same page (the old `http://`
and `www.` copies of the domain). That is 445 links on 315 domains handled by code, with no email.

What is left is small and specific:

| bucket | domains | links | what it means |
|---|---|---|---|
| live | 260 | 380 | the link already works |
| canonical 301 | 54 | 64 | the old http or www copy redirects to the apex |
| taxonomy 301 | 1 | 1 | the old cast page now redirects to a page we publish |
| dead | 5 | 44 | still 404 or 410, the outreach queue |
| player | 1 | 198 | pirate download endpoints, never to come back |

## 2. What recovers automatically, no outreach needed

- **The taxonomy redirect.** A legacy `/cast/<slug>/`, `/director/<slug>/` or `/category/<slug>/`
  path answers 301 to the live page the moment the site publishes that person or genre. One of the
  eleven taxonomy targets in the export is covered today (`/cast/robert-de-niro/`, from our Joker
  review). The other ten are people and facets we have never reviewed, so they still answer 404.
  Publishing a review that names the person lights the redirect up on its own, with no webmaster
  involved.
- **The canonical host redirect.** `http://extramovies.org/` and `www.extramovies.org` answer 301 to
  `https://extramovies.org/`. Those links keep their authority without any help.

**Rule:** if the redirect exists, do not write to anyone. A message about a link that already works
is noise.

## 3. The outreach rules

Only one kind of link deserves a message: a path on our site that is dead, and for which we publish
a replacement.

1. **Find the replacement first.** The script matches a dead path against what we publish (same
   title, same person, same film). It fills `live_replacement` and writes the "the page moved"
   email only when the match is real. A film we never reviewed gets no invented replacement.
2. **One ask per domain.** Say what moved, give the old and the new URL, ask for the update. No
   list of other pages, no extras.
3. **Find the contact yourself.** The `contact_page` column is empty on purpose. The script does not
   scrape third-party sites. Open the domain, look for a contact or an about page, write it down in
   the column.
4. **Pick the rows worth sending.** Each outreach row starts with `ACTION: send` (a live page
   replaces the target) or `ACTION: skip` (no replacement yet, the content has to come first).
   Send only the `ACTION: send` rows.
5. **Judge the domain.** The script marks a domain `low` when its linking pages are pirate download
   pages. Those are not worth a message: expect no reply, and a mention is not worth the effort.
6. **Send by hand.** The script writes drafts. It never sends anything, and it never talks to a
   third-party site.

## 4. The template

Subject:

```
Link update on Extramovies: <old URL>
```

Body (the "the page moved" variant, used when there is a real replacement):

```
Hi,

We run Extramovies, an independent film-review magazine. The page you linked to has moved on our
site. It is the same content, only the address changed:

old: <old URL>
new: <new URL>

Could you update the link? It takes a moment and it keeps the reference working.

Thanks,
Extramovies
https://extramovies.org/about
```

Body (the "the page is gone" variant, used when we publish no replacement):

```
Hi,

We run Extramovies, an independent film-review magazine. A link on your site points to <old URL>,
a page we no longer publish. We do not have a page that replaces it, so we would rather tell you
than leave you guessing.

If you would like to keep a link to us, our reviews live at https://extramovies.org/reviews/ and
our home page is https://extramovies.org/. If the link is in the way, please feel free to remove it.

Thanks,
Extramovies
https://extramovies.org/about
```

Rules for the copy: short, plain, one ask, no incentives, no begging, no mention of the site's
past, and no link to anything but our own site.

## 5. What never to do

- **Never resurrect a download or player path.** `/online.php?link=...`, `/9xplay.php`, the old
  `/18-movies/...` category shells and every `720p`, `bluray`, `hdrip`, `dual-audio` download slug
  must keep answering 404 or 410. Serving one would hand out a piracy download from our domain.
- **Never publish a facet to save a link.** `hindi-dubbed-movies` and `dual-audio-movies` are
  catalogue facets of the old piracy site. We store genres, not dubbing states, so a page called
  "Hindi dubbed movies" would be a claim we cannot back. Those two paths stay dead.
- **Never write to a site that only hosts pirated files.** It is not a backlink worth having, and
  the message costs us reputation.
- **Never invent a review, a rating, a cast credit or a fact to fill a taxonomy page.** A taxonomy
  page exists only when a published review names that person or files that film under that genre.
- **Never ask for a link to a page we do not have.** If there is no replacement, the row is
  `ACTION: skip`, and the work is a review, not an email.
- **Never run the script with network access expected.** It reads local files and writes local
  files. If a run ever tries to open a socket, that is a bug.

## 6. How to re-run

```bash
cd "/Users/rahman/Documents/Movie Review"
python3 scripts/seo/backlink_rescue.py
```

| flag | use |
|---|---|
| `--csv PATH` | a newer export |
| `--sitemap PATH` | match against a local sitemap snapshot instead of the local corpus |
| `--site-url`, `--site`, `--site-name` | the other brand |
| `--out`, `--outreach` | write the two CSVs somewhere else |
| `--selftest` | run the offline classifier checks |

The run is idempotent, so it is safe to run again after every export or after new reviews are
published. Re-run it whenever a review names a new cast or director: the dead rows that turn into
`ACTION: send` are the ones to work.

Details and the full data caveat: `.superpowers/sdd/backlink-rescue-report.md`.
