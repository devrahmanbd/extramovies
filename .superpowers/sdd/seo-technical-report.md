# SEO Technical Audit — 2026-10-07 (read-only, dev http://127.0.0.1:4321)

Method: skills `seo-technical`, `seo-sitemap`, `seo-hreflang`, `seo-drift` (compare `docs/seo/baseline-2026-10-07.json`). No files edited, server not restarted.

## 1. Route crawl (observed `curl -w %{http_code}`)

| Route | Status | Note |
|---|---|---|
| `/` | 200 | PASS |
| `/reviews` | 200 | PASS |
| `/reviews?genre=Horror` | 200 | PASS, canonical → `/reviews` |
| `/movies` | 200 | PASS |
| `/movies?q=dune` | 200 | PASS, canonical → `/movies` |
| `/movies/693134` | 200 | PASS, `index,follow` |
| `/movies/999999999` | 404 | PASS, `noindex,follow`, h1 “Movie not available” — no soft-404 |
| `/reviews/dune-part-two` | 200 | PASS |
| `/reviews/no-such-slug` | 404 | PASS, body “Review not found” |
| `/search` | 200 | PASS, `noindex,follow` |
| `/search?q=dune` | 200 | PASS, `noindex,follow`, canonical → `/search` |
| `/u/rakib` | 200 | PASS, `index,follow`, canonical self-ref |
| `/u/no-such-user` | 404 | PASS, body “Member not found” |
| `/login` | 200 | PASS, `noindex,nofollow` |
| `/signup` | 200 | PASS, `noindex,nofollow` |
| `/sitemap.xml` | 200 | `application/xml` PASS |
| `/robots.txt` | 200 | `text/plain` PASS |
| `/rss.xml` | 200 | `application/rss+xml`, 3 `<item>` PASS |
| `/admin/login` | 200 | `noindex,nofollow` PASS |
| `/reviews/the-night-projectionist` (old slug) | 301 → `/reviews/dune-part-two` | see §5 |

No soft-404s, no 500s. Wrong-code count: 0.

## 2. robots.txt — PASS

Observed body:
```
User-agent: *
Allow: /
Disallow: /search
Disallow: /api/

Sitemap: http://127.0.0.1:4321/sitemap.xml
```
- Allows public, blocks `/search` (`src/lib/seo/sitemap.ts:37`) and `/api/` (`:38`) — matches requirement.
- Does not explicitly block `/admin` but `src/pages/admin/login.astro:19` is `noindex,nofollow` and admin index has no sitemap entry; acceptable.
- Sitemap URL absolute + correct host for dev origin. Prod correctness depends on `SITE_URL` via `siteOrigin()` (`src/lib/seo/meta.ts:64-70`); verify `SITE_URL=https://<prod-host>` on deploy.

## 3. sitemap.xml — PASS with Minor notes

- Well-formed XML (python `xml.etree` parse OK), 9 `<loc>` entries.
- All `loc` absolute + correct host `http://127.0.0.1:4321/` (`src/pages/sitemap.xml.ts:8-22`).
- `lastmod` present 6/9 (all 6 review/movie detail URLs carry `2026-10-07T10:00:00.000Z`; top-level `/`, `/reviews`, `/movies` omit `lastmod` by design `:9-11`). Optional per spec — Minor.
- No noindexed URLs included (no `/search`, `/login`, `/signup`, `/admin`, `/api`, 404s) — PASS.
- Includes deprecated-but-ignored `<changefreq>`/`<priority>` (`src/lib/seo/sitemap.ts:24-25`) — Info only per `seo-sitemap` skill.
- `Content-Type: application/xml; charset=utf-8` observed — PASS.

## 4. Canonicals + hreflang

- Self-referencing canonicals on 4/4 spot-checks (observed):
  - `/` → `http://127.0.0.1:4321/`
  - `/reviews` → `…/reviews`
  - `/movies/693134` → `…/movies/693134`
  - `/reviews/dune-part-two` → `…/reviews/dune-part-two`
  - Implementation: `canonicalFor()` strips query/hash (`src/lib/seo/meta.ts:52-56`), injected via `Base.astro:89` + `og:url` `:110`. Filtered views (`/reviews?genre=Horror` → `/reviews`, `/movies?q=dune` → `/movies`, `/search?q=dune` → `/search`) correctly consolidate — PASS.
- Hreflang: zero `hreflang` attributes on `/` and `/reviews/dune-part-two` (grep empty); `<html lang="en">` (`src/layouts/Base.astro:83`), RSS `<language>en-us</language>` (`src/pages/rss.xml.ts:26`). Single-language site → no hreflang required — PASS (per `seo-hreflang` §single-locale).

## 5. Redirects — PASS with note

- `DEMO_REDIRECTS` map exists (`src/lib/seo/content.ts:250-255`): `the-night-projectionist` → `dune-part-two`, etc.
- `resolveSlug()` returns `{type:"redirect"}` (`:366-371`); page issues `Astro.redirect(resolved.to, 301)` (`src/pages/reviews/[slug].astro:42-44`).
- Observed: `GET /reviews/the-night-projectionist → 301 location: /reviews/dune-part-two` — works, single hop, no chain.
- Note: task asked for 308; code uses 301. For GET navigations 301 is correct per `seo-technical` (301 for permanent moves) and preserves link equity; 308 only matters for non-GET method preservation. No change recommended — Info.

## 6. Noindex correctness — PASS

- `noindex,follow`: `/search` + `/search?q=dune` (`src/pages/search.astro:40`), `/movies/999999999` (`src/pages/movies/[tmdbId].astro:170`) — correct (prevents soft-404/param indexation, preserves follow).
- `noindex,nofollow`: `/login` (`src/pages/login.astro:19`), `/signup` (`src/pages/signup.astro:19`), `/admin/login` (`src/pages/admin/login.astro:19`) — correct.
- Public: `/`, `/reviews`, `/movies`, `/reviews/dune-part-two`, `/movies/693134`, `/u/rakib` all `index,follow` (default `src/layouts/Base.astro:36`) — no rogue noindex — PASS.

## 7. Internal links / orphans — PASS with Important note

- Sitemap 9 URLs; homepage (currently `discovery` theme) links: `/reviews`, `/movies`, `/movies/693134|414906|475557` (1 click), `/search`, `/rss.xml`, `/sitemap.xml` (footer) — observed via href grep.
- `/movies/693134` → `/reviews/dune-part-two` “Read the full review” (`src/pages/movies/[tmdbId].astro:224`) observed — so all 3 review slugs reachable `/ → /movies/<id> → /reviews/<slug>` = 2 clicks. `/reviews` (discovery branch) links to movie hubs via `reviewHref()` (`src/pages/reviews/index.astro:32-33,96`), JSON-LD `ItemList` also points at movie hubs (`:43-49`).
- Gap (Important, not orphan): in `discovery` theme, `/reviews/*` slugs have no direct link from `/` or `/reviews` index — they require the movie-hub hop. `ReviewCard` (`src/components/public/ReviewCard.astro:36` `const url = /reviews/${slug}`) is only rendered in `publication` theme (`src/pages/reviews/index.astro:131-133`). If `movies/[tmdbId]` ever 404s (TMDB outage), journal URLs lose their only crawl path. Recommend adding at least one direct `/reviews/<slug>` link per item (e.g., secondary “journal version” link) or switching `reviewHref()` to review slugs.
- No true orphans (0 URLs unreachable within 2–3 clicks).

## 8. Drift vs `docs/seo/baseline-2026-10-07.json` — NO DRIFT

- Compared 10 overlapping keys: statuses identical (`/` 200, `/reviews` 200, `/movies` 200, `/movies/693134` 200, `/reviews/dune-part-two` 200, `/search?q=Dune` 200, `/u/rakib` 200, `/login` 200, `/sitemap.xml` 200/9 urls, `/robots.txt` 200 + identical body).
- Titles identical (`/` “Movie reviews: honest, personal film criticism | Extramovies”, `/reviews` “Movie reviews | Extramovies”, etc.). Only case variance: baseline captured `/search?q=Dune` title “Search: Dune”, live `/search?q=dune` echoes query case (“Search: dune”) — expected dynamic behavior, not regression.
- Sitemap count 9 = baseline `url_count: 9` — PASS.

## Violations

- Important (1): discovery-theme indirection — review slugs only reachable via movie hubs; no direct `/reviews/<slug>` link on `/` or `/reviews` (§7).
- Minor (2): (a) sitemap top-level URLs omit `lastmod` (§3); (b) `SITE_URL` unset in dev so canonicals/sitemap use `127.0.0.1` — must set in prod (`src/lib/seo/meta.ts:64-70`).
- Critical: none.
