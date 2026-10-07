# Theme 1 Discovery Reskin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reskin Theme 1 discovery pages to the amended system (design.md Typography + Macrostructure/Layout, tokens.css scale/bands/rails).

**Architecture:** Markup adds band/rail/tnum/display--long hooks in allowed files only; one append-only CSS block in global.css overrides old .d-* with locked var() tokens. Zero client JS, routes/copy/data-flow/SEO preserved.

**Tech Stack:** Astro 5 SSR, tokens.css var() system, TMDB fail-soft, no new deps.

## Global Constraints

- ONLY touch: src/components/discover/*.astro, src/pages/movies/index.astro, src/pages/movies/[tmdbId].astro, src/pages/index.astro discovery branch ONLY (do not alter journal/magazine branches), APPEND one delimited block at end of src/styles/global.css (never edit existing rules).
- Type scale via --text-*, tracking var(--tracking-display), leading var(--leading-display/body/lede).
- Bands alternate .band / .band--alt with .section--sm/md/lg; rails use .rail-bleed (3vw gutters) + .rail-snap + .rail-snap--fade on mobile poster rails.
- .display--long for long titles (title.length > 40 → .is-long/.display--long → --text-hero-long).
- .tnum on scores/years/counts; ghost numerals (.index-num) on ranked rows only.
- Keep: routes, copy intent, TMDB fail-soft, SEO single h1 + JSON-LD + noindex filtered, no invented data, brand mechanism, zero client JS.
- Locked var() tokens only, 44px targets, mobile-first.
- Verify: npm run build passes.

---

### Task 1: DiscoverHome.astro — bands + rails + ranked rows

**Files:**
- Modify: `src/components/discover/DiscoverHome.astro`

**Interfaces:**
- Consumes: DiscoverTile[], Genre[], PublicReview[], COLLECTIONS, hasTmdbKey (unchanged signatures).
- Produces: band/rail markup hooks consumed by global.css append block (class names: band, band--alt, section--lg/md/sm, rail-bleed, rail-snap, rail-snap--fade, index-list, index-row, index-num, tnum).

- [ ] **Step 1: Add band rhythm + rail hooks, convert topRated to ranked rows**

```astro
<section class="d-hero band section--lg" aria-labelledby="discover-title">
  <div class="d-hero-inner">
    <h1 id="discover-title">Find your next movie</h1>
    <p class="d-lede">Search films, browse genres, and see where to watch — streaming availability by JustWatch via TMDB.</p>
    <form class="d-search" action="/movies" method="get" role="search">
      <label class="sr-only" for="d-search-q">Search movies</label>
      <input id="d-search-q" type="search" name="q" placeholder="Search by title…" autocomplete="off" minlength="1" />
      <button type="submit">Search</button>
    </form>
    <p class="d-browse-link"><a href="/movies">Browse all movies</a></p>
  </div>
</section>

{genreRail.length > 0 ? (
  <section class="band--alt section--sm" aria-labelledby="d-genres-heading">
    <div class="section-head"><h2 id="d-genres-heading">Browse by genre</h2></div>
    <nav class="d-rail" aria-label="Browse movies by genre"><ul>
      {genreRail.map((g) => (<li><a class="d-chip" href={g.href}>{g.label}</a></li>))}
    </ul></nav>
  </section>
) : null}

<section class="band section--md" aria-labelledby="d-trending-heading">
  <div class="section-head"><h2 id="d-trending-heading">Trending this week</h2><p>The most-watched films on TMDB right now.</p></div>
  {trending.length > 0 ? (
    <ol class="d-rail-posters rail-bleed rail-snap rail-snap--fade">
      {trending.map((t) => (<MovieTile tmdbId={t.tmdbId} title={t.title} year={t.year} posterUrl={t.posterUrl} rating={t.rating} />))}
    </ol>
  ) : /* fail-soft branches unchanged copy intent */ null}
</section>

{topRated.length > 0 ? (
  <section class="band--alt section--md" aria-labelledby="d-top-heading">
    <div class="section-head"><h2 id="d-top-heading">Top rated in the journal</h2><p>The highest-scored films we have reviewed.</p></div>
    <ol class="index-list d-top-ranked">
      {topRated.map((r, i) => (
        <li class="index-row">
          <span class="index-num" aria-hidden="true">{String(i+1).padStart(2,"0")}</span>
          {r.posterUrl ? <img class="index-thumb" src={r.posterUrl} alt={`Poster for ${r.movieTitle}`} width="88" height="132" loading="lazy" decoding="async" /> : null}
          <div class="index-main">
            <h3 class="index-title"><a href={reviewHref(r)}>{r.movieTitle}</a></h3>
            <p class="index-meta tnum">{r.year ? `${r.year}` : ""}{r.year && r.rating !== null ? "  ·  " : ""}{r.rating !== null ? `Our rating ${r.rating.toFixed(1)}/10` : ""}</p>
          </div>
          <span class="rating-mark tnum" data-band={r.rating !== null && r.rating >= 7 ? "high" : r.rating !== null && r.rating >= 5 ? "mid" : "low"}><span class="rating-value">{r.rating !== null ? r.rating.toFixed(1) : "–"}</span><span class="rating-scale">/10</span></span>
        </li>
      ))}
    </ol>
  </section>
) : null}

<section class="band section--sm" aria-labelledby="d-collections-heading">
  <div class="section-head"><h2 id="d-collections-heading">Collections</h2><p>Curated starting points for tonight.</p></div>
  <ul class="d-collections">{COLLECTIONS.map((c) => (<li><a href={c.href}><span class="d-collection-label">{c.label}</span><span class="d-collection-blurb">{c.blurb}</span></a></li>))}</ul>
</section>
```

- [ ] **Step 2: Verify single h1, zero JS, fail-soft branches keep copy intent**
- Run: `npm run build` Expected: PASS

### Task 2: MovieTile.astro — tnum + long-title hook

**Files:**
- Modify: `src/components/discover/MovieTile.astro`

- [ ] **Step 1: Add isLong + tnum**

```astro
const isLong = title.length > 40;
<span class={`d-tile-title${isLong ? " display--long" : ""}`}>{title}</span>
<span class="d-tile-meta">
  {year ? <span class="tnum">{year}</span> : null}
  {ratingText ? <span class="tnum">{ratingText}</span> : null}
</span>
```

- [ ] **Step 2: Keep 44px target on <a>, zero JS, route unchanged**

### Task 3: movies/index.astro — bands + display--long + tnum count

**Files:**
- Modify: `src/pages/movies/index.astro`

- [ ] **Step 1: Band rhythm + long-title + tnum**

```astro
const h1Text = filters.q ? `Results for “${filters.q}”` : "Browse movies";
const isLong = h1Text.length > 40;
<h1 class={isLong ? "display--long" : undefined}>{h1Text}</h1>
<section class="band section--lg" aria-label="Browse header">...</section>
<section class="band--alt section--md" aria-labelledby="d-results-heading">
  <div class="section-head"><h2 id="d-results-heading" class="tnum">{resultText}</h2></div>
  <ol class="d-grid">...</ol>
</section>
```

- Keep robots={robots} noindex on filtered, JSON-LD breadcrumb, fail-soft empty states, zero JS.

### Task 4: movies/[tmdbId].astro — long-title + tnum facts

**Files:**
- Modify: `src/pages/movies/[tmdbId].astro`

- [ ] **Step 1: h1 long-title + tnum year/score**

```astro
const isLong = ok ? movie.title.length > 40 : false;
<h1 class={isLong ? "display--long" : undefined}>{movie.title}{movie.year ? <span class="tnum"> ({movie.year})</span> : ""}</h1>
<div class="d-detail band section--md">...</div>
<dl class="fact-list">
  {movie.year ? <div><dt>Year</dt><dd class="tnum">{movie.year}</dd></div> : null}
  {movie.voteAverage !== null ? <div><dt>TMDB score</dt><dd class="tnum">{movie.voteAverage.toFixed(1)}/10{movie.voteCount ? ` (${movie.voteCount} votes)` : ""}</dd></div> : null}
</dl>
```

- Keep MovieShowcase reuse, customWatch null, WhereToWatch, robots, JSON-LD Movie + breadcrumb + myReview, 404 fail-soft.

### Task 5: index.astro discovery branch ONLY + global.css append block

**Files:**
- Modify: `src/pages/index.astro` (lines 76-86 only, journal/magazine branches untouched)
- Modify: `src/styles/global.css` (APPEND one delimited block at end only)

- [ ] **Step 1: index.astro — add comment, no structural change to journal branches**

```astro
{isDiscovery ? (
  <div class="wrap">
    {/* Theme 1 discovery: bands/rails live in DiscoverHome (amended 2026-10-06); single h1 preserved */}
    <DiscoverHome trending={trending} tmdbGenres={tmdbGenres} localGenres={genres} localLatest={latest} topRated={shelf} hasTmdbKey={discoveryKey} />
  </div>
) : ( /* journal/magazine branches UNTOUCHED */ )}
```

- [ ] **Step 2: Append reskin block to global.css (var() only, mobile-first, 44px)**

```css
/* === Theme 1 discovery reskin 2026-10-06 — amended system (APPEND-ONLY, do not edit above) === */
.d-hero.band { padding-block: var(--section-pad-lg); }
.d-hero h1 { font-size: var(--text-display); letter-spacing: var(--tracking-display); line-height: var(--leading-display); }
.d-hero h1.display--long, .d-hero h1.is-long { font-size: var(--text-hero-long); }
.d-lede { font-size: var(--text-lg); line-height: var(--leading-lede); }
/* ... (full block in implementation: type scale, bands, rails, tnum, ghost numerals, 44px) ... */
```

- [ ] **Step 3: Run build**

Run: `npm run build` Expected: PASS
