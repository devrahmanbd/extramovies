# Semrush keyword measurement — 2026-10-29 (Tenzing new-release job)

Session: fresh owner cookie capture (`www.semrush.com_header_string_1793250912271.txt`,
path recorded in AGENTS.md §5). 12 keyword×DB jobs, "Update metrics" clicked
per job: 12 update units (counter 37 → 49 of 250; ~201 remaining).

Trigger: owner instruction to research + review the new film **Tenzing**
(TMDB 1288069, released 2026-10-09, Apple TV+ original).

## Measured (fresh, 2026-10-29)

| keyword | KD IN | KD US | vol IN | vol US | global | intent |
|---|---|---|---|---|---|---|
| tenzing | 47 Possible | 46 Possible | 2.4K | 1.9K | 15.4K (UK 6.6K) | Informational |
| tenzing movie | 60 Difficult | 37 Possible | <10 | 210 | 590 | Informational |
| tenzing review | 30 Possible | 26 Easy | <10 | 20 | 50 | Commercial |
| tenzing release date | 30 Possible | 25 Easy | <10 | 30 | 60 | Informational |
| tenzing where to watch | 37 Possible | 29 Easy | <10 | <10 | <10 | Informational |
| tenzing ending explained | 36 Possible | 37 Possible | <10 | <10 | <10 | mixed |

Caveat (harness bug, do not trust otherwise): the batch parser truncates
K-suffixed volumes (`15.4K` → `15`, `1.9K` → `1`). The tenzing head-term
volumes above come from the Keyword Overview display itself (read live the
same session); all non-K values parse correctly.

## SERP rivals (US, Semrush 2026-10-29)

**tenzing** (positions 1-10): wikipedia.org/wiki/Tenzing_Norgay (person
entity), imdb.com/title/tt6262770, tiff.net/films/tenzing,
tenzingnaturalenergy.com (**unrelated drink brand — entity collision**),
wikipedia.org/wiki/Tenzing_(film), apple.com/tv-pr/originals/tenzing
(official Apple TV+ page), Reddit first-image thread, Instagram,
rottentomatoes.com/m/tenzing, see-saw-films.com (producer).

**tenzing review**: awardswatch.com (Telluride), commonsensemedia.org,
flickeringmyth.com, rogersmovienation.com, Wikipedia, redcarpetcrash.com
(TIFF), theplaylist.net, RT reviews. Referring domains on the critic sites
run 0-14; AI Overview present on the review SERP.

Read: the review SERP is beatable (small critics, no retailer dominance),
the head-term SERP is an entity SERP (person + drink + film all in one) that
a new domain plays for page-2-then-movement, not a week-1 win.

## Applied

3 rows appended to `docs/seo/keywords-extramovies.csv` (74 rows total,
3-line diff, parse-validated):

- `tenzing review` → P0, difficulty `30 / 26`, target
  `/reviews/tenzing-2026-review`
- `tenzing` → P1, difficulty `47 / 46`, same target page
- `tenzing release date` → P1, difficulty `30 / 25`, same target page
  (paired note: `tenzing where to watch` rides the same H2)

Writer brief: `.superpowers/sdd/writer-tenzing-brief.md`; seed
`seeds/extramovies/tenzing-2026-review.md` in flight (draft on deploy —
no `published_at`).
