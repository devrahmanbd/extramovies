# On-page SEO audit (read-only, 2026-10-07, dev http://127.0.0.1:4321)

Method: curl HTML x4, no edits. Skills: seo-page / seo-content / seo-schema / seo-sxo (+geo citability).
June-2026 rules: FAQPage/HowTo must be absent; Article/Review require author+datePublished; absolute URLs; no placeholders.

## 1) seo-page (titles / meta / headings / OG / Twitter)

| Page | Title (len) | Meta desc (len) | H1 (n) | H2/H3 | OG + Twitter |
|---|---|---|---|---|---|
| `/` | `Movie reviews: honest, personal film criticism \| Extramovies` (60) keyword-lead OK, at limit | 158 chars, in 120-160 BUT ends `…` truncated mid-sentence | 1x `Trending this week` — misses keyword/intent | 28 H2 (film titles) + 3 H3 logical, H1 vague | All 10 present, absolute (`og:url` dev `http://127.0.0.1:4321/`, `og:image` TMDB absolute). `og:type=website` OK. `twitter:card=summary_large_image` OK |
| `/reviews` | `Movie reviews \| Extramovies` (27) keyword-lead OK but short/thin | 156 chars, in range BUT ends `…` truncated | 1x `Every film review in the journal, newest first` OK | 4 H2 (`3 reviews`, `Sections`, `Genres`, `About`) — `3 reviews` non-descriptive; 0 H3 | All 10 present, absolute (`og:image` generic `.../og.jpg`). `og:type=website` OK |
| `/movies/693134` | `Dune: Part Two (2024) review — verdict &… \| Extramovies` (55) keyword-lead OK, contains literal `…` truncation | 152 chars, in range BUT TMDB synopsis duplicate + ends `…` | 1x `Dune: Part Two (2024)` OK | 7 H2 / 3 H3 — FAIL: H2#1 duplicates H1 verbatim | All 10 present, absolute. `og:type=website` (should be `video.movie` for film hub — minor). `og:title` contains `&#38;` entity (renders `&`, fix source) |
| `/reviews/dune-part-two` | `Dune: Part Two (2024) review: Dune: Part Two… \| Extramovies` (59) keyword-lead OK BUT repeats film name 2x + literal `…` | 156 chars, in range BUT ends `…` truncated | 1x `Dune: Part Two Earns Every Minute of Its Desert` OK, unique vs title | 10 H2 / 5 H3 logical, no skips | All 10 present, absolute. `og:type=article` correct. Same title-repeat issue in `og:title`/`twitter:title` |

Canonical: present on all 4 (self-ref, dev domain). Robots: `index, follow` on all 4. Internal links: `/` 274, `/reviews` 29, `/movies` 50, `/review` 37.

## 2) seo-content (E-E-A-T / verdict / quotability / thin)

| Page | Byline + dates visible? | Verdict ≤100w? | Quotable numbers (geo/AI) | Thin? |
|---|---|---|---|---|
| `/` | No byline, no `<time>` (hub — acceptable, no article E-E-A-T expected) | n/a (hub) | Only `8.2`, `2026` in hero sample — weak citability | No — 1,727 total words, 13 `<article>` blocks |
| `/reviews` | No byline, no dates (hub — acceptable but add `dateModified` for freshness) | n/a — ratings `8.8/10`, `7.9/10`, `6.4/10` visible immediately | Ratings only — weak | FLAG — 150 total words, 0 `<article>`, archive-only |
| `/movies/693134` | `By The Editor` + `<time 2026-09-28>` published visible; NO updated date; no author-bio link (only `Anna K` member link) | PASS — `Our verdict — The rare blockbuster…` ~word 50 | `2h 47m`, `8.8/10`, `Stream6/Rent7/Buy5` — medium | Borderline — 349 total words |
| `/reviews/dune-part-two` | `By The Editor` + published `Sept 28, 2026` visible; `dateModified 2026-10-07` in JSON-LD ONLY (not visible); `Checked Oct 6, 2026` is streaming-availability, not content-update; no author-bio page | PASS — `Our verdict — …` ~word 40 + `Verdict first: yes,` in body | STRONG — `8.8/10`, `92%`, `95%`, `167 min`, `2h 47m` — good AI-citation blocks | 558 total words — OK for review, below 1,500 blog floor (reviews exempt, but expandable) |

Images alt: `alt` present everywhere (0 missing) BUT empty `alt=""` on decorative/provider logos: `/` 13/160, `/movies` 19/24, `/review` 9/13 (hero backdrop + `w92` provider icons + related posters). Posters on `/reviews` correct (`Poster for X`).

## 3) seo-schema (JSON-LD per page, June-2026 validation)

- `/`: `WebSite` + `Organization` + `BreadcrumbList`. No FAQPage/HowTo — PASS. `logo` absolute `https://extramovies.org/.../logo.svg` PASS. No placeholders, no relative URLs. Note: `url` uses dev `http://127.0.0.1:4321/` (prod must be absolute canonical domain) + `SearchAction query-input` OK.
- `/reviews`: `BreadcrumbList` + `CollectionPage>ItemList` (3 ListItems → `/movies/693134|414906|475557`). No FAQPage/HowTo — PASS. URLs absolute (dev). No placeholders.
- `/movies/693134`: `Movie` (w/ `aggregateRating 9/1`) + `BreadcrumbList` + `Review` (`author Person/The Editor`, `datePublished 2026-09-28`, `reviewRating 8.8/10`, `itemReviewed Movie`, `mainEntityOfPage`). No FAQPage/HowTo — PASS. Required props present. Images absolute TMDB. No placeholders/relative. Minor: `mainEntityOfPage.@id` http dev URL.
- `/reviews/dune-part-two`: `Article` (headline, description, image absolute, `datePublished 2026-09-28`, `dateModified 2026-10-07`, `author Person/The Editor`, `publisher Organization+logo absolute`) + `Review` (same required props) + `Movie` + `BreadcrumbList`. No FAQPage/HowTo — PASS. All required props present, absolute URLs, no placeholders. Minor: visible page lacks `dateModified` rendering despite markup.

No `HowTo`, `FAQPage`, `SpecialAnnouncement`, `ClaimReview`, `VehicleListing` on any page — compliant.

## 4) seo-sxo (intent match ≤3s, verdict without scroll)

- `/` → query `movie reviews`: hero `Trending this week` + review cards immediately — PASS intent, though H1 vague.
- `/reviews` → query `all movie reviews archive`: H1 + `3 reviews, newest first` + ratings above fold — PASS.
- `/movies/693134` → query `Dune Part Two 2024`: H1 + `8.8/10 Our verdict` in first `<main>` block — PASS (verdict without scroll in SSR HTML).
- `/reviews/dune-part-two` → query `Dune Part Two review`: H1 + `My rating 8.8` + `Our verdict` + `Verdict first: yes,` in first 100 words — PASS.

## Verdicts

- `/` — FAIL (H1 `Trending this week` misses keyword; all metas truncated `…`; 13 empty alts; dev-domain canonical/schema URLs)
- `/reviews` — FAIL (thin 150w; H2 `3 reviews` non-descriptive; truncated desc; no freshness date)
- `/movies/693134` — FAIL (H1/H2 duplicate; desc = TMDB duplicate + truncated; no visible updated date; 19 empty alts; `&#38;` in og:title)
- `/reviews/dune-part-two` — FAIL (title repeats film name + `…`; desc truncated; `dateModified` in markup but invisible; 9 empty alts; no author-bio link)

Top fixes (no-code-change audit only): 1) rewrite titles/metas to full length without `…` + dedupe Dune title; 2) `/` H1 → include `Movie reviews`; `/movies` remove duplicate H2; `/reviews` H2 `3 reviews` → `Latest reviews`; 3) render `Updated <dateModified>` visibly + link `The Editor` to bio page; 4) fill empty alts (hero backdrop descriptive, provider logos `HBO Max logo` etc.); 5) replace dev `http://127.0.0.1:4321` canonical/schema/OG with prod domain at deploy; 6) expand `/reviews` hub copy >300w.
